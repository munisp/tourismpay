/**
 * Integration Overview — Enhanced
 *
 * Features:
 *   1. Live auto-refresh toggle (30s interval on all queries)
 *   2. Drill-down side panel per module (last 5 events)
 *   3. Composite System Health Score badge (0–100)
 *
 * Modules visualised:
 *   TourismPay (wallet / establishment layer)
 *   → BIS (Background Investigation Service)
 *   → PaymentSwitch (clearing / settlement / kill-switch layer)
 */
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  Shield, Zap, ArrowRight, ArrowDown, Activity, AlertTriangle,
  CheckCircle2, RefreshCw, ExternalLink, Lock,
  TrendingUp, Users, FileSearch, Webhook, BarChart3,
  Globe, CreditCard, Network, X, ChevronRight,
  Play, Pause, Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMemo, useState, useCallback } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${ok
        ? "bg-[var(--tp-green)] shadow-[0_0_6px_var(--tp-green)]"
        : "bg-[var(--tp-crimson)] shadow-[0_0_6px_var(--tp-crimson)]"}`}
    />
  );
}

function StatBadge({ value, label, color = "green" }: {
  value: number | string;
  label: string;
  color?: "green" | "amber" | "crimson" | "blue";
}) {
  const colorMap = {
    green: "text-[var(--tp-green)] border-[var(--tp-green)]/30 bg-[var(--tp-green)]/5",
    amber: "text-[var(--tp-amber)] border-[var(--tp-amber)]/30 bg-[var(--tp-amber)]/5",
    crimson: "text-[var(--tp-crimson)] border-[var(--tp-crimson)]/30 bg-[var(--tp-crimson)]/5",
    blue: "text-[var(--tp-blue)] border-[var(--tp-blue)]/30 bg-[var(--tp-blue)]/5",
  };
  return (
    <div className={`flex flex-col items-center px-3 py-2 rounded-lg border font-mono ${colorMap[color]}`}>
      <span className="text-xl font-bold leading-none">{value}</span>
      <span className="text-[10px] mt-1 opacity-70 font-sans uppercase tracking-wider">{label}</span>
    </div>
  );
}

// ─── Health Score ─────────────────────────────────────────────────────────────
function computeHealthScore(
  successRate: number,
  activeInvestigations: number,
  killSwitchCount: number,
  openFraudAlerts: number,
): number {
  let score = 100;
  // PS success rate: -30 pts if below 90%, -15 if below 98%
  if (successRate < 80) score -= 30;
  else if (successRate < 90) score -= 20;
  else if (successRate < 98) score -= 10;
  // Active BIS investigations: -5 per investigation, max -20
  score -= Math.min(activeInvestigations * 5, 20);
  // Kill switch activations: -10 per active switch, max -30
  score -= Math.min(killSwitchCount * 10, 30);
  // Open fraud alerts: -5 per alert, max -15
  score -= Math.min(openFraudAlerts * 5, 15);
  return Math.max(0, Math.min(100, score));
}

function HealthScoreBadge({ score }: { score: number }) {
  const { label, colorClass, ringClass, bgClass } =
    score >= 90
      ? { label: "Healthy", colorClass: "text-[var(--tp-green)]", ringClass: "ring-[var(--tp-green)]/40", bgClass: "bg-[var(--tp-green)]/10" }
      : score >= 70
      ? { label: "Degraded", colorClass: "text-[var(--tp-amber)]", ringClass: "ring-[var(--tp-amber)]/40", bgClass: "bg-[var(--tp-amber)]/10" }
      : { label: "Critical", colorClass: "text-[var(--tp-crimson)]", ringClass: "ring-[var(--tp-crimson)]/40", bgClass: "bg-[var(--tp-crimson)]/10" };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ring-1 ${ringClass} ${bgClass} cursor-default select-none`}>
          <div className="relative w-8 h-8">
            <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
              <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-border opacity-40" />
              <circle
                cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3"
                strokeDasharray={`${(score / 100) * 87.96} 87.96`}
                strokeLinecap="round"
                className={colorClass}
              />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-bold font-mono ${colorClass}`}>
              {score}
            </span>
          </div>
          <div>
            <p className={`text-xs font-bold leading-none ${colorClass}`}>{label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">System Health</p>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        <p className="font-semibold mb-1">Health Score: {score}/100</p>
        <p className="text-muted-foreground">Computed from PS success rate, active BIS investigations, kill switch activations, and open fraud alerts. Scores ≥90 are healthy, 70–89 degraded, &lt;70 critical.</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Module Box ───────────────────────────────────────────────────────────────
interface ModuleBoxProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href: string;
  color: "green" | "blue" | "amber";
  status: "online" | "degraded" | "offline";
  stats: { label: string; value: number | string; color?: "green" | "amber" | "crimson" | "blue" }[];
  features: string[];
  onDrillDown?: () => void;
}
function ModuleBox({ icon, title, subtitle, href, color, status, stats, features, onDrillDown }: ModuleBoxProps) {
  const borderColor = {
    green: "border-[var(--tp-green)]/40 hover:border-[var(--tp-green)]/80",
    blue: "border-[var(--tp-blue)]/40 hover:border-[var(--tp-blue)]/80",
    amber: "border-[var(--tp-amber)]/40 hover:border-[var(--tp-amber)]/80",
  }[color];
  const iconColor = {
    green: "text-[var(--tp-green)]",
    blue: "text-[var(--tp-blue)]",
    amber: "text-[var(--tp-amber)]",
  }[color];
  const statusLabel = { online: "Online", degraded: "Degraded", offline: "Offline" }[status];
  const statusOk = status === "online";

  return (
    <div className={`rounded-xl border ${borderColor} bg-card p-5 flex flex-col gap-4 transition-all duration-200`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-lg bg-secondary ${iconColor}`}>{icon}</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground leading-none">{title}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusDot ok={statusOk} />
          <span className={`text-[10px] font-mono ${statusOk ? "text-[var(--tp-green)]" : "text-[var(--tp-amber)]"}`}>{statusLabel}</span>
        </div>
      </div>
      {/* Stats */}
      <div className="flex gap-2">
        {stats.map((s) => (
          <StatBadge key={s.label} value={s.value} label={s.label} color={s.color} />
        ))}
      </div>
      {/* Features */}
      <div className="flex flex-wrap gap-1.5">
        {features.map((f) => (
          <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border font-mono">{f}</span>
        ))}
      </div>
      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Link href={href}>
          <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
            <ExternalLink className="w-3 h-3" /> Open
          </Button>
        </Link>
        {onDrillDown && (
          <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-muted-foreground" onClick={onDrillDown}>
            <Info className="w-3 h-3" /> Last 5 Events
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Flow Arrow ───────────────────────────────────────────────────────────────
function FlowArrow({ label, sublabel, color = "green", vertical = false }: {
  label: string;
  sublabel?: string;
  color?: "green" | "blue" | "amber";
  vertical?: boolean;
}) {
  const c = {
    green: { text: "text-[var(--tp-green)]", line: "bg-[var(--tp-green)]/40" },
    blue: { text: "text-[var(--tp-blue)]", line: "bg-[var(--tp-blue)]/40" },
    amber: { text: "text-[var(--tp-amber)]", line: "bg-[var(--tp-amber)]/40" },
  }[color];
  if (vertical) {
    return (
      <div className="flex flex-col items-center py-2 gap-1">
        <div className={`w-px h-6 ${c.line}`} />
        <ArrowDown className={`w-4 h-4 ${c.text}`} />
        <span className={`text-[10px] font-mono uppercase tracking-wider ${c.text}`}>{label}</span>
        {sublabel && <span className="text-[9px] text-muted-foreground">{sublabel}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center px-2 gap-1">
      <span className={`text-[10px] font-mono uppercase tracking-wider ${c.text}`}>{label}</span>
      {sublabel && <span className="text-[9px] text-muted-foreground">{sublabel}</span>}
      <div className="flex items-center gap-1">
        <div className={`h-px w-8 ${c.line}`} />
        <ArrowRight className={`w-4 h-4 ${c.text}`} />
      </div>
    </div>
  );
}

// ─── Event Row ────────────────────────────────────────────────────────────────
function EventRow({ icon, title, description, time, type }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  time: string;
  type: "flag" | "killswitch" | "webhook";
}) {
  const typeStyle = {
    flag: "border-l-[var(--tp-amber)]",
    killswitch: "border-l-[var(--tp-crimson)]",
    webhook: "border-l-[var(--tp-blue)]",
  }[type];
  return (
    <div className={`flex items-start gap-3 py-2.5 border-l-2 pl-3 ${typeStyle}`}>
      <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{title}</p>
        <p className="text-[11px] text-muted-foreground truncate">{description}</p>
      </div>
      <span className="text-[10px] text-muted-foreground font-mono shrink-0">{time}</span>
    </div>
  );
}

// ─── Drill-Down Side Panel ────────────────────────────────────────────────────
type DrillDownModule = "tourismpay" | "bis" | "paymentswitch" | null;

function DrillDownPanel({
  module,
  onClose,
  autoFlagHistory,
  killSwitchActivations,
  bisList,
  health,
}: {
  module: DrillDownModule;
  onClose: () => void;
  autoFlagHistory: { items?: { id: number; currency: string; triggerReason: string; walletTxId: string | number; bisInvestigationId: number | null; createdAt: number }[] } | undefined;
  killSwitchActivations: { id: number; corridor: string; bisInvestigationId: number; createdAt: number }[] | undefined;
  bisList: { investigations?: { id: number; subjectName: string; status: string; riskLevel: string; createdAt: number }[] } | undefined;
  health: { remittances?: { successRate: number; total?: number; processing?: number; failed24h?: number } | undefined; killSwitch?: { isActive: boolean } | undefined; participants?: { active: number } | undefined } | undefined;
}) {
  const title = {
    tourismpay: "TourismPay — Last 5 Events",
    bis: "BIS — Last 5 Events",
    paymentswitch: "PaymentSwitch — Last 5 Events",
  }[module ?? "tourismpay"] ?? "";

  const events = useMemo(() => {
    if (!module) return [];
    if (module === "tourismpay") {
      return (autoFlagHistory?.items ?? []).slice(0, 5).map((f) => ({
        id: `flag-${f.id}`,
        icon: <AlertTriangle className="w-3.5 h-3.5 text-[var(--tp-amber)]" />,
        title: `Auto-flag triggered: ${f.currency}`,
        description: `Reason: ${f.triggerReason === "velocity" ? "Velocity breach" : "Amount threshold"} · TX #${f.walletTxId}`,
        time: new Date(f.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        type: "flag" as const,
      }));
    }
    if (module === "bis") {
      return (bisList?.investigations ?? []).slice(0, 5).map((inv) => ({
        id: `inv-${inv.id}`,
        icon: <FileSearch className="w-3.5 h-3.5 text-[var(--tp-amber)]" />,
        title: `Investigation #${inv.id}: ${inv.subjectName}`,
        description: `Status: ${inv.status} · Risk: ${inv.riskLevel}`,
        time: new Date(inv.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        type: "flag" as const,
      }));
    }
    if (module === "paymentswitch") {
      const ksEvents = (Array.isArray(killSwitchActivations) ? killSwitchActivations : []).slice(0, 5).map((k) => ({
        id: `ks-${k.id}`,
        icon: <Lock className="w-3.5 h-3.5 text-[var(--tp-crimson)]" />,
        title: `Kill switch: ${k.corridor} corridor locked`,
        description: `BIS Inv #${k.bisInvestigationId} triggered corridor suspension`,
        time: new Date(k.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        type: "killswitch" as const,
      }));
      if (ksEvents.length === 0) {
        return [{
          id: "ps-health",
          icon: <Activity className="w-3.5 h-3.5 text-[var(--tp-green)]" />,
          title: "PaymentSwitch is operating normally",
          description: `Success rate: ${health?.remittances?.successRate ?? 100}% · Kill switch: ${health?.killSwitch?.isActive ? "Active" : "Inactive"}`,
          time: "Now",
          type: "webhook" as const,
        }];
      }
      return ksEvents;
    }
    return [];
  }, [module, autoFlagHistory, bisList, killSwitchActivations, health]);

  return (
    <Sheet open={module !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[400px] sm:w-[480px] bg-card border-border">
        <SheetHeader className="pb-4 border-b border-border">
          <SheetTitle className="text-sm font-semibold flex items-center gap-2">
            <Network className="w-4 h-4 text-primary" />
            {title}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            The 5 most recent events for this module, pulled from live data.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-0 divide-y divide-border">
          {events.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-[var(--tp-green)]/50" />
              No recent events for this module.
            </div>
          ) : (
            events.map((e) => (
              <EventRow key={e.id} icon={e.icon} title={e.title} description={e.description} time={e.time} type={e.type} />
            ))
          )}
        </div>
        {module === "tourismpay" && (
          <div className="mt-6">
            <Link href="/bis/auto-flag-history">
              <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
                <ChevronRight className="w-3.5 h-3.5" /> View Full Auto-Flag History
              </Button>
            </Link>
          </div>
        )}
        {module === "bis" && (
          <div className="mt-6">
            <Link href="/bis">
              <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
                <ChevronRight className="w-3.5 h-3.5" /> Open BIS Dashboard
              </Button>
            </Link>
          </div>
        )}
        {module === "paymentswitch" && (
          <div className="mt-6">
            <Link href="/paymentswitch/kill-switch">
              <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
                <ChevronRight className="w-3.5 h-3.5" /> Open Kill Switch Admin
              </Button>
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function IntegrationOverview() {
  const [liveMode, setLiveMode] = useState(true);
  const [drillDown, setDrillDown] = useState<DrillDownModule>(null);

  const refetchInterval = liveMode ? 30_000 : false;
  const queryOpts = { refetchInterval } as const;

  // Live data queries — all respect the auto-refresh toggle
  const { data: dashStats, isLoading: loadingDash, refetch: refetchDash } = trpc.africa.dashboardStats.useQuery(undefined, queryOpts);
  const { data: bisList, refetch: refetchBis } = trpc.bis.list.useQuery({ limit: 5, status: "processing" }, queryOpts);
  const { data: autoFlagHistory, refetch: refetchFlags } = trpc.bisIntegration.getAutoFlagHistory.useQuery({ limit: 20 }, queryOpts);
  const { data: killSwitchActivations, refetch: refetchKS } = trpc.bisIntegration.getKillSwitchActivations.useQuery({ limit: 10 }, queryOpts);
  const { data: health, refetch: refetchHealth } = trpc.nocDashboard.systemHealth.useQuery(undefined, queryOpts);
  const { data: hourly, refetch: refetchHourly } = trpc.nocDashboard.hourlyVolume.useQuery(undefined, queryOpts);

  const handleManualRefresh = useCallback(() => {
    refetchDash(); refetchBis(); refetchFlags(); refetchKS(); refetchHealth(); refetchHourly();
  }, [refetchDash, refetchBis, refetchFlags, refetchKS, refetchHealth, refetchHourly]);

  // Derived stats
  const totalTxVolume = useMemo(() => {
    if (!hourly) return 0;
    return (hourly as { hour: number; count: number; volume: string }[])
      .reduce((s, h) => s + parseFloat(h.volume ?? "0"), 0);
  }, [hourly]);

  const psOnline = health && !health.killSwitch?.isActive && (health.remittances?.successRate ?? 100) >= 80;
  const bisActive = (dashStats?.activeBisInvestigations ?? 0) > 0;

  // Composite health score
  const healthScore = useMemo(() => computeHealthScore(
    health?.remittances?.successRate ?? 100,
    dashStats?.activeBisInvestigations ?? 0,
    Array.isArray(killSwitchActivations) ? killSwitchActivations.length : 0,
    dashStats?.openFraudAlerts ?? 0,
  ), [health, dashStats, killSwitchActivations]);

  // Recent integration events (merged auto-flags + kill switch activations)
  const recentEvents = useMemo(() => {
    const events: {
      id: string; icon: React.ReactNode; title: string;
      description: string; time: string; type: "flag" | "killswitch" | "webhook"; ts: number;
    }[] = [];
    if (autoFlagHistory?.items) {
      for (const f of autoFlagHistory.items.slice(0, 8)) {
        events.push({
          id: `flag-${f.id}`,
          icon: <AlertTriangle className="w-3.5 h-3.5 text-[var(--tp-amber)]" />,
          title: `Auto-flag: ${f.currency} ${f.triggerReason === "velocity" ? "velocity breach" : "amount threshold"}`,
          description: `Wallet TX ${f.walletTxId} → BIS Inv #${f.bisInvestigationId}`,
          time: new Date(f.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          type: "flag" as const,
          ts: f.createdAt,
        });
      }
    }
    if (Array.isArray(killSwitchActivations)) {
      for (const k of killSwitchActivations.slice(0, 5)) {
        events.push({
          id: `ks-${k.id}`,
          icon: <Lock className="w-3.5 h-3.5 text-[var(--tp-crimson)]" />,
          title: `Kill switch: ${k.corridor} corridor locked`,
          description: `BIS Inv #${k.bisInvestigationId} → PS corridor suspended`,
          time: new Date(k.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          type: "killswitch" as const,
          ts: k.createdAt,
        });
      }
    }
    return events.sort((a, b) => b.ts - a.ts).slice(0, 10);
  }, [autoFlagHistory, killSwitchActivations]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Drill-Down Side Panel ── */}
      <DrillDownPanel
        module={drillDown}
        onClose={() => setDrillDown(null)}
        autoFlagHistory={autoFlagHistory}
        killSwitchActivations={Array.isArray(killSwitchActivations) ? killSwitchActivations : undefined}
        bisList={bisList as { investigations?: { id: number; subjectName: string; status: string; riskLevel: string; createdAt: number }[] } | undefined}
        health={health}
      />

      {/* ── Page Header ── */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/30">
              <Network className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Integration Overview</h1>
              <p className="text-xs text-muted-foreground">TourismPay · BIS · PaymentSwitch — live integration map</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Health Score Badge */}
            <HealthScoreBadge score={healthScore} />

            {/* Auto-refresh toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={liveMode ? "default" : "outline"}
                  size="sm"
                  className={`text-xs gap-1.5 h-8 ${liveMode ? "bg-primary/20 text-primary border-primary/40 hover:bg-primary/30" : ""}`}
                  onClick={() => setLiveMode((v) => !v)}
                >
                  {liveMode
                    ? <><Pause className="w-3 h-3" /> Live (30s)</>
                    : <><Play className="w-3 h-3" /> Paused</>}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {liveMode ? "Click to pause auto-refresh" : "Click to enable 30-second auto-refresh"}
              </TooltipContent>
            </Tooltip>

            <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8" onClick={handleManualRefresh}>
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-10">
        {/* ── Top KPI Strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Establishments", value: loadingDash ? "…" : (dashStats?.totalEstablishments ?? 0), color: "green" as const, icon: <Globe className="w-4 h-4" /> },
            { label: "BIS Active", value: loadingDash ? "…" : (dashStats?.activeBisInvestigations ?? 0), color: "amber" as const, icon: <FileSearch className="w-4 h-4" /> },
            { label: "Auto-Flags", value: autoFlagHistory?.total ?? 0, color: "amber" as const, icon: <AlertTriangle className="w-4 h-4" /> },
            { label: "KS Activations", value: Array.isArray(killSwitchActivations) ? killSwitchActivations.length : 0, color: "amber" as const, icon: <Lock className="w-4 h-4" /> },
            { label: "PS Success %", value: health ? `${health.remittances?.successRate ?? 100}%` : "…", color: "green" as const, icon: <TrendingUp className="w-4 h-4" /> },
            { label: "24h Volume", value: totalTxVolume > 0 ? `${(totalTxVolume / 1000).toFixed(1)}k` : "0", color: "blue" as const, icon: <BarChart3 className="w-4 h-4" /> },
          ].map((kpi) => (
            <Card key={kpi.label} className="border-border bg-card">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-1.5 rounded-md bg-secondary ${
                  kpi.color === "green" ? "text-[var(--tp-green)]" :
                  kpi.color === "amber" ? "text-[var(--tp-amber)]" :
                  "text-[var(--tp-blue)]"
                }`}>{kpi.icon}</div>
                <div>
                  <p className={`text-lg font-bold font-mono leading-none ${
                    kpi.color === "green" ? "text-[var(--tp-green)]" :
                    kpi.color === "amber" ? "text-[var(--tp-amber)]" :
                    "text-[var(--tp-blue)]"
                  }`}>{kpi.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">{kpi.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Integration Flow Diagram ── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-6 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Integration Flow
          </h2>
          {/* Desktop: horizontal flow */}
          <div className="hidden lg:flex items-stretch gap-0">
            {/* TourismPay Module */}
            <div className="flex-1">
              <ModuleBox
                icon={<Globe className="w-5 h-5" />}
                title="TourismPay"
                subtitle="Wallet · Establishments · KYB"
                href="/"
                color="green"
                status="online"
                stats={[
                  { label: "Establishments", value: dashStats?.totalEstablishments ?? 0, color: "green" },
                  { label: "KYB Pending", value: dashStats?.pendingKyb ?? 0, color: "amber" },
                  { label: "Fraud Alerts", value: dashStats?.openFraudAlerts ?? 0, color: dashStats?.openFraudAlerts ? "crimson" : "green" },
                ]}
                features={["Wallet Send", "Cross-Currency", "Auto-Flag Hook"]}
                onDrillDown={() => setDrillDown("tourismpay")}
              />
            </div>
            {/* Arrow: TourismPay → BIS */}
            <div className="flex flex-col items-center justify-center px-3 gap-2">
              <FlowArrow label="Auto-Flag" sublabel="wallet.send trigger" color="green" />
              <FlowArrow label="KYB Events" sublabel="establishment onboard" color="green" />
            </div>
            {/* BIS Module */}
            <div className="flex-1">
              <ModuleBox
                icon={<Shield className="w-5 h-5" />}
                title="BIS"
                subtitle="Background Investigation Service"
                href="/bis"
                color="amber"
                status={bisActive ? "degraded" : "online"}
                stats={[
                  { label: "Active Inv.", value: dashStats?.activeBisInvestigations ?? 0, color: bisActive ? "amber" : "green" },
                  { label: "Auto-Flags", value: autoFlagHistory?.total ?? 0, color: "amber" },
                ]}
                features={["AI Risk Scoring", "Auto-Flag Engine", "Kill Switch Bridge"]}
                onDrillDown={() => setDrillDown("bis")}
              />
            </div>
            {/* Arrow: BIS → PaymentSwitch */}
            <div className="flex flex-col items-center justify-center px-3 gap-2">
              <FlowArrow label="Kill Switch" sublabel="high-risk corridor" color="amber" />
              <FlowArrow label="Webhooks" sublabel="status events" color="blue" />
            </div>
            {/* PaymentSwitch Module */}
            <div className="flex-1">
              <ModuleBox
                icon={<Zap className="w-5 h-5" />}
                title="PaymentSwitch"
                subtitle="Clearing · Settlement · NOC"
                href="/paymentswitch"
                color="blue"
                status={psOnline ? "online" : "degraded"}
                stats={[
                  { label: "Success %", value: health ? `${health.remittances?.successRate ?? 100}%` : "…", color: "green" },
                  { label: "Participants", value: health?.participants?.active ?? 0, color: "green" },
                ]}
                features={["Kill Switch", "NOC Dashboard", "Webhook Engine"]}
                onDrillDown={() => setDrillDown("paymentswitch")}
              />
            </div>
          </div>

          {/* Mobile: vertical flow */}
          <div className="lg:hidden space-y-0">
            <ModuleBox
              icon={<Globe className="w-5 h-5" />}
              title="TourismPay"
              subtitle="Wallet · Establishments · KYB"
              href="/"
              color="green"
              status="online"
              stats={[
                { label: "Establishments", value: dashStats?.totalEstablishments ?? 0, color: "green" },
                { label: "KYB Pending", value: dashStats?.pendingKyb ?? 0, color: "amber" },
              ]}
              features={["Wallet Send", "Cross-Currency", "Auto-Flag Hook"]}
              onDrillDown={() => setDrillDown("tourismpay")}
            />
            <FlowArrow label="Auto-Flag / KYB Events" color="green" vertical />
            <ModuleBox
              icon={<Shield className="w-5 h-5" />}
              title="BIS"
              subtitle="Background Investigation Service"
              href="/bis"
              color="amber"
              status={bisActive ? "degraded" : "online"}
              stats={[
                { label: "Active Inv.", value: dashStats?.activeBisInvestigations ?? 0, color: bisActive ? "amber" : "green" },
                { label: "Auto-Flags", value: autoFlagHistory?.total ?? 0, color: "amber" },
              ]}
              features={["AI Risk Scoring", "Auto-Flag Engine", "Kill Switch Bridge"]}
              onDrillDown={() => setDrillDown("bis")}
            />
            <FlowArrow label="Kill Switch / Webhooks" color="amber" vertical />
            <ModuleBox
              icon={<Zap className="w-5 h-5" />}
              title="PaymentSwitch"
              subtitle="Clearing · Settlement · NOC"
              href="/paymentswitch"
              color="blue"
              status={psOnline ? "online" : "degraded"}
              stats={[
                { label: "Success %", value: health ? `${health.remittances?.successRate ?? 100}%` : "…", color: "green" },
                { label: "Participants", value: health?.participants?.active ?? 0, color: "green" },
              ]}
              features={["Kill Switch", "NOC Dashboard", "Webhook Engine"]}
              onDrillDown={() => setDrillDown("paymentswitch")}
            />
          </div>
        </div>

        {/* ── Integration Event Feed + Data Flow Detail ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Integration Events */}
          <Card className="lg:col-span-2 border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Recent Integration Events
                <Badge variant="outline" className={`ml-auto text-[10px] font-mono ${liveMode ? "text-[var(--tp-green)] border-[var(--tp-green)]/30" : "text-muted-foreground"}`}>
                  {liveMode ? "Live" : "Paused"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 divide-y divide-border">
              {recentEvents.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-[var(--tp-green)]/50" />
                  No integration events yet — the system is idle.
                </div>
              ) : (
                recentEvents.map((e) => (
                  <EventRow key={e.id} icon={e.icon} title={e.title} description={e.description} time={e.time} type={e.type} />
                ))
              )}
            </CardContent>
          </Card>

          {/* Data Flow Detail */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Network className="w-4 h-4 text-[var(--tp-blue)]" />
                Data Flow Detail
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              {/* Flow 1 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[var(--tp-green)] font-mono uppercase tracking-wider text-[10px]">
                  <CreditCard className="w-3.5 h-3.5" /> Wallet → BIS
                </div>
                <div className="pl-4 space-y-1 text-muted-foreground">
                  <p>Every <code className="text-[var(--tp-green)] bg-secondary px-1 rounded">wallet.send</code> and <code className="text-[var(--tp-green)] bg-secondary px-1 rounded">sendCrossCurrency</code> fires <code className="text-[var(--tp-amber)] bg-secondary px-1 rounded">checkAndAutoFlag()</code> after commit.</p>
                  <p>Triggers if amount ≥ per-currency USD threshold <em>or</em> hourly velocity ≥ configured count.</p>
                </div>
              </div>
              <Separator />
              {/* Flow 2 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[var(--tp-amber)] font-mono uppercase tracking-wider text-[10px]">
                  <Shield className="w-3.5 h-3.5" /> BIS → PaymentSwitch
                </div>
                <div className="pl-4 space-y-1 text-muted-foreground">
                  <p>When <code className="text-[var(--tp-amber)] bg-secondary px-1 rounded">bis.updateStatus</code> sets <em>flagged + high/critical</em>, the <strong>Kill Switch Bridge</strong> maps the subject's country to PS corridors.</p>
                  <p>Logs each activation in <code className="text-[var(--tp-crimson)] bg-secondary px-1 rounded">bis_kill_switch_activations</code>.</p>
                </div>
              </div>
              <Separator />
              {/* Flow 3 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[var(--tp-blue)] font-mono uppercase tracking-wider text-[10px]">
                  <Webhook className="w-3.5 h-3.5" /> BIS → Webhooks
                </div>
                <div className="pl-4 space-y-1 text-muted-foreground">
                  <p>Every BIS status change dispatches a typed webhook event delivered by the PS webhook engine with HMAC-SHA256 signing and 5-attempt retry.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Module Quick-Links ── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
            <ExternalLink className="w-4 h-4" /> Quick Access
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: "BIS Dashboard", href: "/bis", icon: <FileSearch className="w-4 h-4" />, color: "amber" },
              { label: "Auto-Flag History", href: "/bis/auto-flag-history", icon: <AlertTriangle className="w-4 h-4" />, color: "amber" },
              { label: "Auto-Flag Settings", href: "/admin/bis-auto-flag-settings", icon: <Shield className="w-4 h-4" />, color: "amber" },
              { label: "NOC Dashboard", href: "/paymentswitch/noc", icon: <Activity className="w-4 h-4" />, color: "blue" },
              { label: "Kill Switch Admin", href: "/paymentswitch/kill-switch", icon: <Lock className="w-4 h-4" />, color: "crimson" },
              { label: "Webhook Engine", href: "/paymentswitch/webhooks", icon: <Webhook className="w-4 h-4" />, color: "blue" },
              { label: "Remittance Admin", href: "/paymentswitch/remittance", icon: <CreditCard className="w-4 h-4" />, color: "green" },
              { label: "PS Analytics", href: "/paymentswitch/analytics", icon: <BarChart3 className="w-4 h-4" />, color: "green" },
              { label: "Digital Wallet", href: "/wallet", icon: <Zap className="w-4 h-4" />, color: "green" },
              { label: "PS Admin", href: "/paymentswitch/admin", icon: <Users className="w-4 h-4" />, color: "blue" },
            ].map((link) => (
              <Link key={link.href} href={link.href}>
                <div className={`flex items-center gap-2 p-3 rounded-lg border border-border bg-card hover:bg-secondary transition-colors cursor-pointer group ${
                  link.color === "amber" ? "hover:border-[var(--tp-amber)]/40" :
                  link.color === "crimson" ? "hover:border-[var(--tp-crimson)]/40" :
                  link.color === "blue" ? "hover:border-[var(--tp-blue)]/40" :
                  "hover:border-[var(--tp-green)]/40"
                }`}>
                  <span className={`shrink-0 ${
                    link.color === "amber" ? "text-[var(--tp-amber)]" :
                    link.color === "crimson" ? "text-[var(--tp-crimson)]" :
                    link.color === "blue" ? "text-[var(--tp-blue)]" :
                    "text-[var(--tp-green)]"
                  }`}>{link.icon}</span>
                  <span className="text-xs text-foreground group-hover:text-primary transition-colors truncate">{link.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
