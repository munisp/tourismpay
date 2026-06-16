import { useState, useEffect } from "react";
import {
  Fingerprint, Smartphone, Trash2, Shield, CheckCircle,
  Clock, AlertTriangle, Loader2, Plus, RefreshCw, KeyRound,
  Lock, RotateCcw, ShieldAlert, Activity, XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import PageHeader from "@/components/shared/PageHeader";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

// ─── Sparkline Chart ─────────────────────────────────────────────────────────
function CredentialSparkline({ credentialId }: { credentialId: string }) {
  const { data = [], isLoading } = trpc.biometric.getSignCountTrend.useQuery(
    { credentialId, days: 30 },
    { staleTime: 60_000 }
  );
  if (isLoading) {
    return <div className="h-10 w-full bg-white/3 rounded animate-pulse" />;
  }
  const total = (data as { date: string; count: number }[]).reduce((s, d) => s + d.count, 0);
  return (
    <div className="mt-2">
      <p className="text-[10px] text-muted-foreground mb-1">
        30-day usage: <strong className="text-foreground">{total} sign-ins</strong>
      </p>
      <ResponsiveContainer width="100%" height={40}>
        <AreaChart data={data as any[]} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="count"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            fill="url(#sparkGrad)"
            dot={false}
            isAnimationActive={false}
          />
          <Tooltip
            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, padding: "4px 8px", fontSize: 10 }}
            labelFormatter={(label) => label}
            formatter={(val: number) => [val, "sign-ins"]}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTs(ts: number | null | undefined): string {
  if (!ts) return "Never";
  return new Date(ts * 1000).toLocaleString();
}
function timeAgo(ts: number | null | undefined): string {
  if (!ts) return "Never";
  const diff = Math.floor((Date.now() / 1000) - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
function formatMs(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

// ─── Trust Score ─────────────────────────────────────────────────────────────
function computeTrustScore(enrollment: {
  signCount?: number | null;
  lastUsedAt?: number | null;
  expiresAt?: number | null;
}): { label: "High" | "Medium" | "Low"; color: string; bg: string; border: string } {
  const nowS = Math.floor(Date.now() / 1000);
  let score = 0;
  // signCount contribution (0-40 pts)
  const sc = enrollment.signCount ?? 0;
  score += Math.min(sc * 4, 40);
  // Recency contribution (0-40 pts)
  if (enrollment.lastUsedAt) {
    const daysSince = (nowS - enrollment.lastUsedAt) / 86400;
    if (daysSince < 1) score += 40;
    else if (daysSince < 7) score += 30;
    else if (daysSince < 30) score += 20;
    else if (daysSince < 90) score += 10;
  }
  // Expiry contribution (0-20 pts)
  if (enrollment.expiresAt) {
    const daysLeft = (enrollment.expiresAt - nowS) / 86400;
    if (daysLeft > 60) score += 20;
    else if (daysLeft > 30) score += 15;
    else if (daysLeft > 7) score += 8;
    else if (daysLeft > 0) score += 3;
  }
  if (score >= 60) return { label: "High", color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30" };
  if (score >= 30) return { label: "Medium", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" };
  return { label: "Low", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" };
}

const PIN_ACTION_LABELS: Record<string, string> = {
  "biometric.pinVerified": "PIN Verified",
  "biometric.pinFailed": "PIN Failed",
  "biometric.pinSet": "PIN Set",
  "biometric.pinLocked": "PIN Locked",
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function BiometricSettings() {
  const utils = trpc.useUtils();
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; deviceName: string } | null>(null);
  const [showRevokeAllDialog, setShowRevokeAllDialog] = useState(false);
  const [expandedTrend, setExpandedTrend] = useState<string | null>(null);
  const [showChangePinDialog, setShowChangePinDialog] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [lockoutCountdown, setLockoutCountdown] = useState(0);

  // Queries
  const { data: enrollments = [], isLoading: loadingList, refetch: refetchList } =
    trpc.biometric.list.useQuery();
  const { data: stats, isLoading: loadingStats } =
    trpc.biometric.stats.useQuery();
  const { data: checkData } =
    trpc.biometric.checkEnabled.useQuery();
  const { data: lockoutStatus, refetch: refetchLockout } =
    trpc.biometric.getPinLockoutStatus.useQuery(undefined, {
      refetchInterval: lockoutCountdown > 0 ? 5000 : false,
    });
  const { data: pinHistory = [] } =
    trpc.biometric.getPinHistory.useQuery({ limit: 10 });

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockoutStatus?.isLocked || !lockoutStatus.remainingMs) {
      setLockoutCountdown(0);
      return;
    }
    setLockoutCountdown(lockoutStatus.remainingMs);
    const interval = setInterval(() => {
      setLockoutCountdown((prev) => {
        if (prev <= 1000) {
          clearInterval(interval);
          refetchLockout();
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutStatus?.isLocked, lockoutStatus?.remainingMs]);

  // Change PIN mutation
  const changePinMut = trpc.biometric.changePin.useMutation({
    onSuccess: () => {
      toast.success("PIN changed successfully");
      setShowChangePinDialog(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    },
    onError: (err) => toast.error(err.message),
  });
  const handleChangePin = () => {
    if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin)) {
      toast.error("PINs must be exactly 6 digits");
      return;
    }
    if (newPin !== confirmPin) {
      toast.error("New PINs do not match");
      return;
    }
    changePinMut.mutate({ currentPin, newPin });
  };

  // Revoke single mutation
  const revokeMut = trpc.biometric.revoke.useMutation({
    onSuccess: () => {
      toast.success("Credential revoked successfully");
      setRevokeTarget(null);
      utils.biometric.list.invalidate();
      utils.biometric.stats.invalidate();
      utils.biometric.checkEnabled.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const handleRevoke = () => {
    if (!revokeTarget) return;
    revokeMut.mutate({ id: revokeTarget.id });
  };

  // Revoke All mutation
  const revokeAllMut = trpc.biometric.revokeAll.useMutation({
    onSuccess: () => {
      toast.success("All biometric credentials revoked");
      setShowRevokeAllDialog(false);
      utils.biometric.list.invalidate();
      utils.biometric.stats.invalidate();
      utils.biometric.checkEnabled.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Renew enrollment mutation
  const renewMut = trpc.biometric.renewEnrollment.useMutation({
    onSuccess: () => {
      toast.success("Credential renewed for 90 days");
      utils.biometric.list.invalidate();
      utils.biometric.checkEnabled.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const isEnabled = checkData?.enabled ?? false;
  const enrollmentCount = checkData?.enrollmentCount ?? 0;
  const isLocked = lockoutStatus?.isLocked ?? false;

  return (
    <div className="p-6 min-h-full">
      <PageHeader
        title="Biometric Security"
        subtitle="Manage your registered biometric credentials and device access"
      />

      {/* PIN Lockout Banner */}
      {isLocked && (
        <div className="mb-5 px-4 py-3.5 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0 mt-0.5">
            <Lock className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-300 mb-0.5">Transaction PIN Locked</p>
            <p className="text-xs text-red-300/70 leading-relaxed">
              Your PIN has been temporarily locked after {lockoutStatus?.failedAttempts ?? 5} failed attempts.
              {lockoutCountdown > 0 && (
                <> Unlocks in <strong className="text-red-300">{formatMs(lockoutCountdown)}</strong>.</>
              )}
            </p>
            {/* Tier information */}
            {lockoutStatus?.currentTier != null && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/20">
                  Tier {(lockoutStatus.currentTier ?? 0) + 1} lockout
                </span>
                {(lockoutStatus.totalLockouts ?? 0) > 0 && (
                  <span className="text-[10px] text-red-300/60">
                    {lockoutStatus.totalLockouts} lockout{lockoutStatus.totalLockouts !== 1 ? "s" : ""} total
                  </span>
                )}
                {lockoutStatus.nextLockoutDuration && (
                  <span className="text-[10px] text-red-300/60">
                    · Next: <strong className="text-red-300/80">{lockoutStatus.nextLockoutDuration}</strong>
                  </span>
                )}
              </div>
            )}
            <a
              href="https://tourismpay.com/support"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-1.5 text-xs text-red-400 underline underline-offset-2 hover:text-red-300"
            >
              Contact Support →
            </a>
          </div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-500/40 text-red-400 bg-red-500/10 shrink-0 mt-0.5">
            Locked
          </Badge>
        </div>
      )}
      {/* PIN Lockout History Summary (shown when unlocked but past lockouts exist) */}
      {!isLocked && (lockoutStatus?.totalLockouts ?? 0) > 0 && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-amber-500/5 border border-amber-500/20 flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <p className="text-xs text-amber-300/80 flex-1">
            <strong>{lockoutStatus!.totalLockouts}</strong> past PIN lockout{lockoutStatus!.totalLockouts !== 1 ? "s" : ""} on record.
            {lockoutStatus?.nextLockoutDuration && (
              <> If locked again, duration will be: <strong className="text-amber-300">{lockoutStatus.nextLockoutDuration}</strong>.</>
            )}
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Fingerprint className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            {loadingStats ? (
              <div className="h-5 w-16 bg-white/5 rounded animate-pulse mt-0.5" />
            ) : (
              <div className="flex items-center gap-1.5 mt-0.5">
                {isEnabled ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-sm font-semibold text-green-400">Enabled</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-sm font-semibold text-amber-400">Not Configured</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Enrolled Devices</p>
            {loadingStats ? (
              <div className="h-5 w-8 bg-white/5 rounded animate-pulse mt-0.5" />
            ) : (
              <p className="text-xl font-bold text-foreground mt-0.5">{enrollmentCount}</p>
            )}
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Sign-ins</p>
            {loadingStats ? (
              <div className="h-5 w-8 bg-white/5 rounded animate-pulse mt-0.5" />
            ) : (
              <p className="text-xl font-bold text-foreground mt-0.5">
                {(stats as any)?.total ?? 0}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Enrolled devices */}
      <div className="glass-card overflow-hidden mb-6">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Enrolled Devices</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Devices registered for biometric login. Revoke any device you no longer use.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {enrollmentCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2"
                onClick={() => setShowRevokeAllDialog(true)}
                title="Revoke all devices"
              >
                <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                Revoke All
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 text-muted-foreground hover:text-foreground"
              onClick={() => refetchList()}
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {loadingList ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
                <div className="w-9 h-9 rounded-lg bg-white/5" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-32 bg-white/5 rounded" />
                  <div className="h-3 w-48 bg-white/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (enrollments as any[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Fingerprint className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No biometric credentials enrolled</p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
              Register your device using the TourismPay mobile app to enable Face ID or Touch ID login.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {(enrollments as any[]).map((enrollment) => {
              const nowS = Math.floor(Date.now() / 1000);
              const daysLeft = enrollment.expiresAt
                ? Math.ceil((enrollment.expiresAt - nowS) / 86400)
                : null;
              const isExpiringSoon = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;
              const isExpired = daysLeft !== null && daysLeft <= 0;
              return (
                <div key={enrollment.id} className="flex items-center gap-3 px-5 py-4 group hover:bg-white/2 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Smartphone className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        className="text-sm font-medium text-foreground truncate hover:text-primary transition-colors text-left"
                        onClick={() => setExpandedTrend(expandedTrend === enrollment.id ? null : enrollment.id)}
                        title="Toggle usage trend chart"
                      >
                        {enrollment.deviceName ?? "Unknown Device"}
                      </button>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500/30 text-green-400 bg-green-500/5">
                        Active
                      </Badge>
                      {/* Trust Score badge */}
                      {(() => {
                        const trust = computeTrustScore(enrollment);
                        return (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${trust.border} ${trust.color} ${trust.bg}`}>
                            {trust.label} Trust
                          </Badge>
                        );
                      })()}
                      {isExpired && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-500/40 text-red-400 bg-red-500/10">
                          Expired
                        </Badge>
                      )}
                      {isExpiringSoon && !isExpired && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-400 bg-amber-500/10">
                          Expires in {daysLeft}d
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last used: {timeAgo(enrollment.lastUsedAt)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {enrollment.signCount ?? 0} sign-ins
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Enrolled: {formatTs(enrollment.createdAt)}
                      </span>
                      {enrollment.expiresAt && (
                        <span className={`text-xs ${isExpiringSoon || isExpired ? 'text-amber-400' : 'text-muted-foreground'}`}>
                          Expires: {formatTs(enrollment.expiresAt)}
                        </span>
                      )}
                    </div>
                    {/* Sparkline trend chart (expandable) */}
                    {expandedTrend === enrollment.id && (
                      <CredentialSparkline credentialId={enrollment.credentialId} />
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Renew button — shown when expiring soon or expired */}
                    {(isExpiringSoon || isExpired) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 px-2 opacity-0 group-hover:opacity-100 transition-all"
                        onClick={() => renewMut.mutate({ id: enrollment.id })}
                        disabled={renewMut.isPending}
                        title="Renew for 90 days"
                      >
                        {renewMut.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <><RotateCcw className="w-3.5 h-3.5 mr-1" />Renew</>
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                      onClick={() => setRevokeTarget({ id: enrollment.id, deviceName: enrollment.deviceName ?? "Unknown Device" })}
                      title="Revoke credential"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Change PIN card */}
      <div className="glass-card p-5 border border-purple-500/10 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <KeyRound className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Transaction PIN</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                A 6-digit PIN fallback for high-value transactions when Face ID / Touch ID is unavailable.
                {isLocked && (
                  <span className="text-red-400 ml-1">Currently locked — wait for the lockout to expire before changing.</span>
                )}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10 bg-transparent shrink-0 ml-4"
            onClick={() => setShowChangePinDialog(true)}
            disabled={isLocked}
          >
            <KeyRound className="w-3.5 h-3.5 mr-1.5" />
            Change PIN
          </Button>
        </div>
      </div>

      {/* How to enroll */}
      <div className="glass-card p-5 border border-primary/10">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Plus className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Enroll a New Device</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              To register a new device, open the <strong className="text-foreground">TourismPay mobile app</strong>, go to{" "}
              <strong className="text-foreground">Profile → Biometric Security</strong>, and tap{" "}
              <strong className="text-foreground">Register This Device</strong>. Face ID, Touch ID, and fingerprint sensors are supported.
              Your biometric data never leaves your device — only a cryptographic credential ID is stored on our servers.
            </p>
          </div>
        </div>
      </div>

      {/* Recent PIN Activity */}
      <div className="glass-card overflow-hidden mb-4">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Recent PIN Activity</h2>
        </div>
        {(pinHistory as any[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Activity className="w-8 h-8 text-muted-foreground/20 mb-2" />
            <p className="text-xs text-muted-foreground">No PIN activity recorded yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {(pinHistory as any[]).map((event) => {
              const isFailed = event.action === "biometric.pinFailed" || event.action === "biometric.pinLocked";
              return (
                <div key={event.id} className="flex items-center gap-3 px-5 py-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    isFailed ? "bg-red-500/10" : "bg-green-500/10"
                  }`}>
                    {isFailed ? (
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {PIN_ACTION_LABELS[event.action] ?? event.action}
                    </p>
                    {event.after?.amount && (
                      <p className="text-[10px] text-muted-foreground">
                        Amount: {event.after.amount} {event.after.currency}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {event.createdAt ? new Date(event.createdAt * 1000).toLocaleString() : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Security note */}
      <div className="mt-4 px-4 py-3 rounded-lg bg-amber-500/5 border border-amber-500/20 flex items-start gap-2.5">
        <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300/80 leading-relaxed">
          <strong className="text-amber-300">Security notice:</strong> Biometric re-authentication is required for wallet transactions above{" "}
          <strong className="text-amber-300">$1,000 USD</strong>. Revoking all credentials will disable biometric login and high-value transaction shortcuts.
        </p>
      </div>

      {/* Change PIN dialog */}
      <Dialog open={showChangePinDialog} onOpenChange={(open) => { if (!open) { setShowChangePinDialog(false); setCurrentPin(""); setNewPin(""); setConfirmPin(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-purple-400" />
              Change Transaction PIN
            </DialogTitle>
            <DialogDescription>
              Enter your current PIN and choose a new 6-digit PIN.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Current PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="tracking-widest text-center text-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">New PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="tracking-widest text-center text-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Confirm New PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="tracking-widest text-center text-lg"
              />
            </div>
            {newPin.length === 6 && confirmPin.length === 6 && newPin !== confirmPin && (
              <p className="text-xs text-destructive">PINs do not match</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowChangePinDialog(false)} disabled={changePinMut.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleChangePin}
              disabled={changePinMut.isPending || currentPin.length < 6 || newPin.length < 6 || confirmPin.length < 6}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {changePinMut.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Changing…</>
              ) : (
                <><KeyRound className="w-3.5 h-3.5 mr-1.5" />Change PIN</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke All confirmation dialog */}
      <Dialog open={showRevokeAllDialog} onOpenChange={(open) => !open && setShowRevokeAllDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-4 h-4" />
              Revoke All Devices
            </DialogTitle>
            <DialogDescription>
              This will immediately revoke biometric access for <strong className="text-foreground">all {enrollmentCount} enrolled device{enrollmentCount !== 1 ? 's' : ''}</strong>.
              You will need to re-register your devices to use biometric login or approve high-value transactions.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRevokeAllDialog(false)} disabled={revokeAllMut.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => revokeAllMut.mutate()}
              disabled={revokeAllMut.isPending}
            >
              {revokeAllMut.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Revoking…</>
              ) : (
                <><ShieldAlert className="w-3.5 h-3.5 mr-1.5" />Revoke All Devices</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke single confirmation dialog */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" />
              Revoke Credential
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke biometric access for{" "}
              <strong className="text-foreground">{revokeTarget?.deviceName}</strong>?
              This device will no longer be able to log in using biometrics or approve high-value transactions.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={revokeMut.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revokeMut.isPending}
            >
              {revokeMut.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Revoking…</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5 mr-1.5" />Revoke</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
