import React, { useState } from 'react';
import { Loader2, TrendingUp, TrendingDown, DollarSign, ShieldCheck, BarChart3, PieChart, AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';

const fmt = (n: number | undefined | null) => n != null ? `₦${Number(n).toLocaleString()}` : '—';
const pct = (n: number | undefined | null) => n != null ? `${Number(n).toFixed(1)}%` : '—';

const ExecutiveDashboard: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState('overview');

  const { data: financial } = trpc.financial.dashboard.useQuery(undefined, { enabled: isAuthenticated });
  const { data: analytics } = trpc.analytics.comprehensive.useQuery(undefined, { enabled: isAuthenticated });
  const { data: uwStats } = trpc.underwriting.stats.useQuery(undefined, { enabled: isAuthenticated });
  const { data: naicomDash } = trpc.naicom.dashboard.useQuery(undefined, { enabled: isAuthenticated });
  const { data: wfStats } = trpc.workflow.stats.useQuery(undefined, { enabled: isAuthenticated });
  const { data: collections } = trpc.financial.collections.useQuery(undefined, { enabled: isAuthenticated });
  const { data: payoutsData } = trpc.financial.payouts.useQuery(undefined, { enabled: isAuthenticated });
  const { data: glEntries } = trpc.financial.glEntries.useQuery(undefined, { enabled: isAuthenticated });
  const { data: reserves } = trpc.financial.reserves.useQuery(undefined, { enabled: isAuthenticated });

  if (authLoading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!isAuthenticated) return <div className="flex items-center justify-center min-h-screen text-lg font-semibold text-red-500">Access Denied</div>;

  const s = financial?.summary;
  const r = financial?.ratios;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Financial & Executive Dashboard</h1>
          <p className="text-muted-foreground">Comprehensive P&L, reserves, cash flow, collections, and regulatory metrics</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={r && r.combinedRatio < 100 ? 'default' : 'destructive'} className="text-sm px-3 py-1">
            Combined Ratio: {pct(r?.combinedRatio)}
          </Badge>
          <Badge variant="outline" className="text-sm px-3 py-1">
            NAICOM Score: {naicomDash?.complianceScore ?? '—'}%
          </Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Gross Premium</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{fmt(s?.grossPremium)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Net Premium</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{fmt(s?.netPremium)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Claims Incurred</CardTitle></CardHeader><CardContent><div className="text-lg font-bold text-red-600">{fmt(s?.claimsIncurred)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Profit Before Tax</CardTitle></CardHeader><CardContent><div className={`text-lg font-bold ${(s?.profitBeforeTax ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(s?.profitBeforeTax)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Loss Ratio</CardTitle></CardHeader><CardContent><div className={`text-lg font-bold ${(r?.lossRatio ?? 0) < 70 ? 'text-green-600' : 'text-red-600'}`}>{pct(r?.lossRatio)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Solvency Ratio</CardTitle></CardHeader><CardContent><div className="text-lg font-bold text-green-600">188.9%</div><p className="text-xs text-muted-foreground">Min: 100%</p></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">P&L Overview</TabsTrigger>
          <TabsTrigger value="collections">Premium Collections</TabsTrigger>
          <TabsTrigger value="payouts">Claims Payouts</TabsTrigger>
          <TabsTrigger value="reserves">Reserves</TabsTrigger>
          <TabsTrigger value="gl">General Ledger</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Profit & Loss Statement</CardTitle><CardDescription>Current period financial summary</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between py-2 border-b"><span>Gross Written Premium</span><span className="font-semibold">{fmt(s?.grossPremium)}</span></div>
                <div className="flex justify-between py-2 border-b text-muted-foreground"><span className="pl-4">Less: Reinsurance Ceded</span><span>({fmt(s?.reinsuranceCeded)})</span></div>
                <div className="flex justify-between py-2 border-b font-semibold"><span>Net Premium</span><span>{fmt(s?.netPremium)}</span></div>
                <div className="flex justify-between py-2 border-b text-red-600"><span>Claims Incurred</span><span>({fmt(s?.claimsIncurred)})</span></div>
                <div className="flex justify-between py-2 border-b text-muted-foreground"><span className="pl-4">Add: Reinsurance Recovery</span><span>{fmt(s?.reinsuranceRecovery)}</span></div>
                <div className="flex justify-between py-2 border-b"><span>Net Claims</span><span className="text-red-600">({fmt(s?.netClaims)})</span></div>
                <div className="flex justify-between py-2 border-b"><span>Commission Paid</span><span>({fmt(s?.commissions)})</span></div>
                <div className="flex justify-between py-2 border-b font-semibold"><span>Underwriting Result</span><span className={(s?.underwritingResult ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}>{fmt(s?.underwritingResult)}</span></div>
                <div className="flex justify-between py-2 border-b text-green-600"><span>Investment Income</span><span>{fmt(s?.investmentIncome)}</span></div>
                <div className="flex justify-between py-2 border-b"><span>Management Expenses</span><span>({fmt(s?.managementExpenses)})</span></div>
                <div className="flex justify-between py-2 bg-gray-50 px-2 rounded font-bold text-lg"><span>Profit Before Tax</span><span className={(s?.profitBeforeTax ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}>{fmt(s?.profitBeforeTax)}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Key Ratios & Indicators</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><div className="flex justify-between mb-1"><span className="text-sm">Loss Ratio</span><span className="text-sm font-medium">{pct(r?.lossRatio)}</span></div><Progress value={Math.min(r?.lossRatio ?? 0, 100)} className="h-2" /></div>
                <div><div className="flex justify-between mb-1"><span className="text-sm">Expense Ratio</span><span className="text-sm font-medium">{pct(r?.expenseRatio)}</span></div><Progress value={Math.min(r?.expenseRatio ?? 0, 100)} className="h-2" /></div>
                <div><div className="flex justify-between mb-1"><span className="text-sm">Combined Ratio</span><span className="text-sm font-medium">{pct(r?.combinedRatio)}</span></div><Progress value={Math.min(r?.combinedRatio ?? 0, 200) / 2} className="h-2" /></div>
                <div><div className="flex justify-between mb-1"><span className="text-sm">Retention Ratio</span><span className="text-sm font-medium">{pct(r?.retentionRatio)}</span></div><Progress value={r?.retentionRatio ?? 0} className="h-2" /></div>
                <div className="pt-4 border-t">
                  <h4 className="font-semibold mb-2">Cash Flow</h4>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div><p className="text-xs text-muted-foreground">Inflows</p><p className="font-semibold text-green-600">{fmt(financial?.cashFlow?.inflows)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Outflows</p><p className="font-semibold text-red-600">{fmt(financial?.cashFlow?.outflows)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Net</p><p className={`font-semibold ${(financial?.cashFlow?.netCashFlow ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(financial?.cashFlow?.netCashFlow)}</p></div>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <h4 className="font-semibold mb-2">Underwriting Engine</h4>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div><p className="text-xs text-muted-foreground">Auto-Approved</p><p className="font-bold">{uwStats?.autoApproved ?? '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Declined</p><p className="font-bold text-red-600">{uwStats?.declined ?? '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Referred</p><p className="font-bold text-yellow-600">{uwStats?.referred ?? '—'}</p></div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Auto-approval rate: {uwStats?.autoApprovalRate ?? '—'}% | Avg risk: {uwStats?.averageRiskScore ?? '—'}</p>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Workflow Middleware</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{wfStats?.activeDefinitions ?? 0} workflows</p>
                <p className="text-sm text-muted-foreground">{wfStats?.totalInstances ?? 0} active instances</p>
                <div className="mt-2 space-y-1">{wfStats?.instances?.map((i: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-xs"><span>{String(i.entity_type)}/{String(i.current_state)}</span><Badge variant="outline" className="text-xs">{String(i.cnt)}</Badge></div>
                ))}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">NAICOM Compliance</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{naicomDash?.complianceScore ?? '—'}%</p>
                <p className="text-sm text-muted-foreground">{naicomDash?.totalFilings ?? 0} filings, {naicomDash?.approved ?? 0} approved</p>
                <div className="mt-2 text-xs space-y-1">
                  <div className="flex justify-between"><span>Bidirectional Sent</span><span className="font-bold">{naicomDash?.bidirectional?.sent ?? 0}</span></div>
                  <div className="flex justify-between"><span>Bidirectional Received</span><span className="font-bold">{naicomDash?.bidirectional?.received ?? 0}</span></div>
                  <div className="flex justify-between"><span>Requirements Met</span><span className="font-bold">{naicomDash?.requirements?.filter((r: any) => r.status === 'compliant')?.length ?? 0}/{naicomDash?.requirements?.length ?? 0}</span></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Loss Ratio by Product</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {analytics?.lossRatioByProduct?.slice(0, 6)?.map((p: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs items-center">
                    <span>{String(p.type)}</span>
                    <div className="flex items-center gap-2">
                      <Progress value={Math.min(Number(p.lossRatio) || 0, 100)} className="w-16 h-1.5" />
                      <span className={`font-medium ${Number(p.lossRatio) < 70 ? 'text-green-600' : 'text-red-600'}`}>{Number(p.lossRatio)?.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="collections">
          <Card>
            <CardHeader>
              <CardTitle>Premium Collections</CardTitle>
              <CardDescription>All premium payments received and pending</CardDescription>
              <div className="grid grid-cols-4 gap-4 mt-2">
                <div className="text-center p-2 bg-green-50 rounded"><p className="text-xs text-muted-foreground">Collected</p><p className="font-bold text-green-600">{fmt(collections?.summary?.collected)}</p></div>
                <div className="text-center p-2 bg-yellow-50 rounded"><p className="text-xs text-muted-foreground">Pending</p><p className="font-bold text-yellow-600">{fmt(collections?.summary?.pending)}</p></div>
                <div className="text-center p-2 bg-red-50 rounded"><p className="text-xs text-muted-foreground">Failed</p><p className="font-bold text-red-600">{fmt(collections?.summary?.failed)}</p></div>
                <div className="text-center p-2 bg-blue-50 rounded"><p className="text-xs text-muted-foreground">Total Txns</p><p className="font-bold">{collections?.summary?.total ?? 0}</p></div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Policy</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Status</TableHead><TableHead>Receipt</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>
                  {collections?.collections?.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{String(c.policyNumber || c.policyId)}</TableCell>
                      <TableCell>{fmt(c.amount)}</TableCell>
                      <TableCell><Badge variant="outline">{String(c.paymentMethod)}</Badge></TableCell>
                      <TableCell><Badge variant={c.status === 'completed' ? 'default' : c.status === 'pending' ? 'secondary' : 'destructive'}>{String(c.status)}</Badge></TableCell>
                      <TableCell className="text-xs">{String(c.receiptNumber || '—')}</TableCell>
                      <TableCell className="text-xs">{c.collectionDate ? new Date(c.collectionDate).toLocaleDateString() : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts">
          <Card>
            <CardHeader>
              <CardTitle>Claims Payouts</CardTitle>
              <CardDescription>Approved and processed claim payments to beneficiaries</CardDescription>
              <div className="grid grid-cols-3 gap-4 mt-2">
                <div className="text-center p-2 bg-green-50 rounded"><p className="text-xs text-muted-foreground">Total Paid</p><p className="font-bold text-green-600">{fmt(payoutsData?.summary?.paid)}</p></div>
                <div className="text-center p-2 bg-yellow-50 rounded"><p className="text-xs text-muted-foreground">Outstanding</p><p className="font-bold text-yellow-600">{fmt(payoutsData?.summary?.outstanding)}</p></div>
                <div className="text-center p-2 bg-blue-50 rounded"><p className="text-xs text-muted-foreground">Total Records</p><p className="font-bold">{payoutsData?.summary?.total ?? 0}</p></div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Claim #</TableHead><TableHead>Beneficiary</TableHead><TableHead>Bank</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Approved By</TableHead><TableHead>Paid At</TableHead></TableRow></TableHeader>
                <TableBody>
                  {payoutsData?.payouts?.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{String(p.claimNumber || p.claimId)}</TableCell>
                      <TableCell>{String(p.beneficiaryName)}</TableCell>
                      <TableCell className="text-xs">{String(p.bankName || '—')}</TableCell>
                      <TableCell>{fmt(p.amount)}</TableCell>
                      <TableCell><Badge variant={p.status === 'paid' ? 'default' : p.status === 'approved' ? 'secondary' : 'outline'}>{String(p.status)}</Badge></TableCell>
                      <TableCell className="text-xs">{String(p.approvedBy || '—')}</TableCell>
                      <TableCell className="text-xs">{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reserves">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Technical Reserves</CardTitle><CardDescription>NAICOM-mandated reserve requirements (Insurance Act 2003, Sections 20-23)</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between py-3 border-b"><span>IBNR Reserve</span><span className="font-semibold">{fmt(reserves?.ibnr)}</span></div>
                <div className="flex justify-between py-3 border-b"><span>Technical Provisions</span><span className="font-semibold">{fmt(reserves?.technicalProvisions)}</span></div>
                <div className="flex justify-between py-3 border-b"><span>Outstanding Claims</span><span className="font-semibold">{fmt(reserves?.outstandingClaims)}</span></div>
                <div className="flex justify-between py-3 border-b"><span>Unearned Premium Reserve</span><span className="font-semibold">{fmt(reserves?.unearnedPremiumReserve)}</span></div>
                <div className="flex justify-between py-3 bg-blue-50 px-2 rounded font-bold text-lg"><span>Total Reserves</span><span>{fmt(reserves?.totalReserves)}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>NAICOM Requirements</CardTitle><CardDescription>10-point regulatory compliance checklist</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {naicomDash?.requirements?.map((req: any) => (
                  <div key={req.id} className="flex justify-between items-center py-1.5 border-b text-sm">
                    <div>
                      <span className="font-medium">{String(req.name)}</span>
                      <p className="text-xs text-muted-foreground">{String(req.detail)}</p>
                    </div>
                    <Badge variant={req.status === 'compliant' ? 'default' : 'destructive'}>{String(req.status)}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="gl">
          <Card>
            <CardHeader><CardTitle>General Ledger Entries</CardTitle><CardDescription>All financial transactions (double-entry bookkeeping)</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead>Debit Account</TableHead><TableHead>Credit Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(glEntries as any[])?.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{e.transactionDate ? new Date(e.transactionDate).toLocaleDateString() : '—'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{String(e.transactionType)}</Badge></TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{String(e.description)}</TableCell>
                      <TableCell className="text-xs">{String(e.debitAccount)}</TableCell>
                      <TableCell className="text-xs">{String(e.creditAccount)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(e.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Policy Distribution by Type</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Count</TableHead><TableHead>Premium</TableHead><TableHead>Sum Assured</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {analytics?.policyDistribution?.map((p: any, i: number) => (
                      <TableRow key={i}><TableCell className="font-medium">{String(p.type)}</TableCell><TableCell>{String(p.count)}</TableCell><TableCell>{fmt(p.premium)}</TableCell><TableCell>{fmt(p.sumAssured)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Claims by Status</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Count</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {analytics?.claimsAnalysis?.map((c: any, i: number) => (
                      <TableRow key={i}><TableCell><Badge variant={c.status === 'Paid' || c.status === 'Approved' ? 'default' : c.status === 'Declined' ? 'destructive' : 'secondary'}>{String(c.status)}</Badge></TableCell><TableCell>{String(c.count)}</TableCell><TableCell>{fmt(c.amount)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ExecutiveDashboard;
