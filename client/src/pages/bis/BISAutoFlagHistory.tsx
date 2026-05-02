/**
 * BISAutoFlagHistory.tsx
 *
 * Dashboard page that surfaces the bis_auto_flags table, showing every
 * wallet transaction that triggered an automatic BIS investigation.
 *
 * Features:
 *   - Paginated table with currency, amount, trigger reason, status
 *   - Filter by currency and trigger reason
 *   - Click-through to linked BIS investigation
 *   - Summary stats bar at the top
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Zap, RefreshCw, ChevronLeft, ChevronRight, ExternalLink,
  DollarSign, Activity, AlertTriangle, CheckCircle2, XCircle,
  TrendingUp, Filter,
} from "lucide-react";

const PAGE_SIZE = 20;

const CURRENCY_OPTIONS = [
  "GLOBAL", "USDC", "USD", "NGN", "KES", "GHS", "ZAR", "XOF", "EGP", "TZS", "UGX", "XLM",
];

type TriggerReason = "amount_threshold" | "velocity";

interface AutoFlagItem {
  id: number;
  walletTxId: string;
  userId: string;
  currency: string;
  amountUsd: string;
  triggerReason: string;
  thresholdUsd: string | null;
  bisInvestigationId: number | null;
  bisReferenceId: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: number;
}

function triggerBadge(reason: string) {
  if (reason === "amount_threshold") {
    return (
      <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/20">
        <DollarSign className="w-3 h-3 mr-1" />
        Amount
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">
      <Activity className="w-3 h-3 mr-1" />
      Velocity
    </Badge>
  );
}

function statusBadge(status: string) {
  if (status === "created") {
    return (
      <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Created
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs bg-red-500/10 text-red-400 border-red-500/20">
      <XCircle className="w-3 h-3 mr-1" />
      Failed
    </Badge>
  );
}

export default function BISAutoFlagHistory() {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(0);
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");
  const [reasonFilter, setReasonFilter] = useState<string>("all");

  const queryInput = useMemo(() => ({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    currency: currencyFilter !== "all" ? currencyFilter : undefined,
    triggerReason: reasonFilter !== "all" ? (reasonFilter as TriggerReason) : undefined,
  }), [page, currencyFilter, reasonFilter]);

  const { data, isLoading, refetch } = trpc.bisIntegration.getAutoFlagHistory.useQuery(queryInput);

  const items: AutoFlagItem[] = (data?.items as AutoFlagItem[] | undefined) ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Summary stats derived from current page
  const amountTriggers = items.filter((i) => i.triggerReason === "amount_threshold").length;
  const velocityTriggers = items.filter((i) => i.triggerReason === "velocity").length;
  const failedCount = items.filter((i) => i.status === "failed").length;
  const linkedCount = items.filter((i) => i.bisInvestigationId !== null).length;

  function handleFilterChange() {
    setPage(0);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-400" />
            Auto-Flag History
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Every wallet transaction that triggered an automatic BIS investigation.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="border-slate-700 text-slate-300 hover:bg-slate-800 bg-transparent"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-slate-900/60 border-slate-700">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <TrendingUp className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{total}</p>
                <p className="text-xs text-slate-400">Total Triggers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/60 border-slate-700">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <DollarSign className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{amountTriggers}</p>
                <p className="text-xs text-slate-400">Amount Threshold</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/60 border-slate-700">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Activity className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{velocityTriggers}</p>
                <p className="text-xs text-slate-400">Velocity</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/60 border-slate-700">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{failedCount}</p>
                <p className="text-xs text-slate-400">Failed Triggers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-slate-900/60 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200 flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400 whitespace-nowrap">Currency:</span>
              <Select
                value={currencyFilter}
                onValueChange={(v) => { setCurrencyFilter(v); handleFilterChange(); }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="all" className="text-white hover:bg-slate-700">All Currencies</SelectItem>
                  {CURRENCY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c} className="text-white hover:bg-slate-700">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400 whitespace-nowrap">Trigger:</span>
              <Select
                value={reasonFilter}
                onValueChange={(v) => { setReasonFilter(v); handleFilterChange(); }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="all" className="text-white hover:bg-slate-700">All Reasons</SelectItem>
                  <SelectItem value="amount_threshold" className="text-white hover:bg-slate-700">Amount Threshold</SelectItem>
                  <SelectItem value="velocity" className="text-white hover:bg-slate-700">Velocity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(currencyFilter !== "all" || reasonFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setCurrencyFilter("all"); setReasonFilter("all"); setPage(0); }}
                className="text-slate-400 hover:text-white"
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-slate-900/60 border-slate-700">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              Loading auto-flag history…
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Zap className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No auto-flag records found.</p>
              <p className="text-xs mt-1">
                Records appear here when wallet transactions exceed configured thresholds.
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400 font-medium">Transaction ID</TableHead>
                    <TableHead className="text-slate-400 font-medium">User ID</TableHead>
                    <TableHead className="text-slate-400 font-medium">Currency</TableHead>
                    <TableHead className="text-slate-400 font-medium text-right">Amount (USD)</TableHead>
                    <TableHead className="text-slate-400 font-medium">Trigger</TableHead>
                    <TableHead className="text-slate-400 font-medium">BIS Investigation</TableHead>
                    <TableHead className="text-slate-400 font-medium">Status</TableHead>
                    <TableHead className="text-slate-400 font-medium">Triggered At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} className="border-slate-800 hover:bg-slate-800/30">
                      <TableCell className="font-mono text-xs text-slate-300 max-w-[120px] truncate" title={item.walletTxId}>
                        {item.walletTxId.length > 14 ? `${item.walletTxId.slice(0, 14)}…` : item.walletTxId}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-400 max-w-[80px] truncate" title={item.userId}>
                        {item.userId.length > 10 ? `${item.userId.slice(0, 10)}…` : item.userId}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-mono border-slate-600 text-slate-300">
                          {item.currency}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-amber-300">
                        ${parseFloat(item.amountUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {item.thresholdUsd && (
                          <div className="text-xs text-slate-500 font-normal">
                            threshold: ${parseFloat(item.thresholdUsd).toLocaleString()}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{triggerBadge(item.triggerReason)}</TableCell>
                      <TableCell>
                        {item.bisInvestigationId && item.bisReferenceId ? (
                          <button
                            onClick={() => navigate(`/bis/${item.bisInvestigationId}`)}
                            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors font-mono"
                          >
                            {item.bisReferenceId}
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(item.status)}</TableCell>
                      <TableCell className="text-xs text-slate-400 whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
                  <p className="text-xs text-slate-400">
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} records
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                      className="h-7 px-2 text-slate-400 hover:text-white disabled:opacity-30"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-xs text-slate-400">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                      className="h-7 px-2 text-slate-400 hover:text-white disabled:opacity-30"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Link to admin threshold settings */}
      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin/bis-auto-flag-settings")}
          className="text-slate-400 hover:text-amber-400 text-xs"
        >
          <Zap className="w-3.5 h-3.5 mr-1" />
          Manage Thresholds
        </Button>
      </div>
    </div>
  );
}
