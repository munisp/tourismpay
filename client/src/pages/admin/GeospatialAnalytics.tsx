import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MapPin, Navigation, Layers, Search } from "lucide-react";

export default function GeospatialAnalytics() {
  const [coords, setCoords] = useState({ lat: "6.5244", lng: "3.3792", radius: "5000" });

  const { data: nearby, isLoading, refetch } = trpc.geospatialAnalytics.getNearbyEstablishments.useQuery(
    { lat: parseFloat(coords.lat), lng: parseFloat(coords.lng), radiusMeters: parseInt(coords.radius) },
    { enabled: true }
  );

  const { data: heatmap } = trpc.geospatialAnalytics.getTransactionHeatmap.useQuery(
    { lat: parseFloat(coords.lat), lng: parseFloat(coords.lng), radiusMeters: parseInt(coords.radius) },
    { enabled: true }
  );

  const { data: zones } = trpc.geospatialAnalytics.getLoyaltyZones.useQuery(
    { lat: parseFloat(coords.lat), lng: parseFloat(coords.lng) },
    { enabled: true }
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Geospatial Analytics</h1>
        <p className="text-gray-500 mt-1">Location-based tourism intelligence powered by Apache Sedona</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Navigation className="w-5 h-5" />Location Search</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>Latitude</Label><Input value={coords.lat} onChange={e => setCoords(c => ({...c, lat: e.target.value}))} placeholder="6.5244" /></div>
            <div><Label>Longitude</Label><Input value={coords.lng} onChange={e => setCoords(c => ({...c, lng: e.target.value}))} placeholder="3.3792" /></div>
            <div><Label>Radius (metres)</Label><Input value={coords.radius} onChange={e => setCoords(c => ({...c, radius: e.target.value}))} placeholder="5000" /></div>
          </div>
          <Button className="mt-3 flex items-center gap-2" onClick={() => refetch()}><Search className="w-4 h-4" />Search Area</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{nearby?.total ?? 0}</p><p className="text-sm text-gray-500">Nearby Establishments</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{heatmap?.total_transactions ?? 0}</p><p className="text-sm text-gray-500">Transactions in Area</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{zones?.length ?? 0}</p><p className="text-sm text-gray-500">Active Loyalty Zones</p></CardContent></Card>
      </div>

      {nearby?.establishments?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="w-5 h-5" />Nearby Establishments</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {nearby.establishments.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div><p className="font-medium">{e.name}</p><p className="text-sm text-gray-500 capitalize">{e.category} · {e.distance_m}m away</p></div>
                  <div className="text-right text-sm"><p className="font-medium">⭐ {e.rating ?? "N/A"}</p>{e.accepts_qr_pay && <p className="text-green-600 text-xs">QR Pay ✓</p>}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {zones?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="w-5 h-5" />Loyalty Zones</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {zones.map((z: any) => (
                <div key={z.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div><p className="font-medium">{z.name}</p><p className="text-sm text-gray-500">{z.radius_meters}m radius</p></div>
                  <p className="font-bold text-blue-700">{z.loyalty_multiplier}x points</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
