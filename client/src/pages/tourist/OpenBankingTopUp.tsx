/**
 * J04 — Open Banking Wallet Top-Up with Fraud Check
 * Tourist tops up wallet via connected bank account with real-time fraud scoring.
 */
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
import { Banknote, Shield, CheckCircle, Loader2, AlertTriangle } from "lucide-react";

export default function OpenBankingTopUp() {
  const { user } = useAuth();
  const [form, setForm] = useState({ bankConnectionId: "", amountNgn: "", bankCode: "" });
  const [result, setResult] = useState<any>(null);

  const connections = trpc.journeyV2.getOpenBankingConnections.useQuery(undefined, { enabled: !!user?.id });

  const topupMut = trpc.journeyV2.startOpenBankingTopUp.useMutation({
    onSuccess: (d) => {
      toast.success("Wallet Topped Up!", { description: d.message });
      setResult(d);
      connections.refetch();
    },
    onError: (e) => toast.error("Top-up failed", { description: e.message }),
  });

  const handleTopUp = () => {
    if (!form.bankConnectionId || !form.amountNgn || !form.bankCode) {
      toast.error("Please fill all fields");
      return;
    }
    topupMut.mutate({
      bankConnectionId: form.bankConnectionId,
      amountNgn: parseFloat(form.amountNgn),
      bankCode: form.bankCode,
    });
  };

  const BANKS = [
    { code: "044", name: "Access Bank" }, { code: "058", name: "GTBank" },
    { code: "011", name: "First Bank" }, { code: "033", name: "UBA" },
    { code: "057", name: "Zenith Bank" }, { code: "070", name: "Fidelity Bank" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Open Banking Top-Up</h1>
          <p className="text-gray-500 mt-1">Top up your TourismPay wallet directly from your bank account</p>
        </div>
        <Banknote className="w-8 h-8 text-green-600" />
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Top-Up Successful!</p>
              <p className="text-sm text-green-700">Ref: {result.topupRef}</p>
              <p className="text-sm text-green-700">New Balance: ₦{Number(result.newBalance).toLocaleString()}</p>
              <p className="text-sm text-green-700 flex items-center gap-1">
                <Shield className="w-3 h-3" /> Fraud Score: {result.fraudScore}/100
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5" /> Top Up Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Bank Connection ID *</Label>
            {connections.data?.length ? (
              <Select value={form.bankConnectionId} onValueChange={v => setForm(f => ({ ...f, bankConnectionId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select connected bank" /></SelectTrigger>
                <SelectContent>
                  {(connections.data as any[]).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.bank_name} — {c.account_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={form.bankConnectionId} onChange={e => setForm(f => ({ ...f, bankConnectionId: e.target.value }))} placeholder="OBC-123" />
            )}
          </div>
          <div>
            <Label>Bank *</Label>
            <Select value={form.bankCode} onValueChange={v => setForm(f => ({ ...f, bankCode: v }))}>
              <SelectTrigger><SelectValue placeholder="Select your bank" /></SelectTrigger>
              <SelectContent>
                {BANKS.map(b => <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount (NGN) *</Label>
            <Input type="number" value={form.amountNgn} onChange={e => setForm(f => ({ ...f, amountNgn: e.target.value }))} placeholder="50000" />
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded p-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            Real-time fraud check will be performed before crediting your wallet.
          </div>
          <Button onClick={handleTopUp} disabled={topupMut.isPending} className="w-full">
            {topupMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</> : "Top Up Wallet"}
          </Button>
        </CardContent>
      </Card>

      {/* Connected Banks */}
      {connections.data?.length ? (
        <div>
          <h2 className="text-lg font-semibold mb-3">Connected Banks</h2>
          <div className="space-y-2">
            {(connections.data as any[]).map((c: any) => (
              <Card key={c.id}>
                <CardContent className="p-3 flex justify-between items-center">
                  <div>
                    <p className="font-medium">{c.bank_name}</p>
                    <p className="text-sm text-gray-500">{c.account_name}</p>
                  </div>
                  <Badge className="bg-green-100 text-green-800">{c.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
