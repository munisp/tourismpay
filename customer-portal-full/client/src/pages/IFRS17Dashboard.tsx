import React, { useState } from 'react';
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, ShieldCheck, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Building2, FileText, Scale, RefreshCcw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const fmt = (n: number | undefined | null) => n != null ? `₦${Number(n).toLocaleString()}` : '—';
const pct = (n: number | undefined | null) => n != null ? `${Number(n).toFixed(1)}%` : '—';

const IFRS17Dashboard: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState('overview');
  const [selectedGroup, setSelectedGroup] = useState('MOT-IND-2025');

  const { data: summary } = trpc.ifrs17.summary.useQuery(undefined, { enabled: isAuthenticated });
  const { data: discountCurves } = trpc.ifrs17.discountCurves.useQuery(undefined, { enabled: isAuthenticated });
  const { data: rollforward } = trpc.ifrs17.csmRollforward.useQuery({ groupCode: selectedGroup }, { enabled: isAuthenticated });
  const { data: scenarios } = trpc.ifrs17.scenarios.useQuery({ groupCode: selectedGroup }, { enabled: isAuthenticated });
  const { data: reinsurance } = trpc.ifrs17.reinsuranceHeld.useQuery(undefined, { enabled: isAuthenticated });
  const { data: transition } = trpc.ifrs17.transition.useQuery(undefined, { enabled: isAuthenticated });
  const { data: pnl } = trpc.ifrs17.profitAndLoss.useQuery(undefined, { enabled: isAuthenticated });
  const { data: onerous } = trpc.ifrs17.onerousContracts.useQuery(undefined, { enabled: isAuthenticated });
  const { data: trialBalance } = trpc.ifrs17.trialBalance.useQuery({ reportingPeriod: '2026-Q2' }, { enabled: isAuthenticated });

  if (authLoading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!isAuthenticated) return <div className="flex items-center justify-center min-h-screen text-lg font-semibold text-red-500">Access Denied</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">IFRS 17 Dashboard</h1>
          <p className="text-muted-foreground">Insurance Contracts Standard — Measurement, Recognition & Disclosure</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="default" className="text-sm px-3 py-1">
            Standard: IFRS 17
          </Badge>
          <Badge variant="outline" className="text-sm px-3 py-1">
            NAICOM: {summary?.naicomCircular || 'NIC/DIR/CIR/25/001'}
          </Badge>
          <Badge variant={onerous?.onerousGroups?.length ? 'destructive' : 'default'} className="text-sm px-3 py-1">
            {onerous?.onerousGroups?.length || 0} Onerous
          </Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total CSM</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(summary?.csmOverview?.totalCSM)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3 text-green-500" /> Net unearned profit</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Loss Component</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{fmt(summary?.csmOverview?.totalLossComponent)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> Onerous contracts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Insurance Revenue (Q2)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(summary?.profitAndLoss?.[0]?.revenue)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><ArrowUpRight className="h-3 w-3 text-green-500" /> Latest quarter</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Reinsurance Ceded</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(reinsurance?.totals?.premiumCeded)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> 6 treaties active</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="csm">CSM Rollforward</TabsTrigger>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          <TabsTrigger value="reinsurance">Reinsurance</TabsTrigger>
          <TabsTrigger value="transition">Transition</TabsTrigger>
          <TabsTrigger value="pnl">P&L</TabsTrigger>
          <TabsTrigger value="discounting">Discount Curves</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Contract Groups */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Contract Groups</CardTitle>
                <CardDescription>8 groups across 3 measurement models</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Portfolio</TableHead>
                      <TableHead>Coverage</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary?.contractGroups?.map((g: any) => (
                      <TableRow key={g.code}>
                        <TableCell className="font-medium">{g.name}</TableCell>
                        <TableCell><Badge variant={g.model === 'VFA' ? 'secondary' : g.model === 'GMM' ? 'outline' : 'default'}>{g.model}</Badge></TableCell>
                        <TableCell>{g.portfolio}</TableCell>
                        <TableCell>{g.coverageMonths}m</TableCell>
                        <TableCell>{g.isOnerous ? <Badge variant="destructive">Onerous</Badge> : <Badge variant="default">Profitable</Badge>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Measurement Models */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" /> Measurement Models</CardTitle>
                <CardDescription>IFRS 17 eligibility criteria</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2"><Badge>PAA</Badge> <span className="font-semibold">Premium Allocation Approach</span></div>
                  <p className="text-sm text-muted-foreground">{summary?.measurementModels?.PAA || 'Eligible for contracts with coverage period ≤ 12 months'}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2"><Badge variant="outline">GMM</Badge> <span className="font-semibold">General Measurement Model</span></div>
                  <p className="text-sm text-muted-foreground">{summary?.measurementModels?.GMM || 'Default for long-duration contracts'}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2"><Badge variant="secondary">VFA</Badge> <span className="font-semibold">Variable Fee Approach</span></div>
                  <p className="text-sm text-muted-foreground">{summary?.measurementModels?.VFA || 'Contracts with direct participation features (investment-linked)'}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Onerous Contracts Alert */}
          {onerous?.onerousGroups?.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-700"><AlertTriangle className="h-5 w-5" /> Onerous Contracts</CardTitle>
                <CardDescription className="text-red-600">{onerous.policy}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group</TableHead>
                      <TableHead>Portfolio</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Loss Component</TableHead>
                      <TableHead>Remediation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {onerous.onerousGroups.map((g: any) => (
                      <TableRow key={g.groupCode}>
                        <TableCell className="font-medium">{g.groupName}</TableCell>
                        <TableCell>{g.portfolio}</TableCell>
                        <TableCell><Badge variant="outline">{g.measurementModel}</Badge></TableCell>
                        <TableCell className="text-red-600 font-semibold">{fmt(g.lossComponent)}</TableCell>
                        <TableCell className="text-sm">{g.remediation}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-xs text-red-600 mt-2">{onerous.naicomReporting}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* CSM ROLLFORWARD TAB */}
        <TabsContent value="csm" className="space-y-4">
          <div className="flex items-center gap-4 mb-4">
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select contract group" />
              </SelectTrigger>
              <SelectContent>
                {summary?.contractGroups?.map((g: any) => (
                  <SelectItem key={g.code} value={g.code}>{g.name} ({g.model})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline">{rollforward?.measurementModel}</Badge>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>CSM Waterfall — {rollforward?.groupName}</CardTitle>
              <CardDescription>{rollforward?.methodology}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">New Contracts</TableHead>
                    <TableHead className="text-right">Interest</TableHead>
                    <TableHead className="text-right">Estimates Δ</TableHead>
                    <TableHead className="text-right">Experience</TableHead>
                    <TableHead className="text-right">Release</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                    <TableHead className="text-right">Loss</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rollforward?.periods?.map((p: any) => (
                    <TableRow key={p.period}>
                      <TableCell className="font-medium">{p.period}</TableCell>
                      <TableCell className="text-right">{fmt(p.opening)}</TableCell>
                      <TableCell className="text-right text-green-600">{fmt(p.newContracts)}</TableCell>
                      <TableCell className="text-right">{fmt(p.interestAccretion)}</TableCell>
                      <TableCell className={`text-right ${p.changesInEstimates < 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(p.changesInEstimates)}</TableCell>
                      <TableCell className={`text-right ${p.experienceAdjustments < 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(p.experienceAdjustments)}</TableCell>
                      <TableCell className="text-right text-blue-600">{fmt(p.csmRelease)}</TableCell>
                      <TableCell className="text-right font-bold">{fmt(p.closing)}</TableCell>
                      <TableCell className="text-right text-red-600">{p.lossComponent > 0 ? fmt(p.lossComponent) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {/* Coverage Units */}
          {rollforward?.periods?.[0]?.coverageUnits && (
            <Card>
              <CardHeader>
                <CardTitle>Coverage Unit Release Pattern</CardTitle>
                <CardDescription>CSM released proportionally to coverage units provided in each period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  {rollforward.periods.map((p: any) => (
                    <div key={p.period} className="text-center">
                      <p className="text-sm font-medium">{p.period}</p>
                      <Progress value={parseFloat(p.coverageUnits.releasePattern)} className="mt-2" />
                      <p className="text-xs text-muted-foreground mt-1">{p.coverageUnits.recognized}/{p.coverageUnits.total} units ({p.coverageUnits.releasePattern})</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* SCENARIOS TAB */}
        <TabsContent value="scenarios" className="space-y-4">
          <div className="flex items-center gap-4 mb-4">
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select contract group" />
              </SelectTrigger>
              <SelectContent>
                {summary?.contractGroups?.map((g: any) => (
                  <SelectItem key={g.code} value={g.code}>{g.name} ({g.model})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Probability-Weighted Cashflow Scenarios</CardTitle>
              <CardDescription>{scenarios?.methodology}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-4">
                    <p className="text-sm text-blue-600">Probability-Weighted PV</p>
                    <p className="text-xl font-bold">{fmt(scenarios?.probabilityWeightedPV)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="pt-4">
                    <p className="text-sm text-green-600">Best Estimate PV</p>
                    <p className="text-xl font-bold">{fmt(scenarios?.bestEstimatePV)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 border-purple-200">
                  <CardContent className="pt-4">
                    <p className="text-sm text-purple-600">Risk Margin</p>
                    <p className="text-xl font-bold">{fmt(scenarios?.riskMargin)}</p>
                  </CardContent>
                </Card>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scenario</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">Premium Inflows</TableHead>
                    <TableHead className="text-right">Claims Outflows</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Discount Rate</TableHead>
                    <TableHead className="text-right">Present Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scenarios?.scenarios?.map((s: any) => (
                    <TableRow key={s.name}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">{(s.weight * 100).toFixed(0)}%</TableCell>
                      <TableCell className="text-right text-green-600">{fmt(s.premiumInflows)}</TableCell>
                      <TableCell className="text-right text-red-600">{fmt(s.claimsOutflows)}</TableCell>
                      <TableCell className="text-right">{fmt(s.expenseOutflows)}</TableCell>
                      <TableCell className="text-right">{(s.discountRate * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-right font-bold">{fmt(s.presentValue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* REINSURANCE TAB */}
        <TabsContent value="reinsurance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Reinsurance Held (IFRS 17 Part B)</CardTitle>
              <CardDescription>{reinsurance?.methodology}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card className="bg-slate-50">
                  <CardContent className="pt-4">
                    <p className="text-sm text-slate-600">Premium Ceded</p>
                    <p className="text-xl font-bold">{fmt(reinsurance?.totals?.premiumCeded)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-50">
                  <CardContent className="pt-4">
                    <p className="text-sm text-slate-600">Claims Recovered</p>
                    <p className="text-xl font-bold text-green-600">{fmt(reinsurance?.totals?.claimsRecovered)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-50">
                  <CardContent className="pt-4">
                    <p className="text-sm text-slate-600">CSM (Reinsurance)</p>
                    <p className="text-xl font-bold">{fmt(reinsurance?.totals?.csmReinsurance)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-50">
                  <CardContent className="pt-4">
                    <p className="text-sm text-slate-600">Net Recovery</p>
                    <p className="text-xl font-bold">{fmt(reinsurance?.totals?.netRecovery)}</p>
                  </CardContent>
                </Card>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contract Group</TableHead>
                    <TableHead>Reinsurer</TableHead>
                    <TableHead>Treaty Type</TableHead>
                    <TableHead className="text-right">Cession %</TableHead>
                    <TableHead className="text-right">Premium Ceded</TableHead>
                    <TableHead className="text-right">Claims Recovered</TableHead>
                    <TableHead className="text-right">CSM (RI)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reinsurance?.contracts?.map((c: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{c.groupName}</TableCell>
                      <TableCell>{c.reinsurer}</TableCell>
                      <TableCell><Badge variant="outline">{c.treatyType}</Badge></TableCell>
                      <TableCell className="text-right">{c.cessionPercentage}%</TableCell>
                      <TableCell className="text-right">{fmt(c.premiumCeded)}</TableCell>
                      <TableCell className="text-right text-green-600">{fmt(c.claimsRecovered)}</TableCell>
                      <TableCell className="text-right">{fmt(c.csmReinsurance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-2">NAICOM Minimum Retention: {reinsurance?.naicomMinimumRetention}</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TRANSITION TAB */}
        <TabsContent value="transition" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><RefreshCcw className="h-5 w-5" /> IFRS 4 → IFRS 17 Transition</CardTitle>
              <CardDescription>Transition date: {transition?.transitionDate} | {transition?.naicomGuidance}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="pt-4">
                    <p className="text-sm text-amber-600">Total Adjustment</p>
                    <p className="text-xl font-bold">{fmt(transition?.totals?.totalAdjustment)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 border-red-200">
                  <CardContent className="pt-4">
                    <p className="text-sm text-red-600">Equity Impact</p>
                    <p className="text-xl font-bold text-red-600">{fmt(transition?.totals?.totalEquityImpact)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-4">
                    <p className="text-sm text-blue-600">Retained Earnings</p>
                    <p className="text-xl font-bold">{fmt(transition?.totals?.retainedEarningsImpact)}</p>
                  </CardContent>
                </Card>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contract Group</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Approach</TableHead>
                    <TableHead className="text-right">IFRS 4 Liability</TableHead>
                    <TableHead className="text-right">IFRS 17 Liability</TableHead>
                    <TableHead className="text-right">Adjustment</TableHead>
                    <TableHead className="text-right">Equity Impact</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transition?.groups?.map((g: any) => (
                    <TableRow key={g.groupCode}>
                      <TableCell className="font-medium">{g.groupName}</TableCell>
                      <TableCell><Badge variant="outline">{g.measurementModel}</Badge></TableCell>
                      <TableCell className="capitalize">{g.approach.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-right">{fmt(g.ifrs4Liability)}</TableCell>
                      <TableCell className="text-right">{fmt(g.ifrs17Liability)}</TableCell>
                      <TableCell className="text-right text-amber-600">{fmt(g.adjustment)}</TableCell>
                      <TableCell className="text-right text-red-600">{fmt(g.equityImpact)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {/* Transition approaches explanation */}
              <div className="grid grid-cols-3 gap-4 mt-4">
                {transition?.approaches && Object.entries(transition.approaches).map(([key, desc]: [string, any]) => (
                  <div key={key} className="p-3 border rounded-lg">
                    <p className="text-sm font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* P&L TAB */}
        <TabsContent value="pnl" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Insurance Service Result</CardTitle>
              <CardDescription>{pnl?.methodology}</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Period summary */}
              <h3 className="font-semibold mb-2">By Period (Aggregated)</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Insurance Revenue</TableHead>
                    <TableHead className="text-right">Service Expense</TableHead>
                    <TableHead className="text-right">Service Result</TableHead>
                    <TableHead className="text-right">Investment Income</TableHead>
                    <TableHead className="text-right">Finance Expense</TableHead>
                    <TableHead className="text-right">Net Financial</TableHead>
                    <TableHead className="text-right">Loss Release</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pnl?.byPeriod?.map((p: any) => (
                    <TableRow key={p.period}>
                      <TableCell className="font-medium">{p.period}</TableCell>
                      <TableCell className="text-right text-green-600">{fmt(p.revenue)}</TableCell>
                      <TableCell className="text-right text-red-600">{fmt(p.expense)}</TableCell>
                      <TableCell className={`text-right font-bold ${p.serviceResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(p.serviceResult)}</TableCell>
                      <TableCell className="text-right">{fmt(p.investmentIncome)}</TableCell>
                      <TableCell className="text-right">{fmt(p.financeExpense)}</TableCell>
                      <TableCell className="text-right">{fmt(p.netFinancial)}</TableCell>
                      <TableCell className="text-right">{p.lossRelease > 0 ? fmt(p.lossRelease) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Trial Balance */}
              <h3 className="font-semibold mt-6 mb-2">IFRS 17 Trial Balance (Q2 2026)</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trialBalance?.accounts?.map((a: any) => (
                    <TableRow key={a.code}>
                      <TableCell className="font-mono text-sm">{a.code}</TableCell>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell><Badge variant="outline">{a.type}</Badge></TableCell>
                      <TableCell className="text-right">{a.debit > 0 ? fmt(a.debit) : '—'}</TableCell>
                      <TableCell className="text-right">{a.credit > 0 ? fmt(a.credit) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex gap-2 mt-2">
                <Badge variant="outline">Format: {trialBalance?.naicomFormat}</Badge>
                <Badge variant={trialBalance?.erpReady ? 'default' : 'destructive'}>{trialBalance?.erpReady ? 'ERP Ready' : 'Not Synced'}</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DISCOUNT CURVES TAB */}
        <TabsContent value="discounting" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> CBN Yield Curve + Illiquidity Premium</CardTitle>
              <CardDescription>Source: {discountCurves?.source} | Methodology: {discountCurves?.methodology}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Risk-Free Curve</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Term</TableHead>
                          <TableHead className="text-right">Spot</TableHead>
                          <TableHead className="text-right">Forward</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {discountCurves?.riskFreeCurve?.map((r: any) => (
                          <TableRow key={r.termMonths}>
                            <TableCell>{r.termMonths}m</TableCell>
                            <TableCell className="text-right">{(r.spotRate * 100).toFixed(2)}%</TableCell>
                            <TableCell className="text-right">{(r.forwardRate * 100).toFixed(2)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-sm">Illiquidity Premium</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Term</TableHead>
                          <TableHead className="text-right">Spread</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {discountCurves?.illiquidityPremium?.map((r: any) => (
                          <TableRow key={r.termMonths}>
                            <TableCell>{r.termMonths}m</TableCell>
                            <TableCell className="text-right">{(r.spread * 100).toFixed(2)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-sm">Liability Discount Rate</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Term</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {discountCurves?.discountRateForLiabilities?.map((r: any) => (
                          <TableRow key={r.termMonths}>
                            <TableCell>{r.termMonths}m</TableCell>
                            <TableCell className="text-right font-semibold">{(r.rate * 100).toFixed(2)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
              <p className="text-xs text-muted-foreground mt-4">Last updated: {discountCurves?.lastUpdated} | Bottom-up approach: Risk-free (CBN FGN Bond) + Illiquidity premium (internal actuarial model)</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default IFRS17Dashboard;
