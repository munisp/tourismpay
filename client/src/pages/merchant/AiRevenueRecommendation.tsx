/**
 * J14 — AI Revenue Recommendation Acceptance
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TrendingUp, CheckCircle, Loader2, Sparkles } from "lucide-react";

export default function AiRevenueRecommendation() {
  const [hotelId, setHotelId] = useState("");
  const [form, setForm] = useState({ recommendationType: "rate_increase", currentRevenue: "", projectedRevenue: "", actions: ["Increase weekend rates", "Add F&B bundle", "Target corporate clients"] });
  const [result, setResult] = useState<any>(null);

  const recs = trpc.journeyV2.getRevenueRecommendations.useQuery({ hotelId }, { enabled: hotelId.length > 2 });

  const createMut = trpc.journeyV2.startAiRevenueRecommendation.useMutation({
    onSuccess: (d) => { toast.success("Recommendation Created!", { description: d.message }); setResult(d); recs.refetch(); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const acceptMut = trpc.journeyV2.acceptRevenueRecommendation.useMutation({
    onSuccess: () => { toast.success("Recommendation accepted and applied!"); recs.refetch(); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const uplift = form.currentRevenue && form.projectedRevenue
    ? parseFloat(form.projectedRevenue) - parseFloat(form.currentRevenue)
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">AI Revenue Recommendations</h1><p className="text-gray-500 mt-1">Get AI-powered revenue recommendations and apply them</p></div>
        <Sparkles className="w-8 h-8 text-purple-600" />
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Recommendation Created!</p>
              <p className="text-sm text-green-700">ID: {result.recommendationId}</p>
              <p className="text-sm text-green-700">Projected Uplift: ₦{Number(result.projectedUplift).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Hotel ID</CardTitle></CardHeader>
        <CardContent><Input value={hotelId} onChange={e => setHotelId(e.target.value)} placeholder="hotel_123" /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" />Generate Recommendation</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Recommendation Type</Label><Input value={form.recommendationType} onChange={e => setForm(f => ({...f, recommendationType: e.target.value}))} placeholder="rate_increase" /></div>
            <div></div>
            <div><Label>Current Monthly Revenue (NGN)</Label><Input type="number" value={form.currentRevenue} onChange={e => setForm(f => ({...f, currentRevenue: e.target.value}))} placeholder="5000000" /></div>
            <div><Label>Projected Revenue (NGN)</Label><Input type="number" value={form.projectedRevenue} onChange={e => setForm(f => ({...f, projectedRevenue: e.target.value}))} placeholder="5750000" /></div>
          </div>
          {uplift > 0 && <div className="bg-green-50 rounded p-3 text-sm text-green-800"><strong>Projected Uplift:</strong> ₦{uplift.toLocaleString()} ({((uplift / parseFloat(form.currentRevenue)) * 100).toFixed(1)}%)</div>}
          <Button onClick={() => createMut.mutate({ hotelId, recommendationType: form.recommendationType, currentRevenue: parseFloat(form.currentRevenue), projectedRevenue: parseFloat(form.projectedRevenue), actions: form.actions })} disabled={createMut.isPending || !hotelId || !form.currentRevenue} className="w-full">
            {createMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</> : "Generate AI Recommendation"}
          </Button>
        </CardContent>
      </Card>

      {recs.data?.length ? (
        <div>
          <h2 className="text-lg font-semibold mb-3">Recommendations</h2>
          {(recs.data as any[]).map((r: any) => (
            <Card key={r.id} className="mb-2">
              <CardContent className="p-3 flex justify-between items-center">
                <div>
                  <p className="font-medium">{r.room_type} · ₦{Number(r.recommended_rate).toLocaleString()}/night</p>
                  <p className="text-sm text-gray-500 max-w-xs">{String(r.reasoning ?? "").slice(0, 80)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge className={r.applied ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>{r.applied ? "Applied" : "Pending"}</Badge>
                  {!r.applied && <Button size="sm" onClick={() => acceptMut.mutate({ recommendationId: r.id, hotelId })} disabled={acceptMut.isPending}>Accept</Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
