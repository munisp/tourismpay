import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import KybApplicationDrawer from "@/components/kyb/KybApplicationDrawer";
import {
  CheckCircle, XCircle, Clock, FileCheck, Building2,
  Loader2, RefreshCw, ChevronRight, AlertCircle, BarChart3, Download,
  CheckSquare, Square, ListChecks, Search, X,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Status helpers ───────────────────────────────────────────────────────────

const statusStyles: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  submitted: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  under_review: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  approved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  suspended: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

const BUCKET_COLORS = [
  "oklch(0.55 0.25 25)",
  "oklch(0.65 0.22 40)",
  "oklch(0.75 0.18 75)",
  "oklch(0.72 0.18 145)",
  "oklch(0.78 0.22 152)",
  "oklch(0.45 0.01 240)",
];

function DocCompletenessBar({ pct }: { pct: number }) {
  const color =
    pct >= 80 ? "oklch(0.78 0.22 152)" :
    pct >= 50 ? "oklch(0.82 0.18 75)" :
    "oklch(0.55 0.25 25)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function KybApplicationsDashboard() {
  const [, navigate] = useLocation();
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<{ id: number; name: string } | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [drawerApp, setDrawerApp] = useState<AppRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Bypass BIS dialog state ───────────────────────────────────────────────
  const [bypassDialogOpen, setBypassDialogOpen] = useState(false);
  const [bypassTarget, setBypassTarget] = useState<{ id: number; name: string } | null>(null);
  const [bypassReason, setBypassReason] = useState("");

  // ── Bulk selection state ──────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const utils = trpc.useUtils();

  const exportCsv = trpc.csvExport.kybApplications.useMutation({
    onSuccess: (result) => {
      downloadCsv(result.csv, result.filename);
      toast.success(`Exported ${result.rowCount} KYB applications`);
    },
    onError: (err) => toast.error(`Export failed: ${err.message}`),
  });

  const { data: stats, refetch: refetchStats } = trpc.kybApplications.stats.useQuery();
  const { data: scoreDistribution = [] } = trpc.kybApplications.complianceScoreDistribution.useQuery();
  const { data: apps, isLoading, refetch: refetchApps } = trpc.kybApplications.listAll.useQuery(
    filterStatus ? { status: filterStatus as any } : undefined,
    { refetchInterval: 30_000 }
  );

  const approveMutation = trpc.kybApplications.approve.useMutation({
    onSuccess: (data) => {
      toast.success(`Application #${data.id} approved`);
      utils.kybApplications.listAll.invalidate();
      utils.kybApplications.stats.invalidate();
      utils.kybApplications.complianceScoreDistribution.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMutation = trpc.kybApplications.reject.useMutation({
    onSuccess: (data) => {
      toast.success(`Application #${data.id} rejected`);
      setRejectDialogOpen(false);
      setRejectNotes("");
      setRejectTarget(null);
      utils.kybApplications.listAll.invalidate();
      utils.kybApplications.stats.invalidate();
      utils.kybApplications.complianceScoreDistribution.invalidate();
    },
     onError: (err) => toast.error(err.message),
  });

  // ── Bulk-approvable rows (submitted or under_review only) ─────────────
  type AppRow = NonNullable<typeof apps>[number];

  // Client-side search filter
  const filteredApps = useMemo(() => {
    if (!searchQuery.trim()) return apps ?? [];
    const q = searchQuery.toLowerCase();
    return (apps ?? []).filter((a: AppRow) =>
      (a.establishmentName ?? "").toLowerCase().includes(q) ||
      (a.country ?? "").toLowerCase().includes(q) ||
      (a.businessType ?? "").toLowerCase().includes(q) ||
      String(a.id).includes(q)
    );
  }, [apps, searchQuery]);

  const approvableApps = useMemo(
    () => filteredApps.filter((a: AppRow) => a.status === "submitted" || a.status === "under_review"),
    [filteredApps]
  );

  const allApprovableSelected =
    approvableApps.length > 0 && approvableApps.every((a: AppRow) => selectedIds.has(a.id));;
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allApprovableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(approvableApps.map((a: AppRow) => a.id)));
    }
  };

  const toggleRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Sequential bulk approve with progress toast
  const handleBulkApprove = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkApproving(true);
    setBulkProgress({ done: 0, total: ids.length });

    const toastId = toast.loading(`Approving 0 / ${ids.length} applications…`);
    let done = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        await approveMutation.mutateAsync({ applicationId: id });
        done++;
      } catch {
        failed++;
      }
      setBulkProgress({ done, total: ids.length });
      toast.loading(`Approving ${done} / ${ids.length} applications…`, { id: toastId });
    }

    toast.dismiss(toastId);
    if (failed === 0) {
      toast.success(`All ${done} applications approved successfully`);
    } else {
      toast.warning(`${done} approved, ${failed} failed — check individual rows`);
    }

    setSelectedIds(new Set());
    setBulkApproving(false);
    setBulkProgress(null);
    utils.kybApplications.listAll.invalidate();
    utils.kybApplications.stats.invalidate();
    utils.kybApplications.complianceScoreDistribution.invalidate();
  };

  const statusFilters = [
    { label: "All", value: undefined },
    { label: "Draft", value: "draft" },
    { label: "Submitted", value: "submitted" },
    { label: "Under Review", value: "under_review" },
    { label: "Approved", value: "approved" },
    { label: "Rejected", value: "rejected" },
  ];

  const openDrawer = (app: AppRow) => {
    setDrawerApp(app);
    setDrawerOpen(true);
  };

  return (
    <div className="p-6 min-h-full">
      <PageHeader
        title="KYB Applications"
        subtitle="Review and approve business verification applications"
        actions={
          <div className="flex gap-2">
            {someSelected && (
              <Button
                size="sm"
                className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={handleBulkApprove}
                disabled={bulkApproving}
              >
                {bulkApproving ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {bulkProgress ? `${bulkProgress.done}/${bulkProgress.total}` : "Approving…"}
                  </>
                ) : (
                  <>
                    <ListChecks className="w-3 h-3" />
                    Approve Selected ({selectedIds.size})
                  </>
                )}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-border bg-white/5"
              onClick={() => exportCsv.mutate({})}
              disabled={exportCsv.isPending}
            >
              <Download className="w-3 h-3 mr-1" />
              {exportCsv.isPending ? "Exporting…" : "Export CSV"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-border bg-white/5"
              onClick={() => { refetchStats(); refetchApps(); setSelectedIds(new Set()); }}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total" value={stats?.total ?? "—"} icon={BarChart3} color="blue" />
        <StatCard label="Submitted" value={stats?.submitted ?? "—"} icon={Clock} color="amber" />
        <StatCard label="Approved" value={stats?.approved ?? "—"} icon={CheckCircle} color="green" />
        <StatCard label="Rejected" value={stats?.rejected ?? "—"} icon={XCircle} color="crimson" />
      </div>

      {/* Compliance Score Distribution Chart */}
      <div className="glass-card p-4 mb-6 animate-fade-in-up opacity-0" style={{ animationFillMode: "forwards" }}>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Compliance Score Distribution
          </h3>
          <span className="text-xs text-muted-foreground ml-auto">Applications by score bucket</span>
        </div>
        {scoreDistribution.length === 0 ? (
          <div className="h-[120px] flex items-center justify-center text-xs text-muted-foreground">
            No compliance scores recorded yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={scoreDistribution} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.15 0.01 240)",
                  border: "1px solid oklch(0.25 0.01 240)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                labelStyle={{ color: "oklch(0.9 0 0)" }}
                itemStyle={{ color: "oklch(0.7 0 0)" }}
                formatter={(value: number) => [`${value} applications`, "Count"]}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {scoreDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={BUCKET_COLORS[index] ?? BUCKET_COLORS[4]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Search input */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9 pr-9 h-8 text-xs"
          placeholder="Search by establishment name, country, or business type…"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setSelectedIds(new Set()); }}
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(""); setSelectedIds(new Set()); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {statusFilters.map((f) => (
          <button
            key={String(f.value)}
            onClick={() => { setFilterStatus(f.value); setSelectedIds(new Set()); }}
            className={`text-[10px] font-mono uppercase px-3 py-1 rounded-full border transition-colors ${
              filterStatus === f.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white/5 text-muted-foreground border-border hover:border-primary/50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Bulk selection banner */}
      {someSelected && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-400">
          <ListChecks className="w-4 h-4 shrink-0" />
          <span>
            <strong>{selectedIds.size}</strong> application{selectedIds.size !== 1 ? "s" : ""} selected
            {approvableApps.length > 0 && (
              <> — <button className="underline underline-offset-2 hover:text-emerald-300" onClick={toggleSelectAll}>
                {allApprovableSelected ? "Deselect all" : `Select all ${approvableApps.length} approvable`}
              </button></>
            )}
          </span>
          <button
            className="ml-auto text-muted-foreground hover:text-foreground"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {/* Applications Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Applications
          </h3>
          <span className="text-xs text-muted-foreground font-mono">
            {filteredApps.length} shown{searchQuery ? ` (filtered from ${apps?.length ?? 0})` : ""}
          </span>
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50">
              {/* Select All checkbox */}
              <th className="p-3 w-8">
                {approvableApps.length > 0 && (
                  <Checkbox
                    checked={allApprovableSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all approvable applications"
                    className="border-border"
                  />
                )}
              </th>
              {["Establishment", "Country", "Type", "Step", "Doc Completeness", "Docs", "BIS", "Status", "Actions"].map((h) => (
                <th key={h} className="text-left p-3 text-muted-foreground font-medium uppercase tracking-wider text-[10px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-muted-foreground text-xs">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading applications...
                </td>
              </tr>
            ) : filteredApps.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-muted-foreground text-xs">
                  {searchQuery ? `No applications match “${searchQuery}”` : "No KYB applications found."}
                </td>
              </tr>
            ) : (
              filteredApps.map((app: AppRow) => {
                const isApprovable = app.status === "submitted" || app.status === "under_review";
                const isChecked = selectedIds.has(app.id);
                return (
                  <tr
                    key={app.id}
                    className={`border-b border-border/30 hover:bg-white/3 transition-colors cursor-pointer ${isChecked ? "bg-emerald-500/5" : ""}`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button, a, [role="checkbox"]')) return;
                      openDrawer(app);
                    }}
                  >
                    {/* Row checkbox */}
                    <td className="p-3 w-8" onClick={(e) => e.stopPropagation()}>
                      {isApprovable ? (
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleRow(app.id)}
                          aria-label={`Select application ${app.id}`}
                          className="border-border"
                        />
                      ) : (
                        <span className="w-4 h-4 block" />
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground truncate max-w-[140px]">
                          {app.establishmentName ?? `Est. #${app.establishmentId}`}
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="bg-white/10 text-foreground text-[9px] px-1.5 py-0.5 rounded font-mono">
                        {app.establishmentCountry ?? "—"}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground capitalize text-[10px]">
                      {app.establishmentType?.replace(/_/g, " ") ?? "—"}
                    </td>
                    <td className="p-3 font-mono text-muted-foreground text-[10px]">
                      {app.currentStep}/{app.totalSteps}
                    </td>
                    <td className="p-3 min-w-[120px]">
                      <DocCompletenessBar pct={app.docCompleteness ?? 0} />
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 text-[9px] font-mono">
                        <span className="text-emerald-400">{app.verifiedDocs}✓</span>
                        <span className="text-amber-400">{app.pendingDocs}⏳</span>
                        {app.rejectedDocs > 0 && <span className="text-red-400">{app.rejectedDocs}✗</span>}
                      </div>
                    </td>
                    <td className="p-3">
                      {/* BIS status badge */}
                      {(app as any).bisStatus === "completed" ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase bg-emerald-500/10 text-emerald-400 border-emerald-500/20">✓ Done</span>
                      ) : (app as any).bisStatus === "processing" ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase bg-blue-500/10 text-blue-400 border-blue-500/20">⏳ Running</span>
                      ) : (app as any).bisStatus === "pending" ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase bg-amber-500/10 text-amber-400 border-amber-500/20">⏳ Pending</span>
                      ) : (app as any).bisStatus === "failed" ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase bg-red-500/10 text-red-400 border-red-500/20">✗ Failed</span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase bg-muted/30 text-muted-foreground border-border">None</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase ${statusStyles[app.status] ?? statusStyles.draft}`}>
                        {app.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {isApprovable && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                              disabled={approveMutation.isPending || bulkApproving}
                              onClick={(e) => {
                                e.stopPropagation();
                                const hasBis = (app as any).bisStatus === "completed";
                                if (!hasBis) {
                                  setBypassTarget({ id: app.id, name: app.establishmentName ?? `#${app.id}` });
                                  setBypassReason("");
                                  setBypassDialogOpen(true);
                                } else {
                                  approveMutation.mutate({ applicationId: app.id });
                                }
                              }}
                              title={(app as any).bisStatus !== "completed" ? "Approve (no BIS — will prompt bypass)" : "Approve"}
                            >
                              {approveMutation.isPending && approveMutation.variables?.applicationId === app.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <CheckCircle className="w-3 h-3" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRejectTarget({ id: app.id, name: app.establishmentName ?? `#${app.id}` });
                                setRejectDialogOpen(true);
                              }}
                              title="Reject"
                            >
                              <XCircle className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          onClick={(e) => { e.stopPropagation(); navigate(`/admin/kyb-documents?establishmentId=${app.establishmentId}`); }}
                          title="View Documents"
                        >
                          <FileCheck className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Application Detail Drawer */}
      <KybApplicationDrawer
        app={drawerApp}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Bypass BIS Dialog */}
      <Dialog open={bypassDialogOpen} onOpenChange={(open) => { setBypassDialogOpen(open); if (!open) setBypassReason(""); }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              Override BIS Gate
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs text-amber-300 font-medium mb-1">⚠️ No completed BIS investigation</p>
              <p className="text-xs text-muted-foreground">
                Approving <strong className="text-foreground">{bypassTarget?.name}</strong> without a completed Background Investigation (BIS) is a compliance exception.
                This action will be permanently recorded in the audit log.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bypass-reason" className="text-xs text-muted-foreground">
                Bypass Reason <span className="text-red-400">*</span>
                <span className="ml-1 text-muted-foreground/60">(min. 10 characters)</span>
              </Label>
              <Textarea
                id="bypass-reason"
                value={bypassReason}
                onChange={(e) => setBypassReason(e.target.value)}
                placeholder="e.g. Establishment verified through alternative due-diligence process. Director confirmed identity via video KYC on 2026-03-01..."
                className="bg-background border-border text-foreground text-sm min-h-[100px]"
              />
              <p className="text-[10px] text-muted-foreground">{bypassReason.trim().length}/1000 characters</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBypassDialogOpen(false); setBypassReason(""); }}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={bypassReason.trim().length < 10 || approveMutation.isPending}
              onClick={() => {
                if (bypassTarget) {
                  approveMutation.mutate(
                    { applicationId: bypassTarget.id, bypassBisCheck: true, bypassReason: bypassReason.trim() },
                    {
                      onSuccess: () => {
                        setBypassDialogOpen(false);
                        setBypassReason("");
                        setBypassTarget(null);
                      },
                    }
                  );
                }
              }}
            >
              {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Approve with Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Reject KYB Application</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Rejecting application for <strong className="text-foreground">{rejectTarget?.name}</strong>.
              Please provide a reason that will be sent to the applicant.
            </p>
            <div className="space-y-2">
              <Label htmlFor="reject-notes" className="text-xs text-muted-foreground">Rejection Reason *</Label>
              <Textarea
                id="reject-notes"
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="e.g. Documents are expired, missing director ID, registration number mismatch..."
                className="bg-background border-border text-foreground text-sm min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectNotes.trim() || rejectMutation.isPending}
              onClick={() => {
                if (rejectTarget) {
                  rejectMutation.mutate({ applicationId: rejectTarget.id, reviewNotes: rejectNotes.trim() });
                }
              }}
            >
              {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Reject Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
