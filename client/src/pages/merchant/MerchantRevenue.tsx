/**
 * MerchantRevenue.tsx
 *
 * Revenue dashboard for a verified merchant/restaurant owner.
 * Shows: KPIs, daily revenue chart, recent transactions, KYB status, loyalty stats.
 *
 * Accessible to: merchant, admin
 */
import { useState, useMemo, useRef } from "react";
import html2canvas from "html2canvas";
import { trpc } from "@/lib/trpc";
import { RoleGuard } from "@/components/RoleGuard";
import { TypeKpiPanel } from "@/components/merchant/TypeKpiPanel";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, LineChart, Line,
} from "recharts";
import {
  DollarSign, TrendingUp, ShoppingBag, Award, QrCode, CheckCircle2,
  Clock, AlertTriangle, RefreshCw, ArrowRight, Bell, BellOff, Download,
  Tag, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, MessageSquare, Star, Send,
  Brain, ThumbsUp, ThumbsDown, Minus,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { X, BarChart2, MapPin } from "lucide-react";
import { usePdfDownload } from "@/hooks/usePdfDownload";
import { toast } from "sonner";
import OnboardingScoreWidget from "@/components/merchant/OnboardingScoreWidget";

// ─── Multi-Venue Sentiment Comparison ───────────────────────────────────────
function MultiVenueSentiment() {
  const { data: venues = [], isLoading } = trpc.touristPortal.getMultiVenueSentiment.useQuery();
  if (isLoading) return <Skeleton className="h-24" />;
  if (venues.length < 2) return null; // Only show for merchants with 2+ venues
  const sorted = [...venues].sort((a, b) => (b.positivePercent ?? -1) - (a.positivePercent ?? -1));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart2 className="w-4 h-4" /> Venue Sentiment Comparison
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sorted.map((venue) => (
            <div key={venue.establishmentId} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 mb-0.5">
                  <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{venue.name}</span>
                  {venue.city && <span className="text-xs text-muted-foreground truncate">· {venue.city}</span>}
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      (venue.positivePercent ?? 0) >= 60 ? "bg-green-500" :
                      (venue.positivePercent ?? 0) >= 40 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${venue.positivePercent ?? 0}%` }}
                  />
                </div>
              </div>
              <div className="text-right flex-shrink-0 min-w-[120px]">
                <div className="flex items-center justify-end gap-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-0.5">Sentiment</p>
                    {venue.positivePercent !== null ? (
                      <span className={`text-sm font-bold ${
                        venue.positivePercent >= 60 ? "text-green-600" :
                        venue.positivePercent >= 40 ? "text-amber-600" : "text-red-600"
                      }`}>{venue.positivePercent}%</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-0.5">Response</p>
                    {venue.responseRate !== null && venue.responseRate !== undefined ? (
                      <span className={`text-sm font-bold ${
                        venue.responseRate >= 70 ? "text-green-600" :
                        venue.responseRate >= 40 ? "text-amber-600" : "text-red-600"
                      }`}>{venue.responseRate}%</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-right mt-0.5">{venue.reviewCount} review{venue.reviewCount !== 1 ? "s" : ""}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Deals Management Component ─────────────────────────────────────────────
const DEAL_CATEGORIES = [
  // Universal
  { value: "general", label: "General / Other" },
  // Food & Beverage
  { value: "dining", label: "Dining & Meals" },
  { value: "drinks", label: "Drinks & Bar" },
  { value: "breakfast", label: "Breakfast" },
  // Accommodation
  { value: "room_rate", label: "Room Rate" },
  { value: "suite_upgrade", label: "Suite Upgrade" },
  { value: "early_checkin", label: "Early Check-in / Late Check-out" },
  // Safari & Tours
  { value: "safari_game_drive", label: "Safari / Game Drive" },
  { value: "guided_tour", label: "Guided Tour" },
  { value: "day_trip", label: "Day Trip / Excursion" },
  { value: "cultural_experience", label: "Cultural Experience" },
  // Wellness & Leisure
  { value: "spa_treatment", label: "Spa Treatment" },
  { value: "beach_access", label: "Beach Access / Water Sports" },
  { value: "fitness", label: "Fitness & Gym" },
  // Entertainment
  { value: "event_ticket", label: "Event / Concert Ticket" },
  { value: "theme_park", label: "Theme Park Entry" },
  { value: "museum_entry", label: "Museum / Gallery Entry" },
  { value: "nightlife", label: "Nightlife / Club Entry" },
  // Transport
  { value: "car_rental", label: "Car Rental" },
  { value: "airport_transfer", label: "Airport Transfer" },
  { value: "flight", label: "Flight / Airfare" },
  // Shopping
  { value: "shopping", label: "Shopping / Retail" },
  { value: "souvenir", label: "Souvenirs & Crafts" },
  // Packages
  { value: "package_deal", label: "Package Deal" },
  { value: "loyalty_bonus", label: "Loyalty Bonus" },
];

function DealsManagement() {
  const utils = trpc.useUtils();
  const { data: deals = [], isLoading } = trpc.touristPortal.listMyDeals.useQuery({ includeExpired: true });
  const createDeal = trpc.touristPortal.createDeal.useMutation({
    onSuccess: () => { utils.touristPortal.listMyDeals.invalidate(); toast.success("Deal published! Tourists can now discover your deal."); setShowForm(false); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const updateDeal = trpc.touristPortal.updateDeal.useMutation({
    onSuccess: () => { utils.touristPortal.listMyDeals.invalidate(); toast.success("Deal updated"); setEditingDeal(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteDeal = trpc.touristPortal.deleteDeal.useMutation({
    onSuccess: () => { utils.touristPortal.listMyDeals.invalidate(); toast.success("Deal deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const renewDeal = trpc.merchantRevenue.renewDeal.useMutation({
    onSuccess: (data) => { utils.touristPortal.listMyDeals.invalidate(); toast.success(`"${data.dealTitle}" renewed for 30 days!`); },
    onError: (e) => toast.error(e.message),
  });

  const [showForm, setShowForm] = useState(false);
  const [dealFilter, setDealFilter] = useState<"all" | "active" | "paused" | "expired">("all");
  const [editingDeal, setEditingDeal] = useState<(typeof deals)[0] | null>(null);
  const emptyForm = { title: "", description: "", discountPercent: 10, promoCode: "", category: "general", validFrom: format(new Date(), "yyyy-MM-dd"), validTo: format(subDays(new Date(), -30), "yyyy-MM-dd"), maxRedemptions: "" };
  const [form, setForm] = useState(emptyForm);
  function resetForm() { setForm(emptyForm); }
  function openEdit(deal: (typeof deals)[0]) {
    setEditingDeal(deal);
    setForm({ title: deal.title, description: deal.description ?? "", discountPercent: deal.discountPercent, promoCode: deal.promoCode ?? "", category: deal.category, validFrom: format(new Date(deal.validFrom), "yyyy-MM-dd"), validTo: format(new Date(deal.validTo), "yyyy-MM-dd"), maxRedemptions: deal.maxRedemptions?.toString() ?? "" });
  }
  function handleSubmit() {
    const payload = { title: form.title, description: form.description || undefined, discountPercent: form.discountPercent, promoCode: form.promoCode || undefined, category: form.category, validFrom: new Date(form.validFrom).toISOString(), validTo: new Date(form.validTo).toISOString(), maxRedemptions: form.maxRedemptions ? parseInt(form.maxRedemptions) : undefined };
    if (editingDeal) { updateDeal.mutate({ id: editingDeal.id, ...payload }); } else { createDeal.mutate(payload); }
  }

  const now = new Date();
  const filteredDeals = deals.filter((deal) => {
    const expired = new Date(deal.validTo) < now;
    if (dealFilter === "expired") return expired;
    if (dealFilter === "active") return !expired && deal.isActive;
    if (dealFilter === "paused") return !expired && !deal.isActive;
    return true;
  });
  const expiredCount = deals.filter((d) => new Date(d.validTo) < now).length;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><Tag className="w-4 h-4" /> Deals &amp; Promotions</CardTitle>
        <Button size="sm" onClick={() => { resetForm(); setEditingDeal(null); setShowForm(true); }}><Plus className="w-3 h-3 mr-1" /> New Deal</Button>
      </CardHeader>
      <CardContent>
        {/* Filter tabs */}
        {deals.length > 0 && (
          <div className="flex gap-1 mb-3 flex-wrap">
            {(["all", "active", "paused", "expired"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setDealFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  dealFilter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === "expired" && expiredCount > 0 && (
                  <span className="ml-1 bg-destructive/20 text-destructive rounded-full px-1">{expiredCount}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {isLoading ? <Skeleton className="h-20" /> : filteredDeals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Tag className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">{deals.length === 0 ? "No deals yet. Create one to attract tourists!" : `No ${dealFilter} deals.`}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDeals.map((deal) => {
              const expired = new Date(deal.validTo) < now;
              return (
                <div key={deal.id} className={`flex items-center justify-between p-3 rounded-lg border ${expired ? "opacity-50 bg-muted/30" : "bg-card"}` }>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{deal.title}</span>
                      <Badge variant={expired ? "outline" : deal.isActive ? "default" : "secondary"} className="text-xs shrink-0">{expired ? "Expired" : deal.isActive ? "Active" : "Paused"}</Badge>
                      {deal.discountPercent > 0 && <Badge variant="outline" className="text-xs shrink-0 text-green-600 border-green-600">{deal.discountPercent}% off</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(deal.validFrom), "MMM d")} – {format(new Date(deal.validTo), "MMM d, yyyy")} · {deal.redemptionCount} redemptions{deal.maxRedemptions ? ` / ${deal.maxRedemptions}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    {expired ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2 border-green-600 text-green-600 hover:bg-green-50" disabled={renewDeal.isPending} onClick={() => renewDeal.mutate({ dealId: deal.id, renewDays: 30 })}>Renew 30d</Button>
                    ) : (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateDeal.mutate({ id: deal.id, isActive: !deal.isActive })}>{deal.isActive ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}</Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(deal)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteDeal.mutate({ id: deal.id })}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      {/* Create / Edit Dialog */}
      <Dialog open={showForm || !!editingDeal} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditingDeal(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingDeal ? "Edit Deal" : "Create New Deal"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. 20% off dinner" /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Optional details" /></div>
            <div>
              <Label>Category</Label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full h-9 mt-1 text-xs bg-background border border-input rounded-md px-3 text-foreground"
              >
                {DEAL_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Discount %</Label><Input type="number" min={0} max={100} value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Promo Code</Label><Input value={form.promoCode} onChange={(e) => setForm({ ...form, promoCode: e.target.value })} placeholder="Optional" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Valid From</Label><Input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></div>
              <div><Label>Valid To</Label><Input type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></div>
            </div>
            <div><Label>Max Redemptions</Label><Input type="number" value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} placeholder="Unlimited" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingDeal(null); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createDeal.isPending || updateDeal.isPending}>{editingDeal ? "Save Changes" : "Publish Deal"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Deal Analytics Component ───────────────────────────────────────────────
function DealAnalytics() {
  const [days, setDays] = useState<30 | 90 | 365>(30);
  const { data, isLoading } = trpc.touristPortal.getDealAnalytics.useQuery({ days });

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4" /> Deal Performance Analytics
        </CardTitle>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as 30 | 90 | 365)}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : !data || data.deals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No deals yet. Create deals to see analytics.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-center">
                <p className="text-2xl font-bold text-primary">{data.totalRedemptions}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total Redemptions</p>
              </div>
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-500">${data.totalSavingsUsd.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Value Given Away</p>
              </div>
              <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{data.deals.filter((d) => d.isActive).length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Active Deals</p>
              </div>
            </div>

            {/* Top deal highlight */}
            {data.topDeal && data.topDeal.recentRedemptions > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <Award className="w-5 h-5 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-amber-400 font-semibold">Top Performing Deal</p>
                  <p className="text-sm font-medium truncate">{data.topDeal.title}</p>
                </div>
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">{data.topDeal.recentRedemptions} redeemed</Badge>
              </div>
            )}

            {/* Per-deal breakdown */}
            <div className="space-y-2">
              {data.deals.map((deal) => {
                const maxPct = Math.max(...data.deals.map((d) => d.recentRedemptions));
                const barPct = maxPct > 0 ? Math.round((deal.recentRedemptions / maxPct) * 100) : 0;
                return (
                  <div key={deal.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate flex-1 mr-2">{deal.title}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {deal.redemptionRate !== null && (
                          <span className="text-xs text-muted-foreground">{deal.redemptionRate}% fill</span>
                        )}
                        <Badge variant="outline" className="text-xs">{deal.recentRedemptions} redemptions</Badge>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Merchant Reviews Component ────────────────────────────────────────────────
const REPLY_TEMPLATES = [
  { label: "Thank you", text: "Thank you for your kind words! We're delighted you had a great experience and hope to welcome you back soon." },
  { label: "Apology", text: "We're sorry to hear your experience didn't meet expectations. Please reach out directly so we can make it right." },
  { label: "Invite back", text: "Thank you for your feedback! We'd love to have you visit again — we're always working to improve your experience." },
];

function MerchantReviews({ estId }: { estId: number }) {
  const utils = trpc.useUtils();
  const { data: rows = [], isLoading } = trpc.touristPortal.listReviews.useQuery({ establishmentId: estId, limit: 20 });
  const [forceRefresh, setForceRefresh] = useState(false);
  const { data: sentiment, isLoading: sentimentLoading, refetch: refetchSentiment } = trpc.touristPortal.getReviewSentiment.useQuery(
    { establishmentId: estId, forceRefresh },
    { enabled: rows.length > 0 }
  );
  const { data: sentimentHistory = [] } = trpc.touristPortal.getSentimentHistory.useQuery(
    { establishmentId: estId },
    { enabled: rows.length > 0 }
  );
  const respondMutation = trpc.touristPortal.respondToReview.useMutation({
    onSuccess: () => {
      utils.touristPortal.listReviews.invalidate();
      toast.success("Reply posted");
      setReplyingId(null);
      setReplyText("");
      setSuggestion(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const exportCsvMutation = trpc.touristPortal.exportReviewsCsv.useMutation({
    onSuccess: ({ csv, filename }) => {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Reviews exported");
    },
    onError: (e) => toast.error(e.message),
  });
  const suggestMutation = trpc.touristPortal.suggestReplyImprovement.useMutation({
    onSuccess: (data) => {
      setSuggestion(data);
      if (!data.hasIssues) toast.success("Your reply looks great!");
    },
    onError: (e) => toast.error(e.message),
  });
  const { data: replyROI } = trpc.touristPortal.getReplyROI.useQuery(
    { establishmentId: estId },
    { enabled: rows.length > 0 }
  );
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [suggestion, setSuggestion] = useState<{ hasIssues: boolean; issues: string[]; improvedReply: string } | null>(null);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> Customer Reviews
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{rows.length} review{rows.length !== 1 ? "s" : ""}</Badge>
          {rows.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              disabled={exportCsvMutation.isPending}
              onClick={() => exportCsvMutation.mutate({ establishmentId: estId })}
            >
              <Download className="w-3 h-3" /> CSV
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Sentiment Summary Card */}
        {rows.length > 0 && (
          <div className="mb-4 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold">AI Sentiment Analysis</span>
                {sentimentLoading && <span className="text-xs text-muted-foreground">(analysing…)</span>}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs gap-1 text-muted-foreground"
                disabled={sentimentLoading}
                onClick={() => {
                  setForceRefresh(true);
                  setTimeout(() => setForceRefresh(false), 500);
                  refetchSentiment();
                }}
              >
                <RefreshCw className={`w-3 h-3 ${sentimentLoading ? "animate-spin" : ""}`} />
                Re-analyse
              </Button>
            </div>
            {sentimentLoading ? (
              <Skeleton className="h-8" />
            ) : sentiment ? (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center gap-1">
                    {sentiment.positivePercent >= 60 ? (
                      <ThumbsUp className="w-4 h-4 text-green-500" />
                    ) : sentiment.positivePercent >= 40 ? (
                      <Minus className="w-4 h-4 text-amber-500" />
                    ) : (
                      <ThumbsDown className="w-4 h-4 text-red-500" />
                    )}
                    <span className={`text-sm font-bold ${
                      sentiment.positivePercent >= 60 ? "text-green-600" :
                      sentiment.positivePercent >= 40 ? "text-amber-600" : "text-red-600"
                    }`}>{sentiment.positivePercent}% positive</span>
                  </div>
                  {(sentiment.themes as string[]).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(sentiment.themes as string[]).map((theme) => (
                        <Badge key={theme} variant="secondary" className="text-xs">{theme}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground italic">{sentiment.summary}</p>
                {sentiment.generatedAt && (
                  <p className="text-xs text-muted-foreground mt-1">Last analysed: {format(new Date(sentiment.generatedAt), "MMM d, h:mm a")}</p>
                )}
                {/* 14-day sparkline trend */}
                {sentimentHistory.length > 1 && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-1">14-day trend</p>
                    <ResponsiveContainer width="100%" height={48}>
                      <AreaChart data={sentimentHistory.map((h) => ({ date: h.snapshotDate, pct: h.positivePercent }))} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                        <defs>
                          <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Tooltip
                          formatter={(v: number) => [`${v}%`, "Positive"]}
                          labelFormatter={(l: string) => l}
                          contentStyle={{ fontSize: 11 }}
                        />
                        <Area type="monotone" dataKey="pct" stroke="#22c55e" strokeWidth={1.5} fill="url(#sentGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {/* Reply ROI */}
                {replyROI && (replyROI.repliedCount + replyROI.noReplyCount) > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-xs font-semibold mb-1 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Reply ROI
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Replied</p>
                        <p className="text-sm font-bold text-green-600">{replyROI.repliedRepeatRate}%</p>
                        <p className="text-xs text-muted-foreground">repeat rate</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">No reply</p>
                        <p className="text-sm font-bold text-muted-foreground">{replyROI.noReplyRepeatRate}%</p>
                        <p className="text-xs text-muted-foreground">repeat rate</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Delta</p>
                        <p className={`text-sm font-bold ${replyROI.roiDelta > 0 ? "text-green-600" : replyROI.roiDelta < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          {replyROI.roiDelta > 0 ? "+" : ""}{replyROI.roiDelta}pp
                        </p>
                        <p className="text-xs text-muted-foreground">lift</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
        {isLoading ? (
          <Skeleton className="h-20" />
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No reviews yet. Reviews from tourists will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map(({ review, user }) => (
              <div key={review.id} className="border rounded-lg p-4 space-y-2">
                {/* Review header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{user?.name ?? "Anonymous"}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(review.createdAt), "MMM d, yyyy")}</p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3.5 h-3.5 ${
                          i < (review.rating ?? 0) ? "text-amber-400 fill-amber-400" : "text-muted-foreground"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                {/* Review body */}
                {review.body && (
                  <p className="text-sm text-muted-foreground">{review.body}</p>
                )}
                {/* Existing merchant response */}
                {review.merchantResponse && (
                  <div className="bg-primary/5 border border-primary/20 rounded-md p-3">
                    <p className="text-xs font-semibold text-primary mb-1">Your Reply</p>
                    <p className="text-sm">{review.merchantResponse}</p>
                    {review.merchantRespondedAt && (
                      <p className="text-xs text-muted-foreground mt-1">{format(new Date(review.merchantRespondedAt), "MMM d, yyyy")}</p>
                    )}
                  </div>
                )}
                {/* Reply form */}
                {replyingId === review.id ? (
                  <div className="space-y-2">
                    {/* Quick reply templates */}
                    <div className="flex flex-wrap gap-1">
                      {REPLY_TEMPLATES.map((tpl) => (
                        <button
                          key={tpl.label}
                          type="button"
                          className="px-2 py-0.5 rounded-full text-xs border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                          onClick={() => setReplyText(tpl.text)}
                        >
                          {tpl.label}
                        </button>
                      ))}
                    </div>
                    <Textarea
                      rows={2}
                      placeholder="Write a professional reply…"
                      value={replyText}
                      onChange={(e) => { setReplyText(e.target.value); setSuggestion(null); }}
                      className="text-sm"
                    />
                    {/* Quality suggestion panel */}
                    {suggestion && (
                      <div className={`rounded-md p-2 text-xs border ${
                        suggestion.hasIssues ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800" : "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
                      }`}>
                        {suggestion.hasIssues ? (
                          <>
                            <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">Suggestions to improve your reply:</p>
                            <ul className="list-disc list-inside space-y-0.5 text-amber-700 dark:text-amber-400 mb-2">
                              {suggestion.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                            </ul>
                            <p className="font-semibold text-muted-foreground mb-1">Suggested reply:</p>
                            <p className="text-muted-foreground italic mb-2">{suggestion.improvedReply}</p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs"
                              onClick={() => { setReplyText(suggestion.improvedReply); setSuggestion(null); }}
                            >
                              Use suggested reply
                            </Button>
                          </>
                        ) : (
                          <p className="text-green-700 dark:text-green-400 font-medium">✓ Your reply looks professional and warm!</p>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={!replyText.trim() || respondMutation.isPending}
                        onClick={() => respondMutation.mutate({ reviewId: review.id, response: replyText.trim() })}
                      >
                        <Send className="w-3.5 h-3.5" /> Post Reply
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={!replyText.trim() || suggestMutation.isPending}
                        onClick={() => suggestMutation.mutate({ establishmentId: estId, draftReply: replyText.trim() })}
                      >
                        <Brain className="w-3.5 h-3.5" />
                        {suggestMutation.isPending ? "Checking…" : "Check Quality"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setReplyingId(null); setReplyText(""); setSuggestion(null); }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1 text-muted-foreground"
                    onClick={() => {
                      setReplyingId(review.id);
                      setReplyText(review.merchantResponse ?? "");
                    }}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    {review.merchantResponse ? "Edit Reply" : "Reply"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Daily Transaction Slide-Over ─────────────────────────────────────────────
function DailyTransactionSlideOver({
  estId,
  date,
  onClose,
}: {
  estId: number;
  date: string | null;
  onClose: () => void;
}) {
  const { data: txns = [], isLoading } = trpc.merchantRevenue.transactionsByDate.useQuery(
    { establishmentId: estId, date: date ?? "" },
    { enabled: !!date }
  );
  const total = txns.reduce((s, t) => s + parseFloat(t.amountUsd ?? "0"), 0);
  return (
    <Sheet open={!!date} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center justify-between">
            <span>
              {date ? format(new Date(date + "T00:00:00"), "MMMM d, yyyy") : "Transactions"}
            </span>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </SheetTitle>
        </SheetHeader>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : txns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <ShoppingBag className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">No transactions on this day</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground border-b pb-2">
              <span>{txns.length} transaction{txns.length !== 1 ? "s" : ""}</span>
              <span className="font-semibold text-foreground">Total: ${total.toFixed(2)}</span>
            </div>
            {txns.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {t.description || t.token.slice(0, 16) + "..."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.paidAt ? format(new Date(t.paidAt), "HH:mm:ss") : "—"}
                    {" · "}{t.currency ?? "USD"}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-sm font-semibold text-primary">
                    ${parseFloat(t.amountUsd ?? "0").toFixed(2)}
                  </p>
                  <Badge variant="outline" className="text-[10px] px-1 py-0">paid</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Push notification toggle ─────────────────────────────────────────────────

function PushToggleButton() {
  const { isSupported, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications();
  if (!isSupported) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={isSubscribed ? unsubscribe : subscribe}
      disabled={isLoading}
      title={isSubscribed ? "Disable payment notifications" : "Enable payment notifications"}
    >
      {isSubscribed ? (
        <><BellOff className="w-3.5 h-3.5 mr-1.5" /> Notifications On</>
      ) : (
        <><Bell className="w-3.5 h-3.5 mr-1.5" /> Enable Notifications</>
      )}
    </Button>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center ${color}`}>
            <Icon className="w-4.5 h-4.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── KYB Status banner ────────────────────────────────────────────────────────

function KYBStatusBanner({ estId }: { estId: number }) {
  const { data: kyb } = trpc.merchantRevenue.kybStatus.useQuery({ establishmentId: estId });
  if (!kyb) return null;

  const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    approved: { label: "KYB Approved", color: "text-emerald-600 bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
    submitted: { label: "KYB Under Review", color: "text-amber-600 bg-amber-50 border-amber-200", icon: Clock },
    rejected: { label: "KYB Rejected", color: "text-red-600 bg-red-50 border-red-200", icon: AlertTriangle },
    draft: { label: "KYB Draft", color: "text-muted-foreground bg-muted border-border", icon: Clock },
  };
  const cfg = statusConfig[kyb.status] ?? statusConfig.draft;
  const Icon = cfg.icon;

  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium ${cfg.color}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span>{cfg.label}</span>
      {kyb.status === "draft" && (
        <Link href="/restaurant-onboarding">
          <Button variant="link" size="sm" className="ml-auto h-auto p-0 text-xs">
            Complete KYB <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </Link>
      )}
    </div>
  );
}

// ─── Revenue chart ────────────────────────────────────────────────────────────

function RevenueChart({
  estId,
  days,
  customFrom,
  customTo,
  onBarClick,
}: {
  estId: number;
  days: number;
  customFrom?: string;
  customTo?: string;
  onBarClick?: (date: string) => void;
}) {
  const effectiveDays = useMemo(() => {
    if (customFrom && customTo) {
      const diff = Math.ceil(
        (new Date(customTo).getTime() - new Date(customFrom).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;
      return Math.min(Math.max(diff, 1), 90);
    }
    return days;
  }, [days, customFrom, customTo]);

  const { data: rawData = [], isLoading } = trpc.merchantRevenue.dailyRevenue.useQuery(
    { establishmentId: estId, days: effectiveDays },
    { enabled: !!estId }
  );

  const data = useMemo(() => {
    if (!customFrom || !customTo) return rawData;
    return rawData.filter((d) => d.date >= customFrom && d.date <= customTo);
  }, [rawData, customFrom, customTo]);

  if (isLoading) return <div className="h-48 bg-muted animate-pulse rounded-lg" />;
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
        No revenue data for this period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => format(new Date(d + "T00:00:00"), "MMM d")}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
        />
        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip
          formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]}
          labelFormatter={(l) => format(new Date(l + "T00:00:00"), "MMM d, yyyy")}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar
          dataKey="revenue"
          fill="hsl(var(--primary))"
          radius={[4, 4, 0, 0]}
          style={{ cursor: onBarClick ? "pointer" : "default" }}
          onClick={(entry) => onBarClick && onBarClick(entry.date as string)}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Export payouts button ───────────────────────────────────────────────────

function ExportPayoutsButton({ estId }: { estId: number }) {
  const exportMutation = trpc.merchantRevenue.exportPayouts.useMutation({
    onSuccess: ({ csv, filename, rowCount }) => {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      import("sonner").then(({ toast }) => toast.success(`Exported ${rowCount} transactions`));
    },
    onError: (err) => import("sonner").then(({ toast }) => toast.error(err.message)),
  });
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs gap-1"
      onClick={() => exportMutation.mutate({ establishmentId: estId })}
      disabled={exportMutation.isPending}
    >
      {exportMutation.isPending ? (
        <RefreshCw className="w-3 h-3 animate-spin" />
      ) : (
        <Download className="w-3 h-3" />
      )}
      {exportMutation.isPending ? "Exporting…" : "Export CSV"}
    </Button>
  );
}

// ─── Recent transactions ──────────────────────────────────────────────────────

function RecentTransactions({ estId }: { estId: number }) {
  const { data = [], isLoading } = trpc.merchantRevenue.recentTransactions.useQuery(
    { establishmentId: estId, limit: 10 },
    { enabled: !!estId }
  );

  if (isLoading) return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
    </div>
  );

  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No transactions yet. Share your QR code to start accepting payments.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(data as any[]).map((tx) => (
        <div key={tx.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/20 transition-colors">
          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {tx.description || `Payment #${tx.id}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {tx.paidAt ? format(new Date(tx.paidAt), "MMM d, yyyy HH:mm") : "—"}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-emerald-600">
              +${parseFloat(tx.amountUsd ?? "0").toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">{tx.currency ?? "USD"}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MerchantRevenue() {
  const [selectedEstId, setSelectedEstId] = useState<number | null>(null);
  const [chartDays, setChartDays] = useState<number | "custom">(30);
  const [drillDownDate, setDrillDownDate] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [exportingPng, setExportingPng] = useState(false);
  const { downloadPdf, isDownloading: isPdfDownloading } = usePdfDownload();
  const pdfRevenueMut = trpc.pythonServices.pdfMerchantRevenue.useMutation({
    onSuccess: async (data) => {
      await downloadPdf(
        data as any,
        `merchant-revenue-${estId ?? "report"}-${Date.now()}.pdf`
      );
    },
    onError: (err) => { import("sonner").then(({ toast }) => toast.error(`PDF failed: ${err.message}`)); },
  });

  const exportChartAsPng = async () => {
    if (!chartContainerRef.current) return;
    setExportingPng(true);
    try {
      const canvas = await html2canvas(chartContainerRef.current, {
        backgroundColor: null,
        scale: 2,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `revenue-chart-${format(new Date(), "yyyy-MM-dd")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      import("sonner").then(({ toast }) => toast.success("Chart exported as PNG"));
    } catch {
      import("sonner").then(({ toast }) => toast.error("Failed to export chart"));
    } finally {
      setExportingPng(false);
    }
  };

  const { data: establishments = [], isLoading: estLoading } = trpc.merchantRevenue.myEstablishments.useQuery();

  const estId = selectedEstId ?? (establishments[0]?.id ?? null);

  const { data: summary, isLoading: summaryLoading, refetch } = trpc.merchantRevenue.summary.useQuery(
    { establishmentId: estId! },
    { enabled: !!estId }
  );

  if (estLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!establishments.length) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <ShoppingBag className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Establishments Found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Complete the business onboarding process to start accepting payments.
            </p>
            <Button asChild>
              <Link href="/restaurant-onboarding">Start Onboarding</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <RoleGuard roles={["merchant", "admin"]}>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Revenue Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track payments, revenue, and loyalty metrics for your establishment.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PushToggleButton />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!estId || !summary) return;
                pdfRevenueMut.mutate({
                  merchantName: establishments.find((e: any) => e.id === estId)?.name ?? "Merchant",
                  merchantId: String(estId),
                  periodStart: customFrom,
                  periodEnd: customTo,
                  totalRevenue: Number(summary.totalRevenue ?? 0),
                  totalTransactions: Number(summary.totalTransactions ?? 0),
                  currency: "USD",
                });
              }}
              disabled={pdfRevenueMut.isPending || isPdfDownloading || !summary}
              className="gap-1"
            >
              {pdfRevenueMut.isPending || isPdfDownloading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              PDF Report
            </Button>
            <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/merchant/qr">
                <QrCode className="w-3.5 h-3.5 mr-1.5" /> Manage QR Codes
              </Link>
            </Button>
          </div>
        </div>

        {/* Establishment selector */}
        {establishments.length > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Establishment:</span>
            <Select
              value={String(estId ?? "")}
              onValueChange={(v) => setSelectedEstId(Number(v))}
            >
              <SelectTrigger className="w-64">
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

        {/* KYB status */}
        {estId && <KYBStatusBanner estId={estId} />}
        {/* Onboarding completion score */}
        {estId && <OnboardingScoreWidget establishmentId={estId} />}

        {/* KPI grid */}
        {summaryLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              icon={DollarSign}
              label="Total Revenue"
              value={`$${summary.totalRevenue}`}
              sub={`${summary.totalTransactions} transactions`}
              color="text-emerald-600"
            />
            <KPICard
              icon={TrendingUp}
              label="Today's Revenue"
              value={`$${summary.todayRevenue}`}
              sub={`${summary.todayTransactions} today`}
              color="text-blue-600"
            />
            <KPICard
              icon={ShoppingBag}
              label="This Week"
              value={`$${summary.weekRevenue}`}
              sub={`${summary.weekTransactions} this week`}
              color="text-purple-600"
            />
            <KPICard
              icon={Award}
              label="Loyalty Points Issued"
              value={summary.totalPointsIssued.toLocaleString()}
              sub={`${summary.totalPointsRedeemed.toLocaleString()} redeemed`}
              color="text-amber-600"
            />
          </div>
        ) : null}

        {/* Revenue chart */}
        {estId && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Daily Revenue</CardTitle>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2 gap-1"
                    onClick={exportChartAsPng}
                    disabled={exportingPng}
                    title="Export chart as PNG"
                  >
                    {exportingPng ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                    PNG
                  </Button>
                  <Select
                    value={String(chartDays)}
                    onValueChange={(v) => setChartDays(v === "custom" ? "custom" : Number(v))}
                  >
                    <SelectTrigger className="w-36 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="90">Last 90 days</SelectItem>
                      <SelectItem value="custom">Custom range</SelectItem>
                    </SelectContent>
                  </Select>
                  {chartDays === "custom" && (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="date"
                        className="h-7 text-xs w-36"
                        value={customFrom}
                        max={customTo}
                        onChange={(e) => setCustomFrom(e.target.value)}
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="date"
                        className="h-7 text-xs w-36"
                        value={customTo}
                        min={customFrom}
                        max={format(new Date(), "yyyy-MM-dd")}
                        onChange={(e) => setCustomTo(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div ref={chartContainerRef} className="bg-card rounded-lg p-1">
                <RevenueChart
                  estId={estId}
                  days={chartDays === "custom" ? 90 : chartDays}
                  customFrom={chartDays === "custom" ? customFrom : undefined}
                  customTo={chartDays === "custom" ? customTo : undefined}
                  onBarClick={(date) => setDrillDownDate(date)}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1 text-center">
                Click any bar to see individual transactions for that day
              </p>
            </CardContent>
          </Card>
        )}

        {/* Daily drill-down slide-over */}
        {estId && (
          <DailyTransactionSlideOver
            estId={estId}
            date={drillDownDate}
            onClose={() => setDrillDownDate(null)}
          />
        )}

        {/* Recent transactions */}
        {estId && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent Transactions</CardTitle>
              <ExportPayoutsButton estId={estId} />
            </CardHeader>
            <CardContent>
              <RecentTransactions estId={estId} />
            </CardContent>
          </Card>
        )}

        {/* Multi-Venue Sentiment Comparison (only visible for merchants with 2+ venues) */}
        <MultiVenueSentiment />
        {/* Type-Specific KPI Panel */}
        {estId && <TypeKpiPanel establishmentId={estId} />}
        {/* Deals Management */}
        <DealsManagement />
        {/* Deal Performance Analytics */}
        <DealAnalytics />
        {/* Customer Reviews */}
        {estId && <MerchantReviews estId={estId} />}

        {/* Avg transaction value */}
        {summary && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4 px-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Average Transaction Value</p>
                <p className="text-xs text-muted-foreground">Based on all paid QR transactions</p>
              </div>
              <p className="text-2xl font-bold text-primary">${summary.avgTransactionValue}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </RoleGuard>
  );
}
