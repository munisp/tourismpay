/**
 * J03 — Diaspora Gift Redemption
 * Tourist redeems a diaspora gift at an establishment.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Gift, Star, CheckCircle, Loader2 } from "lucide-react";

export default function DiasporaGiftRedemption() {
  const { user } = useAuth();
  const [form, setForm] = useState({ giftId: "", establishmentId: "", amountNgn: "" });
  const [result, setResult] = useState<any>(null);

  const giftQuery = trpc.journeyV2.getDiasporaGift.useQuery(
    { giftId: form.giftId },
    { enabled: form.giftId.length > 3 }
  );

  const redeemMut = trpc.journeyV2.startDiasporaGiftRedemption.useMutation({
    onSuccess: (d) => {
      toast.success("Gift Redeemed!", { description: d.message });
      setResult(d);
    },
    onError: (e) => toast.error("Redemption failed", { description: e.message }),
  });

  const handleRedeem = () => {
    if (!form.giftId || !form.establishmentId || !form.amountNgn) {
      toast.error("Please fill all fields");
      return;
    }
    redeemMut.mutate({
      giftId: form.giftId,
      establishmentId: form.establishmentId,
      amountNgn: parseFloat(form.amountNgn),
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Redeem Diaspora Gift</h1>
          <p className="text-gray-500 mt-1">Redeem gifts sent by family abroad at participating establishments</p>
        </div>
        <Gift className="w-8 h-8 text-purple-600" />
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Gift Redeemed Successfully!</p>
              <p className="text-sm text-green-700">Ref: {result.redemptionRef}</p>
              <p className="text-sm text-green-700 flex items-center gap-1">
                <Star className="w-3 h-3" /> Earned {result.loyaltyEarned} loyalty points
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5" /> Gift Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Gift ID / Code *</Label>
            <Input value={form.giftId} onChange={e => setForm(f => ({ ...f, giftId: e.target.value }))} placeholder="GIFT-ABC123" />
            {giftQuery.data && (
              <div className="mt-2 p-2 bg-purple-50 rounded text-sm text-purple-800">
                Gift found: ₦{Number(giftQuery.data.amount_ngn).toLocaleString()} · Status: {giftQuery.data.status}
              </div>
            )}
          </div>
          <div>
            <Label>Establishment ID *</Label>
            <Input value={form.establishmentId} onChange={e => setForm(f => ({ ...f, establishmentId: e.target.value }))} placeholder="est_456" />
          </div>
          <div>
            <Label>Amount to Redeem (NGN) *</Label>
            <Input type="number" value={form.amountNgn} onChange={e => setForm(f => ({ ...f, amountNgn: e.target.value }))} placeholder="10000" />
          </div>
          <Button onClick={handleRedeem} disabled={redeemMut.isPending} className="w-full bg-purple-600 hover:bg-purple-700">
            {redeemMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Redeeming...</> : "Redeem Gift"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
