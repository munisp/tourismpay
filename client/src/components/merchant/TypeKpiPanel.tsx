/**
 * TypeKpiPanel — renders type-specific KPIs for a merchant's establishment,
 * with peer benchmarking delta badges comparing against country-level averages.
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Hotel,
  Leaf,
  Utensils,
  Map,
  Waves,
  Sparkles,
  Plane,
  Car,
  Landmark,
  FerrisWheel,
  Music,
  Trophy,
  Star,
  Users,
  TrendingUp,
  TrendingDown,
  BarChart3,
  CalendarCheck,
  Minus,
} from "lucide-react";

interface Props {
  establishmentId: number;
}

const TYPE_LABELS: Record<string, string> = {
  hotel: "Hotel",
  safari_lodge: "Safari Lodge",
  restaurant: "Restaurant",
  tour_operator: "Tour Operator",
  beach_resort: "Beach Resort",
  spa_wellness: "Spa & Wellness",
  airline: "Airline",
  car_rental: "Car Rental",
  museum: "Museum",
  theme_park: "Theme Park",
  concert_venue: "Concert Venue",
  sports_venue: "Sports Venue",
  nightclub: "Nightclub",
  conference_center: "Conference Center",
  travel_agency: "Travel Agency",
  generic: "Establishment",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  hotel: <Hotel className="w-4 h-4" />,
  safari_lodge: <Leaf className="w-4 h-4" />,
  restaurant: <Utensils className="w-4 h-4" />,
  tour_operator: <Map className="w-4 h-4" />,
  beach_resort: <Waves className="w-4 h-4" />,
  spa_wellness: <Sparkles className="w-4 h-4" />,
  airline: <Plane className="w-4 h-4" />,
  car_rental: <Car className="w-4 h-4" />,
  museum: <Landmark className="w-4 h-4" />,
  theme_park: <FerrisWheel className="w-4 h-4" />,
  concert_venue: <Music className="w-4 h-4" />,
  sports_venue: <Trophy className="w-4 h-4" />,
};

/** Delta badge: green if above peer avg, red if below, grey if equal/no data */
function DeltaBadge({ value, peer, unit = "" }: { value: number; peer?: number; unit?: string }) {
  if (peer === undefined || peer === 0) return null;
  const diff = value - peer;
  const pct = Math.round((diff / peer) * 100);
  if (Math.abs(pct) < 1) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <Minus className="w-2.5 h-2.5" /> avg
      </span>
    );
  }
  const positive = diff > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
        positive ? "text-emerald-500" : "text-red-500"
      }`}
    >
      {positive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {positive ? "+" : ""}{pct}% vs peers
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  delta,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  delta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border border-border/50">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold text-foreground">{value}</div>
      <div className="flex items-center gap-2">
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        {delta}
      </div>
    </div>
  );
}

export function TypeKpiPanel({ establishmentId }: Props) {
  const { data: kpis, isLoading } = trpc.merchantRevenue.typeKpis.useQuery(
    { establishmentId },
    { enabled: !!establishmentId }
  );

  const { data: bench } = trpc.merchantRevenue.kpiBenchmark.useQuery(
    { establishmentId },
    { enabled: !!establishmentId }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="h-5 w-40 bg-muted animate-pulse rounded" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!kpis) return null;

  const typeLabel = TYPE_LABELS[kpis.establishmentType] ?? "Establishment";
  const typeIcon = TYPE_ICONS[kpis.establishmentType] ?? <BarChart3 className="w-4 h-4" />;
  const b = (bench?.benchmarks ?? {}) as Record<string, number>;
  const peerCount = bench?.peerCount ?? 0;

  // Build type-specific KPI cards
  const specificCards: React.ReactNode[] = [];

  if (kpis.kpiType === "hotel") {
    const d = kpis as any;
    specificCards.push(
      <KpiCard key="occ" label="Occupancy Rate (30d)" value={`${d.occupancyRate ?? 0}%`} sub="of assumed 10 rooms" icon={<Hotel className="w-3.5 h-3.5" />} />,
      <KpiCard key="room" label="Room Bookings" value={d.roomBookings ?? 0} sub="confirmed"
        icon={<CalendarCheck className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.roomBookings ?? 0} peer={b.avgBookings} />}
      />,
    );
  } else if (kpis.kpiType === "safari_lodge") {
    const d = kpis as any;
    specificCards.push(
      <KpiCard key="gd" label="Game Drive Bookings" value={d.gameDriveBookings ?? 0} sub="confirmed"
        icon={<Leaf className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.gameDriveBookings ?? 0} peer={b.avgBookings} />}
      />,
      <KpiCard key="gs" label="Avg Group Size" value={d.avgGroupSize ?? 0} sub="guests per drive"
        icon={<Users className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.avgGroupSize ?? 0} peer={b.avgGuests} />}
      />,
    );
  } else if (kpis.kpiType === "restaurant") {
    const d = kpis as any;
    specificCards.push(
      <KpiCard key="cpd" label="Covers / Day (30d)" value={d.coversPerDay ?? 0} sub="avg daily diners"
        icon={<Utensils className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.coversPerDay ?? 0} peer={b.avgGuests ? Math.round(b.avgGuests / 30) : undefined} />}
      />,
    );
  } else if (kpis.kpiType === "tour_operator") {
    const d = kpis as any;
    specificCards.push(
      <KpiCard key="tb" label="Tour Bookings" value={d.tourBookings ?? 0} sub="confirmed"
        icon={<Map className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.tourBookings ?? 0} peer={b.avgBookings} />}
      />,
      <KpiCard key="tgs" label="Avg Tour Group" value={d.avgTourGroupSize ?? 0} sub="guests per tour"
        icon={<Users className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.avgTourGroupSize ?? 0} peer={b.avgGuests} />}
      />,
    );
  } else if (kpis.kpiType === "beach_resort") {
    const d = kpis as any;
    specificCards.push(
      <KpiCard key="ws" label="Water Sports Bookings" value={d.waterSportsBookings ?? 0} sub="confirmed"
        icon={<Waves className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.waterSportsBookings ?? 0} peer={b.avgBookings} />}
      />,
    );
  } else if (kpis.kpiType === "spa_wellness") {
    const d = kpis as any;
    specificCards.push(
      <KpiCard key="sb" label="Treatments Booked" value={d.spaBookings ?? 0} sub="confirmed"
        icon={<Sparkles className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.spaBookings ?? 0} peer={b.avgBookings} />}
      />,
      <KpiCard key="atv" label="Avg Treatment Value" value={`$${d.avgTreatmentValue ?? 0}`} sub="per booking"
        icon={<TrendingUp className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.avgTreatmentValue ?? 0} peer={b.avgRevenue && b.avgBookings ? Math.round(b.avgRevenue / b.avgBookings) : undefined} />}
      />,
    );
  } else if (kpis.kpiType === "airline") {
    const d = kpis as any;
    specificCards.push(
      <KpiCard key="fb" label="Flight Bookings" value={d.flightBookings ?? 0} sub="confirmed"
        icon={<Plane className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.flightBookings ?? 0} peer={b.avgBookings} />}
      />,
      <KpiCard key="lf" label="Seat Load Factor" value={`${d.loadFactor ?? 0}%`} sub="of 150-seat capacity"
        icon={<BarChart3 className="w-3.5 h-3.5" />}
      />,
      <KpiCard key="ts" label="Total Seats Sold" value={d.totalSeats ?? 0} sub="across all flights"
        icon={<Users className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.totalSeats ?? 0} peer={b.avgGuests} />}
      />,
    );
  } else if (kpis.kpiType === "car_rental") {
    const d = kpis as any;
    specificCards.push(
      <KpiCard key="rb" label="Rental Bookings" value={d.rentalBookings ?? 0} sub="confirmed"
        icon={<Car className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.rentalBookings ?? 0} peer={b.avgBookings} />}
      />,
    );
  } else if (kpis.kpiType === "museum") {
    const d = kpis as any;
    specificCards.push(
      <KpiCard key="eb" label="Entry Bookings" value={d.entryBookings ?? 0} sub="confirmed"
        icon={<Landmark className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.entryBookings ?? 0} peer={b.avgBookings} />}
      />,
      <KpiCard key="tv" label="Total Visitors" value={d.totalVisitors ?? 0} sub="all time"
        icon={<Users className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.totalVisitors ?? 0} peer={b.avgGuests} />}
      />,
    );
  } else if (kpis.kpiType === "theme_park") {
    const d = kpis as any;
    specificCards.push(
      <KpiCard key="pb" label="Park Bookings" value={d.parkBookings ?? 0} sub="confirmed"
        icon={<FerrisWheel className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.parkBookings ?? 0} peer={b.avgBookings} />}
      />,
      <KpiCard key="tv" label="Total Visitors" value={d.totalVisitors ?? 0} sub="all time"
        icon={<Users className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.totalVisitors ?? 0} peer={b.avgGuests} />}
      />,
    );
  } else if (kpis.kpiType === "concert_venue") {
    const d = kpis as any;
    specificCards.push(
      <KpiCard key="ev" label="Event Bookings" value={d.eventBookings ?? 0} sub="confirmed"
        icon={<Music className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.eventBookings ?? 0} peer={b.avgBookings} />}
      />,
      <KpiCard key="ta" label="Total Attendees" value={d.totalAttendees ?? 0} sub="all time"
        icon={<Users className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.totalAttendees ?? 0} peer={b.avgGuests} />}
      />,
    );
  } else if (kpis.kpiType === "sports_venue") {
    const d = kpis as any;
    specificCards.push(
      <KpiCard key="sb" label="Sports Bookings" value={d.sportsBookings ?? 0} sub="confirmed"
        icon={<Trophy className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.sportsBookings ?? 0} peer={b.avgBookings} />}
      />,
      <KpiCard key="ta" label="Total Attendees" value={d.totalAttendees ?? 0} sub="all time"
        icon={<Users className="w-3.5 h-3.5" />}
        delta={<DeltaBadge value={d.totalAttendees ?? 0} peer={b.avgGuests} />}
      />,
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {typeIcon}
          <span>{typeLabel} Performance KPIs</span>
          <div className="ml-auto flex items-center gap-2">
            {peerCount > 0 && (
              <Badge variant="secondary" className="text-xs font-normal">
                vs {peerCount} peer{peerCount !== 1 ? "s" : ""} in {bench?.country ?? "country"}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs font-normal">
              Last 30 days
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Universal base KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Total Bookings"
            value={kpis.totalBookings}
            sub={`${kpis.confirmedBookings} confirmed`}
            icon={<CalendarCheck className="w-3.5 h-3.5" />}
            delta={<DeltaBadge value={kpis.confirmedBookings} peer={b.avgBookings} />}
          />
          <KpiCard
            label="Booking Revenue (30d)"
            value={`$${kpis.recentRevenue}`}
            sub={`${kpis.recentBookings} bookings`}
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            delta={<DeltaBadge value={kpis.recentRevenue} peer={b.avgRevenue} />}
          />
          <KpiCard
            label="Avg Booking Value"
            value={`$${kpis.avgBookingValue}`}
            sub="per confirmed booking"
            icon={<BarChart3 className="w-3.5 h-3.5" />}
            delta={<DeltaBadge value={kpis.avgBookingValue} peer={b.avgRevenue && b.avgBookings ? Math.round(b.avgRevenue / b.avgBookings) : undefined} />}
          />
          <KpiCard
            label="Avg Rating"
            value={kpis.avgRating !== null ? `${kpis.avgRating} ★` : "—"}
            sub={`${kpis.reviewCount} reviews`}
            icon={<Star className="w-3.5 h-3.5" />}
            delta={kpis.avgRating !== null ? <DeltaBadge value={kpis.avgRating} peer={b.avgRating} /> : undefined}
          />
        </div>

        {/* Type-specific KPIs */}
        {specificCards.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {specificCards}
          </div>
        )}

        {/* Top service types */}
        {kpis.topServiceTypes.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Top Service Types</p>
            <div className="flex flex-wrap gap-2">
              {kpis.topServiceTypes.map((st) => (
                <div key={st.type} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 text-xs">
                  <span className="font-medium">{st.type.replace(/_/g, " ")}</span>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">{st.count}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Peer benchmark summary row */}
        {peerCount > 0 && b.avgRevenue !== undefined && (
          <div className="border-t border-border/40 pt-3">
            <p className="text-xs text-muted-foreground mb-2">Country Peer Averages ({peerCount} {TYPE_LABELS[kpis.establishmentType] ?? "establishment"}s)</p>
            <div className="flex flex-wrap gap-4 text-xs">
              <span><span className="text-muted-foreground">Avg bookings:</span> <strong>{b.avgBookings ?? 0}</strong></span>
              <span><span className="text-muted-foreground">Avg revenue:</span> <strong>${b.avgRevenue ?? 0}</strong></span>
              <span><span className="text-muted-foreground">Avg rating:</span> <strong>{b.avgRating ?? 0} ★</strong></span>
              <span><span className="text-muted-foreground">Avg response rate:</span> <strong>{b.avgResponseRate ?? 0}%</strong></span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
