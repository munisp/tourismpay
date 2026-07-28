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
import { Gift, Heart, Send } from "lucide-react";

export default function DiasporaGifts() {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [form, setForm] = useState({ recipientEmail: "", giftType: "hotel_stay" as "hotel_stay"|"dining"|"experience"|"wallet_credit", amountNgn: "", senderCurrency: "USD", message: "" });

  const { data: gifts, isLoading, refetch } = trpc.diasporaGifts.mySentGifts.useQuery(
    undefined,
    { enabled: !!user?.id }
  );

  const { data: analytics } = trpc.diasporaGifts.giftAnalytics.useQuery(undefined, { enabled: !!user?.id });

  const createMut = trpc.diasporaGifts.sendGift.useMutation({
    onSuccess: (d) => { toast.success("Gift Sent!", { description: `Redemption code: ${d.redemptionCode}` }); setShowCreate(false); refetch(); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const redeemMut = trpc.diasporaGifts.redeemGift.useMutation({
    onSuccess: (d) => { toast.success("Gift Redeemed!", { description: d.message }); setShowRedeem(false); setRedeemCode(""); },
    onError: (e) => toast.error("Redemption failed", { description: e.message }),
  });

  const statusColor = (s: string) => s === "redeemed" ? "bg-green-100 text-green-800" : s === "sent" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-800";
  const RATE = 1550;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Diaspora Gifts</h1><p className="text-gray-500 mt-1">Send hotel credits and travel gifts to loved ones in Nigeria</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowRedeem(!showRedeem)} className="flex items-center gap-2"><Gift className="w-4 h-4" />Redeem Gift</Button>
          <Button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2"><Send className="w-4 h-4" />Send Gift</Button>
        </div>
      </div>

      {analytics && (
        <div className="grid grid-cols-3 gap-4">
          {[["Total Gifts", analytics.totalGifts],["Redeemed", analytics.totalRedeemed],["Total Value", `NGN ${Number(analytics.totalValueNgn).toLocaleString()}`]].map(([label, value]) => (
            <Card key={label as string}><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{value}</p><p className="text-sm text-gray-500">{label}</p></CardContent></Card>
          ))}
        </div>
      )}

      {showRedeem && (
        <Card>
          <CardHeader><CardTitle>Redeem a Gift</CardTitle></CardHeader>
          <CardContent className="flex gap-3">
            <Input value={redeemCode} onChange={e => setRedeemCode(e.target.value)} placeholder="Enter redemption code" className="flex-1" />
            <Button onClick={() => redeemMut.mutate({ redemptionCode: redeemCode })} disabled={redeemMut.isPending}>{redeemMut.isPending ? "Redeeming..." : "Redeem"}</Button>
          </CardContent>
        </Card>
      )}

      {showCreate && (
        <Card>
          <CardHeader><CardTitle>Send a Gift</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Recipient Email</Label><Input type="email" value={form.recipientEmail} onChange={e => setForm(f => ({...f, recipientEmail: e.target.value}))} placeholder="amara@email.com" /></div>
              <div><Label>Gift Type</Label>
                <Select value={form.giftType} onValueChange={v => setForm(f => ({...f, giftType: v as any}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[["hotel_stay","Hotel Stay"],["dining","Restaurant Voucher"],["experience","Experience"],["wallet_credit","Wallet Credit"]].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Amount (NGN)</Label><Input type="number" value={form.amountNgn} onChange={e => setForm(f => ({...f, amountNgn: e.target.value}))} placeholder="50000" /></div>
              <div><Label>Your Currency</Label>
                <Select value={form.senderCurrency} onValueChange={v => setForm(f => ({...f, senderCurrency: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["USD","GBP","EUR","CAD"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Personal Message</Label><Input value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))} placeholder="Enjoy your stay in Nigeria!" /></div>
            <div className="flex gap-2">
              <Button onClick={() => createMut.mutate({ recipientEmail: form.recipientEmail, giftType: form.giftType, amountNgn: parseFloat(form.amountNgn), amountSenderCurrency: parseFloat(form.amountNgn) / RATE, senderCurrency: form.senderCurrency, exchangeRate: RATE, message: form.message })} disabled={createMut.isPending}>{createMut.isPending ? "Sending..." : "Send Gift"}</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="font-semibold">Sent Gifts</h2>
        {isLoading ? <div className="h-20 bg-gray-100 rounded animate-pulse" /> : !gifts?.length ? (
          <Card><CardContent className="py-8 text-center text-gray-500"><Heart className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No gifts sent yet</p></CardContent></Card>
        ) : gifts.map((g: any) => (
          <Card key={g.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{g.recipientEmail || g.recipientPhone}</p>
                <p className="text-sm text-gray-500 capitalize">{g.giftType?.replace("_"," ")} · Code: <span className="font-mono font-bold">{g.redemptionCode}</span></p>
              </div>
              <div className="text-right">
                <p className="font-medium">NGN {Number(g.amountNgn).toLocaleString()}</p>
                <Badge className={statusColor(g.status)}>{g.status}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
