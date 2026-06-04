import React, { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Loader2, Settings, DollarSign, ShieldCheck, Package, Users, BarChart3, FileText, Plus, Pencil, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const fmt = (n: number | undefined | null) => n != null ? `₦${Number(n).toLocaleString()}` : '—';
const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; }
};

const AdminConfigCenter: React.FC = () => {
  const [tab, setTab] = useState('overview');

  const { data: overview, isLoading: loadingOverview } = trpc.admin.overview.useQuery();
  const { data: settings } = trpc.admin.settings.list.useQuery();
  const { data: rateTables } = trpc.admin.rateTables.useQuery();
  const { data: products } = trpc.products.catalog.useQuery();
  const { data: chains } = trpc.approval.chains.useQuery();
  const { data: approvalDash } = trpc.approval.dashboard.useQuery();
  const { data: approvalRequests } = trpc.approval.requests.useQuery();
  const { data: naicomReports } = trpc.naicom.financialReports.useQuery();

  const utils = trpc.useUtils();

  // Mutations
  const updateSettingMut = trpc.admin.settings.update.useMutation({ onSuccess: () => { toast.success('Setting updated'); utils.admin.settings.list.invalidate(); }, onError: (e) => toast.error(e.message) });
  const createRateMut = trpc.admin.rateTables.create.useMutation({ onSuccess: () => { toast.success('Rate table created'); utils.admin.rateTables.invalidate(); }, onError: (e) => toast.error(e.message) });
  const updateRateMut = trpc.admin.rateTables.update.useMutation({ onSuccess: () => { toast.success('Rate updated'); utils.admin.rateTables.invalidate(); }, onError: (e) => toast.error(e.message) });
  const approveProductMut = trpc.products.approve.useMutation({ onSuccess: () => { toast.success('Product activated'); utils.products.catalog.invalidate(); }, onError: (e) => toast.error(e.message) });
  const createProductMut = trpc.products.create.useMutation({ onSuccess: () => { toast.success('Product created as draft'); utils.products.catalog.invalidate(); }, onError: (e) => toast.error(e.message) });
  const approvalActionMut = trpc.approval.requests.action.useMutation({ onSuccess: (d) => { toast.success(`Approval ${d.status}`); utils.approval.requests.invalidate(); utils.approval.dashboard.invalidate(); }, onError: (e) => toast.error(e.message) });
  const validateReportMut = trpc.naicom.financialReports.validate.useMutation({ onSuccess: (d) => { toast.success(d.isValid ? 'Report validated' : `Validation failed: ${d.errors?.length} errors`); utils.naicom.financialReports.invalidate(); }, onError: (e) => toast.error(e.message) });
  const submitReportMut = trpc.naicom.financialReports.submit.useMutation({ onSuccess: (d) => { toast.success(`Submitted: ${d.submissionRef}`); utils.naicom.financialReports.invalidate(); }, onError: (e) => toast.error(e.message) });

  // Dialog state
  const [editDialog, setEditDialog] = useState<{ type: string; data?: any } | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});

  const settingsList = (settings || []) as any[];
  const rateTablesList = (rateTables || []) as any[];
  const productsList = (products || []) as any[];
  const chainsList = (chains || []) as any[];
  const requestsList = (approvalRequests || []) as any[];
  const reportsList = (naicomReports || []) as any[];

  const settingsByCategory = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    settingsList.forEach(s => {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s);
    });
    return grouped;
  }, [settingsList]);

  if (loadingOverview) return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Settings className="h-8 w-8" /> Admin Configuration Center</h1>
        <p className="text-muted-foreground">Manage rates, premiums, products, approval chains, and system configuration</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="overview"><BarChart3 className="h-4 w-4 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="rates"><DollarSign className="h-4 w-4 mr-1" />Rates</TabsTrigger>
          <TabsTrigger value="products"><Package className="h-4 w-4 mr-1" />Products</TabsTrigger>
          <TabsTrigger value="approvals"><ShieldCheck className="h-4 w-4 mr-1" />Approvals</TabsTrigger>
          <TabsTrigger value="naicom"><FileText className="h-4 w-4 mr-1" />NAICOM Reports</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="h-4 w-4 mr-1" />Settings</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-5 gap-4">
            <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold">{overview?.products?.total || 0}</p><p className="text-sm text-muted-foreground">Products ({overview?.products?.active || 0} active)</p></CardContent></Card>
            <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold">{overview?.rates?.total || 0}</p><p className="text-sm text-muted-foreground">Rate Tables ({overview?.rates?.active || 0} active)</p></CardContent></Card>
            <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold">{overview?.settings?.total || 0}</p><p className="text-sm text-muted-foreground">Settings ({overview?.settings?.categories || 0} categories)</p></CardContent></Card>
            <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold">{overview?.approvalChains?.total || 0}</p><p className="text-sm text-muted-foreground">Approval Chains</p></CardContent></Card>
            <Card className="border-orange-200"><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-orange-600">{overview?.pendingApprovals || 0}</p><p className="text-sm text-muted-foreground">Pending Approvals</p></CardContent></Card>
          </div>
          {approvalDash && (
            <Card>
              <CardHeader><CardTitle>Approval Workflow Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-3 bg-blue-50 rounded text-center"><p className="text-2xl font-bold">{approvalDash.total}</p><p className="text-xs text-muted-foreground">Total Requests</p></div>
                  <div className="p-3 bg-orange-50 rounded text-center"><p className="text-2xl font-bold text-orange-600">{approvalDash.pending}</p><p className="text-xs text-muted-foreground">Pending</p></div>
                  <div className="p-3 bg-green-50 rounded text-center"><p className="text-2xl font-bold text-green-600">{approvalDash.approved}</p><p className="text-xs text-muted-foreground">Approved</p></div>
                  <div className="p-3 bg-red-50 rounded text-center"><p className="text-2xl font-bold text-red-600">{approvalDash.rejected}</p><p className="text-xs text-muted-foreground">Rejected</p></div>
                </div>
                {approvalDash.averageProcessingHours > 0 && <p className="text-sm text-muted-foreground mt-3">Average processing time: {approvalDash.averageProcessingHours}h</p>}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Rate Tables Tab */}
        <TabsContent value="rates" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Premium Rate Tables</CardTitle><CardDescription>Configure base rates by product type and effective period</CardDescription></div>
              <Button onClick={() => { setEditDialog({ type: 'newRate' }); setFormData({ name: '', productType: 'Auto', baseRate: '1.0', effectiveDate: new Date().toISOString().split('T')[0] }); }}><Plus className="mr-1 h-4 w-4" />Add Rate Table</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Product Type</TableHead>
                    <TableHead>Base Rate (%)</TableHead>
                    <TableHead>Effective</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateTablesList.map((rt: any) => (
                    <TableRow key={rt.id}>
                      <TableCell className="font-medium">{rt.name}</TableCell>
                      <TableCell>{rt.productType}</TableCell>
                      <TableCell>{Number(rt.baseRate).toFixed(4)}</TableCell>
                      <TableCell>{fmtDate(rt.effectiveDate)}</TableCell>
                      <TableCell>{fmtDate(rt.expiryDate)}</TableCell>
                      <TableCell><Badge variant={rt.status === 'active' ? 'default' : 'secondary'}>{rt.status}</Badge></TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => { setEditDialog({ type: 'editRate', data: rt }); setFormData({ baseRate: rt.baseRate, status: rt.status, expiryDate: rt.expiryDate ? new Date(rt.expiryDate).toISOString().split('T')[0] : '' }); }}><Pencil className="h-3 w-3" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Insurance Product Catalog</CardTitle><CardDescription>NAICOM-registered insurance products — {productsList.length} products</CardDescription></div>
              <Button onClick={() => { setEditDialog({ type: 'newProduct' }); setFormData({ name: '', category: 'Motor', subCategory: '', description: '', coverageType: 'indemnity', minPremium: '15000', maxPremium: '500000', minSumAssured: '1000000', maxSumAssured: '50000000', naicomClass: '', isCompulsory: false }); }}><Plus className="mr-1 h-4 w-4" />New Product</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>NAICOM Class</TableHead>
                    <TableHead>Premium Range</TableHead>
                    <TableHead>Sum Assured Range</TableHead>
                    <TableHead>Compulsory</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productsList.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">{p.code}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.category}</TableCell>
                      <TableCell className="text-sm">{p.naicomClass || '—'}</TableCell>
                      <TableCell className="text-sm">{fmt(p.minPremium)} – {fmt(p.maxPremium)}</TableCell>
                      <TableCell className="text-sm">{fmt(p.minSumAssured)} – {fmt(p.maxSumAssured)}</TableCell>
                      <TableCell>{p.isCompulsory ? <Badge variant="destructive">Yes</Badge> : <Badge variant="secondary">No</Badge>}</TableCell>
                      <TableCell><Badge variant={p.status === 'active' ? 'default' : 'secondary'}>{p.status}</Badge></TableCell>
                      <TableCell className="space-x-1">
                        {p.status === 'draft' && <Button size="sm" variant="outline" onClick={() => approveProductMut.mutate({ id: p.id })}><CheckCircle className="h-3 w-3 mr-1" />Activate</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Approvals Tab */}
        <TabsContent value="approvals" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Approval Chains</CardTitle><CardDescription>Configured multi-step approval workflows</CardDescription></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {chainsList.map((c: any) => {
                    const steps = typeof c.steps === 'string' ? JSON.parse(c.steps) : (c.steps || []);
                    return (
                      <div key={c.id} className="border rounded-lg p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.entity_type} {c.threshold_amount > 0 ? `(≥ ${fmt(c.threshold_amount)})` : ''}</p>
                          </div>
                          <Badge variant={c.is_active ? 'default' : 'secondary'}>{c.is_active ? 'Active' : 'Inactive'}</Badge>
                        </div>
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {steps.map((s: any, i: number) => (
                            <React.Fragment key={i}>
                              <Badge variant="outline" className="text-xs">{s.role}: {s.action} ({s.sla_hours}h SLA)</Badge>
                              {i < steps.length - 1 && <span className="text-muted-foreground">→</span>}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Pending Approval Requests</CardTitle><CardDescription>Items awaiting action in the approval pipeline</CardDescription></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {requestsList.filter((r: any) => r.status === 'pending' || r.status === 'in_review').map((r: any) => {
                    const steps = typeof r.chain_steps === 'string' ? JSON.parse(r.chain_steps) : (r.chain_steps || []);
                    const currentStepInfo = steps[r.current_step] || {};
                    return (
                      <div key={r.id} className="border rounded-lg p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{r.chain_name}</p>
                            <p className="text-xs text-muted-foreground">{r.entity_type} #{r.entity_id} — {r.notes}</p>
                            <p className="text-xs mt-1">Step {r.current_step + 1}/{steps.length}: <span className="font-medium">{currentStepInfo.role}</span> — {currentStepInfo.action}</p>
                          </div>
                          <Badge variant={r.status === 'in_review' ? 'default' : 'secondary'}>{r.status}</Badge>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" onClick={() => approvalActionMut.mutate({ id: r.id, action: 'approve', role: currentStepInfo.role, by: 'Admin' })} disabled={approvalActionMut.isLoading}>
                            <CheckCircle className="h-3 w-3 mr-1" />Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => approvalActionMut.mutate({ id: r.id, action: 'reject', role: currentStepInfo.role, by: 'Admin', comment: 'Rejected by admin' })} disabled={approvalActionMut.isLoading}>
                            <XCircle className="h-3 w-3 mr-1" />Reject
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Submitted: {fmtDate(r.submitted_at)} by {r.submitted_by}</p>
                      </div>
                    );
                  })}
                  {requestsList.filter((r: any) => r.status === 'pending' || r.status === 'in_review').length === 0 && (
                    <p className="text-muted-foreground text-center py-4">No pending approvals</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>All Approval Requests</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Chain</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requestsList.map((r: any) => {
                    const steps = typeof r.chain_steps === 'string' ? JSON.parse(r.chain_steps) : (r.chain_steps || []);
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{r.id}</TableCell>
                        <TableCell className="font-medium">{r.chain_name}</TableCell>
                        <TableCell>{r.entity_type}</TableCell>
                        <TableCell>#{r.entity_id}</TableCell>
                        <TableCell>{r.current_step + 1}/{steps.length}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'approved' ? 'default' : r.status === 'rejected' ? 'destructive' : 'secondary'}>
                            {r.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                            {r.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                            {(r.status === 'pending' || r.status === 'in_review') && <Clock className="h-3 w-3 mr-1" />}
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{fmtDate(r.submitted_at)}</TableCell>
                        <TableCell>{fmtDate(r.completed_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* NAICOM Reports Tab */}
        <TabsContent value="naicom" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>NAICOM Financial Reports</CardTitle>
              <CardDescription>Standard financial reporting formats per NAICOM Insurance Act 2003 / NAICOM Act 1997. Ingest, validate, and submit regulatory returns.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Gross Premium</TableHead>
                    <TableHead>Net Premium</TableHead>
                    <TableHead>Claims Paid</TableHead>
                    <TableHead>Solvency Margin</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportsList.map((r: any) => {
                    const data = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
                    const valErrors = typeof r.validation_errors === 'string' ? JSON.parse(r.validation_errors) : (r.validation_errors || []);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.report_type}</TableCell>
                        <TableCell>{r.period}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'submitted' || r.status === 'approved' ? 'default' : r.status === 'validation_failed' ? 'destructive' : 'secondary'}>
                            {r.status}
                          </Badge>
                          {valErrors.length > 0 && <span className="text-xs text-red-500 ml-1">({valErrors.length} errors)</span>}
                        </TableCell>
                        <TableCell>{fmt(data.grossPremium)}</TableCell>
                        <TableCell>{fmt(data.netPremium)}</TableCell>
                        <TableCell>{fmt(data.claimsPaid)}</TableCell>
                        <TableCell>{data.solvencyMargin ? `${data.solvencyMargin}%` : '—'}</TableCell>
                        <TableCell>{fmtDate(r.submitted_at)}</TableCell>
                        <TableCell className="space-x-1">
                          {(r.status === 'draft' || r.status === 'ingested') && (
                            <Button size="sm" variant="outline" onClick={() => validateReportMut.mutate({ id: r.id })} disabled={validateReportMut.isLoading}>Validate</Button>
                          )}
                          {r.status === 'validated' && (
                            <Button size="sm" onClick={() => submitReportMut.mutate({ id: r.id })} disabled={submitReportMut.isLoading}>Submit to NAICOM</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          {Object.entries(settingsByCategory).map(([cat, items]) => (
            <Card key={cat}>
              <CardHeader><CardTitle className="capitalize">{cat} Settings</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(items as any[]).map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-sm">{s.key}</TableCell>
                        <TableCell className="font-medium">{typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{s.description}</TableCell>
                        <TableCell className="text-sm">{fmtDate(s.updated_at)}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => { setEditDialog({ type: 'editSetting', data: s }); setFormData({ value: typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value) }); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Edit Dialogs */}
      <Dialog open={!!editDialog} onOpenChange={(o) => { if (!o) setEditDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editDialog?.type === 'editSetting' && 'Edit Setting'}
              {editDialog?.type === 'editRate' && 'Edit Rate Table'}
              {editDialog?.type === 'newRate' && 'New Rate Table'}
              {editDialog?.type === 'newProduct' && 'New Insurance Product'}
            </DialogTitle>
            <DialogDescription>Make changes below and save.</DialogDescription>
          </DialogHeader>

          {editDialog?.type === 'editSetting' && (
            <div className="space-y-3">
              <div><Label>Key</Label><Input value={editDialog.data?.key || ''} disabled /></div>
              <div><Label>Value</Label><Input value={formData.value || ''} onChange={e => setFormData({ ...formData, value: e.target.value })} /></div>
            </div>
          )}

          {(editDialog?.type === 'editRate' || editDialog?.type === 'newRate') && (
            <div className="space-y-3">
              {editDialog.type === 'newRate' && (
                <>
                  <div><Label>Name</Label><Input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Motor Third Party 2026" /></div>
                  <div><Label>Product Type</Label>
                    <Select value={formData.productType || 'Auto'} onValueChange={v => setFormData({ ...formData, productType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Auto', 'Health', 'Life', 'Property', 'Marine', 'Aviation', 'Agricultural', 'Engineering', 'Commercial'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div><Label>Base Rate (%)</Label><Input type="number" step="0.0001" value={formData.baseRate || ''} onChange={e => setFormData({ ...formData, baseRate: e.target.value })} /></div>
              {editDialog.type === 'editRate' && (
                <div><Label>Status</Label>
                  <Select value={formData.status || 'active'} onValueChange={v => setFormData({ ...formData, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="pending">Pending</SelectItem></SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Effective Date</Label><Input type="date" value={formData.effectiveDate || ''} onChange={e => setFormData({ ...formData, effectiveDate: e.target.value })} /></div>
              <div><Label>Expiry Date</Label><Input type="date" value={formData.expiryDate || ''} onChange={e => setFormData({ ...formData, expiryDate: e.target.value })} /></div>
            </div>
          )}

          {editDialog?.type === 'newProduct' && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              <div><Label>Product Name</Label><Input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Cyber Insurance" /></div>
              <div><Label>Category</Label>
                <Select value={formData.category || 'Motor'} onValueChange={v => setFormData({ ...formData, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Motor', 'Health', 'Life', 'Property', 'Marine', 'Aviation', 'Agricultural', 'Engineering', 'Commercial', 'Liability', 'Specialty'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Sub-Category</Label><Input value={formData.subCategory || ''} onChange={e => setFormData({ ...formData, subCategory: e.target.value })} placeholder="e.g., Third Party Only" /></div>
              <div><Label>Description</Label><Textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={2} /></div>
              <div><Label>NAICOM Class</Label><Input value={formData.naicomClass || ''} onChange={e => setFormData({ ...formData, naicomClass: e.target.value })} placeholder="Motor Vehicle Comprehensive" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Min Premium (₦)</Label><Input type="number" value={formData.minPremium || ''} onChange={e => setFormData({ ...formData, minPremium: e.target.value })} /></div>
                <div><Label>Max Premium (₦)</Label><Input type="number" value={formData.maxPremium || ''} onChange={e => setFormData({ ...formData, maxPremium: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Min Sum Assured (₦)</Label><Input type="number" value={formData.minSumAssured || ''} onChange={e => setFormData({ ...formData, minSumAssured: e.target.value })} /></div>
                <div><Label>Max Sum Assured (₦)</Label><Input type="number" value={formData.maxSumAssured || ''} onChange={e => setFormData({ ...formData, maxSumAssured: e.target.value })} /></div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Cancel</Button>
            <Button onClick={() => {
              if (editDialog?.type === 'editSetting') {
                let parsedVal;
                try { parsedVal = JSON.parse(formData.value); } catch { parsedVal = formData.value; }
                updateSettingMut.mutate({ id: editDialog.data.id, value: parsedVal });
              }
              if (editDialog?.type === 'editRate') updateRateMut.mutate({ id: editDialog.data.id, baseRate: Number(formData.baseRate), status: formData.status, expiryDate: formData.expiryDate || null });
              if (editDialog?.type === 'newRate') createRateMut.mutate({ name: formData.name, productType: formData.productType, baseRate: Number(formData.baseRate), effectiveDate: formData.effectiveDate, expiryDate: formData.expiryDate || null });
              if (editDialog?.type === 'newProduct') createProductMut.mutate(formData);
              setEditDialog(null);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminConfigCenter;
