/**
 * Merchant Payout History — /merchant/payouts
 * Shows a merchant's settlement batches with status, amount, and dates.
 * Role-gated to merchant and admin.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { RoleGuard } from "@/components/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Banknote,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CalendarClock,
  Play,
  Pause,
} from "lucide-react";
import { toast } from "sonner";

type SettlementStatus = "pending" | "processing" | "completed" | "failed" | "disputed";

const STATUS_CONFIG: Record<SettlementStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  processing: { label: "Processing", variant: "default", icon: RefreshCw },
  completed: { label: "Completed", variant: "outline", icon: CheckCircle2 },
  failed: { label: "Failed", variant: "destructive", icon: XCircle },
  disputed: { label: "Disputed", variant: "destructive", icon: AlertCircle },
};

const PAGE_SIZE = 20;

function formatAmount(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function formatDate(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

const WEEKLY_DAYS = [
  { value: 0, label: "Sunday" }, { value: 1, label: "Monday" }, { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" }, { value: 4, label: "Thursday" }, { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export default function MerchantPayouts() {
  const [statusFilter, setStatusFilter] = useState<SettlementStatus | "all">("all");
  const [page, setPage] = useState(0);
  const [schedFreq, setSchedFreq] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [schedDay, setSchedDay] = useState<number>(1);

  const { data: scheduleData, refetch: refetchSchedule } = trpc.payoutSchedule.get.useQuery();
  const setScheduleMut = trpc.payoutSchedule.set.useMutation({
    onSuccess: (res) => { toast.success(res.message); refetchSchedule(); },
    onError: (err) => toast.error(err.message),
  });
  const toggleScheduleMut = trpc.payoutSchedule.toggle.useMutation({
    onSuccess: (res) => { toast.success(res.isActive ? "Schedule resumed" : "Schedule paused"); refetchSchedule(); },
    onError: (err) => toast.error(err.message),
  });

  const { data, isLoading, refetch } = trpc.settlement.myPayouts.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const summary = data?.summary;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <RoleGuard roles={["merchant", "admin"]}>
      <div className="container py-8 max-w-5xl">
        {/* Auto-Payout Schedule Card */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-primary" />
              Auto-Payout Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            {scheduleData && (
              <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
                <span className="text-muted-foreground">Current: <strong className="text-foreground capitalize">{scheduleData.frequency}</strong></span>
                <span className="text-muted-foreground">· Status: <strong className={scheduleData.isActive ? "text-emerald-500" : "text-amber-500"}>{scheduleData.isActive ? "Active" : "Paused"}</strong></span>
                {scheduleData.nextRunAt && (
                  <span className="text-muted-foreground">· Next run: <strong className="text-foreground">{new Date(scheduleData.nextRunAt).toLocaleDateString()}</strong></span>
                )}
                <Button size="sm" variant="outline" className="ml-auto h-7 text-xs"
                  onClick={() => toggleScheduleMut.mutate({ isActive: !scheduleData.isActive })}
                  disabled={toggleScheduleMut.isPending}>
                  {scheduleData.isActive ? <><Pause className="h-3 w-3 mr-1" />Pause</> : <><Play className="h-3 w-3 mr-1" />Resume</>}
                </Button>
              </div>
            )}
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Frequency</p>
                <Select value={schedFreq} onValueChange={(v) => setSchedFreq(v as typeof schedFreq)}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQUENCY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {schedFreq === "weekly" && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Day of Week</p>
                  <Select value={String(schedDay)} onValueChange={(v) => setSchedDay(Number(v))}>
                    <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{WEEKLY_DAYS.map((d) => <SelectItem key={d.value} value={String(d.value)} className="text-xs">{d.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {schedFreq === "monthly" && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Day of Month (1–28)</p>
                  <Select value={String(schedDay)} onValueChange={(v) => setSchedDay(Number(v))}>
                    <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <SelectItem key={d} value={String(d)} className="text-xs">{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <Button size="sm" className="h-8 text-xs"
                onClick={() => setScheduleMut.mutate({ frequency: schedFreq, preferredDay: schedDay })}
                disabled={setScheduleMut.isPending}>
                {setScheduleMut.isPending ? "Saving…" : "Save Schedule"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Payout History</h1>
            <p className="text-muted-foreground text-sm mt-1">
              View and track all your settlement batches
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Summary KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground">Total Paid Out</span>
              </div>
              <p className="text-xl font-bold text-green-600">
                {formatAmount(summary?.totalCompleted ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {summary?.countCompleted ?? 0} batches
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-yellow-500" />
                <span className="text-xs text-muted-foreground">Pending</span>
              </div>
              <p className="text-xl font-bold text-yellow-600">
                {formatAmount(summary?.totalPending ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {summary?.countPending ?? 0} batches
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 mb-1">
                <Banknote className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Total Batches</span>
              </div>
              <p className="text-xl font-bold">{total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">all time</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 mb-1">
                <RefreshCw className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-muted-foreground">Success Rate</span>
              </div>
              <p className="text-xl font-bold">
                {total > 0
                  ? `${Math.round(((summary?.countCompleted ?? 0) / total) * 100)}%`
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">completed</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm font-medium">Filter by status:</span>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as SettlementStatus | "all");
              setPage(0);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {(Object.keys(STATUS_CONFIG) as SettlementStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_CONFIG[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground ml-auto">
            {total} result{total !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                Loading payouts…
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                <Banknote className="h-10 w-10 opacity-30" />
                <p className="text-sm">No payout records found</p>
                {statusFilter !== "all" && (
                  <Button variant="ghost" size="sm" onClick={() => setStatusFilter("all")}>
                    Clear filter
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch ID</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Transactions</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Settled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const cfg = STATUS_CONFIG[row.status as SettlementStatus] ?? STATUS_CONFIG.pending;
                    const Icon = cfg.icon;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.batchId.slice(0, 12)}…
                        </TableCell>
                        <TableCell className="font-semibold">
                          {formatAmount(row.totalAmount, row.currency)}
                        </TableCell>
                        <TableCell className="text-center">{row.transactionCount}</TableCell>
                        <TableCell>
                          <Badge variant={cfg.variant} className="gap-1">
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(row.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(row.settledAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
