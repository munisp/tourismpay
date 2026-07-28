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
import { Shield, FileText, AlertTriangle, CheckCircle } from "lucide-react";

export default function TravelInsurance() {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [showClaim, setShowClaim] = useState<string | null>(null);
  const [form, setForm] = useState({ policy_type: "comprehensive", destination_country: "NG", trip_duration_days: "7", start_date: "", end_date: "", trip_cost: "500000" });
  const [claimForm, setClaimForm] = useState({ claim_type: "medical", amount_claimed: "", description: "" });

  const { data: quote } = trpc.travelInsurance.getQuote.useQuery(
    { policyType: form.policy_type, tripDurationDays: parseInt(form.trip_duration_days), destinationCountry: form.destination_country, tripCost: parseFloat(form.trip_cost) },
    { enabled: true }
  );

  const { data: policies, isLoading, refetch } = trpc.travelInsurance.listPolicies.useQuery(
    { touristId: user?.id ?? "" },
    { enabled: !!user?.id }
  );

  const { data: claims } = trpc.travelInsurance.listClaims.useQuery(
    { touristId: user?.id ?? "" },
    { enabled: !!user?.id }
  );

  const createMut = trpc.travelInsurance.createPolicy.useMutation({
    onSuccess: (d) => { toast.success("Policy Created", { description: d.message }); setShowCreate(false); refetch(); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const claimMut = trpc.travelInsurance.createClaim.useMutation({
    onSuccess: (d) => { toast.success("Claim Submitted", { description: d.message }); setShowClaim(null); refetch(); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const statusColor = (s: string) => ({ active: "bg-green-100 text-green-800", expired: "bg-gray-100 text-gray-800", cancelled: "bg-red-100 text-red-800" }[s] ?? "bg-gray-100 text-gray-800");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Travel Insurance</h1><p className="text-gray-500 mt-1">Protect your trip with embedded travel insurance</p></div>
        <Button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2"><Shield className="w-4 h-4" />Get Insured</Button>
      </div>

      {quote && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 grid grid-cols-3 gap-4">
            <div><p className="text-xs text-green-700">Premium</p><p className="text-xl font-bold text-green-900">USD {quote.premium_amount}</p></div>
            <div><p className="text-xs text-green-700">Coverage</p><p className="text-xl font-bold text-green-900">USD {Number(quote.coverage_amount).toLocaleString()}</p></div>
            <div><p className="text-xs text-green-700">Type</p><p className="text-xl font-bold text-green-900 capitalize">{quote.policy_type}</p></div>
          </CardContent>
        </Card>
      )}

      {showCreate && (
        <Card>
          <CardHeader><CardTitle>New Insurance Policy</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Policy Type</Label>
                <Select value={form.policy_type} onValueChange={v => setForm(f => ({...f, policy_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[["comprehensive","Comprehensive"],["medical","Medical Only"],["cancellation","Trip Cancellation"],["baggage","Baggage"]].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Destination</Label><Input value={form.destination_country} onChange={e => setForm(f => ({...f, destination_country: e.target.value}))} placeholder="NG" maxLength={2} /></div>
              <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e => setForm(f => ({...f, start_date: e.target.value}))} /></div>
              <div><Label>End Date</Label><Input type="date" value={form.end_date} onChange={e => setForm(f => ({...f, end_date: e.target.value}))} /></div>
              <div><Label>Duration (days)</Label><Input type="number" value={form.trip_duration_days} onChange={e => setForm(f => ({...f, trip_duration_days: e.target.value}))} /></div>
              <div><Label>Trip Cost (NGN)</Label><Input type="number" value={form.trip_cost} onChange={e => setForm(f => ({...f, trip_cost: e.target.value}))} /></div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createMut.mutate({ touristId: user?.id ?? "", ...form, tripDurationDays: parseInt(form.trip_duration_days), tripCost: parseFloat(form.trip_cost) })} disabled={createMut.isPending}>{createMut.isPending ? "Creating..." : "Purchase Policy"}</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="font-semibold">My Policies</h2>
        {isLoading ? <div className="h-20 bg-gray-100 rounded animate-pulse" /> : !policies?.length ? (
          <Card><CardContent className="py-8 text-center text-gray-500"><Shield className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No policies yet</p></CardContent></Card>
        ) : policies.map((p: any) => (
          <Card key={p.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div><p className="font-medium capitalize">{p.policy_type} Insurance</p><p className="text-sm text-gray-500">{p.policy_number} · {p.provider}</p></div>
                <div className="flex items-center gap-2">
                  <Badge className={statusColor(p.status)}>{p.status}</Badge>
                  {p.status === "active" && <Button size="sm" variant="outline" onClick={() => setShowClaim(p.id)}>File Claim</Button>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-gray-500">Coverage</p><p className="font-medium">USD {Number(p.coverage_amount).toLocaleString()}</p></div>
                <div><p className="text-gray-500">Premium</p><p className="font-medium">USD {p.premium_amount}</p></div>
                <div><p className="text-gray-500">Valid</p><p className="font-medium">{p.start_date} – {p.end_date}</p></div>
              </div>
              {showClaim === p.id && (
                <div className="mt-3 space-y-3 border-t pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Claim Type</Label>
                      <Select value={claimForm.claim_type} onValueChange={v => setClaimForm(f => ({...f, claim_type: v}))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{[["medical","Medical"],["cancellation","Cancellation"],["baggage","Baggage"],["delay","Flight Delay"]].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Amount (USD)</Label><Input type="number" value={claimForm.amount_claimed} onChange={e => setClaimForm(f => ({...f, amount_claimed: e.target.value}))} /></div>
                  </div>
                  <div><Label>Description</Label><Input value={claimForm.description} onChange={e => setClaimForm(f => ({...f, description: e.target.value}))} placeholder="Describe what happened..." /></div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => claimMut.mutate({ policyId: p.id, touristId: user?.id ?? "", claimType: claimForm.claim_type, amountClaimed: parseFloat(claimForm.amount_claimed), description: claimForm.description })} disabled={claimMut.isPending}>{claimMut.isPending ? "Submitting..." : "Submit Claim"}</Button>
                    <Button size="sm" variant="outline" onClick={() => setShowClaim(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
