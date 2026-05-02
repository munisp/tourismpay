/**
 * ComplianceDashboard.tsx
 *
 * Role-restricted dashboard for Compliance Officers (and admins).
 * Shows: KYB queue summary, pending reviews, recent audit events,
 * compliance score distribution, and quick-action links.
 *
 * Accessible to: compliance_officer, admin
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { RoleGuard } from "@/components/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  CheckCircle2, Clock, XCircle, AlertTriangle, FileCheck,
  Building2, RefreshCw, ArrowRight, ShieldCheck, Activity,
} from "lucide-react";
import { format } from "date-fns";
import { usePdfDownload } from "@/hooks/usePdfDownload";
import { Download } from "lucide-react";

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-primary",
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  href?: string;
}) {
  const inner = (
    <Card className={href ? "hover:border-primary/50 transition-colors cursor-pointer" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center ${color}`}>
            <Icon className="w-4.5 h-4.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ─── Compliance score distribution chart ─────────────────────────────────────

const SCORE_COLORS: Record<string, string> = {
  "0-20": "#ef4444",
  "21-40": "#f97316",
  "41-60": "#eab308",
  "61-80": "#22c55e",
  "81-100": "#10b981",
  "No Score": "#6b7280",
};

function ScoreDistributionChart() {
  const { data = [], isLoading } = trpc.kybApplications.complianceScoreDistribution.useQuery();

  if (isLoading) return <div className="h-48 bg-muted animate-pulse rounded-lg" />;
  if (!data.length) return (
    <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
      No score data available
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data as any[]} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip
          formatter={(v: number) => [v, "Applications"]}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {(data as any[]).map((entry: any) => (
            <Cell key={entry.bucket} fill={SCORE_COLORS[entry.bucket] ?? "#6b7280"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Recent audit events ──────────────────────────────────────────────────────

function RecentAuditEvents() {
  const { data, isLoading } = trpc.auditLogs.list.useQuery({
    limit: 8,
    offset: 0,
  });

  if (isLoading) return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
    </div>
  );

  const events = (data as any[] | undefined) ?? [];
  if (!events.length) return (
    <p className="text-sm text-muted-foreground py-4 text-center">No recent audit events</p>
  );

  const actionColor: Record<string, string> = {
    "kyb.application.approve": "text-emerald-600",
    "kyb.application.reject": "text-red-500",
    "bis.investigation.create": "text-amber-500",
    "bis.investigation.close": "text-blue-500",
  };

  return (
    <div className="space-y-2">
      {events.map((ev: any) => (
        <div key={ev.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/20 transition-colors">
          <Activity className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold truncate ${actionColor[ev.action] ?? "text-foreground"}`}>
              {ev.action}
            </p>
            <p className="text-xs text-muted-foreground truncate">{ev.description ?? ev.entityType}</p>
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {ev.createdAt ? format(new Date(ev.createdAt), "MMM d HH:mm") : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Pending KYB queue ────────────────────────────────────────────────────────

function PendingKYBQueue() {
  const { data, isLoading } = trpc.kybApplications.listAll.useQuery({ status: "submitted", limit: 5 });

  if (isLoading) return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}
    </div>
  );

  const apps = (data as any[] | undefined) ?? [];
  if (!apps.length) return (
    <div className="py-6 text-center">
      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">No pending applications — queue is clear!</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {apps.map((app: any) => (
        <div key={app.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/20 transition-colors">
          <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{app.establishmentName ?? `Application #${app.id}`}</p>
            <p className="text-xs text-muted-foreground">
              Submitted {app.createdAt ? format(new Date(app.createdAt), "MMM d, yyyy") : "—"}
              {" · "}Docs: {app.docCompleteness ?? 0}% complete
            </p>
          </div>
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 shrink-0">
            Pending
          </Badge>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full mt-2" asChild>
        <Link href="/admin/kyb-applications">
          View All Applications <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
        </Link>
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ComplianceDashboard() {
  const utils = trpc.useUtils();

  const { data: stats, isLoading: statsLoading, refetch } = trpc.kybApplications.stats.useQuery();
  const { downloadPdf, isDownloading: isPdfDownloading } = usePdfDownload();
  const pdfComplianceMut = trpc.pythonServices.pdfComplianceReport.useMutation({
    onSuccess: async (data) => {
      await downloadPdf(data as any, `compliance-report-${Date.now()}.pdf`);
    },
    onError: (err) => { import("sonner").then(({ toast }) => toast.error(`PDF failed: ${err.message}`)); },
  });

  const s = stats as any;

  return (
    <RoleGuard roles={["compliance_officer", "admin"]}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Compliance Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Monitor KYB applications, review documents, and track compliance events.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() =>
                pdfComplianceMut.mutate({
                  entityName: "TourismPay Platform",
                  entityId: "platform",
                  reportType: "KYB_SUMMARY",
                  riskRating: s?.pendingReview > 5 ? "HIGH" : s?.pendingReview > 2 ? "MEDIUM" : "LOW",
                  findings: [
                    `Total applications: ${s?.total ?? 0}`,
                    `Pending review: ${s?.pendingReview ?? 0}`,
                    `Approved: ${s?.approved ?? 0}`,
                    `Rejected: ${s?.rejected ?? 0}`,
                  ],
                  recommendations: [
                    s?.pendingReview > 0 ? `Review ${s?.pendingReview} pending application(s)` : "No pending reviews",
                    "Ensure all approved establishments have valid documentation",
                  ],
                })
              }
              disabled={pdfComplianceMut.isPending || isPdfDownloading}
            >
              {pdfComplianceMut.isPending || isPdfDownloading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              PDF Report
            </Button>
            <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/kyb-applications">
                <FileCheck className="w-3.5 h-3.5 mr-1.5" /> KYB Queue
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/audit-log">
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Audit Log
              </Link>
            </Button>
          </div>
        </div>

        {/* KPI grid */}
        {statsLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              icon={Clock}
              label="Pending Review"
              value={s?.submitted ?? 0}
              sub="Awaiting decision"
              color="text-amber-600"
              href="/admin/kyb-applications"
            />
            <KPICard
              icon={CheckCircle2}
              label="Approved"
              value={s?.approved ?? 0}
              sub="Total approved"
              color="text-emerald-600"
            />
            <KPICard
              icon={XCircle}
              label="Rejected"
              value={s?.rejected ?? 0}
              sub="Total rejected"
              color="text-red-600"
            />
            <KPICard
              icon={AlertTriangle}
              label="Under Review"
              value={s?.under_review ?? 0}
              sub="In active review"
              color="text-blue-600"
            />
          </div>
        )}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pending KYB queue */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Pending KYB Applications</CardTitle>
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                  {s?.submitted ?? 0} pending
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <PendingKYBQueue />
            </CardContent>
          </Card>

          {/* Compliance score distribution */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Compliance Score Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ScoreDistributionChart />
            </CardContent>
          </Card>
        </div>

        {/* Recent audit events */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Audit Events</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/audit-log">
                  View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <RecentAuditEvents />
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4 px-5">
            <h3 className="text-sm font-semibold mb-3">Quick Actions</h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/kyb-applications"><FileCheck className="w-3.5 h-3.5 mr-1.5" /> Review KYB Queue</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/kyb-documents"><Building2 className="w-3.5 h-3.5 mr-1.5" /> Document Review</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/audit-log"><Activity className="w-3.5 h-3.5 mr-1.5" /> Audit Log</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/security/fraud"><AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> Fraud Monitor</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}
