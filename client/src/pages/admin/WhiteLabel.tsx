import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Globe, Key, Plus, Settings, RefreshCw } from "lucide-react";

export default function WhiteLabel() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", country: "NG", primary_color: "#1a56db", logo_url: "", contact_email: "", plan: "starter" });

  const { data: tenants, isLoading, refetch } = trpc.whiteLabel.listTenants.useQuery({ status: "active" });

  const createMut = trpc.whiteLabel.createTenant.useMutation({
    onSuccess: (d) => { toast.success("Tenant Created", { description: `API Key: ${d.api_key.substring(0, 20)}...` }); setShowCreate(false); refetch(); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const rotateKeyMut = trpc.whiteLabel.rotateApiKey.useMutation({
    onSuccess: (d) => toast.success("API Key Rotated", { description: `New key: ${d.api_key.substring(0, 20)}...` }),
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const planColor = (p: string) => ({ enterprise: "bg-purple-100 text-purple-800", professional: "bg-blue-100 text-blue-800", starter: "bg-gray-100 text-gray-800" }[p] ?? "bg-gray-100 text-gray-800");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">White-Label Platform</h1><p className="text-gray-500 mt-1">Manage white-label tenants for pan-African expansion</p></div>
        <Button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2"><Plus className="w-4 h-4" />New Tenant</Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle>Create White-Label Tenant</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Organisation Name</Label><Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Rwanda Tourism Board" /></div>
              <div><Label>Slug (URL)</Label><Input value={form.slug} onChange={e => setForm(f => ({...f, slug: e.target.value}))} placeholder="rwanda-tourism" /></div>
              <div><Label>Country</Label>
                <Select value={form.country} onValueChange={v => setForm(f => ({...f, country: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[["NG","Nigeria"],["GH","Ghana"],["KE","Kenya"],["RW","Rwanda"],["TZ","Tanzania"],["ZA","South Africa"],["ET","Ethiopia"]].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Plan</Label>
                <Select value={form.plan} onValueChange={v => setForm(f => ({...f, plan: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[["starter","Starter"],["professional","Professional"],["enterprise","Enterprise"]].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Primary Color</Label><Input type="color" value={form.primary_color} onChange={e => setForm(f => ({...f, primary_color: e.target.value}))} /></div>
              <div><Label>Contact Email</Label><Input type="email" value={form.contact_email} onChange={e => setForm(f => ({...f, contact_email: e.target.value}))} /></div>
              <div className="col-span-2"><Label>Logo URL</Label><Input value={form.logo_url} onChange={e => setForm(f => ({...f, logo_url: e.target.value}))} placeholder="https://..." /></div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createMut.mutate(form)} disabled={createMut.isPending}>{createMut.isPending ? "Creating..." : "Create Tenant"}</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : !tenants?.length ? (
        <Card><CardContent className="py-12 text-center text-gray-500"><Globe className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No white-label tenants yet</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {tenants.map((t: any) => (
            <Card key={t.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{backgroundColor: t.primary_color || "#1a56db"}}><Globe className="w-5 h-5 text-white" /></div>
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-sm text-gray-500">{t.slug} · {t.country}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={planColor(t.plan)}>{t.plan}</Badge>
                  <Button size="sm" variant="outline" onClick={() => rotateKeyMut.mutate({ tenantId: t.id })} disabled={rotateKeyMut.isPending} className="flex items-center gap-1"><Key className="w-3 h-3" />Rotate Key</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
