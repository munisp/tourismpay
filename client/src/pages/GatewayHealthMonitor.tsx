/**
 * Gateway Health Monitor — N-03
 * Real-time uptime tracking for NIBSS, Interswitch, Paystack, and other payment gateways.
 * Data sourced from apisixRouteRegistry and serviceHealthHistory tables via tRPC.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { Activity, CheckCircle, XCircle, Shield, Zap, Clock, Search, RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "sonner";

const KNOWN_GATEWAYS = [
  { key: "nibss", name: "NIBSS", description: "Nigerian Interbank Settlement System" },
  { key: "interswitch", name: "Interswitch", description: "Pan-African payment gateway" },
  { key: "paystack", name: "Paystack", description: "Online payment processing" },
  { key: "flutterwave", name: "Flutterwave", description: "Cross-border payments" },
  { key: "mojaloop", name: "Mojaloop", description: "ILP payment switch" },
];

function statusBadge(status: string) {
  if (status === "active" || status === "healthy")
    return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Healthy</Badge>;
  if (status === "degraded" || status === "unhealthy")
    return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">Degraded</Badge>;
  return <Badge className="bg-red-500/10 text-red-400 border-red-500/30">Down</Badge>;
}

export default function GatewayHealthMonitor() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "routes" | "history">("overview");

  const { data: routeData, isLoading: routesLoading, isFetched: routesFetched } =
    trpc.gatewayHealthMonitor.list.useQuery(undefined, { retry: 1, refetchInterval: 30_000 });

  const { data: historyData, isLoading: historyLoading, isFetched: historyFetched } =
    trpc.gatewayHealthMonitor.getUptimeHistory.useQuery(undefined, { retry: 1, refetchInterval: 60_000 });

  const routes: any[] = routeData?.items ?? [];
  const history: any[] = historyData?.items ?? [];
  const isLoading = routesLoading && !routesFetched;

  const activeRoutes = routes.filter((r) => r.status === "active").length;
  const wafEnabled = routes.filter((r) => r.wafEnabled).length;
  const avgRateLimit = routes.length
    ? Math.round(routes.reduce((s, r) => s + (r.rateLimitRps ?? 0), 0) / routes.length)
    : 0;

  const gatewayStatus = KNOWN_GATEWAYS.map((gw) => {
    const route = routes.find(
      (r) => r.upstreamService?.toLowerCase().includes(gw.key) || r.routeName?.toLowerCase().includes(gw.key)
    );
    return { ...gw, status: route?.status ?? "unknown", rateLimit: route?.rateLimitRps ?? null, waf: route?.wafEnabled ?? false, lastSync: route?.syncedAt ? new Date(route.syncedAt).toLocaleString() : "—" };
  });

  const filteredRoutes = routes.filter(
    (r) => !search || r.routeName?.toLowerCase().includes(search.toLowerCase()) || r.upstreamService?.toLowerCase().includes(search.toLowerCase())
  );

  const chartData = history.slice(0, 24).reverse().map((h: any, i: number) => ({
    time: `${i}h`, responseMs: h.responseMs ?? 0,
  }));

  const handleRefresh = () => {
    utils.gatewayHealthMonitor.list.invalidate();
    utils.gatewayHealthMonitor.getUptimeHistory.invalidate();
    toast.success("Gateway health data refreshed");
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Gateway Health Monitor" subtitle="Real-time uptime and latency tracking for all payment gateways" icon={<Activity className="w-6 h-6" />}>
        <Button onClick={handleRefresh} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="w-4 h-4" />Refresh
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Routes" value={isLoading ? "—" : `${activeRoutes}/${routes.length}`} icon={<CheckCircle className="w-5 h-5 text-emerald-500" />} trend={activeRoutes === routes.length ? "All operational" : `${routes.length - activeRoutes} degraded`} />
        <StatCard title="WAF Protected" value={isLoading ? "—" : String(wafEnabled)} icon={<Shield className="w-5 h-5 text-blue-500" />} trend={`of ${routes.length} routes`} />
        <StatCard title="Avg Rate Limit" value={isLoading ? "—" : `${avgRateLimit} rps`} icon={<Zap className="w-5 h-5 text-amber-500" />} trend="per route" />
        <StatCard title="Health Records" value={historyFetched ? String(history.length) : "—"} icon={<Clock className="w-5 h-5 text-purple-500" />} trend="checks logged" />
      </div>

      <div className="flex gap-2 border-b border-border pb-2">
        {(["overview", "routes", "history"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors capitalize ${activeTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{tab}</button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gatewayStatus.map((gw) => (
              <Card key={gw.key}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{gw.name}</CardTitle>
                    {statusBadge(gw.status)}
                  </div>
                  <CardDescription>{gw.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Rate Limit</span><span>{gw.rateLimit ? `${gw.rateLimit} rps` : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">WAF</span><span className={gw.waf ? "text-emerald-400" : "text-muted-foreground"}>{gw.waf ? "Enabled" : "Disabled"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Last Sync</span><span className="text-xs">{gw.lastSync}</span></div>
                </CardContent>
              </Card>
            ))}
          </div>
          {chartData.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Response Time (Last 24h)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="ms" />
                    <Tooltip formatter={(v: any) => [`${v}ms`, "Response"]} />
                    <Line type="monotone" dataKey="responseMs" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          {isLoading && <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>}
        </div>
      )}

      {activeTab === "routes" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search routes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <span className="text-sm text-muted-foreground">{filteredRoutes.length} routes</span>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Route Name", "Upstream Service", "Path", "Methods", "Rate Limit", "WAF", "Status"].map(col => (
                      <th key={col} className="text-left p-3 text-muted-foreground font-medium">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? Array.from({length:5}).map((_,i) => (
                    <tr key={i} className="border-b border-border/50">{Array.from({length:7}).map((_,j) => <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                  )) : filteredRoutes.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No routes found</td></tr>
                  ) : filteredRoutes.map((route: any) => (
                    <tr key={route.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">{route.routeName ?? "—"}</td>
                      <td className="p-3 font-mono text-xs text-primary">{route.upstreamService ?? "—"}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{route.pathPrefix ?? "—"}</td>
                      <td className="p-3"><div className="flex flex-wrap gap-1">{(route.methods ?? []).map((m: string) => <Badge key={m} variant="outline" className="text-xs px-1 py-0">{m}</Badge>)}</div></td>
                      <td className="p-3">{route.rateLimitRps ? `${route.rateLimitRps} rps` : "—"}</td>
                      <td className="p-3">{route.wafEnabled ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}</td>
                      <td className="p-3">{statusBadge(route.status ?? "unknown")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "history" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Health Check History</CardTitle><CardDescription>Last {history.length} health check results</CardDescription></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Service", "Status", "HTTP", "Response Time", "Checked At"].map(col => <th key={col} className="text-left p-3 text-muted-foreground font-medium">{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {historyLoading && !historyFetched ? Array.from({length:5}).map((_,i) => (
                  <tr key={i} className="border-b border-border/50">{Array.from({length:5}).map((_,j) => <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                )) : history.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No health check history available yet</td></tr>
                ) : history.map((h: any) => (
                  <tr key={h.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-mono text-xs">{h.serviceKey ?? "—"}</td>
                    <td className="p-3">{statusBadge(h.status ?? "unknown")}</td>
                    <td className="p-3 text-muted-foreground">{h.httpStatus ?? "—"}</td>
                    <td className="p-3">{h.responseMs != null ? `${h.responseMs}ms` : "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{h.checkedAt ? new Date(h.checkedAt * 1000).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
