/**
 * J06 — Group MICE Booking with BNPL Split
 * Merchant organises a group/MICE event with BNPL instalment plan.
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
import { Users, CreditCard, CheckCircle, Loader2 } from "lucide-react";

export default function GroupMiceBnpl() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    hotelId: "", groupName: "", attendees: "50", eventDate: "",
    totalAmountNgn: "", depositPct: "20", instalments: "3",
  });
  const [result, setResult] = useState<any>(null);

  const startMut = trpc.journeyV2.startGroupMiceBnpl.useMutation({
    onSuccess: (d) => {
      toast.success("Group Booking Confirmed!", { description: d.message });
      setResult(d);
    },
    onError: (e) => toast.error("Booking failed", { description: e.message }),
  });

  const handleSubmit = () => {
    if (!form.hotelId || !form.groupName || !form.eventDate || !form.totalAmountNgn) {
      toast.error("Please fill all required fields");
      return;
    }
    startMut.mutate({
      hotelId: form.hotelId,
      groupName: form.groupName,
      attendees: parseInt(form.attendees),
      eventDate: form.eventDate,
      totalAmountNgn: parseFloat(form.totalAmountNgn),
      depositPct: parseInt(form.depositPct),
      instalments: parseInt(form.instalments) as 2 | 3 | 4 | 6,
    });
  };

  const depositAmount = form.totalAmountNgn
    ? parseFloat(form.totalAmountNgn) * (parseInt(form.depositPct) / 100)
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Group MICE Booking + BNPL</h1>
          <p className="text-gray-500 mt-1">Book group events with a deposit and split the rest into instalments</p>
        </div>
        <div className="flex gap-2">
          <Users className="w-7 h-7 text-blue-600" />
          <CreditCard className="w-7 h-7 text-green-600" />
        </div>
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Group Booking Confirmed!</p>
              <p className="text-sm text-green-700">Booking ID: {result.groupBookingId}</p>
              <p className="text-sm text-green-700">BNPL Plan: {result.bnplPlanId}</p>
              <p className="text-sm text-green-700">Deposit Charged: ₦{Number(result.depositCharged).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" /> Group Event Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Group Name *</Label>
              <Input value={form.groupName} onChange={e => setForm(f => ({ ...f, groupName: e.target.value }))} placeholder="Acme Corp Annual Summit" />
            </div>
            <div>
              <Label>Hotel ID *</Label>
              <Input value={form.hotelId} onChange={e => setForm(f => ({ ...f, hotelId: e.target.value }))} placeholder="hotel_123" />
            </div>
            <div>
              <Label>Number of Attendees *</Label>
              <Input type="number" value={form.attendees} onChange={e => setForm(f => ({ ...f, attendees: e.target.value }))} />
            </div>
            <div>
              <Label>Event Date *</Label>
              <Input type="date" value={form.eventDate} onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))} />
            </div>
            <div>
              <Label>Total Amount (NGN) *</Label>
              <Input type="number" value={form.totalAmountNgn} onChange={e => setForm(f => ({ ...f, totalAmountNgn: e.target.value }))} placeholder="2000000" />
            </div>
            <div>
              <Label>Deposit %</Label>
              <Select value={form.depositPct} onValueChange={v => setForm(f => ({ ...f, depositPct: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10, 15, 20, 25, 30, 50].map(n => <SelectItem key={n} value={String(n)}>{n}%</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>BNPL Instalments</Label>
              <Select value={form.instalments} onValueChange={v => setForm(f => ({ ...f, instalments: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 6].map(n => <SelectItem key={n} value={String(n)}>{n} payments</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {depositAmount > 0 && (
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
              <strong>Deposit due now:</strong> ₦{depositAmount.toLocaleString()} ({form.depositPct}%)
              <span className="ml-2">· Remaining ₦{(parseFloat(form.totalAmountNgn || "0") - depositAmount).toLocaleString()} in {form.instalments} instalments</span>
            </div>
          )}
          <Button onClick={handleSubmit} disabled={startMut.isPending} className="w-full">
            {startMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Booking...</> : "Confirm Group Booking"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
