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
import { CreditCard, Calendar, DollarSign, CheckCircle, AlertCircle } from "lucide-react";

export default function BNPLPlans() {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ hotel_id: "", total_amount: "", currency: "NGN", instalments: "3" });

  const { data: plans, isLoading, refetch } = trpc.bnpl.listPlans.useQuery(
    { touristId: user?.id ?? "" },
    { enabled: !!user?.id }
  );

  const createMut = trpc.bnpl.createPlan.useMutation({
    onSuccess: (data) => {
      toast.success("BNPL Plan Created", { description: data.message });
      setShowCreate(false);
      refetch();
    },
    onError: (e) => toast.error("Failed to create plan", { description: e.message }),
  });

  const payMut = trpc.bnpl.payInstalment.useMutation({
    onSuccess: () => { toast.success("Instalment paid successfully"); refetch(); },
    onError: (e) => toast.error("Payment failed", { description: e.message }),
  });

  const handleCreate = () => {
    if (!form.hotel_id || !form.total_amount) { toast.error("Please fill all fields"); return; }
    createMut.mutate({
      touristId: user?.id ?? "",
      hotelId: form.hotel_id,
      totalAmount: parseFloat(form.total_amount),
      currency: form.currency,
      instalments: parseInt(form.instalments),
    });
  };

  const statusColor = (s: string) => s === "active" ? "bg-green-100 text-green-800" : s === "completed" ? "bg-blue-100 text-blue-800" : s === "defaulted" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Buy Now, Pay Later</h1>
          <p className="text-gray-500 mt-1">Split your hotel payments into easy instalments</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2">
          <CreditCard className="w-4 h-4" /> New BNPL Plan
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle>Create Instalment Plan</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Hotel ID</Label><Input value={form.hotel_id} onChange={e => setForm(f => ({...f, hotel_id: e.target.value}))} placeholder="hotel_123" /></div>
              <div><Label>Total Amount</Label><Input type="number" value={form.total_amount} onChange={e => setForm(f => ({...f, total_amount: e.target.value}))} placeholder="50000" /></div>
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({...f, currency: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["NGN","USD","GBP","EUR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Instalments</Label>
                <Select value={form.instalments} onValueChange={v => setForm(f => ({...f, instalments: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2,3,4,6,12].map(n => <SelectItem key={n} value={String(n)}>{n} payments</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={createMut.isPending}>{createMut.isPending ? "Creating..." : "Create Plan"}</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />)}</div>
      ) : !plans?.length ? (
        <Card><CardContent className="py-12 text-center text-gray-500"><CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No BNPL plans yet. Create one to split your next hotel payment.</p></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {plans.map((plan: any) => (
            <Card key={plan.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold">{plan.id}</p>
                    <p className="text-sm text-gray-500">Hotel: {plan.hotel_id}</p>
                  </div>
                  <Badge className={statusColor(plan.status)}>{plan.status}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><p className="text-gray-500">Total</p><p className="font-medium">{plan.currency} {Number(plan.total_amount).toLocaleString()}</p></div>
                  <div><p className="text-gray-500">Per Instalment</p><p className="font-medium">{plan.currency} {Number(plan.instalment_amount).toLocaleString()}</p></div>
                  <div><p className="text-gray-500">Progress</p><p className="font-medium">{plan.paid_count}/{plan.instalments} paid</p></div>
                </div>
                <div className="mt-3 bg-gray-100 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{width: `${(plan.paid_count/plan.instalments)*100}%`}} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
