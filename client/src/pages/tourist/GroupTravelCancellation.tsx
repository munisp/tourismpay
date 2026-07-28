/**
 * J16 — Group Travel Cancellation + BNPL Refund
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { XCircle, CheckCircle, Loader2 } from "lucide-react";

export default function GroupTravelCancellation() {
  const [form, setForm] = useState({ groupBookingId: "", bnplPlanId: "", cancellationReason: "", refundAmountNgn: "" });
  const [result, setResult] = useState<any>(null);

  const cancelMut = trpc.journeyV2.startGroupCancellation.useMutation({
    onSuccess: (d) => { toast.success("Booking Cancelled & Refunded!", { description: d.message }); setResult(d); },
    onError: (e) => toast.error("Cancellation failed", { description: e.message }),
  });

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Cancel Group Booking</h1><p className="text-gray-500 mt-1">Cancel your group booking and get a refund on your BNPL plan</p></div>
        <XCircle className="w-8 h-8 text-red-600" />
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Cancelled & Refunded!</p>
              <p className="text-sm text-green-700">Refund Ref: {result.refundRef}</p>
              <p className="text-sm text-green-700">BNPL Cancelled: {result.bnplCancelled ? "Yes" : "No"}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-red-700"><XCircle className="w-5 h-5" />Cancellation Request</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Group Booking ID *</Label><Input value={form.groupBookingId} onChange={e => setForm(f => ({...f, groupBookingId: e.target.value}))} placeholder="GRP-ABC123" /></div>
            <div><Label>BNPL Plan ID *</Label><Input value={form.bnplPlanId} onChange={e => setForm(f => ({...f, bnplPlanId: e.target.value}))} placeholder="BNPL-XYZ789" /></div>
            <div><Label>Refund Amount (NGN) *</Label><Input type="number" value={form.refundAmountNgn} onChange={e => setForm(f => ({...f, refundAmountNgn: e.target.value}))} placeholder="150000" /></div>
          </div>
          <div><Label>Cancellation Reason *</Label><Textarea value={form.cancellationReason} onChange={e => setForm(f => ({...f, cancellationReason: e.target.value}))} placeholder="Please explain why you are cancelling this booking..." rows={3} /></div>
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
            <strong>Warning:</strong> This action is irreversible. Your group booking and BNPL plan will be cancelled.
          </div>
          <Button variant="destructive" onClick={() => cancelMut.mutate({ groupBookingId: form.groupBookingId, bnplPlanId: form.bnplPlanId, cancellationReason: form.cancellationReason, refundAmountNgn: parseFloat(form.refundAmountNgn) })} disabled={cancelMut.isPending || !form.groupBookingId || !form.bnplPlanId || !form.cancellationReason || !form.refundAmountNgn} className="w-full">
            {cancelMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</> : "Cancel Booking & Request Refund"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
