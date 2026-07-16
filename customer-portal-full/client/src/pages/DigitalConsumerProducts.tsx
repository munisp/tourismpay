import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

const fallbackProducts = [
  { id: 'PPD-001', name: 'Pay-Per-Day Motor', icon: '🚘', type: 'on-demand', coverage: 2000000, premium: 350, unit: '/day', description: 'Activate/deactivate daily motor insurance via app. Only pay for days you drive.', activePolicies: 1250, totalRevenue: 4375000, status: 'Active' },
  { id: 'GIG-001', name: 'Gig Worker On-Demand', icon: '🏍️', type: 'on-demand', coverage: 500000, premium: 150, unit: '/trip', description: 'Per-trip accident cover for delivery riders — auto-activates when online.', activePolicies: 3200, totalRevenue: 1920000, status: 'Active' },
  { id: 'CYB-001', name: 'SME Cyber Shield', icon: '🔒', type: 'cyber', coverage: 0, premium: 25000, unit: '/year', description: 'AI-powered cyber risk assessment for SMEs — scores vulnerability, recommends protection.', activePolicies: 450, totalRevenue: 11250000, status: 'Active' },
  { id: 'PET-001', name: 'Pet Insurance', icon: '🐾', type: 'pet', coverage: 500000, premium: 2000, unit: '/month', description: 'Comprehensive veterinary coverage for dogs and cats — accidents, illness, surgery.', activePolicies: 800, totalRevenue: 1600000, status: 'Active' },
  { id: 'NOM-001', name: 'Digital Nomad Travel', icon: '✈️', type: 'travel', coverage: 5000000, premium: 8500, unit: '/month', description: 'Multi-country travel insurance for remote workers — medical, equipment, liability.', activePolicies: 320, totalRevenue: 2720000, status: 'Active' },
  { id: 'SUB-001', name: 'Subscription Motor', icon: '📅', type: 'subscription', coverage: 3000000, premium: 4500, unit: '/month', description: 'Monthly subscription motor insurance — cancel anytime, usage-based pricing.', activePolicies: 1500, totalRevenue: 6750000, status: 'Active' },
  { id: 'HOS-001', name: 'Hospi-Cash', icon: '🏥', type: 'health', coverage: 5000, premium: 1500, unit: '/month', description: 'Daily cash benefit during hospitalization — ₦5,000/day paid directly. No receipts needed.', activePolicies: 2100, totalRevenue: 3150000, status: 'Active' },
  { id: 'FUN-001', name: 'Funeral Insurance', icon: '⚰️', type: 'life', coverage: 500000, premium: 1000, unit: '/month', description: 'Dignified funeral coverage with immediate payout on death notification.', activePolicies: 4500, totalRevenue: 4500000, status: 'Active' },
];

const fallbackCyber = { business: 'FinStart Ltd', industry: 'Fintech', employees: 5, riskScore: 85, vulnerabilities: ['No dedicated IT staff', 'High-value financial data', 'Phishing risk', 'Ransomware exposure'], recommendation: 'Comprehensive Plan', premium: 75000 };

export default function DigitalConsumerProducts() {
  const [activeProduct, setActiveProduct] = useState<string | null>(null);
  const { data: productsData, isLoading } = trpc.digitalConsumer.products.useQuery(undefined, { retry: false });
  const activateMutation = trpc.digitalConsumer.activate.useMutation();
  const products = productsData ?? fallbackProducts;
  const cyberAssessment = fallbackCyber;
  const totalActivePolicies = products.reduce((s: number, p: any) => s + (p.activePolicies || 0), 0);
  const totalRevenue = products.reduce((s: number, p: any) => s + (p.totalRevenue || 0), 0);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">📲 Digital Consumer Products</h1>
          <p className="text-muted-foreground mt-1">On-demand, flexible insurance for the digital economy — {products.length} products</p>
        </div>
        {isLoading && <Badge variant="outline">Loading...</Badge>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 text-center"><div className="text-3xl font-bold text-violet-500">{products.length}</div><div className="text-sm text-muted-foreground">Products</div></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><div className="text-3xl font-bold text-emerald-500">{totalActivePolicies.toLocaleString()}</div><div className="text-sm text-muted-foreground">Active Policies</div></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><div className="text-3xl font-bold text-cyan-500">₦{(totalRevenue / 1000000).toFixed(1)}M</div><div className="text-sm text-muted-foreground">Total Revenue</div></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><div className="text-3xl font-bold text-amber-500">4</div><div className="text-sm text-muted-foreground">Product Types</div></CardContent></Card>
      </div>
      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Products ({products.length})</TabsTrigger>
          <TabsTrigger value="cyber">Cyber Risk Demo</TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {products.map((p: any) => (
              <Card key={p.id} className="hover:shadow-lg transition-all cursor-pointer" onClick={() => setActiveProduct(p.id)}>
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><span className="text-2xl">{p.icon}</span>{p.name}</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">{p.description}</p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Type</span><Badge variant="outline" className="text-xs">{p.type}</Badge></div>
                    {(p.coverage || 0) > 0 && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Coverage</span><span className="font-semibold text-emerald-600">₦{p.coverage.toLocaleString()}</span></div>}
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Premium</span><span className="font-semibold text-amber-600">₦{p.premium.toLocaleString()}{p.unit}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Active Policies</span><span className="font-semibold">{(p.activePolicies || 0).toLocaleString()}</span></div>
                  </div>
                  <Button size="sm" className="w-full mt-3" variant="outline" onClick={(e) => { e.stopPropagation(); activateMutation.mutate({ productId: p.id }); }}>Activate</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="cyber" className="mt-4">
          <Card><CardHeader><CardTitle>SME Cyber Risk Assessment Demo</CardTitle></CardHeader><CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="p-4 rounded-lg border"><div className="text-sm text-muted-foreground">Business</div><div className="font-bold text-lg">{cyberAssessment.business}</div><div className="text-sm">{cyberAssessment.industry} | {cyberAssessment.employees} employees</div></div>
                <div className="p-4 rounded-lg border"><div className="text-sm text-muted-foreground">Vulnerabilities Detected</div><ul className="mt-2 space-y-1">{cyberAssessment.vulnerabilities.map((v, i) => (<li key={i} className="flex items-center gap-2 text-sm"><span className="w-2 h-2 rounded-full bg-red-500"></span>{v}</li>))}</ul></div>
              </div>
              <div className="space-y-3">
                <div className="p-4 rounded-lg border text-center"><div className="text-sm text-muted-foreground">Risk Score</div><div className="text-5xl font-bold text-red-500 my-2">{cyberAssessment.riskScore}/100</div><Badge variant="destructive">HIGH RISK</Badge></div>
                <div className="p-4 rounded-lg border"><div className="text-sm text-muted-foreground">Recommended Plan</div><div className="font-bold text-lg">{cyberAssessment.recommendation}</div><div className="text-2xl font-bold text-amber-600 mt-1">₦{cyberAssessment.premium.toLocaleString()}/year</div><Button className="w-full mt-3">Get Protected Now</Button></div>
              </div>
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
