import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, FileText, Calculator, ShieldCheck, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const fmt = (n: number | undefined | null) => n != null ? `₦${Number(n).toLocaleString()}` : '—';

const InsuranceApplication: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState('applications');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Application form
  const [formProduct, setFormProduct] = useState('');
  const [formAge, setFormAge] = useState('');
  const [formSumAssured, setFormSumAssured] = useState('');
  const [formIncome, setFormIncome] = useState('');
  const [formName, setFormName] = useState('');
  // Risk factors
  const [isSmoker, setIsSmoker] = useState(false);
  const [hasTracker, setHasTracker] = useState(false);
  const [claimsFreeYears, setClaimsFreeYears] = useState('0');

  // Premium/UW results
  const [premiumResult, setPremiumResult] = useState<any>(null);
  const [uwResult, setUwResult] = useState<any>(null);

  const { data: applications, isLoading } = trpc.application.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: products } = trpc.products.catalog.useQuery(undefined, { enabled: isAuthenticated });
  const { data: kycGate } = trpc.kyc.gate.useQuery(undefined, { enabled: isAuthenticated });

  const calcPremiumMut = trpc.premium.calculate.useMutation({
    onSuccess: (data) => { setPremiumResult(data); },
    onError: (err) => toast.error(err.message),
  });
  const uwMut = trpc.underwriting.evaluate.useMutation({
    onSuccess: (data) => { setUwResult(data); },
    onError: (err) => toast.error(err.message),
  });
  const createMut = trpc.application.create.useMutation({
    onSuccess: () => { toast.success('Application submitted'); setIsDialogOpen(false); utils.application.list.invalidate(); resetForm(); },
    onError: (err) => toast.error(err.message),
  });

  const resetForm = () => { setFormProduct(''); setFormAge(''); setFormSumAssured(''); setFormIncome(''); setFormName(''); setPremiumResult(null); setUwResult(null); setIsSmoker(false); setHasTracker(false); setClaimsFreeYears('0'); };

  if (authLoading) return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!isAuthenticated) return <div className="flex justify-center items-center h-screen text-lg font-semibold">Access Denied</div>;

  const kycBlocked = kycGate && !kycGate.passed;
  const appList = (applications || []) as any[];
  const productList = (products || []) as any[];

  const handleCalculate = () => {
    if (!formProduct || !formAge || !formSumAssured) { toast.error('Select product, enter age, and sum assured'); return; }
    const riskFactors: any = { claimsFreeYears: Number(claimsFreeYears), hasTracker, isSmoker };
    calcPremiumMut.mutate({ productType: formProduct, age: Number(formAge), sumAssured: Number(formSumAssured), annualIncome: Number(formIncome) || undefined, riskFactors });
    uwMut.mutate({ productType: formProduct, applicantAge: Number(formAge), sumAssured: Number(formSumAssured), annualIncome: Number(formIncome) || undefined, riskFactors });
  };

  const handleSubmit = () => {
    if (kycBlocked) { toast.error('Complete KYC verification before applying'); return; }
    createMut.mutate({ type: formProduct, premium: premiumResult?.premium || 0, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><FileText className="h-8 w-8" /> Insurance Application</h1>
          <p className="text-muted-foreground">Apply for coverage with real-time premium calculation and underwriting assessment</p>
        </div>
        <div className="flex gap-2 items-center">
          {kycBlocked && <Badge variant="destructive" className="text-sm px-3 py-1"><AlertTriangle className="mr-1 h-3 w-3" /> KYC Required</Badge>}
          <Dialog open={isDialogOpen} onOpenChange={(o) => { setIsDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild><Button size="lg" disabled={kycBlocked}><FileText className="mr-2 h-5 w-5" /> New Application</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New Insurance Application</DialogTitle><DialogDescription>Select a product and provide details for instant premium quote and underwriting decision</DialogDescription></DialogHeader>
              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Product Type</Label>
                    <Select value={formProduct} onValueChange={setFormProduct}>
                      <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>
                        {productList.map((p: any) => <SelectItem key={p.code} value={p.category}>{String(p.name)} ({String(p.category)})</SelectItem>)}
                        {productList.length === 0 && <><SelectItem value="Motor">Motor</SelectItem><SelectItem value="Health">Health</SelectItem><SelectItem value="Life">Life</SelectItem><SelectItem value="Property">Property</SelectItem><SelectItem value="Agricultural">Agricultural</SelectItem><SelectItem value="Commercial">Commercial</SelectItem></>}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Applicant Name</Label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Full name" /></div>
                  <div><Label>Age</Label><Input type="number" value={formAge} onChange={e => setFormAge(e.target.value)} placeholder="28" /></div>
                  <div><Label>Sum Assured (₦)</Label><Input type="number" value={formSumAssured} onChange={e => setFormSumAssured(e.target.value)} placeholder="5000000" /></div>
                  <div><Label>Annual Income (₦)</Label><Input type="number" value={formIncome} onChange={e => setFormIncome(e.target.value)} placeholder="3000000" /></div>
                  <div><Label>Claims-Free Years</Label><Input type="number" value={claimsFreeYears} onChange={e => setClaimsFreeYears(e.target.value)} placeholder="0" /></div>
                </div>
                <div className="flex gap-4 items-center">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isSmoker} onChange={e => setIsSmoker(e.target.checked)} /> Smoker</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hasTracker} onChange={e => setHasTracker(e.target.checked)} /> Vehicle Tracker</label>
                </div>
                <Button onClick={handleCalculate} disabled={calcPremiumMut.isLoading} variant="outline" className="w-full">
                  {calcPremiumMut.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Calculator className="mr-2 h-4 w-4" /> Calculate Premium & Run Underwriting
                </Button>

                {premiumResult && (
                  <Card className="border-2 border-blue-200">
                    <CardHeader className="pb-2"><CardTitle className="text-base">Premium Quote</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="p-3 bg-blue-50 rounded"><p className="text-xs text-muted-foreground">Base Premium</p><p className="font-bold text-lg">{fmt(premiumResult.basePremium)}</p></div>
                        <div className="p-3 bg-green-50 rounded"><p className="text-xs text-muted-foreground">Final Premium</p><p className="font-bold text-xl text-green-600">{fmt(premiumResult.premium)}</p></div>
                        <div className="p-3 bg-gray-50 rounded"><p className="text-xs text-muted-foreground">Deductible</p><p className="font-bold text-lg">{fmt(premiumResult.deductible)}</p></div>
                      </div>
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between"><span>NAICOM Levy</span><span>{fmt(premiumResult.naicomLevy)}</span></div>
                        <div className="flex justify-between"><span>Stamp Duty</span><span>{fmt(premiumResult.stampDuty)}</span></div>
                        <div className="flex justify-between"><span>Sum Assured</span><span>{fmt(premiumResult.sumAssured)}</span></div>
                      </div>
                      {premiumResult.breakdown && (
                        <div className="space-y-1">{premiumResult.breakdown.map((b: any, i: number) => (
                          <div key={i} className="flex justify-between text-xs py-1 border-b"><span>{String(b.factor)}</span><span className="font-medium">{String(b.impact)}</span></div>
                        ))}</div>
                      )}
                    </CardContent>
                  </Card>
                )}
                {uwResult && (
                  <Card className={`border-2 ${uwResult.decision === 'auto_approved' ? 'border-green-200' : uwResult.decision === 'declined' ? 'border-red-200' : 'border-yellow-200'}`}>
                    <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2">
                      {uwResult.decision === 'auto_approved' ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : uwResult.decision === 'declined' ? <XCircle className="h-5 w-5 text-red-600" /> : <AlertTriangle className="h-5 w-5 text-yellow-600" />}
                      Underwriting Decision: <Badge variant={uwResult.decision === 'auto_approved' ? 'default' : uwResult.decision === 'declined' ? 'destructive' : 'secondary'}>{String(uwResult.decision).replace('_', ' ').toUpperCase()}</Badge>
                    </CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-4 gap-3 text-center text-sm">
                        <div><p className="text-xs text-muted-foreground">Risk Score</p><p className={`font-bold ${uwResult.riskScore < 50 ? 'text-green-600' : 'text-red-600'}`}>{uwResult.riskScore}/100</p></div>
                        <div><p className="text-xs text-muted-foreground">Category</p><p className="font-bold">{String(uwResult.riskCategory)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Loading</p><p className="font-bold">+{uwResult.premiumLoading}%</p></div>
                        <div><p className="text-xs text-muted-foreground">Discount</p><p className="font-bold text-green-600">-{uwResult.premiumDiscount}%</p></div>
                      </div>
                      {uwResult.rulesApplied?.length > 0 && (
                        <div className="space-y-1">{uwResult.rulesApplied.map((r: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs py-1 border-b">
                            <ShieldCheck className="h-3 w-3 text-blue-600 flex-shrink-0" />
                            <span className="font-medium">{String(r.rule)}</span>
                            <span className="text-muted-foreground ml-auto">{String(r.result)}</span>
                          </div>
                        ))}</div>
                      )}
                      {uwResult.exclusions?.length > 0 && <div className="p-2 bg-red-50 rounded text-xs"><strong>Exclusions:</strong> {uwResult.exclusions.join(', ')}</div>}
                      {uwResult.conditions?.length > 0 && <div className="p-2 bg-yellow-50 rounded text-xs"><strong>Conditions:</strong> {uwResult.conditions.join(', ')}</div>}
                    </CardContent>
                  </Card>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={createMut.isLoading || !premiumResult || uwResult?.decision === 'declined'}>
                  {createMut.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Application
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {kycBlocked && (
        <Card className="border-2 border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              <div>
                <p className="font-semibold text-red-800">KYC Verification Required</p>
                <p className="text-sm text-red-600">Complete your KYC/KYB verification before you can apply for insurance products. {kycGate?.reason || 'Go to KYC Status page to begin verification.'}</p>
                <p className="text-xs text-muted-foreground mt-1">Blocked features: {kycGate?.blockedFeatures?.join(', ') || 'applications, claims, premium payments'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="applications">My Applications</TabsTrigger>
          <TabsTrigger value="products">Available Products</TabsTrigger>
        </TabsList>

        <TabsContent value="applications">
          <Card>
            <CardHeader><CardTitle>Applications</CardTitle><CardDescription>Track your insurance application status</CardDescription></CardHeader>
            <CardContent>
              {isLoading ? <div className="flex justify-center h-40"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                <Table>
                  <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Premium</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {appList.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{String(a.id)}</TableCell>
                        <TableCell>{String(a.policyType || a.type || '—')}</TableCell>
                        <TableCell><Badge variant={a.status === 'Approved' ? 'default' : a.status === 'Rejected' ? 'destructive' : 'secondary'}>{String(a.status)}</Badge></TableCell>
                        <TableCell>{fmt(a.premium)}</TableCell>
                        <TableCell className="text-xs">{a.submissionDate ? new Date(a.submissionDate).toLocaleDateString() : '—'}</TableCell>
                      </TableRow>
                    ))}
                    {appList.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No applications yet</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader><CardTitle>Insurance Product Catalog</CardTitle><CardDescription>NAICOM-registered products available for purchase — {productList.length} products across {new Set(productList.map((p: any) => p.category)).size} categories</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Product</TableHead><TableHead>Category</TableHead><TableHead>Type</TableHead><TableHead>Min Premium</TableHead><TableHead>Max Premium</TableHead><TableHead>NAICOM Class</TableHead><TableHead>Compulsory</TableHead></TableRow></TableHeader>
                <TableBody>
                  {productList.map((p: any) => (
                    <TableRow key={p.code}>
                      <TableCell className="font-medium">{String(p.code)}</TableCell>
                      <TableCell>{String(p.name)}</TableCell>
                      <TableCell><Badge variant="outline">{String(p.category)}</Badge></TableCell>
                      <TableCell className="text-xs">{String(p.type || p.coverageType || '—')}</TableCell>
                      <TableCell>{fmt(p.minPremium)}</TableCell>
                      <TableCell>{fmt(p.maxPremium)}</TableCell>
                      <TableCell className="text-xs">{String(p.naicomClass || '—')}</TableCell>
                      <TableCell>{p.isCompulsory ? <Badge variant="destructive" className="text-xs">Mandatory</Badge> : <span className="text-xs text-muted-foreground">Optional</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default InsuranceApplication;
