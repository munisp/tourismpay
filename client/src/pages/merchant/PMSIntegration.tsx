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
import { Server, Plug, RefreshCw, CheckCircle, XCircle } from "lucide-react";

export default function PMSIntegration() {
  const { user } = useAuth();
  const [showConnect, setShowConnect] = useState(false);
  const [form, setForm] = useState({ pms_type: "opera", api_endpoint: "", api_key: "", hotel_id: "" });

  const { data: connections, isLoading, refetch } = trpc.pmsIntegration.listConnections.useQuery(
    { merchantId: user?.id ?? "" },
    { enabled: !!user?.id }
  );

  const { data: charges } = trpc.pmsIntegration.listFolioCharges.useQuery(
    { merchantId: user?.id ?? "", limit: 10 },
    { enabled: !!user?.id }
  );

  const connectMut = trpc.pmsIntegration.upsertConnection.useMutation({
    onSuccess: (d) => { toast.success("PMS Connected", { description: d.message }); setShowConnect(false); refetch(); },
    onError: (e) => toast.error("Connection failed", { description: e.message }),
  });

  const syncMut = trpc.pmsIntegration.connectionHealth.useMutation({
    onSuccess: (d) => { toast.success("Sync complete", { description: `${d.synced} reservations synced` }); refetch(); },
    onError: (e) => toast.error("Sync failed", { description: e.message }),
  });

  const statusColor = (s: string) => s === "active" ? "bg-green-100 text-green-800" : s === "error" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">PMS Integration</h1><p className="text-gray-500 mt-1">Connect your Property Management System for seamless payment sync</p></div>
        <Button onClick={() => setShowConnect(!showConnect)} className="flex items-center gap-2"><Plug className="w-4 h-4" />Connect PMS</Button>
      </div>

      {showConnect && (
        <Card>
          <CardHeader><CardTitle>Connect Property Management System</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>PMS Type</Label>
                <Select value={form.pms_type} onValueChange={v => setForm(f => ({...f, pms_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[["opera","Oracle Opera"],["cloudbeds","Cloudbeds"],["mews","Mews"],["protel","Protel"],["roomkey","RoomKey"]].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Hotel ID</Label><Input value={form.hotel_id} onChange={e => setForm(f => ({...f, hotel_id: e.target.value}))} placeholder="hotel_123" /></div>
              <div><Label>API Endpoint</Label><Input value={form.api_endpoint} onChange={e => setForm(f => ({...f, api_endpoint: e.target.value}))} placeholder="https://api.yourpms.com/v1" /></div>
              <div><Label>API Key</Label><Input type="password" value={form.api_key} onChange={e => setForm(f => ({...f, api_key: e.target.value}))} placeholder="sk_live_..." /></div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => connectMut.mutate({ merchantId: user?.id ?? "", ...form })} disabled={connectMut.isPending}>{connectMut.isPending ? "Connecting..." : "Connect"}</Button>
              <Button variant="outline" onClick={() => setShowConnect(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="font-semibold">Connected Systems</h2>
        {isLoading ? <div className="h-20 bg-gray-100 rounded animate-pulse" /> : !connections?.length ? (
          <Card><CardContent className="py-8 text-center text-gray-500"><Server className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No PMS connected yet</p></CardContent></Card>
        ) : connections.map((c: any) => (
          <Card key={c.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Server className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="font-medium capitalize">{c.pms_type} — {c.hotel_id}</p>
                  <p className="text-sm text-gray-500">{c.api_endpoint}</p>
                  {c.last_synced_at && <p className="text-xs text-gray-400">Last sync: {new Date(c.last_synced_at).toLocaleString()}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={statusColor(c.status)}>{c.status}</Badge>
                <Button size="sm" variant="outline" onClick={() => syncMut.mutate({ connectionId: c.id })} disabled={syncMut.isPending}><RefreshCw className="w-3 h-3 mr-1" />Sync</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {charges && charges.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Recent Folio Charges</h2>
          {charges.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
              <div><p className="font-medium">Room {c.room_number} — {c.charge_type}</p><p className="text-gray-500">{c.guest_name} · {new Date(c.created_at).toLocaleDateString()}</p></div>
              <div className="text-right"><p className="font-medium">{c.currency} {Number(c.amount).toLocaleString()}</p><Badge className={c.status === "settled" ? "bg-green-100 text-green-800 text-xs" : "bg-yellow-100 text-yellow-800 text-xs"}>{c.status}</Badge></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
