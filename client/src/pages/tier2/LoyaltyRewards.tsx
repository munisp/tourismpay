import { Award, Star, Gift, Zap, TrendingUp, Clock, CheckCircle, XCircle, Trophy, X, ShieldAlert, Share2, Copy, Users, FileDown, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import TierUpCelebrationModal from "@/components/TierUpCelebrationModal";

const TIER_COLORS: Record<string, string> = {
  BRONZE: "text-[oklch(0.72_0.12_50)]",
  SILVER: "text-[oklch(0.82_0.05_240)]",
  GOLD: "text-[oklch(0.82_0.18_75)]",
  PLATINUM: "text-[oklch(0.85_0.12_200)]",
};

const TIER_THRESHOLDS: Record<string, number> = {
  BRONZE: 0,
  SILVER: 5000,
  GOLD: 20000,
  PLATINUM: 50000,
};

const CATEGORY_ICONS: Record<string, string> = {
  accommodation: "🏨",
  transport: "🚗",
  experience: "🌍",
  dining: "🍽️",
  wellness: "💆",
  culture: "🏛️",
  general: "🎁",
};

const TIER_UPGRADE_INFO: Record<string, { headline: string; subtitle: string; gradientFrom: string; gradientTo: string }> = {
  SILVER: {
    headline: "Welcome to Silver Tier!",
    subtitle: "You now enjoy 1.5x points multiplier, priority customer support, and exclusive Silver member discounts.",
    gradientFrom: "oklch(0.82_0.05_240)",
    gradientTo: "oklch(0.65_0.10_200)",
  },
  GOLD: {
    headline: "Congratulations — You've reached Gold!",
    subtitle: "2x points multiplier, dedicated account manager, and complimentary lounge access await you.",
    gradientFrom: "oklch(0.82_0.18_75)",
    gradientTo: "oklch(0.72_0.18_50)",
  },
  PLATINUM: {
    headline: "You've achieved Platinum status!",
    subtitle: "3x points multiplier, personal concierge, unlimited lounge access, and Platinum VIP benefits are yours.",
    gradientFrom: "oklch(0.85_0.12_200)",
    gradientTo: "oklch(0.75_0.08_240)",
  },
};

export default function LoyaltyRewards() {
  const { user } = useAuth();
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [upgradedTier, setUpgradedTier] = useState<string | null>(null);

  const { data: account, refetch: refetchAccount } = trpc.loyalty.account.useQuery();
  const { data: txData, refetch: refetchTx } = trpc.loyalty.transactions.useQuery({ limit: 10, offset: 0 });
  const { data: partnersData } = trpc.loyalty.getPartners.useQuery(undefined);
  const partners = partnersData?.partners ?? [];
  const earnWithPartnerMut = trpc.loyalty.earnWithPartner.useMutation({
    onSuccess: (data) => {
      toast.success(`Earned ${data.finalPoints.toLocaleString()} pts via ${data.partnerName}${data.bonusPoints > 0 ? ` (+${data.bonusPoints} bonus!)` : ""}`);
      refetchAccount();
      refetchTx();
    },
    onError: (e) => toast.error(e.message),
  });
  const { data: rewards } = trpc.loyalty.rewards.useQuery();
  const { data: expiringData } = trpc.loyalty.getExpiringRewards.useQuery(undefined, { refetchInterval: 60_000 });
  const expiringRewards = expiringData?.rewards ?? [];
  const { data: expiringPointsData } = trpc.loyalty.getExpiringPoints.useQuery(undefined, { refetchInterval: 300_000 });
  const expiringPointsItems = expiringPointsData?.expiringSoon ?? [];
  const totalExpiringPoints = expiringPointsData?.totalExpiringSoon ?? 0;

  // Referral
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [applyCode, setApplyCode] = useState("");
  const { data: referralsData, refetch: refetchReferrals } = trpc.loyalty.getReferrals.useQuery();
  const [leaderboardFilter, setLeaderboardFilter] = useState<"allTime" | "monthly" | "weekly">("allTime");
  const { data: leaderboardData } = trpc.loyalty.getLeaderboard.useQuery(
    { limit: 20, timeFilter: leaderboardFilter },
    { refetchInterval: 60_000 }
  );
  const leaderboardEntries = (leaderboardData?.entries ?? []) as any[];
  const currentUserRank = leaderboardData?.currentUserRank ?? null;
  const myLeaderboardPoints = leaderboardData?.myPoints ?? 0;
  const myLeaderboardTier = (leaderboardData?.myTier ?? "BRONZE") as string;
  const pointsAboveMe = leaderboardData?.pointsAboveMe ?? null;
  const pointsGap = pointsAboveMe !== null ? Math.max(0, pointsAboveMe - myLeaderboardPoints) : null;
  const progressPct = (pointsAboveMe !== null && pointsAboveMe > 0)
    ? Math.min(100, Math.round((myLeaderboardPoints / pointsAboveMe) * 100))
    : null;
  const createReferralMut = trpc.loyalty.createReferralCode.useMutation({
    onSuccess: (data) => { setReferralCode(data.code); refetchReferrals(); toast.success("Referral code generated!"); },
    onError: (e) => toast.error(e.message),
  });
  const applyReferralMut = trpc.loyalty.applyReferral.useMutation({
    onSuccess: (data) => {
      toast.success(`Referral applied! You earned ${data.refereeBonus} bonus points.`);
      setApplyCode(""); refetchAccount(); refetchTx(); refetchReferrals();
    },
    onError: (e) => toast.error(e.message),
  });

  // Auto-dismiss tier upgrade banner after 8 seconds
  useEffect(() => {
    if (!upgradedTier) return;
    const timer = setTimeout(() => setUpgradedTier(null), 8000);
    return () => clearTimeout(timer);
  }, [upgradedTier]);

  const redeemMutation = trpc.loyalty.redeem.useMutation({
    onSuccess: (data) => {
      toast.success(`Redeemed! Remaining balance: ${data.remainingBalance.toLocaleString()} pts`);
      refetchAccount();
      refetchTx();
      setRedeemingId(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setRedeemingId(null);
    },
  });

  const earnMutation = trpc.loyalty.earn.useMutation({
    onSuccess: (data) => {
      if (data.tierUpgraded && TIER_UPGRADE_INFO[data.newTier]) {
        // Show the upgrade banner
        setUpgradedTier(data.newTier);
        // Also fire a special toast
        toast.success(`🎉 Tier upgraded to ${data.newTier}!`, {
          description: TIER_UPGRADE_INFO[data.newTier].subtitle,
          duration: 6000,
        });
      } else {
        toast.success(`Earned ${data.pointsEarned.toLocaleString()} points! Tier: ${data.newTier}`);
      }
      refetchAccount();
      refetchTx();
    },
    onError: (err) => toast.error(err.message),
  });

  const balance = account?.pointsBalance ?? 0;
  const tier = account?.tier ?? "BRONZE";
  const lifetime = account?.lifetimePoints ?? 0;
  const tokenValue = (balance * 0.01).toFixed(2);

  const tierOrder = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];
  const currentTierIdx = tierOrder.indexOf(tier);
  const nextTier = tierOrder[currentTierIdx + 1];
  const nextThreshold = nextTier ? TIER_THRESHOLDS[nextTier] : null;
  const currentThreshold = TIER_THRESHOLDS[tier] ?? 0;
  const progress = nextThreshold
    ? Math.min(100, ((lifetime - currentThreshold) / (nextThreshold - currentThreshold)) * 100)
    : 100;

  const handleRedeem = (reward: { id: string; name: string; pointsCost: number; partner: string }) => {
    setRedeemingId(reward.id);
    redeemMutation.mutate({ rewardId: reward.id, rewardName: reward.name, pointsCost: reward.pointsCost, partner: reward.partner });
  };

  const upgradeInfo = upgradedTier ? TIER_UPGRADE_INFO[upgradedTier] : null;

  return (
    <div className="p-6 min-h-full">
      {/* Tier-up celebration modal — fires once per tier advance via localStorage guard */}
      {user && account?.tier && (
        <TierUpCelebrationModal userId={user.id} currentTier={account.tier} userName={user.name ?? undefined} />
      )}
      <PageHeader title="Loyalty and Rewards" subtitle="Earn points · Redeem rewards · Advance your tier" />

      {/* Tier Downgrade Grace Period Warning Banner */}
      {account?.isInGracePeriod && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3 animate-fade-in-up opacity-0" style={{ animationFillMode: "forwards" }}>
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300">
              Tier Protection Active — {account.gracePeriodDaysLeft} day{account.gracePeriodDaysLeft === 1 ? "" : "s"} remaining
            </p>
            <p className="text-xs text-amber-200/80 mt-0.5">
              Your points balance dropped below the {account.tier} threshold. Your tier is protected until{" "}
              {account.tierProtectedUntil ? new Date(account.tierProtectedUntil).toLocaleDateString() : "—"}.
              {account.naturalTier && account.naturalTier !== account.tier && (
                <> Without protection, your tier would be <span className="font-semibold">{account.naturalTier}</span>.</>
              )}
              {" "}Earn more points to maintain your {account.tier} status permanently.
            </p>
          </div>
        </div>
      )}

      {/* Tier Upgrade Banner */}
      {upgradeInfo && upgradedTier && (
        <div
          className="relative mb-6 rounded-xl overflow-hidden animate-fade-in-up opacity-0 border border-white/20"
          style={{
            background: `linear-gradient(135deg, ${upgradeInfo.gradientFrom}, ${upgradeInfo.gradientTo})`,
            animationFillMode: "forwards",
          }}
        >
          <div className="p-5 flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-white" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {upgradeInfo.headline}
              </p>
              <p className="text-sm text-white/80 mt-1">{upgradeInfo.subtitle}</p>
            </div>
            <button
              onClick={() => setUpgradedTier(null)}
              className="shrink-0 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <X className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
          {/* Animated shimmer */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
              animation: "shimmer 2s infinite",
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 stagger-children">
        <StatCard label="TP Points Balance" value={balance.toLocaleString()} color="amber" icon={Star} animationDelay={0} />
        <StatCard label="Token Value" value={`$${tokenValue}`} color="green" icon={Zap} animationDelay={50} />
        <StatCard label="Rewards Available" value={String(rewards?.length ?? 0)} color="blue" icon={Gift} animationDelay={100} />
        <StatCard label="Tier" value={tier} color="amber" icon={Award} animationDelay={150} />
      </div>

      <div className="glass-card p-5 mb-4 animate-fade-in-up opacity-0" style={{ animationDelay: "180ms", animationFillMode: "forwards" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Tier Progress</h3>
          <span className={`text-sm font-bold ${TIER_COLORS[tier] ?? "text-primary"}`}>{tier}</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2 mb-2">
          <div className="h-2 rounded-full bg-gradient-to-r from-primary to-[oklch(0.82_0.18_75)] transition-all duration-700" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{lifetime.toLocaleString()} lifetime pts</span>
          {nextTier ? <span>{nextThreshold?.toLocaleString()} pts for {nextTier}</span> : <span>Maximum tier reached</span>}
        </div>
        <div className="mt-3">
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => earnMutation.mutate({ points: 500, description: "Activity bonus", partner: "TourismPay" })} disabled={earnMutation.isPending}>
            <TrendingUp className="w-3 h-3 mr-1" />
            {earnMutation.isPending ? "Earning..." : "Simulate Earn (+500 pts)"}
          </Button>
        </div>
      </div>

      {/* Points Balance Expiring Soon Banner */}
      {expiringPointsItems.length > 0 && (
        <div className="mb-4 rounded-xl border border-orange-500/40 bg-orange-500/10 p-4 flex items-start gap-3 animate-fade-in-up opacity-0" style={{ animationFillMode: "forwards" }}>
          <Clock className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-orange-300">
              {totalExpiringPoints.toLocaleString()} points expiring within 30 days
            </p>
            <p className="text-xs text-orange-200/80 mt-0.5">
              You have {expiringPointsItems.length} earn transaction{expiringPointsItems.length !== 1 ? "s" : ""} expiring soon.
              The soonest expires in {expiringPointsItems[0]?.daysLeft ?? 0} day{expiringPointsItems[0]?.daysLeft === 1 ? "" : "s"}.
              Redeem your points for rewards before they expire!
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {expiringPointsItems.slice(0, 3).map((item) => (
                <span key={item.id} className="text-[10px] font-mono bg-orange-500/20 text-orange-300 border border-orange-500/30 px-1.5 py-0.5 rounded">
                  {item.points.toLocaleString()} pts · {item.daysLeft}d left
                </span>
              ))}
              {expiringPointsItems.length > 3 && (
                <span className="text-[10px] text-orange-300/60">+{expiringPointsItems.length - 3} more</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rewards Expiring Soon Section */}
      {expiringRewards.length > 0 && (
        <div className="glass-card p-5 mb-4 border border-amber-500/20 animate-fade-in-up opacity-0" style={{ animationDelay: "190ms", animationFillMode: "forwards" }}>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-400" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              Rewards Expiring Soon
            </h3>
            <span className="text-[10px] font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded">
              {expiringRewards.length} reward{expiringRewards.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-2">
            {expiringRewards.map((r) => (
              <div
                key={r.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${r.isUrgent ? "bg-red-500/10 border-red-500/20" : "bg-amber-500/10 border-amber-500/20"}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg">{CATEGORY_ICONS[r.category ?? "general"] ?? "🎁"}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{r.name}</p>
                    <p className="text-[10px] text-muted-foreground">{r.partner ?? "TourismPay"} · {r.pointsCost.toLocaleString()} pts</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${r.isUrgent ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"}`}>
                    {r.daysLeft === 0 ? "Today" : r.daysLeft === 1 ? "1 day left" : `${r.daysLeft}d left`}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Redeem these rewards before they expire to avoid losing the opportunity.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-5 animate-fade-in-up opacity-0" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
          <h3 className="text-sm font-semibold text-foreground mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Redeem Points</h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {(rewards ?? []).map((r) => {
              const canAfford = balance >= r.pointsCost;
              const isRedeeming = redeemingId === r.id;
              const expiringSoon = (r as any).expiringSoon as boolean | undefined;
              const expiresAt = (r as any).expiresAt as number | null | undefined;
              const daysLeft = expiresAt ? Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)) : null;
              return (
                <div key={r.id} className={`flex items-center justify-between p-3 rounded-md transition-colors ${
                  expiringSoon ? "bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15" : "bg-white/3 hover:bg-white/5"
                }`}>
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{CATEGORY_ICONS[r.category] ?? "🎁"}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-foreground">{r.name}</p>
                        {expiringSoon && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            ⏰ {daysLeft}d left
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{r.partner}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-mono ${canAfford ? "text-[oklch(0.82_0.18_75)]" : "text-muted-foreground"}`}>{r.pointsCost.toLocaleString()} pts</span>
                    <Button size="sm" className={`h-6 text-[10px] ${canAfford ? "bg-primary text-primary-foreground" : "opacity-40"}`} disabled={!canAfford || isRedeeming} onClick={() => canAfford && handleRedeem(r)}>
                      {isRedeeming ? "..." : "Redeem"}
                    </Button>
                  </div>
                </div>
              );
            })}
            {(!rewards || rewards.length === 0) && <p className="text-xs text-muted-foreground text-center py-4">No rewards available</p>}
          </div>
        </div>

        {/* ─── Partners Section ─── */}
        {partners.length > 0 && (
          <div className="glass-card p-5 mb-4 animate-fade-in-up opacity-0" style={{ animationDelay: "240ms", animationFillMode: "forwards" }}>
            <h3 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Partner Earn Opportunities</h3>
            <p className="text-xs text-muted-foreground mb-3">Earn bonus points by transacting with our loyalty partners. Multipliers apply automatically.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {partners.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-border/30 hover:bg-white/8 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    {p.logoUrl ? (
                      <img src={p.logoUrl} alt={p.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <span className="text-sm">{CATEGORY_ICONS[p.category] ?? "🎁"}</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{p.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono font-bold text-[oklch(0.82_0.18_75)] bg-[oklch(0.82_0.18_75)]/10 border border-[oklch(0.82_0.18_75)]/20 px-1.5 py-0.5 rounded">
                      {p.bonusMultiplier}x
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      disabled={earnWithPartnerMut.isPending}
                      onClick={() => earnWithPartnerMut.mutate({ partnerId: p.id, basePoints: 100 })}
                    >
                      +100 pts
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* ─── Referral Program ─── */}
        <div className="glass-card p-5 animate-fade-in-up opacity-0" style={{ animationDelay: "240ms", animationFillMode: "forwards" }}>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Referral Program</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Earn 500 pts when a friend joins using your code. They get 250 pts too.</p>
          {/* Generate referral code */}
          {!referralsData?.sent?.find(r => r.status === "pending") && !referralCode ? (
            <Button size="sm" variant="outline" className="h-7 text-[10px] mb-3" onClick={() => createReferralMut.mutate()} disabled={createReferralMut.isPending}>
              <Share2 className="w-3 h-3 mr-1" />{createReferralMut.isPending ? "Generating..." : "Generate My Referral Code"}
            </Button>
          ) : (
            <div className="flex items-center gap-2 mb-3">
              <span className="font-mono text-sm font-bold text-primary bg-primary/10 border border-primary/30 px-3 py-1.5 rounded-lg">
                {referralCode ?? referralsData?.sent?.find(r => r.status === "pending")?.code}
              </span>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                const code = referralCode ?? referralsData?.sent?.find(r => r.status === "pending")?.code ?? "";
                navigator.clipboard.writeText(code).then(() => toast.success("Code copied!"));
              }}><Copy className="w-3 h-3" /></Button>
            </div>
          )}
          {/* Apply a referral code */}
          {!referralsData?.received && (
            <div className="flex gap-2 mt-1">
              <input
                className="flex-1 h-7 text-xs bg-white/5 border border-white/15 rounded px-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="Enter a friend's referral code"
                value={applyCode}
                onChange={e => setApplyCode(e.target.value.toUpperCase())}
                maxLength={20}
              />
              <Button size="sm" className="h-7 text-[10px]" onClick={() => applyReferralMut.mutate({ code: applyCode })} disabled={!applyCode.trim() || applyReferralMut.isPending}>
                {applyReferralMut.isPending ? "Applying..." : "Apply"}
              </Button>
            </div>
          )}
          {referralsData?.received && (
            <p className="text-[10px] text-green-400 mt-1">✓ You used a referral code and earned {referralsData.received.refereePointsAwarded} bonus points.</p>
          )}
          {/* Referral history */}
          {(referralsData?.sent?.filter(r => r.status === "completed") ?? []).length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <p className="text-[10px] text-muted-foreground mb-1.5">Completed referrals: {referralsData?.sent?.filter(r => r.status === "completed").length}</p>
              <div className="space-y-1">
                {referralsData?.sent?.filter(r => r.status === "completed").slice(0, 3).map(r => (
                  <div key={r.id} className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="font-mono">{r.code}</span>
                    <span className="text-green-400">+{r.referrerPointsAwarded} pts · {r.usedAt ? new Date(r.usedAt).toLocaleDateString() : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div className="glass-card p-5 animate-fade-in-up opacity-0" style={{ animationDelay: "220ms", animationFillMode: "forwards" }}>
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Leaderboard</h3>
            {currentUserRank && (
              <span className="ml-auto text-[10px] text-muted-foreground">Your rank: <span className="font-bold text-foreground">#{currentUserRank}</span></span>
            )}
          </div>
          {/* Time filter toggle */}
          <div className="flex gap-1 mb-3">
            {(["weekly", "monthly", "allTime"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setLeaderboardFilter(f)}
                className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors border ${
                  leaderboardFilter === f
                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                    : "text-muted-foreground hover:text-foreground border-transparent hover:border-white/10"
                }`}
              >
                {f === "weekly" ? "This Week" : f === "monthly" ? "This Month" : "All Time"}
              </button>
            ))}
          </div>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
            {leaderboardEntries.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No leaderboard data yet. Start earning points!</p>
            )}
            {leaderboardEntries.map((entry: any) => {
              const tierColors: Record<string, string> = {
                BRONZE: "text-[oklch(0.72_0.12_50)]",
                SILVER: "text-[oklch(0.82_0.05_240)]",
                GOLD: "text-[oklch(0.82_0.18_75)]",
                PLATINUM: "text-[oklch(0.85_0.12_200)]",
              };
              const rankBg = entry.rank === 1 ? "bg-yellow-500/15 border-yellow-500/30" : entry.rank === 2 ? "bg-gray-400/10 border-gray-400/20" : entry.rank === 3 ? "bg-amber-700/10 border-amber-700/20" : "bg-white/3 border-transparent";
              return (
                <div key={entry.userId} className={`flex items-center gap-2.5 p-2 rounded-md border ${rankBg} ${entry.isCurrentUser ? "ring-1 ring-primary/40" : ""}`}>
                  <span className="w-6 text-center text-xs font-bold text-muted-foreground shrink-0">
                    {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {entry.displayName}{entry.isCurrentUser && <span className="ml-1 text-[10px] text-primary">(you)</span>}
                      </p>
                      {(entry as any).badges?.includes("top10") && (
                        <span title="Top 10 this period" className="text-[10px] shrink-0">⭐</span>
                      )}
                      {(entry as any).badges?.includes("streak") && (
                        <span title="7-day earning streak" className="text-[10px] shrink-0">🔥</span>
                      )}
                      {(entry as any).badges?.includes("highEarner") && (
                        <span title="10,000+ lifetime points" className="text-[10px] shrink-0">💎</span>
                      )}
                    </div>
                    <p className={`text-[10px] font-semibold ${tierColors[entry.tier] ?? "text-muted-foreground"}`}>{entry.tier}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono font-bold text-foreground">{entry.totalEarned.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">pts earned</p>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Personal rank card — sticky, shown when user is outside top 20 */}
          {currentUserRank !== null && !leaderboardEntries.some((e: any) => e.isCurrentUser) && (
            <>
              <div className="mt-3 flex items-center gap-2.5 p-2.5 rounded-md border border-primary/30 bg-primary/5 ring-1 ring-primary/20">
                <span className="w-6 text-center text-xs font-bold text-primary shrink-0">#{currentUserRank}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">You <span className="text-[10px] text-primary">(your rank)</span></p>
                  <p className={`text-[10px] font-semibold ${
                    myLeaderboardTier === "PLATINUM" ? "text-[oklch(0.85_0.12_200)]" :
                    myLeaderboardTier === "GOLD" ? "text-[oklch(0.82_0.18_75)]" :
                    myLeaderboardTier === "SILVER" ? "text-[oklch(0.82_0.05_240)]" :
                    "text-[oklch(0.72_0.12_50)]"
                  }`}>{myLeaderboardTier}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-mono font-bold text-foreground">{myLeaderboardPoints.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">pts earned</p>
                </div>
              </div>
              {/* Progress bar to next rank */}
              {progressPct !== null && pointsGap !== null && pointsGap > 0 && (
                <div className="mt-2 px-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-muted-foreground">Progress to rank #{(currentUserRank ?? 2) - 1}</span>
                    <span className="text-[10px] font-mono text-primary">{pointsGap.toLocaleString()} pts needed</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-700"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{progressPct}% of the way there</p>
                </div>
              )}
              {progressPct === 100 && (
                <p className="text-[10px] text-green-400 mt-1.5 px-1 text-center">You have enough points to move up — keep earning to secure your rank!</p>
              )}
            </>
           )}
          {/* Milestone badge legend */}
          <div className="mt-3 pt-3 border-t border-white/5">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5">Achievement Badges</p>
            <div className="flex flex-wrap gap-3">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span>⭐</span> Top 10 this period</span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span>🔥</span> 7-day earning streak</span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span>💎</span> 10k+ lifetime points</span>
            </div>
          </div>
        </div>
        <div className="glass-card p-5 animate-fade-in-up opacity-0" style={{ animationDelay: "250ms", animationFillMode: "forwards" }}>
          <h3 className="text-sm font-semibold text-foreground mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Points History</h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {(txData?.items ?? []).map((tx) => {
              const isEarn = tx.points > 0;
              return (
                <div key={tx.id} className="flex items-center justify-between p-2.5 rounded-md bg-white/3">
                  <div className="flex items-center gap-2">
                    {isEarn ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                    <div>
                      <p className="text-xs text-foreground">{tx.description ?? tx.type}</p>
                      {tx.partner && <p className="text-[10px] text-muted-foreground">{tx.partner}</p>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-mono font-bold ${isEarn ? "text-green-400" : "text-red-400"}`}>{isEarn ? "+" : ""}{tx.points.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{new Date(tx.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              );
            })}
            {(txData?.items ?? []).length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No transactions yet. Start earning points!</p>}
          </div>
        </div>
      </div>
      <TripSummarySection />
    </div>
  );
}

function TripSummarySection() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const { data: pastReports, refetch: refetchReports } = trpc.tripSummary.list.useQuery();
  const generateMut = trpc.tripSummary.generate.useMutation({
    onSuccess: (res) => {
      toast.success("Trip summary ready!");
      refetchReports();
      window.open(res.reportUrl, "_blank");
    },
    onError: (err) => toast.error(err.message),
  });
  return (
    <div className="glass-card p-5 mt-6 animate-fade-in-up opacity-0" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
      <div className="flex items-center gap-2 mb-3">
        <FileDown className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Trip Summary Report</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Generate an HTML report of your QR payments, loyalty points earned, and places visited for any date range.</p>
      <div className="flex items-end gap-3 flex-wrap mb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">From</p>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">To</p>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground" />
        </div>
        <Button size="sm" className="h-8 text-xs"
          onClick={() => generateMut.mutate({
            dateFrom: new Date(dateFrom).getTime(),
            dateTo: new Date(dateTo + "T23:59:59").getTime(),
          })}
          disabled={generateMut.isPending || !dateFrom || !dateTo}>
          {generateMut.isPending ? "Generating…" : <><FileDown className="w-3 h-3 mr-1" />Generate Report</>}
        </Button>
      </div>
      {(pastReports ?? []).length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Past Reports</p>
          <div className="space-y-1.5">
            {(pastReports ?? []).slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between p-2 rounded-md bg-white/3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate">{new Date(r.dateFrom).toLocaleDateString()} – {new Date(r.dateTo).toLocaleDateString()}</span>
                  <span className="text-muted-foreground hidden sm:inline">{r.paymentCount} payments · ${Number(r.totalSpentUsd).toFixed(2)}</span>
                </div>
                {r.reportUrl && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2"
                      onClick={() => window.open(r.reportUrl!, "_blank")}>
                      <FileDown className="w-3 h-3 mr-1" />Open
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2"
                      onClick={() => {
                        if (navigator.share) {
                          navigator.share({ title: "My TourismPay Trip Summary", url: r.reportUrl! })
                            .catch(() => {});
                        } else {
                          navigator.clipboard.writeText(r.reportUrl!)
                            .then(() => toast.success("Link copied!"))
                            .catch(() => toast.error("Copy failed"));
                        }
                      }}>
                      <Share2 className="w-3 h-3 mr-1" />Share
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
