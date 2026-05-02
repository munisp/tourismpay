/**
 * TouristPortal — Superior Tourist Experience
 *
 * Tabs:
 *  1. Discover     — featured destinations, merchant map, search
 *  2. Concierge    — AI travel assistant (LLM-powered)
 *  3. Bookings     — create & manage service bookings
 *  4. Deals        — live promotions from merchants
 *  5. Itinerary    — trip planner (CRUD)
 *  6. Budget       — daily/weekly spend tracker with limits
 *  7. Wallet       — balance, top-up via Stripe, FX rates
 *  8. History      — spend analytics + transaction list
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  MapPin,
  Bot,
  CalendarCheck,
  Tag,
  Map,
  PiggyBank,
  Wallet,
  BarChart3,
  PieChart,
  Star,
  Send,
  Plus,
  Trash2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Globe,
  CreditCard,
  CheckCircle,
  Clock,
  XCircle,
  Sparkles,
  ChevronRight,
  DollarSign,
  QrCode,
  ScanLine,
  Gift,
  Ticket,
  Receipt,
  Zap,
  Download,
  Heart,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusColor(s: string) {
  if (s === "confirmed" || s === "completed") return "bg-emerald-500/20 text-emerald-400";
  if (s === "cancelled" || s === "failed") return "bg-red-500/20 text-red-400";
  return "bg-yellow-500/20 text-yellow-400";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DiscoverTab() {
  const destinations = [
    { name: "Cape Town", country: "South Africa", emoji: "🇿🇦", desc: "Table Mountain, beaches, wine country", highlight: "Top Pick" },
    { name: "Nairobi", country: "Kenya", emoji: "🇰🇪", desc: "Safari gateway, vibrant food scene", highlight: "Trending" },
    { name: "Lagos", country: "Nigeria", emoji: "🇳🇬", desc: "Afrobeats, art, coastal energy", highlight: "Hot" },
    { name: "Marrakech", country: "Morocco", emoji: "🇲🇦", desc: "Souks, riads, Atlas Mountains", highlight: "Classic" },
    { name: "Accra", country: "Ghana", emoji: "🇬🇭", desc: "Culture, history, beach clubs", highlight: "Rising" },
    { name: "Zanzibar", country: "Tanzania", emoji: "🇹🇿", desc: "Spice island, turquoise waters", highlight: "Paradise" },
  ];

  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = [
    { icon: "🍽️", label: "Restaurants", type: "restaurant" },
    { icon: "🏨", label: "Hotels", type: "hotel" },
    { icon: "🦁", label: "Safari Lodges", type: "safari_lodge" },
    { icon: "🗺️", label: "Tour Operators", type: "tour_operator" },
    { icon: "🏖️", label: "Beach Resorts", type: "beach_resort" },
    { icon: "💆", label: "Spas & Wellness", type: "spa_wellness" },
    { icon: "🏛️", label: "Museums", type: "museum" },
    { icon: "🎡", label: "Theme Parks", type: "theme_park" },
    { icon: "🎭", label: "Events & Concerts", type: "concert_venue" },
    { icon: "🎵", label: "Nightlife", type: "nightclub" },
    { icon: "🏟️", label: "Sports Venues", type: "sports_venue" },
    { icon: "🚗", label: "Car Rentals", type: "car_rental" },
    { icon: "✈️", label: "Airlines", type: "airline" },
    { icon: "🛍️", label: "Shopping", type: "retail" },
    { icon: "🏢", label: "Other", type: "other" },
  ];

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search destinations, merchants, experiences…" />
      </div>

      {/* Categories */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Browse by Category</h3>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {categories.map((c) => (
            <button
              key={c.label}
              onClick={() => setActiveCategory(activeCategory === c.type ? null : c.type)}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                activeCategory === c.type
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/50 hover:bg-primary/5"
              }`}
            >
              <span className="text-2xl">{c.icon}</span>
              <span className="text-xs font-medium text-center leading-tight">{c.label}</span>
            </button>
          ))}
        </div>
        {activeCategory && (
          <p className="text-xs text-muted-foreground mt-2">
            Showing: <span className="text-primary font-medium">{categories.find(c => c.type === activeCategory)?.label}</span>
            <button onClick={() => setActiveCategory(null)} className="ml-2 text-muted-foreground hover:text-foreground underline">Clear</button>
          </p>
        )}
      </div>

      {/* Featured Destinations */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Featured Destinations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {destinations.map((d) => (
            <Card key={d.name} className="group hover:border-primary/50 transition-all cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-3xl">{d.emoji}</span>
                  <Badge variant="secondary" className="text-xs">{d.highlight}</Badge>
                </div>
                <h4 className="font-semibold">{d.name}</h4>
                <p className="text-xs text-muted-foreground mb-1">{d.country}</p>
                <p className="text-sm text-muted-foreground">{d.desc}</p>
                <div className="mt-3 flex items-center text-xs text-primary font-medium group-hover:gap-2 transition-all">
                  Explore <ChevronRight className="w-3 h-3 ml-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* TourismPay Advantage */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">TourismPay Advantage</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> Zero FX fees on USDC</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> Instant QR payments</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> Loyalty points everywhere</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ConciergeTab() {
  const [input, setInput] = useState("");
  const [destination, setDestination] = useState("Nairobi, Kenya");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<{ role: string; content: string; ts: number }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sessionQuery = trpc.touristPortal.getConciergeSession.useQuery();

  useEffect(() => {
    if (sessionQuery.data) {
      setSessionId(sessionQuery.data.id);
      setMessages((sessionQuery.data.messages as any[]) ?? []);
    }
  }, [sessionQuery.data]);


  const sendMsg = trpc.touristPortal.sendConciergeMessage.useMutation({
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setMessages(data.history as any[]);
      setInput("");
    },
    onError: () => toast.error("Could not send message"),
  });

  const clearSession = trpc.touristPortal.clearConciergeSession.useMutation({
    onSuccess: () => {
      setMessages([]);
      toast.success("Conversation cleared");
    },
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const optimistic = { role: "user", content: input, ts: Date.now() };
    setMessages((m) => [...m, optimistic]);
    sendMsg.mutate({ message: input, destination, sessionId: sessionId ?? undefined });
  };

  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <span className="font-semibold">AI Travel Concierge</span>
          <Badge variant="secondary" className="text-xs">Powered by AI</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="h-7 text-xs w-40"
            placeholder="Destination…"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
          {sessionId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearSession.mutate({ sessionId })}
              className="h-7 text-xs"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 border border-border rounded-xl p-3 mb-3" ref={scrollRef as any}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
            <Bot className="w-8 h-8 opacity-40" />
            <p>Ask me anything about your trip!</p>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {["Best restaurants in Nairobi?", "Safari tips for Kenya", "How to pay with TourismPay?", "Budget for 7 days in Cape Town"].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-xs px-2 py-1 rounded-full border border-border hover:border-primary/50 hover:bg-primary/5 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {sendMsg.isPending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-muted-foreground animate-pulse">
                Thinking…
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex gap-2">
        <Input
          placeholder="Ask your concierge…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          disabled={sendMsg.isPending}
        />
        <Button onClick={handleSend} disabled={sendMsg.isPending || !input.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function BookingsTab() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    establishmentId: 2,
    serviceName: "",
    serviceType: "restaurant",
    bookingDate: "",
    partySize: 2,
    priceUsd: 0,
    notes: "",
  });

  const bookingsQuery = trpc.touristPortal.listBookings.useQuery({ limit: 20 });
  const createBooking = trpc.touristPortal.createBooking.useMutation({
    onSuccess: () => {
      bookingsQuery.refetch();
      setShowForm(false);
      setForm({ establishmentId: 2, serviceName: "", serviceType: "restaurant", bookingDate: "", partySize: 2, priceUsd: 0, notes: "" });
      toast.success("Booking confirmed! Check your confirmation code below.");
    },
    onError: () => toast.error("Could not create booking"),
  });

  const cancelBooking = trpc.touristPortal.cancelBooking.useMutation({
    onSuccess: () => { bookingsQuery.refetch(); toast.success("Booking cancelled"); },
  });

  const toggleReminder = trpc.touristPortal.toggleBookingReminder.useMutation({
    onSuccess: (data, variables) => {
      bookingsQuery.refetch();
      toast.success(variables.enabled ? "Reminder enabled — you'll be notified 24h before." : "Reminder disabled.");
    },
    onError: (err) => toast.error(err.message),
  });

  const statusIcon = (s: string) => {
    if (s === "confirmed") return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    if (s === "cancelled") return <XCircle className="w-4 h-4 text-red-500" />;
    return <Clock className="w-4 h-4 text-yellow-500" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">My Bookings</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-1" /> New Booking
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Service Booking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Service name (e.g. Dinner at Carnivore, Serengeti Game Drive)"
              value={form.serviceName}
              onChange={(e) => setForm({ ...form, serviceName: e.target.value })}
            />
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Service Type</label>
              <select
                value={form.serviceType}
                onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
                className="w-full h-9 text-xs bg-background border border-input rounded-md px-3 text-foreground"
              >
                <optgroup label="Food & Beverage">
                  <option value="restaurant">Restaurant / Dining</option>
                  <option value="cafe">Café / Coffee Shop</option>
                  <option value="bar">Bar / Drinks</option>
                </optgroup>
                <optgroup label="Accommodation">
                  <option value="hotel">Hotel Room</option>
                  <option value="suite">Suite / Villa</option>
                  <option value="safari_lodge">Safari Lodge / Camp</option>
                  <option value="beach_resort">Beach Resort</option>
                </optgroup>
                <optgroup label="Tours & Experiences">
                  <option value="safari_game_drive">Safari / Game Drive</option>
                  <option value="guided_tour">Guided Tour</option>
                  <option value="day_trip">Day Trip / Excursion</option>
                  <option value="cultural_experience">Cultural Experience</option>
                  <option value="water_sports">Water Sports / Beach Activity</option>
                </optgroup>
                <optgroup label="Wellness & Leisure">
                  <option value="spa_treatment">Spa Treatment</option>
                  <option value="fitness">Fitness / Gym</option>
                </optgroup>
                <optgroup label="Entertainment">
                  <option value="event_ticket">Event / Concert Ticket</option>
                  <option value="theme_park">Theme Park Entry</option>
                  <option value="museum_entry">Museum / Gallery Entry</option>
                  <option value="nightlife">Nightlife / Club Entry</option>
                  <option value="sports_event">Sports Event</option>
                </optgroup>
                <optgroup label="Transport">
                  <option value="car_rental">Car Rental</option>
                  <option value="airport_transfer">Airport Transfer</option>
                  <option value="flight">Flight / Airfare</option>
                  <option value="bus_coach">Bus / Coach</option>
                </optgroup>
                <optgroup label="Other">
                  <option value="shopping">Shopping / Retail</option>
                  <option value="conference">Conference / Meeting Room</option>
                  <option value="other">Other</option>
                </optgroup>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="date"
                value={form.bookingDate}
                onChange={(e) => setForm({ ...form, bookingDate: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Party size"
                min={1}
                value={form.partySize}
                onChange={(e) => setForm({ ...form, partySize: parseInt(e.target.value) || 1 })}
              />
            </div>
            <Input
              type="number"
              placeholder="Estimated cost (USD)"
              min={0}
              step={0.01}
              value={form.priceUsd || ""}
              onChange={(e) => setForm({ ...form, priceUsd: parseFloat(e.target.value) || 0 })}
            />
            <Textarea
              placeholder="Special requests or notes…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => createBooking.mutate({ ...form, bookingDate: form.bookingDate || new Date().toISOString() })}
                disabled={createBooking.isPending || !form.serviceName}
              >
                Confirm Booking
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {bookingsQuery.isLoading ? (
        <div className="text-center text-muted-foreground py-8">Loading bookings…</div>
      ) : bookingsQuery.data?.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No bookings yet. Create your first one!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookingsQuery.data?.map(({ booking, establishment }) => (
            <Card key={booking.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {statusIcon(booking.status)}
                      <span className="font-medium">{booking.serviceName}</span>
                    </div>
                    {establishment && (
                      <p className="text-xs text-muted-foreground mb-1">
                        {establishment.name} · {establishment.city}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{fmtDate(booking.bookingDate)}</span>
                      <span>·</span>
                      <span>{booking.partySize} guests</span>
                      <span>·</span>
                      <span>{fmtUsd(parseFloat(booking.priceUsd ?? "0"))}</span>
                    </div>
                    {booking.confirmationCode && (
                      <div className="mt-2 inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-xs font-mono">
                        Code: {booking.confirmationCode}
                      </div>
                    )}
                    {/* Reminder toggle — only for upcoming confirmed bookings */}
                    {booking.status === "confirmed" && new Date(booking.bookingDate) > new Date() && (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => toggleReminder.mutate({ bookingId: booking.id, enabled: !(booking.reminderEnabled ?? true) })}
                          className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                            (booking.reminderEnabled ?? true) ? "bg-primary" : "bg-muted"
                          }`}
                          aria-label="Toggle 24h reminder"
                        >
                          <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                              (booking.reminderEnabled ?? true) ? "translate-x-3.5" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                        <span className="text-xs text-muted-foreground">
                          {(booking.reminderEnabled ?? true) ? "24h reminder on" : "Reminder off"}
                        </span>
                      </div>
                    )}
                  </div>
                  {booking.status === "confirmed" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 h-7 text-xs"
                      onClick={() => cancelBooking.mutate({ bookingId: booking.id })}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DealsTab() {
  const [redeemingId, setRedeemingId] = useState<number | null>(null);
  const [redemptionResult, setRedemptionResult] = useState<{ code: string; title: string } | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const dealsQuery = trpc.touristPortal.listDeals.useQuery({ limit: 20 });
  const redemptionsQuery = trpc.touristPortal.getMyRedemptions.useQuery({ limit: 50 });
  const wishlistIdsQuery = trpc.touristPortal.getMyWishlistIds.useQuery();
  const wishlistQuery = trpc.touristPortal.getMyWishlist.useQuery({ limit: 50 }, { enabled: showSaved });
  const utils = trpc.useUtils();

  const toggleWishlistMutation = trpc.touristPortal.toggleWishlist.useMutation({
    onMutate: async ({ dealId }) => {
      // Optimistic update
      await utils.touristPortal.getMyWishlistIds.cancel();
      const prev = utils.touristPortal.getMyWishlistIds.getData();
      utils.touristPortal.getMyWishlistIds.setData(undefined, (old) => {
        if (!old) return old;
        return old.includes(dealId) ? old.filter(id => id !== dealId) : [...old, dealId];
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) utils.touristPortal.getMyWishlistIds.setData(undefined, ctx.prev);
    },
    onSettled: () => {
      utils.touristPortal.getMyWishlistIds.invalidate();
      utils.touristPortal.getMyWishlist.invalidate();
    },
  });

  const redeemMutation = trpc.touristPortal.redeemDeal.useMutation({
    onSuccess: (data) => {
      setRedeemingId(null);
      setRedemptionResult({ code: data.redemption.redemptionCode, title: data.deal.title });
      dealsQuery.refetch();
      redemptionsQuery.refetch();
    },
    onError: (err) => {
      setRedeemingId(null);
      toast.error(err.message);
    },
  });
  const redeemedDealIds = new Set(redemptionsQuery.data?.filter(r => r.status === "redeemed").map(r => r.dealTitle) ?? []);
  const wishlistedIds = new Set(wishlistIdsQuery.data ?? []);

  if (dealsQuery.isLoading) return <div className="text-center py-8 text-muted-foreground">Loading deals…</div>;

  if (!dealsQuery.data?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>No active deals right now. Check back soon!</p>
        <p className="text-xs mt-1">Merchants can add deals from their dashboard.</p>
      </div>
    );
  }

  // Determine which deals to show
  const displayDeals = showSaved
    ? (wishlistQuery.data?.map(w => ({ deal: w.deal, establishment: null })) ?? [])
    : (dealsQuery.data ?? []);

  return (
    <>
    {/* Filter bar */}
    <div className="flex items-center gap-2 mb-4">
      <Button
        size="sm"
        variant={showSaved ? "default" : "outline"}
        className="gap-1"
        onClick={() => setShowSaved(!showSaved)}
      >
        <Heart className={`w-4 h-4 ${showSaved ? "fill-current" : ""}`} />
        Saved Deals {wishlistIdsQuery.data?.length ? `(${wishlistIdsQuery.data.length})` : ""}
      </Button>
      {showSaved && (
        <span className="text-xs text-muted-foreground">
          {wishlistQuery.isLoading ? "Loading…" : `${displayDeals.length} saved`}
        </span>
      )}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {displayDeals.map(({ deal, establishment }) => (
        <Card key={deal.id} className="hover:border-primary/50 transition-all">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <Badge className="bg-emerald-500/20 text-emerald-400 border-0">
                {deal.discountPercent}% OFF
              </Badge>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs">{deal.category}</Badge>
                <button
                  className={`p-1 rounded-full transition-colors hover:bg-red-50 dark:hover:bg-red-950 ${
                    wishlistedIds.has(deal.id) ? "text-red-500" : "text-muted-foreground"
                  }`}
                  onClick={() => toggleWishlistMutation.mutate({ dealId: deal.id })}
                  title={wishlistedIds.has(deal.id) ? "Remove from saved" : "Save deal"}
                >
                  <Heart className={`w-4 h-4 ${wishlistedIds.has(deal.id) ? "fill-current" : ""}`} />
                </button>
              </div>
            </div>
            <h4 className="font-semibold mb-1">{deal.title}</h4>
            {establishment && (
              <p className="text-xs text-muted-foreground mb-2">
                {establishment.name} · {establishment.city}
              </p>
            )}
            {deal.description && <p className="text-sm text-muted-foreground mb-3">{deal.description}</p>}
            <div className="flex items-center justify-between mt-3">
              {deal.promoCode && (
                <div className="font-mono text-xs bg-muted px-2 py-1 rounded">
                  {deal.promoCode}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Valid until {fmtDate(deal.validTo)}
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {redeemedDealIds.has(deal.title) ? (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-0 w-full justify-center py-1">
                  <CheckCircle className="w-3 h-3 mr-1" /> Already Redeemed
                </Badge>
              ) : (
                <Button
                  size="sm"
                  className="w-full"
                  disabled={redeemMutation.isPending && redeemingId === deal.id}
                  onClick={() => { setRedeemingId(deal.id); redeemMutation.mutate({ dealId: deal.id }); }}
                >
                  <Gift className="w-4 h-4 mr-1" />
                  {redeemMutation.isPending && redeemingId === deal.id ? "Redeeming…" : "Redeem Deal"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>

    {/* Redemption Success Dialog */}
    <Dialog open={!!redemptionResult} onOpenChange={() => setRedemptionResult(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-emerald-400" /> Deal Redeemed!
          </DialogTitle>
        </DialogHeader>
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-3">Show this code to the merchant:</p>
          <div className="font-mono text-2xl font-bold bg-muted rounded-lg py-4 px-6 tracking-widest">
            {redemptionResult?.code}
          </div>
          <p className="text-xs text-muted-foreground mt-3">{redemptionResult?.title}</p>
        </div>
        <DialogFooter>
          <Button className="w-full" onClick={() => {
            if (redemptionResult?.code) navigator.clipboard.writeText(redemptionResult.code);
            toast.success("Code copied to clipboard!");
          }}>
            Copy Code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function ItineraryTab() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", destination: "", startDate: "", endDate: "", budgetUsd: "" });

  const listQuery = trpc.touristPortal.listItineraries.useQuery();
  const createMutation = trpc.touristPortal.createItinerary.useMutation({
    onSuccess: () => {
      listQuery.refetch();
      setShowForm(false);
      setForm({ title: "", destination: "", startDate: "", endDate: "", budgetUsd: "" });
      toast.success("Itinerary created!");
    },
  });
  const deleteMutation = trpc.touristPortal.deleteItinerary.useMutation({
    onSuccess: () => { listQuery.refetch(); toast.success("Itinerary deleted"); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">My Itineraries</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-1" /> New Trip
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <Input placeholder="Trip title (e.g. Kenya Safari 2026)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input placeholder="Destination" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">End Date</label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <Input placeholder="Total budget (USD)" type="number" value={form.budgetUsd} onChange={(e) => setForm({ ...form, budgetUsd: e.target.value })} />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={createMutation.isPending || !form.title}
                onClick={() => createMutation.mutate({
                  title: form.title,
                  destination: form.destination || undefined,
                  startDate: form.startDate || undefined,
                  endDate: form.endDate || undefined,
                  budgetUsd: form.budgetUsd ? parseFloat(form.budgetUsd) : undefined,
                })}
              >
                Create Itinerary
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {listQuery.isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading…</div>
      ) : !listQuery.data?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Map className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No itineraries yet. Plan your first trip!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {listQuery.data.map((it) => (
            <Card key={it.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold">{it.title}</h4>
                    {it.destination && <p className="text-sm text-muted-foreground">{it.destination}</p>}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      {it.startDate && <span>{fmtDate(it.startDate)} → {it.endDate ? fmtDate(it.endDate) : "?"}</span>}
                      {it.budgetUsd && <span>Budget: {fmtUsd(parseFloat(it.budgetUsd))}</span>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500 hover:text-red-600"
                    onClick={() => deleteMutation.mutate({ id: it.id })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetTab() {
  const budgetQuery = trpc.touristPortal.getBudget.useQuery();
  const upsertMutation = trpc.touristPortal.upsertBudget.useMutation({
    onSuccess: () => { budgetQuery.refetch(); toast.success("Budget updated!"); },
  });

  const [daily, setDaily] = useState("");
  const [weekly, setWeekly] = useState("");

  useEffect(() => {
    if (budgetQuery.data?.budget) {
      setDaily(budgetQuery.data.budget.dailyLimitUsd ?? "100");
      setWeekly(budgetQuery.data.budget.weeklyLimitUsd ?? "500");
    }
  }, [budgetQuery.data]);

  const dailyLimit = parseFloat(daily || "100");
  const weeklyLimit = parseFloat(weekly || "500");
  const dailySpend = budgetQuery.data?.dailySpendUsd ?? 0;
  const weeklySpend = budgetQuery.data?.weeklySpendUsd ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Daily Spend</span>
              <span className={`text-sm font-bold ${dailySpend > dailyLimit ? "text-red-500" : "text-emerald-500"}`}>
                {fmtUsd(dailySpend)} / {fmtUsd(dailyLimit)}
              </span>
            </div>
            <Progress value={Math.min((dailySpend / dailyLimit) * 100, 100)} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {dailySpend > dailyLimit ? "Over budget!" : `${fmtUsd(dailyLimit - dailySpend)} remaining today`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Weekly Spend</span>
              <span className={`text-sm font-bold ${weeklySpend > weeklyLimit ? "text-red-500" : "text-emerald-500"}`}>
                {fmtUsd(weeklySpend)} / {fmtUsd(weeklyLimit)}
              </span>
            </div>
            <Progress value={Math.min((weeklySpend / weeklyLimit) * 100, 100)} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {weeklySpend > weeklyLimit ? "Over budget!" : `${fmtUsd(weeklyLimit - weeklySpend)} remaining this week`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Set Budget Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Daily Limit (USD)</label>
              <Input type="number" min={1} value={daily} onChange={(e) => setDaily(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Weekly Limit (USD)</label>
              <Input type="number" min={1} value={weekly} onChange={(e) => setWeekly(e.target.value)} />
            </div>
          </div>
          <Button
            className="w-full"
            disabled={upsertMutation.isPending}
            onClick={() => upsertMutation.mutate({
              dailyLimitUsd: parseFloat(daily) || 100,
              weeklyLimitUsd: parseFloat(weekly) || 500,
            })}
          >
            Save Budget Limits
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── QR Scan Dialog ─────────────────────────────────────────────────────────
function QRScanDialog({
  open,
  onClose,
  onScanned,
}: {
  open: boolean;
  onClose: () => void;
  onScanned: (token: string) => void;
}) {
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [manualToken, setManualToken] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const scannerRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    setStatus("starting");
    setErrorMsg("");
    let scanner: any = null;
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      scanner = new Html5Qrcode("qr-reader-portal");
      scannerRef.current = scanner;
      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded: string) => {
            try {
              const url = new URL(decoded);
              const token = url.searchParams.get("token");
              if (token) {
                scanner.stop().catch(() => null);
                onScanned(token);
                onClose();
              } else {
                setErrorMsg("Invalid QR code — please scan a TourismPay payment code.");
              }
            } catch {
              // Raw token (not a URL)
              if (decoded.length > 8) {
                scanner.stop().catch(() => null);
                onScanned(decoded);
                onClose();
              } else {
                setErrorMsg("Could not read QR code. Please try again.");
              }
            }
          },
          () => { /* ignore frame errors */ }
        )
        .then(() => setStatus("scanning"))
        .catch((err: unknown) => {
          setStatus("error");
          setErrorMsg(err instanceof Error ? err.message : "Camera access denied");
        });
    }).catch(() => {
      setStatus("error");
      setErrorMsg("QR scanner could not be loaded.");
    });
    return () => { scanner?.stop().catch(() => null); setStatus("idle"); };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-emerald-500" /> Scan to Pay
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">Point your camera at a TourismPay merchant QR code to pay instantly.</p>
          <div id="qr-reader-portal" className="w-full rounded-lg overflow-hidden bg-black" style={{ minHeight: 260 }} />
          {status === "starting" && <p className="text-xs text-muted-foreground text-center">Starting camera…</p>}
          {status === "scanning" && <p className="text-xs text-emerald-600 text-center">Camera active — align QR code in the frame</p>}
          {errorMsg && <p className="text-xs text-destructive text-center">{errorMsg}</p>}
          <div className="flex gap-2 pt-1">
            <Input
              placeholder="Or enter payment token manually"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              className="text-xs"
            />
            <Button
              size="sm"
              disabled={manualToken.length < 6}
              onClick={() => { onScanned(manualToken); onClose(); }}
            >Pay</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WalletTab() {
  const [topupAmount, setTopupAmount] = useState("50");
  const [targetCurrency, setTargetCurrency] = useState("USDC");
  const [showQRScan, setShowQRScan] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [offlineToken, setOfflineToken] = useState<string | null>(() => {
    try { return localStorage.getItem("tp_last_qr_token"); } catch { return null; }
  });
  const [offlineTokenExpiry, setOfflineTokenExpiry] = useState<number | null>(() => {
    try { const v = localStorage.getItem("tp_last_qr_expiry"); return v ? parseInt(v) : null; } catch { return null; }
  });

  // Track online/offline status
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  const fxQuery = trpc.touristPortal.getFxRates.useQuery();
  const topupHistory = trpc.touristPortal.getTopupHistory.useQuery({ limit: 10 });
  const generateOfflineToken = trpc.touristPortal.generateOfflineToken.useMutation({
    onSuccess: (data) => {
      try {
        localStorage.setItem("tp_last_qr_token", data.token);
        localStorage.setItem("tp_last_qr_expiry", String(data.expiresAt));
        setOfflineToken(data.token);
        setOfflineTokenExpiry(data.expiresAt);
      } catch { /* ignore */ }
      toast.success("Offline QR generated — valid for 30 minutes");
    },
    onError: () => toast.error("Could not generate offline token"),
  });
  const createTopup = trpc.touristPortal.createTopupSession.useMutation({
    onSuccess: (data) => {
      toast.success("Redirecting to checkout… A new tab will open.");
      window.open(data.checkoutUrl, "_blank");
    },
    onError: () => toast.error("Could not create checkout session"),
  });

  function handleScanned(token: string) {
    // Persist token for offline fallback (30-minute TTL)
    try {
      const expiry = Date.now() + 30 * 60 * 1000;
      localStorage.setItem("tp_last_qr_token", token);
      localStorage.setItem("tp_last_qr_expiry", String(expiry));
      setOfflineToken(token);
      setOfflineTokenExpiry(expiry);
    } catch { /* ignore storage errors */ }
    toast.success("QR code scanned! Redirecting to payment…", { duration: 2000 });
    setTimeout(() => {
      window.location.href = `/pay?token=${encodeURIComponent(token)}`;
    }, 1500);
  }

  const offlineQrValid = offlineToken && offlineTokenExpiry && offlineTokenExpiry > Date.now();
  const offlineQrData = offlineToken ? `tourismpay://pay?token=${offlineToken}` : null;

  const rates = fxQuery.data?.rates ?? {};
  const currencies = Object.entries(rates).slice(0, 8) as [string, number][];

  return (
    <div className="space-y-5">
      {/* QR Scan Dialog */}
      <QRScanDialog open={showQRScan} onClose={() => setShowQRScan(false)} onScanned={handleScanned} />

      {/* Offline QR Fallback — shown when device is offline and a valid token exists */}
      {!isOnline && offlineQrValid && offlineQrData && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <QrCode className="w-4 h-4" /> Offline Payment QR
            </CardTitle>
            <CardDescription className="text-amber-700/70 dark:text-amber-300/70">
              You are offline. Show this QR to the merchant — payment will reconcile when connectivity is restored.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <div className="bg-white p-3 rounded-xl shadow-md">
              <QRCodeSVG value={offlineQrData} size={180} level="H" />
            </div>
            <div className="text-center">
              <p className="text-xs font-mono text-muted-foreground break-all">{offlineToken}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Expires {new Date(offlineTokenExpiry!).toLocaleTimeString()}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-500/50 text-amber-600 dark:text-amber-400"
              onClick={() => {
                try { localStorage.removeItem("tp_last_qr_token"); localStorage.removeItem("tp_last_qr_expiry"); } catch { }
                setOfflineToken(null); setOfflineTokenExpiry(null);
              }}
            >
              Clear Offline QR
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick Pay Banner */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Quick Pay</p>
              <p className="text-xs text-muted-foreground">Scan a merchant QR code to pay instantly</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-primary/40"
                disabled={generateOfflineToken.isPending}
                onClick={() => generateOfflineToken.mutate({ currency: "USD" })}
              >
                <Zap className="w-3.5 h-3.5" />
                {generateOfflineToken.isPending ? "Generating…" : "Generate Offline QR"}
              </Button>
              <Button
                onClick={() => setShowQRScan(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                <ScanLine className="w-4 h-4" /> Scan QR
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* FX Rates */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-4 h-4" /> Live FX Rates
            </CardTitle>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className={`w-2 h-2 rounded-full ${fxQuery.data?.source === "ml-live" ? "bg-emerald-500" : "bg-yellow-500"}`} />
              {fxQuery.data?.source === "ml-live" ? "Live" : "Cached"}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {currencies.map(([code, rate]) => (
              <div key={code} className="bg-muted/50 rounded-lg p-2 text-center">
                <div className="text-xs font-mono font-semibold">{code}</div>
                <div className="text-xs text-muted-foreground">{rate.toFixed(4)} USD</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top-up */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Top Up Wallet
          </CardTitle>
          <CardDescription>Add funds via Stripe. Test card: 4242 4242 4242 4242</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {["25", "50", "100", "200", "500", "1000"].map((a) => (
              <button
                key={a}
                onClick={() => setTopupAmount(a)}
                className={`py-2 rounded-lg border text-sm font-medium transition-all ${
                  topupAmount === a ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"
                }`}
              >
                ${a}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Custom amount"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              min={5}
              max={10000}
            />
            <select
              className="border border-border rounded-md px-2 text-sm bg-background"
              value={targetCurrency}
              onChange={(e) => setTargetCurrency(e.target.value)}
            >
              {["USDC", "XLM", "NGN", "KES", "GHS", "ZAR"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <Button
            className="w-full"
            disabled={createTopup.isPending || parseFloat(topupAmount) < 5}
            onClick={() => createTopup.mutate({
              amountUsd: parseFloat(topupAmount),
              targetCurrency,
              origin: window.location.origin,
            })}
          >
            <DollarSign className="w-4 h-4 mr-2" />
            Top Up ${topupAmount} → {targetCurrency}
          </Button>
        </CardContent>
      </Card>

      {/* Top-up history */}
      {(topupHistory.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top-up History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topupHistory.data?.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{fmtUsd(parseFloat(t.amountUsd))} → {t.targetCurrency}</span>
                  <span className="text-xs text-muted-foreground ml-2">{fmtDate(t.createdAt)}</span>
                </div>
                <Badge className={statusColor(t.status)} variant="secondary">{t.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HistoryTab() {
  const analyticsQuery = trpc.touristPortal.getSpendAnalytics.useQuery({ days: 30 });

  if (analyticsQuery.isLoading) return <div className="text-center py-8 text-muted-foreground">Loading analytics…</div>;

  const data = analyticsQuery.data;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">30-Day Spend</div>
            <div className="text-xl font-bold">{fmtUsd(data?.totalUsd ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Transactions</div>
            <div className="text-xl font-bold">{data?.txCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Avg per Tx</div>
            <div className="text-xl font-bold">
              {fmtUsd((data?.txCount ?? 0) > 0 ? (data?.totalUsd ?? 0) / data!.txCount : 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top merchants */}
      {(data?.byMerchant?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Top Merchants (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.byMerchant.map((m, i) => {
              const pct = data.totalUsd > 0 ? (m.amount / data.totalUsd) * 100 : 0;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span>{m.name}</span>
                    <span className="font-medium">{fmtUsd(m.amount)}</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Daily spend chart (simple bar) */}
      {(data?.byDay?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Daily Spend (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24">
              {data?.byDay.map((d, i) => {
                const max = Math.max(...(data.byDay.map((x) => x.amount)));
                const h = max > 0 ? (d.amount / max) * 100 : 0;
                return (
                  <div
                    key={i}
                    className="flex-1 bg-primary/60 rounded-t hover:bg-primary transition-all cursor-default"
                    style={{ height: `${h}%` }}
                    title={`${d.date}: ${fmtUsd(d.amount)}`}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {(data?.txCount ?? 0) === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No transactions in the last 30 days.</p>
          <p className="text-xs mt-1">Start spending with TourismPay to see your analytics here.</p>
        </div>
      )}
    </div>
  );
}

// ─── Redemptions Tab ─────────────────────────────────────────────────────────

function RedemptionsTab() {
  const redemptionsQ = trpc.touristPortal.getMyRedemptions.useQuery({ limit: 30 });
  const items = redemptionsQ.data ?? [];

  const statusColor: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    confirmed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    rejected: "bg-red-500/10 text-red-500",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary" /> My Redemptions
        </h2>
        <Badge variant="secondary">{items.length} total</Badge>
      </div>

      {redemptionsQ.isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}

      {!redemptionsQ.isLoading && items.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No redemptions yet.</p>
          <p className="text-xs mt-1">Head to the Deals tab to redeem your first offer.</p>
        </div>
      )}

      {items.map((r) => (
        <Card key={r.id} className="border-border">
          <CardContent className="py-4 px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Gift className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="font-semibold text-sm truncate">{r.dealTitle ?? "Deal"}</span>
                  {r.dealDiscount && (
                    <Badge variant="secondary" className="text-xs flex-shrink-0">{r.dealDiscount}% off</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-1">{r.establishmentName ?? "Merchant"}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono bg-muted px-2 py-0.5 rounded">{r.redemptionCode}</span>
                  {r.dealCategory && <Badge variant="outline" className="text-xs">{r.dealCategory}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Redeemed {r.redeemedAt ? new Date(r.redeemedAt).toLocaleDateString() : "—"}
                  {r.confirmedAt && ` · Confirmed ${new Date(r.confirmedAt).toLocaleDateString()}`}
                </p>
              </div>
              <Badge className={`text-xs flex-shrink-0 ${statusColor[r.status] ?? ""}`}>
                {r.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Spending Insights Tab ────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  Food: "bg-orange-500",
  Transport: "bg-blue-500",
  Accommodation: "bg-purple-500",
  Shopping: "bg-pink-500",
  Activities: "bg-emerald-500",
  Other: "bg-slate-500",
};

function InsightsTab() {
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [days, setDays] = useState<30 | 90 | 365>(30);
  const defaultEnd = useMemo(() => new Date(), []);
  const defaultStart = useMemo(() => new Date(defaultEnd.getTime() - 30 * 24 * 60 * 60 * 1000), [defaultEnd]);
  const [customStart, setCustomStart] = useState(() => defaultStart.toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(() => defaultEnd.toISOString().slice(0, 10));
  const [rangeStart, setRangeStart] = useState(() => defaultStart);
  const [rangeEnd, setRangeEnd] = useState(() => defaultEnd);

  const presetQuery = trpc.touristPortal.getSpendingInsights.useQuery({ days }, { enabled: mode === "preset" });
  const customQuery = trpc.touristPortal.getSpendingInsightsRange.useQuery(
    { startDate: rangeStart, endDate: rangeEnd },
    { enabled: mode === "custom" }
  );
  const isLoading = mode === "preset" ? presetQuery.isLoading : customQuery.isLoading;
  const data = mode === "preset"
    ? presetQuery.data
      ? { totalUsd: presetQuery.data.totalUsd, totalSavingsUsd: presetQuery.data.totalSavingsUsd, txCount: presetQuery.data.txCount, redemptionCount: presetQuery.data.redemptionCount, byCategory: presetQuery.data.byCategory }
      : null
    : customQuery.data
      ? {
          totalUsd: customQuery.data.totalSpent,
          totalSavingsUsd: customQuery.data.totalSaved,
          txCount: customQuery.data.txCount,
          redemptionCount: 0,
          byCategory: customQuery.data.byCategory.map((c) => ({
            name: c.category,
            amount: c.amount,
            pct: customQuery.data!.totalSpent > 0 ? Math.round((c.amount / customQuery.data!.totalSpent) * 100) : 0,
          })),
        }
      : null;

  const exportCsv = trpc.touristPortal.exportSpendingCsv.useMutation({
    onSuccess: ({ csv, filename, rowCount }) => {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rowCount} transactions as ${filename}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleApplyCustomRange = () => {
    setRangeStart(new Date(customStart));
    setRangeEnd(new Date(customEnd + "T23:59:59"));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <PieChart className="w-5 h-5 text-primary" /> Spending Insights
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 border rounded-md p-0.5">
            <Button size="sm" variant={mode === "preset" ? "default" : "ghost"} className="h-6 px-2 text-xs" onClick={() => setMode("preset")}>Preset</Button>
            <Button size="sm" variant={mode === "custom" ? "default" : "ghost"} className="h-6 px-2 text-xs" onClick={() => setMode("custom")}>Custom</Button>
          </div>
          {mode === "preset" ? (
            <div className="flex gap-1">
              {([30, 90, 365] as const).map((d) => (
                <Button key={d} size="sm" variant={days === d ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setDays(d)}>
                  {d === 365 ? "1yr" : `${d}d`}
                </Button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <input type="date" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)} className="h-7 px-2 text-xs rounded border border-border bg-background text-foreground" />
              <span className="text-xs text-muted-foreground">→</span>
              <input type="date" value={customEnd} min={customStart} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setCustomEnd(e.target.value)} className="h-7 px-2 text-xs rounded border border-border bg-background text-foreground" />
              <Button size="sm" variant="default" className="h-7 px-2 text-xs" onClick={handleApplyCustomRange}>Apply</Button>
            </div>
          )}
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate({ period: days.toString() as "30" | "90" | "365" })}>
            <Download className="w-3 h-3" />
            {exportCsv.isPending ? "Exporting..." : "CSV"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      ) : !data ? null : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="py-4 px-5">
                <p className="text-xs text-muted-foreground">Total Spent</p>
                <p className="text-2xl font-bold text-foreground mt-1">{fmtUsd(data.totalUsd)}</p>
                <p className="text-xs text-muted-foreground">{data.txCount} transactions</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 px-5">
                <p className="text-xs text-muted-foreground">Total Saved</p>
                <p className="text-2xl font-bold text-emerald-500 mt-1">{fmtUsd(data.totalSavingsUsd)}</p>
                <p className="text-xs text-muted-foreground">{data.redemptionCount} deal redemptions</p>
              </CardContent>
            </Card>
          </div>

          {/* Category breakdown */}
          {data.byCategory.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <PieChart className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No spending data yet for this period.</p>
              <p className="text-xs mt-1">Make payments through TourismPay to see your breakdown.</p>
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Spending by Category</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.byCategory.map((cat) => (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${CAT_COLORS[cat.name] ?? "bg-slate-500"}`}
                        />
                        <span>{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground text-xs">{cat.pct}%</span>
                        <span className="font-medium">{fmtUsd(cat.amount)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${CAT_COLORS[cat.name] ?? "bg-slate-500"}`}
                        style={{ width: `${cat.pct}%` }}
                      />
                    </div>
                  </div>
                ))}

                {/* Visual pie-like donut summary */}
                <div className="mt-4 pt-3 border-t border-border">
                  <div className="flex flex-wrap gap-2">
                    {data.byCategory.map((cat) => (
                      <div key={cat.name} className="flex items-center gap-1.5 text-xs">
                        <span className={`w-2 h-2 rounded-full ${CAT_COLORS[cat.name] ?? "bg-slate-500"}`} />
                        <span className="text-muted-foreground">{cat.name}</span>
                        <span className="font-medium">{cat.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top merchant hint */}
          {data.totalUsd > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="py-4 px-5">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Savings rate</p>
                    <p className="text-xs text-muted-foreground">
                      You saved {data.totalUsd > 0 ? Math.round((data.totalSavingsUsd / (data.totalUsd + data.totalSavingsUsd)) * 100) : 0}% of your total spend through deals
                    </p>
                  </div>
                  <Badge className="ml-auto bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    {fmtUsd(data.totalSavingsUsd)} saved
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TouristPortal() {
  const { user, isAuthenticated, loading } = useAuth();
  const [tab, setTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") ?? "discover";
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 text-center">
        <Sparkles className="w-12 h-12 text-primary" />
        <h1 className="text-2xl font-bold">TourismPay Tourist Portal</h1>
        <p className="text-muted-foreground max-w-sm">
          Your all-in-one travel companion for payments, bookings, AI concierge, and more across Africa.
        </p>
        <Button onClick={() => (window.location.href = getLoginUrl())}>
          Sign In to Continue
        </Button>
      </div>
    );
  }

  const tabs = [
    { id: "discover", label: "Discover", icon: MapPin },
    { id: "concierge", label: "Concierge", icon: Bot },
    { id: "bookings", label: "Bookings", icon: CalendarCheck },
    { id: "deals", label: "Deals", icon: Tag },
    { id: "itinerary", label: "Itinerary", icon: Map },
    { id: "budget", label: "Budget", icon: PiggyBank },
    { id: "wallet", label: "Wallet", icon: Wallet },
    { id: "history", label: "History", icon: BarChart3 },
    { id: "redemptions", label: "Redemptions", icon: Receipt },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="font-bold text-lg">TourismPay</span>
            <Badge variant="secondary" className="text-xs">Tourist Portal</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Welcome, {user?.name?.split(" ")[0] ?? "Traveller"}</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          {/* Tab navigation — horizontal scroll on mobile */}
          <TabsList className="flex w-full overflow-x-auto gap-1 h-auto p-1 mb-6 flex-nowrap">
            {tabs.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="discover"><DiscoverTab /></TabsContent>
          <TabsContent value="concierge"><ConciergeTab /></TabsContent>
          <TabsContent value="bookings"><BookingsTab /></TabsContent>
          <TabsContent value="deals"><DealsTab /></TabsContent>
          <TabsContent value="itinerary"><ItineraryTab /></TabsContent>
          <TabsContent value="budget"><BudgetTab /></TabsContent>
          <TabsContent value="wallet"><WalletTab /></TabsContent>
          <TabsContent value="history"><HistoryTab /></TabsContent>
          <TabsContent value="redemptions"><RedemptionsTab /></TabsContent>
          <TabsContent value="insights"><InsightsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
