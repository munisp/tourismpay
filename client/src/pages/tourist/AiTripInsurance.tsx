/**
 * J02 — AI-Planned Trip with Insurance
 * Tourist gets an AI-generated itinerary and travel insurance in one flow.
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
import { Plane, Shield, MapPin, Loader2, CheckCircle } from "lucide-react";

export default function AiTripInsurance() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    destination: "", departureDate: "", returnDate: "",
    coverageType: "standard" as "basic" | "standard" | "comprehensive",
    premiumNgn: "5000",
  });
  const [result, setResult] = useState<any>(null);

  const policies = trpc.journeyV2.getInsurancePolicy.useQuery(
    { policyNumber: result?.policyId ?? "" },
    { enabled: !!result?.policyId }
  );

  const startMut = trpc.journeyV2.startAiTripInsurance.useMutation({
    onSuccess: (d) => {
      toast.success("Trip Planned & Insured!", { description: d.message });
      setResult(d);
    },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const handleSubmit = () => {
    if (!form.destination || !form.departureDate || !form.returnDate) {
      toast.error("Please fill all required fields");
      return;
    }
    startMut.mutate({
      destination: form.destination,
      departureDate: form.departureDate,
      returnDate: form.returnDate,
      coverageType: form.coverageType,
      premiumNgn: parseFloat(form.premiumNgn),
    });
  };

  const coverageLabels = { basic: "Basic (₦5,000)", standard: "Standard (₦10,000)", comprehensive: "Comprehensive (₦25,000)" };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Trip Planner + Insurance</h1>
          <p className="text-gray-500 mt-1">Get an AI-generated itinerary and travel insurance in one step</p>
        </div>
        <div className="flex gap-2">
          <Plane className="w-7 h-7 text-blue-600" />
          <Shield className="w-7 h-7 text-green-600" />
        </div>
      </div>

      {/* Success State */}
      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Trip Planned & Insured!</p>
              <p className="text-sm text-green-700">Policy: {result.policyId}</p>
              <p className="text-sm text-green-700">Itinerary: {result.itineraryId}</p>
              <p className="text-sm text-green-700">Workflow: {result.workflowId}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" /> Plan Your Trip
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>Destination *</Label>
              <Input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} placeholder="Lagos, Nigeria" />
            </div>
            <div>
              <Label>Departure Date *</Label>
              <Input type="date" value={form.departureDate} onChange={e => setForm(f => ({ ...f, departureDate: e.target.value }))} />
            </div>
            <div>
              <Label>Return Date *</Label>
              <Input type="date" value={form.returnDate} onChange={e => setForm(f => ({ ...f, returnDate: e.target.value }))} />
            </div>
            <div>
              <Label>Insurance Coverage</Label>
              <Select value={form.coverageType} onValueChange={v => setForm(f => ({ ...f, coverageType: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["basic", "standard", "comprehensive"] as const).map(c => (
                    <SelectItem key={c} value={c}>{coverageLabels[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Premium (NGN)</Label>
              <Input type="number" value={form.premiumNgn} onChange={e => setForm(f => ({ ...f, premiumNgn: e.target.value }))} />
            </div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
            <strong>What you get:</strong> AI-generated itinerary for {form.destination || "your destination"} + {form.coverageType} travel insurance policy
          </div>
          <Button onClick={handleSubmit} disabled={startMut.isPending} className="w-full">
            {startMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Planning trip & activating insurance...</> : "Plan Trip & Get Insurance"}
          </Button>
        </CardContent>
      </Card>

      {/* Policy Details */}
      {policies.data && (
        <Card>
          <CardHeader><CardTitle>Active Policy</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-gray-500">Policy Number</p><p className="font-medium">{policies.data.policy_number}</p></div>
              <div><p className="text-gray-500">Status</p><Badge className="bg-green-100 text-green-800">{policies.data.status}</Badge></div>
              <div><p className="text-gray-500">Start Date</p><p className="font-medium">{policies.data.start_date}</p></div>
              <div><p className="text-gray-500">End Date</p><p className="font-medium">{policies.data.end_date}</p></div>
              <div><p className="text-gray-500">Premium Paid</p><p className="font-medium">₦{Number(policies.data.premium_paid).toLocaleString()}</p></div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
