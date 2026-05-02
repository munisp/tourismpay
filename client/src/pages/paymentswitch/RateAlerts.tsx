// @ts-nocheck
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import {
  Bell,
  BellOff,
  Bitcoin,
  CheckCircle2,
  Clock,
  Mail,
  MessageSquare,
  Plus,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Trash2,
  X,
} from 'lucide-react';

export default function RateAlerts() {
  const [showCreateForm, setShowCreateForm] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Rate Alerts</h1>
            <p className="text-muted-foreground">
              Get notified when exchange rates reach your target values
            </p>
          </div>
          <Button onClick={() => setShowCreateForm(!showCreateForm)} size="lg">
            {showCreateForm ? (
              <>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Create Alert
              </>
            )}
          </Button>
        </div>

        {/* Create Alert Form */}
        {showCreateForm && <CreateAlertForm onSuccess={() => setShowCreateForm(false)} />}

        {/* Active Alerts */}
        <ActiveAlerts />

        {/* Alert History */}
        <AlertHistory />
      </div>
    </div>
  );
}

/**
 * Create Alert Form Component
 */
function CreateAlertForm({ onSuccess }: { onSuccess: () => void }) {
  const [fromCurrency, setFromCurrency] = useState<'BTC' | 'ETH' | 'USDC' | 'USDT'>('USDC');
  const [targetRate, setTargetRate] = useState('');
  const [condition, setCondition] = useState<'above' | 'below' | 'exact'>('above');
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  const [notifyPush, setNotifyPush] = useState(true);

  const utils = trpc.useUtils();
  const createAlert = trpc.rateAlerts.create.useMutation({
    onSuccess: () => {
      toast.success('Rate alert created successfully!');
      utils.rateAlerts.list.invalidate();
      onSuccess();
    },
    onError: (error) => {
      toast.error(`Failed to create alert: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAlert.mutate({
      fromCurrency,
      toCurrency: 'NGN',
      targetRate: parseFloat(targetRate),
      condition,
      notifyEmail,
      notifySms,
      notifyPush,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Create New Rate Alert
        </CardTitle>
        <CardDescription>
          Set your target rate and we'll notify you when it's reached
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Currency Selection */}
            <div className="space-y-2">
              <Label>Cryptocurrency</Label>
              <Select value={fromCurrency} onValueChange={(v: any) => setFromCurrency(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BTC">Bitcoin (BTC)</SelectItem>
                  <SelectItem value="ETH">Ethereum (ETH)</SelectItem>
                  <SelectItem value="USDC">USD Coin (USDC)</SelectItem>
                  <SelectItem value="USDT">Tether (USDT)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Target Rate */}
            <div className="space-y-2">
              <Label>Target Rate (NGN)</Label>
              <Input
                type="number"
                step="0.01"
                value={targetRate}
                onChange={(e) => setTargetRate(e.target.value)}
                placeholder="1650.00"
                required
              />
            </div>
          </div>

          {/* Condition */}
          <div className="space-y-2">
            <Label>Alert Condition</Label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'above', label: 'Above', icon: TrendingUp, color: 'text-green-600' },
                { value: 'below', label: 'Below', icon: TrendingDown, color: 'text-red-600' },
                { value: 'exact', label: 'Exact', icon: CheckCircle2, color: 'text-blue-600' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCondition(opt.value as any)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    condition === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <opt.icon className={`w-6 h-6 mx-auto mb-2 ${opt.color}`} />
                  <p className="font-semibold text-sm">{opt.label}</p>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Notification Preferences */}
          <div className="space-y-4">
            <Label>Notification Methods</Label>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="font-semibold text-sm">Email</p>
                    <p className="text-xs text-muted-foreground">Receive email notifications</p>
                  </div>
                </div>
                <Switch checked={notifyEmail} onCheckedChange={setNotifyEmail} />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-semibold text-sm">SMS</p>
                    <p className="text-xs text-muted-foreground">Receive text messages</p>
                  </div>
                </div>
                <Switch checked={notifySms} onCheckedChange={setNotifySms} />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-purple-600" />
                  <div>
                    <p className="font-semibold text-sm">Push Notification</p>
                    <p className="text-xs text-muted-foreground">Receive push notifications</p>
                  </div>
                </div>
                <Switch checked={notifyPush} onCheckedChange={setNotifyPush} />
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={createAlert.isPending}>
            {createAlert.isPending ? 'Creating...' : 'Create Alert'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Active Alerts Component
 */
function ActiveAlerts() {
  const { data: alerts, isLoading } = trpc.rateAlerts.list.useQuery();
  const utils = trpc.useUtils();

  const deleteAlert = trpc.rateAlerts.delete.useMutation({
    onSuccess: () => {
      toast.success('Alert deleted successfully');
      utils.rateAlerts.list.invalidate();
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-muted-foreground">Loading alerts...</p>
        </CardContent>
      </Card>
    );
  }

  const activeAlerts = (alerts?.alerts ?? []).filter((a: any) => a.status === 'active');

  if (activeAlerts.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <BellOff className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-semibold mb-2">No Active Alerts</p>
          <p className="text-muted-foreground">Create an alert to get notified when rates change</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Active Alerts ({activeAlerts.length})
        </CardTitle>
        <CardDescription>Your currently monitored exchange rates</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeAlerts.map((alert) => (
          <div key={alert.id} className="p-4 border rounded-lg space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Bitcoin className="w-5 h-5 text-orange-500" />
                  <span className="font-semibold text-lg">
                    {alert.fromCurrency}/{alert.toCurrency}
                  </span>
                  <Badge variant={alert.condition === 'above' ? 'default' : 'secondary'}>
                    {alert.condition}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Target: ₦{parseFloat(alert.targetRate).toLocaleString()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteAlert.mutate({ alertId: alert.id })}
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </div>

            {/* Progress Bar */}
            {alert.currentRate && alert.progressPercentage !== undefined && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Current Rate:</span>
                  <span className="font-semibold">₦{alert.currentRate.toLocaleString()}</span>
                </div>
                <Progress value={alert.progressPercentage} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{alert.progressPercentage}% to target</span>
                  <span>
                    {alert.distanceFromTarget && alert.distanceFromTarget > 0
                      ? `₦${Math.abs(alert.distanceFromTarget).toLocaleString()} away`
                      : 'Target reached!'}
                  </span>
                </div>
              </div>
            )}

            {/* Notification Methods */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <span className="text-xs text-muted-foreground">Notify via:</span>
              {alert.notifyEmail && <Mail className="w-4 h-4 text-blue-600" />}
              {alert.notifySms && <MessageSquare className="w-4 h-4 text-green-600" />}
              {alert.notifyPush && <Smartphone className="w-4 h-4 text-purple-600" />}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Alert History Component
 */
function AlertHistory() {
  const { data: history, isLoading } = trpc.rateAlerts.history.useQuery({ limit: 10 });

  const historyItems = history?.items ?? [];
  if (isLoading || historyItems.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Recent Alert History
        </CardTitle>
        <CardDescription>Previously triggered alerts</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {historyItems.map((item: any) => (
          <div key={item.id} className="p-3 border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="font-semibold">
                  {item.fromCurrency}/{item.toCurrency}
                </span>
              </div>
              <Badge variant="outline">{item.notificationStatus}</Badge>
            </div>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Target:</span>
                <span>₦{parseFloat(item.targetRate).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Triggered at:</span>
                <span>₦{parseFloat(item.triggeredRate).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date:</span>
                <span>{new Date(item.triggeredAt).toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
