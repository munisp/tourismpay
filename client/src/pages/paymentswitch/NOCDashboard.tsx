// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Activity,
  Users,
  BarChart3,
  CreditCard,
  Building2,
  Settings,
  FileText,
  Shield,
  AlertTriangle,
  Bell,
  Search,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  Globe,
  UserCheck,
  ClipboardList,
  TestTube,
  Timer,
  Copy,
  Sliders,
  UserCog,
  Wallet,
  AlertOctagon,
  FileBarChart,
  Code,
  LogOut,
  Power,
  PowerOff,
  Play,
  Pause
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const sidebarItems = [
  { icon: Activity, label: 'NOC Dashboard', active: true },
  { icon: Users, label: 'User Journeys' },
  { icon: BarChart3, label: 'Journey Analytics' },
  { icon: CreditCard, label: 'Transactions' },
  { icon: Building2, label: 'Participants' },
  { icon: Settings, label: 'Provisioning Admin' },
  { icon: ClipboardList, label: 'Onboarding', badge: 5 },
  { icon: UserCheck, label: 'KYB Verification', badge: 3 },
  { icon: Shield, label: 'KYC Verification', badge: 4 },
  { icon: FileText, label: 'Apply' },
  { icon: UserCheck, label: 'KYC Portal' },
  { icon: Users, label: 'Bulk Onboarding' },
  { icon: TestTube, label: 'Integration Testing' },
  { icon: Timer, label: 'SLA Tracking', badge: 3 },
  { icon: Copy, label: 'Template Cloning' },
  { icon: Sliders, label: 'Reviewer Rules' },
  { icon: UserCog, label: 'User Management' },
  { icon: Wallet, label: 'Settlements', badge: 3 },
  { icon: AlertOctagon, label: 'Fraud & Risk', badge: 12 },
  { icon: FileBarChart, label: 'Reports' },
  { icon: Code, label: 'Developer Portal' },
  { icon: Bell, label: 'Alerts', badge: 5 },
  { icon: Settings, label: 'Settings' },
];


export default function NOCDashboard() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // ── Live tRPC queries ──────────────────────────────────────────────────────
  const { data: health, isLoading: healthLoading, refetch: refetchHealth } =
    trpc.nocDashboard.systemHealth.useQuery(undefined, { refetchInterval: 30_000 });

  const { data: hourlyData, isLoading: hourlyLoading } =
    trpc.nocDashboard.hourlyVolume.useQuery(undefined, { refetchInterval: 60_000 });

  const { data: participantHealth, isLoading: participantsLoading } =
    trpc.paymentSwitch.participantHealth.useQuery(undefined, { refetchInterval: 30_000 });

  const { data: liveKillSwitches, isLoading: ksLoading, refetch: refetchKs } =
    trpc.killSwitch.list.useQuery(undefined, { refetchInterval: 30_000 });

  const { data: recentEvents, isLoading: eventsLoading, refetch: refetchEvents } =
    trpc.nocDashboard.recentEvents.useQuery({ limit: 20 }, { refetchInterval: 15_000 });

  const { data: remittanceList } =
    trpc.paymentSwitch.listRemittances.useQuery({ limit: 10 }, { refetchInterval: 30_000 });

  // ── Derived stats from live health data ───────────────────────────────────
  const stats = useMemo(() => {
    if (!health) return { tps: 0, successRate: 100, avgLatency: 0, todayVolume: 0 };
    return {
      tps: health.remittances.processing,
      successRate: Number(health.remittances.successRate ?? 100),
      avgLatency: health.participants.avgHealth > 0 ? Math.round(100 - health.participants.avgHealth * 0.4 + 20) : 0,
      todayVolume: health.remittances.total,
    };
  }, [health]);

  // ── Chart data derived from hourly volume ─────────────────────────────────
  const tpsData = useMemo(() => {
    if (!hourlyData || hourlyData.length === 0) {
      const now = Date.now();
      return Array.from({ length: 12 }, (_, i) => ({
        time: new Date(now - (11 - i) * 3_600_000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        tps: 0,
      }));
    }
    return hourlyData.map((r) => ({
      time: new Date(r.hour).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      tps: r.count,
    }));
  }, [hourlyData]);

  const performanceData = useMemo(() => {
    const liveSuccessRate = Number(health?.remittances?.successRate ?? 100);
    const avgHealth = Number(health?.participants?.avgHealth ?? 100);
    // Derive a synthetic latency estimate: lower health score → higher latency
    const estimatedLatency = avgHealth > 0 ? Math.round(20 + (100 - avgHealth) * 2) : 40;
    if (!hourlyData || hourlyData.length === 0) {
      return tpsData.map((d) => ({ ...d, successRate: liveSuccessRate, latency: estimatedLatency }));
    }
    return hourlyData.map((r) => ({
      time: new Date(r.hour).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      successRate: liveSuccessRate,
      latency: estimatedLatency,
    }));
  }, [hourlyData, tpsData, health]);

  const isGlobalHaltActive = health?.killSwitch?.isActive ?? false;

  // ── Alert Thresholds ─────────────────────────────────────────────────────
  const [showThresholdSettings, setShowThresholdSettings] = useState(false);
  const { data: thresholds, refetch: refetchThresholds } =
    trpc.nocDashboard.getThresholds.useQuery(undefined, { refetchInterval: 0 });
  const updateThresholdMutation = trpc.nocDashboard.updateThreshold.useMutation({
    onSuccess: () => { toast.success('Threshold updated'); refetchThresholds(); },
    onError: (e: any) => toast.error(e.message),
  });
  const resetThresholdsMutation = trpc.nocDashboard.resetThresholds.useMutation({
    onSuccess: () => { toast.success('Thresholds reset to defaults'); refetchThresholds(); },
    onError: (e: any) => toast.error(e.message),
  });
  const getAlertLevel = (metric: string, value: number): 'normal' | 'warn' | 'critical' => {
    if (!thresholds) return 'normal';
    const t = (thresholds as any[]).find((th) => th.metric === metric);
    if (!t) return 'normal';
    const warnMin = t.warnMin != null ? Number(t.warnMin) : null;
    const warnMax = t.warnMax != null ? Number(t.warnMax) : null;
    const critMin = t.critMin != null ? Number(t.critMin) : null;
    const critMax = t.critMax != null ? Number(t.critMax) : null;
    if ((critMax != null && value > critMax) || (critMin != null && value < critMin)) return 'critical';
    if ((warnMax != null && value > warnMax) || (warnMin != null && value < warnMin)) return 'warn';
    return 'normal';
  };
  const alertCardClass = (level: 'normal' | 'warn' | 'critical') => {
    if (level === 'critical') return 'border-2 border-red-500 bg-red-50';
    if (level === 'warn') return 'border-2 border-amber-400 bg-amber-50';
    return '';
  };

  // ── Mutations ──────────────────────────────────────────────────────────────
  const activateKsMutation = trpc.killSwitch.activate.useMutation({
    onSuccess: () => { toast.warning('Kill switch activated'); refetchKs(); refetchEvents(); },
    onError: (e) => toast.error(e.message),
  });
  const deactivateKsMutation = trpc.killSwitch.deactivate.useMutation({
    onSuccess: () => { toast.success('Kill switch deactivated'); refetchKs(); refetchEvents(); },
    onError: (e) => toast.error(e.message),
  });
  const globalHaltMutation = trpc.nocDashboard.killSwitch.useMutation({
    onSuccess: () => { toast.error('Global transaction halt activated!'); refetchHealth(); refetchKs(); },
    onError: (e) => toast.error(e.message),
  });
  const handleKillSwitchToggle = (ks: any) => {
    if (ks.isActive) {
      deactivateKsMutation.mutate({ id: ks.id, reason: 'Deactivated from NOC Dashboard' });
    } else {
      activateKsMutation.mutate({ id: ks.id, reason: 'Activated from NOC Dashboard', actorName: 'NOC Operator' });
    }
  };
  const handleGlobalHalt = () => {
    globalHaltMutation.mutate({ activate: true, reason: 'Emergency global halt from NOC Dashboard' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'degraded': return 'bg-yellow-500';
      case 'down': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getTransactionStatusBadge = (status: string) => {
    switch (status) {
      case 'COMMITTED':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">COMMITTED</Badge>;
      case 'FAILED':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">FAILED</Badge>;
      case 'RESERVED':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">RESERVED</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <h1 className="text-xl font-bold">
            <span className="text-cyan-400">Payment</span>Switch
          </h1>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {sidebarItems.map((item, index) => (
              <li key={index}>
                <button
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    item.active
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && (
                    <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-cyan-600 rounded-full flex items-center justify-center text-sm font-medium">
              AD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Admin User</p>
              <p className="text-xs text-slate-400 truncate">admin@payment-switch.com</p>
            </div>
            <button className="text-slate-400 hover:text-white">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
          <h1 className="text-xl font-semibold text-slate-900">NOC Operations Dashboard</h1>
          <div className="flex-1 max-w-xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search transactions, participants, alerts..."
                className="pl-10 pr-12 bg-slate-50 border-slate-200"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                ⌘K
              </kbd>
            </div>
          </div>
          <button className="p-2 text-slate-500 hover:text-slate-700" onClick={() => setShowThresholdSettings(true)} title="Alert Threshold Settings">
            <Settings className="w-5 h-5" />
          </button>
          <button className="p-2 text-slate-500 hover:text-slate-700 relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              5
            </span>
          </button>
          <button className="flex items-center gap-2 p-2 text-slate-700">
            <div className="w-8 h-8 bg-cyan-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
              AD
            </div>
            <ChevronDown className="w-4 h-4" />
          </button>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Card className={alertCardClass(getAlertLevel('tps', stats.tps))}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">Transactions Per Second</p>
                  <Zap className="w-5 h-5 text-cyan-500" />
                </div>
                <p className="text-3xl font-bold text-slate-900 mt-2">{healthLoading ? '—' : stats.tps}</p>
                {getAlertLevel('tps', stats.tps) !== 'normal' && (
                  <p className={`text-xs mt-1 font-medium ${getAlertLevel('tps', stats.tps) === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>
                    {getAlertLevel('tps', stats.tps) === 'critical' ? '⚠ Critical threshold breached' : '⚠ Warning threshold breached'}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className={alertCardClass(getAlertLevel('successRate', stats.successRate))}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">Success Rate</p>
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
                <p className="text-3xl font-bold text-slate-900 mt-2">{healthLoading ? '—' : `${Number(stats.successRate).toFixed(1)}%`}</p>
                {getAlertLevel('successRate', stats.successRate) !== 'normal' && (
                  <p className={`text-xs mt-1 font-medium ${getAlertLevel('successRate', stats.successRate) === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>
                    {getAlertLevel('successRate', stats.successRate) === 'critical' ? '⚠ Critical threshold breached' : '⚠ Warning threshold breached'}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className={alertCardClass(getAlertLevel('avgLatency', stats.avgLatency))}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">Avg Latency</p>
                  <Clock className="w-5 h-5 text-blue-500" />
                </div>
                <p className="text-3xl font-bold text-slate-900 mt-2">{healthLoading ? '—' : `${stats.avgLatency}ms`}</p>
                {getAlertLevel('avgLatency', stats.avgLatency) !== 'normal' && (
                  <p className={`text-xs mt-1 font-medium ${getAlertLevel('avgLatency', stats.avgLatency) === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>
                    {getAlertLevel('avgLatency', stats.avgLatency) === 'critical' ? '⚠ Critical threshold breached' : '⚠ Warning threshold breached'}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className={alertCardClass(getAlertLevel('todayVolume', stats.todayVolume))}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">Today's Volume</p>
                  <CreditCard className="w-5 h-5 text-purple-500" />
                </div>
                <p className="text-3xl font-bold text-slate-900 mt-2">{healthLoading ? '—' : stats.todayVolume.toLocaleString()}</p>
                {getAlertLevel('todayVolume', stats.todayVolume) !== 'normal' && (
                  <p className={`text-xs mt-1 font-medium ${getAlertLevel('todayVolume', stats.todayVolume) === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>
                    {getAlertLevel('todayVolume', stats.todayVolume) === 'critical' ? '⚠ Critical threshold breached' : '⚠ Warning threshold breached'}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Transaction Rate (TPS)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tpsData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <Tooltip />
                      <Line type="monotone" dataKey="tps" stroke="#06b6d4" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={performanceData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <Tooltip />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="successRate" name="Success Rate (%)" stroke="#22c55e" strokeWidth={2} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="latency" name="Latency (ms)" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Participant Health */}
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">Participant Health</CardTitle>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-slate-500">Healthy</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-yellow-500" />
                    <span className="text-slate-500">Degraded</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-slate-500">Down</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-6 gap-3">
                {participantsLoading && (
                  <div className="col-span-6 flex items-center justify-center py-8 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading participants...
                  </div>
                )}
                {!participantsLoading && (!participantHealth || participantHealth.length === 0) && (
                  <div className="col-span-6 text-center py-8 text-slate-400 text-sm">No participants found</div>
                )}
                {(participantHealth ?? []).map((p: any, index: number) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${
                      p.status === 'down' ? 'bg-red-50 border-red-200' :
                      p.status === 'degraded' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm text-slate-900">{p.name ?? p.participantId}</span>
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(p.status)}`} />
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Health:</span>
                        <span className="font-medium">{p.healthScore ?? p.tps ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Success:</span>
                        <span className={`font-medium ${(p.successRate ?? p.success ?? 100) < 99 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {Number(p.successRate ?? p.success ?? 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Remittances:</span>
                        <span className="font-medium text-slate-900">{p.remittanceCount ?? 0}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Kill Switches and Emergency Controls */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    <CardTitle className="text-base font-medium">Kill Switches</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                    {(liveKillSwitches ?? []).filter((k: any) => k.isActive).length} Active
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {ksLoading && (
                    <div className="flex items-center justify-center py-6 text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
                    </div>
                  )}
                  {!ksLoading && (!liveKillSwitches || liveKillSwitches.length === 0) && (
                    <div className="text-center py-6 text-slate-400 text-sm">No kill switches configured</div>
                  )}
                  {(liveKillSwitches ?? []).map((ks: any) => (
                    <div
                      key={ks.id}
                      className={`p-3 rounded-lg border ${
                        ks.isActive ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {ks.isActive ? (
                            <Power className="w-5 h-5 text-yellow-600" />
                          ) : (
                            <PowerOff className="w-5 h-5 text-slate-400" />
                          )}
                          <div>
                            <p className="font-medium text-sm text-slate-900">{ks.name ?? ks.corridor}</p>
                            <p className="text-xs text-slate-500">{ks.switchType ?? ks.type} – {ks.targetId ?? ks.corridor}</p>
                            {ks.isActive && ks.activatedAt && (
                              <p className="text-xs text-yellow-600 mt-1">
                                Activated {new Date(ks.activatedAt).toLocaleString()} by {ks.actorName ?? 'system'}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={ks.isActive ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-600'}>
                            {ks.isActive ? 'ACTIVE' : 'INACTIVE'}
                          </Badge>
                          <Button
                            size="sm"
                            variant={ks.isActive ? 'outline' : 'default'}
                            className={ks.isActive ? 'border-yellow-300 text-yellow-700 hover:bg-yellow-100' : 'bg-green-600 hover:bg-green-700'}
                            onClick={() => handleKillSwitchToggle(ks)}
                            disabled={activateKsMutation.isPending || deactivateKsMutation.isPending}
                          >
                            {ks.isActive ? (
                              <>
                                <Pause className="w-3 h-3 mr-1" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 mr-1" />
                                Activate
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="w-5 h-5 text-red-500" />
                  <CardTitle className="text-base font-medium">Emergency Controls</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                    onClick={handleGlobalHalt}
                    disabled={isGlobalHaltActive || globalHaltMutation.isPending}
                  >
                    {globalHaltMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Power className="w-4 h-4 mr-2" />}
                    {isGlobalHaltActive ? 'Halt Active' : 'Global Halt'}
                  </Button>
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    disabled={!isGlobalHaltActive || globalHaltMutation.isPending}
                    onClick={() => globalHaltMutation.mutate({ activate: false, reason: 'Resume from NOC Dashboard' })}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Resume All
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">Recent Transactions</CardTitle>
                <Button variant="link" className="text-cyan-600 p-0 h-auto">
                  View All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transfer ID</TableHead>
                    <TableHead>Payer</TableHead>
                    <TableHead>Payee</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Latency</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!remittanceList?.items || remittanceList.items.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-slate-400 text-sm">
                        No recent remittances
                      </TableCell>
                    </TableRow>
                  )}
                  {(remittanceList?.items ?? []).map((txn: any) => (
                    <TableRow key={txn.id}>
                      <TableCell className="font-mono text-sm text-cyan-600">{txn.referenceId ?? txn.id}</TableCell>
                      <TableCell>{txn.senderName ?? txn.senderId ?? '—'}</TableCell>
                      <TableCell>{txn.receiverName ?? txn.receiverId ?? '—'}</TableCell>
                      <TableCell>{txn.currency ?? ''} {Number(txn.amount ?? 0).toLocaleString()}</TableCell>
                      <TableCell>{getTransactionStatusBadge(txn.status)}</TableCell>
                      <TableCell className="text-slate-500">{txn.createdAt ? new Date(txn.createdAt).toLocaleString() : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Alert Threshold Settings Dialog */}
      <Dialog open={showThresholdSettings} onOpenChange={setShowThresholdSettings}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Alert Threshold Settings
            </DialogTitle>
            <DialogDescription>
              Configure warning (amber) and critical (red) thresholds for each NOC metric.
              Cards will highlight automatically when live values breach these limits.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            {(!thresholds || (thresholds as any[]).length === 0) && (
              <p className="text-sm text-slate-500 text-center py-4">Loading thresholds…</p>
            )}
            {(thresholds as any[] ?? []).map((t: any) => (
              <ThresholdRow
                key={t.metric}
                threshold={t}
                onSave={(vals) => updateThresholdMutation.mutate({ metric: t.metric, ...vals })}
                isSaving={updateThresholdMutation.isPending}
              />
            ))}
            <div className="flex justify-end pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => resetThresholdsMutation.mutate()}
                disabled={resetThresholdsMutation.isPending}
              >
                {resetThresholdsMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Reset to Defaults
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Threshold Row sub-component ────────────────────────────────────────────────
function ThresholdRow({ threshold, onSave, isSaving }: {
  threshold: any;
  onSave: (vals: { warnMin?: number | null; warnMax?: number | null; critMin?: number | null; critMax?: number | null }) => void;
  isSaving: boolean;
}) {
  const [warnMin, setWarnMin] = useState(threshold.warnMin != null ? String(threshold.warnMin) : '');
  const [warnMax, setWarnMax] = useState(threshold.warnMax != null ? String(threshold.warnMax) : '');
  const [critMin, setCritMin] = useState(threshold.critMin != null ? String(threshold.critMin) : '');
  const [critMax, setCritMax] = useState(threshold.critMax != null ? String(threshold.critMax) : '');
  const toNum = (s: string) => s.trim() === '' ? null : Number(s);
  const handleSave = () => onSave({ warnMin: toNum(warnMin), warnMax: toNum(warnMax), critMin: toNum(critMin), critMax: toNum(critMax) });
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{threshold.label}</p>
          <p className="text-xs text-slate-500">metric: {threshold.metric} · unit: {threshold.unit || '—'}</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
          Save
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-amber-600 font-semibold">⚠ Warning</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs text-slate-500">Min (below = warn)</Label>
              <Input
                type="number"
                placeholder="—"
                value={warnMin}
                onChange={(e) => setWarnMin(e.target.value)}
                className="h-8 text-sm mt-0.5"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-slate-500">Max (above = warn)</Label>
              <Input
                type="number"
                placeholder="—"
                value={warnMax}
                onChange={(e) => setWarnMax(e.target.value)}
                className="h-8 text-sm mt-0.5"
              />
            </div>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-red-600 font-semibold">⚠ Critical</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs text-slate-500">Min (below = critical)</Label>
              <Input
                type="number"
                placeholder="—"
                value={critMin}
                onChange={(e) => setCritMin(e.target.value)}
                className="h-8 text-sm mt-0.5"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-slate-500">Max (above = critical)</Label>
              <Input
                type="number"
                placeholder="—"
                value={critMax}
                onChange={(e) => setCritMax(e.target.value)}
                className="h-8 text-sm mt-0.5"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
