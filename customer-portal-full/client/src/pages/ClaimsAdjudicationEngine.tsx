import React, { useState } from 'react';
import { Loader2, Scale, ShieldAlert, AlertTriangle, CheckCircle2, XCircle, Clock, Gavel, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const fmt = (n: number | undefined | null) => n != null ? `₦${Number(n).toLocaleString()}` : '—';

const ClaimsAdjudicationEngine: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState('queue');
  const [searchQuery, setSearchQuery] = useState('');
  const [adjudicateOpen, setAdjudicateOpen] = useState(false);
  const [adjClaimId, setAdjClaimId] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjPolicyId, setAdjPolicyId] = useState('');
  const [adjResult, setAdjResult] = useState<any>(null);

  const { data: claimsData, isLoading: claimsLoading } = trpc.claims.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: queueData } = trpc.claimRouting.queue.useQuery(undefined, { enabled: isAuthenticated });
  const { data: payoutsData } = trpc.financial.payouts.useQuery(undefined, { enabled: isAuthenticated });

  const adjudicateMut = trpc.claims.adjudicate.useMutation({
    onSuccess: (data) => {
      setAdjResult(data);
      toast.success(`Claim adjudicated: ${data?.decision}`);
      utils.claims.list.invalidate();
    },
    onError: (err) => toast.error(`Adjudication failed: ${err.message}`),
  });
  const processMut = trpc.aiClaims.process.useMutation({
    onSuccess: () => { toast.success('Claim sent for AI processing'); utils.claims.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  if (authLoading) return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!isAuthenticated) return <div className="flex justify-center items-center h-screen text-lg font-semibold">Access Denied</div>;

  const claims = (claimsData || []) as any[];
  const queue = (queueData || []) as any[];
  const payouts = payoutsData?.payouts || [];

  const filtered = claims.filter((c: any) => {
    const s = searchQuery.toLowerCase();
    return !s || String(c.id).includes(s) || String(c.claimantName || '').toLowerCase().includes(s) || String(c.policyId || '').toLowerCase().includes(s);
  });

  const totalClaims = claims.length;
  const pending = claims.filter((c: any) => c.status === 'Pending' || c.status === 'Under Review').length;
  const approved = claims.filter((c: any) => c.status === 'Approved' || c.status === 'Paid').length;
  const declined = claims.filter((c: any) => c.status === 'Rejected' || c.status === 'Declined').length;
  const totalAmount = claims.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);

  const handleAdjudicate = () => {
    if (!adjClaimId || !adjAmount) { toast.error('Enter claim ID and amount'); return; }
    adjudicateMut.mutate({ claimId: Number(adjClaimId), amount: Number(adjAmount), policyId: Number(adjPolicyId) || 1 });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Scale className="h-8 w-8" /> Claims Adjudication Engine</h1>
          <p className="text-muted-foreground">Automated fraud detection, eligibility verification, and payout calculation</p>
        </div>
        <Dialog open={adjudicateOpen} onOpenChange={setAdjudicateOpen}>
          <DialogTrigger asChild><Button size="lg"><Gavel className="mr-2 h-5 w-5" /> Adjudicate Claim</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Run Claim Adjudication</DialogTitle><DialogDescription>Evaluate a claim through the automated adjudication engine (fraud scoring, eligibility, deductible calculation)</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-3 gap-4">
                <div><Label>Claim ID</Label><Input value={adjClaimId} onChange={e => setAdjClaimId(e.target.value)} placeholder="1" /></div>
                <div><Label>Policy ID</Label><Input value={adjPolicyId} onChange={e => setAdjPolicyId(e.target.value)} placeholder="1" /></div>
                <div><Label>Amount (₦)</Label><Input value={adjAmount} onChange={e => setAdjAmount(e.target.value)} placeholder="350000" /></div>
              </div>
              <Button onClick={handleAdjudicate} disabled={adjudicateMut.isLoading} className="w-full">
                {adjudicateMut.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Run Adjudication Engine
              </Button>
              {adjResult && (
                <Card className="border-2 border-blue-200">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold">Decision: <Badge variant={adjResult.decision === 'approved' ? 'default' : adjResult.decision === 'fast_track_approved' ? 'default' : 'destructive'} className="text-base ml-2">{String(adjResult.decision).toUpperCase()}</Badge></span>
                      <Badge variant="outline">Priority: {String(adjResult.priority)}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-2 bg-red-50 rounded"><p className="text-xs text-muted-foreground">Fraud Score</p><p className={`font-bold text-lg ${adjResult.fraudScore > 50 ? 'text-red-600' : 'text-green-600'}`}>{adjResult.fraudScore}/100</p></div>
                      <div className="p-2 bg-blue-50 rounded"><p className="text-xs text-muted-foreground">Deductible</p><p className="font-bold text-lg">{fmt(adjResult.deductible)}</p></div>
                      <div className="p-2 bg-green-50 rounded"><p className="text-xs text-muted-foreground">Payout</p><p className="font-bold text-lg text-green-600">{fmt(adjResult.payoutAmount)}</p></div>
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-semibold text-sm">Adjudication Checks ({adjResult.rulesEvaluated} rules):</h4>
                      {adjResult.checks?.map((c: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-sm py-1 border-b">
                          {c.result === 'PASS' ? <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" /> : c.result === 'FLAG' ? <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" /> : <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />}
                          <span className="font-medium">{String(c.rule)}</span>
                          <span className="text-muted-foreground ml-auto">{String(c.detail)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total Claims</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{totalClaims}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Pending</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-yellow-600">{pending}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Approved</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{approved}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Declined</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">{declined}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total Amount</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{fmt(totalAmount)}</div></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="queue">Claims Queue</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="routing">Smart Routing</TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          <Card>
            <CardHeader>
              <CardTitle>Claims Processing Queue</CardTitle>
              <CardDescription>All claims with status, amount, and adjudication actions</CardDescription>
              <Input placeholder="Search by ID, name, or policy..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="max-w-sm mt-2" />
            </CardHeader>
            <CardContent>
              {claimsLoading ? <div className="flex justify-center h-40"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                <Table>
                  <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Policy</TableHead><TableHead>Claimant</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{String(c.id)}</TableCell>
                        <TableCell>{String(c.policyId)}</TableCell>
                        <TableCell>{String(c.claimantName || '—')}</TableCell>
                        <TableCell><Badge variant="outline">{String(c.type || c.claimType || '—')}</Badge></TableCell>
                        <TableCell>{fmt(c.amount)}</TableCell>
                        <TableCell><Badge variant={c.status === 'Approved' || c.status === 'Paid' ? 'default' : c.status === 'Pending' || c.status === 'Under Review' ? 'secondary' : c.status === 'Rejected' || c.status === 'Declined' ? 'destructive' : 'outline'}>{String(c.status)}</Badge></TableCell>
                        <TableCell className="text-xs">{c.submissionDate ? new Date(c.submissionDate).toLocaleDateString() : '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => { setAdjClaimId(String(c.id)); setAdjAmount(String(c.amount || '')); setAdjPolicyId(String(c.policyId || '1')); setAdjudicateOpen(true); }}><Gavel className="h-3 w-3 mr-1" /> Adjudicate</Button>
                            <Button size="sm" variant="ghost" onClick={() => processMut.mutate({ claimId: String(c.id) })} disabled={processMut.isLoading}><TrendingUp className="h-3 w-3" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts">
          <Card>
            <CardHeader>
              <CardTitle>Claims Payouts</CardTitle>
              <CardDescription>Approved claim payments to beneficiaries</CardDescription>
              <div className="grid grid-cols-3 gap-4 mt-2">
                <div className="text-center p-2 bg-green-50 rounded"><p className="text-xs text-muted-foreground">Paid</p><p className="font-bold text-green-600">{fmt(payoutsData?.summary?.paid)}</p></div>
                <div className="text-center p-2 bg-yellow-50 rounded"><p className="text-xs text-muted-foreground">Outstanding</p><p className="font-bold text-yellow-600">{fmt(payoutsData?.summary?.outstanding)}</p></div>
                <div className="text-center p-2 bg-blue-50 rounded"><p className="text-xs text-muted-foreground">Total Records</p><p className="font-bold">{payoutsData?.summary?.total ?? 0}</p></div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Claim</TableHead><TableHead>Beneficiary</TableHead><TableHead>Bank</TableHead><TableHead>Account</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Approved By</TableHead></TableRow></TableHeader>
                <TableBody>
                  {payouts.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{String(p.claimNumber || p.claimId)}</TableCell>
                      <TableCell>{String(p.beneficiaryName)}</TableCell>
                      <TableCell>{String(p.bankName || '—')}</TableCell>
                      <TableCell className="text-xs">{String(p.accountNumber || '—')}</TableCell>
                      <TableCell className="font-medium">{fmt(p.amount)}</TableCell>
                      <TableCell><Badge variant={p.status === 'paid' ? 'default' : p.status === 'approved' ? 'secondary' : 'outline'}>{String(p.status)}</Badge></TableCell>
                      <TableCell className="text-xs">{String(p.approvedBy || '—')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="routing">
          <Card>
            <CardHeader><CardTitle>Smart Claim Routing Queue</CardTitle><CardDescription>AI-powered routing based on claim complexity, amount, and type</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Claim ID</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Priority</TableHead><TableHead>Assigned To</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {queue.map((q: any) => (
                    <TableRow key={q.id || q.claimId}>
                      <TableCell className="font-medium">{String(q.claimId || q.id)}</TableCell>
                      <TableCell>{String(q.type || q.claimType || '—')}</TableCell>
                      <TableCell>{fmt(q.amount)}</TableCell>
                      <TableCell><Badge variant={q.priority === 'high' ? 'destructive' : q.priority === 'medium' ? 'secondary' : 'outline'}>{String(q.priority || 'standard')}</Badge></TableCell>
                      <TableCell>{String(q.assignedTo || q.adjuster || '—')}</TableCell>
                      <TableCell><Badge variant="outline">{String(q.status || '—')}</Badge></TableCell>
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

export default ClaimsAdjudicationEngine;
