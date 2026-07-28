/**
 * J01 — BNPL-Backed Hotel Booking
 * Tourist books a hotel and splits payment into instalments via BNPL.
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
import { CreditCard, Hotel, Calendar, CheckCircle, Loader2 } from "lucide-react";

export default function BnplHotelBooking() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    hotelId: "", checkIn: "", checkOut: "",
    totalAmountNgn: "", instalments: "3", currency: "NGN",
  });

  const myPlans = trpc.bnpl.myPlans.useQuery(undefined, { enabled: !!user?.id });

  const startMut = trpc.journeyV2.startBnplHotelBooking.useMutation({
    onSuccess: (d) => {
      toast.success("BNPL Booking Confirmed!", { description: d.message });
      myPlans.refetch();
      setForm({ hotelId: "", checkIn: "", checkOut: "", totalAmountNgn: "", instalments: "3", currency: "NGN" });
    },
    onError: (e) => toast.error("Booking failed", { description: e.message }),
  });

  const handleSubmit = () => {
    if (!form.hotelId || !form.totalAmountNgn || !form.checkIn || !form.checkOut) {
      toast.error("Please fill all required fields");
      return;
    }
    startMut.mutate({
      hotelId: form.hotelId,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      totalAmountNgn: parseFloat(form.totalAmountNgn),
      instalments: parseInt(form.instalments) as 2 | 3 | 4 | 6 | 12,
      currency: form.currency,
    });
  };

  const statusColor = (s: string) => ({
    active: "bg-green-100 text-green-800",
    completed: "bg-blue-100 text-blue-800",
    cancelled: "bg-gray-100 text-gray-800",
    defaulted: "bg-red-100 text-red-800",
  }[s] ?? "bg-gray-100 text-gray-800");

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">BNPL Hotel Booking</h1>
          <p className="text-gray-500 mt-1">Book your hotel and split the payment into easy instalments</p>
        </div>
        <CreditCard className="w-8 h-8 text-blue-600" />
      </div>

      {/* Create Booking Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hotel className="w-5 h-5" /> New BNPL Hotel Booking
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Hotel ID *</Label>
              <Input value={form.hotelId} onChange={e => setForm(f => ({ ...f, hotelId: e.target.value }))} placeholder="hotel_123" />
            </div>
            <div>
              <Label>Total Amount (NGN) *</Label>
              <Input type="number" value={form.totalAmountNgn} onChange={e => setForm(f => ({ ...f, totalAmountNgn: e.target.value }))} placeholder="250000" />
            </div>
            <div>
              <Label>Check-In Date *</Label>
              <Input type="date" value={form.checkIn} onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))} />
            </div>
            <div>
              <Label>Check-Out Date *</Label>
              <Input type="date" value={form.checkOut} onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))} />
            </div>
            <div>
              <Label>Number of Instalments</Label>
              <Select value={form.instalments} onValueChange={v => setForm(f => ({ ...f, instalments: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 6, 12].map(n => (
                    <SelectItem key={n} value={String(n)}>{n} payments</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["NGN", "USD", "GBP", "EUR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.totalAmountNgn && form.instalments && (
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
              <strong>Instalment amount:</strong> ₦{(parseFloat(form.totalAmountNgn || "0") / parseInt(form.instalments)).toLocaleString()} × {form.instalments} payments
              <span className="ml-2 text-blue-600">(+2.5% risk premium)</span>
            </div>
          )}
          <Button onClick={handleSubmit} disabled={startMut.isPending} className="w-full">
            {startMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</> : "Book with BNPL"}
          </Button>
        </CardContent>
      </Card>

      {/* Existing Plans */}
      <div>
        <h2 className="text-lg font-semibold mb-3">My BNPL Plans</h2>
        {myPlans.isLoading ? (
          <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />)}</div>
        ) : !myPlans.data?.length ? (
          <Card>
            <CardContent className="py-10 text-center text-gray-500">
              <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No BNPL plans yet. Create one above to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(myPlans.data as any[]).map((plan: any) => (
              <Card key={plan.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{plan.id}</p>
                    <p className="text-sm text-gray-500">Hotel: {plan.hotel_id} · {plan.instalments} instalments</p>
                    <p className="text-sm">₦{Number(plan.instalment_amount).toLocaleString()} / instalment</p>
                  </div>
                  <div className="text-right">
                    <Badge className={statusColor(plan.status)}>{plan.status}</Badge>
                    <p className="text-xs text-gray-400 mt-1">
                      {plan.paid_count}/{plan.instalments} paid
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
