/**
 * BISAutoFlagSettings.tsx
 *
 * Admin page for managing per-currency auto-flag thresholds.
 * Allows compliance officers to configure:
 *   - USD-equivalent amount threshold per currency
 *   - Hourly velocity count threshold
 *   - BIS investigation tier to assign on auto-trigger
 *   - Active/inactive toggle per currency
 *
 * Calls: trpc.bisIntegration.getAutoFlagConfig
 *        trpc.bisIntegration.updateAutoFlagConfig
 *        trpc.bisIntegration.resetAutoFlagConfig
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Zap, RefreshCw, Plus, Edit2, RotateCcw, Info, CheckCircle2,
  XCircle, DollarSign, Activity, Shield,
} from "lucide-react";

const SUPPORTED_CURRENCIES = [
  { code: "GLOBAL", name: "Global (all currencies)", flag: "🌍" },
  { code: "USDC",   name: "USD Coin",               flag: "🇺🇸" },
  { code: "USD",    name: "US Dollar",               flag: "🇺🇸" },
  { code: "NGN",    name: "Nigerian Naira",          flag: "🇳🇬" },
  { code: "KES",    name: "Kenyan Shilling",         flag: "🇰🇪" },
  { code: "GHS",    name: "Ghanaian Cedi",           flag: "🇬🇭" },
  { code: "ZAR",    name: "South African Rand",      flag: "🇿🇦" },
  { code: "XOF",    name: "West African CFA Franc",  flag: "🌍" },
  { code: "EGP",    name: "Egyptian Pound",          flag: "🇪🇬" },
  { code: "TZS",    name: "Tanzanian Shilling",      flag: "🇹🇿" },
  { code: "UGX",    name: "Ugandan Shilling",        flag: "🇺🇬" },
  { code: "XLM",    name: "Stellar Lumens",          flag: "⭐" },
];

const TIER_OPTIONS = [
  { value: "basic",          label: "Basic",          color: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
  { value: "standard",       label: "Standard",       color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { value: "comprehensive",  label: "Comprehensive",  color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
];

type TierValue = "basic" | "standard" | "comprehensive";

interface ConfigRow {
  currency: string;
  thresholdUsd: string;
  velocityCount: number;
  bisTier: string;
  isActive: boolean;
  updatedAt?: Date | null;
}

interface EditForm {
  currency: string;
  thresholdUsd: string;
  velocityCount: string;
  bisTier: TierValue;
  isActive: boolean;
}

const DEFAULT_FORM: EditForm = {
  currency: "GLOBAL",
  thresholdUsd: "5000",
  velocityCount: "10",
  bisTier: "standard",
  isActive: true,
};

function tierBadge(tier: string) {
  const opt = TIER_OPTIONS.find((t) => t.value === tier);
  return (
    <Badge variant="outline" className={`text-xs ${opt?.color ?? ""}`}>
      {opt?.label ?? tier}
    </Badge>
  );
}

function currencyLabel(code: string) {
  const c = SUPPORTED_CURRENCIES.find((x) => x.code === code);
  return c ? `${c.flag} ${code}` : code;
}

export default function BISAutoFlagSettings() {
  const [editDialog, setEditDialog] = useState<{ open: boolean; row: ConfigRow | null; isNew: boolean }>({
    open: false, row: null, isNew: false,
  });
  const [form, setForm] = useState<EditForm>(DEFAULT_FORM);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = trpc.bisIntegration.getAutoFlagConfig.useQuery();

  const updateConfig = trpc.bisIntegration.updateAutoFlagConfig.useMutation({
    onSuccess: () => {
      toast.success("Auto-flag config saved", {
        description: `Threshold for ${form.currency} updated successfully.`,
      });
      setEditDialog({ open: false, row: null, isNew: false });
      refetch();
    },
    onError: (err) => {
      toast.error("Failed to save config", { description: err.message });
    },
  });

  const resetConfig = trpc.bisIntegration.resetAutoFlagConfig.useMutation({
    onSuccess: () => {
      toast.success("Config reset to defaults", {
        description: `${resetTarget} threshold restored to defaults.`,
      });
      setResetTarget(null);
      refetch();
    },
    onError: (err) => {
      toast.error("Reset failed", { description: err.message });
    },
  });

  const configs: ConfigRow[] = (data as ConfigRow[] | undefined) ?? [];

  function openEdit(row: ConfigRow) {
    setForm({
      currency: row.currency,
      thresholdUsd: row.thresholdUsd,
      velocityCount: String(row.velocityCount),
      bisTier: row.bisTier as TierValue,
      isActive: row.isActive,
    });
    setEditDialog({ open: true, row, isNew: false });
  }

  function openNew() {
    setForm(DEFAULT_FORM);
    setEditDialog({ open: true, row: null, isNew: true });
  }

  async function handleSave() {
    const thresholdNum = parseFloat(form.thresholdUsd);
    const velocityNum = parseInt(form.velocityCount, 10);
    if (isNaN(thresholdNum) || thresholdNum <= 0) {
      toast.error("Invalid threshold", { description: "Enter a positive USD amount." });
      return;
    }
    if (isNaN(velocityNum) || velocityNum < 1) {
      toast.error("Invalid velocity count", { description: "Enter a positive integer." });
      return;
    }
    setSaving(true);
    try {
      await updateConfig.mutateAsync({
        currency: form.currency,
        thresholdUsd: thresholdNum,
        velocityCount: velocityNum,
        bisTier: form.bisTier,
        isActive: form.isActive,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(row: ConfigRow) {
    await updateConfig.mutateAsync({
      currency: row.currency,
      thresholdUsd: parseFloat(row.thresholdUsd),
      velocityCount: row.velocityCount,
      bisTier: row.bisTier as TierValue,
      isActive: !row.isActive,
    });
    refetch();
  }

  const globalConfig = configs.find((c) => c.currency === "GLOBAL");
  const currencyConfigs = configs.filter((c) => c.currency !== "GLOBAL");

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-400" />
            Auto-Flag Thresholds
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Configure per-currency thresholds that automatically trigger BIS investigations
            when a wallet transaction exceeds the amount or velocity limit.
          </p>
        </div>
        <Button onClick={openNew} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">
          <Plus className="w-4 h-4 mr-2" />
          Add Currency Rule
        </Button>
      </div>

      {/* How it works */}
      <Card className="bg-blue-950/30 border-blue-800/40">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-300 space-y-1">
              <p className="font-medium text-blue-300">How auto-flagging works</p>
              <p>
                After every successful wallet send, the system checks the sender's transaction
                against the active config for that currency (or the GLOBAL fallback). A BIS
                investigation is automatically created when either:
              </p>
              <ul className="list-disc list-inside ml-2 text-slate-400 space-y-0.5">
                <li>The USD-equivalent amount meets or exceeds the <strong className="text-slate-200">Amount Threshold</strong>, or</li>
                <li>The sender's hourly send count meets or exceeds the <strong className="text-slate-200">Velocity Count</strong>.</li>
              </ul>
              <p className="text-slate-400">
                Currency-specific rules take priority over the GLOBAL rule. Every trigger is
                recorded in the Auto-Flag History log.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Global config highlight */}
      {globalConfig && (
        <Card className="bg-slate-900/60 border-slate-700">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-slate-200 flex items-center gap-2">
                <Shield className="w-4 h-4 text-slate-400" />
                Global Fallback Rule
              </CardTitle>
              <div className="flex items-center gap-2">
                {globalConfig.isActive ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Active</Badge>
                ) : (
                  <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">Inactive</Badge>
                )}
                <Button variant="ghost" size="sm" onClick={() => openEdit(globalConfig)} className="h-7 px-2 text-slate-400 hover:text-white">
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <CardDescription>
              Applied to any currency without a specific rule.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <DollarSign className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-white">
                  ${parseFloat(globalConfig.thresholdUsd).toLocaleString()}
                </div>
                <div className="text-xs text-slate-400">Amount Threshold (USD)</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <Activity className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-white">{globalConfig.velocityCount}</div>
                <div className="text-xs text-slate-400">Velocity / Hour</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <Shield className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                <div className="mt-1">{tierBadge(globalConfig.bisTier)}</div>
                <div className="text-xs text-slate-400 mt-1">Investigation Tier</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-currency rules table */}
      <Card className="bg-slate-900/60 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200">Currency-Specific Rules</CardTitle>
          <CardDescription>
            These rules override the Global fallback for their respective currencies.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              Loading configurations…
            </div>
          ) : currencyConfigs.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No currency-specific rules yet.</p>
              <p className="text-xs mt-1">The Global rule applies to all currencies.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400 font-medium">Currency</TableHead>
                  <TableHead className="text-slate-400 font-medium text-right">Amount Threshold</TableHead>
                  <TableHead className="text-slate-400 font-medium text-right">Velocity / hr</TableHead>
                  <TableHead className="text-slate-400 font-medium">BIS Tier</TableHead>
                  <TableHead className="text-slate-400 font-medium">Status</TableHead>
                  <TableHead className="text-slate-400 font-medium">Last Updated</TableHead>
                  <TableHead className="text-slate-400 font-medium text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currencyConfigs.map((row) => (
                  <TableRow key={row.currency} className="border-slate-800 hover:bg-slate-800/30">
                    <TableCell className="font-mono text-white font-semibold">
                      {currencyLabel(row.currency)}
                    </TableCell>
                    <TableCell className="text-right text-amber-300 font-semibold">
                      ${parseFloat(row.thresholdUsd).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-blue-300 font-semibold">
                      {row.velocityCount}
                    </TableCell>
                    <TableCell>{tierBadge(row.bisTier)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={row.isActive}
                          onCheckedChange={() => handleToggleActive(row)}
                          className="data-[state=checked]:bg-emerald-500"
                        />
                        {row.isActive ? (
                          <span className="text-xs text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Active
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Inactive
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-400 text-xs">
                      {row.updatedAt
                        ? new Date(row.updatedAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-slate-400 hover:text-white"
                          onClick={() => openEdit(row)}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-slate-400 hover:text-amber-400"
                          onClick={() => setResetTarget(row.currency)}
                          title="Reset to defaults"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit / Create dialog */}
      <Dialog
        open={editDialog.open}
        onOpenChange={(open) => !open && setEditDialog({ open: false, row: null, isNew: false })}
      >
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              {editDialog.isNew ? "Add Currency Rule" : `Edit Rule — ${form.currency}`}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {editDialog.isNew
                ? "Create a new per-currency auto-flag threshold."
                : "Modify the threshold settings for this currency."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Currency selector (only for new) */}
            {editDialog.isNew && (
              <div className="space-y-1.5">
                <Label className="text-slate-300">Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code} className="text-white hover:bg-slate-700">
                        {c.flag} {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Amount threshold */}
            <div className="space-y-1.5">
              <Label className="text-slate-300">Amount Threshold (USD equivalent)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <Input
                  type="number"
                  min="1"
                  step="100"
                  value={form.thresholdUsd}
                  onChange={(e) => setForm((f) => ({ ...f, thresholdUsd: e.target.value }))}
                  className="bg-slate-800 border-slate-600 text-white pl-7"
                  placeholder="5000"
                />
              </div>
              <p className="text-xs text-slate-500">
                Transactions at or above this USD-equivalent value will trigger a BIS investigation.
              </p>
            </div>

            {/* Velocity count */}
            <div className="space-y-1.5">
              <Label className="text-slate-300">Velocity Count (sends per hour)</Label>
              <Input
                type="number"
                min="1"
                max="1000"
                value={form.velocityCount}
                onChange={(e) => setForm((f) => ({ ...f, velocityCount: e.target.value }))}
                className="bg-slate-800 border-slate-600 text-white"
                placeholder="10"
              />
              <p className="text-xs text-slate-500">
                If a user sends this many times in 1 hour, a BIS investigation is triggered.
              </p>
            </div>

            {/* BIS Tier */}
            <div className="space-y-1.5">
              <Label className="text-slate-300">Investigation Tier</Label>
              <Select
                value={form.bisTier}
                onValueChange={(v) => setForm((f) => ({ ...f, bisTier: v as TierValue }))}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  {TIER_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-white hover:bg-slate-700">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between rounded-lg bg-slate-800/50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-200">Rule Active</p>
                <p className="text-xs text-slate-400">Disable to pause auto-flagging for this currency.</p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                className="data-[state=checked]:bg-emerald-500"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditDialog({ open: false, row: null, isNew: false })}
              className="text-slate-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirmation */}
      <AlertDialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to defaults?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will restore the <strong className="text-white">{resetTarget}</strong> rule to its
              factory default threshold. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetTarget && resetConfig.mutate({ currency: resetTarget })}
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
