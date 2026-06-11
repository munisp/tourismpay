import { Link, useLocation } from "wouter";
import {
  Shield, Search, CheckCircle, AlertCircle, TrendingUp, RefreshCw,
  FileDown, Eye, Loader2, Clock, Flag, Wifi, ExternalLink, Download,
  CheckSquare, Square, X, ChevronDown, UserCheck, CalendarClock, Bell
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import RiskRing from "@/components/shared/RiskRing";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { useEffect, useRef, useState, useMemo } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskColor(score: number | null | undefined): string {
  if (score == null) return "oklch(0.55 0.01 264)";
  if (score >= 80) return "oklch(0.55 0.25 25)";
  if (score >= 60) return "oklch(0.62 0.22 25)";
  if (score >= 30) return "oklch(0.82 0.18 75)";
  return "oklch(0.78 0.22 152)";
}

const statusStyles: Record<string, string> = {
  pending: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  processing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  flagged: "bg-red-500/20 text-red-400 border-red-500/30",
  failed: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const BIS_PAGE_SIZE = 15;

// ─── Component ────────────────────────────────────────────────────────────────

export default function BISDashboard() {
  const [, navigate] = useLocation();
  const [bisPage, setBisPage] = useState(0);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleSelect = (id: number) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());

  const { data: stats, refetch: refetchStats } = trpc.bis.stats.useQuery(
    undefined,
    { refetchInterval: 30_000 }
  );
  const { data: slaStats } = trpc.bis.getSlaStats.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: slaBreachData, refetch: refetchBreaches } = trpc.bis.getSlaBreaches.useQuery(undefined, { refetchInterval: 60_000 });
  const slaBreaches = slaBreachData?.breaches ?? [];
  const { data: riskTrendData } = trpc.bis.getRiskTrend.useQuery(
    { weeks: 12 },
    { refetchInterval: 300_000 }
  );
  const riskTrend = riskTrendData?.trend ?? [];

  const { data: myAssignmentsData } = trpc.bis.getMyAssignments.useQuery(
    { status: "all", limit: 20, offset: 0 },
    { refetchInterval: 60_000 }
  );
  const myAssignments = myAssignmentsData?.items ?? [];
  const myOverdueCount = myAssignments.filter(a => a.isOverdue).length;
  const sendBreachAlertsMut = trpc.bis.sendSlaBreachAlerts.useMutation({
    onSuccess: (data) => {
      toast.success(`SLA breach alerts sent — ${data.alerted} analyst(s) notified`);
      refetchBreaches();
    },
    onError: (err) => toast.error(err.message),
  });
  const { data: investigations, refetch: refetchInvestigations, isLoading } = trpc.bis.list.useQuery(
    { limit: BIS_PAGE_SIZE, offset: bisPage * BIS_PAGE_SIZE },
    { refetchInterval: 30_000 }
  );
  const bisTotal = stats?.total ?? 0;
  const bisTotalPages = Math.max(1, Math.ceil(bisTotal / BIS_PAGE_SIZE));

  type InvRow = NonNullable<typeof investigations>[number];
  const invList: InvRow[] = investigations ?? [];

  const allSelected = invList.length > 0 && selectedIds.size === invList.length;
  const toggleSelectAll = () => {
    if (allSelected) clearSelection();
    else setSelectedIds(new Set(invList.map((inv) => inv.id)));
  };

  // Track previously-processing investigations and notify when they complete
  const prevStatusMap = useRef<Record<number, string>>({});
  useEffect(() => {
    if (!investigations) return;
    investigations.forEach((inv: InvRow) => {
      const prev = prevStatusMap.current[inv.id];
      if (prev === "processing" && (inv.status === "completed" || inv.status === "flagged" || inv.status === "failed")) {
        const label = inv.status === "completed" ? "✅ Completed" : inv.status === "flagged" ? "🚩 Flagged" : "❌ Failed";
        toast(`Investigation ${label}`, {
          description: `${inv.subjectFullName} (${inv.referenceId}) — ${inv.status}`,
          action: { label: "View", onClick: () => navigate(`/bis/report/${inv.id}`) },
          duration: 8000,
        });
      }
      prevStatusMap.current[inv.id] = inv.status;
    });
  }, [investigations]);

  // Bulk mutations
  const bulkUpdateMut = trpc.bis.bulkUpdateStatus.useMutation({
    onSuccess: (data) => {
      toast.success(`Updated ${data.successCount} investigation${data.successCount !== 1 ? "s" : ""}`);
      clearSelection();
      refetchInvestigations();
      refetchStats();
    },
    onError: (err) => toast.error(`Bulk update failed: ${err.message}`),
  });
  const bulkExportMut = trpc.bis.bulkExportCsv.useMutation({
    onSuccess: (data) => {
      if (!data.csv) { toast.info("No data to export."); return; }
      downloadCsv(data.csv, data.filename);
      toast.success(`Exported ${data.rowCount} investigations`);
    },
    onError: (err) => toast.error(`Bulk export failed: ${err.message}`),
  });

  // Bulk export notes — lazy query triggered by button click
  const [bulkNotesIds, setBulkNotesIds] = useState<number[]>([0]);
  const [bulkNotesFetching, setBulkNotesFetching] = useState(false);
  const bulkNotesQuery = trpc.bis.bulkExportNotes.useQuery(
    { investigationIds: bulkNotesIds, includeInternal: false },
    { enabled: false }
  );
  const handleBulkExportNotes = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkNotesIds(ids);
    setBulkNotesFetching(true);
    try {
      const result = await bulkNotesQuery.refetch();
      const data = result.data;
      if (!data) { toast.info("No notes to export."); return; }
      const blob = new Blob([data.text], { type: "text/plain;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = data.filename; link.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.totalNotes} notes from ${data.totalInvestigations} investigation(s)`);
    } catch (err: any) {
      toast.error(`Notes export failed: ${err.message}`);
    } finally {
      setBulkNotesFetching(false);
    }
  };

  // Export schedule state
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);
  const [schedFrequency, setSchedFrequency] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [schedIncludeInternal, setSchedIncludeInternal] = useState(false);
  const [countdownStr, setCountdownStr] = useState<string>("");
  const countdownToastFiredRef = useRef<string | null>(null); // tracks which nextRunAt we already toasted
  const { data: exportSchedule, refetch: refetchSchedule } = trpc.bis.getExportSchedule.useQuery();
  const { data: exportPreview } = trpc.bis.previewExport.useQuery(undefined, {
    enabled: showSchedulePanel && !!exportSchedule,
    refetchInterval: showSchedulePanel ? 30_000 : false,
  });

  useEffect(() => {
    function computeCountdown() {
      const nextRun = exportSchedule?.nextRunAt;
      if (!nextRun) { setCountdownStr(""); return; }
      const diff = new Date(nextRun).getTime() - Date.now();
      if (diff <= 0) { setCountdownStr("due now"); return; }
      const days = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
      const mins = Math.floor((diff % 3_600_000) / 60_000);
      if (days > 0) setCountdownStr(`in ${days}d ${hours}h`);
      else if (hours > 0) setCountdownStr(`in ${hours}h ${mins}m`);
      else setCountdownStr(`in ${mins}m`);
      // Fire a toast when within 1 hour of next run (once per scheduled run)
      if (diff <= 3_600_000 && exportSchedule?.enabled && countdownToastFiredRef.current !== String(nextRun)) {
        countdownToastFiredRef.current = String(nextRun);
        const minsLeft = Math.ceil(diff / 60_000);
        toast(`BIS export in ${minsLeft} min`, {
          description: "Your scheduled BIS notes export is about to run. Adjust filters in the schedule panel if needed.",
          duration: 10_000,
          action: { label: "Open", onClick: () => setShowSchedulePanel(true) },
        });
      }
    }
    computeCountdown();
    const id = setInterval(computeCountdown, 60_000);
    return () => clearInterval(id);
  }, [exportSchedule?.nextRunAt]);
  const setExportScheduleMut = trpc.bis.setExportSchedule.useMutation({
    onSuccess: (data) => {
      toast.success(`Export scheduled — next run ${new Date(data.nextRunAt).toLocaleDateString()}`);
      refetchSchedule();
      setShowSchedulePanel(false);
    },
    onError: (err) => toast.error(`Failed to save schedule: ${err.message}`),
  });
  const deleteExportScheduleMut = trpc.bis.deleteExportSchedule.useMutation({
    onSuccess: () => { toast.success("Export schedule removed"); refetchSchedule(); },
    onError: (err) => toast.error(`Failed to remove schedule: ${err.message}`),
  });
  const toggleExportScheduleMut = trpc.bis.toggleExportSchedule.useMutation({
    onSuccess: (data) => {
      toast.success(data.enabled ? "Export schedule resumed" : "Export schedule paused");
      refetchSchedule();
    },
    onError: (err) => toast.error(`Failed to toggle schedule: ${err.message}`),
  });

  const exportCsv = trpc.csvExport.bisInvestigations.useMutation({
    onSuccess: (result) => {
      downloadCsv(result.csv, result.filename);
      toast.success(`Exported ${result.rowCount} investigations`);
    },
    onError: (err) => toast.error(`Export failed: ${err.message}`),
  });

  const generateReportMutation = trpc.bisReport.generate.useMutation({
    onSuccess: (data) => {
      if (data.fileUrl) {
        window.open(data.fileUrl, "_blank");
      }
    },
    onError: (err) => {
      logger.error("Report generation failed", { err });
    },
  });

  // Build risk distribution data from live investigations
  const riskBuckets = [
    { range: "0–20", count: 0 },
    { range: "21–40", count: 0 },
    { range: "41–60", count: 0 },
    { range: "61–80", count: 0 },
    { range: "81–100", count: 0 },
  ];
  invList.forEach((inv) => {
    const s = inv.riskScore ?? 0;
    if (s <= 20) riskBuckets[0].count++;
    else if (s <= 40) riskBuckets[1].count++;
    else if (s <= 60) riskBuckets[2].count++;
    else if (s <= 80) riskBuckets[3].count++;
    else riskBuckets[4].count++;
  });

  return (
    <div className="p-6 min-h-full">
      <PageHeader
        title="BIS Dashboard"
        subtitle="AI-powered employee background investigation across Africa"
        actions={
          <div className="flex gap-2">
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
              className={`h-7 text-xs border-border bg-white/5 relative ${exportSchedule && !exportSchedule.enabled ? "border-amber-500/40" : ""}`}
              onClick={() => setShowSchedulePanel((v) => !v)}
              title={exportSchedule && !exportSchedule.enabled ? "Export schedule is paused" : undefined}
            >
              <CalendarClock className="w-3 h-3 mr-1" />
              {exportSchedule?.enabled ? "Schedule ✓" : exportSchedule && exportSchedule.enabled === false ? "Schedule ✓" : "Schedule Export"}
              {exportSchedule && exportSchedule.enabled === false && (
                <span className="ml-1.5 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 leading-none">
                  Paused
                </span>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-border bg-white/5"
              onClick={() => { refetchStats(); refetchInvestigations(); }}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
            <Link href="/bis/new">
              <Button className="bg-primary text-primary-foreground h-8 text-xs">
                <Search className="w-3.5 h-3.5 mr-1.5" /> New Investigation
              </Button>
            </Link>
          </div>
        }
      />

      {/* Export Schedule Panel */}
      {showSchedulePanel && (
        <div className="glass-card p-5 mb-4 border border-blue-500/20 animate-fade-in-up opacity-0" style={{ animationFillMode: "forwards" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                Schedule Weekly Export
              </h3>
              {exportSchedule?.enabled && (
                <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                  Active — {countdownStr || new Date(exportSchedule.nextRunAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <button onClick={() => setShowSchedulePanel(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Automatically generate and deliver a BIS notes export to your in-app notifications on a recurring schedule.
          </p>
          {/* Last run history */}
          {exportSchedule?.lastRunAt != null ? (
            <div className="flex flex-wrap items-center gap-4 mb-4 px-3 py-2 rounded-lg bg-white/3 border border-border/20">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                <span className="font-medium text-foreground">Last run:</span>
                <span>{new Date(exportSchedule.lastRunAt).toLocaleString()}</span>
              </div>
              {exportSchedule.lastExportNoteCount != null && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground">{exportSchedule.lastExportNoteCount}</span>
                  <span>note{exportSchedule.lastExportNoteCount !== 1 ? "s" : ""} exported</span>
                </div>
              )}
            </div>
          ) : exportSchedule?.enabled ? (
            <div className="mb-4 px-3 py-2 rounded-lg bg-white/3 border border-border/20 text-[10px] text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block mr-1.5" />
              No exports run yet — first delivery {countdownStr ? countdownStr : `on ${new Date(exportSchedule.nextRunAt).toLocaleDateString()}`}
            </div>
          ) : null}
          {/* Export preview summary */}
          {exportPreview && (
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1.5">Export Preview (dry run)</p>
              <div className="flex flex-wrap gap-4">
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">{exportPreview.investigationCount}</p>
                  <p className="text-[10px] text-muted-foreground">Investigations</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">{exportPreview.noteCount}</p>
                  <p className="text-[10px] text-muted-foreground">Notes</p>
                </div>
                {exportPreview.dateRange && (
                  <div className="text-center">
                    <p className="text-xs font-mono text-foreground">
                      {new Date(exportPreview.dateRange.from).toLocaleDateString()} – {new Date(exportPreview.dateRange.to).toLocaleDateString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Date range</p>
                  </div>
                )}
                <div className="text-center">
                  <p className="text-xs font-semibold text-foreground capitalize">{exportPreview.frequency ?? schedFrequency}</p>
                  <p className="text-[10px] text-muted-foreground">Frequency</p>
                </div>
              </div>
              {exportPreview.noteCount === 0 && (
                <p className="text-[10px] text-amber-400 mt-1.5">No notes match the current filters — the export will be empty.</p>
              )}
              {(exportPreview as { settlementSummary?: { totalSettled: number; currency: string; participantCount: number } }).settlementSummary && (
                <div className="mt-2 pt-2 border-t border-blue-500/20">
                  <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1">Settlement Summary (PaymentSwitch)</p>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-xs font-bold text-foreground">{(exportPreview as any).settlementSummary.currency} {Number((exportPreview as any).settlementSummary.totalSettled).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">Total Settled</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-foreground">{(exportPreview as any).settlementSummary.participantCount}</p>
                      <p className="text-[10px] text-muted-foreground">Participants</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Frequency</label>
              <div className="flex gap-1.5">
                {(["weekly", "biweekly", "monthly"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setSchedFrequency(f)}
                    className={`flex-1 h-7 text-[10px] rounded border transition-colors capitalize ${
                      schedFrequency === f
                        ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                        : "bg-white/3 text-muted-foreground border-border/30 hover:bg-white/5"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Include Internal Notes</label>
              <button
                onClick={() => setSchedIncludeInternal((v) => !v)}
                className={`h-7 px-3 text-[10px] rounded border transition-colors ${
                  schedIncludeInternal
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                    : "bg-white/3 text-muted-foreground border-border/30 hover:bg-white/5"
                }`}
              >
                {schedIncludeInternal ? "Yes — include internal" : "No — public only"}
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => setExportScheduleMut.mutate({ frequency: schedFrequency, enabled: true, includeInternal: schedIncludeInternal })}
              disabled={setExportScheduleMut.isPending}
            >
              {setExportScheduleMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Bell className="w-3 h-3 mr-1" />}
              {exportSchedule?.enabled ? "Update Schedule" : "Enable Schedule"}
            </Button>
            {exportSchedule?.enabled !== undefined && (
              <Button
                size="sm"
                variant="outline"
                className={`h-8 text-xs ${exportSchedule.enabled ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10" : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"}`}
                onClick={() => toggleExportScheduleMut.mutate({ enabled: !exportSchedule.enabled })}
                disabled={toggleExportScheduleMut.isPending}
                title={exportSchedule.enabled ? "Pause schedule (keeps settings)" : "Resume schedule"}
              >
                {toggleExportScheduleMut.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : exportSchedule.enabled ? (
                  <span className="text-[10px]">⏸ Pause</span>
                ) : (
                  <span className="text-[10px]">▶ Resume</span>
                )}
              </Button>
            )}
            {exportSchedule?.enabled && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={() => deleteExportScheduleMut.mutate()}
                disabled={deleteExportScheduleMut.isPending}
              >
                {deleteExportScheduleMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3 mr-1" />}
                Remove
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6 stagger-children">
        <StatCard
          label="Total Investigations"
          value={stats?.total ?? "—"}
          trend="up"
          trendValue={stats ? `${stats.pending} pending` : ""}
          color="blue"
          icon={Shield}
          animationDelay={0}
        />
        <StatCard label="Completed" value={stats?.completed ?? "—"} color="green" icon={CheckCircle} animationDelay={50} />
        <StatCard label="Flagged" value={stats?.flagged ?? "—"} color="crimson" icon={AlertCircle} animationDelay={100} />
        <StatCard label="High Risk" value={stats?.highRisk ?? "—"} color="amber" icon={TrendingUp} animationDelay={150} />
        <StatCard
          label="SLA Overdue"
          value={slaStats?.overdue ?? "—"}
          trendValue={slaStats ? `${slaStats.overdueRate}% overdue rate` : ""}
          color={slaStats && slaStats.overdue > 0 ? "crimson" : "green"}
          icon={Clock}
          animationDelay={200}
        />
      </div>

      {/* SLA Breach Panel */}
      {slaBreaches.length > 0 && (
        <div className="glass-card p-4 mb-4 border border-red-500/30 animate-fade-in-up opacity-0" style={{ animationFillMode: "forwards" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-semibold text-red-400" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                SLA Breach Alert
              </h3>
              <span className="text-[10px] font-mono bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded">
                {slaBreaches.length} overdue
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] border-red-500/40 text-red-400 hover:bg-red-500/10"
              onClick={() => sendBreachAlertsMut.mutate()}
              disabled={sendBreachAlertsMut.isPending}
            >
              {sendBreachAlertsMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Flag className="w-3 h-3" />}
              <span className="ml-1">Send Alerts</span>
            </Button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {slaBreaches.map((breach) => (
              <div key={breach.id} className="flex items-center justify-between p-2.5 rounded-md bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{breach.subjectFullName}</p>
                    <p className="text-[10px] text-muted-foreground">{breach.referenceId} · {breach.assignedToName ?? "Unassigned"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded">
                    {breach.overdueByHours}h overdue
                  </span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    breach.riskLevel === "critical" ? "bg-red-900/40 text-red-300 border-red-500/30" :
                    breach.riskLevel === "high" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
                    "bg-amber-500/20 text-amber-400 border-amber-500/30"
                  }`}>
                    {breach.riskLevel ?? "unknown"}
                  </span>
                  <Link href={`/bis/report/${breach.id}`}>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            These investigations have exceeded their SLA deadline. Click "Send Alerts" to notify assigned analysts and the owner.
          </p>
        </div>
      )}

      {/* My Assignments Panel */}
      {myAssignments.length > 0 && (
        <div className="glass-card p-5 mb-4 animate-fade-in-up opacity-0" style={{ animationDelay: "195ms", animationFillMode: "forwards" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>My Assignments</h3>
              <span className="text-[10px] font-mono bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded">
                {myAssignments.length} total
              </span>
              {myOverdueCount > 0 && (
                <span className="text-[10px] font-mono bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded animate-pulse">
                  {myOverdueCount} overdue
                </span>
              )}
            </div>
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {myAssignments.map((inv) => (
              <div
                key={inv.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  inv.isOverdue
                    ? "bg-red-500/10 border-red-500/20 hover:bg-red-500/15"
                    : "bg-white/3 border-border/20 hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-mono text-muted-foreground">{inv.referenceId}</p>
                      {inv.isOverdue && (
                        <span className="text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-1 py-0.5 rounded uppercase">
                          {inv.overdueHours}h overdue
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-foreground truncate">{inv.subjectFullName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {inv.riskLevel && (
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${
                      inv.riskLevel === "critical" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                      inv.riskLevel === "high" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
                      inv.riskLevel === "medium" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                      "bg-green-500/20 text-green-400 border-green-500/30"
                    }`}>{inv.riskLevel}</span>
                  )}
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${
                    inv.status === "completed" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                    inv.status === "processing" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
                    inv.status === "failed" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                    "bg-gray-500/20 text-gray-400 border-gray-500/30"
                  }`}>{inv.status}</span>
                  <Link href={`/bis/report/${inv.id}`}>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]">
                      <Eye className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Risk Trend Chart */}
      <div className="glass-card p-5 mb-4 animate-fade-in-up opacity-0" style={{ animationDelay: "198ms", animationFillMode: "forwards" }}>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Risk Level Trend — Last 12 Weeks</h3>
        </div>
        {riskTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={riskTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
              <XAxis dataKey="weekLabel" tick={{ fontSize: 9, fill: "oklch(0.55 0.01 264)" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "oklch(0.55 0.01 264)" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "oklch(0.14 0.008 264)", border: "1px solid oklch(0.25 0.01 264)", borderRadius: "8px", fontSize: "11px" }}
                labelStyle={{ color: "oklch(0.85 0.01 264)" }}
              />
              <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} />
              <Line type="monotone" dataKey="low" stroke="oklch(0.78 0.22 152)" strokeWidth={1.5} dot={false} name="Low" />
              <Line type="monotone" dataKey="medium" stroke="oklch(0.82 0.18 75)" strokeWidth={1.5} dot={false} name="Medium" />
              <Line type="monotone" dataKey="high" stroke="oklch(0.62 0.22 25)" strokeWidth={1.5} dot={false} name="High" />
              <Line type="monotone" dataKey="critical" stroke="oklch(0.55 0.25 25)" strokeWidth={2} dot={false} name="Critical" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[180px] text-muted-foreground text-xs">No trend data available yet</div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 glass-card p-4 animate-fade-in-up opacity-0" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
          <h3 className="text-sm font-semibold text-foreground mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Risk Score Distribution
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={riskBuckets} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
              <XAxis dataKey="range" tick={{ fontSize: 10, fill: "oklch(0.55 0.01 264)" }} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.01 264)" }} />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.14 0.008 264)",
                  border: "1px solid oklch(1 0 0 / 10%)",
                  borderRadius: "6px",
                  fontSize: "11px",
                }}
              />
              <Bar dataKey="count" fill="oklch(0.78 0.22 152)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-4 animate-fade-in-up opacity-0" style={{ animationDelay: "250ms", animationFillMode: "forwards" }}>
          <h3 className="text-sm font-semibold text-foreground mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Status Summary
          </h3>
          <div className="space-y-3">
            {[
              { label: "Pending", count: stats?.pending ?? 0, color: "oklch(0.55 0.01 264)" },
              { label: "Processing", count: stats?.processing ?? 0, color: "oklch(0.65 0.15 264)" },
              { label: "Completed", count: stats?.completed ?? 0, color: "oklch(0.78 0.22 152)" },
              { label: "Flagged", count: stats?.flagged ?? 0, color: "oklch(0.55 0.25 25)" },
            ].map((t) => {
              const total = stats?.total ?? 1;
              return (
                <div key={t.label}>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="font-mono" style={{ color: t.color }}>{t.label.toUpperCase()}</span>
                    <span className="text-muted-foreground font-mono">{t.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${total > 0 ? (t.count / total) * 100 : 0}%`, background: t.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Investigations Table */}
      <div className="glass-card overflow-hidden animate-fade-in-up opacity-0" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Recent Investigations
            {selectedIds.size > 0 && (
              <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{selectedIds.size} selected</span>
            )}
          </h3>
          <span className="text-xs text-muted-foreground font-mono">
            {bisTotal > 0 ? `${bisPage * BIS_PAGE_SIZE + 1}–${Math.min((bisPage + 1) * BIS_PAGE_SIZE, bisTotal)} of ${bisTotal}` : "0 shown"}
          </span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50">
              <th className="p-3 w-8">
                <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground transition-colors">
                  {allSelected
                    ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                    : <Square className="w-3.5 h-3.5" />}
                </button>
              </th>
              {["Reference", "Subject", "Role", "Country", "Tier", "Risk", "Status", "Actions"].map((h) => (
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
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading investigations...
                </td>
              </tr>
            ) : invList.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-muted-foreground text-xs">
                  No investigations yet. Click "New Investigation" to get started.
                </td>
              </tr>
            ) : (
              invList.map((inv, i: number) => (
                <tr
                  key={inv.id}
                  className={`border-b border-border/30 hover:bg-white/3 transition-colors animate-fade-in-up opacity-0 ${selectedIds.has(inv.id) ? "bg-primary/5" : ""}`}
                  style={{ animationDelay: `${i * 40}ms`, animationFillMode: "forwards" }}
                >
                  <td className="p-3">
                    <button onClick={() => toggleSelect(inv.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                      {selectedIds.has(inv.id)
                        ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                        : <Square className="w-3.5 h-3.5" />}
                    </button>
                  </td>
                  <td className="p-3 font-mono text-muted-foreground text-[10px]">{inv.referenceId}</td>
                  <td className="p-3 font-medium text-foreground">{inv.subjectFullName}</td>
                  <td className="p-3 text-muted-foreground">{inv.subjectRole ?? "—"}</td>
                  <td className="p-3">
                    <span className="bg-white/10 text-foreground text-[9px] px-1.5 py-0.5 rounded font-mono">
                      {inv.subjectCountry ?? "—"}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="text-[9px] px-1.5 py-0.5 rounded border bg-white/5 border-border font-mono uppercase">
                      {inv.tier}
                    </span>
                  </td>
                  <td className="p-3">
                    {inv.riskScore != null ? (
                      <RiskRing score={inv.riskScore} size={36} strokeWidth={3} showLabel={false} />
                    ) : (
                      <span className="text-muted-foreground font-mono text-[10px]">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase ${statusStyles[inv.status] ?? statusStyles.pending}`}>
                        {inv.status}
                      </span>
                      {inv.status !== "completed" && inv.status !== "failed" && (inv as any).dueAt && (inv as any).dueAt < Date.now() && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase bg-red-500/20 text-red-400 border-red-500/30">
                          OVERDUE
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        title="View Details"
                        onClick={() => navigate(`/bis/${inv.id}`)}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        title="View Report"
                        onClick={() => navigate(`/bis/report/${inv.id}`)}
                      >
                        <Eye className="w-3 h-3" />
                      </Button>
                      {inv.status === "completed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                          title="Generate PDF Report"
                          disabled={generateReportMutation.isPending}
                          onClick={() => generateReportMutation.mutate({ investigationId: inv.id })}
                        >
                          {generateReportMutation.isPending && generateReportMutation.variables?.investigationId === inv.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <FileDown className="w-3 h-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {/* Pagination controls */}
        {bisTotalPages > 1 && (
          <div className="p-3 border-t border-border/50 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Page {bisPage + 1} of {bisTotalPages}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={bisPage === 0} onClick={() => setBisPage(0)}>«</Button>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={bisPage === 0} onClick={() => setBisPage(p => p - 1)}>‹</Button>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={bisPage >= bisTotalPages - 1} onClick={() => setBisPage(p => p + 1)}>›</Button>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={bisPage >= bisTotalPages - 1} onClick={() => setBisPage(bisTotalPages - 1)}>»</Button>
            </div>
          </div>
        )}
      </div>

      {/* Floating bulk-action toolbar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[oklch(0.14_0.008_264)] border border-border rounded-xl px-4 py-2.5 shadow-2xl">
          <span className="text-xs font-mono text-muted-foreground mr-1">{selectedIds.size} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs border-border bg-white/5" disabled={bulkUpdateMut.isPending}>
                {bulkUpdateMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                Set Status <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {(["pending", "processing", "completed", "flagged"] as const).map((s) => (
                <DropdownMenuItem key={s} onClick={() => bulkUpdateMut.mutate({ ids: Array.from(selectedIds), status: s })}>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase mr-2 ${statusStyles[s]}`}>{s}</span>
                  Mark as {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-border bg-white/5"
            disabled={bulkExportMut.isPending}
            onClick={() => bulkExportMut.mutate({ ids: Array.from(selectedIds) })}
          >
            {bulkExportMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-border bg-white/5"
            disabled={bulkNotesFetching}
            onClick={handleBulkExportNotes}
          >
            {bulkNotesFetching ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <FileDown className="w-3 h-3 mr-1" />}
            Export All Notes
          </Button>
          <button onClick={clearSelection} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
