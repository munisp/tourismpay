import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  RefreshCw, CheckCircle, XCircle, AlertCircle, Wifi, WifiOff, Settings, Clock, Bell,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

const STATUS_CONFIG = {
  healthy: { label: "Healthy", color: "bg-green-500/10 text-green-400 border-green-500/20", icon: CheckCircle },
  unhealthy: { label: "Unhealthy", color: "bg-red-500/10 text-red-400 border-red-500/20", icon: XCircle },
  unreachable: { label: "Unreachable", color: "bg-orange-500/10 text-orange-400 border-orange-500/20", icon: AlertCircle },
  not_configured: { label: "Not Configured", color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", icon: WifiOff },
  error: { label: "Error", color: "bg-red-500/10 text-red-400 border-red-500/20", icon: XCircle },
} as const;

type ServiceStatus = keyof typeof STATUS_CONFIG;

interface ServiceResult {
  name: string;
  status: ServiceStatus;
  url?: string | null;
  httpStatus?: number;
  error?: string;
}

interface HistoryRow {
  id: string;
  serviceKey: string;
  status: string;
  responseMs: number | null;
  checkedAt: number;
}

interface AlertRow {
  id: string;
  serviceKey: string;
  lastAlertAt: number;
  alertCount: number;
}

// Compute uptime % from history rows (last 24h)
function computeUptime(rows: HistoryRow[]): number {
  if (!rows.length) return 100;
  const healthy = rows.filter((r) => r.status === "healthy").length;
  return Math.round((healthy / rows.length) * 100);
}

function uptimeBadgeColor(pct: number): string {
  if (pct >= 99) return "bg-green-500/10 text-green-400 border-green-500/20";
  if (pct >= 95) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  return "bg-red-500/10 text-red-400 border-red-500/20";
}

// Format a unix-seconds timestamp as HH:mm
function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Format a unix-seconds timestamp as relative time
function fmtRelative(ts: number): string {
  const diff = Math.floor((Date.now() - ts * 1000) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// Custom tooltip for the sparkline
function SparkTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded px-2 py-1 text-[10px] shadow-lg">
      <p className="text-muted-foreground">{fmtTime(d.checkedAt)}</p>
      <p className={d.status === "healthy" ? "text-green-400" : "text-red-400"}>
        {d.status} {d.responseTimeMs != null ? `· ${d.responseTimeMs}ms` : ""}
      </p>
    </div>
  );
}

export default function ServiceHealth() {
  const [historyHours, setHistoryHours] = useState(24);

  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = trpc.serviceProxy.serviceHealth.useQuery(
    undefined,
    { refetchInterval: 60_000 }
  );

  const { data: config, isLoading: configLoading, refetch: refetchConfig } = trpc.serviceProxy.proxyConfig.useQuery();

  const { data: historyRaw = [], isLoading: historyLoading, refetch: refetchHistory } =
    trpc.serviceProxy.serviceHealthHistory.useQuery(
      { hours: historyHours },
      { refetchInterval: 5 * 60_000 }
    );

  const { data: alertLog = [], refetch: refetchAlerts } =
    trpc.serviceProxy.serviceHealthAlertLog.useQuery(
      undefined,
      { refetchInterval: 5 * 60_000 }
    );

  const { data: pythonHealth, isLoading: pythonHealthLoading, refetch: refetchPythonHealth } =
    trpc.pythonServices.healthCheck.useQuery(undefined, { refetchInterval: 60_000 });

  const handleRefresh = async () => {
    await Promise.all([refetchHealth(), refetchConfig(), refetchHistory(), refetchAlerts(), refetchPythonHealth()]);
    toast.success("Service health status updated.");
  };

  const services = (health as ServiceResult[] | undefined) ?? [];
  const configuredCount = config?.enabledCount ?? 0;
  const healthyCount = services.filter((s) => s.status === "healthy").length;
  const totalCount = services.length;

  // Group history rows by serviceKey
  const historyByService = useMemo(() => {
    const map: Record<string, HistoryRow[]> = {};
    for (const row of historyRaw as HistoryRow[]) {
      if (!map[row.serviceKey]) map[row.serviceKey] = [];
      map[row.serviceKey].push(row);
    }
    // Sort each group ascending by checkedAt for the chart
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.checkedAt - b.checkedAt);
    }
    return map;
  }, [historyRaw]);

  // Build alert lookup by serviceKey
  const alertByService = useMemo(() => {
    const map: Record<string, AlertRow> = {};
    for (const row of alertLog as AlertRow[]) {
      map[row.serviceKey] = row;
    }
    return map;
  }, [alertLog]);

  // Get all service keys that appear in history
  const historyServiceKeys = Object.keys(historyByService);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Service Health</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor Go microservice connectivity, uptime trends, and alert history
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={historyHours}
            onChange={(e) => setHistoryHours(Number(e.target.value))}
            className="text-xs bg-card border border-border rounded px-2 py-1.5 text-muted-foreground focus:outline-none"
          >
            <option value={6}>Last 6h</option>
            <option value={12}>Last 12h</option>
            <option value={24}>Last 24h</option>
            <option value={48}>Last 48h</option>
          </select>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={healthLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${healthLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Wifi className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Configured Services</p>
                <p className="text-2xl font-bold text-foreground">{configLoading ? "—" : configuredCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Healthy Now</p>
                <p className="text-2xl font-bold text-foreground">{healthLoading ? "—" : healthyCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-zinc-500/10">
                <Settings className="w-5 h-5 text-zinc-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Services</p>
                <p className="text-2xl font-bold text-foreground">{totalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current Status List */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Current Status</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {healthLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {services.map((svc, idx) => {
                const cfg = STATUS_CONFIG[svc.status] ?? STATUS_CONFIG.error;
                const Icon = cfg.icon;
                const rows = historyByService[svc.name.toLowerCase().replace(/\s+/g, "_")] ?? [];
                const uptime = computeUptime(rows);
                const uptimeColor = uptimeBadgeColor(uptime);
                return (
                  <div key={idx} className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className={`w-5 h-5 shrink-0 ${cfg.color.split(" ")[1]}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{svc.name}</p>
                        {svc.url ? (
                          <p className="text-xs text-muted-foreground truncate max-w-xs">{svc.url}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Set environment variable to enable</p>
                        )}
                        {svc.error && (
                          <p className="text-xs text-red-400 truncate max-w-xs">{svc.error}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {svc.httpStatus && (
                        <span className="text-xs text-muted-foreground">HTTP {svc.httpStatus}</span>
                      )}
                      {rows.length > 0 && (
                        <Badge variant="outline" className={`text-xs ${uptimeColor}`}>
                          {uptime}% up
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-xs ${cfg.color}`}>
                        {cfg.label}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-Service Sparkline Charts */}
      {(historyLoading || historyServiceKeys.length > 0) && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Response Time History
              <span className="text-xs font-normal text-muted-foreground ml-2">
                (last {historyHours}h · {(historyRaw as HistoryRow[]).length} data points)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-lg bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : historyServiceKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No history data yet. The poller records checks every 5 minutes once services are configured.
              </p>
            ) : (
              <div className="space-y-6">
                {historyServiceKeys.map((serviceKey) => {
                  const rows = historyByService[serviceKey];
                  const uptime = computeUptime(rows);
                  const uptimeColor = uptimeBadgeColor(uptime);
                  // Build chart data — use responseTimeMs (null for unhealthy → 0)
          const chartData = rows.map((r) => ({
            checkedAt: r.checkedAt,
            responseMs: r.status === "healthy" ? (r.responseMs ?? 0) : 0,
            status: r.status,
          }));
                  const maxMs = Math.max(...chartData.map((d) => d.responseMs), 1);
                  const avgMs = chartData.length
                    ? Math.round(chartData.reduce((s, d) => s + d.responseMs, 0) / chartData.length)
                    : 0;
                  return (
                    <div key={serviceKey}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground capitalize">
                            {serviceKey.replace(/_/g, " ")}
                          </p>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${uptimeColor}`}>
                            {uptime}% uptime
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span>avg {avgMs}ms</span>
                          <span>peak {maxMs}ms</span>
                          <span>{rows.length} checks</span>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={72}>
                        <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id={`grad-${serviceKey}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={uptime >= 99 ? "#22c55e" : uptime >= 95 ? "#f59e0b" : "#ef4444"} stopOpacity={0.3} />
                              <stop offset="95%" stopColor={uptime >= 99 ? "#22c55e" : uptime >= 95 ? "#f59e0b" : "#ef4444"} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="checkedAt" hide />
                          <YAxis hide domain={[0, maxMs * 1.2]} />
                          <Tooltip content={<SparkTooltip />} />
                          <Area
                            type="monotone"
                            dataKey="responseMs"
                            stroke={uptime >= 99 ? "#22c55e" : uptime >= 95 ? "#f59e0b" : "#ef4444"}
                            strokeWidth={1.5}
                            fill={`url(#grad-${serviceKey})`}
                            dot={false}
                            activeDot={{ r: 3 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Alert Cooldown State */}
      {(alertLog as AlertRow[]).length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">Owner Alert Log</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {(alertLog as AlertRow[]).map((row) => {
                const cooldownEnds = (row.lastAlertAt + 3600) * 1000;
                const inCooldown = cooldownEnds > Date.now();
                const cooldownRemaining = inCooldown
                  ? Math.ceil((cooldownEnds - Date.now()) / 60_000)
                  : 0;
                return (
                  <div key={row.id} className="flex items-center justify-between px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground capitalize">
                          {row.serviceKey.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Last alert: {fmtRelative(row.lastAlertAt)} · {row.alertCount} total alert{row.alertCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={inCooldown
                        ? "text-xs bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "text-xs bg-zinc-500/10 text-zinc-400 border-zinc-500/20"}
                    >
                      {inCooldown ? `Cooldown ${cooldownRemaining}m` : "Ready"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Python ML Services */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <span>Python ML / AI Services</span>
            {pythonHealthLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            FastAPI microservices on ports 8001–8005. Start with{" "}
            <code className="font-mono bg-muted px-1 rounded">docker-compose up -d</code> in{" "}
            <code className="font-mono bg-muted px-1 rounded">07-python-services/</code>.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(pythonHealth ?? []).map((svc: any) => {
              const cfg = STATUS_CONFIG[svc.status as ServiceStatus] ?? STATUS_CONFIG.unreachable;
              const Icon = cfg.icon;
              return (
                <div key={svc.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`w-4 h-4 flex-shrink-0 ${svc.status === "healthy" ? "text-green-400" : "text-orange-400"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{svc.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{svc.url}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-xs flex-shrink-0 ml-2 ${cfg.color}`}>
                    {cfg.label}
                  </Badge>
                </div>
              );
            })}
            {!pythonHealthLoading && (!pythonHealth || pythonHealth.length === 0) && (
              <p className="text-sm text-muted-foreground col-span-full py-4 text-center">
                Unable to reach Python services. Ensure they are running.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Proxy Configuration */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Proxy Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 rounded bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              {config && Object.entries(config)
                .filter(([key]) => key !== "enabledCount")
                .map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between py-1.5">
                    <span className="text-muted-foreground font-mono text-xs uppercase tracking-wide">
                      {key.replace(/([A-Z])/g, "_$1").toUpperCase()}
                    </span>
                    {value ? (
                      <span className="text-green-400 text-xs font-mono truncate max-w-xs">{String(value)}</span>
                    ) : (
                      <span className="text-zinc-500 text-xs">not set</span>
                    )}
                  </div>
                ))}
              <Separator className="my-3" />
              <p className="text-xs text-muted-foreground">
                Set these environment variables via the Secrets panel to enable Go microservice proxying.
                When not set, the PWA uses its built-in implementations.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
