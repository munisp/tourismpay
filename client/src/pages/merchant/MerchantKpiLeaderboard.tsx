/**
 * Merchant KPI Benchmark Leaderboard — /merchant/leaderboard
 *
 * Ranks all same-type establishments in the same country by composite score
 * (bookings 40% + avg rating 30% + response rate 30%).
 * The requesting merchant's own establishment is highlighted in the table.
 * Shows weekDelta trend arrows (▲/▼) based on weekly snapshot comparison.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Trophy,
  Star,
  MessageSquare,
  CalendarCheck,
  ArrowLeft,
  Medal,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Link } from "wouter";

// ─── Rank badge colours ───────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <span className="inline-flex items-center gap-1 font-bold text-yellow-500">
      <Trophy className="w-4 h-4" /> 1
    </span>
  );
  if (rank === 2) return (
    <span className="inline-flex items-center gap-1 font-bold text-slate-400">
      <Medal className="w-4 h-4" /> 2
    </span>
  );
  if (rank === 3) return (
    <span className="inline-flex items-center gap-1 font-bold text-amber-600">
      <Medal className="w-4 h-4" /> 3
    </span>
  );
  return <span className="font-medium text-muted-foreground">{rank}</span>;
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(score, 100);
  const color =
    pct >= 70 ? "bg-emerald-500" :
    pct >= 40 ? "bg-amber-400" :
    "bg-red-400";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold w-8 text-right">{score}</span>
    </div>
  );
}

// ─── Week delta trend arrow ───────────────────────────────────────────────────

/**
 * weekDelta: positive = rank improved (moved up), negative = rank dropped.
 * null = no prior snapshot available.
 */
function TrendArrow({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center text-muted-foreground/50">
              <Minus className="w-3.5 h-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">No prior week data yet</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (delta === 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center text-muted-foreground">
              <Minus className="w-3.5 h-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">No change from last week</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (delta > 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-0.5 text-emerald-600 font-semibold text-xs">
              <TrendingUp className="w-3.5 h-3.5" />
              +{delta}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Moved up {delta} rank{delta !== 1 ? "s" : ""} vs last week</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-0.5 text-red-500 font-semibold text-xs">
            <TrendingDown className="w-3.5 h-3.5" />
            {delta}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">Dropped {Math.abs(delta)} rank{Math.abs(delta) !== 1 ? "s" : ""} vs last week</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MerchantKpiLeaderboard() {
  const { user } = useAuth();
  const [selectedEstId, setSelectedEstId] = useState<number | null>(null);

  const { data: myEstablishments = [], isLoading: estLoading } =
    trpc.merchantRevenue.myEstablishments.useQuery(undefined, { enabled: !!user });

  const estId = selectedEstId ?? (myEstablishments[0]?.id ?? null);

  const { data, isLoading: lbLoading } = trpc.merchantRevenue.peerLeaderboard.useQuery(
    { establishmentId: estId! },
    { enabled: !!estId }
  );

  const isLoading = estLoading || lbLoading;

  const ESTABLISHMENT_TYPE_LABELS: Record<string, string> = {
    hotel: "Hotels",
    restaurant: "Restaurants",
    safari_lodge: "Safari Lodges",
    tour_operator: "Tour Operators",
    spa_wellness: "Spas & Wellness",
    museum: "Museums",
    theme_park: "Theme Parks",
    beach_resort: "Beach Resorts",
    concert_venue: "Concert Venues",
    nightclub: "Nightclubs",
    sports_venue: "Sports Venues",
    conference_center: "Conference Centers",
    travel_agency: "Travel Agencies",
    airline: "Airlines",
    car_rental: "Car Rentals",
  };

  // Determine if any row has trend data (to decide whether to show the Trend column)
  const hasTrendData = data?.leaderboard.some((r) => r.weekDelta !== null) ?? false;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/merchant/revenue">
          <a className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </a>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" />
            KPI Benchmark Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Composite score = bookings (40%) + avg rating (30%) + response rate (30%)
          </p>
        </div>
      </div>

      {/* Establishment selector */}
      {myEstablishments.length > 1 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Establishment:</span>
              <Select
                value={estId?.toString() ?? ""}
                onValueChange={(v) => setSelectedEstId(Number(v))}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select establishment" />
                </SelectTrigger>
                <SelectContent>
                  {myEstablishments.map((e) => (
                    <SelectItem key={e.id} value={e.id.toString()}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Your Rank</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-3xl font-bold">
                  {data.ownRank !== null ? `#${data.ownRank}` : "—"}
                </div>
                {/* Show own week delta in the rank card */}
                {(() => {
                  const own = data.leaderboard.find((r) => r.isOwn);
                  return own && own.weekDelta !== null ? (
                    <TrendArrow delta={own.weekDelta} />
                  ) : null;
                })()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                out of {data.totalPeers} {ESTABLISHMENT_TYPE_LABELS[data.establishmentType] ?? data.establishmentType}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Market</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold capitalize">{data.country}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {ESTABLISHMENT_TYPE_LABELS[data.establishmentType] ?? data.establishmentType}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Your Score</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const own = data.leaderboard.find((r) => r.isOwn);
                return own ? (
                  <div className="space-y-1">
                    <div className="text-3xl font-bold">{own.compositeScore}</div>
                    <ScoreBar score={own.compositeScore} />
                  </div>
                ) : <span className="text-muted-foreground text-sm">N/A</span>;
              })()}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Leaderboard table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {data
              ? `${ESTABLISHMENT_TYPE_LABELS[data.establishmentType] ?? data.establishmentType} in ${data.country} — ${data.totalPeers} establishments`
              : "Leaderboard"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 rounded" />
              ))}
            </div>
          ) : !data || data.leaderboard.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No peer data available yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  {hasTrendData && (
                    <TableHead className="w-20">
                      <span className="inline-flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5" /> Trend
                      </span>
                    </TableHead>
                  )}
                  <TableHead>Establishment</TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <CalendarCheck className="w-3.5 h-3.5" /> Bookings
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <Star className="w-3.5 h-3.5" /> Avg Rating
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" /> Response Rate
                    </span>
                  </TableHead>
                  <TableHead>Composite Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.leaderboard.map((row) => (
                  <TableRow
                    key={row.id}
                    className={
                      row.isOwn
                        ? "bg-primary/5 border-l-4 border-l-primary font-semibold"
                        : ""
                    }
                  >
                    <TableCell>
                      <RankBadge rank={row.rank} />
                    </TableCell>
                    {hasTrendData && (
                      <TableCell>
                        <TrendArrow delta={row.weekDelta ?? null} />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{row.name}</span>
                        {row.isOwn && (
                          <Badge variant="outline" className="text-xs border-primary text-primary">
                            You
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{row.bookings}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1">
                        <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                        {row.avgRating.toFixed(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          row.responseRate >= 70
                            ? "text-emerald-600 font-medium"
                            : row.responseRate >= 40
                            ? "text-amber-600 font-medium"
                            : "text-red-500 font-medium"
                        }
                      >
                        {row.responseRate}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <ScoreBar score={row.compositeScore} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Scores are based on confirmed bookings in the last 30 days, all-time average rating, and review response rate.
        Trend arrows (▲/▼) compare this week's rank to last week's snapshot.
      </p>
    </div>
  );
}
