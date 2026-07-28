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
import { Plane, Shield, CheckCircle, Clock } from "lucide-react";

export default function EVisaPayment() {
  const { user } = useAuth();
  const [form, setForm] = useState({ passport_number: "", nationality: "GB", visa_type: "tourist", duration_days: "30" });
  const [showForm, setShowForm] = useState(false);

  const { data: fee } = trpc.eVisa.getFee.useQuery(
    { nationality: form.nationality, visaType: form.visa_type },
    { enabled: !!form.nationality }
  );

  const { data: payments, isLoading, refetch } = trpc.eVisa.myPayments.useQuery(
    { touristId: user?.id ?? "" },
    { enabled: !!user?.id }
  );

  const initiateMut = trpc.eVisa.initiatePayment.useMutation({
    onSuccess: (data) => {
      toast.success("e-Visa Payment Initiated", { description: data.message });
      setShowForm(false);
      refetch();
    },
    onError: (e) => toast.error("Failed to initiate payment", { description: e.message }),
  });

  const handleInitiate = () => {
    if (!form.passport_number) { toast.error("Passport number required"); return; }
    initiateMut.mutate({
      touristId: user?.id ?? "",
      passportNumber: form.passport_number,
      nationality: form.nationality,
      visaType: form.visa_type,
      durationDays: parseInt(form.duration_days),
      feeAmount: fee?.fee_usd ?? 100,
      currency: "USD",
    });
  };

  const statusColor = (s: string) => s === "approved" ? "bg-green-100 text-green-800" : s === "processing" ? "bg-yellow-100 text-yellow-800" : s === "rejected" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nigeria e-Visa Payment</h1>
          <p className="text-gray-500 mt-1">Pay your visa fee before arriving in Nigeria</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2">
          <Plane className="w-4 h-4" /> Apply for e-Visa
        </Button>
      </div>

      {fee && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 flex items-center gap-4">
            <Shield className="w-8 h-8 text-blue-600" />
            <div>
              <p className="font-semibold text-blue-900">Current Fee: USD {fee.fee_usd}</p>
              <p className="text-sm text-blue-700">Processing time: {fee.processing_days} business days</p>
            </div>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card>
          <CardHeader><CardTitle>e-Visa Application</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Passport Number</Label><Input value={form.passport_number} onChange={e => setForm(f => ({...f, passport_number: e.target.value}))} placeholder="AB123456" /></div>
              <div>
                <Label>Nationality</Label>
                <Select value={form.nationality} onValueChange={v => setForm(f => ({...f, nationality: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[["GB","United Kingdom"],["US","United States"],["CA","Canada"],["DE","Germany"],["FR","France"],["IN","India"],["CN","China"],["AU","Australia"]].map(([code, name]) => <SelectItem key={code} value={code}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Visa Type</Label>
                <Select value={form.visa_type} onValueChange={v => setForm(f => ({...f, visa_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[["tourist","Tourist"],["business","Business"],["transit","Transit"]].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration</Label>
                <Select value={form.duration_days} onValueChange={v => setForm(f => ({...f, duration_days: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[["30","30 days"],["60","60 days"],["90","90 days"]].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleInitiate} disabled={initiateMut.isPending}>{initiateMut.isPending ? "Processing..." : `Pay USD ${fee?.fee_usd ?? "..."}`}</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="font-semibold text-gray-900">My Applications</h2>
        {isLoading ? (
          <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : !payments?.length ? (
          <Card><CardContent className="py-8 text-center text-gray-500"><Plane className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No visa applications yet</p></CardContent></Card>
        ) : payments.map((p: any) => (
          <Card key={p.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{p.passport_number} — {p.visa_type} visa</p>
                <p className="text-sm text-gray-500">{p.nationality} · USD {p.fee_amount} · {new Date(p.created_at).toLocaleDateString()}</p>
                {p.nis_reference_id && <p className="text-xs text-blue-600 mt-1">NIS Ref: {p.nis_reference_id}</p>}
              </div>
              <Badge className={statusColor(p.status)}>{p.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
