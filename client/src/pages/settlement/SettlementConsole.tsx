import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  DollarSign,
  RefreshCw,
  CheckSquare,
  Ban,
  Download,
} from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { usePdfDownload } from "@/hooks/usePdfDownload";

type SettlementStatus = "pending" | "processing" | "completed" | "failed" | "disputed";

const statusConfig: Record<SettlementStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pending", color: "bg-amber-500/10 text-amber-400 border-amber-500/30", icon: Clock },
  processing: { label: "Processing", color: "bg-blue-500/10 text-blue-400 border-blue-500/30", icon: RefreshCw },
  completed: { label: "Completed", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", icon: CheckCircle },
  failed: { label: "Failed", color: "bg-red-500/10 text-red-400 border-red-500/30", icon: XCircle },
  disputed: { label: "Disputed", color: "bg-orange-500/10 text-orange-400 border-orange-500/30", icon: AlertTriangle },
};

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function SettlementConsole() {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<SettlementStatus | "all">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data: stats, isLoading: statsLoading } = trpc.settlement.stats.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const { data: listData, isLoading: listLoading, refetch } = trpc.settlement.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }, { refetchInterval: 30_000 });
  const { data: dailyVolume } = trpc.settlement.dailyVolume.useQuery(undefined, {
    refetchInterval: 300_000,
  });

  const { downloadPdf, isDownloading: isPdfDownloading } = usePdfDownload();
  const pdfSettlementMut = trpc.pythonServices.pdfSettlementStatement.useMutation({
    onSuccess: async (data) => {
      await downloadPdf(data as any, `settlement-statement-${Date.now()}.pdf`);
    },
    onError: (err) => toast.error(`PDF failed: ${err.message}`),
  });

  const exportCsvMut = trpc.settlement.exportCsv.useMutation({
    onSuccess: (data) => {
      if (!data.csv) {
        toast.info("No settlements to export");
        return;
      }
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.rowCount} settlement(s) to ${data.filename}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const approveMut = trpc.settlement.approveBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.approved} settlement(s) approved and moved to processing`);
      setSelectedIds(new Set());
      utils.settlement.list.invalidate();
      utils.settlement.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMut = trpc.settlement.reject.useMutation({
    onSuccess: () => {
      toast.success("Settlement rejected");
      setRejectDialogOpen(false);
      setRejectId(null);
      setRejectReason("");
      utils.settlement.list.invalidate();
      utils.settlement.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const completeMut = trpc.settlement.markCompleted.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.completed} settlement(s) marked as completed`);
      setSelectedIds(new Set());
      utils.settlement.list.invalidate();
      utils.settlement.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const rows = listData?.rows ?? [];
  const total = listData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const selectedPending = rows.filter((r) => selectedIds.has(r.id) && r.status === "pending").map((r) => r.id);
  const selectedProcessing = rows.filter((r) => selectedIds.has(r.id) && r.status === "processing").map((r) => r.id);

  // SSE auto-refresh: listen for settlement status changes
  const sseRef = useRef<EventSource | null>(null);
  useEffect(() => {
    const es = new EventSource("/api/sse/settlements");
    sseRef.current = es;
    es.addEventListener("status_change", () => {
      utils.settlement.list.invalidate();
      utils.settlement.stats.invalidate();
    });
    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [utils]);

  return (
      <RoleGuard roles={["admin", "settlement_officer"]}>
      <div className="space-y-6">
        <PageHeader
          title="Settlement Console"
          subtitle="Review, approve, and manage payment settlement batches"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() =>
                  pdfSettlementMut.mutate({
                    participantName: "TourismPay Platform",
                    participantId: "platform",
                    settlementPeriod: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
                    netPosition: Number(stats?.totalAmountCompleted ?? 0),
                    currency: "USD",
                  })
                }
                disabled={pdfSettlementMut.isPending || isPdfDownloading}
              >
                {pdfSettlementMut.isPending || isPdfDownloading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                PDF Statement
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => exportCsvMut.mutate(statusFilter !== "all" ? { status: statusFilter } : undefined)}
                disabled={exportCsvMut.isPending}
              >
                <Download className="w-4 h-4" />
                {exportCsvMut.isPending ? "Exporting…" : "Export CSV"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
            </div>
          }
        />

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          ) : (
            <>
              <StatCard
                label="Pending"
                value={stats?.pending ?? 0}
                unit={`${fmt(stats?.totalAmountPending ?? 0)} awaiting`}
                icon={Clock}
                color="amber"
              />
              <StatCard
                label="Processing"
                value={stats?.processing ?? 0}
                unit="In-flight settlements"
                icon={RefreshCw}
                color="blue"
              />
              <StatCard
                label="Completed (30d)"
                value={stats?.completed ?? 0}
                unit={fmt(stats?.totalAmountCompleted ?? 0)}
                icon={CheckCircle}
                color="green"
              />
              <StatCard
                label="Failed / Disputed"
                value={(stats?.failed ?? 0) + (stats?.disputed ?? 0)}
                unit="Requires attention"
                icon={AlertTriangle}
                color="crimson"
              />
            </>
          )}
        </div>

        {/* Daily Volume Chart */}
        {dailyVolume && dailyVolume.length > 0 && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">Daily Settlement Volume (30d)</CardTitle>
              <CardDescription>Completed settlement amounts per day</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyVolume} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0 / 0.3)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                  <Tooltip
                    formatter={(v: number) => [fmt(v), "Volume"]}
                    contentStyle={{ background: "oklch(0.18 0.02 240)", border: "1px solid oklch(0.3 0 0)" }}
                  />
                  <Bar dataKey="volume" fill="oklch(0.65 0.18 240)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Settlement List */}
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-base">Settlements</CardTitle>
                <CardDescription>{total} total</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as SettlementStatus | "all"); setPage(0); setSelectedIds(new Set()); }}>
                  <SelectTrigger className="w-36 h-8 text-xs">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="disputed">Disputed</SelectItem>
                  </SelectContent>
                </Select>
                {selectedPending.length > 0 && (
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => approveMut.mutate({ ids: selectedPending })}
                    disabled={approveMut.isPending}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    Approve {selectedPending.length}
                  </Button>
                )}
                {selectedProcessing.length > 0 && (
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => completeMut.mutate({ ids: selectedProcessing })}
                    disabled={completeMut.isPending}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Mark Completed {selectedProcessing.length}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {listLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}
              </div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                No settlements found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="p-3 text-left w-8">
                        <Checkbox
                          checked={selectedIds.size === rows.length && rows.length > 0}
                          onCheckedChange={toggleAll}
                        />
                      </th>
                      <th className="p-3 text-left">Batch ID</th>
                      <th className="p-3 text-left">Participant</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-center">Txns</th>
                      <th className="p-3 text-left">Currency</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">Created</th>
                      <th className="p-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const cfg = statusConfig[row.status as SettlementStatus] ?? statusConfig.pending;
                      const Icon = cfg.icon;
                      return (
                        <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <Checkbox
                              checked={selectedIds.has(row.id)}
                              onCheckedChange={() => toggleSelect(row.id)}
                            />
                          </td>
                          <td className="p-3 font-mono text-xs text-muted-foreground">{row.batchId.slice(0, 12)}…</td>
                          <td className="p-3 font-mono text-xs">{row.participantId.slice(0, 12)}…</td>
                          <td className="p-3 text-right font-mono font-semibold">{fmt(row.totalAmount)}</td>
                          <td className="p-3 text-center">{row.transactionCount}</td>
                          <td className="p-3 text-xs">{row.currency}</td>
                          <td className="p-3">
                            <Badge variant="outline" className={`text-xs gap-1 ${cfg.color}`}>
                              <Icon className="w-3 h-3" />
                              {cfg.label}
                            </Badge>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {new Date(row.createdAt).toLocaleDateString()}
                          </td>
                          <td className="p-3">
                            {(row.status === "pending" || row.status === "processing") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                onClick={() => { setRejectId(row.id); setRejectDialogOpen(true); }}
                              >
                                <Ban className="w-3 h-3 mr-1" />
                                Reject
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-3 border-t border-border text-xs text-muted-foreground">
                <span>Page {page + 1} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-400">
                <Ban className="w-4 h-4" /> Reject Settlement
              </DialogTitle>
              <DialogDescription>
                This will mark the settlement as failed. Please provide a reason.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label htmlFor="reject-reason">Reason</Label>
              <Textarea
                id="reject-reason"
                placeholder="Explain why this settlement is being rejected..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={!rejectReason.trim() || rejectMut.isPending}
                onClick={() => {
                  if (rejectId && rejectReason.trim()) {
                    rejectMut.mutate({ id: rejectId, reason: rejectReason.trim() });
                  }
                }}
              >
                Confirm Rejection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
