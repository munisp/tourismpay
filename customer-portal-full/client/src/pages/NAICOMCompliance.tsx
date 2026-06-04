import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ShieldCheck, Send, Download, AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

const NAICOMCompliance: React.FC = () => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [newFilingType, setNewFilingType] = useState('');
  const [newFilingPeriod, setNewFilingPeriod] = useState('');

  const utils = trpc.useUtils();
  const { data: dashboard } = trpc.naicom.dashboard.useQuery(undefined, { enabled: isAuthenticated });
  const { data: filingsData, isLoading } = trpc.naicom.filings.useQuery({ page, limit: 10, searchTerm }, { enabled: isAuthenticated });
  const { data: returnsData } = trpc.naicom.returns.useQuery(undefined, { enabled: isAuthenticated });

  const submitMutation = trpc.naicom.submit.useMutation({
    onSuccess: () => { toast.success('NAICOM filing submitted successfully!'); utils.naicom.filings.invalidate(); setIsSubmitDialogOpen(false); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const submitReturnMutation = trpc.naicom.submitReturn.useMutation({
    onSuccess: (data) => { toast.success('Return submitted to NAICOM portal'); utils.naicom.returns.invalidate(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const receiveDataMutation = trpc.naicom.receiveData.useMutation({
    onSuccess: (data) => toast.success(`NAICOM data received: ${data?.type || 'circular'} — Ref: ${data?.ref || 'N/A'}`),
  });

  if (isAuthLoading) return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!isAuthenticated) return <div className="flex justify-center items-center h-screen text-lg font-semibold">Access Denied</div>;

  const filings = filingsData?.filings || [];
  const totalPages = filingsData?.totalPages || 1;
  const returns = Array.isArray(returnsData) ? returnsData : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><ShieldCheck className="h-8 w-8 text-green-600" /> NAICOM Compliance</h1>
          <p className="text-muted-foreground">National Insurance Commission — Regulatory Compliance & Bidirectional Data Exchange</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={dashboard && dashboard.complianceScore >= 70 ? 'default' : 'destructive'} className="text-lg px-4 py-2">
            Score: {dashboard?.complianceScore ?? '—'}%
          </Badge>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="filings">Filings</TabsTrigger>
          <TabsTrigger value="returns">Statutory Returns</TabsTrigger>
          <TabsTrigger value="bidirectional">Bidirectional Data</TabsTrigger>
          <TabsTrigger value="requirements">Requirements</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Compliance Score</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{dashboard?.complianceScore ?? '—'}%</div><Progress value={dashboard?.complianceScore ?? 0} className="h-2 mt-2" /></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total Filings</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{dashboard?.totalFilings ?? 0}</div><p className="text-xs text-green-600">{dashboard?.approved ?? 0} approved</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Data Sent to NAICOM</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-blue-600">{dashboard?.bidirectional?.sent ?? 0}</div><p className="text-xs">filings & returns</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Data Received</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{dashboard?.bidirectional?.received ?? 0}</div><p className="text-xs">circulars & directives</p></CardContent></Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>NAICOM Regulatory Requirements</CardTitle><CardDescription>Insurance Act 2003, NAICOM Act 1997, and subsequent guidelines</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {dashboard?.requirements?.map((req: any) => (
                  <div key={req.id} className="flex justify-between items-center py-2 border-b">
                    <div className="flex items-center gap-2">
                      {req.status === 'compliant' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                      <div><p className="font-medium text-sm">{String(req.name)}</p><p className="text-xs text-muted-foreground">{String(req.detail)}</p></div>
                    </div>
                    <Badge variant={req.status === 'compliant' ? 'default' : 'destructive'}>{String(req.status)}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Recent Bidirectional Activity</CardTitle><CardDescription>Data exchange log with NAICOM portal</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {dashboard?.bidirectional?.inboundItems?.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b">
                    <div className="flex items-center gap-2">
                      <Download className="h-4 w-4 text-blue-600" />
                      <div><p className="text-sm font-medium">{String(item.type)}</p><p className="text-xs text-muted-foreground">Ref: {String(item.ref)}</p></div>
                    </div>
                    <Badge variant="outline">{new Date(item.receivedAt).toLocaleDateString()}</Badge>
                  </div>
                ))}
                <div className="pt-2">
                  <Button size="sm" variant="outline" onClick={() => receiveDataMutation.mutate({ type: 'circular', ref: 'NAICOM/CIR/2026/001' })} disabled={receiveDataMutation.isLoading}>
                    {receiveDataMutation.isLoading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    <Download className="mr-2 h-3 w-3" /> Poll NAICOM for Updates
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="filings" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>NAICOM Filings</CardTitle><CardDescription>Quarterly and annual regulatory filings</CardDescription></div>
              <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
                <DialogTrigger asChild><Button><Send className="mr-2 h-4 w-4" /> Submit New Filing</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Submit New NAICOM Filing</DialogTitle><DialogDescription>Prepare and submit a regulatory filing to NAICOM</DialogDescription></DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Type</Label>
                      <Select value={newFilingType} onValueChange={setNewFilingType}>
                        <SelectTrigger className="col-span-3"><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Quarterly Financial Report">Quarterly Financial Report</SelectItem>
                          <SelectItem value="Annual Returns">Annual Returns</SelectItem>
                          <SelectItem value="Solvency Margin Statement">Solvency Margin Statement</SelectItem>
                          <SelectItem value="Claims Statistics">Claims Statistics Report</SelectItem>
                          <SelectItem value="Reinsurance Treaty">Reinsurance Treaty Filing</SelectItem>
                          <SelectItem value="Risk Based Capital">Risk-Based Capital Report</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Period</Label>
                      <Input value={newFilingPeriod} onChange={(e) => setNewFilingPeriod(e.target.value)} className="col-span-3" placeholder="e.g., Q1 2026, FY 2025" />
                    </div>
                  </div>
                  <DialogFooter><Button onClick={() => { submitMutation.mutate({ type: newFilingType, period: newFilingPeriod }); }} disabled={submitMutation.isLoading || !newFilingType || !newFilingPeriod}>{submitMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Input placeholder="Search filings..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-sm mb-4" />
              {isLoading ? <div className="flex justify-center h-40"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                <>
                  <Table>
                    <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Type</TableHead><TableHead>Period</TableHead><TableHead>Due Date</TableHead><TableHead>Submitted</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {filings.length > 0 ? filings.map((f: any) => (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium">{String(f.id)}</TableCell>
                          <TableCell>{String(f.type)}</TableCell>
                          <TableCell>{String(f.period)}</TableCell>
                          <TableCell>{String(f.dueDate)}</TableCell>
                          <TableCell>{String(f.submissionDate)}</TableCell>
                          <TableCell><Badge variant={f.status === 'Approved' ? 'default' : f.status === 'Submitted' ? 'secondary' : f.status === 'Pending' ? 'outline' : 'destructive'}>{String(f.status)}</Badge></TableCell>
                        </TableRow>
                      )) : <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No filings found</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                  <div className="flex justify-between items-center mt-4">
                    <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                    <div className="flex gap-2"><Button size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button><Button size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button></div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="returns">
          <Card>
            <CardHeader><CardTitle>Statutory Returns</CardTitle><CardDescription>NAICOM-mandated periodic returns (Insurance Act 2003, Section 30)</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Return Type</TableHead><TableHead>Period</TableHead><TableHead>Due Date</TableHead><TableHead>Submitted</TableHead><TableHead>Status</TableHead><TableHead>NAICOM Ref</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {returns.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{String(r.id)}</TableCell>
                      <TableCell className="font-medium">{String(r.returnType)}</TableCell>
                      <TableCell>{String(r.reportingPeriod)}</TableCell>
                      <TableCell>{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>{r.submissionDate ? new Date(r.submissionDate).toLocaleDateString() : '—'}</TableCell>
                      <TableCell><Badge variant={r.status === 'approved' ? 'default' : r.status === 'submitted' ? 'secondary' : r.status === 'overdue' ? 'destructive' : 'outline'}>{String(r.status)}</Badge></TableCell>
                      <TableCell className="text-xs">{String(r.naicomAckRef || '—')}</TableCell>
                      <TableCell>
                        {r.status === 'draft' || r.status === 'pending' ? (
                          <Button size="sm" variant="outline" onClick={() => submitReturnMutation.mutate({ returnId: r.id })} disabled={submitReturnMutation.isLoading}>
                            <Send className="mr-1 h-3 w-3" /> Submit
                          </Button>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bidirectional" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Outbound (InsurePortal → NAICOM)</CardTitle><CardDescription>Data sent to NAICOM regulatory portal</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-blue-50 rounded"><p className="font-semibold">Total Sent: {dashboard?.bidirectional?.sent ?? 0}</p><p className="text-sm text-muted-foreground">Filings, returns, and ad-hoc submissions</p></div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Sent Data Types:</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-green-600" /> Quarterly Financial Reports</div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-green-600" /> Solvency Margin Statements</div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-green-600" /> Claims Statistics</div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-green-600" /> Reinsurance Treaties</div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-green-600" /> Risk-Based Capital Reports</div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-green-600" /> Annual Returns</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" /> Inbound (NAICOM → InsurePortal)</CardTitle><CardDescription>Data received from NAICOM regulatory portal</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-green-50 rounded"><p className="font-semibold">Total Received: {dashboard?.bidirectional?.received ?? 0}</p><p className="text-sm text-muted-foreground">Circulars, directives, and acknowledgments</p></div>
                <div className="space-y-2">
                  {dashboard?.bidirectional?.inboundItems?.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center py-2 border-b text-sm">
                      <div><p className="font-medium">{String(item.type)}</p><p className="text-xs text-muted-foreground">Ref: {String(item.ref)}</p></div>
                      <span className="text-xs">{new Date(item.receivedAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full" onClick={() => receiveDataMutation.mutate({ type: 'directive', ref: 'NAICOM/DIR/2026/RBC' })} disabled={receiveDataMutation.isLoading}>
                  {receiveDataMutation.isLoading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  <Download className="mr-2 h-4 w-4" /> Sync Inbound Data from NAICOM
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="requirements">
          <Card>
            <CardHeader><CardTitle>NAICOM Compliance Requirements Checklist</CardTitle><CardDescription>Based on Insurance Act 2003, NAICOM Act 1997, NAICOM Guidelines on Enterprise Risk Management 2015, and Market Conduct Guidelines</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center gap-4">
                <Progress value={dashboard?.complianceScore ?? 0} className="flex-1 h-3" />
                <span className="font-bold text-lg">{dashboard?.complianceScore ?? 0}%</span>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Requirement</TableHead><TableHead>Regulation Reference</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {dashboard?.requirements?.map((req: any) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{String(req.name)}</TableCell>
                      <TableCell className="text-xs">{String(req.regulation || '—')}</TableCell>
                      <TableCell className="text-sm max-w-[300px]">{String(req.detail)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {req.status === 'compliant' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-red-600" />}
                          <Badge variant={req.status === 'compliant' ? 'default' : 'destructive'}>{String(req.status)}</Badge>
                        </div>
                      </TableCell>
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

export default NAICOMCompliance;
