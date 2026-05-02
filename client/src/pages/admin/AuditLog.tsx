/**
 * Admin Audit Log Page
 *
 * Displays all admin actions with actor, action, entity, and timestamp.
 * Supports filtering by action type, entity type, and date range.
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Activity,
  Calendar,
  User,
  Download,
  Bookmark,
  BookmarkCheck,
  Trash2,
  Link,
  UserCog,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const ACTION_COLORS: Record<string, string> = {
  "kyb.document.verified": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "kyb.document.rejected": "bg-red-500/10 text-red-400 border-red-500/20",
  "kyb.document.bulk_verified": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "kyb.document.bulk_rejected": "bg-red-500/10 text-red-400 border-red-500/20",
  "kyb.application.approve": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "kyb.application.reject": "bg-red-500/10 text-red-400 border-red-500/20",
  "bis.status.update": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "bis.manual_trigger": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "biometric.enrolled": "bg-teal-500/10 text-teal-400 border-teal-500/20",
  "biometric.revoked": "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "biometric.pinSet": "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "biometric.highValueToken.issued": "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  "biometric.highValueToken.verified": "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  "biometric.highValueToken.failed": "bg-red-500/10 text-red-400 border-red-500/20",
  "privacy_update": "bg-pink-500/10 text-pink-400 border-pink-500/20",
};

const ACTION_LABELS: Record<string, string> = {
  "kyb.document.verified": "Doc Approved",
  "kyb.document.rejected": "Doc Rejected",
  "kyb.document.bulk_verified": "Bulk Approved",
  "kyb.document.bulk_rejected": "Bulk Rejected",
  "kyb.application.approve": "App Approved",
  "kyb.application.reject": "App Rejected",
  "kyb_bis_bypass": "⚠️ BIS Gate Bypass",
  "bis.status.update": "BIS Status",
  "bis.manual_trigger": "BIS Trigger",
  "biometric.enrolled": "Biometric Enrolled",
  "biometric.revoked": "Biometric Revoked",
  "biometric.pinSet": "PIN Set",
  "biometric.highValueToken.issued": "Token Issued",
  "biometric.highValueToken.verified": "Token Verified",
  "biometric.highValueToken.failed": "Token Failed",
  "privacy_update": "Privacy Update",
};

const ENTITY_COLORS: Record<string, string> = {
  kyb_document: "bg-violet-500/10 text-violet-400",
  kyb_application: "bg-blue-500/10 text-blue-400",
  bis_investigation: "bg-amber-500/10 text-amber-400",
  biometric_enrollment: "bg-indigo-500/10 text-indigo-400",
  biometric_token: "bg-purple-500/10 text-purple-400",
  loyalty_account: "bg-pink-500/10 text-pink-400",
};

const PAGE_SIZE = 50;
const SAVED_FILTER_KEY = "tp_audit_log_saved_filter";
const SAVED_PRESETS_KEY = "tp_audit_log_filter_presets";

type SavedFilter = {
  name: string;
  actionFilter: string;
  entityTypeFilter: string;
  dateFrom: string;
  dateTo: string;
  savedAt: string;
};

export default function AuditLog() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  const [actionFilter, setActionFilter] = useState<string>("");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("");
  const [searchText, setSearchText] = useState<string>("");
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [savedFilter, setSavedFilter] = useState<SavedFilter | null>(() => {
    try {
      const raw = localStorage.getItem(SAVED_FILTER_KEY);
      return raw ? (JSON.parse(raw) as SavedFilter) : null;
    } catch {
      return null;
    }
  });

  const [filterPresets, setFilterPresets] = useState<SavedFilter[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_PRESETS_KEY);
      return raw ? (JSON.parse(raw) as SavedFilter[]) : [];
    } catch {
      return [];
    }
  });
  const [presetName, setPresetName] = useState<string>("");
  const [showPresetInput, setShowPresetInput] = useState(false);
  const handleSaveFilter = () => {
    const name = presetName.trim() || `Filter ${new Date().toLocaleDateString()}`;
    const filter: SavedFilter = {
      name,
      actionFilter,
      entityTypeFilter,
      dateFrom,
      dateTo,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(SAVED_FILTER_KEY, JSON.stringify(filter));
    setSavedFilter(filter);
    const updated = [...filterPresets.filter(p => p.name !== name), filter].slice(-5);
    localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(updated));
    setFilterPresets(updated);
    setPresetName("");
    setShowPresetInput(false);
    toast.success(`Preset "${name}" saved`);
  };
  const handleRestoreFilter = (preset?: SavedFilter) => {
    const f = preset ?? savedFilter;
    if (!f) return;
    setActionFilter(f.actionFilter);
    setEntityTypeFilter(f.entityTypeFilter);
    setDateFrom(f.dateFrom);
    setDateTo(f.dateTo);
    setPage(0);
    toast.success(`Filter "${f.name || "saved"}" restored`);
  };
  const handleDeletePreset = (name: string) => {
    const updated = filterPresets.filter(p => p.name !== name);
    localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(updated));
    setFilterPresets(updated);
    if (savedFilter?.name === name) {
      localStorage.removeItem(SAVED_FILTER_KEY);
      setSavedFilter(updated[updated.length - 1] ?? null);
    }
    toast.success(`Preset "${name}" deleted`);
  };
  const handleClearSavedFilter = () => {
    localStorage.removeItem(SAVED_FILTER_KEY);
    localStorage.removeItem(SAVED_PRESETS_KEY);
    setSavedFilter(null);
    setFilterPresets([]);
    toast.success("All saved filters cleared");
  };
  const handleCopyPresetLink = (preset?: SavedFilter) => {
    const f = preset ?? { actionFilter, entityTypeFilter, dateFrom, dateTo, name: "" };
    const params = new URLSearchParams();
    if (f.actionFilter) params.set("action", f.actionFilter);
    if (f.entityTypeFilter) params.set("entity", f.entityTypeFilter);
    if (f.dateFrom) params.set("from", f.dateFrom);
    if (f.dateTo) params.set("to", f.dateTo);
    if (f.name) params.set("preset", f.name);
    const url = `${window.location.origin}/audit-logs?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Filter link copied to clipboard");
    }).catch(() => {
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      toast.success("Filter link copied");
    });
  };
  // Read URL query params on mount to restore shared filter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    const entity = params.get("entity");
    const from = params.get("from");
    const to = params.get("to");
    if (action || entity || from || to) {
      if (action) setActionFilter(action);
      if (entity) setEntityTypeFilter(entity);
      if (from) setDateFrom(from);
      if (to) setDateTo(to);
      const presetLabel = params.get("preset") ?? "Shared filter";
      toast.info(`Filter "${presetLabel}" applied from shared link`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirect non-admins
  if (!loading && user?.role !== "admin") {
    navigate("/");
    return null;
  }

  const exportCsv = trpc.csvExport.auditLogs.useMutation({
    onSuccess: (result) => {
      downloadCsv(result.csv, result.filename);
      toast.success(`Exported ${result.rowCount} audit log entries`);
    },
    onError: (err) => toast.error(`Export failed: ${err.message}`),
  });
  const exportBiometricCsv = trpc.csvExport.biometricEvents.useMutation({
    onSuccess: (result) => {
      downloadCsv(result.csv, result.filename);
      toast.success(`Exported ${result.rowCount} biometric event${result.rowCount !== 1 ? 's' : ''}`);
    },
    onError: (err) => toast.error(`Biometric export failed: ${err.message}`),
  });

  const { data: stats } = trpc.auditLogs.stats.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const since = dateFrom ? new Date(dateFrom + "T00:00:00") : undefined;
  const until = dateTo ? new Date(dateTo + "T23:59:59") : undefined;
  const { data: logs, isLoading, refetch } = trpc.auditLogs.list.useQuery(
    {
      action: actionFilter || undefined,
      entityType: entityTypeFilter || undefined,
      since,
      until,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    { refetchInterval: 30_000 }
  );

  type AuditLogEntry = NonNullable<typeof logs>[number];
  const filtered = (logs ?? []).filter((log: AuditLogEntry) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      log.actorName?.toLowerCase().includes(q) ||
      log.actorEmail?.toLowerCase().includes(q) ||
      log.description?.toLowerCase().includes(q) ||
      log.entityId?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-500/10 rounded-lg border border-violet-500/20">
            <Shield className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Audit Log</h1>
            <p className="text-slate-400 text-sm">Complete record of all admin actions</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv.mutate({
              action: "kyb_bis_bypass",
            })}
            disabled={exportCsv.isPending}
            className="border-amber-700 text-amber-300 hover:bg-amber-900/30 bg-transparent"
            title="Export all BIS gate bypass approvals with bypass reasons"
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            {exportCsv.isPending ? "Exporting…" : "BIS Bypasses"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportBiometricCsv.mutate({})}
            disabled={exportBiometricCsv.isPending}
            className="border-indigo-700 text-indigo-300 hover:bg-indigo-900/30 bg-transparent"
            title="Export all biometric events for compliance"
          >
            <Download className="w-4 h-4 mr-2" />
            {exportBiometricCsv.isPending ? "Exporting…" : "Biometric Events"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv.mutate({
              action: actionFilter || undefined,
              entityType: entityTypeFilter || undefined,
              from: dateFrom ? new Date(dateFrom + "T00:00:00") : undefined,
              to: dateTo ? new Date(dateTo + "T23:59:59") : undefined,
            })}
            disabled={exportCsv.isPending}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 bg-transparent"
          >
            <Download className="w-4 h-4 mr-2" />
            {exportCsv.isPending ? "Exporting…" : "Export CSV"}
          </Button>
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
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="w-8 h-8 text-violet-400" />
            <div>
              <p className="text-2xl font-bold text-white">{stats?.total ?? 0}</p>
              <p className="text-slate-400 text-sm">Total Events</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="w-8 h-8 text-emerald-400" />
            <div>
              <p className="text-2xl font-bold text-white">{stats?.today ?? 0}</p>
              <p className="text-slate-400 text-sm">Events Today</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <User className="w-8 h-8 text-blue-400" />
            <div>
              <p className="text-2xl font-bold text-white">
                {stats?.byAction?.[0]?.action
                  ? (ACTION_LABELS[stats.byAction[0].action] ?? stats.byAction[0].action)
                  : "—"}
              </p>
              <p className="text-slate-400 text-sm">Top Action</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-slate-900/50 border-slate-800 mb-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Filters</span>
            <button
              type="button"
              onClick={() => handleCopyPresetLink()}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-700/50 text-slate-300 border border-slate-600/50 hover:bg-slate-700 hover:text-white transition-colors"
              title="Copy shareable link for current filter settings"
            >
              <Link className="w-3 h-3" /> Share current filter
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search actor, description, entity ID…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
            <Select value={actionFilter || "all"} onValueChange={(v) => { setActionFilter(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="kyb.document.verified">Doc Approved</SelectItem>
                <SelectItem value="kyb.document.rejected">Doc Rejected</SelectItem>
                <SelectItem value="kyb.document.bulk_verified">Bulk Approved</SelectItem>
                <SelectItem value="kyb.document.bulk_rejected">Bulk Rejected</SelectItem>
                <SelectItem value="kyb.application.approve">App Approved</SelectItem>
                <SelectItem value="kyb.application.reject">App Rejected</SelectItem>
                <SelectItem value="kyb_bis_bypass">⚠️ BIS Gate Bypass</SelectItem>
                <SelectItem value="bis.status.update">BIS Status</SelectItem>
                <SelectItem value="bis.manual_trigger">BIS Trigger</SelectItem>
                <SelectItem value="biometric.enrolled">Biometric Enrolled</SelectItem>
                <SelectItem value="biometric.revoked">Biometric Revoked</SelectItem>
                <SelectItem value="biometric.pinSet">PIN Set</SelectItem>
                <SelectItem value="biometric.highValueToken.issued">Token Issued</SelectItem>
                <SelectItem value="biometric.highValueToken.verified">Token Verified</SelectItem>
                <SelectItem value="biometric.highValueToken.failed">Token Failed</SelectItem>
                <SelectItem value="privacy_update">Privacy Update</SelectItem>
              </SelectContent>
            </Select>
            <Select value={entityTypeFilter || "all"} onValueChange={(v) => { setEntityTypeFilter(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger className="w-44 bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="All Entities" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all">All Entities</SelectItem>
                <SelectItem value="kyb_document">KYB Document</SelectItem>
                <SelectItem value="kyb_application">KYB Application</SelectItem>
                <SelectItem value="bis_investigation">BIS Investigation</SelectItem>
                <SelectItem value="biometric_enrollment">Biometric Enrollment</SelectItem>
                <SelectItem value="biometric_token">Biometric Token</SelectItem>
                <SelectItem value="loyalty_account">Loyalty Account</SelectItem>
              </SelectContent>
            </Select>
            {/* Quick-filter chip for privacy events */}
            {actionFilter !== "privacy_update" && (
              <button
                type="button"
                onClick={() => { setActionFilter("privacy_update"); setPage(0); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-pink-500/10 text-pink-400 border border-pink-500/20 hover:bg-pink-500/20 transition-colors"
                title="Show only privacy setting changes"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-pink-400 inline-block" />
                Privacy Events
              </button>
            )}
            {actionFilter === "privacy_update" && (
              <button
                type="button"
                onClick={() => { setActionFilter(""); setPage(0); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-pink-500/20 text-pink-300 border border-pink-500/40 hover:bg-pink-500/30 transition-colors"
                title="Clear privacy filter"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-pink-300 inline-block" />
                Privacy Events ✕
              </button>
            )}
            {/* Quick-filter chip for BIS bypass events */}
            {actionFilter !== "kyb_bis_bypass" && (
              <button
                type="button"
                onClick={() => { setActionFilter("kyb_bis_bypass"); setPage(0); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                title="Show only BIS gate bypass approvals"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                BIS Bypasses
              </button>
            )}
            {actionFilter === "kyb_bis_bypass" && (
              <button
                type="button"
                onClick={() => { setActionFilter(""); setPage(0); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
                title="Clear BIS bypass filter"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-300 inline-block" />
                BIS Bypasses ✕
              </button>
            )}
          </div>
          {/* Date range filter row */}
          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-800">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-400 shrink-0">Date range:</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                className="h-8 px-2 text-xs rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                title="From date"
              />
              <span className="text-xs text-slate-500">to</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                className="h-8 px-2 text-xs rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                title="To date"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(""); setDateTo(""); setPage(0); }}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                title="Clear date range"
              >
                <span className="text-[10px]">✕</span> Clear dates
              </button>
            )}
            {(dateFrom || dateTo) && (
              <span className="text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full">
                {dateFrom && dateTo
                  ? `${dateFrom} → ${dateTo}`
                  : dateFrom
                  ? `From ${dateFrom}`
                  : `Until ${dateTo}`}
              </span>
            )}
          </div>
          {/* Multi-preset saved filters row */}
          <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Bookmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-xs text-slate-400 shrink-0">Filter presets:</span>
              {filterPresets.length === 0 && (
                <span className="text-xs text-slate-500 italic">No saved presets</span>
              )}
              {filterPresets.map((preset) => (
                <div key={preset.name} className="flex items-center gap-1 bg-violet-500/10 border border-violet-500/20 rounded-full px-2 py-0.5">
                  <button
                    type="button"
                    onClick={() => handleRestoreFilter(preset)}
                    className="text-[10px] text-violet-400 hover:text-violet-200 transition-colors font-medium"
                    title={`Restore: ${[
                      preset.actionFilter && (ACTION_LABELS[preset.actionFilter] ?? preset.actionFilter),
                      preset.entityTypeFilter,
                      preset.dateFrom && `from ${preset.dateFrom}`,
                      preset.dateTo && `to ${preset.dateTo}`,
                    ].filter(Boolean).join(" · ") || "All events"}`}
                  >
                    <BookmarkCheck className="w-2.5 h-2.5 inline mr-0.5" />
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyPresetLink(preset)}
                    className="text-slate-600 hover:text-sky-400 transition-colors ml-1"
                    title="Copy shareable link for this preset"
                  >
                    <Link className="w-2.5 h-2.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePreset(preset.name)}
                    className="text-slate-600 hover:text-red-400 transition-colors ml-1"
                    title="Delete preset"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              <div className="ml-auto flex items-center gap-2">
                {filterPresets.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearSavedFilter}
                    className="text-[10px] text-slate-500 hover:text-red-400 transition-colors"
                    title="Clear all presets"
                  >
                    Clear all
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPresetInput(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors"
                >
                  <Bookmark className="w-3 h-3" /> Save as preset
                </button>
              </div>
            </div>
            {showPresetInput && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveFilter(); if (e.key === "Escape") setShowPresetInput(false); }}
                  placeholder='Preset name (e.g. "Privacy changes this week")'
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveFilter}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowPresetInput(false)}
                  className="px-2 py-1.5 rounded-md text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-base">
            {filtered.length} event{filtered.length !== 1 ? "s" : ""}
            {actionFilter || entityTypeFilter ? " (filtered)" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              Loading audit log…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Shield className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">No audit log entries found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400 w-4"></TableHead>
                    <TableHead className="text-slate-400">Timestamp</TableHead>
                    <TableHead className="text-slate-400">Actor</TableHead>
                    <TableHead className="text-slate-400">Action</TableHead>
                    <TableHead className="text-slate-400">Entity</TableHead>
                    <TableHead className="text-slate-400">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log: AuditLogEntry) => {
                    const isExpanded = expandedRowId === log.id;
                    const isBypass = log.action === "kyb_bis_bypass";
                    // Safely parse after/before JSON fields
                    let afterData: Record<string, unknown> | null = null;
                    let beforeData: Record<string, unknown> | null = null;
                    try { afterData = log.after ? (typeof log.after === "string" ? JSON.parse(log.after) : log.after as Record<string, unknown>) : null; } catch { /* ignore */ }
                    try { beforeData = log.before ? (typeof log.before === "string" ? JSON.parse(log.before) : log.before as Record<string, unknown>) : null; } catch { /* ignore */ }
                    const bypassReason = afterData?.bypassReason as string | undefined;

                    return (
                      <>
                        <TableRow
                          key={log.id}
                          className={`border-slate-800 hover:bg-slate-800/30 cursor-pointer transition-colors ${isExpanded ? "bg-slate-800/40" : ""} ${isBypass ? "border-l-2 border-l-amber-500/60" : ""}`}
                          onClick={() => setExpandedRowId(isExpanded ? null : log.id)}
                        >
                          <TableCell className="pl-3 pr-0">
                            {isExpanded
                              ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                              : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                          </TableCell>
                          <TableCell className="text-slate-400 text-xs whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-white">{log.actorName ?? "System"}</div>
                            {log.actorEmail && (
                              <div className="text-xs text-slate-500">{log.actorEmail}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-xs ${ACTION_COLORS[log.action] ?? "bg-slate-700/50 text-slate-300 border-slate-600"}`}
                            >
                              {ACTION_LABELS[log.action] ?? log.action}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge
                                variant="outline"
                                className={`text-xs w-fit ${ENTITY_COLORS[log.entityType] ?? "bg-slate-700/50 text-slate-300"}`}
                              >
                                {log.entityType.replace(/_/g, " ")}
                              </Badge>
                              <span className="text-xs text-slate-500">#{log.entityId}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-300 text-sm max-w-xs truncate">
                            {log.description ?? "—"}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${log.id}-detail`} className="border-slate-800 bg-slate-900/60">
                            <TableCell colSpan={6} className="px-6 py-4">
                              <div className="space-y-3">
                                {/* Bypass Reason — prominently shown for kyb_bis_bypass */}
                                {isBypass && (
                                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                                      <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">BIS Gate Override Reason</span>
                                    </div>
                                    {bypassReason ? (
                                      <p className="text-sm text-amber-100 leading-relaxed">{bypassReason}</p>
                                    ) : (
                                      <p className="text-xs text-amber-400/70 italic">No reason recorded (legacy entry)</p>
                                    )}
                                  </div>
                                )}
                                {/* Before / After diff */}
                                <div className="grid grid-cols-2 gap-3">
                                  {beforeData && (
                                    <div>
                                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Before</p>
                                      <pre className="text-[11px] text-slate-300 bg-slate-800/60 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(beforeData, null, 2)}</pre>
                                    </div>
                                  )}
                                  {afterData && (
                                    <div>
                                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">After</p>
                                      <pre className="text-[11px] text-slate-300 bg-slate-800/60 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(afterData, null, 2)}</pre>
                                    </div>
                                  )}
                                  {!beforeData && !afterData && (
                                    <p className="text-xs text-slate-500 col-span-2">No before/after data recorded for this entry.</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {!isLoading && (logs?.length ?? 0) > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
              <span className="text-slate-500 text-sm">
                Page {page + 1} &middot; {stats?.total ?? 0} total entries
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(0)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 bg-transparent text-xs px-2"
                >
                  «
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 bg-transparent"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(logs?.length ?? 0) < PAGE_SIZE}
                  onClick={() => setPage((p) => p + 1)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 bg-transparent"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Impersonation Session History */}
      <ImpersonationLogSection />
    </div>
  );
}

function ImpersonationLogSection() {
  const { data: startLogs, isLoading } = trpc.auditLogs.list.useQuery(
    { action: "admin.impersonation.start", limit: 50, offset: 0 },
    { refetchInterval: 30_000 }
  );
  const { data: endLogs } = trpc.auditLogs.list.useQuery(
    { action: "admin.impersonation.end", limit: 50, offset: 0 },
    { refetchInterval: 30_000 }
  );

  type LogEntry = NonNullable<typeof endLogs>[number];
  // Build a lookup: actorId+entityId -> end event
  const endMap = new Map<string, LogEntry>();
  (endLogs ?? []).forEach((e: LogEntry) => {
    const key = `${e.actorId ?? ""}_${e.entityId ?? ""}`;
    if (!endMap.has(key)) endMap.set(key, e);
  });

  const rows = startLogs ?? [];

  return (
    <Card className="mt-6 bg-slate-900/50 border-slate-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <UserCog className="h-4 w-4 text-amber-400" />
          Impersonation Session History
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-24 text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-slate-500 text-sm">
            No impersonation sessions recorded.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">Admin</TableHead>
                  <TableHead className="text-slate-400">Impersonated User ID</TableHead>
                  <TableHead className="text-slate-400">Started</TableHead>
                  <TableHead className="text-slate-400">Ended</TableHead>
                  <TableHead className="text-slate-400">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row: LogEntry) => {
                  const key = `${row.actorId ?? ""}_${row.entityId ?? ""}`;
                  const endRow = endMap.get(key);
                  return (
                    <TableRow key={row.id} className="border-slate-800 hover:bg-slate-800/30">
                      <TableCell className="text-slate-300 text-sm">
                        {row.actorName ?? row.actorEmail ?? `#${row.actorId}`}
                      </TableCell>
                      <TableCell className="text-amber-300 text-sm font-mono">
                        {row.entityId ?? "—"}
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs">
                        {new Date(row.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs">
                        {endRow
                          ? new Date(endRow.createdAt).toLocaleString()
                          : <span className="text-amber-400">Active / not ended</span>}
                      </TableCell>
                      <TableCell className="text-slate-500 text-xs max-w-xs truncate">
                        {row.description ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
