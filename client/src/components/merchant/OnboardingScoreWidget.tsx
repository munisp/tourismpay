/**
 * OnboardingScoreWidget
 * Displays a merchant's onboarding completion score as a progress ring with
 * a step-by-step checklist. Shown on the Revenue Dashboard when the score < 100%.
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Circle, ChevronRight, Rocket, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface Props {
  establishmentId: number;
}

/** SVG progress ring */
function ScoreRing({ score }: { score: number }) {
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const colour =
    score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <svg width="100" height="100" viewBox="0 0 100 100" className="rotate-[-90deg]">
      {/* Track */}
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        className="text-muted/30"
      />
      {/* Progress */}
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={colour}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

export default function OnboardingScoreWidget({ establishmentId }: Props) {
  const { data, isLoading } = trpc.merchantRevenue.onboardingScore.useQuery(
    { establishmentId },
    { enabled: !!establishmentId }
  );

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="py-6">
          <div className="h-24 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  // Hide widget once fully complete
  if (data.score === 100) return null;

  const scoreColour =
    data.score >= 80
      ? "text-green-400"
      : data.score >= 50
      ? "text-amber-400"
      : "text-red-400";

  const nextStep = data.steps.find((s) => !s.completed);

  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Onboarding Progress</CardTitle>
          </div>
          <Badge
            variant="outline"
            className={cn("text-xs font-bold", scoreColour)}
          >
            {data.completedCount}/{data.totalCount} complete
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-start gap-5">
          {/* Score ring */}
          <div className="relative flex-shrink-0">
            <ScoreRing score={data.score} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={cn("text-lg font-bold tabular-nums", scoreColour)}>
                {data.score}%
              </span>
            </div>
          </div>

          {/* Checklist */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {data.steps.map((step) => (
              <Tooltip key={step.key}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors",
                      step.completed
                        ? "text-muted-foreground"
                        : "text-foreground hover:bg-muted/40 cursor-pointer"
                    )}
                  >
                    {step.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className={cn("truncate", step.completed && "line-through opacity-60")}>
                      {step.label}
                    </span>
                    {!step.completed && (
                      <Link href={step.href} className="ml-auto">
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                      </Link>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px] text-xs">
                  {step.description}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Next step CTA */}
        {nextStep && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
            <AlertCircle className="w-4 h-4 text-primary flex-shrink-0" />
            <p className="text-xs text-primary flex-1 min-w-0">
              <span className="font-semibold">Next: </span>
              {nextStep.label}
            </p>
            <Button size="sm" variant="outline" className="h-7 text-xs px-2 flex-shrink-0" asChild>
              <Link href={nextStep.href}>Go</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
