/**
 * Kill Switch Admin Page
 *
 * Allows admins to activate/deactivate per-corridor or global payment kill switches.
 * Shows audit history of all toggle events.
 */

import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Shield,
  AlertTriangle,
  Clock,
  User,
  RefreshCw,
  Globe,
  ArrowRight,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CORRIDORS = [
  { value: "GLOBAL", label: "ALL CORRIDORS (Global Kill Switch)", isGlobal: true },
  { value: "USD-NGN", label: "USD → NGN" },
  { value: "USD-KES", label: "USD → KES" },
  { value: "USD-GHS", label: "USD → GHS" },
  { value: "USD-TZS", label: "USD → TZS" },
  { value: "USD-UGX", label: "USD → UGX" },
  { value: "USD-ZAR", label: "USD → ZAR" },
  { value: "USD-XOF", label: "USD → XOF" },
  { value: "GBP-NGN", label: "GBP → NGN" },
  { value: "EUR-NGN", label: "EUR → NGN" },
  { value: "EUR-KES", label: "EUR → KES" },
  { value: "USD-MAD", label: "USD → MAD" },
];

const REASONS = [
  "Fraud investigation in progress",
  "Regulatory compliance hold",
  "Liquidity risk management",
  "Technical maintenance window",
  "Suspicious activity detected",
  "Regulatory directive",
  "Emergency risk control",
];

type KillSwitchRow = {
  id: number;
  corridor: string;
  isActive: boolean;
  activatedBy: number | null;
  activatedByName: string | null;
  reason: string | null;
  activatedAt: number | null;
  deactivatedAt: number | null;
  deactivatedBy: number | null;
  deactivatedByName: string | null;
  createdAt: number;
  updatedAt: number;
};

type HistoryRow = {
  id: number;
  corridor: string;
  action: string;
  actorId: number | null;
  actorName: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
};

export default function KillSwitch() {
  const { user } = useAuth();
  const isAdmin = (user as { role?: string } | null)?.role === "admin";
  const [activateOpen, setActivateOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingKs, setPendingKs] = useState<KillSwitchRow | null>(null);
  const [deactivateReason, setDeactivateReason] = useState("Manual deactivation by admin");

  // Activate form state
  const [form, setForm] = useState({
    corridor: "USD-NGN" as string,
    reason: REASONS[0],
    customReason: "",
  });

  const utils = trpc.useUtils();

  const { data: switches, isLoading } = trpc.killSwitch.list.useQuery(
    undefined,
    { refetchInterval: 10_000 }
  );

  const { data: history } = trpc.killSwitch.getHistory.useQuery(
    { limit: 30 },
    { refetchInterval: 15_000 }
  );

  const { data: summary } = trpc.killSwitch.summary.useQuery(undefined, {
    refetchInterval: 10_000,
  });

  const activateMutation = trpc.killSwitch.activate.useMutation({
    onSuccess: () => {
      toast.success(`Kill switch activated — Corridor ${form.corridor} is now BLOCKED`);
      setActivateOpen(false);
      utils.killSwitch.list.invalidate();
      utils.killSwitch.summary.invalidate();
      utils.killSwitch.getHistory.invalidate();
    },
    onError: (err: { message: string }) => {
      toast.error(err.message);
    },
  });

  const deactivateMutation = trpc.killSwitch.deactivate.useMutation({
    onSuccess: () => {
      toast.success(`Kill switch deactivated — Corridor ${pendingKs?.corridor} is now OPEN`);
      setConfirmOpen(false);
      setPendingKs(null);
      utils.killSwitch.list.invalidate();
      utils.killSwitch.summary.invalidate();
      utils.killSwitch.getHistory.invalidate();
    },
    onError: (err: { message: string }) => {
      toast.error(err.message);
    },
  });

  const handleActivate = () => {
    const reason = form.customReason || form.reason;
    activateMutation.mutate({
      corridor: form.corridor as "GLOBAL" | "USD-NGN" | "USD-KES" | "USD-GHS" | "USD-TZS" | "USD-UGX" | "USD-ZAR" | "USD-XOF" | "GBP-NGN" | "EUR-NGN" | "EUR-KES" | "USD-MAD",
      reason,
    });
  };

  const handleDeactivate = (ks: KillSwitchRow) => {
    setPendingKs(ks);
    setConfirmOpen(true);
  };

  const activeSwitches = (switches ?? []).filter((s: KillSwitchRow) => s.isActive);
  const inactiveSwitches = (switches ?? []).filter((s: KillSwitchRow) => !s.isActive);
  const globalActive = activeSwitches.some((s: KillSwitchRow) => s.corridor === "GLOBAL");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-destructive" />
            Kill Switch Control
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Activate or deactivate payment corridors in real time. All actions are
            audit-logged.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setActivateOpen(true)}
            className="gap-2"
            variant="destructive"
          >
            <Zap className="w-4 h-4" />
            Activate Kill Switch
          </Button>
        )}
      </div>

      {/* Global alert banner */}
      {globalActive && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">GLOBAL KILL SWITCH ACTIVE</p>
            <p className="text-xs opacity-80">
              All payment corridors are currently blocked. No remittances can be
              processed.
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Corridors</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {summary?.total ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active Switches</p>
            <p className="text-2xl font-bold text-destructive mt-1">
              {summary?.active ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Global Active</p>
            <p className={cn("text-2xl font-bold mt-1", summary?.globalActive ? "text-destructive" : "text-emerald-500")}>
              {summary?.globalActive ? "YES" : "NO"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Last Activation</p>
            <p className="text-sm font-semibold text-foreground mt-1">
              {summary?.lastActivation
                ? new Date(summary.lastActivation).toLocaleString()
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active kill switches */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            Active Kill Switches ({activeSwitches.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              Loading...
            </div>
          ) : activeSwitches.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No active kill switches. All corridors are open.
            </div>
          ) : (
            <div className="space-y-3">
              {activeSwitches.map((ks: KillSwitchRow) => (
                <div
                  key={ks.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    ks.corridor === "GLOBAL"
                      ? "border-destructive/50 bg-destructive/5"
                      : "border-amber-500/30 bg-amber-500/5"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {ks.corridor === "GLOBAL" ? (
                      <Globe className="w-4 h-4 text-destructive" />
                    ) : (
                      <ArrowRight className="w-4 h-4 text-amber-500" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {ks.corridor === "GLOBAL" ? "ALL CORRIDORS" : ks.corridor}
                      </p>
                      <p className="text-xs text-muted-foreground">{ks.reason ?? "No reason provided"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-muted-foreground">
                        by {ks.activatedByName ?? "System"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ks.activatedAt ? new Date(ks.activatedAt).toLocaleString() : "—"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-destructive text-destructive text-xs"
                    >
                      ACTIVE
                    </Badge>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() => handleDeactivate(ks)}
                      >
                        Deactivate
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inactive corridors */}
      {inactiveSwitches.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Open Corridors ({inactiveSwitches.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {inactiveSwitches.map((ks: KillSwitchRow) => (
                <div
                  key={ks.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-emerald-500/5"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-sm text-foreground font-medium">
                      {ks.corridor === "GLOBAL" ? "ALL CORRIDORS" : ks.corridor}
                    </span>
                  </div>
                  <Badge variant="outline" className="border-emerald-500 text-emerald-500 text-xs">
                    OPEN
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit history */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Audit History (last 30 events)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No audit events yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {history.map((event: HistoryRow) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0"
                >
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      event.action === "activated"
                        ? "bg-destructive"
                        : "bg-emerald-500"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground">
                      <span className="font-semibold">
                        {event.action === "activated" ? "ACTIVATED" : "DEACTIVATED"}
                      </span>{" "}
                      {event.corridor === "GLOBAL" ? "ALL CORRIDORS" : event.corridor}
                      {event.reason && (
                        <>
                          {" — "}
                          <span className="text-muted-foreground">{event.reason}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <User className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {event.actorName ?? "System"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activate dialog */}
      <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Shield className="w-5 h-5" />
              Activate Kill Switch
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Corridor</Label>
              <Select
                value={form.corridor}
                onValueChange={(v) => setForm((f) => ({ ...f, corridor: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CORRIDORS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select
                value={form.reason}
                onValueChange={(v) => setForm((f) => ({ ...f, reason: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Custom reason (optional — overrides selection above)</Label>
              <Textarea
                placeholder="Additional context..."
                value={form.customReason}
                onChange={(e) =>
                  setForm((f) => ({ ...f, customReason: e.target.value }))
                }
                rows={2}
              />
            </div>

            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
              This will immediately block all new remittances for the selected corridor.
              Existing in-flight transactions will not be affected.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleActivate}
              disabled={activateMutation.isPending}
            >
              {activateMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              Activate Kill Switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm deactivate dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-emerald-500" />
              Confirm Deactivation
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will UNBLOCK corridor{" "}
            <strong>{pendingKs?.corridor === "GLOBAL" ? "ALL CORRIDORS" : pendingKs?.corridor}</strong>{" "}
            and resume normal transaction processing.
          </p>
          <div className="space-y-1.5">
            <Label>Reason for deactivation</Label>
            <Input
              value={deactivateReason}
              onChange={(e) => setDeactivateReason(e.target.value)}
              placeholder="e.g. Investigation resolved"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                setPendingKs(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!pendingKs) return;
                deactivateMutation.mutate({
                  corridor: pendingKs.corridor as "GLOBAL" | "USD-NGN" | "USD-KES" | "USD-GHS" | "USD-TZS" | "USD-UGX" | "USD-ZAR" | "USD-XOF" | "GBP-NGN" | "EUR-NGN" | "EUR-KES" | "USD-MAD",
                  reason: deactivateReason,
                });
              }}
              disabled={deactivateMutation.isPending}
            >
              {deactivateMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Confirm Deactivation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
