/**
 * ItineraryBuilder.tsx
 *
 * Tourist trip itinerary builder — create and manage multi-establishment
 * trip plans with a day-by-day timeline and cost summary.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Plus, Trash2, Pencil, MapPin, Calendar, DollarSign,
  Hotel, Utensils, Car, Plane, Sparkles, Leaf, Map,
  Waves, Landmark, FerrisWheel, Music, Trophy, Clock,
  ChevronDown, ChevronUp, Globe, CheckCircle2, XCircle,
  Luggage, Coffee, Share2, Download, Copy, Users2, UserPlus, History,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemType = "activity" | "accommodation" | "transport" | "meal" | "free_time";
type ItemStatus = "planned" | "confirmed" | "completed" | "cancelled";

const ITEM_TYPE_ICONS: Record<ItemType, React.ReactNode> = {
  accommodation: <Hotel className="w-3.5 h-3.5" />,
  meal: <Utensils className="w-3.5 h-3.5" />,
  transport: <Car className="w-3.5 h-3.5" />,
  activity: <Map className="w-3.5 h-3.5" />,
  free_time: <Coffee className="w-3.5 h-3.5" />,
};

const ITEM_TYPE_COLORS: Record<ItemType, string> = {
  accommodation: "bg-blue-500/10 text-blue-600 border-blue-200",
  meal: "bg-orange-500/10 text-orange-600 border-orange-200",
  transport: "bg-purple-500/10 text-purple-600 border-purple-200",
  activity: "bg-green-500/10 text-green-600 border-green-200",
  free_time: "bg-gray-500/10 text-gray-600 border-gray-200",
};

const STATUS_COLORS: Record<ItemStatus, string> = {
  planned: "bg-muted text-muted-foreground",
  confirmed: "bg-blue-500/10 text-blue-600",
  completed: "bg-green-500/10 text-green-600",
  cancelled: "bg-red-500/10 text-red-600",
};

const EST_TYPE_ICONS: Record<string, React.ReactNode> = {
  hotel: <Hotel className="w-3 h-3" />,
  restaurant: <Utensils className="w-3 h-3" />,
  safari_lodge: <Leaf className="w-3 h-3" />,
  tour_operator: <Map className="w-3 h-3" />,
  beach_resort: <Waves className="w-3 h-3" />,
  spa_wellness: <Sparkles className="w-3 h-3" />,
  airline: <Plane className="w-3 h-3" />,
  car_rental: <Car className="w-3 h-3" />,
  museum: <Landmark className="w-3 h-3" />,
  theme_park: <FerrisWheel className="w-3 h-3" />,
  concert_venue: <Music className="w-3 h-3" />,
  sports_venue: <Trophy className="w-3 h-3" />,
};

// ─── Add Item Dialog ──────────────────────────────────────────────────────────

interface AddItemDialogProps {
  itineraryId: number;
  open: boolean;
  onClose: () => void;
  defaultDay?: number;
  totalDays: number;
}

function AddItemDialog({ itineraryId, open, onClose, defaultDay = 1, totalDays }: AddItemDialogProps) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    title: "",
    notes: "",
    dayNumber: defaultDay,
    startTime: "",
    endTime: "",
    estimatedCostUsd: 0,
    itemType: "activity" as ItemType,
  });

  const addItem = trpc.itinerary.addItem.useMutation({
    onSuccess: () => {
      utils.itinerary.get.invalidate({ id: itineraryId });
      toast.success("Activity added to your itinerary");
      onClose();
      setForm({ title: "", notes: "", dayNumber: defaultDay, startTime: "", endTime: "", estimatedCostUsd: 0, itemType: "activity" });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Activity</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Check in at Serena Hotel"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Day</Label>
              <Select
                value={form.dayNumber.toString()}
                onValueChange={(v) => setForm({ ...form, dayNumber: parseInt(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={d.toString()}>Day {d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={form.itemType}
                onValueChange={(v) => setForm({ ...form, itemType: v as ItemType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activity">Activity</SelectItem>
                  <SelectItem value="accommodation">Accommodation</SelectItem>
                  <SelectItem value="transport">Transport</SelectItem>
                  <SelectItem value="meal">Meal</SelectItem>
                  <SelectItem value="free_time">Free Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Time</Label>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              />
            </div>
            <div>
              <Label>End Time</Label>
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Estimated Cost (USD)</Label>
            <Input
              type="number"
              min={0}
              value={form.estimatedCostUsd}
              onChange={(e) => setForm({ ...form, estimatedCostUsd: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Any details or reminders..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() =>
              addItem.mutate({
                itineraryId,
                dayNumber: form.dayNumber,
                title: form.title,
                notes: form.notes || undefined,
                startTime: form.startTime || undefined,
                endTime: form.endTime || undefined,
                estimatedCostUsd: form.estimatedCostUsd,
                itemType: form.itemType,
              })
            }
            disabled={!form.title.trim() || addItem.isPending}
          >
            {addItem.isPending ? "Adding..." : "Add Activity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Itinerary Dialog ──────────────────────────────────────────────────

function CreateItineraryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    title: "",
    description: "",
    startDate: "",
    endDate: "",
    currency: "USD",
  });

  const create = trpc.itinerary.create.useMutation({
    onSuccess: () => {
      utils.itinerary.list.invalidate();
      toast.success("Itinerary created!");
      onClose();
      setForm({ title: "", description: "", startDate: "", endDate: "", currency: "USD" });
    },
    onError: (e) => toast.error(e.message),
  });

  const tripDays =
    form.startDate && form.endDate
      ? Math.max(
          1,
          Math.ceil(
            (new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) /
              (1000 * 60 * 60 * 24)
          ) + 1
        )
      : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Trip Itinerary</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Trip Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Kenya Safari & Beach 2026"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description of your trip..."
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={form.endDate}
                min={form.startDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>
          {tripDays && (
            <p className="text-xs text-muted-foreground">
              <Calendar className="w-3 h-3 inline mr-1" />
              {tripDays} day{tripDays !== 1 ? "s" : ""} trip
            </p>
          )}
          <div>
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD — US Dollar</SelectItem>
                <SelectItem value="EUR">EUR — Euro</SelectItem>
                <SelectItem value="GBP">GBP — British Pound</SelectItem>
                <SelectItem value="KES">KES — Kenyan Shilling</SelectItem>
                <SelectItem value="ZAR">ZAR — South African Rand</SelectItem>
                <SelectItem value="NGN">NGN — Nigerian Naira</SelectItem>
                <SelectItem value="GHS">GHS — Ghanaian Cedi</SelectItem>
                <SelectItem value="TZS">TZS — Tanzanian Shilling</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() =>
              create.mutate({
                title: form.title,
                description: form.description || undefined,
                startDate: form.startDate || undefined,
                endDate: form.endDate || undefined,
                currency: form.currency,
              })
            }
            disabled={!form.title.trim() || create.isPending}
          >
            {create.isPending ? "Creating..." : "Create Itinerary"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Day Timeline ─────────────────────────────────────────────────────────────

interface DayTimelineProps {
  itineraryId: number;
  dayNumber: number;
  items: Array<{
    item: {
      id: number;
      title: string;
      notes: string | null;
      startTime: string | null;
      endTime: string | null;
      estimatedCostUsd: string | null;
      itemType: string;
      status: string;
    };
    establishment: {
      id: number;
      name: string;
      type: string;
      city: string | null;
      country: string | null;
    } | null;
  }>;
  dayCost: number;
  onAddItem: (day: number) => void;
}

function DayTimeline({ itineraryId, dayNumber, items, dayCost, onAddItem }: DayTimelineProps) {
  const utils = trpc.useUtils();
  const [collapsed, setCollapsed] = useState(false);

  const removeItem = trpc.itinerary.removeItem.useMutation({
    onSuccess: () => {
      utils.itinerary.get.invalidate({ id: itineraryId });
      toast.success("Activity removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateItem = trpc.itinerary.updateItem.useMutation({
    onSuccess: () => utils.itinerary.get.invalidate({ id: itineraryId }),
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Day header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
            {dayNumber}
          </div>
          <span className="font-semibold text-sm">Day {dayNumber}</span>
          <Badge variant="outline" className="text-xs">{items.length} activit{items.length !== 1 ? "ies" : "y"}</Badge>
        </div>
        <div className="flex items-center gap-3">
          {dayCost > 0 && (
            <span className="text-sm font-medium text-muted-foreground">
              <DollarSign className="w-3 h-3 inline" />{dayCost.toFixed(2)}
            </span>
          )}
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </div>
      </button>

      {/* Items */}
      {!collapsed && (
        <div className="divide-y divide-border/50">
          {items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No activities planned for this day yet.
            </div>
          ) : (
            items.map(({ item, establishment }) => (
              <div key={item.id} className="px-4 py-3 flex items-start gap-3 group">
                {/* Time column */}
                <div className="w-16 flex-shrink-0 text-xs text-muted-foreground text-right pt-0.5">
                  {item.startTime ? (
                    <span>{item.startTime}{item.endTime ? `–${item.endTime}` : ""}</span>
                  ) : (
                    <Clock className="w-3 h-3 ml-auto text-muted-foreground/40" />
                  )}
                </div>

                {/* Type indicator */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border ${
                    ITEM_TYPE_COLORS[item.itemType as ItemType] ?? "bg-muted"
                  }`}
                >
                  {ITEM_TYPE_ICONS[item.itemType as ItemType] ?? <Map className="w-3.5 h-3.5" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium leading-tight">{item.title}</p>
                      {establishment && (
                        <div className="flex items-center gap-1 mt-0.5">
                          {EST_TYPE_ICONS[establishment.type] ?? <MapPin className="w-3 h-3" />}
                          <span className="text-xs text-muted-foreground truncate">
                            {establishment.name}
                            {establishment.city ? `, ${establishment.city}` : ""}
                          </span>
                        </div>
                      )}
                      {item.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {parseFloat(item.estimatedCostUsd ?? "0") > 0 && (
                        <span className="text-xs font-medium text-muted-foreground">
                          ${parseFloat(item.estimatedCostUsd ?? "0").toFixed(2)}
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-xs px-1.5 py-0 h-5 ${STATUS_COLORS[item.status as ItemStatus] ?? ""}`}
                      >
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {item.status === "planned" && (
                    <button
                      className="p-1 rounded hover:bg-green-500/10 text-green-600"
                      title="Mark confirmed"
                      onClick={() => updateItem.mutate({ id: item.id, itineraryId, status: "confirmed" })}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    className="p-1 rounded hover:bg-red-500/10 text-red-500"
                    title="Remove"
                    onClick={() => removeItem.mutate({ id: item.id, itineraryId })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}

          {/* Add activity button */}
          <div className="px-4 py-2">
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
              onClick={() => onAddItem(dayNumber)}
            >
              <Plus className="w-3.5 h-3.5" />
              Add activity to Day {dayNumber}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Itinerary Detail View ────────────────────────────────────────────────────

function ItineraryDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.itinerary.get.useQuery({ id });
  const [addItemDay, setAddItemDay] = useState<number | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showCollabDialog, setShowCollabDialog] = useState(false);
  const [collabTab, setCollabTab] = useState<"collaborators" | "changelog">("collaborators");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");

  const { data: collaborators, refetch: refetchCollabs } = trpc.itinerary.getCollaborators.useQuery(
    { itineraryId: id },
    { enabled: showCollabDialog }
  );
  const { data: changelog } = trpc.itinerary.getChangelog.useQuery(
    { itineraryId: id },
    { enabled: showCollabDialog && collabTab === "changelog" }
  );

  const inviteMutation = trpc.itinerary.inviteCollaborator.useMutation({
    onSuccess: ({ inviteToken }) => {
      const inviteUrl = `${window.location.origin}/trip/join?token=${inviteToken}`;
      navigator.clipboard.writeText(inviteUrl)
        .then(() => toast.success("Invite link copied!", { description: inviteUrl }))
        .catch(() => toast.success("Invite created!", { description: inviteUrl }));
      setInviteEmail("");
      refetchCollabs();
    },
    onError: (e) => toast.error(e.message),
  });

  const removeCollabMutation = trpc.itinerary.removeCollaborator.useMutation({
    onSuccess: () => { toast.success("Collaborator removed"); refetchCollabs(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteItinerary = trpc.itinerary.delete.useMutation({
    onSuccess: () => {
      utils.itinerary.list.invalidate();
      toast.success("Itinerary deleted");
      onBack();
    },
    onError: (e) => toast.error(e.message),
  });

  const shareMutation = trpc.itinerary.share.useMutation({
    onSuccess: ({ shareToken }) => {
      const url = `${window.location.origin}/trip/${shareToken}`;
      navigator.clipboard.writeText(url).then(() => {
        toast.success("Share link copied!", { description: url });
      }).catch(() => {
        toast.success("Trip shared!", { description: url });
      });
      utils.itinerary.get.invalidate({ id });
    },
    onError: (e) => toast.error(e.message),
  });

  const unshareMutation = trpc.itinerary.unshare.useMutation({
    onSuccess: () => {
      toast.success("Trip link revoked");
      utils.itinerary.get.invalidate({ id });
    },
    onError: (e) => toast.error(e.message),
  });

  const exportMutation = trpc.itinerary.exportPdf.useMutation({
    onSuccess: ({ exportUrl }) => {
      window.open(exportUrl, "_blank");
      toast.success("Itinerary exported!", { description: "Opening printable report" });
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!data) return null;

  const totalDays =
    data.startDate && data.endDate
      ? Math.max(
          1,
          Math.ceil(
            (new Date(data.endDate).getTime() - new Date(data.startDate).getTime()) /
              (1000 * 60 * 60 * 24)
          ) + 1
        )
      : Math.max(data.days.length, 1);

  // Ensure all days 1..totalDays are represented
  const allDays = Array.from({ length: totalDays }, (_, i) => {
    const dayNum = i + 1;
    const found = data.days.find((d) => d.dayNumber === dayNum);
    return found ?? { dayNumber: dayNum, items: [], dayCost: 0 };
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <button
            className="text-xs text-muted-foreground hover:text-foreground mb-1 flex items-center gap-1"
            onClick={onBack}
          >
            ← Back to itineraries
          </button>
          <h2 className="text-xl font-bold">{data.title}</h2>
          {data.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{data.description}</p>
          )}
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
            {data.startDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(data.startDate), "MMM d")}
                {data.endDate ? ` – ${format(new Date(data.endDate), "MMM d, yyyy")}` : ""}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Luggage className="w-3 h-3" />
              {totalDays} day{totalDays !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              Total: <strong className="text-foreground">${data.totalCost.toFixed(2)} {data.currency}</strong>
            </span>
            <Badge
              variant="outline"
              className={`${
                data.status === "confirmed"
                  ? "text-blue-600"
                  : data.status === "completed"
                  ? "text-green-600"
                  : data.status === "cancelled"
                  ? "text-red-600"
                  : "text-muted-foreground"
              }`}
            >
              {data.status}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => { setAddItemDay(1); setShowAddItem(true); }}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Activity
          </Button>
          {/* Share Trip */}
          {data.isPublic && data.shareToken ? (
            <Button
              size="sm"
              variant="outline"
              className="text-emerald-500 border-emerald-500/40 hover:bg-emerald-500/10"
              onClick={() => {
                const url = `${window.location.origin}/trip/${data.shareToken}`;
                navigator.clipboard.writeText(url).then(() => toast.success("Link copied!")).catch(() => toast.info(url));
              }}
            >
              <Copy className="w-3.5 h-3.5 mr-1" /> Copy Link
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="text-blue-500 border-blue-500/40 hover:bg-blue-500/10"
              disabled={shareMutation.isPending}
              onClick={() => shareMutation.mutate({ itineraryId: id })}
            >
              <Share2 className="w-3.5 h-3.5 mr-1" />
              {shareMutation.isPending ? "Sharing…" : "Share Trip"}
            </Button>
          )}
          {/* Export PDF */}
          <Button
            size="sm"
            variant="outline"
            className="text-violet-500 border-violet-500/40 hover:bg-violet-500/10"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate({ itineraryId: id })}
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            {exportMutation.isPending ? "Exporting…" : "Export PDF"}
          </Button>
          {/* Collaborators */}
          <Button
            size="sm"
            variant="outline"
            className="text-amber-500 border-amber-500/40 hover:bg-amber-500/10"
            onClick={() => setShowCollabDialog(true)}
          >
            <Users2 className="w-3.5 h-3.5 mr-1" /> Co-planners
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-500 hover:text-red-600"
            onClick={() => {
              if (confirm("Delete this itinerary?")) deleteItinerary.mutate({ id });
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Collaborators Dialog */}
      <Dialog open={showCollabDialog} onOpenChange={setShowCollabDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users2 className="w-4 h-4" /> Co-planners & Change Log
            </DialogTitle>
          </DialogHeader>
          {/* Tab switcher */}
          <div className="flex gap-2 border-b pb-2 mb-3">
            <button
              className={`text-sm px-3 py-1 rounded-md font-medium transition-colors ${
                collabTab === "collaborators" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setCollabTab("collaborators")}
            >
              <Users2 className="w-3.5 h-3.5 inline mr-1" /> Collaborators
            </button>
            <button
              className={`text-sm px-3 py-1 rounded-md font-medium transition-colors ${
                collabTab === "changelog" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setCollabTab("changelog")}
            >
              <History className="w-3.5 h-3.5 inline mr-1" /> Change Log
            </button>
          </div>

          {collabTab === "collaborators" && (
            <div className="space-y-4">
              {/* Invite form */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invite Co-planner</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="co-planner@email.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "editor" | "viewer")}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!inviteEmail.trim() || inviteMutation.isPending}
                    onClick={() => inviteMutation.mutate({ itineraryId: id, email: inviteEmail, role: inviteRole })}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">An invite link will be copied to your clipboard. Share it with your co-planner.</p>
              </div>
              {/* Collaborator list */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current Co-planners</Label>
                {!collaborators || collaborators.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No co-planners yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {collaborators.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/40">
                        <div>
                          <span className="font-medium">{c.userName ?? c.userEmail ?? c.inviteEmail ?? "Pending"}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{c.role}</span>
                          {!c.acceptedAt && <span className="ml-2 text-xs text-amber-500">Pending</span>}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 h-6 px-2"
                          onClick={() => removeCollabMutation.mutate({ itineraryId: id, collaboratorId: c.id })}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {collabTab === "changelog" && (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {!changelog || changelog.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No changes recorded yet.</p>
              ) : (
                changelog.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2 text-sm py-1.5 border-b border-border/40 last:border-0">
                    <History className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{entry.userName ?? "Unknown"}</span>
                      <span className="text-muted-foreground ml-1">{entry.action.replace(/_/g, " ")}</span>
                      {entry.itemId && <span className="text-xs text-muted-foreground ml-1">(item #{entry.itemId})</span>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCollabDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cost breakdown */}
      {data.days.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="py-3 px-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Cost Breakdown by Day</p>
            <div className="flex flex-wrap gap-2">
              {allDays.filter((d) => d.dayCost > 0).map((d) => (
                <div key={d.dayNumber} className="flex items-center gap-1.5 text-xs">
                  <span className="font-medium">Day {d.dayNumber}:</span>
                  <span className="text-muted-foreground">${d.dayCost.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Day timelines */}
      <div className="space-y-3">
        {allDays.map((day) => (
          <DayTimeline
            key={day.dayNumber}
            itineraryId={id}
            dayNumber={day.dayNumber}
            items={day.items}
            dayCost={day.dayCost}
            onAddItem={(d) => { setAddItemDay(d); setShowAddItem(true); }}
          />
        ))}
      </div>

      {/* Add item dialog */}
      {showAddItem && (
        <AddItemDialog
          itineraryId={id}
          open={showAddItem}
          onClose={() => setShowAddItem(false)}
          defaultDay={addItemDay ?? 1}
          totalDays={totalDays}
        />
      )}
    </div>
  );
}

// ─── Itinerary List ───────────────────────────────────────────────────────────

function ItineraryList({ onSelect }: { onSelect: (id: number) => void }) {
  const { data: itineraries = [], isLoading } = trpc.itinerary.list.useQuery();
  const [showCreate, setShowCreate] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">My Itineraries</h2>
          <p className="text-sm text-muted-foreground">Plan your perfect trip across multiple destinations</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> New Trip
        </Button>
      </div>

      {itineraries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Luggage className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No itineraries yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first trip plan and organise hotels, safaris, restaurants, and more day by day.
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Create First Itinerary
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {itineraries.map((it) => (
            <Card
              key={it.id}
              className="cursor-pointer hover:border-primary/50 transition-colors group"
              onClick={() => onSelect(it.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
                      {it.title}
                    </h3>
                    {it.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{it.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                      {it.startDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(it.startDate), "MMM d, yyyy")}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Map className="w-3 h-3" />
                        {it.itemCount} activit{it.itemCount !== 1 ? "ies" : "y"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {it.currency}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`flex-shrink-0 text-xs ${
                      it.status === "confirmed"
                        ? "text-blue-600"
                        : it.status === "completed"
                        ? "text-green-600"
                        : it.status === "cancelled"
                        ? "text-red-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {it.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateItineraryDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ItineraryBuilder() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {selectedId === null ? (
        <ItineraryList onSelect={setSelectedId} />
      ) : (
        <ItineraryDetail id={selectedId} onBack={() => setSelectedId(null)} />
      )}
    </div>
  );
}
