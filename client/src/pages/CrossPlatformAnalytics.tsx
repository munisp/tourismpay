import { useState } from "react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Activity,
  Shield,
  Wallet,
  Globe,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  BarChart3,
  ArrowUpRight,
  Users,
  QrCode,
  FileCheck,
} from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";

type HealthStatus = "healthy" | "degraded" | "critical";

const statusColor: Record<HealthStatus, string> = {
  healthy: "oklch(0.78 0.22 152)",
  degraded: "oklch(0.82 0.18 75)",
  critical: "oklch(0.62 0.22 25)",
};

const statusBadge: Record<HealthStatus, string> = {
  healthy: "bg-[oklch(0.78_0.22_152)]/10 text-[oklch(0.78_0.22_152)] border-[oklch(0.78_0.22_152)]/30",
  degraded: "bg-[oklch(0.82_0.18_75)]/10 text-[oklch(0.82_0.18_75)] border-[oklch(0.82_0.18_75)]/30",
  critical: "bg-[oklch(0.62_0.22_25)]/10 text-[oklch(0.62_0.22_25)] border-[oklch(0.62_0.22_25)]/30",
};

function PlatformHealthCard({
  name,
  status,
  metrics,
  icon: Icon,
  href,
}: {
  name: string;
  status: HealthStatus;
  metrics: { label: string; value: string | number }[];
  icon: React.ElementType;
  href: string;
}) {
  return (
    <Card className="border border-border/50 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${statusColor[status]}20` }}
            >
              <Icon className="w-4 h-4" style={{ color: statusColor[status] }} />
            </div>
            <CardTitle className="text-base">{name}</CardTitle>
          </div>
          <Badge className={`text-xs border ${statusBadge[status]}`}>
            {status === "healthy" ? (
              <CheckCircle className="w-3 h-3 mr-1" />
            ) : (
              <AlertTriangle className="w-3 h-3 mr-1" />
            )}
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {metrics.map((m) => (
          <div key={m.label} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{m.label}</span>
            <span className="font-medium tabular-nums">{m.value}</span>
          </div>
        ))}
        <a
          href={href}
          className="mt-3 flex items-center gap-1 text-xs text-primary hover:underline"
        >
          View details <ArrowUpRight className="w-3 h-3" />
        </a>
      </CardContent>
    </Card>
  );
}

export default function CrossPlatformAnalytics() {
  const [activeMetric, setActiveMetric] = useState<
    "wallet_volume" | "bis_investigations" | "remittance_volume" | "fraud_alerts"
  >("wallet_volume");

  const { data: summary, isLoading: summaryLoading, refetch } = trpc.analytics.crossPlatform.useQuery(undefined, {
    refetchInterval: 120_000,
  });
  const { data: health, isLoading: healthLoading } = trpc.analytics.platformHealth.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const { data: dauData, isLoading: dauLoading } = trpc.analytics.dauByRole.useQuery(undefined, {
    refetchInterval: 300_000,
  });
  const { data: qrData, isLoading: qrLoading } = trpc.analytics.qrVolume.useQuery(undefined, {
    refetchInterval: 300_000,
  });
  const { data: kybData, isLoading: kybLoading } = trpc.analytics.kybRate.useQuery(undefined, {
    refetchInterval: 300_000,
  });
  const { data: timeSeries, isLoading: tsLoading } = trpc.analytics.timeSeries.useQuery(
    { metric: activeMetric, days: 30 },
    { refetchInterval: 300_000 }
  );

  const isLoading = summaryLoading || healthLoading;

  const formatVolume = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  };

  const formatNumber = (v: number) => v.toLocaleString();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cross-Platform Analytics"
        subtitle="Unified metrics across TourismPay, BIS, and PaymentSwitch — last 30 days"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        }
      />

      {/* Platform Health Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {healthLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
        ) : (
          <>
            <PlatformHealthCard
              name="TourismPay"
              status={(health?.tourismPay.status as HealthStatus) ?? "healthy"}
              icon={Wallet}
              href="/wallet"
              metrics={[
                { label: "Transactions (1h)", value: formatNumber(health?.tourismPay.recentTransactions ?? 0) },
                { label: "Fail rate (1h)", value: `${health?.tourismPay.walletFailRate ?? 0}%` },
              ]}
            />
            <PlatformHealthCard
              name="BIS"
              status={(health?.bis.status as HealthStatus) ?? "healthy"}
              icon={Shield}
              href="/bis"
              metrics={[
                { label: "Unresolved critical fraud", value: health?.bis.unresolvedCriticalFraud ?? 0 },
                { label: "Stuck investigations", value: health?.bis.stuckInvestigations ?? 0 },
              ]}
            />
            <PlatformHealthCard
              name="PaymentSwitch"
              status={(health?.paymentSwitch.status as HealthStatus) ?? "healthy"}
              icon={Globe}
              href="/paymentswitch/noc"
              metrics={[
                { label: "Remittances (30d)", value: formatNumber(summary?.paymentSwitch.remittances.total ?? 0) },
                { label: "Settlements (30d)", value: formatNumber(summary?.paymentSwitch.settlements.total ?? 0) },
              ]}
            />
          </>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <StatCard
              label="Wallet Volume (30d)"
              value={formatVolume(summary?.tourismPay.wallet.totalVolume ?? 0)}
              unit={`${formatNumber(summary?.tourismPay.wallet.totalTransactions ?? 0)} txns`}
              icon={TrendingUp}
              color="green"
            />
            <StatCard
              label="Wallet Completed"
              value={`${summary?.tourismPay.wallet.totalTransactions ? Math.round((summary.tourismPay.wallet.completed / summary.tourismPay.wallet.totalTransactions) * 100) : 0}%`}
              unit={`${formatNumber(summary?.tourismPay.wallet.completed ?? 0)} completed`}
              icon={CheckCircle}
              color="blue"
            />
            <StatCard
              label="BIS Investigations"
              value={formatNumber(summary?.bis.investigations.total ?? 0)}
              unit={`${formatNumber(summary?.bis.investigations.flagged ?? 0)} flagged`}
              icon={Shield}
              color="amber"
            />
            <StatCard
              label="Avg Risk Score"
              value={`${Math.round(summary?.bis.investigations.avgRiskScore ?? 0)}`}
              unit="BIS investigations"
              icon={Activity}
              color="muted"
            />
            <StatCard
              label="Fraud Alerts"
              value={formatNumber(summary?.bis.fraud.total ?? 0)}
              unit={`${formatNumber(summary?.bis.fraud.critical ?? 0)} critical`}
              icon={AlertTriangle}
              color="crimson"
            />
            <StatCard
              label="Fraud Resolved"
              value={`${summary?.bis.fraud.total ? Math.round((summary.bis.fraud.resolved / summary.bis.fraud.total) * 100) : 0}%`}
              unit={`${formatNumber(summary?.bis.fraud.resolved ?? 0)} resolved`}
              icon={CheckCircle}
              color="green"
            />
            <StatCard
              label="Remittance Volume"
              value={formatVolume(summary?.paymentSwitch.remittances.totalVolume ?? 0)}
              unit={`${formatNumber(summary?.paymentSwitch.remittances.total ?? 0)} transfers`}
              icon={Globe}
              color="blue"
            />
            <StatCard
              label="Settled Amount"
              value={formatVolume(summary?.paymentSwitch.settlements.totalSettled ?? 0)}
              unit={`${formatNumber(summary?.paymentSwitch.settlements.total ?? 0)} settlements`}
              icon={BarChart3}
              color="green"
            />
          </>
        )}
      </div>

      {/* Time-Series Charts */}
      <Card className="border border-border/50 bg-card/60 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Time-Series Trends</CardTitle>
          <CardDescription>Daily activity over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeMetric}
            onValueChange={(v) => setActiveMetric(v as typeof activeMetric)}
            className="space-y-4"
          >
            <TabsList className="grid grid-cols-4 w-full max-w-lg">
              <TabsTrigger value="wallet_volume">Wallet</TabsTrigger>
              <TabsTrigger value="bis_investigations">BIS</TabsTrigger>
              <TabsTrigger value="remittance_volume">Remittance</TabsTrigger>
              <TabsTrigger value="fraud_alerts">Fraud</TabsTrigger>
            </TabsList>

            <TabsContent value="wallet_volume">
              {tsLoading ? (
                <Skeleton className="h-64 w-full rounded-xl" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={timeSeries?.data ?? []}>
                    <defs>
                      <linearGradient id="walletGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.78 0.22 152)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="oklch(0.78 0.22 152)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0 / 0.2)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                    <Tooltip
                      formatter={(v: number) => [`$${v.toLocaleString()}`, "Volume"]}
                      labelFormatter={(l) => `Date: ${l}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="volume"
                      stroke="oklch(0.78 0.22 152)"
                      fill="url(#walletGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </TabsContent>

            <TabsContent value="bis_investigations">
              {tsLoading ? (
                <Skeleton className="h-64 w-full rounded-xl" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={timeSeries?.data ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0 / 0.2)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={(l) => `Date: ${l}`} />
                    <Legend />
                    <Bar dataKey="total" name="Total" fill="oklch(0.65 0.18 230)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="flagged" name="Flagged" fill="oklch(0.62 0.22 25)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </TabsContent>

            <TabsContent value="remittance_volume">
              {tsLoading ? (
                <Skeleton className="h-64 w-full rounded-xl" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={timeSeries?.data ?? []}>
                    <defs>
                      <linearGradient id="remitGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.65 0.18 230)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="oklch(0.65 0.18 230)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0 / 0.2)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                    <Tooltip
                      formatter={(v: number) => [`$${v.toLocaleString()}`, "Volume"]}
                      labelFormatter={(l) => `Date: ${l}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="volume"
                      stroke="oklch(0.65 0.18 230)"
                      fill="url(#remitGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </TabsContent>

            <TabsContent value="fraud_alerts">
              {tsLoading ? (
                <Skeleton className="h-64 w-full rounded-xl" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={timeSeries?.data ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0 / 0.2)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={(l) => `Date: ${l}`} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Total Alerts"
                      stroke="oklch(0.82 0.18 75)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="critical"
                      name="Critical"
                      stroke="oklch(0.62 0.22 25)"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="4 2"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Loyalty Stats */}
      <Card className="border border-border/50 bg-card/60 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Loyalty Programme</CardTitle>
          <CardDescription>Points activity across TourismPay — last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-xl bg-muted/30">
              <div className="text-2xl font-bold tabular-nums">
                {isLoading ? <Skeleton className="h-8 w-20 mx-auto" /> : formatNumber(summary?.tourismPay.loyalty.pointsEarned ?? 0)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Points Earned</div>
            </div>
            <div className="text-center p-4 rounded-xl bg-muted/30">
              <div className="text-2xl font-bold tabular-nums">
                {isLoading ? <Skeleton className="h-8 w-20 mx-auto" /> : formatNumber(summary?.tourismPay.loyalty.pointsRedeemed ?? 0)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Points Redeemed</div>
            </div>
            <div className="text-center p-4 rounded-xl bg-muted/30">
              <div className="text-2xl font-bold tabular-nums">
                {isLoading ? <Skeleton className="h-8 w-20 mx-auto" /> : formatNumber(summary?.tourismPay.loyalty.transactions ?? 0)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Loyalty Transactions</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DAU by Role / QR Volume / KYB Rate */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* DAU by Role */}
        <Card className="border border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> DAU by Role (24h)</CardTitle>
            <CardDescription>Active users in the last 24 hours</CardDescription>
          </CardHeader>
          <CardContent>
            {dauLoading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : (
              <div className="space-y-2">
                <div className="text-2xl font-bold tabular-nums mb-3">
                  {dauData?.total ?? 0} <span className="text-sm font-normal text-muted-foreground">active users</span>
                </div>
                {(dauData?.chartData ?? []).filter((d) => d.count > 0).map((d) => (
                  <div key={d.role} className="flex items-center gap-2">
                    <div className="w-28 text-xs text-muted-foreground capitalize truncate">{d.role.replace(/_/g, ' ')}</div>
                    <div className="flex-1 bg-muted/30 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${dauData?.total ? (d.count / dauData.total) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="w-6 text-xs text-right tabular-nums">{d.count}</div>
                  </div>
                ))}
                {(dauData?.total ?? 0) === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No logins in the last 24h</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* QR Payment Volume */}
        <Card className="border border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><QrCode className="w-4 h-4 text-primary" /> QR Payment Volume (30d)</CardTitle>
            <CardDescription>Tourist QR payment activity</CardDescription>
          </CardHeader>
          <CardContent>
            {qrLoading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-muted/30 text-center">
                  <div className="text-xl font-bold tabular-nums">{qrData?.total ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Generated</div>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 text-center">
                  <div className="text-xl font-bold tabular-nums text-emerald-400">{qrData?.paid ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Paid</div>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 text-center">
                  <div className="text-xl font-bold tabular-nums">{qrData?.conversionRate ?? 0}%</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Conversion</div>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 text-center">
                  <div className="text-xl font-bold tabular-nums">{formatVolume(qrData?.totalAmountUsd ?? 0)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Volume</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* KYB Approval Rate */}
        <Card className="border border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><FileCheck className="w-4 h-4 text-primary" /> KYB Approval Rate (30d)</CardTitle>
            <CardDescription>Merchant KYB application outcomes</CardDescription>
          </CardHeader>
          <CardContent>
            {kybLoading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-3xl font-bold tabular-nums text-emerald-400">{kybData?.approvalRate ?? 0}%</div>
                  <div className="text-xs text-muted-foreground text-right">
                    <div>{kybData?.total ?? 0} total</div>
                    <div>{kybData?.approved ?? 0} approved</div>
                  </div>
                </div>
                {kybData && kybData.total > 0 && (
                  <ResponsiveContainer width="100%" height={100}>
                    <PieChart>
                      <Pie data={kybData.chartData} cx="50%" cy="50%" innerRadius={28} outerRadius={45} dataKey="count" paddingAngle={2}>
                        {kybData.chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip formatter={(v: number, name: string) => [v, name]} contentStyle={{ background: 'oklch(0.18 0.02 240)', border: '1px solid oklch(0.3 0 0)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                {(kybData?.total ?? 0) === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No KYB applications in the last 30d</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Last updated */}
      {summary && (
        <p className="text-xs text-muted-foreground text-right">
          Last updated: {new Date(summary.generatedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
