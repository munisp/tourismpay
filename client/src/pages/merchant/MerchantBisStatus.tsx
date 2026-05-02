/**
 * MerchantBisStatus.tsx
 *
 * Merchant-facing page showing the progress of their Background Investigation
 * Service (BIS) check, which is a prerequisite for KYB approval on TourismPay.
 *
 * Features:
 * - Overall investigation status with colour-coded badge
 * - Module result cards (identity, criminal, financial, sanctions, AML, etc.)
 * - Chronological timeline of investigation events
 * - KYB gate explanation: what BIS is, why it's required, and what comes next
 * - Contact compliance team CTA
 */

import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Shield, CheckCircle2, Clock, AlertTriangle, RefreshCw,
  ChevronRight, Building2, FileText, ArrowLeft, Info, Mail,
  Lock, Unlock, Activity, TrendingUp, Globe, User, DollarSign,
} from "lucide-react";

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  pending: {
    color: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    icon: <Clock className="w-4 h-4" />,
    label: "Queued",
  },
  processing: {
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: <RefreshCw className="w-4 h-4 animate-spin" />,
    label: "In Progress",
  },
  completed: {
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: <CheckCircle2 className="w-4 h-4" />,
    label: "Completed",
  },
  flagged: {
    color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "Flagged for Review",
  },
  failed: {
    color: "bg-red-500/10 text-red-400 border-red-500/20",
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "Failed",
  },
};

const KYB_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  draft: { color: "bg-slate-500/20 text-slate-400", label: "Draft" },
  submitted: { color: "bg-blue-500/20 text-blue-400", label: "Submitted" },
  under_review: { color: "bg-amber-500/20 text-amber-400", label: "Under Review" },
  approved: { color: "bg-emerald-500/20 text-emerald-400", label: "Approved ✓" },
  rejected: { color: "bg-red-500/20 text-red-400", label: "Rejected" },
  suspended: { color: "bg-orange-500/20 text-orange-400", label: "Suspended" },
};

const RISK_CONFIG: Record<string, { color: string; label: string }> = {
  low: { color: "text-emerald-400", label: "Low Risk" },
  medium: { color: "text-amber-400", label: "Medium Risk" },
  high: { color: "text-orange-400", label: "High Risk" },
  critical: { color: "text-red-400", label: "Critical Risk" },
};

// ─── Module icons ─────────────────────────────────────────────────────────────

const MODULE_ICONS: Record<string, React.ReactNode> = {
  identity: <User className="w-4 h-4" />,
  criminal: <Shield className="w-4 h-4" />,
  financial: <DollarSign className="w-4 h-4" />,
  sanctions: <Globe className="w-4 h-4" />,
  aml: <Activity className="w-4 h-4" />,
  regulatory: <FileText className="w-4 h-4" />,
  directorship: <Building2 className="w-4 h-4" />,
  company_structure: <TrendingUp className="w-4 h-4" />,
};

// ─── Module Result Card ───────────────────────────────────────────────────────

function ModuleCard({
  name,
  data,
}: {
  name: string;
  data: Record<string, unknown> | null | undefined;
}) {
  const icon = MODULE_ICONS[name.toLowerCase()] ?? <FileText className="w-4 h-4" />;
  const label = name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const status = (data as any)?.status ?? (data ? "completed" : "pending");
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card/50">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{label}</p>
          <Badge variant="outline" className={`text-[10px] ${statusCfg.color} flex items-center gap-1`}>
            {statusCfg.icon}
            {statusCfg.label}
          </Badge>
        </div>
        {data && typeof data === "object" && (
          <div className="mt-1 space-y-0.5">
            {Object.entries(data)
              .filter(([k]) => k !== "status" && k !== "raw")
              .slice(0, 3)
              .map(([k, v]) => (
                <p key={k} className="text-xs text-muted-foreground">
                  <span className="capitalize">{k.replace(/_/g, " ")}</span>:{" "}
                  <span className="text-foreground/70">{String(v)}</span>
                </p>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Timeline Event ───────────────────────────────────────────────────────────

function TimelineEvent({
  event,
}: {
  event: {
    id: string;
    eventType: string;
    title: string;
    description: string | null;
    severity: string;
    actorName: string | null;
    createdAt: number;
  };
}) {
  const severityColor: Record<string, string> = {
    info: "bg-blue-500",
    warning: "bg-amber-500",
    error: "bg-red-500",
    success: "bg-emerald-500",
    critical: "bg-red-600",
  };
  const dotColor = severityColor[event.severity] ?? "bg-slate-400";

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${dotColor}`} />
        <div className="w-px flex-1 bg-border mt-1" />
      </div>
      <div className="pb-4 flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">{event.title}</p>
        {event.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
        )}
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          {new Date(event.createdAt).toLocaleString()}
          {event.actorName && ` · ${event.actorName}`}
        </p>
      </div>
    </div>
  );
}

// ─── Progress Steps ───────────────────────────────────────────────────────────

function ProgressStepper({
  bisStatus,
  kybStatus,
}: {
  bisStatus: string;
  kybStatus: string;
}) {
  const steps = [
    { id: "kyb_submitted", label: "KYB Submitted", done: kybStatus !== "draft" },
    { id: "bis_queued", label: "BIS Queued", done: bisStatus !== undefined },
    { id: "bis_processing", label: "BIS In Progress", done: bisStatus === "processing" || bisStatus === "completed" },
    { id: "bis_completed", label: "BIS Cleared", done: bisStatus === "completed" },
    { id: "kyb_approved", label: "KYB Approved", done: kybStatus === "approved" },
  ];

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-1 flex-shrink-0">
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-all ${
            step.done
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-muted/30 text-muted-foreground border-border"
          }`}>
            {step.done ? <CheckCircle2 className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border-2 border-current opacity-40" />}
            <span className="whitespace-nowrap">{step.label}</span>
          </div>
          {i < steps.length - 1 && (
            <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MerchantBisStatus() {
  const { isAuthenticated, loading } = useAuth();

  const { data, isLoading, refetch } = trpc.bis.myEstablishmentStatus.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 60_000, // Refresh every minute
  });

  if (loading || isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
        <h1 className="text-xl font-bold mb-2">BIS Compliance Status</h1>
        <p className="text-muted-foreground mb-4">Sign in to view your BIS investigation status.</p>
        <Button asChild><a href={getLoginUrl()}>Sign in</a></Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/restaurant-onboarding">
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          </Link>
          <h1 className="text-xl font-bold">BIS Compliance Status</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">No establishment found for your account.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Please complete the{" "}
              <Link href="/restaurant-onboarding" className="text-primary underline">business onboarding</Link>{" "}
              first.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { establishment, investigation, timeline, kybApplication, bisRequired, message } = data;
  const invStatus = investigation?.status ?? "none";
  const statusCfg = STATUS_CONFIG[invStatus] ?? STATUS_CONFIG.pending;
  const kybCfg = KYB_STATUS_CONFIG[establishment.kybStatus] ?? KYB_STATUS_CONFIG.draft;
  const riskCfg = investigation?.riskLevel ? RISK_CONFIG[investigation.riskLevel] : null;
  const moduleResults = investigation?.moduleResults as Record<string, unknown> | null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/merchant/revenue">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Dashboard</Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            BIS Compliance Status
          </h1>
          <p className="text-xs text-muted-foreground">{establishment.name}</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => refetch()}>
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* What is BIS — info banner */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-300">What is a Background Investigation (BIS)?</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                TourismPay requires a Background Investigation Service (BIS) check for all businesses before they can go live.
                This is a standard compliance step that verifies your business identity, regulatory standing, and financial integrity.
                The check is conducted by our compliance team and typically takes 24–72 hours.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Once your BIS investigation is marked as <strong className="text-foreground">Completed</strong>, your KYB application
                will be eligible for final approval and your establishment will go live on TourismPay.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress stepper */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Onboarding Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgressStepper
            bisStatus={invStatus}
            kybStatus={establishment.kybStatus}
          />
        </CardContent>
      </Card>

      {/* Status summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">BIS Investigation</p>
            {investigation ? (
              <>
                <Badge variant="outline" className={`${statusCfg.color} flex items-center gap-1.5 w-fit mb-2`}>
                  {statusCfg.icon}
                  {statusCfg.label}
                </Badge>
                <p className="text-[10px] text-muted-foreground font-mono">{investigation.referenceId}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{investigation.tier} tier</p>
                {riskCfg && (
                  <p className={`text-[10px] font-semibold mt-1 ${riskCfg.color}`}>{riskCfg.label}</p>
                )}
                {investigation.riskScore != null && (
                  <p className="text-[10px] text-muted-foreground">Risk score: {investigation.riskScore}/100</p>
                )}
              </>
            ) : (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Lock className="w-3.5 h-3.5" />
                <span className="text-xs">Not yet initiated</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">KYB Application</p>
            <Badge variant="outline" className={`${kybCfg.color} w-fit mb-2 text-[10px]`}>
              {kybCfg.label}
            </Badge>
            {kybApplication ? (
              <>
                <p className="text-[10px] text-muted-foreground">
                  App #{kybApplication.id}
                </p>
                {kybApplication.createdAt && (
                  <p className="text-[10px] text-muted-foreground">
                    Submitted: {new Date(kybApplication.createdAt).toLocaleDateString()}
                  </p>
                )}
                {kybApplication.reviewNotes && (
                  <p className="text-[10px] text-muted-foreground mt-1 italic">
                    Note: {kybApplication.reviewNotes}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No application submitted</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status message */}
      {message && (
        <Card className={`border-l-4 ${
          invStatus === "completed" ? "border-l-emerald-500 bg-emerald-500/5" :
          invStatus === "flagged" || invStatus === "failed" ? "border-l-red-500 bg-red-500/5" :
          "border-l-blue-500 bg-blue-500/5"
        }`}>
          <CardContent className="p-4">
            <div className="flex gap-2">
              {invStatus === "completed" ? (
                <Unlock className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : invStatus === "flagged" || invStatus === "failed" ? (
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              ) : (
                <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              )}
              <p className="text-sm leading-relaxed">{message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Module results */}
      {moduleResults && Object.keys(moduleResults).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Investigation Modules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(moduleResults).map(([name, data]) => (
              <ModuleCard key={name} name={name} data={data as Record<string, unknown>} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Investigation timeline */}
      {timeline.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Investigation Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {(timeline as any[]).map((event) => (
                <TimelineEvent key={event.id} event={event} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contact compliance team */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">Need help?</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                If your investigation has been pending for more than 72 hours or you have questions about the process,
                please contact the TourismPay compliance team at{" "}
                <a href="mailto:compliance@tourismpay.com" className="text-primary underline">
                  compliance@tourismpay.com
                </a>
                {" "}and quote your reference number{" "}
                {investigation?.referenceId && (
                  <strong className="font-mono text-foreground">{investigation.referenceId}</strong>
                )}.
              </p>
            </div>
          </div>
          <Separator className="my-3" />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/africa/kyb">
                <FileText className="w-3.5 h-3.5 mr-1.5" /> View KYB Application
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/merchant/revenue">
                <Building2 className="w-3.5 h-3.5 mr-1.5" /> Revenue Dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
