import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { TrendingUp, DollarSign, BarChart3, CheckCircle } from "lucide-react";

export default function RevenueManagement() {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ room_type: "standard", current_rate: "", occupancy_pct: "60", days_ahead: "7" });

  const { data: recommendations, isLoading, refetch } = trpc.revenueManagement.listRecommendations.useQuery(
    { hotelId: user?.id ?? "" },
    { enabled: !!user?.id }
  );

  const createMut = trpc.revenueManagement.createRecommendation.useMutation({
    onSuccess: (d) => { toast.success("Recommendation Generated", { description: d.reason }); setShowCreate(false); refetch(); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const applyMut = trpc.revenueManagement.applyRecommendation.useMutation({
    onSuccess: () => { toast.success("Rate recommendation applied"); refetch(); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const statusColor = (s: string) => s === "applied" ? "bg-green-100 text-green-800" : s === "pending" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-800";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">AI Revenue Management</h1><p className="text-gray-500 mt-1">AI-powered room rate optimization to maximize RevPAR</p></div>
        <Button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2"><TrendingUp className="w-4 h-4" />Get Rate Recommendation</Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle>Generate Rate Recommendation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Room Type</Label>
                <Select value={form.room_type} onValueChange={v => setForm(f => ({...f, room_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[["standard","Standard"],["deluxe","Deluxe"],["suite","Suite"],["executive","Executive"]].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Current Rate (NGN)</Label><Input type="number" value={form.current_rate} onChange={e => setForm(f => ({...f, current_rate: e.target.value}))} placeholder="45000" /></div>
              <div><Label>Current Occupancy %</Label><Input type="number" value={form.occupancy_pct} onChange={e => setForm(f => ({...f, occupancy_pct: e.target.value}))} min="0" max="100" /></div>
              <div><Label>Days Until Check-in</Label><Input type="number" value={form.days_ahead} onChange={e => setForm(f => ({...f, days_ahead: e.target.value}))} /></div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createMut.mutate({ hotelId: user?.id ?? "", roomType: form.room_type, currentRate: parseFloat(form.current_rate), currency: "NGN", occupancyPct: parseFloat(form.occupancy_pct), daysAhead: parseInt(form.days_ahead) })} disabled={createMut.isPending}>{createMut.isPending ? "Analyzing..." : "Generate Recommendation"}</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : !recommendations?.length ? (
        <Card><CardContent className="py-12 text-center text-gray-500"><BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No recommendations yet. Generate your first rate recommendation.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {recommendations.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div><p className="font-semibold capitalize">{r.room_type} Room</p><p className="text-sm text-gray-500">{r.reason}</p></div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColor(r.status)}>{r.status}</Badge>
                    {r.status === "pending" && <Button size="sm" onClick={() => applyMut.mutate({ recommendationId: r.id })} disabled={applyMut.isPending}><CheckCircle className="w-3 h-3 mr-1" />Apply</Button>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><p className="text-gray-500">Current Rate</p><p className="font-medium">{r.currency} {Number(r.current_rate).toLocaleString()}</p></div>
                  <div><p className="text-gray-500">Recommended</p><p className={`font-medium ${Number(r.recommended_rate) > Number(r.current_rate) ? "text-green-700" : "text-red-700"}`}>{r.currency} {Number(r.recommended_rate).toLocaleString()}</p></div>
                  <div><p className="text-gray-500">Demand Score</p><p className="font-medium">{r.demand_score}/100</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
