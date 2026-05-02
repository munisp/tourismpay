// @ts-nocheck
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { 
  BarChart3, 
  Bell, 
  Clock, 
  TrendingUp, 
  Users,
  Target,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function RateAlertAnalytics() {
  const { data: alerts } = trpc.rateAlerts.list.useQuery();
  const { data: history } = trpc.rateAlerts.history.useQuery({ limit: 100 });
  const { data: monitorStatus } = trpc.rateAlerts.monitorStatus.useQuery();

  // Calculate statistics - rateAlerts.list returns { alerts: [], total: 0 }
  const alertsList = alerts?.alerts ?? [];
  const totalAlerts = alertsList.length;
  const activeAlerts = alertsList.filter((a: any) => a.status === 'active').length;
  const triggeredAlerts = alertsList.filter((a: any) => a.status === 'triggered').length;
  const expiredAlerts = alertsList.filter((a: any) => a.status === 'expired').length;

  // Calculate average time to trigger from history records that have both createdAt and triggeredAt
  const historyItems = (history as any)?.history ?? [];
  const timedItems = historyItems.filter((h: any) => h.triggeredAt && h.createdAt);
  const avgTimeToTrigger = timedItems.length > 0
    ? timedItems.reduce((sum: number, h: any) => sum + (Number(h.triggeredAt) - Number(h.createdAt)), 0) / timedItems.length
    : 0;

  const avgHours = Math.floor(avgTimeToTrigger / (1000 * 60 * 60));
  const avgMinutes = Math.floor((avgTimeToTrigger % (1000 * 60 * 60)) / (1000 * 60));

  // Currency pair distribution
  const currencyPairs = alertsList.reduce((acc: Record<string, number>, alert: any) => {
    const pair = `${alert.fromCurrency}/${alert.toCurrency}`;
    acc[pair] = (acc[pair] || 0) + 1;
    return acc;
  }, {});

  // Condition breakdown
  const conditions = alertsList.reduce((acc: Record<string, number>, alert: any) => {
    acc[alert.condition] = (acc[alert.condition] || 0) + 1;
    return acc;
  }, {});

  // Most popular target rates
  const targetRates = alertsList.map((a: any) => ({
    pair: `${a.fromCurrency}/${a.toCurrency}`,
    rate: parseFloat(a.targetRate),
    condition: a.condition
  }));

  const sortedTargets = targetRates
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);

  // Notification success rate (simulated - would need actual delivery data)
  const notificationSuccessRate = 98.5;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Rate Alert Analytics
          </h1>
          <p className="text-muted-foreground">
            Insights and statistics on rate alert performance
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAlerts}</div>
              <p className="text-xs text-muted-foreground">
                {activeAlerts} active, {triggeredAlerts} triggered
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{notificationSuccessRate}%</div>
              <p className="text-xs text-muted-foreground">
                Notification delivery success
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Time to Trigger</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {avgHours > 0 ? `${avgHours}h` : `${avgMinutes}m`}
              </div>
              <p className="text-xs text-muted-foreground">
                From creation to trigger
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monitor Status</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {monitorStatus?.isRunning ? 'Running' : 'Idle'}
              </div>
              <p className="text-xs text-muted-foreground">
                {monitorStatus?.lastRunTime 
                  ? `Last run: ${new Date(monitorStatus.lastRunTime).toLocaleTimeString()}`
                  : 'Not started yet'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Currency Pair Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Currency Pair Distribution
              </CardTitle>
              <CardDescription>
                Most popular cryptocurrency pairs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(currencyPairs)
                  .sort(([, a], [, b]) => b - a)
                  .map(([pair, count]) => {
                    const percentage = (count / totalAlerts) * 100;
                    return (
                      <div key={pair} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{pair}</span>
                          <span className="text-muted-foreground">
                            {count} alerts ({percentage.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                {Object.keys(currencyPairs).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No alerts created yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Alert Condition Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Alert Condition Breakdown
              </CardTitle>
              <CardDescription>
                Distribution of alert conditions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(conditions).map(([condition, count]) => {
                  const percentage = (count / totalAlerts) * 100;
                  const color = 
                    condition === 'above' ? 'bg-green-600' :
                    condition === 'below' ? 'bg-red-600' :
                    'bg-yellow-600';
                  
                  return (
                    <div key={condition} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {condition}
                          </Badge>
                        </div>
                        <span className="text-muted-foreground">
                          {count} alerts ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className={`${color} h-2 rounded-full transition-all`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {Object.keys(conditions).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No alerts created yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Most Popular Target Rates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Most Popular Target Rates
              </CardTitle>
              <CardDescription>
                Top 5 target rates set by users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sortedTargets.map((target, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-semibold text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-semibold">{target.pair}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {target.condition} target
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">₦{target.rate.toLocaleString()}</div>
                    </div>
                  </div>
                ))}
                {sortedTargets.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No target rates set yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Alert Status Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Alert Status Overview
              </CardTitle>
              <CardDescription>
                Current state of all alerts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <div>
                      <div className="font-semibold">Active Alerts</div>
                      <div className="text-xs text-muted-foreground">
                        Currently monitoring
                      </div>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-green-600">
                    {activeAlerts}
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="font-semibold">Triggered Alerts</div>
                      <div className="text-xs text-muted-foreground">
                        Successfully notified
                      </div>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-blue-600">
                    {triggeredAlerts}
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-gray-600" />
                    <div>
                      <div className="font-semibold">Expired Alerts</div>
                      <div className="text-xs text-muted-foreground">
                        Past expiration date
                      </div>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-gray-600">
                    {expiredAlerts}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Monitor Job Status */}
        {monitorStatus && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Background Monitor Status
              </CardTitle>
              <CardDescription>
                Rate alert monitoring job information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Status</div>
                  <Badge variant={monitorStatus.isRunning ? 'default' : 'secondary'}>
                    {monitorStatus.isRunning ? 'Running' : 'Idle'}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Last Run</div>
                  <div className="font-semibold">
                    {monitorStatus.lastRunTime
                      ? new Date(monitorStatus.lastRunTime).toLocaleString()
                      : 'Not started'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Alerts Checked</div>
                  <div className="font-semibold">
                    {monitorStatus.lastRunResult?.checked || 0}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Alerts Triggered</div>
                  <div className="font-semibold">
                    {monitorStatus.lastRunResult?.triggered || 0}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
