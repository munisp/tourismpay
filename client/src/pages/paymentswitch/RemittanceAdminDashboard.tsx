// @ts-nocheck
import { useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/lib/trpc';
import { TransactionExport } from '@/components/ps-TransactionExport';
import { toast } from 'sonner';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  Filter,
  Loader2,
  MoreVertical,
  RefreshCw,
  Search,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';

export default function RemittanceAdminDashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Remittance Management</h1>
              <p className="text-muted-foreground mt-1">
                Monitor and manage crypto-to-fiat remittance transactions
              </p>
            </div>
            <Button>
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>
      </div>

      <div className="container py-8">
        {/* Stats Overview */}
        <StatsOverview />

        {/* Main Dashboard */}
        <Tabs defaultValue="transactions" className="mt-8">
          <TabsList>
            <TabsTrigger value="transactions">
              <Wallet className="w-4 h-4 mr-2" />
              Transactions
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="w-4 h-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="webhooks">
              <Activity className="w-4 h-4 mr-2" />
              Webhooks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="mt-6">
            <div className="space-y-6">
              <TransactionExport />
              <TransactionsList />
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <AnalyticsDashboard />
          </TabsContent>

          <TabsContent value="webhooks" className="mt-6">
            <WebhookLogs />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * Stats Overview Component — live data from tRPC
 */
function StatsOverview() {
  const { data: remittanceData, isLoading } = trpc.paymentSwitch.listRemittances.useQuery({ limit: 100 });
  const { data: summary } = trpc.paymentSwitch.settlementSummary.useQuery({});

  const stats = useMemo(() => {
    const items = remittanceData?.items ?? [];
    const totalVolume = items.reduce((s: number, r: any) => s + Number(r.sendingAmount ?? r.amount ?? 0), 0);
    const completed = items.filter((r: any) => r.status === 'completed');
    const pending = items.filter((r: any) => r.status === 'pending');
    const successRate = items.length > 0 ? ((completed.length / items.length) * 100).toFixed(1) : '0.0';
    return {
      totalVolume,
      totalTransactions: remittanceData?.total ?? 0,
      successRate: Number(successRate),
      pendingCount: pending.length,
      completedToday: completed.length,
    };
  }, [remittanceData]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Volume</p>
              <p className="text-2xl font-bold mt-1">
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : stats.totalVolume.toLocaleString()}
              </p>
              <p className="text-xs text-green-600 mt-1 flex items-center">
                <TrendingUp className="w-3 h-3 mr-1" />
                Live data
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Transactions</p>
              <p className="text-2xl font-bold mt-1">
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : stats.totalTransactions}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.completedToday} completed
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <Wallet className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Success Rate</p>
              <p className="text-2xl font-bold mt-1">
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : `${stats.successRate}%`}
              </p>
              <p className="text-xs text-green-600 mt-1">
                {stats.successRate >= 98 ? 'Excellent performance' : 'Needs attention'}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold mt-1">
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : stats.pendingCount}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                awaiting processing
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
              <Clock className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Transactions List Component — live data from tRPC with server-side search
 */
function TransactionsList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 350);
  };

  const { data: remittanceData, isLoading, refetch } = trpc.paymentSwitch.listRemittances.useQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    status: statusFilter !== 'all' ? statusFilter as any : undefined,
    search: debouncedSearch.trim() || undefined,
  });

  const transactions = remittanceData?.items ?? [];
  const total = remittanceData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      completed: 'default',
      processing: 'secondary',
      failed: 'destructive',
      pending: 'outline',
      reversed: 'outline',
      refunded: 'outline',
    };
    const icons: Record<string, any> = {
      completed: <CheckCircle2 className="w-3 h-3 mr-1" />,
      processing: <Clock className="w-3 h-3 mr-1" />,
      failed: <XCircle className="w-3 h-3 mr-1" />,
      pending: <Clock className="w-3 h-3 mr-1" />,
    };
    return (
      <Badge variant={variants[status] ?? 'outline'} className="flex items-center w-fit">
        {icons[status]}
        {status}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>All Transactions</CardTitle>
            <CardDescription>
              {isLoading ? 'Loading...' : `${remittanceData?.total ?? 0} total remittances`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, ID..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading transactions...
          </div>
        )}
        {!isLoading && transactions.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {debouncedSearch ? `No results for "${debouncedSearch}"` : 'No transactions found'}
          </div>
        )}
        {!isLoading && transactions.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Remittance ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount Sent</TableHead>
                <TableHead>Amount Received</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx: any) => (
                <TableRow key={tx.id}>
                  <TableCell className="font-mono text-sm">
                    {tx.referenceId ?? tx.id}
                  </TableCell>
                  <TableCell>{getStatusBadge(tx.status)}</TableCell>
                  <TableCell>
                    {Number(tx.sendingAmount ?? tx.amount ?? 0).toLocaleString()} {tx.sendingCurrency ?? tx.currency ?? ''}
                  </TableCell>
                  <TableCell>
                    {Number(tx.receivingAmount ?? 0).toLocaleString()} {tx.receivingCurrency ?? ''}
                  </TableCell>
                  <TableCell>{tx.receiverPhone ?? tx.receiverId ?? '—'}</TableCell>
                  <TableCell>
                    {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Transaction Details</DialogTitle>
                          <DialogDescription>
                            Remittance ID: {tx.referenceId ?? tx.id}
                          </DialogDescription>
                        </DialogHeader>
                        <TransactionDetails remittanceId={tx.id} />
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
           </Table>
        )}
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
/**
 * Transaction Details Component — live data from tRPC
 */
function TransactionDetails({ remittanceId }: { remittanceId: string }) {
  const { data: remittance, isLoading } = trpc.paymentSwitch.getRemittance.useQuery({ id: remittanceId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading details...
      </div>
    );
  }

  if (!remittance) {
    return <div className="text-center py-8 text-muted-foreground">Remittance not found</div>;
  }

  const fields = [
    { label: 'Status', value: remittance.status },
    { label: 'Sending Amount', value: `${Number(remittance.sendingAmount ?? 0).toLocaleString()} ${remittance.sendingCurrency ?? ''}` },
    { label: 'Receiving Amount', value: `${Number(remittance.receivingAmount ?? 0).toLocaleString()} ${remittance.receivingCurrency ?? ''}` },
    { label: 'Receiver Phone', value: remittance.receiverPhone ?? '—' },
    { label: 'Created', value: remittance.createdAt ? new Date(remittance.createdAt).toLocaleString() : '—' },
    { label: 'Updated', value: remittance.updatedAt ? new Date(remittance.updatedAt).toLocaleString() : '—' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => (
          <div key={f.label} className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">{f.label}</p>
            <p className="font-medium text-sm">{f.value}</p>
          </div>
        ))}
      </div>
      <Separator />
      <div className="flex gap-2">
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>
    </div>
  );
}

/**
 * Analytics Dashboard Component — live data from tRPC settlementSummary
 */
function AnalyticsDashboard() {
  const { data: summary, isLoading } = trpc.paymentSwitch.settlementSummary.useQuery({});

  const byCurrency = useMemo(() => {
    if (!summary?.byCurrency || summary.byCurrency.length === 0) return [];
    const total = summary.byCurrency.reduce((s: number, r: any) => s + Number(r.totalAmount ?? 0), 0);
    return summary.byCurrency.map((r: any) => ({
      currency: r.currency,
      volume: Number(r.totalAmount ?? 0),
      percentage: total > 0 ? Math.round((Number(r.totalAmount ?? 0) / total) * 100) : 0,
    }));
  }, [summary]);

  const byStatus = useMemo(() => summary?.byStatus ?? [], [summary]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Volume by Currency</CardTitle>
          <CardDescription>Settlement distribution by currency</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
            </div>
          )}
          {!isLoading && byCurrency.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">No settlement data yet</div>
          )}
          <div className="space-y-4">
            {byCurrency.map((item: any) => (
              <div key={item.currency}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{item.currency}</span>
                  <span className="text-sm text-muted-foreground">
                    {item.volume.toLocaleString()} ({item.percentage}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settlements by Status</CardTitle>
          <CardDescription>Breakdown of settlement pipeline</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
            </div>
          )}
          {!isLoading && byStatus.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">No settlement data yet</div>
          )}
          <div className="space-y-4">
            {byStatus.map((item: any) => (
              <div key={item.status} className="flex items-center justify-between">
                <div>
                  <p className="font-medium capitalize">{item.status}</p>
                  <p className="text-sm text-muted-foreground">{item.count} settlements</p>
                </div>
                <Badge variant={item.status === 'completed' ? 'default' : item.status === 'failed' ? 'destructive' : 'secondary'}>
                  {Number(item.totalAmount ?? 0).toLocaleString()}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Webhook Logs Component — live data from tRPC
 */
function WebhookLogs() {
  const { data: deliveries, isLoading, refetch } = trpc.webhooks.getDeliveries.useQuery({ limit: 50 });
  const retryMutation = trpc.webhooks.retryDelivery.useMutation({
    onSuccess: () => { toast.success('Delivery retried'); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Webhook Delivery Logs</CardTitle>
            <CardDescription>Monitor webhook event delivery status</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading deliveries...
          </div>
        )}
        {!isLoading && (!deliveries || deliveries.length === 0) && (
          <div className="text-center py-8 text-muted-foreground text-sm">No webhook deliveries yet</div>
        )}
        {!isLoading && deliveries && deliveries.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-sm">{d.eventType ?? d.event ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground max-w-[160px] truncate">
                    {d.endpointUrl ?? d.webhookId ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.status === 'success' ? 'default' : d.status === 'failed' || d.status === 'exhausted' ? 'destructive' : 'secondary'}>
                      {d.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{d.attemptCount ?? d.attempts ?? 1}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {d.createdAt ? new Date(d.createdAt).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {(d.status === 'failed' || d.status === 'exhausted') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => retryMutation.mutate({ deliveryId: d.id })}
                        disabled={retryMutation.isPending}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
