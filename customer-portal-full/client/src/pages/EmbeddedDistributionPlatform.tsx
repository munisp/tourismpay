import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';

const fallbackPartners = [
  { id: 'PTR-001', name: 'PayStack Financial', channel: 'Loan Embedded', industry: 'Fintech', commission: 15, icon: '💳', product: 'Credit Life Plus', premium: 500, coverage: 100000, status: 'Active', policiesIssued: 5000, totalPremiums: 2500000 },
  { id: 'PTR-002', name: 'MTN MoMo', channel: 'Airtime Bundled', industry: 'Telecom', commission: 20, icon: '📱', product: 'Airtime Accident Cover', premium: 50, coverage: 25000, status: 'Active', policiesIssued: 17000, totalPremiums: 850000 },
  { id: 'PTR-003', name: 'Jumia', channel: 'E-commerce', industry: 'Retail', commission: 12, icon: '🛒', product: 'Device Protection', premium: 1500, coverage: 150000, status: 'Active', policiesIssued: 800, totalPremiums: 1200000 },
  { id: 'PTR-004', name: 'Bolt', channel: 'Ride-hailing', industry: 'Transport', commission: 18, icon: '🚗', product: 'Ride-Hailing Driver Cover', premium: 200, coverage: 500000, status: 'Active', policiesIssued: 18000, totalPremiums: 3600000 },
  { id: 'PTR-005', name: 'PiggyVest', channel: 'Savings-linked', industry: 'Fintech', commission: 10, icon: '🏦', product: 'Savings Guard', premium: 300, coverage: 200000, status: 'Active', policiesIssued: 3000, totalPremiums: 900000 },
  { id: 'PTR-006', name: 'Kuda Bank', channel: 'Marketplace SDK', industry: 'Banking', commission: 14, icon: '🔗', product: 'Marketplace Exchange', premium: 0, coverage: 0, status: 'Active', policiesIssued: 0, totalPremiums: 0 },
];

const fallbackRevenue = [
  { partner: 'PayStack', premiums: 2500000, commission: 375000, policies: 5000 },
  { partner: 'MTN MoMo', premiums: 850000, commission: 170000, policies: 17000 },
  { partner: 'Jumia', premiums: 1200000, commission: 144000, policies: 800 },
  { partner: 'Bolt', premiums: 3600000, commission: 648000, policies: 18000 },
  { partner: 'PiggyVest', premiums: 900000, commission: 90000, policies: 3000 },
];

export default function EmbeddedDistributionPlatform() {
  const { data: partnersData, isLoading } = trpc.embeddedDistribution.partners.useQuery(undefined, { retry: false });
  const { data: revenueRaw } = trpc.embeddedDistribution.revenue.useQuery(undefined, { retry: false });
  const createPartnerMutation = trpc.embeddedDistribution.createPartner.useMutation();
  const partners = partnersData ?? fallbackPartners;
  const revenueData = revenueRaw ?? fallbackRevenue;
  const totalPremiums = revenueData.reduce((s: number, r: any) => s + r.premiums, 0);
  const totalCommission = revenueData.reduce((s: number, r: any) => s + r.commission, 0);
  const totalPolicies = revenueData.reduce((s: number, r: any) => s + r.policies, 0);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">🔌 Embedded Distribution Platform</h1>
          <p className="text-muted-foreground mt-1">Insurance bundled into fintech transactions — {partners.length} distribution channels</p>
        </div>
        {isLoading && <Badge variant="outline">Loading...</Badge>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 text-center"><div className="text-3xl font-bold text-cyan-500">{partners.length}</div><div className="text-sm text-muted-foreground">Partners</div></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><div className="text-3xl font-bold text-emerald-500">₦{(totalPremiums / 1000000).toFixed(1)}M</div><div className="text-sm text-muted-foreground">Total Premiums</div></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><div className="text-3xl font-bold text-amber-500">₦{(totalCommission / 1000000).toFixed(1)}M</div><div className="text-sm text-muted-foreground">Commission Paid</div></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><div className="text-3xl font-bold text-violet-500">{totalPolicies.toLocaleString()}</div><div className="text-sm text-muted-foreground">Active Policies</div></CardContent></Card>
      </div>
      <Tabs defaultValue="partners">
        <TabsList>
          <TabsTrigger value="partners">Partners ({partners.length})</TabsTrigger>
          <TabsTrigger value="revenue">Revenue Share</TabsTrigger>
        </TabsList>
        <TabsContent value="partners" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {partners.map((p: any) => (
              <Card key={p.id} className="hover:shadow-lg transition-all">
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><span className="text-2xl">{p.icon}</span>{p.name}</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Channel</span><Badge variant="outline">{p.channel}</Badge></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Product</span><span className="font-medium">{p.product}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Commission</span><span className="font-semibold text-amber-600">{p.commission}%</span></div>
                    {(p.premium || 0) > 0 && (<><div className="flex justify-between text-sm"><span className="text-muted-foreground">Premium</span><span className="font-semibold">₦{p.premium.toLocaleString()}</span></div><div className="flex justify-between text-sm"><span className="text-muted-foreground">Coverage</span><span className="font-semibold text-emerald-600">₦{p.coverage.toLocaleString()}</span></div></>)}
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Policies</span><span className="font-semibold">{(p.policiesIssued || 0).toLocaleString()}</span></div>
                    <Badge variant="secondary" className="text-xs">{p.industry}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-4"><Button variant="outline" onClick={() => createPartnerMutation.mutate({ name: 'New Partner', channel: 'API', industry: 'Fintech', commission: 15 })}>+ Add Distribution Partner</Button></div>
        </TabsContent>
        <TabsContent value="revenue" className="mt-4">
          <Card><CardHeader><CardTitle>Revenue Share by Partner</CardTitle></CardHeader><CardContent>
            <div className="space-y-4">
              {revenueData.map((r: any, i: number) => (
                <div key={i} className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2"><span className="font-semibold">{r.partner}</span><Badge>{r.policies.toLocaleString()} policies</Badge></div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Premiums</span><div className="font-bold">₦{r.premiums.toLocaleString()}</div></div>
                    <div><span className="text-muted-foreground">Commission</span><div className="font-bold text-amber-600">₦{r.commission.toLocaleString()}</div></div>
                    <div><span className="text-muted-foreground">Net to Insurer</span><div className="font-bold text-emerald-600">₦{(r.premiums - r.commission).toLocaleString()}</div></div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2"><div className="h-2 rounded-full bg-cyan-500" style={{ width: `${(r.premiums / totalPremiums) * 100}%` }}></div></div>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
