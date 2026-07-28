/**
 * J19 — AI Fraud Detection + BIS Escalation
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";

export default function AiFraudBisEscalation() {
  const [form, setForm] = useState({ suspectUserId: "", triggerType: "velocity_spike", riskScore: "75", transactionRef: "" });
  const [result, setResult] = useState<any>(null);

  const cases = trpc.journeyV2.getFraudCases.useQuery({ userId: form.suspectUserId || undefined });

  const escalateMut = trpc.journeyV2.startAiFraudBisEscalation.useMutation({
    onSuccess: (d) => { toast.success("Escalated to BIS!", { description: d.message }); setResult(d); cases.refetch(); },
    onError: (e) => toast.error("Escalation failed", { description: e.message }),
  });

  const riskLevel = parseInt(form.riskScore) >= 80 ? "high" : parseInt(form.riskScore) >= 50 ? "medium" : "low";
  const riskColor = { high: "bg-red-100 text-red-800", medium: "bg-yellow-100 text-yellow-800", low: "bg-green-100 text-green-800" }[riskLevel];

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">AI Fraud + BIS Escalation</h1><p className="text-gray-500 mt-1">Escalate AI-detected fraud cases to BIS for investigation</p></div>
        <div className="flex gap-2"><Shield className="w-7 h-7 text-red-600" /><AlertTriangle className="w-7 h-7 text-yellow-600" /></div>
      </div>

      {result && (
        <Card className={result.accountFrozen ? "border-red-200 bg-red-50" : "border-yellow-200 bg-yellow-50"}>
          <CardContent className="p-4 flex gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Escalated to BIS!</p>
              <p className="text-sm">Fraud Case: {result.fraudCaseId}</p>
              <p className="text-sm">BIS Investigation: {result.bisInvestigationId}</p>
              {result.accountFrozen && <Badge className="bg-red-100 text-red-800 mt-1">Account Frozen</Badge>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-red-700"><AlertTriangle className="w-5 h-5" />Escalation Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Suspect User ID *</Label><Input value={form.suspectUserId} onChange={e => setForm(f => ({...f, suspectUserId: e.target.value}))} placeholder="user_123" /></div>
            <div>
              <Label>Trigger Type</Label>
              <Select value={form.triggerType} onValueChange={v => setForm(f => ({...f, triggerType: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["velocity_spike", "large_transaction", "geo_anomaly", "device_fingerprint", "account_takeover", "money_laundering"].map(t => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Risk Score (0-100) *</Label>
              <Input type="number" min="0" max="100" value={form.riskScore} onChange={e => setForm(f => ({...f, riskScore: e.target.value}))} />
              {form.riskScore && <Badge className={`mt-1 ${riskColor}`}>{riskLevel.toUpperCase()} RISK{parseInt(form.riskScore) >= 80 ? " — Account will be frozen" : ""}</Badge>}
            </div>
            <div><Label>Transaction Ref *</Label><Input value={form.transactionRef} onChange={e => setForm(f => ({...f, transactionRef: e.target.value}))} placeholder="TXN-ABC123" /></div>
          </div>
          <Button variant="destructive" onClick={() => escalateMut.mutate({ suspectUserId: form.suspectUserId, triggerType: form.triggerType, riskScore: parseFloat(form.riskScore), transactionRef: form.transactionRef })} disabled={escalateMut.isPending || !form.suspectUserId || !form.transactionRef} className="w-full">
            {escalateMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Escalating...</> : "Escalate to BIS"}
          </Button>
        </CardContent>
      </Card>

      {cases.data?.length ? (
        <div>
          <h2 className="text-lg font-semibold mb-3">Fraud Cases</h2>
          {(cases.data as any[]).slice(0, 10).map((c: any) => (
            <Card key={c.alert_id} className="mb-2">
              <CardContent className="p-3 flex justify-between items-center">
                <div><p className="font-medium">{c.alert_id}</p><p className="text-sm text-gray-500">{c.type} · Score: {Math.round(Number(c.fraud_score) * 100)}</p></div>
                <Badge className={{ high: "bg-red-100 text-red-800", medium: "bg-yellow-100 text-yellow-800", low: "bg-green-100 text-green-800" }[c.risk_level as string] ?? "bg-gray-100 text-gray-800"}>{c.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
