/**
 * MerchantBookings — Booking Inbox for Merchants
 *
 * Features:
 *  - Stats overview: total, pending, confirmed, completed, cancelled, revenue
 *  - Filterable booking list by status
 *  - Weekly calendar view with List/Calendar toggle
 *  - Status transitions with confirmation (pending→confirmed, confirmed→completed, etc.)
 *  - Bulk confirm / bulk cancel
 *  - Tourist contact details
 *  - Booking detail drawer
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CalendarCheck,
  Users,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  ChevronDown,
  Mail,
  User,
  FileText,
  Inbox,
  TrendingUp,
  AlertCircle,
  LayoutList,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
} from "lucide-react";
import { Label } from "@/components/ui/label";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtUsd(n: number | string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    confirmed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
    no_show: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}

const TRANSITIONS: Record<string, { label: string; value: string; variant: "default" | "destructive" | "outline" }[]> = {
  pending: [
    { label: "Confirm", value: "confirmed", variant: "default" },
    { label: "Cancel", value: "cancelled", variant: "destructive" },
  ],
  confirmed: [
    { label: "Mark Complete", value: "completed", variant: "default" },
    { label: "No Show", value: "no_show", variant: "outline" },
    { label: "Cancel", value: "cancelled", variant: "destructive" },
  ],
};

// ─── Booking Type ─────────────────────────────────────────────────────────────

interface Booking {
  id: number;
  userId: number;
  serviceType: string;
  serviceName: string;
  bookingDate: Date | string;
  partySize: number;
  priceUsd: string | number;
  currency: string;
  status: string;
  notes: string | null;
  confirmationCode: string | null;
  createdAt: Date | string;
  touristName: string | null;
  touristEmail: string | null;
  reminderEnabled?: boolean;
}

// ─── Booking Detail Dialog ────────────────────────────────────────────────────

function BookingDetailDialog({
  booking,
  establishmentId,
  onClose,
  onUpdated,
}: {
  booking: Booking;
  establishmentId: number;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [reminderOn, setReminderOn] = useState(booking.reminderEnabled ?? true);
  const toggleReminder = trpc.merchantBookings.toggleReminderEnabled.useMutation({
    onSuccess: (data) => {
      setReminderOn(data.reminderEnabled ?? false);
      toast.success(data.reminderEnabled ? "24h reminder enabled" : "24h reminder disabled");
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.merchantBookings.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Booking updated");
      onUpdated();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const actions = TRANSITIONS[booking.status] ?? [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-primary" />
            Booking #{booking.confirmationCode ?? booking.id}
          </DialogTitle>
          <DialogDescription>
            <Badge className={`${statusBadge(booking.status)} mt-1`}>{booking.status.replace("_", " ")}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tourist info */}
          <div className="bg-muted/40 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tourist</p>
            {booking.touristName && (
              <p className="text-sm flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-muted-foreground" /> {booking.touristName}
              </p>
            )}
            {booking.touristEmail && (
              <p className="text-sm flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" /> {booking.touristEmail}
              </p>
            )}
          </div>

          {/* Booking details */}
          <div className="bg-muted/40 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Details</p>
            <p className="text-sm"><span className="text-muted-foreground">Service:</span> {booking.serviceName}</p>
            <p className="text-sm"><span className="text-muted-foreground">Date:</span> {fmtDate(booking.bookingDate)}</p>
            <p className="text-sm"><span className="text-muted-foreground">Party:</span> {booking.partySize} guest{booking.partySize !== 1 ? "s" : ""}</p>
            <p className="text-sm"><span className="text-muted-foreground">Amount:</span> {fmtUsd(booking.priceUsd)} {booking.currency}</p>
            {booking.notes && (
              <p className="text-sm flex items-start gap-2">
                <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                <span>{booking.notes}</span>
              </p>
            )}
          </div>

          {/* Reminder toggle — only for confirmed bookings */}
          {booking.status === "confirmed" && (
            <div className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium">24h Reminder</p>
                <p className="text-xs text-muted-foreground">Owner notification 24h before booking</p>
              </div>
              <Button
                size="sm"
                variant={reminderOn ? "default" : "outline"}
                className="h-7 px-3 text-xs"
                disabled={toggleReminder.isPending}
                onClick={() => toggleReminder.mutate({ bookingId: booking.id, establishmentId, enabled: !reminderOn })}
              >
                {reminderOn ? "On" : "Off"}
              </Button>
            </div>
          )}
          {/* Notes for update */}
          {actions.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Notes (optional)</p>
              <Input
                placeholder="Add notes for this status change…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          )}

          {/* Action buttons */}
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action.value}
                  variant={action.variant}
                  size="sm"
                  disabled={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({
                      bookingId: booking.id,
                      establishmentId,
                      status: action.value as "confirmed" | "completed" | "cancelled" | "no_show",
                      notes: notes || undefined,
                    })
                  }
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reschedule Sheet ────────────────────────────────────────────────────────

function RescheduleSheet({
  booking,
  establishmentId,
  onClose,
  onUpdated,
}: {
  booking: Booking;
  establishmentId: number;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [newDate, setNewDate] = useState(() => {
    const d = new Date(booking.bookingDate);
    // Format as datetime-local input value
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const rescheduleMutation = trpc.merchantBookings.rescheduleBooking.useMutation({
    onSuccess: () => {
      toast.success("Booking rescheduled successfully");
      onUpdated();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            Reschedule Booking
          </DialogTitle>
          <DialogDescription>
            Booking #{booking.confirmationCode ?? booking.id} — {booking.serviceName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
            ⚠ This booking conflicts with another booking within 1 hour. Please select a new date and time.
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-date">New Date &amp; Time</Label>
            <input
              id="new-date"
              type="datetime-local"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Current: {new Date(booking.bookingDate).toLocaleString()}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={rescheduleMutation.isPending || !newDate}
            onClick={() =>
              rescheduleMutation.mutate({
                bookingId: booking.id,
                establishmentId,
                newBookingDate: new Date(newDate).toISOString(),
              })
            }
          >
            {rescheduleMutation.isPending ? "Rescheduling..." : "Reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

function CalendarView({
  bookings,
  onSelectBooking,
  establishmentId,
  onRefresh,
}: {
  bookings: Booking[];
  onSelectBooking: (b: Booking) => void;
  establishmentId: number | null;
  onRefresh: () => void;
}) {
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay()); // Sunday
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const bookingsByDay = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    for (const b of bookings) {
      const d = new Date(b.bookingDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(b);
    }
    return map;
  }, [bookings]);

  // Detect conflicts: two confirmed/pending bookings on the same day within 1 hour of each other
  const conflictIds = useMemo(() => {
    const ids = new Set<number>();
    for (const dayBookings of Object.values(bookingsByDay)) {
      const active = dayBookings.filter((b) => b.status === "confirmed" || b.status === "pending");
      for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
          const tA = new Date(active[i].bookingDate).getTime();
          const tB = new Date(active[j].bookingDate).getTime();
          if (Math.abs(tA - tB) < 60 * 60 * 1000) { // within 1 hour
            ids.add(active[i].id);
            ids.add(active[j].id);
          }
        }
      }
    }
    return ids;
  }, [bookingsByDay]);

  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-3">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() - 7);
            setWeekStart(d);
          }}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium">
          {weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {" – "}
          {weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + 7);
            setWeekStart(d);
          }}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
        ))}
        {days.map((day) => {
          const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
          const dayBookings = bookingsByDay[key] ?? [];
          const isToday = day.getTime() === today.getTime();
          return (
            <div
              key={key}
              className={`min-h-[90px] rounded-lg border p-1.5 ${
                isToday ? "border-primary/60 bg-primary/5" : "border-border/40 bg-card"
              }`}
            >
              <div className={`text-xs font-semibold mb-1 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                {day.getDate()}
              </div>
              {/* Conflict warning badge */}
              {dayBookings.some((b) => conflictIds.has(b.id)) && (
                <div className="text-[9px] text-red-400 flex items-center gap-0.5 mb-0.5">
                  <span>⚠</span><span>Conflict</span>
                </div>
              )}
              <div className="space-y-0.5">
                {dayBookings.slice(0, 3).map((b) => (
                  <div key={b.id}>
                    <button
                      className={`w-full text-left text-[10px] px-1 py-0.5 rounded truncate ${
                        conflictIds.has(b.id) ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/40" :
                        b.status === "confirmed" ? "bg-blue-500/20 text-blue-300" :
                        b.status === "pending" ? "bg-yellow-500/20 text-yellow-300" :
                        b.status === "completed" ? "bg-emerald-500/20 text-emerald-300" :
                        "bg-muted text-muted-foreground"
                      }`}
                      onClick={() => onSelectBooking(b)}
                    >
                      {conflictIds.has(b.id) && <span className="mr-0.5">⚠</span>}
                      {new Date(b.bookingDate).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} {b.serviceName}
                    </button>
                    {conflictIds.has(b.id) && (
                      <button
                        className="w-full text-left text-[9px] px-1 py-0.5 rounded text-red-300 hover:bg-red-500/30 transition-colors flex items-center gap-0.5"
                        onClick={(e) => { e.stopPropagation(); setRescheduleBooking(b); }}
                      >
                        <CalendarClock className="w-2.5 h-2.5" /> Reschedule
                      </button>
                    )}
                  </div>
                ))}
                {dayBookings.length > 3 && (
                  <p className="text-[10px] text-muted-foreground pl-1">+{dayBookings.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    {rescheduleBooking && establishmentId && (
      <RescheduleSheet
        booking={rescheduleBooking}
        establishmentId={establishmentId}
        onClose={() => setRescheduleBooking(null)}
        onUpdated={() => { setRescheduleBooking(null); onRefresh(); }}
      />
    )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MerchantBookings() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");

  // Get merchant's establishments
  const estQueryResult = trpc.kyb.listEstablishments.useQuery();
  const establishments = estQueryResult.data ?? [];
  const [selectedEstId, setSelectedEstId] = useState<number | null>(null);
  const estId = selectedEstId ?? establishments[0]?.id ?? null;

  const statsQuery = trpc.merchantBookings.getStats.useQuery(
    { establishmentId: estId! },
    { enabled: !!estId }
  );

  const bookingsQuery = trpc.merchantBookings.listBookings.useQuery(
    { establishmentId: estId!, status: statusFilter as "all" | "pending" | "confirmed" | "completed" | "cancelled" | "no_show", limit: 50 },
    { enabled: !!estId }
  );

  const bulkMutation = trpc.merchantBookings.bulkUpdateStatus.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.updatedCount} bookings updated`);
      setSelectedIds(new Set());
      bookingsQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredBookings = useMemo(() => {
    if (!bookingsQuery.data?.bookings) return [];
    if (!search) return bookingsQuery.data.bookings;
    const q = search.toLowerCase();
    return bookingsQuery.data.bookings.filter(
      (b) =>
        b.serviceName.toLowerCase().includes(q) ||
        (b.touristName ?? "").toLowerCase().includes(q) ||
        (b.confirmationCode ?? "").toLowerCase().includes(q)
    );
  }, [bookingsQuery.data, search]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const stats = statsQuery.data;

  if (!user) {
    return <div className="p-8 text-center text-muted-foreground">Please log in to view your booking inbox.</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="w-6 h-6 text-primary" /> Booking Inbox
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage tourist bookings for your establishment</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {establishments.length > 1 && (
            <Select value={String(estId ?? "")} onValueChange={(v) => setSelectedEstId(Number(v))}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select establishment" />
              </SelectTrigger>
              <SelectContent>
                {establishments.map((e: { id: number; name: string }) => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* View mode toggle */}
          <div className="flex items-center border border-border rounded-md overflow-hidden">
            <button
              className={`px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors ${
                viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
              onClick={() => setViewMode("list")}
            >
              <LayoutList className="w-3.5 h-3.5" /> List
            </button>
            <button
              className={`px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors ${
                viewMode === "calendar" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
              onClick={() => setViewMode("calendar")}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Calendar
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => { bookingsQuery.refetch(); statsQuery.refetch(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total", value: stats.total, icon: CalendarCheck, color: "text-foreground" },
            { label: "Pending", value: stats.pending, icon: Clock, color: "text-yellow-400" },
            { label: "Confirmed", value: stats.confirmed, icon: CheckCircle, color: "text-blue-400" },
            { label: "Completed", value: stats.completed, icon: TrendingUp, color: "text-emerald-400" },
            { label: "Cancelled", value: stats.cancelled, icon: XCircle, color: "text-red-400" },
            { label: "Revenue", value: fmtUsd(stats.completedRevenue), icon: DollarSign, color: "text-emerald-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="border-border/50">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters + Bulk actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name, service, or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="no_show">No Show</SelectItem>
          </SelectContent>
        </Select>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
            <Button
              size="sm"
              disabled={bulkMutation.isPending}
              onClick={() =>
                bulkMutation.mutate({
                  establishmentId: estId!,
                  bookingIds: Array.from(selectedIds),
                  status: "confirmed",
                })
              }
            >
              Bulk Confirm
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkMutation.isPending}
              onClick={() =>
                bulkMutation.mutate({
                  establishmentId: estId!,
                  bookingIds: Array.from(selectedIds),
                  status: "cancelled",
                })
              }
            >
              Bulk Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Calendar view */}
      {viewMode === "calendar" && (
        <CalendarView
          bookings={filteredBookings as Booking[]}
          onSelectBooking={setSelectedBooking}
          establishmentId={estId}
          onRefresh={() => { bookingsQuery.refetch(); statsQuery.refetch(); }}
        />
      )}

      {/* List view */}
      {viewMode === "list" && (
        <>
          {!estId ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No establishment found. Complete KYB onboarding first.</p>
              </CardContent>
            </Card>
          ) : bookingsQuery.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading bookings…</div>
          ) : filteredBookings.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Inbox className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No bookings found.</p>
                {statusFilter !== "all" && (
                  <Button variant="link" size="sm" onClick={() => setStatusFilter("all")}>
                    Clear filter
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredBookings.map((booking) => (
                <Card
                  key={booking.id}
                  className={`cursor-pointer hover:border-primary/50 transition-all ${selectedIds.has(booking.id) ? "border-primary" : ""}`}
                  onClick={() => setSelectedBooking(booking as Booking)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(booking.id)}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); toggleSelect(booking.id); }}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          className="rounded"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold truncate">{booking.serviceName}</span>
                            <Badge className={`${statusBadge(booking.status)} text-xs`}>
                              {booking.status.replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" /> {booking.touristName ?? "Unknown"}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" /> {booking.partySize}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {fmtDate(booking.bookingDate)}
                            </span>
                            {booking.confirmationCode && (
                              <span className="font-mono">#{booking.confirmationCode}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-emerald-400 font-semibold">{fmtUsd(booking.priceUsd)}</span>
                        <ChevronDown className="w-4 h-4 text-muted-foreground rotate-[-90deg]" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Detail dialog */}
      {selectedBooking && estId && (
        <BookingDetailDialog
          booking={selectedBooking}
          establishmentId={estId}
          onClose={() => setSelectedBooking(null)}
          onUpdated={() => { bookingsQuery.refetch(); statsQuery.refetch(); }}
        />
      )}
    </div>
  );
}
