import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useSSE } from "@/hooks/useSSE";
import {
  AlertTriangle, Activity, Shield, Zap, RefreshCw,
  CheckCircle, XCircle, Wifi, WifiOff, Brain, TrendingUp,
  ChevronDown, ChevronUp,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { toast } from "sonner";

type FraudAlertRow = {
  id: number; alertId: string; severity: string; status: string;
  description: string | null; amount: string | null; currency: string | null;
  country: string | null; ruleTriggered: string | null; gnnScore: string | null;
  createdAt: Date;
};

const SEV_COLORS: Record<string, string> = {
  info: "badge-muted", low: "badge-green", medium: "badge-muted",
  high: "badge-blue", critical: "badge-crimson",
};

// ─── ML Stats Panel ───────────────────────────────────────────────────────────
function MlFraudStatsPanel() {
  const [expanded, setExpanded] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mlStatsRaw, isLoading, refetch, error } = trpc.pythonServices.fraudStats.useQuery(
    undefined,
    { refetchInterval: 60_000, retry: 1 }
  );
  // Python service returns dynamic JSON — cast to any for field access
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mlStats = mlStatsRaw as any;

  const isUnavailable = !!error || (!isLoading && !mlStatsRaw);

  return (
    <div
      className="glass-card animate-fade-in-up opacity-0"
      style={{ animationDelay: "150ms", animationFillMode: "forwards" }}
    >
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            ML Fraud Engine
          </h3>
          <Badge
            variant="outline"
            className={`text-[9px] px-1.5 py-0 ${isUnavailable ? "border-red-500/40 text-red-400" : "border-purple-500/40 text-purple-400"}`}
          >
            {isUnavailable ? "OFFLINE" : "LIVE"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="p-4">
          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 bg-white/5 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : isUnavailable ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
              <Brain className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">
                ML Fraud service offline (port 8002). Start with{" "}
                <code className="font-mono text-[10px] bg-white/5 px-1 rounded">
                  docker-compose up fraud-ml
                </code>
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Key ML metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    label: "Transactions Scored",
                    value: mlStats?.total_scored ?? mlStats?.transactions_scored ?? "—",
                    color: "text-purple-400",
                  },
                  {
                    label: "ML Flagged",
                    value: mlStats?.flagged ?? mlStats?.total_flagged ?? "—",
                    color: "text-red-400",
                  },
                  {
                    label: "Avg Risk Score",
                    value: mlStats?.avg_risk_score != null
                      ? `${(Number(mlStats.avg_risk_score) * 100).toFixed(1)}%`
                      : "—",
                    color: "text-amber-400",
                  },
                  {
                    label: "Model Accuracy",
                    value: mlStats?.model_accuracy != null
                      ? `${(Number(mlStats.model_accuracy) * 100).toFixed(1)}%`
                      : "—",
                    color: "text-emerald-400",
                  },
                ].map((m) => (
                  <div key={m.label} className="bg-white/3 rounded-lg p-3 border border-border/30">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
                    <p className={`text-lg font-bold font-mono ${m.color}`}>{String(m.value)}</p>
                  </div>
                ))}
              </div>

              {/* Risk distribution bar chart if available */}
              {mlStats?.risk_distribution && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                    Risk Score Distribution
                  </p>
                  <ResponsiveContainer width="100%" height={80}>
                    <BarChart
                      data={Object.entries(mlStats.risk_distribution as Record<string, number>).map(
                        ([bucket, count]) => ({ bucket, count })
                      )}
                      margin={{ top: 0, right: 0, left: -30, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 8, fill: "oklch(0.55 0.01 264)" }} />
                      <YAxis tick={{ fontSize: 8, fill: "oklch(0.55 0.01 264)" }} />
                      <Tooltip
                        contentStyle={{
                          background: "oklch(0.14 0.008 264)",
                          border: "1px solid oklch(1 0 0 / 10%)",
                          borderRadius: "6px",
                          fontSize: "11px",
                        }}
                      />
                      <Bar dataKey="count" fill="oklch(0.55 0.2 290)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Top fraud categories if available */}
              {mlStats?.top_categories && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                    Top Fraud Categories (ML)
                  </p>
                  <div className="space-y-1.5">
                    {(mlStats.top_categories as Array<{ category: string; count: number; pct?: number }>)
                      .slice(0, 5)
                      .map((cat) => (
                        <div key={cat.category} className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-muted-foreground w-32 truncate">
                            {cat.category}
                          </span>
                          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-purple-500/60 transition-all duration-700"
                              style={{ width: `${cat.pct ?? Math.min((cat.count / 100) * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">
                            {cat.count}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Raw JSON fallback for any extra fields */}
              {mlStats && !mlStats.total_scored && !mlStats.transactions_scored && (
                <pre className="text-[10px] font-mono text-muted-foreground bg-white/3 rounded p-3 overflow-auto max-h-32">
                  {JSON.stringify(mlStats, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FraudMonitor() {
  const utils = trpc.useUtils();
  const { status: sseStatus, lastEvent } = useSSE("/api/sse/fraud");
  const { data: stats, isLoading: statsLoading } = trpc.fraud.stats.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: alerts, isLoading: alertsLoading } = trpc.fraud.list.useQuery({ limit: 50 }, { refetchInterval: 10_000 });
  const [liveAlerts, setLiveAlerts] = useState<FraudAlertRow[]>([]);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === "new_alerts") {
      const payload = lastEvent.data as { alerts: FraudAlertRow[] };
      if (payload.alerts?.length) {
        setLiveAlerts(prev => [...payload.alerts, ...prev].slice(0, 20));
        toast.warning(`${payload.alerts.length} new fraud alert(s) detected`);
        utils.fraud.stats.invalidate();
        utils.fraud.list.invalidate();
      }
    }
    if (lastEvent.type === "snapshot") {
      const payload = lastEvent.data as { alerts: FraudAlertRow[] };
      if (payload.alerts?.length) setLiveAlerts(payload.alerts.slice(0, 20));
    }
  }, [lastEvent, utils]);

  const resolveAlert = trpc.fraud.resolve.useMutation({
    onSuccess: () => { toast.success("Alert resolved"); utils.fraud.list.invalidate(); utils.fraud.stats.invalidate(); },
  });
  const markFP = trpc.fraud.markFalsePositive.useMutation({
    onSuccess: () => { toast.success("Marked as false positive"); utils.fraud.list.invalidate(); utils.fraud.stats.invalidate(); },
  });

  const timelineData = Array.from({ length: 12 }, (_, i) => {
    const hour = i * 2;
    const hourAlerts = (alerts?.items ?? []).filter((a: FraudAlertRow) => {
      const h = new Date(a.createdAt).getHours();
      return h >= hour && h < hour + 2;
    });
    return {
      hour: `${String(hour).padStart(2, "0")}:00`,
      flagged: hourAlerts.length,
      critical: hourAlerts.filter((a: FraudAlertRow) => a.severity === "critical").length,
    };
  });

  const displayAlerts: FraudAlertRow[] = liveAlerts.length > 0
    ? liveAlerts
    : ((alerts?.items ?? []) as FraudAlertRow[]);

  return (
    <div className="p-6 min-h-full space-y-4">
      <PageHeader
        title="GNN Fraud Monitor"
        subtitle="Real-time graph neural network fraud detection with live alert streaming"
        actions={
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${
                sseStatus === "connected"
                  ? "bg-white/5 border-border text-primary"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
              }`}
            >
              {sseStatus === "connected" ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span className="text-[10px] font-mono uppercase">
                {sseStatus === "connected" ? "LIVE" : sseStatus.toUpperCase()}
              </span>
              {sseStatus === "connected" && <div className="w-1.5 h-1.5 rounded-full bg-primary pulse-green" />}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-border/50"
              onClick={() => { utils.fraud.list.invalidate(); utils.fraud.stats.invalidate(); }}
            >
              <RefreshCw className="w-3 h-3 mr-1" />Refresh
            </Button>
          </div>
        }
      />

      {/* Rule-based stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 stagger-children">
        <StatCard label="Open Alerts" value={statsLoading ? "..." : String(stats?.open ?? 0)} color="crimson" icon={AlertTriangle} animationDelay={0} />
        <StatCard label="Critical" value={statsLoading ? "..." : String(stats?.critical ?? 0)} color="crimson" icon={Zap} animationDelay={50} />
        <StatCard label="High" value={statsLoading ? "..." : String(stats?.high ?? 0)} color="amber" icon={Shield} animationDelay={100} />
        <StatCard label="Investigating" value={statsLoading ? "..." : String(stats?.investigating ?? 0)} color="blue" icon={Activity} animationDelay={150} />
        <StatCard label="Last 24h" value={statsLoading ? "..." : String(stats?.last24h ?? 0)} trend="up" trendValue="alerts today" color="amber" icon={Activity} animationDelay={200} />
        <StatCard label="Total" value={statsLoading ? "..." : String(stats?.total ?? 0)} color="blue" icon={Shield} animationDelay={250} />
      </div>

      {/* ML Fraud Engine panel */}
      <MlFraudStatsPanel />

      {/* Timeline + severity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div
          className="lg:col-span-2 glass-card p-4 animate-fade-in-up opacity-0"
          style={{ animationDelay: "200ms", animationFillMode: "forwards" }}
        >
          <h3 className="text-sm font-semibold text-foreground mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Alert Timeline (24h)
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={timelineData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="fraudGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.62 0.22 25)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.62 0.22 25)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "oklch(0.55 0.01 264)" }} />
              <YAxis tick={{ fontSize: 9, fill: "oklch(0.55 0.01 264)" }} />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.14 0.008 264)",
                  border: "1px solid oklch(1 0 0 / 10%)",
                  borderRadius: "6px",
                  fontSize: "11px",
                }}
              />
              <Area type="monotone" dataKey="flagged" stroke="oklch(0.62 0.22 25)" fill="url(#fraudGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="critical" stroke="oklch(0.55 0.25 25)" fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div
          className="glass-card p-4 animate-fade-in-up opacity-0"
          style={{ animationDelay: "250ms", animationFillMode: "forwards" }}
        >
          <h3 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Severity Breakdown
          </h3>
          <div className="space-y-3">
            {[
              { label: "Critical", count: stats?.critical ?? 0, color: "oklch(0.55 0.25 25)" },
              { label: "High", count: stats?.high ?? 0, color: "oklch(0.62 0.22 25)" },
              { label: "Investigating", count: stats?.investigating ?? 0, color: "oklch(0.6 0.18 264)" },
              { label: "Open", count: stats?.open ?? 0, color: "oklch(0.82 0.18 75)" },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-[10px] mb-1">
                  <span style={{ color: item.color }} className="font-mono">{item.label}</span>
                  <span className="text-muted-foreground font-mono">{item.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: stats?.total ? `${Math.round((item.count / stats.total) * 100)}%` : "0%",
                      background: item.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alert feed */}
      <div
        className="glass-card overflow-hidden animate-fade-in-up opacity-0"
        style={{ animationDelay: "300ms", animationFillMode: "forwards" }}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            {liveAlerts.length > 0 ? "Live Alert Feed" : "Recent Alerts"}
            <span className="ml-2 text-xs text-muted-foreground font-normal">({displayAlerts.length} alerts)</span>
          </h3>
          {liveAlerts.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-primary font-mono">
              <div className="w-1.5 h-1.5 rounded-full bg-primary pulse-green" />STREAMING LIVE
            </div>
          )}
        </div>
        {alertsLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-white/5 animate-pulse rounded-lg" />)}
          </div>
        ) : displayAlerts.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No fraud alerts detected</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  {["Alert ID","Rule / Type","Amount","Country","GNN Score","Severity","Status","Time","Actions"].map(h => (
                    <th key={h} className="text-left p-3 text-muted-foreground font-medium uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayAlerts.map((alert: FraudAlertRow, i: number) => (
                  <tr
                    key={alert.id}
                    className="border-b border-border/30 hover:bg-white/3 transition-colors group animate-fade-in-up opacity-0"
                    style={{ animationDelay: `${i * 25}ms`, animationFillMode: "forwards" }}
                  >
                    <td className="p-3 font-mono text-muted-foreground whitespace-nowrap">{alert.alertId}</td>
                    <td className="p-3 text-foreground max-w-[160px] truncate">{alert.ruleTriggered ?? alert.description ?? "—"}</td>
                    <td className="p-3 font-mono text-foreground whitespace-nowrap">
                      {alert.amount ? `${alert.currency ?? ""} ${alert.amount}` : "—"}
                    </td>
                    <td className="p-3">
                      <span className="badge-muted px-1.5 py-0.5 rounded font-mono">{alert.country ?? "—"}</span>
                    </td>
                    <td className="p-3">
                      {alert.gnnScore ? (
                        <span className={`font-mono font-bold ${
                          Number(alert.gnnScore) >= 0.8 ? "text-red-400"
                          : Number(alert.gnnScore) >= 0.6 ? "text-orange-400"
                          : "text-amber-400"
                        }`}>
                          {(Number(alert.gnnScore) * 100).toFixed(0)}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="p-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase ${SEV_COLORS[alert.severity] ?? "badge-muted"}`}>
                        {alert.severity}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono capitalize ${
                        alert.status === "resolved" ? "badge-green"
                        : alert.status === "false_positive" ? "badge-muted"
                        : alert.status === "investigating" ? "badge-blue"
                        : "badge-crimson"
                      }`}>
                        {alert.status}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground font-mono whitespace-nowrap">
                      {new Date(alert.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="p-3">
                      {alert.status === "open" && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2 border-primary/30 text-primary"
                            onClick={() => resolveAlert.mutate({ id: alert.id })}
                            disabled={resolveAlert.isPending}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />Resolve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2 border-border/50 text-muted-foreground"
                            onClick={() => markFP.mutate({ id: alert.id })}
                            disabled={markFP.isPending}
                          >
                            <XCircle className="w-3 h-3 mr-1" />FP
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
