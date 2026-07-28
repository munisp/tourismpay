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
import { Building2, Link, Unlink, Plus, RefreshCw } from "lucide-react";

export default function OpenBanking() {
  const { user } = useAuth();
  const [showLink, setShowLink] = useState(false);
  const [showTopup, setShowTopup] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState({ provider: "mono", auth_code: "" });
  const [topupAmount, setTopupAmount] = useState("");

  const { data: connections, isLoading, refetch } = trpc.openBanking.myConnections.useQuery(
    { userId: user?.id ?? "" },
    { enabled: !!user?.id }
  );

  const { data: topups } = trpc.openBanking.myConnections.useQuery(
    { userId: user?.id ?? "" },
    { enabled: !!user?.id }
  );

  const linkMut = trpc.openBanking.initiateConnection.useMutation({
    onSuccess: (d) => { toast.success("Bank Linked", { description: d.message }); setShowLink(false); refetch(); },
    onError: (e) => toast.error("Link failed", { description: e.message }),
  });

  const disconnectMut = trpc.openBanking.disconnect.useMutation({
    onSuccess: () => { toast.success("Bank disconnected"); refetch(); },
    onError: (e) => toast.error("Disconnect failed", { description: e.message }),
  });

  const topupMut = trpc.openBanking.topUpWallet.useMutation({
    onSuccess: (d) => { toast.success("Top-up initiated", { description: d.message }); setShowTopup(null); setTopupAmount(""); refetch(); },
    onError: (e) => toast.error("Top-up failed", { description: e.message }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Open Banking</h1>
          <p className="text-gray-500 mt-1">Link your Nigerian bank account for instant wallet top-ups</p>
        </div>
        <Button onClick={() => setShowLink(!showLink)} className="flex items-center gap-2">
          <Link className="w-4 h-4" /> Link Bank Account
        </Button>
      </div>

      {showLink && (
        <Card>
          <CardHeader><CardTitle>Link Bank Account</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Provider</Label>
                <Select value={linkForm.provider} onValueChange={v => setLinkForm(f => ({...f, provider: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mono">Mono</SelectItem>
                    <SelectItem value="okra">Okra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Auth Code (from widget)</Label><Input value={linkForm.auth_code} onChange={e => setLinkForm(f => ({...f, auth_code: e.target.value}))} placeholder="code_abc123" /></div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => linkMut.mutate({ userId: user?.id ?? "", provider: linkForm.provider, authCode: linkForm.auth_code })} disabled={linkMut.isPending}>{linkMut.isPending ? "Linking..." : "Link Account"}</Button>
              <Button variant="outline" onClick={() => setShowLink(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="font-semibold">Linked Accounts</h2>
        {isLoading ? <div className="h-20 bg-gray-100 rounded animate-pulse" /> : !connections?.length ? (
          <Card><CardContent className="py-8 text-center text-gray-500"><Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No bank accounts linked yet</p></CardContent></Card>
        ) : connections.map((c: any) => (
          <Card key={c.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building2 className="w-8 h-8 text-blue-600" />
                  <div>
                    <p className="font-medium">{c.bank_name}</p>
                    <p className="text-sm text-gray-500">{c.account_name} · ****{c.account_number.slice(-4)} · {c.provider.toUpperCase()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={c.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>{c.status}</Badge>
                  {c.status === "active" && (
                    <>
                      <Button size="sm" onClick={() => setShowTopup(c.id)} className="flex items-center gap-1"><Plus className="w-3 h-3" />Top Up</Button>
                      <Button size="sm" variant="outline" onClick={() => disconnectMut.mutate({ connectionId: c.id, userId: user?.id ?? "" })}><Unlink className="w-3 h-3" /></Button>
                    </>
                  )}
                </div>
              </div>
              {showTopup === c.id && (
                <div className="mt-3 flex gap-2">
                  <Input type="number" placeholder="Amount (NGN)" value={topupAmount} onChange={e => setTopupAmount(e.target.value)} className="w-40" />
                  <Button size="sm" onClick={() => topupMut.mutate({ connectionId: c.id, userId: user?.id ?? "", amount: parseFloat(topupAmount), currency: "NGN" })} disabled={topupMut.isPending}>{topupMut.isPending ? "Processing..." : "Top Up"}</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowTopup(null)}>Cancel</Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {topups && topups.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Recent Top-ups</h2>
          {topups.slice(0, 5).map((t: any) => (
            <div key={t.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div><p className="text-sm font-medium">{t.bank_name} · ****{t.account_number?.slice(-4)}</p><p className="text-xs text-gray-500">{new Date(t.created_at).toLocaleDateString()}</p></div>
              <div className="text-right"><p className="font-medium">{t.currency} {Number(t.amount).toLocaleString()}</p><Badge className={t.status === "completed" ? "bg-green-100 text-green-800 text-xs" : "bg-yellow-100 text-yellow-800 text-xs"}>{t.status}</Badge></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
