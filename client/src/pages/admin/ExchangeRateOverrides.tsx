/**
 * ExchangeRateOverrides — Admin panel for managing manual exchange rate overrides.
 *
 * Allows compliance officers to override live API rates for specific currency pairs
 * for a set duration (useful during market volatility or API outages).
 *
 * Route: /admin/exchange-rates
 * Access: admin only
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { RoleGuard } from "@/components/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Plus, RefreshCw, Trash2, Power, PowerOff, AlertTriangle, TrendingUp,
  Clock, Info, Brain, ChevronDown, ChevronUp,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const CURRENCIES = [
  "USD", "EUR", "GBP", "NGN", "KES", "ZAR", "GHS", "TZS", "EGP",
  "MAD", "XOF", "XAF", "UGX", "ETB", "RWF", "MZN", "BWP", "MUR",
];

const DURATION_OPTIONS = [
  { label: "1 hour", value: 1 },
  { label: "4 hours", value: 4 },
  { label: "12 hours", value: 12 },
  { label: "24 hours", value: 24 },
  { label: "48 hours", value: 48 },
  { label: "7 days", value: 168 },
  { label: "30 days", value: 720 },
  { label: "No expiry", value: 0 },
];

function formatRate(rate: number) {
  return rate.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 8 });
}

function formatExpiry(expiresAt: number | null | undefined) {
  if (!expiresAt) return "No expiry";
  const d = new Date(expiresAt);
  const diff = expiresAt - Date.now();
  if (diff < 0) return "Expired";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${d.toLocaleString()} (${h}h ${m}m remaining)`;
}

interface OverrideFormState {
  baseCurrency: string;
  targetCurrency: string;
  rate: string;
  reason: string;
  durationHours: number;
}

const DEFAULT_FORM: OverrideFormState = {
  baseCurrency: "USD",
  targetCurrency: "NGN",
  rate: "",
  reason: "",
  durationHours: 24,
};

export default function ExchangeRateOverrides() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<OverrideFormState>(DEFAULT_FORM);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: overrides = [], isLoading, refetch } = trpc.exchangeRateOverrides.list.useQuery();

  const upsertMut = trpc.exchangeRateOverrides.upsert.useMutation({
    onSuccess: () => {
      toast.success("Exchange rate override saved");
      setShowCreate(false);
      setForm(DEFAULT_FORM);
      utils.exchangeRateOverrides.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deactivateMut = trpc.exchangeRateOverrides.deactivate.useMutation({
    onSuccess: () => {
      toast.success("Override deactivated");
      utils.exchangeRateOverrides.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.exchangeRateOverrides.delete.useMutation({
    onSuccess: () => {
      toast.success("Override deleted");
      setDeleteTarget(null);
      utils.exchangeRateOverrides.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    const rate = parseFloat(form.rate);
    if (isNaN(rate) || rate <= 0) {
      toast.error("Please enter a valid positive rate");
      return;
    }
    if (!form.targetCurrency || form.targetCurrency === form.baseCurrency) {
      toast.error("Base and target currencies must differ");
      return;
    }
    upsertMut.mutate({
      baseCurrency: form.baseCurrency,
      targetCurrency: form.targetCurrency,
      rate,
      reason: form.reason || undefined,
      durationHours: form.durationHours > 0 ? form.durationHours : undefined,
    });
  };

  const checkDeviationMut = trpc.exchangeRates.checkDeviation.useMutation({
    onSuccess: ({ deviations, notified }) => {
      if (deviations.length === 0) {
        toast.success("No significant rate deviations detected (all within 5%)");
      } else {
        toast.warning(
          `${deviations.length} deviation(s) detected${notified ? " — owner notified" : ""}`,
          { duration: 6000 }
        );
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const activeCount = overrides.filter((o) => o.isActive && !o.isExpired).length;
  const expiredCount = overrides.filter((o) => o.isExpired).length;

  // ML Forecast state
  const [showForecast, setShowForecast] = useState(false);
  const [forecastBase, setForecastBase] = useState("USD");
  const [forecastQuote, setForecastQuote] = useState("EUR");
  const [forecastCurrentRate, setForecastCurrentRate] = useState("1.0850");
  const [forecastResult, setForecastResult] = useState<any>(null);

  const forecastMut = trpc.pythonServices.ratesForecast.useMutation({
    onSuccess: (data) => setForecastResult(data),
    onError: (err) => toast.error(`ML forecast failed: ${err.message}`),
  });

  return (
    <RoleGuard roles={["admin"]}>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-primary" />
              Exchange Rate Overrides
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manually override live API rates for specific currency pairs during market volatility or API outages.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => checkDeviationMut.mutate({ thresholdPct: 5 })}
              disabled={checkDeviationMut.isPending}
              title="Check if any live rate has deviated >5% from baseline"
            >
              {checkDeviationMut.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <AlertTriangle className="w-4 h-4 mr-2 text-amber-500" />
              )}
              Check Deviations
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Override
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Total Overrides</p>
              <p className="text-2xl font-bold">{overrides.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-emerald-500">{activeCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Expired</p>
              <p className="text-2xl font-bold text-muted-foreground">{expiredCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Active overrides take precedence over live API rates in the Exchange Rate Indicator and QR payment flow.
            Use with caution — incorrect rates may affect tourist payments.
          </p>
        </div>

        {/* ML Rate Forecast */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" />
                ML Rate Forecast
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => setShowForecast(!showForecast)}
              >
                {showForecast ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showForecast ? "Hide" : "Show"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use the Exchange Rate ML service to forecast where a currency pair is heading before setting an override.
            </p>
          </CardHeader>
          {showForecast && (
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Base Currency</Label>
                  <Select value={forecastBase} onValueChange={setForecastBase}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Quote Currency</Label>
                  <Select value={forecastQuote} onValueChange={setForecastQuote}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Current Rate</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={forecastCurrentRate}
                    onChange={(e) => setForecastCurrentRate(e.target.value)}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>
              <Button
                size="sm"
                className="gap-1"
                onClick={() =>
                  forecastMut.mutate({
                    baseCurrency: forecastBase,
                    quoteCurrency: forecastQuote,
                    currentRate: Number(forecastCurrentRate),
                    horizonHours: 24,
                  })
                }
                disabled={forecastMut.isPending}
              >
                {forecastMut.isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Brain className="w-3.5 h-3.5" />
                )}
                Run 24h Forecast
              </Button>
              {forecastResult && (
                <Textarea
                  readOnly
                  value={JSON.stringify(forecastResult, null, 2)}
                  className="text-xs font-mono h-32 resize-none"
                />
              )}
            </CardContent>
          )}
        </Card>

        {/* Overrides table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">All Overrides</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
            ) : overrides.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <TrendingUp className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">No overrides configured yet.</p>
                <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Create First Override
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {overrides.map((override) => {
                  const isExpiredOrInactive = !override.isActive || override.isExpired;
                  return (
                    <div key={override.id} className="flex items-center gap-4 px-4 py-3">
                      {/* Currency pair */}
                      <div className="flex items-center gap-1.5 min-w-[140px]">
                        <span className="font-mono text-sm font-semibold">{override.baseCurrency}</span>
                        <span className="text-muted-foreground text-xs">→</span>
                        <span className="font-mono text-sm font-semibold">{override.targetCurrency}</span>
                      </div>

                      {/* Rate */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold tabular-nums">{formatRate(override.effectiveRate)}</p>
                        {override.reason && (
                          <p className="text-xs text-muted-foreground truncate">{override.reason}</p>
                        )}
                      </div>

                      {/* Expiry */}
                      <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground min-w-[200px]">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span className="truncate">{formatExpiry(override.expiresAt)}</span>
                      </div>

                      {/* Status badge */}
                      <Badge
                        variant={isExpiredOrInactive ? "secondary" : "default"}
                        className={`shrink-0 ${!isExpiredOrInactive ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" : ""}`}
                      >
                        {override.isExpired ? "Expired" : override.isActive ? "Active" : "Inactive"}
                      </Badge>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {override.isActive && !override.isExpired && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-amber-500"
                            title="Deactivate"
                            onClick={() => deactivateMut.mutate({ id: override.id })}
                            disabled={deactivateMut.isPending}
                          >
                            <PowerOff className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Delete permanently"
                          onClick={() => setDeleteTarget(override.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create override dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Power className="w-5 h-5 text-primary" />
                New Exchange Rate Override
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Base Currency</Label>
                  <Select value={form.baseCurrency} onValueChange={(v) => setForm((f) => ({ ...f, baseCurrency: v }))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Target Currency</Label>
                  <Select value={form.targetCurrency} onValueChange={(v) => setForm((f) => ({ ...f, targetCurrency: v }))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.filter((c) => c !== form.baseCurrency).map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Override Rate (1 {form.baseCurrency} = ? {form.targetCurrency})</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 1580.50"
                  value={form.rate}
                  onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Duration</Label>
                <Select
                  value={String(form.durationHours)}
                  onValueChange={(v) => setForm((f) => ({ ...f, durationHours: Number(v) }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Reason (optional)</Label>
                <Input
                  placeholder="e.g. API outage, market volatility"
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  className="h-9"
                />
              </div>

              <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2">
                <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Creating a new override will deactivate any existing active override for this currency pair.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={upsertMut.isPending}>
                {upsertMut.isPending ? "Saving…" : "Save Override"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Override?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the exchange rate override. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={() => deleteTarget !== null && deleteMut.mutate({ id: deleteTarget })}
                disabled={deleteMut.isPending}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RoleGuard>
  );
}
