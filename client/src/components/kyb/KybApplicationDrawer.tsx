/**
 * KYB Application Detail Drawer
 * Slide-over panel showing full application details, document list with preview links,
 * and a status timeline.
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2, FileText, CheckCircle, XCircle, Clock,
  ExternalLink, AlertCircle, Download, User, Globe,
  Calendar, Hash, Layers, Shield, RefreshCw
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppRow = {
  id: number;
  establishmentId: number;
  establishmentName?: string | null;
  establishmentCountry?: string | null;
  establishmentType?: string | null;
  status: string;
  currentStep: number;
  totalSteps: number;
  docCompleteness: number;
  verifiedDocs: number;
  pendingDocs: number;
  rejectedDocs: number;
  reviewNotes?: string | null;
  reviewedAt?: Date | string | null;
  complianceScore?: number | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

interface KybApplicationDrawerProps {
  app: AppRow | null;
  open: boolean;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusStyles: Record<string, { bg: string; text: string; border: string }> = {
  draft:        { bg: "bg-gray-500/20",    text: "text-gray-400",    border: "border-gray-500/30" },
  submitted:    { bg: "bg-blue-500/20",    text: "text-blue-400",    border: "border-blue-500/30" },
  under_review: { bg: "bg-amber-500/20",   text: "text-amber-400",   border: "border-amber-500/30" },
  approved:     { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30" },
  rejected:     { bg: "bg-red-500/20",     text: "text-red-400",     border: "border-red-500/30" },
  suspended:    { bg: "bg-orange-500/20",  text: "text-orange-400",  border: "border-orange-500/30" },
};

const docStatusIcon: Record<string, React.ReactNode> = {
  verified: <CheckCircle className="w-3 h-3 text-emerald-400" />,
  pending:  <Clock className="w-3 h-3 text-amber-400" />,
  rejected: <XCircle className="w-3 h-3 text-red-400" />,
  expired:  <AlertCircle className="w-3 h-3 text-orange-400" />,
};

const docTypeLabels: Record<string, string> = {
  certificate_of_incorporation: "Certificate of Incorporation",
  business_license: "Business License",
  tax_certificate: "Tax Certificate",
  director_id: "Director ID",
  bank_statement: "Bank Statement",
  proof_of_address: "Proof of Address",
  ownership_structure: "Ownership Structure",
  financial_statements: "Financial Statements",
  other: "Other Document",
};

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Timeline Step ────────────────────────────────────────────────────────────

const TIMELINE_STEPS = [
  { key: "draft",        label: "Application Created",  icon: Hash },
  { key: "submitted",    label: "Submitted for Review", icon: FileText },
  { key: "under_review", label: "Under Review",         icon: Shield },
  { key: "approved",     label: "Approved",             icon: CheckCircle },
];

const STATUS_ORDER = ["draft", "submitted", "under_review", "approved", "rejected", "suspended"];

function Timeline({ status }: { status: string }) {
  const currentIdx = STATUS_ORDER.indexOf(status);
  const isRejected = status === "rejected" || status === "suspended";

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-3.5 top-4 bottom-4 w-px bg-border/50" />
      <div className="space-y-4">
        {TIMELINE_STEPS.map((step, i) => {
          const stepIdx = STATUS_ORDER.indexOf(step.key);
          const done = !isRejected && stepIdx <= currentIdx;
          const active = !isRejected && step.key === status;
          const Icon = step.icon;
          return (
            <div key={step.key} className="flex items-start gap-3 relative">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 border ${
                done
                  ? "bg-emerald-500/20 border-emerald-500/50"
                  : active
                  ? "bg-primary/20 border-primary/50"
                  : "bg-white/5 border-border/50"
              }`}>
                <Icon className={`w-3 h-3 ${done ? "text-emerald-400" : active ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1 pt-0.5">
                <p className={`text-xs font-medium ${done || active ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.label}
                </p>
              </div>
            </div>
          );
        })}
        {isRejected && (
          <div className="flex items-start gap-3 relative">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 border bg-red-500/20 border-red-500/50">
              <XCircle className="w-3 h-3 text-red-400" />
            </div>
            <div className="flex-1 pt-0.5">
              <p className="text-xs font-medium text-red-400 capitalize">{status}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Document Row ─────────────────────────────────────────────────────────────

type DocRow = {
  id: number;
  documentType: string;
  status: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  reviewNotes?: string | null;
  createdAt?: Date | string | null;
};

function DocumentRow({ doc }: { doc: DocRow }) {
  const label = docTypeLabels[doc.documentType] ?? doc.documentType.replace(/_/g, " ");
  const sizeKb = doc.fileSize ? `${Math.round(doc.fileSize / 1024)} KB` : null;

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border/30 bg-white/2 hover:bg-white/4 transition-colors">
      <div className="w-7 h-7 rounded bg-white/5 flex items-center justify-center shrink-0">
        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-foreground truncate">{label}</span>
          {docStatusIcon[doc.status] ?? <Clock className="w-3 h-3 text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {doc.fileName && <span className="truncate max-w-[120px]">{doc.fileName}</span>}
          {sizeKb && <span className="font-mono">{sizeKb}</span>}
          {doc.createdAt && <span>{formatDate(doc.createdAt)}</span>}
        </div>
        {doc.reviewNotes && (
          <p className="text-[10px] text-amber-400 mt-1 italic">Note: {doc.reviewNotes}</p>
        )}
      </div>
      {doc.fileUrl && (
        <a
          href={doc.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
          title="Open document"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

// ─── Compliance Score Ring ────────────────────────────────────────────────────

function ComplianceScoreRing({ score }: { score: number | null | undefined }) {
  const s = score ?? 0;
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (s / 100) * circumference;
  const color =
    s >= 75 ? "oklch(0.78 0.22 152)" :
    s >= 50 ? "oklch(0.82 0.18 75)" :
    s >= 25 ? "oklch(0.75 0.20 50)" :
    "oklch(0.55 0.25 25)";
  const label =
    s >= 75 ? "Strong" :
    s >= 50 ? "Moderate" :
    s >= 25 ? "Weak" :
    "Incomplete";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="oklch(0.25 0 0)" strokeWidth="6" />
        <circle
          cx="40" cy="40" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="-mt-14 flex flex-col items-center">
        <span className="text-xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
          {score != null ? `${s}` : "—"}
        </span>
        {score != null && <span className="text-[9px] text-muted-foreground font-mono">/100</span>}
      </div>
      <p className="text-[10px] font-semibold mt-1" style={{ color }}>{score != null ? label : "Not scored"}</p>
    </div>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

export default function KybApplicationDrawer({ app, open, onClose }: KybApplicationDrawerProps) {
  const { data: documents, isLoading: docsLoading } = trpc.kybDocuments.listByApplication.useQuery(
    { applicationId: app?.id ?? 0 },
    { enabled: open && app != null }
  );

  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const recalcScore = trpc.kybCompliance.recalculateScore.useMutation({
    onSuccess: (data) => {
      toast.success("Score recalculated", { description: `New compliance score: ${data.complianceScore}/100` });
      utils.kybApplications.listAll.invalidate();
    },
    onError: () => {
      toast.error("Failed to recalculate score", { description: "Please try again." });
    },
  });

  if (!app) return null;

  const st = statusStyles[app.status] ?? statusStyles.draft;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg bg-card border-l border-border overflow-y-auto"
      >
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base font-bold text-foreground truncate" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {app.establishmentName ?? `Establishment #${app.establishmentId}`}
              </SheetTitle>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase ${st.bg} ${st.text} ${st.border}`}>
                  {app.status.replace(/_/g, " ")}
                </span>
                {app.establishmentCountry && (
                  <span className="text-[10px] font-mono text-muted-foreground">{app.establishmentCountry}</span>
                )}
                {app.establishmentType && (
                  <span className="text-[10px] text-muted-foreground capitalize">{app.establishmentType.replace(/_/g, " ")}</span>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="py-4 space-y-6">
          {/* Compliance Score Ring */}
          <section className="flex items-center gap-6 p-4 rounded-xl border border-border/30 bg-white/2">
            <ComplianceScoreRing score={app.complianceScore} />
            <div className="flex-1 space-y-1">
              <p className="text-xs font-semibold text-foreground">Compliance Score</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Scored on document completeness, verification status, and application progress.
              </p>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-[10px] gap-1.5"
                  onClick={() => recalcScore.mutate({ applicationId: app.id })}
                  disabled={recalcScore.isPending}
                >
                  <RefreshCw className={`w-3 h-3 ${recalcScore.isPending ? "animate-spin" : ""}`} />
                  {recalcScore.isPending ? "Calculating..." : "Recalculate"}
                </Button>
              )}
            </div>
          </section>

          {/* Key Details */}
          <section>
            <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Application Details
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Hash, label: "App ID", value: `#${app.id}` },
                { icon: Layers, label: "Progress", value: `Step ${app.currentStep} / ${app.totalSteps}` },
                { icon: Calendar, label: "Submitted", value: formatDate(app.createdAt) },
                { icon: Calendar, label: "Last Updated", value: formatDate(app.updatedAt) },
                { icon: FileText, label: "Verified Docs", value: `${app.verifiedDocs} / ${app.verifiedDocs + app.pendingDocs + app.rejectedDocs}` },
                { icon: Shield, label: "Compliance Score", value: app.complianceScore != null ? `${app.complianceScore}%` : "—" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-2 p-2.5 rounded-lg bg-white/3 border border-border/30">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
                    <p className="text-xs font-medium text-foreground mt-0.5">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Document Completeness Bar */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Document Completeness
              </h4>
              <span className="text-xs font-mono text-foreground">{app.docCompleteness}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${app.docCompleteness}%`,
                  background: app.docCompleteness >= 80
                    ? "oklch(0.78 0.22 152)"
                    : app.docCompleteness >= 50
                    ? "oklch(0.82 0.18 75)"
                    : "oklch(0.55 0.25 25)",
                }}
              />
            </div>
            <div className="flex gap-3 mt-2 text-[10px] font-mono">
              <span className="text-emerald-400">{app.verifiedDocs} verified</span>
              <span className="text-amber-400">{app.pendingDocs} pending</span>
              {app.rejectedDocs > 0 && <span className="text-red-400">{app.rejectedDocs} rejected</span>}
            </div>
          </section>

          {/* Review Notes */}
          {app.reviewNotes && (
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Review Notes
              </h4>
              <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs text-amber-300">
                {app.reviewNotes}
              </div>
              {app.reviewedAt && (
                <p className="text-[10px] text-muted-foreground mt-1">Reviewed {formatDate(app.reviewedAt)}</p>
              )}
            </section>
          )}

          {/* Documents */}
          <section>
            <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Uploaded Documents
            </h4>
            {docsLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                <span className="animate-spin w-3 h-3 border border-muted-foreground border-t-transparent rounded-full" />
                Loading documents...
              </div>
            ) : (documents ?? []).length === 0 ? (
              <div className="p-4 text-center rounded-lg border border-dashed border-border/50">
                <FileText className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No documents uploaded yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(documents ?? []).map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} />
                ))}
              </div>
            )}
          </section>

          {/* Status Timeline */}
          <section>
            <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Status Timeline
            </h4>
            <Timeline status={app.status} />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
