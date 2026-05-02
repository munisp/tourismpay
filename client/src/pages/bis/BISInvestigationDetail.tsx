/**
 * BIS Investigation Detail Page
 *
 * Shows full investigation details with expandable module result cards
 * for identity, criminal, financial, and sanctions checks.
 */

import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import BISModuleEditor from "@/components/bis/BISModuleEditor";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  User,
  Shield,
  DollarSign,
  Globe,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Download,
  RefreshCw,
  MessageSquare,
  Plus,
  Trash2,
  Lock,
  Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePdfDownload } from "@/hooks/usePdfDownload";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Risk badge helpers ───────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  processing: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  flagged: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="w-4 h-4" />,
  processing: <RefreshCw className="w-4 h-4 animate-spin" />,
  completed: <CheckCircle className="w-4 h-4" />,
  flagged: <AlertTriangle className="w-4 h-4" />,
  failed: <AlertTriangle className="w-4 h-4" />,
};

// ─── Module card ─────────────────────────────────────────────────────────────

interface ModuleCardProps {
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  data: Record<string, unknown> | null | undefined;
  defaultOpen?: boolean;
}

function ModuleCard({ title, icon, iconColor, data, defaultOpen = false }: ModuleCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  const hasData = data && Object.keys(data).length > 0;
  const score = hasData ? (data.score as number | undefined) : undefined;
  const status = hasData ? (data.status as string | undefined) : undefined;
  const findings = hasData ? (data.findings as string[] | undefined) : undefined;

  const scoreColor =
    score !== undefined
      ? score >= 80
        ? "text-emerald-400"
        : score >= 60
        ? "text-amber-400"
        : "text-red-400"
      : "text-slate-400";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="bg-slate-900/50 border-slate-800">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-slate-800/30 transition-colors rounded-t-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-slate-800 ${iconColor}`}>{icon}</div>
                <div>
                  <CardTitle className="text-white text-base">{title}</CardTitle>
                  {status && (
                    <p className="text-xs text-slate-400 mt-0.5 capitalize">{status}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {score !== undefined && (
                  <span className={`text-2xl font-bold ${scoreColor}`}>{score}</span>
                )}
                {!hasData && (
                  <Badge variant="outline" className="text-xs bg-slate-700/50 text-slate-400 border-slate-600">
                    No data
                  </Badge>
                )}
                {open ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4">
            <div className="border-t border-slate-800 pt-4">
              {!hasData ? (
                <p className="text-slate-500 text-sm italic">No module data available yet.</p>
              ) : (
                <div className="space-y-3">
                  {/* Findings list */}
                  {findings && findings.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">Findings</p>
                      <ul className="space-y-1">
                        {findings.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                            <span className="text-amber-400 mt-0.5">•</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Raw data fields */}
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(data)
                      .filter(([k]) => k !== "findings" && k !== "score" && k !== "status")
                      .map(([key, value]) => (
                        <div key={key} className="bg-slate-800/50 rounded p-2">
                          <p className="text-xs text-slate-500 capitalize">{key.replace(/_/g, " ")}</p>
                          <p className="text-sm text-white mt-0.5 break-words">
                            {Array.isArray(value)
                              ? (value as unknown[]).join(", ")
                              : typeof value === "object"
                              ? JSON.stringify(value)
                              : String(value ?? "—")}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ─── Kill Switch Audit Section ───────────────────────────────────────────────

function KillSwitchAuditSection({ investigationId }: { investigationId: number }) {
  const [open, setOpen] = useState(false);
  const { data: activations, isLoading } = trpc.bisIntegration.getKillSwitchActivations.useQuery(
    { bisInvestigationId: investigationId, limit: 50 },
    { enabled: open }
  );

  const riskColor: Record<string, string> = {
    critical: "text-red-400 bg-red-500/10 border-red-500/20",
    high: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="bg-slate-900/50 border-slate-800">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-slate-800/30 transition-colors rounded-t-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-800 text-red-400">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <CardTitle className="text-white text-base flex items-center gap-2">
                    Kill Switch Audit
                    <Badge variant="outline" className="text-xs bg-red-500/10 text-red-400 border-red-500/20">
                      <Zap className="w-3 h-3 mr-1" />
                      Auto-Activated
                    </Badge>
                  </CardTitle>
                  <p className="text-xs text-slate-400 mt-0.5">
                    PaymentSwitch corridors locked by this investigation
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {open ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4">
            <div className="border-t border-slate-800 pt-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  Loading activations…
                </div>
              ) : !activations || activations.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Lock className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No kill switch activations for this investigation.</p>
                  <p className="text-xs mt-1 text-slate-600">
                    Kill switches are auto-activated when the investigation is flagged as high or critical risk.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">
                    {activations.length} corridor{activations.length !== 1 ? "s" : ""} locked by this investigation.
                  </p>
                  {activations.map((act) => (
                    <div
                      key={act.id}
                      className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Lock className="w-3.5 h-3.5 text-red-400" />
                          <span className="text-sm font-mono font-semibold text-white">
                            {act.corridor}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`text-xs uppercase ${riskColor[act.riskLevel] ?? ""}`}
                          >
                            {act.riskLevel} risk
                          </Badge>
                          {act.riskScore !== null && (
                            <span className="text-xs text-slate-400">
                              Score: {act.riskScore}/100
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{act.reason}</p>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Activated by: <span className="text-slate-300">{act.activatedBy}</span></span>
                        <span>{new Date(act.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BISInvestigationDetail() {
  const [, params] = useRoute("/bis/:id");
  const [, navigate] = useLocation();
  const id = params?.id ? parseInt(params.id, 10) : null;

  const { data: inv, isLoading, refetch } = trpc.bis.byId.useQuery(
    { id: id! },
    {
      enabled: id !== null && !isNaN(id!),
      refetchInterval: (query) => {
        const data = query.state.data as { status?: string } | undefined;
        return data?.status === "processing" ? 10_000 : false;
      },
    }
  );

  if (!id || isNaN(id)) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center text-slate-400">
        Invalid investigation ID.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading investigation…
      </div>
    );
  }

  if (!inv) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center text-slate-400">
        Investigation not found.
      </div>
    );
  }

  const moduleResults = (inv.moduleResults ?? {}) as Record<string, Record<string, unknown>>;
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [showEditor, setShowEditor] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  const [eventForm, setEventForm] = useState({ eventType: "note", title: "", description: "", severity: "info" });
  const [timelineEventTypeFilter, setTimelineEventTypeFilter] = useState<string>("all");
  const [timelineSeverityFilter, setTimelineSeverityFilter] = useState<string>("all");
  const utils = trpc.useUtils();
  const { data: timelineData } = trpc.bis.getTimeline.useQuery(
    {
      investigationId: inv.id,
      eventType: timelineEventTypeFilter !== "all" ? (timelineEventTypeFilter as any) : undefined,
      severity: timelineSeverityFilter !== "all" ? (timelineSeverityFilter as any) : undefined,
    },
    { enabled: showTimeline }
  );
  const addEventMut = trpc.bis.addTimelineEvent.useMutation({
    onSuccess: () => {
      utils.bis.getTimeline.invalidate({ investigationId: inv.id });
      setAddingEvent(false);
      setEventForm({ eventType: "note", title: "", description: "", severity: "info" });
      toast.success("Timeline event added");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteEventMut = trpc.bis.deleteTimelineEvent.useMutation({
    onSuccess: () => { utils.bis.getTimeline.invalidate({ investigationId: inv.id }); toast.success("Event removed"); },
    onError: (e) => toast.error(e.message),
  });
  const [exportingTimeline, setExportingTimeline] = useState(false);
  const exportTimelineQuery = trpc.bis.exportTimeline.useQuery(
    {
      investigationId: inv.id,
      eventType: timelineEventTypeFilter !== "all" ? (timelineEventTypeFilter as any) : undefined,
      severity: timelineSeverityFilter !== "all" ? (timelineSeverityFilter as any) : undefined,
    },
    { enabled: false }
  );
  const handleDownloadTimeline = async () => {
    setExportingTimeline(true);
    try {
      const result = await exportTimelineQuery.refetch();
      if (result.data?.csv) {
        const blob = new Blob([result.data.csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.data.filename ?? `timeline-${inv.id}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Downloaded ${result.data.count} timeline event${result.data.count !== 1 ? "s" : ""}`);
      }
    } catch {
      toast.error("Failed to export timeline");
    } finally {
      setExportingTimeline(false);
    }
  };
  const [showAssignee, setShowAssignee] = useState(false);
  const { data: adminUsersData } = trpc.bis.getAdminUsers.useQuery(undefined, { enabled: isAdmin });
  // ─── Investigation Notes ─────────────────────────────────────────────────
  const [showNotes, setShowNotes] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteIsInternal, setNoteIsInternal] = useState(false);
  const { data: notesData, refetch: refetchNotes } = trpc.bis.getNotes.useQuery(
    { investigationId: inv.id, includeInternal: isAdmin },
    { enabled: showNotes }
  );
  const addNoteMut = trpc.bis.addNote.useMutation({
    onSuccess: () => {
      refetchNotes();
      setNoteContent("");
      setNoteIsInternal(false);
      toast.success("Note added");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteNoteMut = trpc.bis.deleteNote.useMutation({
    onSuccess: () => { refetchNotes(); toast.success("Note deleted"); },
    onError: (e) => toast.error(e.message),
  });
  // ─── Export Notes ─────────────────────────────────────────────────────────
  const [exportingNotes, setExportingNotes] = useState(false);
  const exportNotesQuery = trpc.bis.exportNotes.useQuery(
    { investigationId: inv.id, includeInternal: isAdmin },
    { enabled: false }
  );
  const handleDownloadNotes = async () => {
    setExportingNotes(true);
    try {
      const result = await exportNotesQuery.refetch();
      if (!result.data) { toast.error("Export failed"); return; }
      const blob = new Blob([result.data.text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${result.data.noteCount} note${result.data.noteCount !== 1 ? "s" : ""}`);
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    } finally {
      setExportingNotes(false);
    }
  };
  const { downloadPdf, isDownloading: isPdfDownloading } = usePdfDownload();
  const pdfBisMut = trpc.pythonServices.pdfBisInvestigation.useMutation({
    onSuccess: async (data) => {
      await downloadPdf(
        data as any,
        `bis-investigation-${inv.referenceId}-${Date.now()}.pdf`
      );
    },
    onError: (err) => toast.error(`PDF generation failed: ${err.message}`),
  });

  const runAiScoringMut = trpc.bis.runAiScoring.useMutation({
    onSuccess: (data: any) => {
      toast.success(`AI scoring complete — Risk Score: ${data?.riskScore ?? "N/A"}, Level: ${data?.riskLevel ?? "N/A"}`);
      refetch();
    },
    onError: (err) => toast.error(`AI scoring failed: ${err.message}`),
  });

  const assignMut = trpc.bis.assignInvestigation.useMutation({
    onSuccess: (data) => {
      refetch();
      utils.bis.getTimeline.invalidate({ investigationId: inv.id });
      toast.success(data.assigneeName ? `Assigned to ${data.assigneeName}` : "Investigation unassigned");
      setShowAssignee(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/bis")}
          className="text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <div className="h-4 w-px bg-slate-700" />
        <div className="flex items-center gap-3 flex-1">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{inv.referenceId}</h1>
              <Badge
                variant="outline"
                className={`text-xs flex items-center gap-1 ${STATUS_COLORS[inv.status] ?? ""}`}
              >
                {STATUS_ICONS[inv.status]}
                {inv.status}
              </Badge>
              {inv.riskLevel && (
                <Badge
                  variant="outline"
                  className={`text-xs uppercase ${RISK_COLORS[inv.riskLevel] ?? ""}`}
                >
                  {inv.riskLevel} risk
                </Badge>
              )}
            </div>
            <p className="text-slate-400 text-sm mt-0.5">
              Created {new Date(inv.createdAt).toLocaleString()}
              {inv.completedAt && ` · Completed ${new Date(inv.completedAt).toLocaleString()}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAssignee(v => !v)}
                className="border-slate-700 text-slate-300 hover:bg-slate-800 bg-transparent"
              >
                <User className="w-4 h-4 mr-1" />
                {(inv as any).assignedToName ? `Assigned: ${(inv as any).assignedToName}` : "Assign"}
              </Button>
              {showAssignee && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2 min-w-[200px]">
                  <p className="text-xs text-slate-400 px-2 py-1 mb-1">Assign to analyst</p>
                  <button
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-slate-800 text-slate-300"
                    onClick={() => assignMut.mutate({ investigationId: inv.id, assigneeId: null })}
                  >Unassign</button>
                  {(adminUsersData?.users ?? []).map((u: any) => (
                    <button
                      key={u.id}
                      className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-slate-800 text-slate-300"
                      onClick={() => assignMut.mutate({ investigationId: inv.id, assigneeId: u.id })}
                    >{u.name || u.email}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => runAiScoringMut.mutate({ id: inv.id })}
              disabled={runAiScoringMut.isPending}
              className="border-purple-700 text-purple-300 hover:bg-purple-900/30 bg-transparent gap-1"
            >
              {runAiScoringMut.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Run AI Scoring
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 bg-transparent"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                pdfBisMut.mutate({
                  investigationId: String(inv.id),
                  subjectName: inv.subjectFullName ?? "Unknown",
                  investigator: "TourismPay BIS Team",
                  riskScore: inv.riskScore ?? 0,
                  riskLevel: inv.riskLevel ?? "low",
                  findings: ((inv as any).findings
                    ? (Array.isArray((inv as any).findings)
                        ? ((inv as any).findings as string[])
                        : [String((inv as any).findings)])
                    : []) as string[],
                  recommendedAction: inv.riskLevel === "critical" || inv.riskLevel === "high"
                    ? "Escalate for manual review"
                    : "Monitor and review",
                })
              }
              disabled={pdfBisMut.isPending || isPdfDownloading}
              className="border-emerald-700 text-emerald-300 hover:bg-emerald-900/30 bg-transparent gap-1"
            >
              {pdfBisMut.isPending || isPdfDownloading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              PDF Report
            </Button>
          )}
          {inv.reportUrl && (
            <Button
              size="sm"
              onClick={() => window.open(inv.reportUrl!, "_blank")}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="w-4 h-4 mr-1" />
              Report
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: subject info + investigation config */}
        <div className="space-y-4">
          {/* Subject Info */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <User className="w-4 h-4 text-blue-400" />
                Subject Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Full Name", value: inv.subjectFullName },
                { label: "Date of Birth", value: inv.subjectDob },
                { label: "Nationality", value: inv.subjectNationality },
                { label: "NIN / ID", value: inv.subjectNin },
                { label: "Phone", value: inv.subjectPhone },
                { label: "Email", value: inv.subjectEmail },
                { label: "Role", value: inv.subjectRole },
                { label: "Country", value: inv.subjectCountry },
              ]
                .filter((f) => f.value)
                .map((f) => (
                  <div key={f.label} className="flex justify-between text-sm">
                    <span className="text-slate-500">{f.label}</span>
                    <span className="text-white font-medium">{f.value}</span>
                  </div>
                ))}
            </CardContent>
          </Card>

          {/* Investigation Config */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-violet-400" />
                Investigation Config
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Tier", value: inv.tier },
                { label: "Risk Score", value: inv.riskScore !== null ? String(inv.riskScore) : undefined },
                { label: "Price Paid", value: inv.pricePaid ? `${inv.pricePaid} ${inv.currency ?? "USD"}` : undefined },
                { label: "Consent", value: inv.consentObtained ? "Yes" : "No" },
                { label: "External Ref", value: inv.externalBisRef },
              ]
                .filter((f) => f.value !== undefined)
                .map((f) => (
                  <div key={f.label} className="flex justify-between text-sm">
                    <span className="text-slate-500">{f.label}</span>
                    <span className="text-white font-medium capitalize">{f.value}</span>
                  </div>
                ))}
            </CardContent>
          </Card>

          {/* Recommendations */}
          {inv.recommendations && (inv.recommendations as string[]).length > 0 && (
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {(inv.recommendations as string[]).map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="text-amber-400 mt-0.5 shrink-0">→</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: module results */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-white font-semibold text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-violet-400" />
            Module Results
          </h2>

          <ModuleCard
            title="Identity Verification"
            icon={<User className="w-4 h-4" />}
            iconColor="text-blue-400"
            data={moduleResults.identity}
            defaultOpen={true}
          />

          <ModuleCard
            title="Criminal Background"
            icon={<AlertTriangle className="w-4 h-4" />}
            iconColor="text-red-400"
            data={moduleResults.criminal}
          />

          <ModuleCard
            title="Financial History"
            icon={<DollarSign className="w-4 h-4" />}
            iconColor="text-emerald-400"
            data={moduleResults.financial}
          />

          <ModuleCard
            title="Sanctions & Watchlists"
            icon={<Globe className="w-4 h-4" />}
            iconColor="text-amber-400"
            data={moduleResults.sanctions}
          />

          {/* Admin: Module Result Editor */}
          {isAdmin && (
            <div className="mt-6">
              <button
                onClick={() => setShowEditor((v) => !v)}
                className="flex items-center gap-2 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors mb-3"
              >
                <Shield className="w-3.5 h-3.5" />
                {showEditor ? "Hide Module Editor" : "Edit Module Results (Admin)"}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showEditor ? "rotate-180" : ""}`} />
              </button>
              {showEditor && (
                <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
                  <BISModuleEditor
                    investigationId={inv.id}
                    referenceId={inv.referenceId}
                    currentModuleResults={moduleResults as Record<string, unknown>}
                    onSaved={() => { refetch(); setShowEditor(false); }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Investigation Timeline */}
          <div className="mt-6">
            <button
              onClick={() => setShowTimeline((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors mb-3 w-full"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {showTimeline ? "Hide Timeline" : "Show Investigation Timeline"}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ml-auto ${showTimeline ? "rotate-180" : ""}`} />
            </button>
            {showTimeline && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Timeline</h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Event type filter */}
                    <Select value={timelineEventTypeFilter} onValueChange={(v) => setTimelineEventTypeFilter(v)}>
                      <SelectTrigger className="h-7 text-[10px] bg-white/5 border-blue-500/20 text-blue-200 w-32">
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        {["note","status_change","ai_score","document_uploaded","created","osint_enrich","risk_update","assigned","other"].map((t) => (
                          <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Severity filter */}
                    <Select value={timelineSeverityFilter} onValueChange={(v) => setTimelineSeverityFilter(v)}>
                      <SelectTrigger className="h-7 text-[10px] bg-white/5 border-blue-500/20 text-blue-200 w-24">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All severity</SelectItem>
                        {["info","warning","critical","success"].map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Reset filters */}
                    {(timelineEventTypeFilter !== "all" || timelineSeverityFilter !== "all") && (
                      <button
                        className="text-[10px] text-blue-400 hover:text-blue-200 underline"
                        onClick={() => { setTimelineEventTypeFilter("all"); setTimelineSeverityFilter("all"); }}
                      >
                        Reset
                      </button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs border-blue-500/30 text-blue-300 hover:bg-blue-500/10" onClick={() => setAddingEvent((v) => !v)}>
                      <Plus className="w-3 h-3 mr-1" /> Add Note
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                      onClick={handleDownloadTimeline}
                      disabled={exportingTimeline}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      {exportingTimeline ? "Exporting…" : "Download CSV"}
                    </Button>
                  </div>
                </div>
                {addingEvent && (
                  <div className="space-y-2 p-3 rounded-lg bg-white/5 border border-blue-500/20">
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={eventForm.eventType} onValueChange={(v) => setEventForm((f) => ({ ...f, eventType: v }))}>
                        <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["note","status_change","document_uploaded","ai_score","osint_enrich","risk_update","assigned","other"].map((t) => (
                            <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={eventForm.severity} onValueChange={(v) => setEventForm((f) => ({ ...f, severity: v }))}>
                        <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["info","warning","critical","success"].map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input className="h-8 text-xs bg-white/5 border-white/10" placeholder="Event title *" value={eventForm.title} onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))} />
                    <Textarea className="text-xs bg-white/5 border-white/10 min-h-[60px]" placeholder="Description (optional)" value={eventForm.description} onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))} />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" disabled={!eventForm.title.trim() || addEventMut.isPending}
                        onClick={() => addEventMut.mutate({ investigationId: inv.id, eventType: eventForm.eventType as any, title: eventForm.title.trim(), description: eventForm.description.trim() || undefined, severity: eventForm.severity as any })}>
                        {addEventMut.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : null} Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingEvent(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
                {!timelineData?.events?.length ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No timeline events yet. Add the first note above.</p>
                ) : (
                  <div className="relative">
                    <div className="absolute left-3.5 top-0 bottom-0 w-px bg-blue-500/20" />
                    <div className="space-y-4">
                      {timelineData.events.map((ev) => {
                        const sc: Record<string, string> = { info: "bg-blue-500/20 border-blue-500/40 text-blue-300", warning: "bg-amber-500/20 border-amber-500/40 text-amber-300", critical: "bg-red-500/20 border-red-500/40 text-red-300", success: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" };
                        const dc: Record<string, string> = { info: "bg-blue-400", warning: "bg-amber-400", critical: "bg-red-400", success: "bg-emerald-400" };
                        return (
                          <div key={ev.id} className="flex gap-3 relative">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10 border ${dc[ev.severity] ?? "bg-blue-400"}`}>
                              <div className={`w-2 h-2 rounded-full ${dc[ev.severity] ?? "bg-blue-400"}`} />
                            </div>
                            <div className={`flex-1 rounded-lg p-3 border text-xs ${sc[ev.severity] ?? sc.info}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-semibold">{ev.title}</p>
                                  <p className="text-[10px] opacity-70 mt-0.5">{ev.eventType.replace(/_/g, " ")} · {ev.actorName ?? "System"} · {new Date(ev.createdAt).toLocaleString()}</p>
                                </div>
                                {isAdmin && (
                                  <button className="opacity-40 hover:opacity-100 transition-opacity" onClick={() => deleteEventMut.mutate({ eventId: ev.id })}>
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              {ev.description && <p className="mt-1.5 opacity-80">{ev.description}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Investigation Notes */}
          <div className="mt-6">
            <button
              onClick={() => setShowNotes((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors mb-3 w-full"
            >
              <FileText className="w-3.5 h-3.5" />
              {showNotes ? "Hide Notes" : `Show Investigation Notes${notesData ? ` (${notesData.length})` : ""}`}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ml-auto ${showNotes ? "rotate-180" : ""}`} />
            </button>
            {showNotes && (
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-4">
                {/* Notes toolbar */}
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Notes</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
                    disabled={exportingNotes}
                    onClick={handleDownloadNotes}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    {exportingNotes ? "Exporting…" : "Download Notes"}
                  </Button>
                </div>
                {/* Add note form */}
                <div className="space-y-2">
                  <Textarea
                    placeholder="Add a note about this investigation…"
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    className="text-xs bg-white/5 border-purple-500/20 text-foreground placeholder:text-muted-foreground min-h-[80px] resize-none"
                  />
                  <div className="flex items-center justify-between gap-2">
                    {isAdmin && (
                      <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={noteIsInternal}
                          onChange={(e) => setNoteIsInternal(e.target.checked)}
                          className="w-3 h-3"
                        />
                        Internal (admin only)
                      </label>
                    )}
                    <Button
                      size="sm"
                      className="h-7 text-[10px] ml-auto bg-purple-600 hover:bg-purple-700 text-white"
                      disabled={!noteContent.trim() || addNoteMut.isPending}
                      onClick={() => addNoteMut.mutate({ investigationId: inv.id, content: noteContent.trim(), isInternal: noteIsInternal })}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      {addNoteMut.isPending ? "Adding…" : "Add Note"}
                    </Button>
                  </div>
                </div>
                {/* Notes list */}
                {!notesData?.length ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No notes yet. Add the first note above.</p>
                ) : (
                  <div className="space-y-2">
                    {notesData.map((note: any) => (
                      <div key={note.id} className={`rounded-lg p-3 border text-xs ${note.isInternal ? "bg-amber-500/10 border-amber-500/20" : "bg-white/3 border-white/10"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="font-semibold text-foreground">{note.authorName}</span>
                              {note.isInternal && (
                                <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 py-0.5 rounded">Internal</span>
                              )}
                              <span className="text-muted-foreground text-[10px] ml-auto">{new Date(note.createdAt).toLocaleString()}</span>
                            </div>
                            <p className="text-foreground/80 whitespace-pre-wrap break-words">{note.content}</p>
                          </div>
                          {isAdmin && (
                            <button
                              className="opacity-40 hover:opacity-100 transition-opacity shrink-0"
                              onClick={() => deleteNoteMut.mutate({ noteId: note.id })}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Kill Switch Audit ─────────────────────────────────────────── */}
          <KillSwitchAuditSection investigationId={inv.id} />

          {/* Any extra modules not in the standard set */}
          {Object.entries(moduleResults)
            .filter(([k]) => !["identity", "criminal", "financial", "sanctions"].includes(k))
            .map(([key, data]) => (
              <ModuleCard
                key={key}
                title={key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ")}
                icon={<Shield className="w-4 h-4" />}
                iconColor="text-slate-400"
                data={data as Record<string, unknown>}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
