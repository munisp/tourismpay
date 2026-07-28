/**
 * J18 — White Label Tenant Revenue Settlement
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DollarSign, CheckCircle, Loader2 } from "lucide-react";

export default function WhiteLabelSettlement() {
  const [tenantId, setTenantId] = useState("");
  const [form, setForm] = useState({ periodStart: "", periodEnd: "", revenueNgn: "", platformFeePercent: "1.5" });
  const [result, setResult] = useState<any>(null);

  const settlements = trpc.journeyV2.getWhiteLabelSettlements.useQuery({ tenantId }, { enabled: tenantId.length > 2 });

  const settleMut = trpc.journeyV2.startWhiteLabelSettlement.useMutation({
    onSuccess: (d) => { toast.success("Settlement Complete!", { description: d.message }); setResult(d); settlements.refetch(); },
    onError: (e) => toast.error("Settlement failed", { description: e.message }),
  });

  const fee = form.revenueNgn ? parseFloat(form.revenueNgn) * (parseFloat(form.platformFeePercent) / 100) : 0;
  const net = form.revenueNgn ? parseFloat(form.revenueNgn) - fee : 0;

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">White Label Settlement</h1><p className="text-gray-500 mt-1">Process revenue settlements for white label tenants</p></div>
        <DollarSign className="w-8 h-8 text-green-600" />
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Settlement Complete!</p>
              <p className="text-sm text-green-700">Ref: {result.settlementRef}</p>
              <p className="text-sm text-green-700">Net Payout: ₦{Number(result.netPayoutNgn).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Settlement Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Tenant ID *</Label><Input value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="WLT-ABC123" /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Period Start *</Label><Input type="date" value={form.periodStart} onChange={e => setForm(f => ({...f, periodStart: e.target.value}))} /></div>
            <div><Label>Period End *</Label><Input type="date" value={form.periodEnd} onChange={e => setForm(f => ({...f, periodEnd: e.target.value}))} /></div>
            <div><Label>Total Revenue (NGN) *</Label><Input type="number" value={form.revenueNgn} onChange={e => setForm(f => ({...f, revenueNgn: e.target.value}))} placeholder="5000000" /></div>
            <div><Label>Platform Fee %</Label><Input type="number" step="0.1" value={form.platformFeePercent} onChange={e => setForm(f => ({...f, platformFeePercent: e.target.value}))} /></div>
          </div>
          {fee > 0 && (
            <div className="bg-blue-50 rounded p-3 text-sm text-blue-800">
              <strong>Platform Fee:</strong> ₦{fee.toLocaleString()} · <strong>Net Payout:</strong> ₦{net.toLocaleString()}
            </div>
          )}
          <Button onClick={() => settleMut.mutate({ tenantId, periodStart: form.periodStart, periodEnd: form.periodEnd, revenueNgn: parseFloat(form.revenueNgn), platformFeePercent: parseFloat(form.platformFeePercent) })} disabled={settleMut.isPending || !tenantId || !form.periodStart || !form.revenueNgn} className="w-full">
            {settleMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</> : "Process Settlement"}
          </Button>
        </CardContent>
      </Card>

      {settlements.data?.length ? (
        <div>
          <h2 className="text-lg font-semibold mb-3">Settlement History</h2>
          {(settlements.data as any[]).map((s: any) => (
            <Card key={s.id} className="mb-2">
              <CardContent className="p-3 flex justify-between items-center">
                <div><p className="font-medium">{s.reference_id}</p><p className="text-sm text-gray-500">₦{Number(s.amount_ngn).toLocaleString()}</p></div>
                <Badge className="bg-green-100 text-green-800">completed</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
