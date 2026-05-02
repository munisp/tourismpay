import { useState, useEffect } from "react";
import {
  Shield, Building2, AlertTriangle, Activity, Bell, FileText,
  Smartphone, Mail, Moon, Save, RotateCcw, Loader2, CheckCircle, BellRing, TestTube, Heart, TrendingDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/shared/PageHeader";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// ─── Category Config ──────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    key: "bisEnabled" as const,
    label: "Background Investigations",
    description: "Alerts when investigations are completed, flagged, or fail.",
    icon: Shield,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    key: "kybEnabled" as const,
    label: "KYB Applications",
    description: "Notifications for document reviews, approvals, and rejections.",
    icon: Building2,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    key: "fraudEnabled" as const,
    label: "Fraud Alerts",
    description: "High-priority alerts for suspicious transaction patterns.",
    icon: AlertTriangle,
    color: "text-red-400",
    bg: "bg-red-500/10",
  },
  {
    key: "socEnabled" as const,
    label: "SOC Alerts",
    description: "Security operations centre threat and incident notifications.",
    icon: Activity,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
  },
  {
    key: "systemEnabled" as const,
    label: "System Notifications",
    description: "Platform updates, maintenance windows, and admin messages.",
    icon: Bell,
    color: "text-muted-foreground",
    bg: "bg-white/5",
  },
  {
    key: "reportEnabled" as const,
    label: "Report Exports",
    description: "Notify when PDF reports are ready for download.",
    icon: FileText,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
] as const;

type PrefKey = (typeof CATEGORIES)[number]["key"] | "inAppEnabled" | "emailEnabled" | "wishlistExpiryAlerts" | "sentimentAlertEnabled";

type PrefsState = {
  bisEnabled: boolean;
  kybEnabled: boolean;
  fraudEnabled: boolean;
  socEnabled: boolean;
  systemEnabled: boolean;
  reportEnabled: boolean;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  wishlistExpiryAlerts: boolean;
  sentimentAlertEnabled: boolean;
  sentimentAlertThreshold: number | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
};

const DEFAULTS: PrefsState = {
  bisEnabled: true,
  kybEnabled: true,
  fraudEnabled: true,
  socEnabled: true,
  systemEnabled: true,
  reportEnabled: true,
  inAppEnabled: true,
  emailEnabled: false,
  wishlistExpiryAlerts: true,
  sentimentAlertEnabled: false,
  sentimentAlertThreshold: 60,
  quietHoursStart: null,
  quietHoursEnd: null,
};

// ─── Toggle Card ──────────────────────────────────────────────────────────────

function ToggleCard({
  icon: Icon,
  label,
  description,
  color,
  bg,
  checked,
  onChange,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
  bg: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border transition-all ${checked ? "border-border bg-white/3" : "border-border/30 bg-white/1 opacity-60"}`}>
      <div className={`w-8 h-8 rounded-md ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <Label htmlFor={label} className="text-xs font-semibold text-foreground cursor-pointer">
          {label}
        </Label>
        <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch
        id={label}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="shrink-0 mt-0.5"
      />
    </div>
  );
}

// ─── Push Notification Card ──────────────────────────────────────────────────

function PushNotificationCard() {
  const { isSupported, isSubscribed, isLoading, permissionState, subscribe, unsubscribe, sendTest } = usePushNotifications();
  if (!isSupported) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg border border-border/30 bg-white/1 opacity-60">
        <div className="w-8 h-8 rounded-md bg-orange-500/10 flex items-center justify-center shrink-0 mt-0.5">
          <BellRing className="w-4 h-4 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <Label className="text-xs font-semibold text-foreground">Push Notifications</Label>
          <p className="text-[10px] text-muted-foreground mt-0.5">Not supported in this browser.</p>
        </div>
      </div>
    );
  }
  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border transition-all ${isSubscribed ? "border-border bg-white/3" : "border-border/30 bg-white/1 opacity-60"}`}>
      <div className="w-8 h-8 rounded-md bg-orange-500/10 flex items-center justify-center shrink-0 mt-0.5">
        <BellRing className="w-4 h-4 text-orange-400" />
      </div>
      <div className="flex-1 min-w-0">
        <Label className="text-xs font-semibold text-foreground">Push Notifications</Label>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {permissionState === "denied"
            ? "Blocked by browser — allow in site settings to enable."
            : "Receive payment alerts on this device even when the app is closed."}
        </p>
        {isSubscribed && (
          <button
            onClick={sendTest}
            className="mt-1 flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <TestTube className="w-3 h-3" />
            Send test notification
          </button>
        )}
      </div>
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0 mt-1" />
      ) : (
        <Switch
          checked={isSubscribed}
          onCheckedChange={(v) => (v ? subscribe() : unsubscribe())}
          disabled={permissionState === "denied"}
          className="shrink-0 mt-0.5"
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<PrefsState>(DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.notifPrefs.get.useQuery();

  const updateMutation = trpc.notifPrefs.update.useMutation({
    onSuccess: () => {
      toast.success("Notification preferences saved");
      setSaved(true);
      setDirty(false);
      utils.notifPrefs.get.invalidate();
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => toast.error(err.message),
  });

  const resetMutation = trpc.notifPrefs.reset.useMutation({
    onSuccess: (data) => {
      setPrefs({
        bisEnabled: data.bisEnabled,
        kybEnabled: data.kybEnabled,
        fraudEnabled: data.fraudEnabled,
        socEnabled: data.socEnabled,
        systemEnabled: data.systemEnabled,
        reportEnabled: data.reportEnabled,
        inAppEnabled: data.inAppEnabled,
        emailEnabled: data.emailEnabled,
        wishlistExpiryAlerts: (data as { wishlistExpiryAlerts?: boolean }).wishlistExpiryAlerts ?? true,
        sentimentAlertEnabled: (data as { sentimentAlertThreshold?: number | null }).sentimentAlertThreshold != null,
        sentimentAlertThreshold: (data as { sentimentAlertThreshold?: number | null }).sentimentAlertThreshold ?? 60,
        quietHoursStart: data.quietHoursStart ?? null,
        quietHoursEnd: data.quietHoursEnd ?? null,
      });
      setDirty(false);
      toast.success("Preferences reset to defaults");
      utils.notifPrefs.get.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Populate state from server data
  useEffect(() => {
    if (!data) return;
    setPrefs({
      bisEnabled: data.bisEnabled,
      kybEnabled: data.kybEnabled,
      fraudEnabled: data.fraudEnabled,
      socEnabled: data.socEnabled,
      systemEnabled: data.systemEnabled,
      reportEnabled: data.reportEnabled,
      inAppEnabled: data.inAppEnabled,
      emailEnabled: data.emailEnabled,
      wishlistExpiryAlerts: (data as { wishlistExpiryAlerts?: boolean }).wishlistExpiryAlerts ?? true,
      sentimentAlertEnabled: (data as { sentimentAlertThreshold?: number | null }).sentimentAlertThreshold != null,
      sentimentAlertThreshold: (data as { sentimentAlertThreshold?: number | null }).sentimentAlertThreshold ?? 60,
      quietHoursStart: data.quietHoursStart ?? null,
      quietHoursEnd: data.quietHoursEnd ?? null,
    });
  }, [data]);

  const toggle = (key: PrefKey) => (value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = () => {
    updateMutation.mutate({
      bisEnabled: prefs.bisEnabled,
      kybEnabled: prefs.kybEnabled,
      fraudEnabled: prefs.fraudEnabled,
      socEnabled: prefs.socEnabled,
      systemEnabled: prefs.systemEnabled,
      reportEnabled: prefs.reportEnabled,
      inAppEnabled: prefs.inAppEnabled,
      emailEnabled: prefs.emailEnabled,
      wishlistExpiryAlerts: prefs.wishlistExpiryAlerts,
      sentimentAlertThreshold: prefs.sentimentAlertEnabled ? (prefs.sentimentAlertThreshold ?? 60) : null,
      quietHoursStart: prefs.quietHoursStart || null,
      quietHoursEnd: prefs.quietHoursEnd || null,
    });
  };

  const allOn = CATEGORIES.every((c) => prefs[c.key]);
  const toggleAll = (on: boolean) => {
    setPrefs((p) => ({
      ...p,
      bisEnabled: on,
      kybEnabled: on,
      fraudEnabled: on,
      socEnabled: on,
      systemEnabled: on,
      reportEnabled: on,
    }));
    setDirty(true);
    setSaved(false);
  };

  return (
    <div className="p-6 min-h-full max-w-2xl">
      <PageHeader
        title="Notification Settings"
        subtitle="Choose which alerts you receive and how they are delivered"
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-border bg-white/5"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs bg-primary hover:bg-primary/90"
              onClick={handleSave}
              disabled={!dirty || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : saved ? (
                <CheckCircle className="w-3 h-3 mr-1 text-emerald-400" />
              ) : (
                <Save className="w-3 h-3 mr-1" />
              )}
              {saved ? "Saved" : "Save Changes"}
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading preferences...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Category Toggles */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                Notification Categories
              </h3>
              <button
                className="text-[10px] text-primary hover:underline font-mono"
                onClick={() => toggleAll(!allOn)}
              >
                {allOn ? "Disable all" : "Enable all"}
              </button>
            </div>
            <div className="space-y-2">
              {CATEGORIES.map((cat) => (
                <ToggleCard
                  key={cat.key}
                  icon={cat.icon}
                  label={cat.label}
                  description={cat.description}
                  color={cat.color}
                  bg={cat.bg}
                  checked={prefs[cat.key]}
                  onChange={toggle(cat.key)}
                />
              ))}
            </div>
          </section>

          {/* Delivery Channels */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              Delivery Channels
            </h3>
            <div className="space-y-2">
              <ToggleCard
                icon={Smartphone}
                label="In-App Notifications"
                description="Show notifications in the bell menu inside the platform."
                color="text-primary"
                bg="bg-primary/10"
                checked={prefs.inAppEnabled}
                onChange={toggle("inAppEnabled")}
              />
              <ToggleCard
                icon={Mail}
                label="Email Notifications"
                description="Send a copy to your registered email address. (Coming soon)"
                color="text-muted-foreground"
                bg="bg-white/5"
                checked={prefs.emailEnabled}
                onChange={toggle("emailEnabled")}
                disabled
              />
              {/* Web Push Notifications */}
              <PushNotificationCard />
            </div>
          </section>

          {/* Tourist Alerts */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              Tourist Alerts
            </h3>
            <div className="space-y-2">
              <ToggleCard
                icon={Heart}
                label="Wishlist Deal Expiry Alerts"
                description="Get notified 48 hours before a deal you saved is about to expire."
                color="text-rose-400"
                bg="bg-rose-500/10"
                checked={prefs.wishlistExpiryAlerts}
                onChange={toggle("wishlistExpiryAlerts")}
              />
            </div>
          </section>

          {/* Merchant Alerts */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              Merchant Alerts
            </h3>
            <div className="space-y-2">
              <ToggleCard
                icon={TrendingDown}
                label="Sentiment Drop Alerts"
                description="Get notified when a venue's positive review rate falls below your set threshold."
                color="text-orange-400"
                bg="bg-orange-500/10"
                checked={prefs.sentimentAlertEnabled}
                onChange={(v) => {
                  setPrefs((p) => ({ ...p, sentimentAlertEnabled: v }));
                  setDirty(true);
                  setSaved(false);
                }}
              />
              {prefs.sentimentAlertEnabled && (
                <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-white/3 ml-0">
                  <TrendingDown className="w-4 h-4 text-orange-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs font-semibold text-foreground">Alert Threshold</Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Send alert when positive review % drops below this value.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={prefs.sentimentAlertThreshold ?? 60}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                        setPrefs((p) => ({ ...p, sentimentAlertThreshold: v }));
                        setDirty(true);
                        setSaved(false);
                      }}
                      className="w-16 bg-white/5 border border-border rounded px-2 py-1 text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Quiet Hours */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              Quiet Hours
            </h3>
            <p className="text-[10px] text-muted-foreground mb-3">
              Suppress non-critical notifications during a time window. Leave blank to disable.
            </p>
            <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-white/3">
              <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
              <div className="flex items-center gap-2 flex-1">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">From</label>
                  <input
                    type="time"
                    value={prefs.quietHoursStart ?? ""}
                    onChange={(e) => {
                      setPrefs((p) => ({ ...p, quietHoursStart: e.target.value || null }));
                      setDirty(true);
                    }}
                    className="bg-white/5 border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-28"
                  />
                </div>
                <span className="text-muted-foreground text-xs mt-4">—</span>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">To</label>
                  <input
                    type="time"
                    value={prefs.quietHoursEnd ?? ""}
                    onChange={(e) => {
                      setPrefs((p) => ({ ...p, quietHoursEnd: e.target.value || null }));
                      setDirty(true);
                    }}
                    className="bg-white/5 border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-28"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Unsaved changes banner */}
          {dirty && (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center justify-between">
              <p className="text-[10px] text-amber-400">You have unsaved changes.</p>
              <Button
                size="sm"
                className="h-6 text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                Save now
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
