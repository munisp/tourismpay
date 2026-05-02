import { useState, useEffect } from "react";
import { Eye, EyeOff, Trophy, Shield, Loader2, CheckCircle, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import PageHeader from "@/components/shared/PageHeader";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function PrivacySettings() {
  const utils = trpc.useUtils();

  // Fetch unified privacy settings (leaderboard opt-out + hide transaction history)
  const { data: privacyData, isLoading } = trpc.loyalty.getPrivacySettings.useQuery();

  const [leaderboardOptOut, setLeaderboardOptOut] = useState(false);
  const [hideTransactionHistory, setHideTransactionHistory] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync server state into local state once loaded
  useEffect(() => {
    if (privacyData !== undefined) {
      setLeaderboardOptOut(privacyData.leaderboardOptOut);
      setHideTransactionHistory(privacyData.hideTransactionHistory);
    }
  }, [privacyData]);

  const setPrivacyMut = trpc.loyalty.setPrivacySettings.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      utils.loyalty.getPrivacySettings.invalidate();
      utils.loyalty.getLeaderboardPrivacy.invalidate();
      toast.success("Privacy settings saved");
    },
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });

  const handleSave = () => {
    setPrivacyMut.mutate({ leaderboardOptOut, hideTransactionHistory });
  };

  const isDirty =
    privacyData !== undefined &&
    (leaderboardOptOut !== privacyData.leaderboardOptOut ||
      hideTransactionHistory !== privacyData.hideTransactionHistory);

  return (
    <div className="p-6 min-h-full max-w-2xl">
      <PageHeader
        title="Privacy Settings"
        subtitle="Control how your information appears to other users and administrators on the platform"
      />

      <div className="space-y-4">
        {/* Leaderboard Privacy Card */}
        <div
          className="glass-card p-5 animate-fade-in-up opacity-0"
          style={{ animationFillMode: "forwards" }}
        >
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-amber-500/10 shrink-0">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3
                    className="text-sm font-semibold text-foreground"
                    style={{ fontFamily: "Space Grotesk, sans-serif" }}
                  >
                    Loyalty Leaderboard Visibility
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    When enabled, your name will appear as{" "}
                    <span className="font-mono text-foreground">"Anonymous"</span> on the public
                    leaderboard. Your rank and points are still tracked internally — only your
                    display name is hidden.
                  </p>
                </div>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                ) : (
                  <Switch
                    id="leaderboard-opt-out"
                    checked={leaderboardOptOut}
                    onCheckedChange={setLeaderboardOptOut}
                    disabled={setPrivacyMut.isPending}
                  />
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                {leaderboardOptOut ? (
                  <div className="flex items-center gap-1.5 text-xs text-amber-400">
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>You will appear as "Anonymous" on the leaderboard</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <Eye className="w-3.5 h-3.5" />
                    <span>Your name is visible on the leaderboard</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Transaction History Privacy Card */}
        <div
          className="glass-card p-5 animate-fade-in-up opacity-0"
          style={{ animationDelay: "60ms", animationFillMode: "forwards" }}
        >
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-violet-500/10 shrink-0">
              <History className="w-5 h-5 text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3
                    className="text-sm font-semibold text-foreground"
                    style={{ fontFamily: "Space Grotesk, sans-serif" }}
                  >
                    Transaction History Visibility
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    When enabled, your loyalty transaction history will be excluded from
                    administrator CSV exports and platform-wide reports. Your own history remains
                    fully visible to you in the Loyalty &amp; Rewards section.
                  </p>
                </div>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                ) : (
                  <Switch
                    id="hide-transaction-history"
                    checked={hideTransactionHistory}
                    onCheckedChange={setHideTransactionHistory}
                    disabled={setPrivacyMut.isPending}
                  />
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                {hideTransactionHistory ? (
                  <div className="flex items-center gap-1.5 text-xs text-amber-400">
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Your transaction history is excluded from admin exports</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <Eye className="w-3.5 h-3.5" />
                    <span>Your transaction history is included in admin exports</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Data & Account Privacy Card */}
        <div
          className="glass-card p-5 animate-fade-in-up opacity-0"
          style={{ animationDelay: "120ms", animationFillMode: "forwards" }}
        >
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-blue-500/10 shrink-0">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className="text-sm font-semibold text-foreground"
                style={{ fontFamily: "Space Grotesk, sans-serif" }}
              >
                Account Data
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Your personal data is stored securely and is never shared with third parties without
                your consent. Transaction history, investigation reports, and KYB documents are
                encrypted at rest.
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>End-to-end encryption enabled</span>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            {isDirty ? "You have unsaved changes." : "All changes are saved."}
          </p>
          <Button
            onClick={handleSave}
            disabled={!isDirty || setPrivacyMut.isPending}
            className="h-8 text-xs"
          >
            {setPrivacyMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
            ) : null}
            {saved ? "Saved!" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
