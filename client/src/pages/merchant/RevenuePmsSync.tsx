/**
 * J08 — Revenue Management + PMS Rate Sync
 * Merchant accepts AI revenue recommendation and syncs rate to PMS.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TrendingUp, CheckCircle, Loader2, Zap } from "lucide-react";

export default function RevenuePmsSync() {
  const { user } = useAuth();
  const [hotelId, setHotelId] = useState("");
  const [form, setForm] = useState({ recommendationId: "", newRateNgn: "", roomType: "standard", effectiveDate: "" });
  const [result, setResult] = useState<any>(null);

  const recommendations = trpc.journeyV2.getRevenueRecommendations.useQuery(
    { hotelId },
    { enabled: hotelId.length > 2 }
  );

  const syncMut = trpc.journeyV2.startRevenuePmsSync.useMutation({
    onSuccess: (d) => {
      toast.success("Rate Synced!", { description: d.message });
      setResult(d);
      recommendations.refetch();
    },
    onError: (e) => toast.error("Sync failed", { description: e.message }),
  });

  const handleSync = () => {
    if (!hotelId || !form.recommendationId || !form.newRateNgn || !form.effectiveDate) {
      toast.error("Please fill all required fields");
      return;
    }
    syncMut.mutate({
      hotelId,
      recommendationId: form.recommendationId,
      newRateNgn: parseFloat(form.newRateNgn),
      roomType: form.roomType,
      effectiveDate: form.effectiveDate,
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Revenue + PMS Rate Sync</h1>
          <p className="text-gray-500 mt-1">Accept AI revenue recommendations and sync rates to your PMS</p>
        </div>
        <TrendingUp className="w-8 h-8 text-green-600" />
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Rate Synced!</p>
              <p className="text-sm text-green-700">Sync Ref: {result.syncRef}</p>
              <p className="text-sm text-green-700">PMS Updated: {result.pmsUpdated ? "Yes" : "No PMS connected"}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hotel ID input */}
      <Card>
        <CardHeader><CardTitle>Hotel</CardTitle></CardHeader>
        <CardContent>
          <Label>Hotel ID</Label>
          <Input value={hotelId} onChange={e => setHotelId(e.target.value)} placeholder="hotel_123" />
        </CardContent>
      </Card>

      {/* Recommendations list */}
      {recommendations.data?.length ? (
        <div>
          <h2 className="text-lg font-semibold mb-3">AI Recommendations</h2>
          <div className="space-y-2">
            {(recommendations.data as any[]).map((rec: any) => (
              <Card key={rec.id} className={`cursor-pointer transition-all ${form.recommendationId === rec.id ? "border-blue-500 bg-blue-50" : ""}`}
                onClick={() => setForm(f => ({ ...f, recommendationId: rec.id, newRateNgn: String(rec.recommended_rate), roomType: rec.room_type }))}>
                <CardContent className="p-3 flex justify-between items-center">
                  <div>
                    <p className="font-medium">{rec.room_type} · ₦{Number(rec.recommended_rate).toLocaleString()}/night</p>
                    <p className="text-sm text-gray-500">{rec.reasoning?.slice(0, 80)}...</p>
                  </div>
                  <div className="text-right">
                    <Badge className={rec.applied ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                      {rec.applied ? "Applied" : "Pending"}
                    </Badge>
                    <p className="text-xs text-gray-400 mt-1">Confidence: {rec.confidence_score}%</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : hotelId.length > 2 ? (
        <p className="text-gray-500 text-sm">No recommendations found for this hotel.</p>
      ) : null}

      {/* Sync Form */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5" />Sync Rate to PMS</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Recommendation ID *</Label>
              <Input value={form.recommendationId} onChange={e => setForm(f => ({ ...f, recommendationId: e.target.value }))} placeholder="REC-ABC123" />
            </div>
            <div>
              <Label>New Rate (NGN/night) *</Label>
              <Input type="number" value={form.newRateNgn} onChange={e => setForm(f => ({ ...f, newRateNgn: e.target.value }))} placeholder="45000" />
            </div>
            <div>
              <Label>Room Type</Label>
              <Input value={form.roomType} onChange={e => setForm(f => ({ ...f, roomType: e.target.value }))} placeholder="standard" />
            </div>
            <div>
              <Label>Effective Date *</Label>
              <Input type="date" value={form.effectiveDate} onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))} />
            </div>
          </div>
          <Button onClick={handleSync} disabled={syncMut.isPending} className="w-full">
            {syncMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Syncing...</> : "Sync Rate to PMS"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
