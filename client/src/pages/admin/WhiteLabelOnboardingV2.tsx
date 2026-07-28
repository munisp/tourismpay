/**
 * J11 — White Label Tenant Onboarding
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, CheckCircle, Loader2 } from "lucide-react";

export default function WhiteLabelOnboardingV2() {
  const [form, setForm] = useState({ tenantName: "", tenantDomain: "", primaryColor: "#1a73e8", contactEmail: "", planType: "professional" as "starter" | "professional" | "enterprise" });
  const [result, setResult] = useState<any>(null);

  const createMut = trpc.journeyV2.startWhiteLabelOnboarding.useMutation({
    onSuccess: (d) => { toast.success("Tenant Onboarded!", { description: d.message }); setResult(d); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">White Label Tenant Onboarding</h1><p className="text-gray-500 mt-1">Onboard a new white label partner tenant</p></div>
        <Building2 className="w-8 h-8 text-blue-600" />
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Tenant Onboarded!</p>
              <p className="text-sm text-green-700">Tenant ID: {result.tenantId}</p>
              <p className="text-sm text-green-700">Wallet: {result.walletId}</p>
              <p className="text-sm text-green-700">TB Account: {result.tbAccountId}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5" />Tenant Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Tenant Name *</Label><Input value={form.tenantName} onChange={e => setForm(f => ({...f, tenantName: e.target.value}))} placeholder="Eko Hotels Pay" /></div>
            <div><Label>Domain *</Label><Input value={form.tenantDomain} onChange={e => setForm(f => ({...f, tenantDomain: e.target.value}))} placeholder="pay.ekohotels.com" /></div>
            <div><Label>Contact Email *</Label><Input type="email" value={form.contactEmail} onChange={e => setForm(f => ({...f, contactEmail: e.target.value}))} placeholder="admin@ekohotels.com" /></div>
            <div><Label>Primary Color</Label><div className="flex gap-2 items-center"><Input type="color" value={form.primaryColor} onChange={e => setForm(f => ({...f, primaryColor: e.target.value}))} className="w-12 h-10 p-1" /><Input value={form.primaryColor} onChange={e => setForm(f => ({...f, primaryColor: e.target.value}))} placeholder="#1a73e8" /></div></div>
            <div className="md:col-span-2">
              <Label>Plan Type</Label>
              <Select value={form.planType} onValueChange={v => setForm(f => ({...f, planType: v as any}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter (1% commission)</SelectItem>
                  <SelectItem value="professional">Professional (1.5% commission)</SelectItem>
                  <SelectItem value="enterprise">Enterprise (2% commission)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={() => createMut.mutate(form)} disabled={createMut.isPending || !form.tenantName || !form.tenantDomain || !form.contactEmail} className="w-full">
            {createMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Onboarding...</> : "Onboard Tenant"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
