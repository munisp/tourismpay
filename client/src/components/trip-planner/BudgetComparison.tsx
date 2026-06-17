/**
 * BudgetComparison — Shows price comparison across budget/mid-range/luxury tiers
 * for the current itinerary destination.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingDown, TrendingUp, Minus } from "lucide-react";

interface BudgetTier {
  level: "budget" | "mid-range" | "luxury";
  dailyAvgUsd: number;
  totalUsd: number;
  accommodation: number;
  meals: number;
  activities: number;
  transport: number;
}

interface BudgetComparisonProps {
  destination: string;
  durationDays: number;
  currentBudget: string;
  currentTotal: number;
  onSelectTier?: (tier: string) => void;
}

function getTierData(durationDays: number): BudgetTier[] {
  return [
    {
      level: "budget",
      dailyAvgUsd: 80,
      totalUsd: 80 * durationDays,
      accommodation: 25,
      meals: 20,
      activities: 20,
      transport: 15,
    },
    {
      level: "mid-range",
      dailyAvgUsd: 200,
      totalUsd: 200 * durationDays,
      accommodation: 80,
      meals: 45,
      activities: 45,
      transport: 30,
    },
    {
      level: "luxury",
      dailyAvgUsd: 500,
      totalUsd: 500 * durationDays,
      accommodation: 220,
      meals: 100,
      activities: 100,
      transport: 80,
    },
  ];
}

const tierColors: Record<string, string> = {
  budget: "border-green-500/50 bg-green-500/5",
  "mid-range": "border-blue-500/50 bg-blue-500/5",
  luxury: "border-amber-500/50 bg-amber-500/5",
};

const tierBadgeColors: Record<string, string> = {
  budget: "bg-green-600",
  "mid-range": "bg-blue-600",
  luxury: "bg-amber-600",
};

export function BudgetComparison({
  destination,
  durationDays,
  currentBudget,
  currentTotal,
  onSelectTier,
}: BudgetComparisonProps) {
  const tiers = getTierData(durationDays);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" /> Budget Comparison — {destination}
          <Badge variant="secondary" className="text-[10px]">{durationDays} days</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Compare your itinerary cost across budget levels
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {tiers.map((tier) => {
            const isCurrentTier = tier.level === currentBudget;
            const diff = currentTotal - tier.totalUsd;
            const diffPercent = tier.totalUsd > 0 ? Math.round((diff / tier.totalUsd) * 100) : 0;

            return (
              <div
                key={tier.level}
                className={`rounded-lg border-2 p-3 transition-all ${tierColors[tier.level]} ${isCurrentTier ? "ring-2 ring-primary" : ""}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge className={`text-[10px] ${tierBadgeColors[tier.level]}`}>
                    {tier.level}
                  </Badge>
                  {isCurrentTier && (
                    <Badge variant="outline" className="text-[10px] border-primary text-primary">
                      Current
                    </Badge>
                  )}
                </div>

                <p className="text-xl font-bold">${tier.totalUsd.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">${tier.dailyAvgUsd}/day</p>

                {/* Category breakdown */}
                <div className="mt-3 space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Accommodation</span>
                    <span className="font-medium">${tier.accommodation}/night</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Meals</span>
                    <span className="font-medium">${tier.meals}/day</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Activities</span>
                    <span className="font-medium">${tier.activities}/day</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Transport</span>
                    <span className="font-medium">${tier.transport}/day</span>
                  </div>
                </div>

                {/* Comparison to current */}
                {!isCurrentTier && (
                  <div className="mt-3 pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1 text-xs">
                      {diff > 0 ? (
                        <>
                          <TrendingDown className="w-3 h-3 text-green-500" />
                          <span className="text-green-600">Save ${Math.abs(diff).toLocaleString()} ({Math.abs(diffPercent)}% less)</span>
                        </>
                      ) : diff < 0 ? (
                        <>
                          <TrendingUp className="w-3 h-3 text-amber-500" />
                          <span className="text-amber-600">${Math.abs(diff).toLocaleString()} more ({Math.abs(diffPercent)}% more)</span>
                        </>
                      ) : (
                        <>
                          <Minus className="w-3 h-3 text-muted-foreground" />
                          <span className="text-muted-foreground">Same cost</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Re-generate at this tier */}
                {!isCurrentTier && onSelectTier && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2 h-7 text-xs"
                    onClick={() => onSelectTier(tier.level)}
                  >
                    Regenerate as {tier.level}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
