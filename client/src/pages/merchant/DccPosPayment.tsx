/**
 * J07 — DCC Payment at POS with Loyalty Earn
 * Merchant processes a DCC payment and tourist earns loyalty points.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeftRight, Star, CheckCircle, Loader2 } from "lucide-react";

const CURRENCIES = ["USD", "GBP", "EUR", "CAD", "AUD", "JPY", "CHF"];
const FX_RATES: Record<string, number> = { USD: 0.00063, GBP: 0.00050, EUR: 0.00058, CAD: 0.00086, AUD: 0.00097, JPY: 0.094, CHF: 0.00057 };

export default function DccPosPayment() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    touristId: "", amountNgn: "", homeCurrency: "USD", establishmentId: "",
  });
  const [result, setResult] = useState<any>(null);

  const fxRate = FX_RATES[form.homeCurrency] ?? 0.00063;
  const homeAmount = form.amountNgn ? (parseFloat(form.amountNgn) * fxRate).toFixed(2) : "0";

  const startMut = trpc.journeyV2.startDccPosPayment.useMutation({
    onSuccess: (d) => {
      toast.success("DCC Payment Successful!", { description: d.message });
      setResult(d);
    },
    onError: (e) => toast.error("Payment failed", { description: e.message }),
  });

  const handleSubmit = () => {
    if (!form.touristId || !form.amountNgn || !form.establishmentId) {
      toast.error("Please fill all required fields");
      return;
    }
    startMut.mutate({
      merchantId: String(user?.id),
      touristId: form.touristId,
      amountNgn: parseFloat(form.amountNgn),
      homeCurrency: form.homeCurrency,
      homeAmount: parseFloat(homeAmount),
      fxRate,
      establishmentId: form.establishmentId,
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">DCC POS Payment</h1>
          <p className="text-gray-500 mt-1">Process DCC payment and earn loyalty points for the tourist</p>
        </div>
        <ArrowLeftRight className="w-8 h-8 text-blue-600" />
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Payment Successful!</p>
              <p className="text-sm text-green-700">Ref: {result.txRef}</p>
              <p className="text-sm text-green-700 flex items-center gap-1">
                <Star className="w-3 h-3" /> Tourist earned {result.loyaltyEarned} loyalty points
              </p>
              <p className="text-sm text-green-700">Receipt: {result.receiptId}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5" /> DCC Transaction
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Tourist ID *</Label>
              <Input value={form.touristId} onChange={e => setForm(f => ({ ...f, touristId: e.target.value }))} placeholder="Tourist user ID" />
            </div>
            <div>
              <Label>Establishment ID *</Label>
              <Input value={form.establishmentId} onChange={e => setForm(f => ({ ...f, establishmentId: e.target.value }))} placeholder="est_456" />
            </div>
            <div>
              <Label>Amount (NGN) *</Label>
              <Input type="number" value={form.amountNgn} onChange={e => setForm(f => ({ ...f, amountNgn: e.target.value }))} placeholder="50000" />
            </div>
            <div>
              <Label>Tourist Home Currency</Label>
              <Select value={form.homeCurrency} onValueChange={v => setForm(f => ({ ...f, homeCurrency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.amountNgn && (
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
              <strong>DCC Quote:</strong> ₦{parseFloat(form.amountNgn).toLocaleString()} = {form.homeCurrency} {homeAmount}
              <span className="ml-2 text-blue-600">(Rate: {fxRate.toFixed(6)} · Spread: 2.5%)</span>
            </div>
          )}
          <Button onClick={handleSubmit} disabled={startMut.isPending} className="w-full">
            {startMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing DCC...</> : "Process DCC Payment"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
