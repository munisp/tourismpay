/**
 * J15 — Open Banking Merchant Payout
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
import { Banknote, CheckCircle, Loader2 } from "lucide-react";

const BANKS = [
  { code: "044", name: "Access Bank" }, { code: "058", name: "GTBank" },
  { code: "011", name: "First Bank" }, { code: "033", name: "UBA" },
  { code: "057", name: "Zenith Bank" }, { code: "070", name: "Fidelity Bank" },
];

export default function OpenBankingPayout() {
  const [form, setForm] = useState({ bankConnectionId: "", amountNgn: "", bankAccountNumber: "", bankCode: "" });
  const [result, setResult] = useState<any>(null);

  const history = trpc.journeyV2.getPayoutHistory.useQuery();

  const payoutMut = trpc.journeyV2.startOpenBankingPayout.useMutation({
    onSuccess: (d) => { toast.success("Payout Initiated!", { description: d.message }); setResult(d); history.refetch(); },
    onError: (e) => toast.error("Payout failed", { description: e.message }),
  });

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Open Banking Payout</h1><p className="text-gray-500 mt-1">Withdraw your TourismPay balance to your bank account</p></div>
        <Banknote className="w-8 h-8 text-green-600" />
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Payout Initiated!</p>
              <p className="text-sm text-green-700">Ref: {result.payoutRef}</p>
              <p className="text-sm text-green-700">Status: {result.status}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Withdraw to Bank</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Bank Connection ID *</Label><Input value={form.bankConnectionId} onChange={e => setForm(f => ({...f, bankConnectionId: e.target.value}))} placeholder="OBC-123" /></div>
            <div>
              <Label>Bank *</Label>
              <Select value={form.bankCode} onValueChange={v => setForm(f => ({...f, bankCode: v}))}>
                <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                <SelectContent>{BANKS.map(b => <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Account Number *</Label><Input value={form.bankAccountNumber} onChange={e => setForm(f => ({...f, bankAccountNumber: e.target.value}))} placeholder="0123456789" maxLength={10} /></div>
            <div><Label>Amount (NGN) *</Label><Input type="number" value={form.amountNgn} onChange={e => setForm(f => ({...f, amountNgn: e.target.value}))} placeholder="100000" /></div>
          </div>
          {form.amountNgn && <div className="bg-blue-50 rounded p-3 text-sm text-blue-800"><strong>Fee:</strong> ₦{(parseFloat(form.amountNgn || "0") * 0.01).toLocaleString()} (1%) · <strong>You receive:</strong> ₦{(parseFloat(form.amountNgn || "0") * 0.99).toLocaleString()}</div>}
          <Button onClick={() => payoutMut.mutate({ bankConnectionId: form.bankConnectionId, amountNgn: parseFloat(form.amountNgn), bankAccountNumber: form.bankAccountNumber, bankCode: form.bankCode })} disabled={payoutMut.isPending || !form.bankConnectionId || !form.amountNgn || !form.bankCode || !form.bankAccountNumber} className="w-full">
            {payoutMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</> : "Initiate Payout"}
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-3">Payout History</h2>
        {(history.data as any[] ?? []).map((p: any) => (
          <Card key={p.id} className="mb-2">
            <CardContent className="p-3 flex justify-between items-center">
              <div><p className="font-medium">{p.reference_id}</p><p className="text-sm text-gray-500">₦{Number(p.amount_ngn).toLocaleString()}</p></div>
              <Badge className="bg-blue-100 text-blue-800">{p.status ?? "processing"}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
