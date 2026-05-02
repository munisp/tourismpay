/**
 * SharedItinerary — public read-only view of a shared trip itinerary.
 * Accessible at /trip/:shareToken — no authentication required.
 */
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  MapPin, Calendar, Clock, DollarSign, Building2, ExternalLink,
  Plane, AlertCircle, Loader2, Share2,
} from "lucide-react";

const TYPE_ICON: Record<string, string> = {
  restaurant: "🍽️", hotel: "🏨", safari_lodge: "🦁", tour_operator: "🗺️",
  beach_resort: "🏖️", spa_wellness: "💆", museum: "🏛️", theme_park: "🎡",
  concert_venue: "🎭", nightclub: "🎵", sports_venue: "🏟️",
  conference_center: "🏗️", travel_agency: "✈️", airline: "✈️", car_rental: "🚗",
};

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function SharedItinerary() {
  const { shareToken } = useParams<{ shareToken: string }>();

  const { data, isLoading, error } = trpc.itinerary.getByToken.useQuery(
    { token: shareToken ?? "" },
    { enabled: !!shareToken }
  );

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-300">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          <p className="text-sm">Loading itinerary…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
        <Card className="max-w-md w-full bg-slate-800/60 border-slate-700 text-center">
          <CardContent className="pt-10 pb-8">
            <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Itinerary Not Found</h2>
            <p className="text-slate-400 text-sm mb-6">
              This trip link is no longer active or has been made private by the owner.
            </p>
            <Link href="/">
              <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                Go to TourismPay
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const it = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plane className="w-5 h-5 text-emerald-400" />
            <span className="text-white font-semibold text-sm">TourismPay</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
              Shared Trip
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-slate-400 hover:text-white"
              onClick={handleCopyLink}
            >
              <Share2 className="w-3 h-3 mr-1" /> Copy Link
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            ✈️ {it.title}
          </h1>
          {it.description && (
            <p className="text-slate-400 text-sm mb-3">{it.description}</p>
          )}
          <div className="flex flex-wrap gap-3 text-sm text-slate-400">
            {it.destination && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4 text-emerald-400" /> {it.destination}
              </span>
            )}
            {it.startDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4 text-blue-400" />
                {formatDate(it.startDate)}
                {it.endDate && ` – ${formatDate(it.endDate)}`}
              </span>
            )}
            <span className="flex items-center gap-1">
              <DollarSign className="w-4 h-4 text-amber-400" />
              Total: <strong className="text-white ml-1">{it.currency} {it.totalCost.toFixed(2)}</strong>
            </span>
            <span className="flex items-center gap-1">
              <Building2 className="w-4 h-4 text-violet-400" />
              {it.itemCount} {it.itemCount === 1 ? "activity" : "activities"} across {it.days.length} {it.days.length === 1 ? "day" : "days"}
            </span>
          </div>
        </div>

        <Separator className="bg-slate-700/50 mb-8" />

        {/* Days */}
        {it.days.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No activities in this itinerary yet.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {it.days.map((day) => (
              <div key={day.dayNumber}>
                {/* Day header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                      <span className="text-emerald-400 font-bold text-sm">{day.dayNumber}</span>
                    </div>
                    <h2 className="text-lg font-semibold text-white" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                      Day {day.dayNumber}
                    </h2>
                  </div>
                  <span className="text-sm text-slate-400">
                    {it.currency} {day.dayCost.toFixed(2)}
                  </span>
                </div>

                {/* Activity cards */}
                <div className="space-y-3 ml-13 pl-5 border-l border-slate-700/50">
                  {day.items.map((row) => (
                    <Card
                      key={row.item.id}
                      className="bg-slate-800/50 border-slate-700/50 hover:border-slate-600/50 transition-colors"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span className="text-xs text-slate-400 font-mono">
                                {row.item.startTime}{row.item.endTime ? ` – ${row.item.endTime}` : ""}
                              </span>
                            </div>
                            <p className="font-semibold text-white text-sm mb-1">{row.item.title}</p>
                            {row.establishment && (
                              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                <span>{TYPE_ICON[row.establishment.type ?? ""] ?? "🏢"}</span>
                                <span>{row.establishment.name}</span>
                                {(row.establishment.city || row.establishment.country) && (
                                  <>
                                    <span className="text-slate-600">·</span>
                                    <span>{[row.establishment.city, row.establishment.country].filter(Boolean).join(", ")}</span>
                                  </>
                                )}
                              </div>
                            )}
                            {row.item.notes && (
                              <p className="text-xs text-slate-500 mt-1.5 italic">{row.item.notes}</p>
                            )}
                          </div>
                          {row.item.estimatedCostUsd != null && (
                            <div className="shrink-0 text-right">
                              <span className="text-sm font-semibold text-emerald-400">
                                {it.currency} {Number(row.item.estimatedCostUsd).toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Total summary */}
        <div className="mt-10 p-5 rounded-xl bg-gradient-to-r from-emerald-900/40 to-teal-900/40 border border-emerald-700/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Estimated Cost</p>
              <p className="text-2xl font-bold text-white" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {it.currency} {it.totalCost.toFixed(2)}
              </p>
            </div>
            <div className="text-right text-sm text-slate-400">
              <p>{it.itemCount} activities</p>
              <p>{it.days.length} days</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-600">
          <p>Shared via TourismPay · <a href="/" className="text-slate-500 hover:text-slate-400 underline">Plan your own trip</a></p>
        </div>
      </div>
    </div>
  );
}
