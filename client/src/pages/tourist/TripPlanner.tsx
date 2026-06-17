/**
 * TripPlanner.tsx — NL Conversational Trip Planner
 *
 * Tourist asks in natural language → gets structured itinerary with
 * real merchants, real prices, and one-click booking.
 */
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Send, Bot, User, Sparkles, MapPin, Calendar, DollarSign,
  Hotel, Utensils, Car, Map, Coffee, Bookmark, ChevronDown, ChevronUp,
  Globe, Clock, Wallet, ShoppingBag, ArrowRight, RefreshCw, Save,
  Plane, Music, Leaf, Waves,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ItineraryItem {
  time_slot: string;
  start_time: string;
  end_time: string;
  title: string;
  description: string;
  merchant_id: number;
  merchant_name: string;
  product_name: string;
  cost_usd: number;
  item_type: string;
  bookable: boolean;
}

interface ItineraryDay {
  day_number: number;
  title: string;
  items: ItineraryItem[];
}

interface GeneratedTrip {
  id: string;
  destination: string;
  country: string;
  countryCode: string;
  durationDays: number;
  budgetLevel: string;
  totalCostUsd: number;
  dailyAverageUsd: number;
  days: ItineraryDay[];
  tips: string[];
  merchantCoverage: number;
  generatedAt: string;
}

type Message = {
  role: "user" | "assistant";
  content: string;
  itinerary?: GeneratedTrip;
};

// ─── Suggestions ──────────────────────────────────────────────────────────────

const suggestions = [
  "I'm traveling to Lagos for 5 days with $2000. Interested in food, nightlife, and culture",
  "Plan a budget 3-day Nairobi safari trip for 2 people",
  "7-day luxury Cape Town honeymoon — beaches, wine, and fine dining",
  "Family trip to Accra for a week, $3000 budget, kids under 10",
  "Weekend in Zanzibar — beach and spice tours under $800",
];

// ─── Item Type Icons ──────────────────────────────────────────────────────────

const typeIcons: Record<string, React.ReactNode> = {
  accommodation: <Hotel className="w-3.5 h-3.5 text-blue-500" />,
  meal: <Utensils className="w-3.5 h-3.5 text-orange-500" />,
  transport: <Car className="w-3.5 h-3.5 text-purple-500" />,
  activity: <Map className="w-3.5 h-3.5 text-green-500" />,
  free_time: <Coffee className="w-3.5 h-3.5 text-gray-500" />,
  nightlife: <Music className="w-3.5 h-3.5 text-pink-500" />,
  nature: <Leaf className="w-3.5 h-3.5 text-emerald-500" />,
  beach: <Waves className="w-3.5 h-3.5 text-cyan-500" />,
};

const slotColors: Record<string, string> = {
  morning: "border-l-amber-400",
  afternoon: "border-l-blue-400",
  evening: "border-l-purple-400",
};

// ─── Itinerary Item Card ──────────────────────────────────────────────────────

function ItemCard({ item }: { item: ItineraryItem }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg bg-card/50 border-l-2 ${slotColors[item.time_slot] ?? "border-l-border"} hover:bg-card/80 transition-colors group`}>
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
        {typeIcons[item.item_type] ?? <Map className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">{item.start_time}–{item.end_time}</span>
          {item.bookable && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-green-600 border-green-200">TourismPay</Badge>}
        </div>
        <h4 className="text-sm font-medium mt-0.5">{item.title}</h4>
        {item.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>}
        <div className="flex items-center gap-3 mt-1">
          {item.merchant_name && item.merchant_id > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <ShoppingBag className="w-3 h-3" /> {item.merchant_name}
            </span>
          )}
          <span className="text-xs font-semibold text-primary">${item.cost_usd?.toFixed(2)}</span>
        </div>
      </div>
      {item.bookable && item.merchant_id > 0 && (
        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity h-7 text-xs px-2">
          Book <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      )}
    </div>
  );
}

// ─── Day Timeline ─────────────────────────────────────────────────────────────

function DayTimeline({ day }: { day: ItineraryDay }) {
  const [expanded, setExpanded] = useState(true);
  const dayCost = day.items.reduce((s, i) => s + (i.cost_usd ?? 0), 0);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
            {day.day_number}
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold">{day.title}</h3>
            <span className="text-xs text-muted-foreground">{day.items.length} activities</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">${dayCost.toFixed(0)}</Badge>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {day.items.map((item, i) => <ItemCard key={i} item={item} />)}
        </div>
      )}
    </div>
  );
}

// ─── Itinerary View ───────────────────────────────────────────────────────────

function ItineraryView({ trip, onRefine, onSave }: {
  trip: GeneratedTrip;
  onRefine: (instruction: string) => void;
  onSave: () => void;
}) {
  const [refineInput, setRefineInput] = useState("");

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Plane className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-bold">{trip.destination}, {trip.country}</h2>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {trip.durationDays} days</span>
                <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> ${trip.totalCostUsd.toFixed(0)} total</span>
                <span className="flex items-center gap-1"><Wallet className="w-3 h-3" /> ${trip.dailyAverageUsd.toFixed(0)}/day</span>
                <span className="flex items-center gap-1"><ShoppingBag className="w-3 h-3" /> {trip.merchantCoverage}% TourismPay</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onSave}>
                <Save className="w-3.5 h-3.5 mr-1" /> Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Day timelines */}
      {trip.days.map((day) => (
        <DayTimeline key={day.day_number} day={day} />
      ))}

      {/* Tips */}
      {trip.tips && trip.tips.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" /> Travel Tips
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1">
              {trip.tips.map((tip, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-primary">•</span> {tip}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Refine bar */}
      <div className="flex gap-2">
        <Input
          value={refineInput}
          onChange={(e) => setRefineInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && refineInput.trim()) {
              onRefine(refineInput);
              setRefineInput("");
            }
          }}
          placeholder="Refine: 'make it cheaper', 'add a safari on day 3', 'swap hotel for beachfront'..."
          className="text-sm"
        />
        <Button
          onClick={() => {
            if (refineInput.trim()) {
              onRefine(refineInput);
              setRefineInput("");
            }
          }}
          disabled={!refineInput.trim()}
          size="sm"
        >
          <RefreshCw className="w-4 h-4 mr-1" /> Refine
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TripPlanner() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm your AI Trip Planner. Tell me where you want to go, how long, your budget, and what interests you — I'll create a detailed itinerary using real TourismPay merchant data with exact prices.\n\nTry something like: \"I'm going to Lagos for 5 days with $2000, interested in food and nightlife\"",
    },
  ]);
  const [input, setInput] = useState("");
  const [currentTrip, setCurrentTrip] = useState<GeneratedTrip | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const generateMutation = trpc.tripPlanner.generate.useMutation({
    onSuccess: (data) => {
      const trip = data.itinerary as unknown as GeneratedTrip;
      setCurrentTrip(trip);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Here's your ${trip.durationDays}-day itinerary for ${trip.destination}, ${trip.country}! Total: $${trip.totalCostUsd.toFixed(0)} ($${trip.dailyAverageUsd.toFixed(0)}/day). ${trip.merchantCoverage}% of items are bookable through TourismPay.\n\nYou can refine this — just tell me what to change (e.g., "make it cheaper", "add more food experiences", "swap day 2 hotel").`,
          itinerary: trip,
        },
      ]);
    },
    onError: (err) => {
      toast.error("Trip planning error", { description: err.message });
      setMessages((m) => [...m, { role: "assistant", content: "Sorry, I encountered an error generating your itinerary. Please try again with more details about your trip." }]);
    },
  });

  const chatMutation = trpc.tripPlanner.chat.useMutation({
    onSuccess: (data) => {
      setMessages((m) => [...m, { role: "assistant", content: data.response }]);
    },
    onError: (err) => {
      toast.error("Chat error", { description: err.message });
      setMessages((m) => [...m, { role: "assistant", content: "I encountered an error. Please try again." }]);
    },
  });

  const refineMutation = trpc.tripPlanner.refine.useMutation({
    onSuccess: (data) => {
      if (data.refined) {
        const trip = data.itinerary as unknown as GeneratedTrip;
        setCurrentTrip(trip);
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `Updated! New total: $${trip.totalCostUsd?.toFixed(0) ?? "N/A"}.`,
            itinerary: trip,
          },
        ]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: "I couldn't apply that change. Try rephrasing your request." }]);
      }
    },
    onError: () => {
      setMessages((m) => [...m, { role: "assistant", content: "Failed to refine. Try a different instruction." }]);
    },
  });

  const saveMutation = trpc.tripPlanner.saveToItinerary.useMutation({
    onSuccess: (data) => {
      toast.success(`Itinerary saved! ${data.itemCount} items added.`);
    },
    onError: (err) => {
      toast.error("Save error", { description: err.message });
    },
  });

  const send = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");

    // Detect if this is a trip planning request or general chat
    const planningKeywords = /plan|itinerary|trip|travel|going to|visiting|days|budget|\$/i;
    if (planningKeywords.test(msg) && !currentTrip) {
      generateMutation.mutate({ query: msg });
    } else {
      chatMutation.mutate({
        message: msg,
        conversationHistory: messages.slice(-6).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });
    }
  };

  const handleRefine = (instruction: string) => {
    if (!currentTrip) return;
    setMessages((m) => [...m, { role: "user", content: instruction }]);
    refineMutation.mutate({
      itinerary: currentTrip,
      instruction,
    });
  };

  const handleSave = () => {
    if (!currentTrip) return;
    saveMutation.mutate({
      title: `${currentTrip.destination}, ${currentTrip.country} — ${currentTrip.durationDays} days`,
      itinerary: currentTrip,
    });
  };

  const isLoading = generateMutation.isPending || chatMutation.isPending || refineMutation.isPending;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold">AI Trip Planner</h1>
            <p className="text-xs text-muted-foreground">
              Ask in natural language — get itineraries with real merchants & prices
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i}>
            <div className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === "assistant" ? "bg-primary/20" : "bg-white/10"}`}>
                {msg.role === "assistant" ? <Bot className="w-4 h-4 text-primary" /> : <User className="w-4 h-4 text-muted-foreground" />}
              </div>
              <div className={`max-w-2xl rounded-xl px-4 py-3 text-sm ${msg.role === "assistant" ? "bg-card border border-border" : "bg-primary/20"}`}>
                <p className="whitespace-pre-line leading-relaxed">{msg.content}</p>
              </div>
            </div>
            {/* Render itinerary below the message */}
            {msg.itinerary && (
              <div className="mt-4 ml-10">
                <ItineraryView trip={msg.itinerary} onRefine={handleRefine} onSave={handleSave} />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="bg-card border border-border px-4 py-3 rounded-xl flex items-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
              <span className="text-xs text-muted-foreground ml-2">
                {generateMutation.isPending ? "Building your itinerary with real merchant data..." :
                 refineMutation.isPending ? "Refining your trip..." : "Thinking..."}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-muted-foreground mb-2">Try one of these:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-border text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors text-left"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={currentTrip
              ? "Refine your trip: 'make it cheaper', 'add a beach day'..."
              : "Describe your dream trip — destination, duration, budget, interests..."}
            className="flex-1 bg-white/5 border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            disabled={isLoading}
          />
          <Button
            onClick={() => send()}
            disabled={isLoading || !input.trim()}
            className="h-10 w-10 p-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
