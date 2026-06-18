import { Link, useLocation } from "wouter";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Shield, Building2, AlertTriangle, Activity, ChevronRight, Clock, CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import StatCard from "@/components/shared/StatCard";
import PageHeader from "@/components/shared/PageHeader";
import RiskRing from "@/components/shared/RiskRing";
import { trpc } from "@/lib/trpc";



const statusConfig = {
  completed: { icon: CheckCircle, color: "text-[oklch(0.78_0.22_152)]" },
  pending: { icon: Clock, color: "text-[oklch(0.82_0.18_75)]" },
  approved: { icon: CheckCircle, color: "text-[oklch(0.78_0.22_152)]" },
  flagged: { icon: AlertCircle, color: "text-[oklch(0.62_0.22_25)]" },
  alert: { icon: XCircle, color: "text-[oklch(0.62_0.22_25)]" },
  processing: { icon: RefreshCw, color: "text-[oklch(0.65_0.18_230)]" },
};

export default function Dashboard() {
  const [, navigate] = useLocation();

  const { data: dashStats, isLoading: dashLoading } = trpc.africa.dashboardStats.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: bisStats, isLoading: bisLoading } = trpc.bis.stats.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: fraudStats } = trpc.fraud.stats.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: socStats } = trpc.soc.stats.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: recentBis } = trpc.bis.list.useQuery({ limit: 5 }, { refetchInterval: 30_000 });
  const { data: recentFraud } = trpc.fraud.list.useQuery({ limit: 2 }, { refetchInterval: 30_000 });
  const { data: txData = [] } = trpc.africa.txVolume.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: countryData = [] } = trpc.africa.countryBreakdown.useQuery(undefined, { refetchInterval: 60_000 });

  const isLoading = dashLoading || bisLoading;
  const maxTxns = Math.max(...countryData.map(c => c.txns), 1);

  const activityFeed = [
    ...(recentBis?.slice(0, 4).map((inv: any) => ({
      id: inv.referenceId,
      subject: inv.subjectFullName,
      country: inv.subjectCountry ?? "??",
      status: inv.status,
      risk: inv.riskScore ?? null,
      href: `/bis/${inv.id}`,
      time: new Date(inv.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    })) ?? []),
    ...((recentFraud as any[])?.slice(0, 2).map((a: any) => ({
      id: `FRD-${a.id}`,
      subject: a.description ?? "Suspicious activity",
      country: a.country ?? "??",
      status: "alert" as const,
      risk: null,
      href: "/security/fraud",
      time: new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    })) ?? []),
  ].slice(0, 6);

  return (
    <div className="p-6 dot-grid min-h-full">
      <PageHeader
        title="Operations Dashboard"
        subtitle="Real-time overview across all African markets"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">{isLoading ? "Refreshing..." : "Live data"}</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-border bg-white/5 hover:bg-white/10"
              onClick={() => navigate("/admin/audit-log")}
            >
              Export Report
            </Button>
          </div>
        }
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 stagger-children">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <StatCard
              label="Total Establishments"
              value={(dashStats?.totalEstablishments ?? 0).toLocaleString()}
              trend="up"
              trendValue="Registered"
              color="green"
              icon={Building2}
              animationDelay={0}
            />
            <StatCard
              label="BIS Investigations"
              value={(bisStats?.total ?? 0).toLocaleString()}
              trendValue={`${bisStats?.processing ?? 0} processing`}
              color="blue"
              icon={Shield}
              animationDelay={50}
            />
            <StatCard
              label="Pending KYB"
              value={(dashStats?.pendingKyb ?? 0).toLocaleString()}
              trendValue="Under review"
              color="amber"
              icon={Activity}
              animationDelay={100}
            />
            <StatCard
              label="Open Fraud Alerts"
              value={(fraudStats?.open ?? dashStats?.openFraudAlerts ?? 0).toLocaleString()}
              trendValue={`${socStats?.open ?? dashStats?.openSocAlerts ?? 0} SOC alerts`}
              color="crimson"
              icon={AlertTriangle}
              animationDelay={150}
            />
          </>
        )}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Transaction volume chart */}
        <div className="lg:col-span-2 glass-card p-4 animate-fade-in-up opacity-0" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Transaction Volume</h3>
              <p className="text-xs text-muted-foreground">24-hour rolling window</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary" />Volume</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-destructive" />Fraud</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={txData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.78 0.22 152)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.78 0.22 152)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "oklch(0.55 0.01 264)" }} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.01 264)" }} />
              <Tooltip
                contentStyle={{ background: "oklch(0.14 0.008 264)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: "6px", fontSize: "11px" }}
                labelStyle={{ color: "oklch(0.92 0.005 264)" }}
              />
              <Area type="monotone" dataKey="volume" stroke="oklch(0.78 0.22 152)" strokeWidth={2} fill="url(#volGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Country breakdown */}
        <div className="glass-card p-4 animate-fade-in-up opacity-0" style={{ animationDelay: "250ms", animationFillMode: "forwards" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>By Country</h3>
            <Link href="/africa/registry">
              <span className="text-xs text-primary hover:underline flex items-center gap-0.5">View all <ChevronRight className="w-3 h-3" /></span>
            </Link>
          </div>
          <div className="space-y-3">
            {countryData.map((c) => (
              <div key={c.country} className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-muted-foreground w-6">{c.country}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-foreground">{c.name}</span>
                    <span className="text-xs font-mono" style={{ color: c.color }}>{c.txns.toLocaleString()}</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${(c.txns / maxTxns) * 100}%`, background: c.color }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent activity feed */}
        <div className="lg:col-span-2 glass-card p-4 animate-fade-in-up opacity-0" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Recent Activity</h3>
            <span className="text-[10px] font-mono badge-green px-2 py-0.5 rounded">LIVE</span>
          </div>
          <div className="space-y-2">
            {activityFeed.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">No recent activity</div>
            ) : activityFeed.map((item, idx) => {
              const StatusIcon = statusConfig[item.status as keyof typeof statusConfig]?.icon ?? Activity;
              const statusColor = statusConfig[item.status as keyof typeof statusConfig]?.color ?? "text-muted-foreground";
              return (
                <div
                  key={`${item.id}-${idx}`}
                  className="flex items-center gap-3 p-2.5 rounded-md bg-white/3 hover:bg-white/5 transition-colors group cursor-pointer"
                  onClick={() => navigate(item.href)}
                >
                  <StatusIcon className={`w-4 h-4 shrink-0 ${statusColor}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{item.id}</span>
                      <span className="text-[10px] badge-muted px-1.5 py-0.5 rounded">{item.country}</span>
                    </div>
                    <p className="text-xs text-foreground truncate">{item.subject}</p>
                  </div>
                  {item.risk !== null && (
                    <RiskRing score={item.risk} size={36} strokeWidth={3} showLabel={false} />
                  )}
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">{item.time}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick actions */}
        <div className="glass-card p-4 animate-fade-in-up opacity-0" style={{ animationDelay: "350ms", animationFillMode: "forwards" }}>
          <h3 className="text-sm font-semibold text-foreground mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Quick Actions</h3>
          <div className="space-y-2">
            {[
              { label: "New BIS Investigation", href: "/bis/new", color: "text-primary", bg: "bg-primary/10 hover:bg-primary/20" },
              { label: "Onboard Establishment", href: "/africa/kyb", color: "text-[oklch(0.65_0.18_230)]", bg: "bg-[oklch(0.65_0.18_230)]/10 hover:bg-[oklch(0.65_0.18_230)]/20" },
              { label: "View Fraud Alerts", href: "/security/fraud", color: "text-destructive", bg: "bg-destructive/10 hover:bg-destructive/20" },
              { label: "AI Travel Co-Pilot", href: "/copilot", color: "text-[oklch(0.82_0.18_75)]", bg: "bg-[oklch(0.82_0.18_75)]/10 hover:bg-[oklch(0.82_0.18_75)]/20" },
              { label: "Digital Wallet", href: "/wallet", color: "text-primary", bg: "bg-primary/10 hover:bg-primary/20" },
            ].map((action) => (
              <Link key={action.href} href={action.href}>
                <div className={`flex items-center justify-between px-3 py-2.5 rounded-md transition-colors cursor-pointer ${action.bg}`}>
                  <span className={`text-xs font-medium ${action.color}`}>{action.label}</span>
                  <ChevronRight className={`w-3.5 h-3.5 ${action.color}`} />
                </div>
              </Link>
            ))}
          </div>

          {/* Platform health */}
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Platform Health</p>
            {[
              { label: "API Gateway", status: "operational" },
              { label: "BIS Engine", status: "operational" },
              { label: "KYB Service", status: "operational" },
              { label: "Fraud Detection", status: "operational" },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between py-1">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary pulse-green" />
                  <span className="text-[10px] font-mono text-primary">OK</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
