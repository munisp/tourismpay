/**
 * Deal Performance Leaderboard — /merchant/deals/leaderboard
 * Shows top deals ranked by redemption count with revenue attribution,
 * period filter, Boost Deal CTA, and Boost ROI before/after chart.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Trophy,
  TrendingUp,
  Zap,
  AlertCircle,
  Tag,
  ArrowLeft,
  RefreshCw,
  BarChart2,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  DollarSign,
} from "lucide-react";
import { Link } from "wouter";

type Period = "30" | "90" | "365";

const PERIOD_LABELS: Record<Period, string> = {
  "30": "Last 30 days",
  "90": "Last 90 days",
  "365": "Last 365 days",
};

const RANK_COLORS = [
  "text-yellow-500",   // 1st
  "text-slate-400",    // 2nd
  "text-amber-600",    // 3rd
];

const CATEGORY_COLORS: Record<string, string> = {
  food: "bg-orange-100 text-orange-700",
  accommodation: "bg-blue-100 text-blue-700",
  transport: "bg-purple-100 text-purple-700",
  entertainment: "bg-pink-100 text-pink-700",
  shopping: "bg-green-100 text-green-700",
  wellness: "bg-teal-100 text-teal-700",
  general: "bg-slate-100 text-slate-700",
};

// ─── Boost ROI Panel ──────────────────────────────────────────────────────────

function BoostROIPanel({
  dealId,
  title,
  onClose,
}: {
  dealId: number;
  title: string;
  onClose: () => void;
}) {
  const { data: roi, isLoading } = trpc.merchantRevenue.getBoostROI.useQuery(
    { dealId },
    { enabled: !!dealId }
  );

  const preRate = roi?.preBoostDailyRate ?? 0;
  const postRate = roi?.postBoostDailyRate ?? 0;
  const maxBar = roi && roi.hasBoostData
    ? Math.max(preRate, postRate, 0.01)
    : 1;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-primary" />
            Boost ROI — {title}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <ChevronUp className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        ) : !roi ? (
          <p className="text-sm text-muted-foreground">Unable to load ROI data.</p>
        ) : !roi.hasBoostData ? (
          <p className="text-sm text-muted-foreground">{roi.message}</p>
        ) : (
          <div className="space-y-4">
            {/* Boost period info */}
            <div className="text-xs text-muted-foreground">
              Boost period: {roi.boostDurationDays} day(s) starting{" "}
              {roi.boostedAt ? new Date(roi.boostedAt).toLocaleDateString() : "N/A"}
            </div>

            {/* Before / After bar chart */}
            <div className="space-y-3">
              {/* Pre-boost bar */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Before boost</span>
                  <span className="font-medium">
                    {roi.preBoostRedemptions} redemptions ({preRate}/day)
                  </span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-400 rounded-full transition-all"
                    style={{ width: `${(preRate / maxBar) * 100}%` }}
                  />
                </div>
              </div>

              {/* Post-boost bar */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">After boost</span>
                  <span className="font-medium">
                    {roi.postBoostRedemptions} redemptions ({postRate}/day)
                  </span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(postRate / maxBar) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Lift badge + Revenue from boost */}
            <div className="flex flex-wrap items-center gap-2">
              {(roi.liftPercent ?? null) === null ? (
                <Badge variant="secondary" className="gap-1">
                  <Minus className="h-3 w-3" />
                  No pre-boost baseline
                </Badge>
              ) : (roi.liftPercent ?? 0) >= 0 ? (
                <Badge className="gap-1 bg-emerald-600 text-white">
                  <ArrowUpRight className="h-3 w-3" />
                  +{roi.liftPercent ?? 0}% lift from boost
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <ArrowDownRight className="h-3 w-3" />
                  {roi.liftPercent ?? 0}% vs baseline
                </Badge>
              )}
              {roi.revenueFromBoost !== null && roi.revenueFromBoost !== undefined && (
                <Badge variant="outline" className="gap-1 border-emerald-600 text-emerald-700">
                  <DollarSign className="h-3 w-3" />
                  ${roi.revenueFromBoost.toFixed(2)} revenue from boost
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DealLeaderboard() {
  const { user } = useAuth();

  const [period, setPeriod] = useState<Period>("30");
  const [roiDealId, setRoiDealId] = useState<number | null>(null);
  const [roiDealTitle, setRoiDealTitle] = useState<string>("");
  const [boostDialogOpen, setBoostDialogOpen] = useState(false);
  const [boostTargetId, setBoostTargetId] = useState<number | null>(null);
  const [boostTargetTitle, setBoostTargetTitle] = useState("");
  const [boostBudget, setBoostBudget] = useState("");

  // Get merchant's first establishment
  const { data: establishments, isLoading: estLoading } =
    trpc.merchantRevenue.myEstablishments.useQuery();

  const establishmentId = establishments?.[0]?.id;

  const {
    data: leaderboard,
    isLoading,
    refetch,
  } = trpc.merchantRevenue.getDealLeaderboard.useQuery(
    { establishmentId: establishmentId!, period },
    { enabled: !!establishmentId }
  );

  const boostMutation = trpc.merchantRevenue.boostDeal.useMutation({
    onSuccess: (data, variables) => {
      const deal = leaderboard?.find((d) => d.id === variables.dealId);
      const budgetNote = data.boostBudgetUsd ? ` Budget cap: $${data.boostBudgetUsd.toFixed(2)}.` : "";
      toast.success(
        `"${deal?.title ?? "Deal"}" boosted! Visibility score: ${data.newVisibilityScore}. Active for 7 days.${budgetNote}`
      );
      setBoostDialogOpen(false);
      setBoostBudget("");
      refetch();
    },
    onError: (err) => {
      toast.error(`Boost failed: ${err.message}`);
    },
  });

  const handleBoost = (dealId: number, title: string) => {
    setBoostTargetId(dealId);
    setBoostTargetTitle(title);
    setBoostBudget("");
    setBoostDialogOpen(true);
  };

  const confirmBoost = () => {
    if (!boostTargetId) return;
    const budget = boostBudget ? parseFloat(boostBudget) : undefined;
    boostMutation.mutate({ dealId: boostTargetId, boostBudgetUsd: budget });
  };

  const handleShowROI = (dealId: number, title: string) => {
    if (roiDealId === dealId) {
      setRoiDealId(null);
    } else {
      setRoiDealId(dealId);
      setRoiDealTitle(title);
    }
  };

  if (estLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!establishmentId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-yellow-500" />
            <p>No establishment found. Please set up your establishment first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalRedemptions =
    leaderboard?.reduce((s, d) => s + d.redemptionsInPeriod, 0) ?? 0;
  const totalRevenue =
    leaderboard?.reduce((s, d) => s + parseFloat(d.revenueAttributedUsd), 0) ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/merchant/revenue">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-yellow-500" />
            Deal Performance Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Top deals ranked by redemption count and revenue attribution
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={period}
            onValueChange={(v) => setPeriod(v as Period)}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["30", "90", "365"] as Period[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Total Redemptions
            </p>
            <p className="text-3xl font-bold mt-1">{totalRedemptions}</p>
            <p className="text-xs text-muted-foreground">{PERIOD_LABELS[period]}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Revenue Attributed
            </p>
            <p className="text-3xl font-bold mt-1">${totalRevenue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">From deal discounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Active Deals
            </p>
            <p className="text-3xl font-bold mt-1">
              {leaderboard?.filter((d) => d.isActive).length ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">
              of {leaderboard?.length ?? 0} total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Boost ROI Panel (shown when a deal's ROI button is clicked) */}
      {roiDealId !== null && (
        <BoostROIPanel
          dealId={roiDealId}
          title={roiDealTitle}
          onClose={() => setRoiDealId(null)}
        />
      )}

      {/* Leaderboard Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Rankings — {PERIOD_LABELS[period]}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !leaderboard || leaderboard.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tag className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p className="font-medium">No deals found</p>
              <p className="text-sm mt-1">
                Create deals in the Revenue dashboard to see them ranked here.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {leaderboard.map((deal, idx) => {
                const rankColor = RANK_COLORS[idx] ?? "text-muted-foreground";
                const catColor =
                  CATEGORY_COLORS[deal.category] ?? CATEGORY_COLORS.general;
                const fillPct =
                  deal.maxRedemptions && deal.maxRedemptions > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (deal.totalRedemptions / deal.maxRedemptions) * 100
                        )
                      )
                    : null;
                const isShowingROI = roiDealId === deal.id;

                return (
                  <div
                    key={deal.id}
                    className="flex items-center gap-4 py-4 group"
                  >
                    {/* Rank */}
                    <div
                      className={`w-8 text-center font-bold text-lg ${rankColor}`}
                    >
                      {idx + 1}
                    </div>

                    {/* Deal info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">
                          {deal.title}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${catColor} border-0`}
                        >
                          {deal.category}
                        </Badge>
                        {!deal.isActive && (
                          <Badge variant="secondary" className="text-xs">
                            Inactive
                          </Badge>
                        )}
                        {deal.discountPercent > 0 && (
                          <Badge className="text-xs bg-emerald-600 text-white">
                            {deal.discountPercent}% off
                          </Badge>
                        )}
                      </div>

                      {/* Redemption fill bar */}
                      {fillPct !== null && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {deal.totalRedemptions}/{deal.maxRedemptions} (
                            {fillPct}%)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="text-right hidden sm:block">
                      <p className="font-bold text-lg">
                        {deal.redemptionsInPeriod}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        redemptions
                      </p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="font-bold text-lg text-emerald-600">
                        ${deal.revenueAttributedUsd}
                      </p>
                      <p className="text-xs text-muted-foreground">attributed</p>
                    </div>

                    {/* ROI button */}
                    <Button
                      size="sm"
                      variant={isShowingROI ? "default" : "outline"}
                      className="gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleShowROI(deal.id, deal.title)}
                    >
                      <BarChart2 className="h-3 w-3" />
                      {isShowingROI ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </Button>

                    {/* Boost CTA */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleBoost(deal.id, deal.title)}
                      disabled={boostMutation.isPending}
                    >
                      <Zap className="h-3 w-3" />
                      Boost
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {/* Boost Budget Dialog */}
      <Dialog open={boostDialogOpen} onOpenChange={setBoostDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Boost Deal
            </DialogTitle>
            <DialogDescription>
              Boosting <strong>{boostTargetTitle}</strong> will increase its visibility score for 7 days, surfacing it first in the tourist discovery feed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="boost-budget">Budget Cap (USD) — optional</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="boost-budget"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="No cap (unlimited)"
                  className="pl-7"
                  value={boostBudget}
                  onChange={(e) => setBoostBudget(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                When the total discount value redeemed during the boost reaches this cap, the boost will auto-pause.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBoostDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={confirmBoost}
              disabled={boostMutation.isPending}
              className="gap-1"
            >
              <Zap className="h-4 w-4" />
              {boostMutation.isPending ? "Boosting…" : "Confirm Boost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
