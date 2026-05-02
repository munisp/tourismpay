import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useSSE } from "@/hooks/useSSE";
import { Shield, AlertTriangle, Eye, Lock, RefreshCw, CheckCircle, Wifi, WifiOff, Activity, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { toast } from "sonner";

type SocAlertRow = {
  id: number; alertId: string; type: string; severity: string; status: string;
  title: string | null; description: string | null; source: string | null;
  affectedSystem: string | null; country: string | null; createdAt: Date;
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  intrusion: Shield, policy_violation: Lock, threat_intel: Eye,
  anomaly: Activity, vulnerability: AlertTriangle,
};

const SEV_COLORS: Record<string, string> = {
  info: "badge-muted", low: "badge-green", medium: "badge-muted",
  high: "badge-blue", critical: "badge-crimson",
};

export default function SOCDashboard() {
  const utils = trpc.useUtils();
  const { status: sseStatus, lastEvent } = useSSE("/api/sse/soc");
  const { data: stats, isLoading: statsLoading } = trpc.soc.stats.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: alerts, isLoading: alertsLoading } = trpc.soc.list.useQuery({ limit: 50 }, { refetchInterval: 10_000 });
  const [liveAlerts, setLiveAlerts] = useState<SocAlertRow[]>([]);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === "new_alerts") {
      const payload = lastEvent.data as { alerts: SocAlertRow[] };
      if (payload.alerts?.length) {
        setLiveAlerts(prev => [...payload.alerts, ...prev].slice(0, 20));
        toast.warning(`${payload.alerts.length} new SOC alert(s)`, { description: payload.alerts[0]?.title ?? "" });
        utils.soc.stats.invalidate();
        utils.soc.list.invalidate();
      }
    }
    if (lastEvent.type === "snapshot") {
      const payload = lastEvent.data as { alerts: SocAlertRow[] };
      if (payload.alerts?.length) setLiveAlerts(payload.alerts.slice(0, 20));
    }
  }, [lastEvent, utils]);

  const resolveAlert = trpc.soc.resolve.useMutation({
    onSuccess: () => { toast.success("SOC alert resolved"); utils.soc.list.invalidate(); utils.soc.stats.invalidate(); },
  });

  const typeBreakdown = ["intrusion", "policy_violation", "threat_intel", "anomaly", "vulnerability"].map(type => ({
    type: type.replace("_", " "),
    count: (alerts ?? []).filter((a: SocAlertRow) => a.type === type).length,
  }));

  const displayAlerts: SocAlertRow[] = liveAlerts.length > 0 ? liveAlerts : ((alerts ?? []) as SocAlertRow[]);

  return (
    <div className="p-6 min-h-full">
      <PageHeader title="SOC Dashboard" subtitle="Security Operations Center — real-time threat monitoring and incident management"
        actions={
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${sseStatus === "connected" ? "bg-white/5 border-border text-primary" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
              {sseStatus === "connected" ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span className="text-[10px] font-mono uppercase">{sseStatus === "connected" ? "LIVE" : sseStatus.toUpperCase()}</span>
              {sseStatus === "connected" && <div className="w-1.5 h-1.5 rounded-full bg-primary pulse-green" />}
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs border-border/50"
              onClick={() => { utils.soc.list.invalidate(); utils.soc.stats.invalidate(); }}>
              <RefreshCw className="w-3 h-3 mr-1" />Refresh
            </Button>
          </div>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6 stagger-children">
        <StatCard label="Open" value={statsLoading ? "..." : String(stats?.open ?? 0)} color="crimson" icon={AlertTriangle} animationDelay={0} />
        <StatCard label="Critical" value={statsLoading ? "..." : String(stats?.critical ?? 0)} color="crimson" icon={Zap} animationDelay={50} />
        <StatCard label="Intrusions" value={statsLoading ? "..." : String(stats?.intrusions ?? 0)} color="amber" icon={Shield} animationDelay={100} />
        <StatCard label="Threat Intel" value={statsLoading ? "..." : String(stats?.threatIntel ?? 0)} color="blue" icon={Eye} animationDelay={150} />
        <StatCard label="Last 24h" value={statsLoading ? "..." : String(stats?.last24h ?? 0)} trend="up" trendValue="alerts today" color="amber" icon={Activity} animationDelay={200} />
        <StatCard label="Total" value={statsLoading ? "..." : String(stats?.total ?? 0)} color="blue" icon={Lock} animationDelay={250} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 glass-card p-4 animate-fade-in-up opacity-0" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
          <h3 className="text-sm font-semibold text-foreground mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Alert Type Distribution</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={typeBreakdown} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
              <XAxis dataKey="type" tick={{ fontSize: 9, fill: "oklch(0.55 0.01 264)" }} />
              <YAxis tick={{ fontSize: 9, fill: "oklch(0.55 0.01 264)" }} />
              <Tooltip contentStyle={{ background: "oklch(0.14 0.008 264)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: "6px", fontSize: "11px" }} />
              <Bar dataKey="count" fill="oklch(0.6 0.18 264)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card p-4 animate-fade-in-up opacity-0" style={{ animationDelay: "250ms", animationFillMode: "forwards" }}>
          <h3 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "Space Grotesk, sans-serif" }}>OPA Policy Status</h3>
          <div className="space-y-2">
            {[
              { policy: "PCI-DSS Compliance", status: "PASS", color: "text-primary" },
              { policy: "GDPR Data Controls", status: "PASS", color: "text-primary" },
              { policy: "AML Transaction Rules", status: "PASS", color: "text-primary" },
              { policy: "Access Control Policy", status: "WARN", color: "text-amber-400" },
              { policy: "Network Segmentation", status: "PASS", color: "text-primary" },
            ].map(item => (
              <div key={item.policy} className="flex items-center justify-between py-1.5 border-b border-border/20">
                <span className="text-xs text-foreground">{item.policy}</span>
                <span className={`text-[10px] font-mono font-bold ${item.color}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="glass-card overflow-hidden animate-fade-in-up opacity-0" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            {liveAlerts.length > 0 ? "Live Incident Feed" : "Recent Incidents"}
            <span className="ml-2 text-xs text-muted-foreground font-normal">({displayAlerts.length} incidents)</span>
          </h3>
          {liveAlerts.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-primary font-mono">
              <div className="w-1.5 h-1.5 rounded-full bg-primary pulse-green" />STREAMING LIVE
            </div>
          )}
        </div>
        {alertsLoading ? (
          <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-white/5 animate-pulse rounded-lg" />)}</div>
        ) : displayAlerts.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No security incidents detected</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border/50">{["Alert ID","Type","Title","Source","System","Country","Severity","Status","Time","Actions"].map(h => <th key={h} className="text-left p-3 text-muted-foreground font-medium uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {displayAlerts.map((alert: SocAlertRow, i: number) => {
                  const Icon = TYPE_ICONS[alert.type] ?? Shield;
                  return (
                    <tr key={alert.id} className="border-b border-border/30 hover:bg-white/3 transition-colors group animate-fade-in-up opacity-0" style={{ animationDelay: `${i * 25}ms`, animationFillMode: "forwards" }}>
                      <td className="p-3 font-mono text-muted-foreground whitespace-nowrap">{alert.alertId}</td>
                      <td className="p-3"><div className="flex items-center gap-1.5"><Icon className="w-3 h-3 text-muted-foreground" /><span className="text-[10px] badge-muted px-1.5 py-0.5 rounded capitalize">{alert.type.replace("_"," ")}</span></div></td>
                      <td className="p-3 text-foreground max-w-[180px] truncate">{alert.title ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{alert.source ?? "—"}</td>
                      <td className="p-3 text-muted-foreground max-w-[120px] truncate">{alert.affectedSystem ?? "—"}</td>
                      <td className="p-3"><span className="badge-muted px-1.5 py-0.5 rounded font-mono">{alert.country ?? "—"}</span></td>
                      <td className="p-3"><span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase ${SEV_COLORS[alert.severity] ?? "badge-muted"}`}>{alert.severity}</span></td>
                      <td className="p-3"><span className={`text-[10px] px-1.5 py-0.5 rounded font-mono capitalize ${alert.status === "resolved" ? "badge-green" : alert.status === "investigating" ? "badge-blue" : "badge-crimson"}`}>{alert.status}</span></td>
                      <td className="p-3 text-muted-foreground font-mono whitespace-nowrap">{new Date(alert.createdAt).toLocaleTimeString()}</td>
                      <td className="p-3">{alert.status === "open" && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 border-primary/30 text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => resolveAlert.mutate({ id: alert.id })} disabled={resolveAlert.isPending}>
                          <CheckCircle className="w-3 h-3 mr-1" />Resolve
                        </Button>
                      )}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
