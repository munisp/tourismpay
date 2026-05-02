/**
 * Service Availability Calendar
 *
 * Allows merchants to manage per-date slot availability for their products/services.
 * Features:
 * - Monthly calendar grid showing availability status per product
 * - Click a date cell to set/edit slots or block the date
 * - Bulk-set range with optional weekday filter
 * - Block/unblock date ranges
 * - Product selector to focus on one service at a time
 *
 * Round 111: Initial implementation.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Lock,
  Unlock,
  Users,
  Settings2,
  Loader2,
  Package,
} from "lucide-react";

// ── Date helpers ──────────────────────────────────────────────────────────────

function toYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

function monthEnd(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0));
}

function daysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const start = monthStart(year, month);
  const end = monthEnd(year, month);
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type AvailRow = {
  id: number;
  productId: number;
  date: string;
  totalSlots: number;
  bookedSlots: number;
  isBlocked: boolean;
  notes: string | null;
};

type DayEditForm = {
  totalSlots: string;
  isBlocked: boolean;
  notes: string;
};

type BulkForm = {
  startDate: string;
  endDate: string;
  totalSlots: string;
  isBlocked: boolean;
  notes: string;
  weekdays: number[];
};

// ── Day cell component ────────────────────────────────────────────────────────

function DayCell({
  date,
  avail,
  isToday,
  onClick,
}: {
  date: Date;
  avail: AvailRow | undefined;
  isToday: boolean;
  onClick: () => void;
}) {
  const day = date.getUTCDate();
  const hasRecord = !!avail;
  const isBlocked = avail?.isBlocked ?? false;
  const totalSlots = avail?.totalSlots ?? 0;
  const bookedSlots = avail?.bookedSlots ?? 0;
  const available = totalSlots > 0 ? totalSlots - bookedSlots : null;
  const isFull = available !== null && available <= 0;

  let bg = "bg-card hover:bg-muted/50";
  let textColor = "text-foreground";
  let indicator: React.ReactNode = null;

  if (isBlocked) {
    bg = "bg-destructive/10 hover:bg-destructive/20";
    textColor = "text-destructive";
    indicator = <Lock className="w-2.5 h-2.5 text-destructive" />;
  } else if (isFull) {
    bg = "bg-amber-500/10 hover:bg-amber-500/20";
    textColor = "text-amber-600 dark:text-amber-400";
    indicator = <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400">FULL</span>;
  } else if (hasRecord && totalSlots > 0) {
    bg = "bg-green-500/10 hover:bg-green-500/20";
    textColor = "text-green-700 dark:text-green-400";
    indicator = (
      <span className="text-[9px] font-semibold text-green-700 dark:text-green-400">
        {available}/{totalSlots}
      </span>
    );
  } else if (hasRecord) {
    // 0 slots = unlimited
    bg = "bg-blue-500/10 hover:bg-blue-500/20";
    indicator = <span className="text-[9px] text-blue-600 dark:text-blue-400">∞</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        relative flex flex-col items-start justify-between p-1.5 rounded-md border border-border
        min-h-[56px] text-left transition-colors cursor-pointer
        ${bg}
        ${isToday ? "ring-2 ring-primary ring-offset-1" : ""}
      `}
    >
      <span className={`text-xs font-semibold ${textColor} ${isToday ? "text-primary" : ""}`}>
        {day}
      </span>
      <div className="flex items-center gap-0.5 mt-auto">
        {indicator}
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ServiceAvailabilityCalendar() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());

  const { data: establishments, isLoading: estLoading } =
    trpc.merchantRevenue.myEstablishments.useQuery();

  const [selectedEstId, setSelectedEstId] = useState<number | null>(null);
  const estId = selectedEstId ?? establishments?.[0]?.id ?? 0;

  const { data: products, isLoading: productsLoading } =
    trpc.merchantProducts.list.useQuery(
      { establishmentId: estId },
      { enabled: estId > 0 }
    );

  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const productId = selectedProductId ?? products?.[0]?.id ?? 0;

  const startDate = toYMD(monthStart(year, month));
  const endDate = toYMD(monthEnd(year, month));

  const { data: availData, isLoading: availLoading } =
    trpc.serviceAvailability.getByProduct.useQuery(
      { productId, startDate, endDate },
      { enabled: productId > 0 }
    );

  // Build a map: date → AvailRow
  const availMap = useMemo(() => {
    const m: Record<string, AvailRow> = {};
    for (const row of availData ?? []) {
      m[row.date] = row;
    }
    return m;
  }, [availData]);

  const days = useMemo(() => daysInMonth(year, month), [year, month]);
  const todayYMD = toYMD(now);

  // Leading blank cells so the first day falls on the right weekday
  const leadingBlanks = days[0]?.getUTCDay() ?? 0;

  // ── Day edit dialog ──────────────────────────────────────────────────────────

  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [dayForm, setDayForm] = useState<DayEditForm>({ totalSlots: "0", isBlocked: false, notes: "" });

  const setDateMut = trpc.serviceAvailability.setDate.useMutation({
    onSuccess: () => {
      utils.serviceAvailability.getByProduct.invalidate({ productId, startDate, endDate });
      toast.success("Availability saved");
      setDayDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const clearRangeMut = trpc.serviceAvailability.clearRange.useMutation({
    onSuccess: (data) => {
      utils.serviceAvailability.getByProduct.invalidate({ productId, startDate, endDate });
      toast.success(`Cleared ${data.cleared} date(s)`);
      setDayDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const openDayDialog = (date: Date) => {
    const ymd = toYMD(date);
    setSelectedDate(ymd);
    const existing = availMap[ymd];
    setDayForm({
      totalSlots: String(existing?.totalSlots ?? 0),
      isBlocked: existing?.isBlocked ?? false,
      notes: existing?.notes ?? "",
    });
    setDayDialogOpen(true);
  };

  const handleSaveDay = () => {
    const slots = parseInt(dayForm.totalSlots, 10);
    if (isNaN(slots) || slots < 0) return toast.error("Slots must be a non-negative number");
    setDateMut.mutate({
      productId,
      date: selectedDate,
      totalSlots: slots,
      isBlocked: dayForm.isBlocked,
      notes: dayForm.notes || undefined,
    });
  };

  const handleClearDay = () => {
    clearRangeMut.mutate({ productId, startDate: selectedDate, endDate: selectedDate });
  };

  // ── Bulk edit dialog ─────────────────────────────────────────────────────────

  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState<BulkForm>({
    startDate: startDate,
    endDate: endDate,
    totalSlots: "0",
    isBlocked: false,
    notes: "",
    weekdays: [],
  });

  const bulkSetMut = trpc.serviceAvailability.bulkSetRange.useMutation({
    onSuccess: (data) => {
      utils.serviceAvailability.getByProduct.invalidate({ productId, startDate, endDate });
      toast.success(`Updated ${data.updated} date(s)`);
      setBulkDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleBulkSave = () => {
    const slots = parseInt(bulkForm.totalSlots, 10);
    if (isNaN(slots) || slots < 0) return toast.error("Slots must be a non-negative number");
    bulkSetMut.mutate({
      productId,
      startDate: bulkForm.startDate,
      endDate: bulkForm.endDate,
      totalSlots: slots,
      isBlocked: bulkForm.isBlocked,
      notes: bulkForm.notes || undefined,
      weekdays: bulkForm.weekdays.length > 0 ? bulkForm.weekdays : undefined,
    });
  };

  const toggleWeekday = (day: number) => {
    setBulkForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(day)
        ? f.weekdays.filter((d) => d !== day)
        : [...f.weekdays, day],
    }));
  };

  // ── Navigation ───────────────────────────────────────────────────────────────

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  if (!user) return null;

  const selectedProduct = products?.find((p) => p.id === productId);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary" />
            Availability Calendar
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Set slot limits, block dates, and manage availability for each service
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setBulkForm({ startDate, endDate, totalSlots: "0", isBlocked: false, notes: "", weekdays: [] });
            setBulkDialogOpen(true);
          }}
          disabled={productId === 0}
        >
          <Settings2 className="w-4 h-4 mr-2" />
          Bulk Edit
        </Button>
      </div>

      {/* Selectors */}
      {estLoading || productsLoading ? (
        <div className="h-10 bg-muted animate-pulse rounded" />
      ) : !establishments?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No verified establishment found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          {establishments.length > 1 && (
            <div className="flex items-center gap-2">
              <Label className="text-sm shrink-0">Establishment:</Label>
              <Select
                value={String(estId)}
                onValueChange={(v) => { setSelectedEstId(Number(v)); setSelectedProductId(null); }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {establishments.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Label className="text-sm shrink-0">Service:</Label>
            {!products?.length ? (
              <p className="text-sm text-muted-foreground">No products yet — add some in Product Catalog first.</p>
            ) : (
              <Select
                value={String(productId)}
                onValueChange={(v) => setSelectedProductId(Number(v))}
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500/20 border border-blue-500/30" /> Unlimited (∞)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500/20 border border-green-500/30" /> Slots available</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/30" /> Fully booked</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-destructive/20 border border-destructive/30" /> Blocked</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-card border border-border" /> No record (open)</span>
      </div>

      {/* Calendar */}
      {productId === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Select a service above to view its calendar.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <CardTitle className="text-base">
                  {MONTH_NAMES[month]} {year}
                </CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              {selectedProduct && (
                <Badge variant="secondary" className="text-xs">
                  {selectedProduct.name}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {availLoading ? (
              <div className="h-64 bg-muted animate-pulse rounded-lg" />
            ) : (
              <>
                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {DAY_NAMES.map((d) => (
                    <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
                      {d}
                    </div>
                  ))}
                </div>
                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1">
                  {/* Leading blanks */}
                  {Array.from({ length: leadingBlanks }).map((_, i) => (
                    <div key={`blank-${i}`} />
                  ))}
                  {/* Day cells */}
                  {days.map((date) => {
                    const ymd = toYMD(date);
                    return (
                      <DayCell
                        key={ymd}
                        date={date}
                        avail={availMap[ymd]}
                        isToday={ymd === todayYMD}
                        onClick={() => openDayDialog(date)}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Day Edit Dialog */}
      <Dialog open={dayDialogOpen} onOpenChange={setDayDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              {selectedDate}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <Switch
                checked={dayForm.isBlocked}
                onCheckedChange={(v) => setDayForm((f) => ({ ...f, isBlocked: v }))}
              />
              <Label className="cursor-pointer flex items-center gap-1.5">
                {dayForm.isBlocked ? <Lock className="w-3.5 h-3.5 text-destructive" /> : <Unlock className="w-3.5 h-3.5" />}
                {dayForm.isBlocked ? "Date is blocked" : "Date is open"}
              </Label>
            </div>
            {!dayForm.isBlocked && (
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Total Slots (0 = unlimited)
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={dayForm.totalSlots}
                  onChange={(e) => setDayForm((f) => ({ ...f, totalSlots: e.target.value }))}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="e.g. Public holiday, Maintenance day"
                rows={2}
                value={dayForm.notes}
                onChange={(e) => setDayForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {availMap[selectedDate] && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={handleClearDay}
                disabled={clearRangeMut.isPending}
              >
                {clearRangeMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Clear"}
              </Button>
            )}
            <Button variant="outline" onClick={() => setDayDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveDay} disabled={setDateMut.isPending}>
              {setDateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Edit Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Bulk Edit Availability
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={bulkForm.startDate}
                  onChange={(e) => setBulkForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={bulkForm.endDate}
                  onChange={(e) => setBulkForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-3">
              <Switch
                checked={bulkForm.isBlocked}
                onCheckedChange={(v) => setBulkForm((f) => ({ ...f, isBlocked: v }))}
              />
              <Label className="cursor-pointer">
                {bulkForm.isBlocked ? "Block all dates in range" : "Set availability for range"}
              </Label>
            </div>
            {!bulkForm.isBlocked && (
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Total Slots per Day (0 = unlimited)
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={bulkForm.totalSlots}
                  onChange={(e) => setBulkForm((f) => ({ ...f, totalSlots: e.target.value }))}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm">Apply to weekdays only (leave empty for all days)</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map((wd) => (
                  <button
                    key={wd.value}
                    type="button"
                    onClick={() => toggleWeekday(wd.value)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      bulkForm.weekdays.includes(wd.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {wd.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="e.g. Peak season, Reduced capacity"
                rows={2}
                value={bulkForm.notes}
                onChange={(e) => setBulkForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkSave} disabled={bulkSetMut.isPending}>
              {bulkSetMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Apply to Range
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
