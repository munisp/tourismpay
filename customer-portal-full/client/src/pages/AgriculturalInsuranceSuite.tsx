import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';

const fallbackProducts = [
  { id: 'PROD-RAIN-001', name: 'ClimaCash RainCash', type: 'climacash_rain', trigger: 'Rainfall > 255mm/week', payout: 50000, premium: 2500, icon: '🌧️', regions: ['North-Central', 'South-West', 'South-South'], season: 'rainy', status: 'Active', policiesIssued: 1245, totalPayouts: 15600000 },
  { id: 'PROD-DROUGHT-001', name: 'ClimaCash DroughtCash', type: 'climacash_drought', trigger: 'Rainfall < 20mm/month', payout: 75000, premium: 3500, icon: '☀️', regions: ['North-West', 'North-East'], season: 'dry', status: 'Active', policiesIssued: 890, totalPayouts: 22500000 },
  { id: 'PROD-FLOOD-001', name: 'ClimaCash FloodCash', type: 'climacash_flood', trigger: 'Rainfall > 380mm/week', payout: 100000, premium: 5000, icon: '🌊', regions: ['South-South', 'South-East'], season: 'rainy', status: 'Active', policiesIssued: 567, totalPayouts: 18900000 },
  { id: 'PROD-HEAT-001', name: 'ClimaCash HeatCash', type: 'climacash_heat', trigger: 'Temp > 42°C', payout: 40000, premium: 2000, icon: '🔥', regions: ['North-East', 'North-West'], season: 'dry', status: 'Active', policiesIssued: 432, totalPayouts: 8640000 },
  { id: 'PROD-WICI-001', name: 'Weather Index Crop Insurance', type: 'weather_index_crop', trigger: 'Multi-index', payout: 85000, premium: 4200, icon: '🌿', regions: ['All zones'], season: 'all', status: 'Active', policiesIssued: 2100, totalPayouts: 42000000 },
  { id: 'PROD-IBLI-001', name: 'Index-Based Livestock (IBLI)', type: 'livestock_index', trigger: 'NDVI Satellite', payout: 120000, premium: 6000, icon: '🐄', regions: ['North-Central', 'North-West'], season: 'all', status: 'Active', policiesIssued: 1560, totalPayouts: 37440000 },
  { id: 'PROD-IBLT-001', name: 'Takaful IBLT (Livestock)', type: 'livestock_takaful', trigger: 'NDVI Satellite', payout: 120000, premium: 5500, icon: '🕌', regions: ['North-West', 'North-East'], season: 'all', status: 'Active', policiesIssued: 780, totalPayouts: 18720000 },
  { id: 'PROD-FERT-001', name: 'Fertiliser-Bundled Insurance', type: 'fertiliser_bundled', trigger: 'Bundled', payout: 7000, premium: 500, icon: '🧪', regions: ['All zones'], season: 'planting', status: 'Active', policiesIssued: 5400, totalPayouts: 10800000 },
  { id: 'PROD-AYI-001', name: 'Area Yield Index', type: 'area_yield_index', trigger: 'Area Yield', payout: 95000, premium: 4800, icon: '📊', regions: ['North-Central'], season: 'harvest', status: 'Active', policiesIssued: 650, totalPayouts: 15600000 },
  { id: 'PROD-AQUA-001', name: 'Aquaculture & Fisheries', type: 'aquaculture', trigger: 'Marine Data', payout: 80000, premium: 4000, icon: '🐟', regions: ['South-South', 'South-West'], season: 'all', status: 'Active', policiesIssued: 340, totalPayouts: 6800000 },
  { id: 'PROD-MPCI-001', name: 'Multi-Peril Crop Insurance', type: 'multi_peril_crop', trigger: 'Hybrid', payout: 150000, premium: 7500, icon: '🛡️', regions: ['All zones'], season: 'all', status: 'Active', policiesIssued: 1800, totalPayouts: 54000000 },
  { id: 'PROD-PAST-001', name: 'Pastoral Migration Route', type: 'pastoral_route', trigger: 'GPS + NDVI', payout: 60000, premium: 3000, icon: '🐪', regions: ['North-East', 'North-Central'], season: 'migration', status: 'Active', policiesIssued: 290, totalPayouts: 4350000 },
  { id: 'PROD-CARB-001', name: 'Carbon Credit Insurance', type: 'carbon_credit', trigger: 'Carbon Flux', payout: 200000, premium: 10000, icon: '🌍', regions: ['All zones'], season: 'all', status: 'Active', policiesIssued: 120, totalPayouts: 4800000 },
];

const fallbackTriggers = [
  { id: 'TRG-001', type: 'Flood', region: 'South-South', measured: '400mm', threshold: '380mm', result: 'TRIGGERED', affectedPolicies: 45, payoutAmount: 4500000 },
  { id: 'TRG-002', type: 'Drought', region: 'North-East', measured: '10mm', threshold: '20mm', result: 'TRIGGERED', affectedPolicies: 120, payoutAmount: 9000000 },
  { id: 'TRG-003', type: 'Heat', region: 'North-West', measured: '38°C', threshold: '42°C', result: 'NORMAL', affectedPolicies: 0, payoutAmount: 0 },
];

const fallbackNdvi = [
  { id: 'NDVI-001', region: 'North-Central', value: 0.15, condition: 'Severe Drought', percentile: 15, satellite: 'Sentinel-2' },
  { id: 'NDVI-002', region: 'South-West', value: 0.45, condition: 'Below Normal', percentile: 45, satellite: 'Sentinel-2' },
  { id: 'NDVI-003', region: 'South-South', value: 0.72, condition: 'Above Normal', percentile: 72, satellite: 'Sentinel-2' },
];

export default function AgriculturalInsuranceSuite() {
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const { data: productsData, isLoading: productsLoading } = trpc.agriculturalInsurance.products.useQuery(undefined, { retry: false });
  const { data: triggersData } = trpc.agriculturalInsurance.triggerEvents.useQuery(undefined, { retry: false });
  const { data: ndviData } = trpc.agriculturalInsurance.ndviReadings.useQuery(undefined, { retry: false });
  const purchaseMutation = trpc.agriculturalInsurance.purchase.useMutation();
  const products = productsData ?? fallbackProducts;
  const triggerEvents = triggersData ?? fallbackTriggers;
  const ndviReadings = ndviData ?? fallbackNdvi;
  const totalPolicies = products.reduce((s: number, p: any) => s + (p.policiesIssued || 0), 0);
  const totalPayouts = products.reduce((s: number, p: any) => s + (p.totalPayouts || 0), 0);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">🌾 Climate & Agricultural Insurance</h1>
          <p className="text-muted-foreground mt-1">{products.length} parametric insurance products with automatic trigger-based payouts</p>
        </div>
        {productsLoading && <Badge variant="outline">Loading...</Badge>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 text-center"><div className="text-3xl font-bold text-emerald-500">{products.length}</div><div className="text-sm text-muted-foreground">Products</div></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><div className="text-3xl font-bold text-cyan-500">{totalPolicies.toLocaleString()}</div><div className="text-sm text-muted-foreground">Policies Issued</div></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><div className="text-3xl font-bold text-amber-500">₦{(totalPayouts / 1000000).toFixed(0)}M</div><div className="text-sm text-muted-foreground">Total Payouts</div></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><div className="text-3xl font-bold text-violet-500">{triggerEvents.filter((t: any) => t.result === 'TRIGGERED').length}</div><div className="text-sm text-muted-foreground">Active Triggers</div></CardContent></Card>
      </div>
      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Products ({products.length})</TabsTrigger>
          <TabsTrigger value="triggers">Live Triggers</TabsTrigger>
          <TabsTrigger value="ndvi">NDVI Monitor</TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p: any) => (
              <Card key={p.id} className={`cursor-pointer transition-all hover:shadow-lg ${selectedProduct === p.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedProduct(p.id)}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><span className="text-2xl">{p.icon}</span>{p.name}</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Trigger</span><Badge variant="outline">{p.trigger}</Badge></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Payout</span><span className="font-semibold text-emerald-600">₦{p.payout.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Premium</span><span className="font-semibold text-amber-600">₦{p.premium.toLocaleString()}/season</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Policies</span><span className="font-semibold">{(p.policiesIssued || 0).toLocaleString()}</span></div>
                    <div className="flex flex-wrap gap-1 mt-2">{(p.regions || []).map((r: string) => (<Badge key={r} variant="secondary" className="text-xs">{r}</Badge>))}</div>
                    <Button size="sm" className="w-full mt-2" variant="outline" onClick={(e) => { e.stopPropagation(); purchaseMutation.mutate({ productId: p.id, farmSize: 5, location: (p.regions || [])[0] || 'North-Central' }); }}>Purchase Policy</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="triggers" className="mt-4">
          <Card><CardHeader><CardTitle>Live Trigger Events</CardTitle></CardHeader><CardContent>
            <div className="space-y-4">
              {triggerEvents.map((t: any, i: number) => (
                <div key={t.id || i} className="flex items-center justify-between p-4 rounded-lg border">
                  <div>
                    <div className="font-semibold">{t.type} Trigger — {t.region}</div>
                    <div className="text-sm text-muted-foreground">Measured: {t.measured} | Threshold: {t.threshold}</div>
                    {(t.affectedPolicies || 0) > 0 && <div className="text-sm text-red-600">{t.affectedPolicies} policies affected | Payout: ₦{(t.payoutAmount || 0).toLocaleString()}</div>}
                  </div>
                  <Badge variant={t.result === 'TRIGGERED' ? 'destructive' : 'secondary'}>{t.result}</Badge>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="ndvi" className="mt-4">
          <Card><CardHeader><CardTitle>NDVI Vegetation Index Monitor</CardTitle></CardHeader><CardContent>
            <div className="space-y-4">
              {ndviReadings.map((n: any, i: number) => (
                <div key={n.id || i} className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">{n.region}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{n.satellite}</Badge>
                      <span className={`font-bold ${n.percentile < 30 ? 'text-red-500' : n.percentile < 50 ? 'text-yellow-500' : 'text-green-500'}`}>{n.condition}</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div className={`h-3 rounded-full ${n.percentile < 30 ? 'bg-red-500' : n.percentile < 50 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${n.percentile}%` }}></div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>NDVI: {n.value}</span><span>Percentile: {n.percentile}%</span></div>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
