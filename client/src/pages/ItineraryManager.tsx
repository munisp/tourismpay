import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  MapPin, Calendar, Plus, Loader2, ChevronDown, ChevronRight,
  Hotel, UtensilsCrossed, Car, Music, Wine, Home, Landmark,
  ShoppingBag, Clock, DollarSign, CheckCircle, Circle, XCircle,
  Sparkles, RefreshCw, Globe, Users
} from "lucide-react";

const ITEM_ICONS: Record<string, any> = {
  hotel: Hotel, restaurant: UtensilsCrossed, transport: Car,
  event: Music, nightclub: Wine, airbnb: Home, attraction: Landmark,
  shopping: ShoppingBag, activity: Globe, service: Users,
};

const STATUS_CONFIG: Record<string, { color: string; icon: any }> = {
  planned: { color: "text-zinc-400", icon: Circle },
  booked: { color: "text-blue-400", icon: Circle },
  confirmed: { color: "text-emerald-400", icon: CheckCircle },
  completed: { color: "text-emerald-500", icon: CheckCircle },
  cancelled: { color: "text-red-400", icon: XCircle },
  skipped: { color: "text-zinc-500", icon: XCircle },
};

export default function ItineraryManager() {
  const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [showAiPlanner, setShowAiPlanner] = useState(false);
  const [aiForm, setAiForm] = useState({
    prompt: "",
    destination: "Lagos, Nigeria",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    budgetNgn: "500000",
    preferences: "luxury, local food, nightlife",
    profileType: "diaspora",
  });

  const utils = trpc.useUtils();

  const listQuery = trpc.journeyOrchestrator.listItineraries.useQuery({ limit: 20 });
  const itineraryQuery = trpc.journeyOrchestrator.getItinerary.useQuery(
    { itineraryId: selectedItineraryId! },
    { enabled: !!selectedItineraryId }
  );

  const aiPlannerMut = trpc.journeyOrchestrator.startAiTripPlanner.useMutation({
    onSuccess: (data) => {
      toast.success(`✨ AI itinerary created! ${data.daysGenerated} days planned.`);
      setShowAiPlanner(false);
      setSelectedItineraryId(data.itineraryId);
      utils.journeyOrchestrator.listItineraries.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const itineraries = listQuery.data?.itineraries ?? [];
  const selectedItinerary = itineraryQuery.data;

  const toggleDay = (dayId: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(dayId) ? next.delete(dayId) : next.add(dayId);
      return next;
    });
  };

  const totalBudget = selectedItinerary?.total_budget_ngn ?? 0;
  const totalSpent = selectedItinerary?.spent_ngn ?? 0;
  const budgetPercent = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;

  return (
    <div className="flex h-full gap-6">
      {/* Sidebar: Itinerary List */}
      <div className="w-72 flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MapPin className="h-5 w-5 text-emerald-400" />
            My Itineraries
          </h2>
          <button
            onClick={() => setShowAiPlanner(true)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium flex items-center gap-1"
          >
            <Sparkles className="h-3 w-3" />
            AI Plan
          </button>
        </div>

        {listQuery.isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 bg-zinc-800/50 rounded-xl animate-pulse" />)}</div>
        ) : itineraries.length === 0 ? (
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-6 text-center">
            <MapPin className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No itineraries yet</p>
            <button onClick={() => setShowAiPlanner(true)} className="mt-3 text-xs text-emerald-400 hover:text-emerald-300">
              Create with AI →
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {itineraries.map((itin: any) => (
              <button
                key={itin.id}
                onClick={() => setSelectedItineraryId(itin.id)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  selectedItineraryId === itin.id
                    ? "border-emerald-500 bg-emerald-900/20"
                    : "border-zinc-700/50 bg-zinc-800/50 hover:border-zinc-600"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{itin.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{itin.destination}</p>
                    <p className="text-xs text-zinc-600 mt-1">{itin.start_date} → {itin.end_date}</p>
                  </div>
                  {itin.ai_generated && <Sparkles className="h-3 w-3 text-purple-400 flex-shrink-0 mt-0.5" />}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                    itin.status === "active" ? "bg-emerald-900/50 text-emerald-400" :
                    itin.status === "completed" ? "bg-zinc-700 text-zinc-400" :
                    "bg-yellow-900/50 text-yellow-400"
                  }`}>{itin.status}</span>
                  <span className="text-xs text-zinc-600">{itin.total_days}d</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main: Itinerary Detail */}
      <div className="flex-1 min-w-0">
        {!selectedItinerary ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <MapPin className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-zinc-400">Select an itinerary</h3>
              <p className="text-sm text-zinc-600 mt-2">or create a new one with AI</p>
              <button onClick={() => setShowAiPlanner(true)} className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 mx-auto">
                <Sparkles className="h-4 w-4" />
                Plan with AI
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-white">{selectedItinerary.title}</h1>
                    {selectedItinerary.ai_generated && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-900/50 text-purple-400 rounded text-xs">
                        <Sparkles className="h-3 w-3" /> AI Generated
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-400 mt-1 flex items-center gap-2">
                    <MapPin className="h-4 w-4" /> {selectedItinerary.destination}
                    <Calendar className="h-4 w-4 ml-2" /> {selectedItinerary.start_date} → {selectedItinerary.end_date}
                  </p>
                </div>
                <button onClick={() => utils.journeyOrchestrator.getItinerary.invalidate({ itineraryId: selectedItineraryId! })} className="p-2 text-zinc-400 hover:text-white rounded-lg">
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>

              {/* Budget Progress */}
              {totalBudget > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>Budget: ₦{totalBudget.toLocaleString()}</span>
                    <span>Spent: ₦{totalSpent.toLocaleString()} ({budgetPercent.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${budgetPercent > 90 ? "bg-red-500" : budgetPercent > 70 ? "bg-yellow-500" : "bg-emerald-500"}`}
                      style={{ width: `${budgetPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Tags */}
              {selectedItinerary.tags && JSON.parse(selectedItinerary.tags || "[]").length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {JSON.parse(selectedItinerary.tags).map((tag: string) => (
                    <span key={tag} className="px-2 py-0.5 bg-zinc-700/50 text-zinc-400 rounded text-xs">{tag}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Days */}
            <div className="space-y-3">
              {(selectedItinerary.days ?? []).map((day: any) => {
                const items = day.items ? (typeof day.items === "string" ? JSON.parse(day.items) : day.items).filter(Boolean) : [];
                const isExpanded = expandedDays.has(day.id);
                const dayTotal = items.reduce((s: number, i: any) => s + (i?.estimated_cost_ngn ?? 0), 0);

                return (
                  <div key={day.id} className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleDay(day.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-zinc-700/20 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-400" />}
                        <div className="text-left">
                          <p className="text-sm font-semibold text-white">{day.title ?? `Day ${day.day_number}`}</p>
                          <p className="text-xs text-zinc-500">{day.date} · {items.length} activities</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-white">₦{dayTotal.toLocaleString()}</p>
                        <p className="text-xs text-zinc-500">{day.theme}</p>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-zinc-700/50 divide-y divide-zinc-700/30">
                        {items.length === 0 ? (
                          <div className="p-4 text-center text-zinc-600 text-sm">No activities yet</div>
                        ) : (
                          items.map((item: any, idx: number) => {
                            if (!item) return null;
                            const Icon = ITEM_ICONS[item.item_type] ?? MapPin;
                            const statusCfg = STATUS_CONFIG[item.status ?? "planned"] ?? STATUS_CONFIG.planned;
                            const StatusIcon = statusCfg.icon;
                            return (
                              <div key={item.id ?? idx} className="flex items-start gap-3 p-4 hover:bg-zinc-700/10">
                                <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <Icon className="h-4 w-4 text-emerald-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-medium text-white">{item.title}</p>
                                      {item.description && <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>}
                                      <div className="flex items-center gap-3 mt-1 text-xs text-zinc-600">
                                        {item.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.location}</span>}
                                        {item.start_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{item.start_time}{item.end_time ? ` – ${item.end_time}` : ""}</span>}
                                      </div>
                                      {item.ai_suggested && item.ai_reason && (
                                        <p className="text-xs text-purple-400 mt-1 flex items-center gap-1">
                                          <Sparkles className="h-3 w-3" /> {item.ai_reason}
                                        </p>
                                      )}
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <p className="text-sm font-medium text-white">₦{(item.estimated_cost_ngn ?? 0).toLocaleString()}</p>
                                      <div className={`flex items-center gap-1 justify-end mt-1 ${statusCfg.color}`}>
                                        <StatusIcon className="h-3 w-3" />
                                        <span className="text-xs capitalize">{item.status ?? "planned"}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* AI Trip Planner Modal */}
      {showAiPlanner && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-400" />
                AI Trip Planner
              </h2>
              <button onClick={() => setShowAiPlanner(false)} className="text-zinc-400 hover:text-white">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Describe your trip *</label>
                <textarea
                  value={aiForm.prompt}
                  onChange={e => setAiForm(f => ({ ...f, prompt: e.target.value }))}
                  placeholder="e.g. I want a 5-day luxury Lagos experience with beach clubs, fine dining, and a concert. I love Afrobeats and want to explore local culture."
                  rows={3}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Start Date</label>
                  <input type="date" value={aiForm.startDate} onChange={e => setAiForm(f => ({ ...f, startDate: e.target.value }))} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white" />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">End Date</label>
                  <input type="date" value={aiForm.endDate} onChange={e => setAiForm(f => ({ ...f, endDate: e.target.value }))} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white" />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Budget (NGN)</label>
                  <input type="number" value={aiForm.budgetNgn} onChange={e => setAiForm(f => ({ ...f, budgetNgn: e.target.value }))} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white" />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Profile Type</label>
                  <select value={aiForm.profileType} onChange={e => setAiForm(f => ({ ...f, profileType: e.target.value }))} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white">
                    {["tourist", "diaspora", "business", "expat"].map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Preferences (comma-separated)</label>
                <input type="text" value={aiForm.preferences} onChange={e => setAiForm(f => ({ ...f, preferences: e.target.value }))} placeholder="luxury, local food, nightlife, culture" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowAiPlanner(false)} className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm">Cancel</button>
              <button
                onClick={() => aiPlannerMut.mutate({
                  touristProfileId: "self",
                  prompt: aiForm.prompt,
                  destination: aiForm.destination,
                  startDate: aiForm.startDate,
                  endDate: aiForm.endDate,
                  budgetNgn: parseFloat(aiForm.budgetNgn),
                  preferences: aiForm.preferences.split(",").map(p => p.trim()).filter(Boolean),
                  profileType: aiForm.profileType,
                })}
                disabled={aiPlannerMut.isPending || !aiForm.prompt}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                {aiPlannerMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Planning...</> : <><Sparkles className="h-4 w-4" />Generate Itinerary</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
