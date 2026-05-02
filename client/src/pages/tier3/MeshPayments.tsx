import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Network, ArrowRightLeft, Send, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function MeshPayments() {
  const utils = trpc.useUtils();
  const [sendOpen, setSendOpen] = useState(false);
  const [corridor, setCorridor] = useState("");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const { data: stats, isLoading: statsLoading } = trpc.mesh.stats.useQuery();
  const { data: corridors } = trpc.mesh.listCorridors.useQuery();
  const { data: history, isLoading } = trpc.mesh.history.useQuery({ limit: 20 });
  const quoteQuery = trpc.mesh.getQuote.useQuery(
    { corridorId: corridor, amount: parseFloat(amount || "0") },
    { enabled: !!corridor && parseFloat(amount) > 0 }
  );
  const sendMutation = trpc.mesh.send.useMutation({
    onSuccess: () => {
      utils.mesh.history.invalidate();
      utils.mesh.stats.invalidate();
      setSendOpen(false);
      setCorridor("");
      setAmount("");
      setRecipient("");
      toast.success("Mesh payment sent!");
    },
    onError: (e) => toast.error("Payment failed", { description: e.message }),
  });
  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Network className="w-6 h-6 text-primary" />Mesh Payments</h1>
          <p className="text-muted-foreground text-sm mt-1">Cross-border micro-payment routing across African corridors</p>
        </div>
        <Button onClick={() => setSendOpen(true)} className="gap-2"><Send className="w-4 h-4" />Send Payment</Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Sent", value: statsLoading ? "—" : stats?.totalSent ?? 0 },
          { label: "Transactions", value: statsLoading ? "—" : stats?.totalTransactions ?? 0 },
          { label: "Active Corridors", value: statsLoading ? "—" : stats?.activeCorridors ?? 0 },
        ].map((s) => (
          <Card key={s.label}><CardContent className="pt-4 pb-3"><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Available Corridors</CardTitle><CardDescription>Live exchange rates with fees</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(corridors ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{c.fromCurrency} → {c.toCurrency}</span>
                  <Badge variant="outline" className="text-xs">{c.from}→{c.to}</Badge>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">1 {c.fromCurrency} = {c.rate} {c.toCurrency}</p>
                  <p className="text-xs text-muted-foreground">Fee: {(c.fee * 100).toFixed(1)}%</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Transaction History</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : !history?.length ? (
            <div className="text-center py-8 text-muted-foreground"><Network className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No transactions yet.</p></div>
          ) : (
            <div className="space-y-2">
              {history.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">{t.fromCurrency} → {t.toCurrency}</p>
                    <p className="text-xs text-muted-foreground">{t.recipientAddress ?? "—"} · {new Date(t.createdAt * 1000).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{t.amount} {t.fromCurrency}</p>
                    <Badge variant={t.status === "completed" ? "default" : "secondary"} className="text-xs">{t.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send Mesh Payment</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Corridor</Label>
              <Select value={corridor} onValueChange={setCorridor}>
                <SelectTrigger><SelectValue placeholder="Select corridor" /></SelectTrigger>
                <SelectContent>
                  {(corridors ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.fromCurrency} → {c.toCurrency} ({c.from}→{c.to})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Recipient Address</Label>
              <Input placeholder="Wallet address or account number" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </div>
            {quoteQuery.data && (
              <div className="p-3 bg-muted rounded text-sm space-y-1">
                <p>You send: <strong>{quoteQuery.data.sendAmount} {quoteQuery.data.sendCurrency}</strong></p>
                <p>Fee: <strong>{quoteQuery.data.fee} {quoteQuery.data.sendCurrency}</strong></p>
                <p>Recipient gets: <strong>{quoteQuery.data.receivedAmount} {quoteQuery.data.receiveCurrency}</strong></p>
                <p className="text-xs text-muted-foreground">Est. {quoteQuery.data.estimatedMinutes} min</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button
              onClick={() => sendMutation.mutate({ corridorId: corridor, amount: parseFloat(amount), recipientAddress: recipient })}
              disabled={sendMutation.isPending || !corridor || !amount || !recipient}
            >
              {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
