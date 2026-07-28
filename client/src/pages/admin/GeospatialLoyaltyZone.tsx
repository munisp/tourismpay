/**
 * J10 — Geospatial Loyalty Zone Activation
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MapPin, Star, CheckCircle, Loader2 } from "lucide-react";

export default function GeospatialLoyaltyZone() {
  const [form, setForm] = useState({ zoneName: "", city: "", centerLat: "6.5244", centerLng: "3.3792", radiusMetres: "5000", bonusMultiplier: "2.0", minSpendNgn: "0" });
  const [result, setResult] = useState<any>(null);
  const zones = trpc.journeyV2.getGeospatialZones.useQuery({ city: form.city || undefined });
  const createMut = trpc.journeyV2.startGeospatialLoyaltyZone.useMutation({
    onSuccess: (d) => { toast.success("Zone Created!", { description: d.message }); setResult(d); zones.refetch(); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });
  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Geospatial Loyalty Zones</h1><p className="text-gray-500 mt-1">Create location-based loyalty bonus zones</p></div>
        <MapPin className="w-8 h-8 text-red-600" />
      </div>
      {result && (<Card className="border-green-200 bg-green-50"><CardContent className="p-4 flex gap-3"><CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" /><div><p className="font-semibold text-green-900">Zone Created!</p><p className="text-sm text-green-700">Zone ID: {result.zoneId} · {result.affectedEstablishments} establishments</p></div></CardContent></Card>)}
      <Card>
        <CardHeader><CardTitle>New Loyalty Zone</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Zone Name *</Label><Input value={form.zoneName} onChange={e => setForm(f => ({...f, zoneName: e.target.value}))} placeholder="VI Premium Zone" /></div>
            <div><Label>City *</Label><Input value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} placeholder="Lagos" /></div>
            <div><Label>Center Lat</Label><Input type="number" step="0.0001" value={form.centerLat} onChange={e => setForm(f => ({...f, centerLat: e.target.value}))} /></div>
            <div><Label>Center Lng</Label><Input type="number" step="0.0001" value={form.centerLng} onChange={e => setForm(f => ({...f, centerLng: e.target.value}))} /></div>
            <div><Label>Radius (m)</Label><Input type="number" value={form.radiusMetres} onChange={e => setForm(f => ({...f, radiusMetres: e.target.value}))} /></div>
            <div><Label>Bonus Multiplier</Label><Input type="number" step="0.1" value={form.bonusMultiplier} onChange={e => setForm(f => ({...f, bonusMultiplier: e.target.value}))} /></div>
          </div>
          <Button onClick={() => createMut.mutate({ zoneName: form.zoneName, city: form.city, centerLat: parseFloat(form.centerLat), centerLng: parseFloat(form.centerLng), radiusMetres: parseInt(form.radiusMetres), bonusMultiplier: parseFloat(form.bonusMultiplier), minSpendNgn: 0 })} disabled={createMut.isPending || !form.zoneName || !form.city} className="w-full">
            {createMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : "Create Loyalty Zone"}
          </Button>
        </CardContent>
      </Card>
      <div>
        <h2 className="text-lg font-semibold mb-3">Active Zones</h2>
        {(zones.data as any[] ?? []).map((z: any) => (
          <Card key={z.id} className="mb-2"><CardContent className="p-3 flex justify-between items-center">
            <div><p className="font-medium">{z.name}</p><p className="text-sm text-gray-500">{z.city} · {z.radius_metres}m</p></div>
            <Badge className="bg-purple-100 text-purple-800"><Star className="w-3 h-3 mr-1" />{z.loyalty_multiplier}x</Badge>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
