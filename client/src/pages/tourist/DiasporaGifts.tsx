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
import { Gift, Heart, Send, CheckCircle } from "lucide-react";

export default function DiasporaGifts() {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [form, setForm] = useState({ recipient_name: "", recipient_email: "", hotel_id: "", gift_type: "hotel_credit", amount: "", currency: "USD", message: "", occasion: "general" });

  const { data: gifts, isLoading, refetch } = trpc.diasporaGifts.listSentGifts.useQuery(
    { senderId: user?.id ?? "" },
    { enabled: !!user?.id }
  );

  const { data: stats } = trpc.diasporaGifts.getStats.useQuery(
    { senderId: user?.id ?? "" },
    { enabled: !!user?.id }
  );

  const createMut = trpc.diasporaGifts.createGift.useMutation({
    onSuccess: (d) => { toast.success("Gift Sent!", { description: `Redemption code: ${d.redemption_code}` }); setShowCreate(false); refetch(); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const redeemMut = trpc.diasporaGifts.redeemGift.useMutation({
    onSuccess: (d) => { toast.success("Gift Redeemed!", { description: d.message }); setShowRedeem(false); setRedeemCode(""); },
    onError: (e) => toast.error("Redemption failed", { description: e.message }),
  });

  const statusColor = (s: string) => s === "redeemed" ? "bg-green-100 text-green-800" : s === "pending" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-800";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Diaspora Gifts</h1><p className="text-gray-500 mt-1">Send hotel credits and travel gifts to loved ones in Nigeria</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowRedeem(!showRedeem)} className="flex items-center gap-2"><Gift className="w-4 h-4" />Redeem Gift</Button>
          <Button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2"><Send className="w-4 h-4" />Send Gift</Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4">
          {[["Total Gifts", stats.total_gifts],["Redeemed", stats.redeemed],["Total Value", `USD ${Number(stats.total_value_usd).toLocaleString()}`]].map(([label, value]) => (
            <Card key={label as string}><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{value}</p><p className="text-sm text-gray-500">{label}</p></CardContent></Card>
          ))}
        </div>
      )}

      {showRedeem && (
        <Card>
          <CardHeader><CardTitle>Redeem a Gift</CardTitle></CardHeader>
          <CardContent className="flex gap-3">
            <Input value={redeemCode} onChange={e => setRedeemCode(e.target.value)} placeholder="Enter redemption code (e.g. A1B2C3D4)" className="flex-1" />
            <Button onClick={() => redeemMut.mutate({ code: redeemCode, touristId: user?.id ?? "" })} disabled={redeemMut.isPending}>{redeemMut.isPending ? "Redeeming..." : "Redeem"}</Button>
          </CardContent>
        </Card>
      )}

      {showCreate && (
        <Card>
          <CardHeader><CardTitle>Send a Gift</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Recipient Name</Label><Input value={form.recipient_name} onChange={e => setForm(f => ({...f, recipient_name: e.target.value}))} placeholder="Amara Diallo" /></div>
              <div><Label>Recipient Email</Label><Input type="email" value={form.recipient_email} onChange={e => setForm(f => ({...f, recipient_email: e.target.value}))} placeholder="amara@email.com" /></div>
              <div><Label>Gift Type</Label>
                <Select value={form.gift_type} onValueChange={v => setForm(f => ({...f, gift_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[["hotel_credit","Hotel Credit"],["restaurant_voucher","Restaurant Voucher"],["spa_voucher","Spa Voucher"],["tour_package","Tour Package"]].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Amount (USD)</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} placeholder="100" /></div>
              <div><Label>Occasion</Label>
                <Select value={form.occasion} onValueChange={v => setForm(f => ({...f, occasion: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[["general","General"],["birthday","Birthday"],["anniversary","Anniversary"],["holiday","Holiday"],["wedding","Wedding"]].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Hotel ID (optional)</Label><Input value={form.hotel_id} onChange={e => setForm(f => ({...f, hotel_id: e.target.value}))} placeholder="hotel_123" /></div>
            </div>
            <div><Label>Personal Message</Label><Input value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))} placeholder="Enjoy your stay in Nigeria!" /></div>
            <div className="flex gap-2">
              <Button onClick={() => createMut.mutate({ senderId: user?.id ?? "", ...form, amount: parseFloat(form.amount) })} disabled={createMut.isPending}>{createMut.isPending ? "Sending..." : "Send Gift"}</Button>
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
                <p className="font-medium">{g.recipient_name || g.recipient_email}</p>
                <p className="text-sm text-gray-500 capitalize">{g.gift_type.replace("_"," ")} · {g.occasion} · Code: <span className="font-mono font-bold">{g.redemption_code}</span></p>
              </div>
              <div className="text-right">
                <p className="font-medium">{g.currency} {Number(g.amount).toLocaleString()}</p>
                <Badge className={statusColor(g.status)}>{g.status}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
