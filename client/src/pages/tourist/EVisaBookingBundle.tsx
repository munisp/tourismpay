/**
 * J05 — e-Visa + Direct Hotel Booking Bundle
 * Tourist applies for e-Visa and books a hotel in one seamless flow.
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
import { FileText, Hotel, CheckCircle, Loader2 } from "lucide-react";

const COUNTRIES = ["US", "GB", "CA", "AU", "DE", "FR", "JP", "CN", "IN", "BR", "ZA", "GH", "KE"];

export default function EVisaBookingBundle() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    passportCountry: "US", hotelId: "", checkIn: "", checkOut: "",
    visaFeeNgn: "15000", bookingAmountNgn: "",
  });
  const [result, setResult] = useState<any>(null);

  const startMut = trpc.journeyV2.startEVisaDirectBooking.useMutation({
    onSuccess: (d) => {
      toast.success("Visa & Hotel Booked!", { description: d.message });
      setResult(d);
    },
    onError: (e) => toast.error("Bundle failed", { description: e.message }),
  });

  const handleSubmit = () => {
    if (!form.hotelId || !form.checkIn || !form.checkOut || !form.bookingAmountNgn) {
      toast.error("Please fill all required fields");
      return;
    }
    startMut.mutate({
      passportCountry: form.passportCountry,
      hotelId: form.hotelId,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      visaFeeNgn: parseFloat(form.visaFeeNgn),
      bookingAmountNgn: parseFloat(form.bookingAmountNgn),
    });
  };

  const total = (parseFloat(form.visaFeeNgn || "0") + parseFloat(form.bookingAmountNgn || "0"));

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">e-Visa + Hotel Bundle</h1>
          <p className="text-gray-500 mt-1">Apply for your e-Visa and book your hotel in one step</p>
        </div>
        <div className="flex gap-2">
          <FileText className="w-7 h-7 text-blue-600" />
          <Hotel className="w-7 h-7 text-orange-600" />
        </div>
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Visa & Hotel Confirmed!</p>
              <p className="text-sm text-green-700">Visa Ref: {result.visaRef}</p>
              <p className="text-sm text-green-700">Booking Ref: {result.bookingRef}</p>
              <p className="text-sm text-green-700">Total Charged: ₦{Number(result.totalCharged).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Bundle Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Passport Country *</Label>
              <Select value={form.passportCountry} onValueChange={v => setForm(f => ({ ...f, passportCountry: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Visa Fee (NGN)</Label>
              <Input type="number" value={form.visaFeeNgn} onChange={e => setForm(f => ({ ...f, visaFeeNgn: e.target.value }))} />
            </div>
            <div>
              <Label>Hotel ID *</Label>
              <Input value={form.hotelId} onChange={e => setForm(f => ({ ...f, hotelId: e.target.value }))} placeholder="hotel_123" />
            </div>
            <div>
              <Label>Booking Amount (NGN) *</Label>
              <Input type="number" value={form.bookingAmountNgn} onChange={e => setForm(f => ({ ...f, bookingAmountNgn: e.target.value }))} placeholder="80000" />
            </div>
            <div>
              <Label>Check-In *</Label>
              <Input type="date" value={form.checkIn} onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))} />
            </div>
            <div>
              <Label>Check-Out *</Label>
              <Input type="date" value={form.checkOut} onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))} />
            </div>
          </div>
          {total > 0 && (
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
              <strong>Total Bundle Cost:</strong> ₦{total.toLocaleString()}
              <span className="ml-2 text-blue-600">(Visa: ₦{parseFloat(form.visaFeeNgn || "0").toLocaleString()} + Hotel: ₦{parseFloat(form.bookingAmountNgn || "0").toLocaleString()})</span>
            </div>
          )}
          <Button onClick={handleSubmit} disabled={startMut.isPending} className="w-full">
            {startMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing bundle...</> : "Book Visa + Hotel Bundle"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
