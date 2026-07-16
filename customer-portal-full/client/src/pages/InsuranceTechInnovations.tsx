import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';

const fallbackFeatures = [
  { id: 'AI-PRICE', name: 'AI Dynamic Pricing Engine', icon: '🧠', description: 'Multi-factor premium adjustment: driving score, claims history, mileage, vehicle age, region. Real-time pricing updates.', tags: ['AI/ML', '5 Factors', 'Real-time'], status: 'Active', usageCount: 45000 },
  { id: 'SAT-CLAIM', name: 'Instant Satellite Claims', icon: '🛰️', description: 'Satellite-verified damage assessment with AI confidence scoring — auto-approve claims above 85% confidence in 250ms.', tags: ['Satellite', 'Auto-approve', '250ms'], status: 'Active', usageCount: 12000 },
  { id: 'GAME', name: 'Gamification Engine', icon: '🎮', description: 'Points-based rewards for safe behavior — bronze/silver/gold levels with premium discounts up to 20%.', tags: ['Points', '3 Levels', 'Up to 20% off'], status: 'Active', usageCount: 32000 },
  { id: 'P2P', name: 'P2P Insurance Pools', icon: '🤝', description: 'Peer-to-peer mutual groups — Lagos Drivers (150), Ikoyi Neighbours (45), Tech Workers (200). Up to 42% giveback.', tags: ['P2P', '3 Pools', 'Up to 42% giveback'], status: 'Active', usageCount: 8500 },
  { id: 'BUILDER', name: 'Multi-Peril Product Builder', icon: '🔧', description: 'No-code platform to create custom insurance products — select perils, triggers, payout rules, distribution. Launch in 3 days.', tags: ['No-code', 'Custom Perils', '3-day launch'], status: 'Active', usageCount: 1200 },
];

const fallbackPricing = [
  { profile: 'Safe Driver', base: 50000, adjusted: 25000, factors: ['Safe driving score', 'No Claims Discount', 'Low mileage'], discount: -50 },
  { profile: 'Risky Driver', base: 50000, adjusted: 87500, factors: ['Poor driving score', 'Multiple claims', 'High mileage', 'Old vehicle'], discount: 75 },
  { profile: 'New Driver', base: 50000, adjusted: 60000, factors: ['No history', 'Average mileage'], discount: 20 },
];

const fallbackP2PPools = [
  { name: 'Lagos Drivers', members: 150, premium: 5000, poolBalance: 750000, claimsPaid: 200000, giveback: 42 },
  { name: 'Ikoyi Neighbours', members: 45, premium: 8000, poolBalance: 360000, claimsPaid: 50000, giveback: 38 },
  { name: 'Tech Workers', members: 200, premium: 3000, poolBalance: 600000, claimsPaid: 120000, giveback: 35 },
];

const fallbackGamification = [
  { level: 'Bronze', points: '0-200', discount: '5%', color: 'text-amber-700 bg-amber-100' },
  { level: 'Silver', points: '201-500', discount: '10%', color: 'text-gray-600 bg-gray-100' },
  { level: 'Gold', points: '501+', discount: '20%', color: 'text-yellow-600 bg-yellow-100' },
];

export default function InsuranceTechInnovations() {
  const { data: featuresData, isLoading } = trpc.techInnovations.features.useQuery(undefined, { retry: false });
  const { data: pricingData } = trpc.techInnovations.pricingComparison.useQuery(undefined, { retry: false });
  const { data: p2pData } = trpc.techInnovations.p2pPools.useQuery(undefined, { retry: false });
  const { data: gamificationData } = trpc.techInnovations.gamificationLevels.useQuery(undefined, { retry: false });
  const calculatePriceMutation = trpc.techInnovations.calculatePrice.useMutation();
  const features = featuresData ?? fallbackFeatures;
  const pricingComparison = pricingData ?? fallbackPricing;
  const p2pPools = p2pData ?? fallbackP2PPools;
  const gamificationLevels = gamificationData ?? fallbackGamification;

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">🤖 Insurance Tech Innovations</h1>
          <p className="text-muted-foreground mt-1">AI pricing, satellite claims, gamification, P2P pools, and no-code product builder</p>
        </div>
        {isLoading && <Badge variant="outline">Loading...</Badge>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {features.map((f: any) => (
          <Card key={f.id}><CardContent className="pt-6 text-center"><div className="text-3xl mb-1">{f.icon}</div><div className="text-xs font-semibold">{f.name}</div>{f.usageCount && <div className="text-xs text-muted-foreground mt-1">{(f.usageCount || 0).toLocaleString()} uses</div>}</CardContent></Card>
        ))}
      </div>
      <Tabs defaultValue="features">
        <TabsList>
          <TabsTrigger value="features">Features ({features.length})</TabsTrigger>
          <TabsTrigger value="pricing">AI Pricing Demo</TabsTrigger>
          <TabsTrigger value="p2p">P2P Pools</TabsTrigger>
          <TabsTrigger value="gamification">Gamification</TabsTrigger>
        </TabsList>
        <TabsContent value="features" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f: any) => (
              <Card key={f.id} className="hover:shadow-lg transition-all">
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><span className="text-2xl">{f.icon}</span>{f.name}</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">{f.description}</p>
                  <div className="flex flex-wrap gap-1">{(f.tags || []).map((t: string) => (<Badge key={t} variant="outline" className="text-xs">{t}</Badge>))}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="pricing" className="mt-4">
          <Card><CardHeader><CardTitle>AI Dynamic Pricing — Comparison</CardTitle></CardHeader><CardContent>
            <div className="space-y-4">
              {pricingComparison.map((p: any, i: number) => (
                <div key={i} className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-3"><span className="font-bold text-lg">{p.profile}</span><Badge variant={p.discount < 0 ? 'default' : 'destructive'}>{p.discount > 0 ? '+' : ''}{p.discount}%</Badge></div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Base Premium</span><div className="font-bold">₦{(p.base || 0).toLocaleString()}</div></div>
                    <div><span className="text-muted-foreground">Adjusted</span><div className={`font-bold ${p.discount < 0 ? 'text-emerald-600' : 'text-red-600'}`}>₦{(p.adjusted || 0).toLocaleString()}</div></div>
                    <div><span className="text-muted-foreground">Saving/Surcharge</span><div className={`font-bold ${p.discount < 0 ? 'text-emerald-600' : 'text-red-600'}`}>₦{Math.abs((p.adjusted || 0) - (p.base || 0)).toLocaleString()}</div></div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">{(p.factors || []).map((f: string) => (<Badge key={f} variant="secondary" className="text-xs">{f}</Badge>))}</div>
                </div>
              ))}
            </div>
            <div className="mt-4"><Button variant="outline" onClick={() => calculatePriceMutation.mutate({ basePremium: 50000, drivingScore: 85, claimsHistory: 0, mileage: 12000 })}>Calculate My Price</Button></div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="p2p" className="mt-4">
          <Card><CardHeader><CardTitle>P2P Insurance Pools</CardTitle></CardHeader><CardContent>
            <div className="space-y-4">
              {p2pPools.map((pool: any, i: number) => (
                <div key={i} className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2"><span className="font-bold">{pool.name}</span><Badge variant="outline">{pool.members} members</Badge></div>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Premium</span><div className="font-bold">₦{(pool.premium || 0).toLocaleString()}/yr</div></div>
                    <div><span className="text-muted-foreground">Pool Balance</span><div className="font-bold text-emerald-600">₦{(pool.poolBalance || 0).toLocaleString()}</div></div>
                    <div><span className="text-muted-foreground">Claims Paid</span><div className="font-bold text-red-600">₦{(pool.claimsPaid || 0).toLocaleString()}</div></div>
                    <div><span className="text-muted-foreground">Giveback</span><div className="font-bold text-violet-600">{pool.giveback}%</div></div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${100 - ((pool.claimsPaid || 0) / (pool.poolBalance || 1)) * 100}%` }}></div></div>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="gamification" className="mt-4">
          <Card><CardHeader><CardTitle>Gamification Rewards Program</CardTitle></CardHeader><CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {gamificationLevels.map((l: any) => (
                <div key={l.level} className={`p-6 rounded-lg text-center ${l.color}`}>
                  <div className="text-3xl font-bold">{l.level}</div>
                  <div className="text-sm mt-2">Points: {l.points}</div>
                  <div className="text-2xl font-bold mt-2">{l.discount} discount</div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-4 rounded-lg border">
              <div className="text-sm text-muted-foreground">Sample Profile — Gold Level</div>
              <div className="grid grid-cols-4 gap-4 mt-2 text-sm">
                <div><span className="text-muted-foreground">Points</span><div className="font-bold text-yellow-600">600</div></div>
                <div><span className="text-muted-foreground">Level</span><div className="font-bold">Gold</div></div>
                <div><span className="text-muted-foreground">Discount</span><div className="font-bold text-emerald-600">15%</div></div>
                <div><span className="text-muted-foreground">Rewards</span><div className="font-bold">4 unlocked</div></div>
              </div>
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
