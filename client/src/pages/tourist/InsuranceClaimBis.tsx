/**
 * J13 — Insurance Claim with BIS Fraud Check
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Shield, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export default function InsuranceClaimBis() {
  const [form, setForm] = useState({ policyId: "", claimType: "medical" as "medical" | "trip_cancellation" | "baggage_loss" | "flight_delay" | "emergency", claimAmountNgn: "", description: "" });
  const [result, setResult] = useState<any>(null);

  const claims = trpc.journeyV2.getInsuranceClaims.useQuery();

  const claimMut = trpc.journeyV2.startInsuranceClaim.useMutation({
    onSuccess: (d) => { toast.success(d.bisCheckPassed ? "Claim Approved!" : "Claim Under Review", { description: d.message }); setResult(d); claims.refetch(); },
    onError: (e) => toast.error("Claim failed", { description: e.message }),
  });

  const statusColor = (s: string) => ({ approved: "bg-green-100 text-green-800", submitted: "bg-blue-100 text-blue-800", under_review: "bg-yellow-100 text-yellow-800", rejected: "bg-red-100 text-red-800" }[s] ?? "bg-gray-100 text-gray-800");

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Insurance Claims</h1><p className="text-gray-500 mt-1">Submit a claim against your travel insurance policy</p></div>
        <Shield className="w-8 h-8 text-blue-600" />
      </div>

      {result && (
        <Card className={result.bisCheckPassed ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}>
          <CardContent className="p-4 flex gap-3">
            {result.bisCheckPassed ? <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" /> : <AlertCircle className="w-6 h-6 text-yellow-600 mt-0.5 shrink-0" />}
            <div>
              <p className="font-semibold">{result.bisCheckPassed ? "Claim Approved!" : "Claim Under Review"}</p>
              <p className="text-sm">Claim ID: {result.claimId}</p>
              {result.payoutRef && <p className="text-sm">Payout Ref: {result.payoutRef}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>New Claim</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Policy ID *</Label><Input value={form.policyId} onChange={e => setForm(f => ({...f, policyId: e.target.value}))} placeholder="POL-ABC123" /></div>
            <div>
              <Label>Claim Type *</Label>
              <Select value={form.claimType} onValueChange={v => setForm(f => ({...f, claimType: v as any}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["medical", "trip_cancellation", "baggage_loss", "flight_delay", "emergency"].map(t => (
                    <SelectItem key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Claim Amount (NGN) *</Label><Input type="number" value={form.claimAmountNgn} onChange={e => setForm(f => ({...f, claimAmountNgn: e.target.value}))} placeholder="50000" /></div>
          </div>
          <div><Label>Description *</Label><Textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Describe what happened and why you are claiming..." rows={3} /></div>
          <Button onClick={() => claimMut.mutate({ policyId: form.policyId, claimType: form.claimType, claimAmountNgn: parseFloat(form.claimAmountNgn), description: form.description })} disabled={claimMut.isPending || !form.policyId || !form.claimAmountNgn || !form.description} className="w-full">
            {claimMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : "Submit Claim"}
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-3">My Claims</h2>
        {(claims.data as any[] ?? []).map((c: any) => (
          <Card key={c.claim_reference} className="mb-2">
            <CardContent className="p-3 flex justify-between items-center">
              <div><p className="font-medium">{c.claim_reference}</p><p className="text-sm text-gray-500">{c.claim_type} · ₦{Number(c.claim_amount).toLocaleString()}</p></div>
              <Badge className={statusColor(c.status)}>{c.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
