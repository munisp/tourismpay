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
  const [form, setForm] = useState({ productId: "standard", destination: "NG", travelDays: "7", travelStartDate: "", tripCostUsd: "500" });
  const [claimForm, setClaimForm] = useState({ claimType: "medical" as "cancellation"|"medical"|"baggage"|"delay"|"liability", incidentDate: "", description: "" });

  const { data: products } = trpc.travelInsurance.getProducts.useQuery();

  const { data: quote } = trpc.travelInsurance.getQuote.useQuery(
    { productId: form.productId as "basic"|"standard"|"premium", tripCostUsd: parseFloat(form.tripCostUsd) || 500, travelDays: parseInt(form.travelDays) || 7, travellers: 1 },
    { enabled: true }
  );

  const { data: policies, isLoading, refetch } = trpc.travelInsurance.myPolicies.useQuery(
    undefined,
    { enabled: !!user?.id }
  );

  const createMut = trpc.travelInsurance.purchasePolicy.useMutation({
    onSuccess: (d) => { toast.success("Policy Created", { description: `Policy ${d.policyId} active` }); setShowCreate(false); refetch(); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const claimMut = trpc.travelInsurance.fileClaim.useMutation({
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
            <div><p className="text-xs text-green-700">Premium</p><p className="text-xl font-bold text-green-900">USD {quote.totalPremiumUsd}</p></div>
            <div><p className="text-xs text-green-700">Coverage</p><p className="text-xl font-bold text-green-900">USD {Number(quote.coverageUsd).toLocaleString()}</p></div>
            <div><p className="text-xs text-green-700">Type</p><p className="text-xl font-bold text-green-900 capitalize">{form.productId}</p></div>
          </CardContent>
        </Card>
      )}

      {showCreate && (
        <Card>
          <CardHeader><CardTitle>New Insurance Policy</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Policy Type</Label>
                <Select value={form.productId} onValueChange={v => setForm(f => ({...f, productId: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[["basic","Basic Trip Protection"],["standard","Standard Coverage"],["premium","Premium Protection"]].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Destination</Label><Input value={form.destination} onChange={e => setForm(f => ({...f, destination: e.target.value}))} placeholder="NG" /></div>
              <div><Label>Travel Start Date</Label><Input type="date" value={form.travelStartDate} onChange={e => setForm(f => ({...f, travelStartDate: e.target.value}))} /></div>
              <div><Label>Duration (days)</Label><Input type="number" value={form.travelDays} onChange={e => setForm(f => ({...f, travelDays: e.target.value}))} /></div>
              <div><Label>Trip Cost (USD)</Label><Input type="number" value={form.tripCostUsd} onChange={e => setForm(f => ({...f, tripCostUsd: e.target.value}))} /></div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createMut.mutate({ productId: form.productId as "basic"|"standard"|"premium", tripCostUsd: parseFloat(form.tripCostUsd), travelDays: parseInt(form.travelDays), travellers: 1, totalPremiumUsd: quote?.totalPremiumUsd ?? 0, travelStartDate: form.travelStartDate, destination: form.destination })} disabled={createMut.isPending}>{createMut.isPending ? "Creating..." : "Purchase Policy"}</Button>
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
                <div><p className="font-medium capitalize">{p.productId} Insurance</p><p className="text-sm text-gray-500">{p.policyNumber}</p></div>
                <div className="flex items-center gap-2">
                  <Badge className={statusColor(p.status)}>{p.status}</Badge>
                  {p.status === "active" && <Button size="sm" variant="outline" onClick={() => setShowClaim(p.id)}>File Claim</Button>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-gray-500">Coverage</p><p className="font-medium">USD {Number(p.coverageUsd).toLocaleString()}</p></div>
                <div><p className="text-gray-500">Premium</p><p className="font-medium">USD {p.premiumPaid}</p></div>
                <div><p className="text-gray-500">Destination</p><p className="font-medium">{p.destination}</p></div>
              </div>
              {showClaim === p.id && (
                <div className="mt-3 space-y-3 border-t pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Claim Type</Label>
                      <Select value={claimForm.claimType} onValueChange={v => setClaimForm(f => ({...f, claimType: v as any}))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{[["medical","Medical"],["cancellation","Cancellation"],["baggage","Baggage"],["delay","Flight Delay"],["liability","Liability"]].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Incident Date</Label><Input type="date" value={claimForm.incidentDate} onChange={e => setClaimForm(f => ({...f, incidentDate: e.target.value}))} /></div>
                  </div>
                  <div><Label>Description</Label><Input value={claimForm.description} onChange={e => setClaimForm(f => ({...f, description: e.target.value}))} placeholder="Describe what happened..." /></div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => claimMut.mutate({ policyId: p.id, claimType: claimForm.claimType, incidentDate: claimForm.incidentDate, description: claimForm.description, claimAmountUsd: 0 })} disabled={claimMut.isPending}>{claimMut.isPending ? "Submitting..." : "Submit Claim"}</Button>
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
