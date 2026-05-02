import { useState } from "react";
import {
  Play, RefreshCw, Loader2, Clock, Cpu, CheckCircle,
  AlertTriangle, Shield, BarChart3, Zap, List
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const tierColors: Record<string, string> = {
  basic: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  standard: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  comprehensive: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

// ─── Investigation Row ────────────────────────────────────────────────────────

type InvRow = {
  id: number;
  referenceId: string;
  subjectFullName: string;
  tier: string;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

function InvRow({ inv, status }: { inv: InvRow; status: "pending" | "processing" }) {
  return (
    <tr className="border-b border-border/30 hover:bg-white/3 transition-colors">
      <td className="p-3">
        <span className="font-mono text-[10px] text-primary">{inv.referenceId}</span>
      </td>
      <td className="p-3">
        <span className="text-xs font-medium text-foreground">{inv.subjectFullName}</span>
      </td>
      <td className="p-3">
        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase ${tierColors[inv.tier] ?? tierColors.basic}`}>
          {inv.tier}
        </span>
      </td>
      <td className="p-3">
        {status === "pending" ? (
          <div className="flex items-center gap-1.5 text-amber-400">
            <Clock className="w-3 h-3" />
            <span className="text-[10px] font-mono">Pending</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-blue-400">
            <Cpu className="w-3 h-3 animate-pulse" />
            <span className="text-[10px] font-mono">Processing</span>
          </div>
        )}
      </td>
      <td className="p-3 text-[10px] text-muted-foreground font-mono">
        {status === "pending"
          ? inv.createdAt ? timeAgo(inv.createdAt) : "—"
          : inv.updatedAt ? timeAgo(inv.updatedAt) : "—"}
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BISQueueManagement() {
  const [lastCycleResult, setLastCycleResult] = useState<{
    advanced: number;
    completed: number;
    errors: number;
    message: string;
  } | null>(null);

  const utils = trpc.useUtils();

  const { data: queueStatus, isLoading, refetch } = trpc.bisJobs.queueStatus.useQuery(
    undefined,
    { refetchInterval: 15_000 }
  );

  const triggerMutation = trpc.bisJobs.triggerAutoAdvance.useMutation({
    onSuccess: (data) => {
      setLastCycleResult(data);
      toast.success(data.message);
      utils.bisJobs.queueStatus.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const pendingList = queueStatus?.pending ?? [];
  const processingList = queueStatus?.processing ?? [];
  const totalQueued = (queueStatus?.pendingCount ?? 0) + (queueStatus?.processingCount ?? 0);

  return (
    <div className="p-6 min-h-full">
      <PageHeader
        title="BIS Queue Management"
        subtitle="Monitor and advance background investigation processing queue"
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-border bg-white/5"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs bg-primary hover:bg-primary/90"
              onClick={() => triggerMutation.mutate()}
              disabled={triggerMutation.isPending || totalQueued === 0}
              title={totalQueued === 0 ? "No investigations in queue" : "Run one advance cycle"}
            >
              {triggerMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Play className="w-3 h-3 mr-1" />
              )}
              Trigger Cycle
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Pending"
          value={queueStatus?.pendingCount ?? "—"}
          icon={Clock}
          color="amber"
        />
        <StatCard
          label="Processing"
          value={queueStatus?.processingCount ?? "—"}
          icon={Cpu}
          color="blue"
        />
        <StatCard
          label="Total Queued"
          value={totalQueued || "—"}
          icon={List}
          color="blue"
        />
        <StatCard
          label="Last Cycle"
          value={lastCycleResult ? `+${lastCycleResult.completed}` : "—"}
          icon={Zap}
          color="green"
        />
      </div>

      {/* Last cycle result banner */}
      {lastCycleResult && (
        <div className="mb-4 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-3">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-emerald-400">Last Cycle Result</p>
            <p className="text-[10px] text-muted-foreground">{lastCycleResult.message}</p>
          </div>
          {lastCycleResult.errors > 0 && (
            <div className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              <span className="text-[10px]">{lastCycleResult.errors} error(s)</span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pending Queue */}
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                Pending Queue
              </h3>
            </div>
            <Badge className="badge-amber text-[9px] font-mono">{queueStatus?.pendingCount ?? 0}</Badge>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                {["Ref ID", "Subject", "Tier", "Status", "Queued"].map((h) => (
                  <th key={h} className="text-left p-3 text-muted-foreground font-medium uppercase tracking-wider text-[10px]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground text-xs">
                    <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> Loading...
                  </td>
                </tr>
              ) : pendingList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center">
                    <CheckCircle className="w-6 h-6 text-emerald-400/40 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No pending investigations</p>
                  </td>
                </tr>
              ) : (
                pendingList.map((inv) => (
                  <InvRow key={inv.id} inv={inv} status="pending" />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Processing Queue */}
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                Processing Queue
              </h3>
            </div>
            <Badge className="badge-blue text-[9px] font-mono">{queueStatus?.processingCount ?? 0}</Badge>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                {["Ref ID", "Subject", "Tier", "Status", "Started"].map((h) => (
                  <th key={h} className="text-left p-3 text-muted-foreground font-medium uppercase tracking-wider text-[10px]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground text-xs">
                    <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> Loading...
                  </td>
                </tr>
              ) : processingList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center">
                    <Shield className="w-6 h-6 text-blue-400/40 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No investigations in processing</p>
                  </td>
                </tr>
              ) : (
                processingList.map((inv) => (
                  <InvRow key={inv.id} inv={inv} status="processing" />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* How it works */}
      <div className="mt-4 p-4 rounded-lg border border-border/50 bg-white/3">
        <h4 className="text-xs font-semibold text-foreground mb-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
          How the Auto-Advance Job Works
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[10px] text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[9px] font-bold shrink-0">1</span>
            <p><strong className="text-foreground">Pending → Processing</strong> — Up to 5 pending investigations are advanced to processing per cycle.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[9px] font-bold shrink-0">2</span>
            <p><strong className="text-foreground">Processing → Completed/Flagged</strong> — Risk scores are generated, module results populated, and status finalised.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[9px] font-bold shrink-0">3</span>
            <p><strong className="text-foreground">Notifications sent</strong> — The requester and owner are notified with the risk score and a link to the full report.</p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          The job runs automatically every <strong className="text-foreground">60 seconds</strong> in the background. Use "Trigger Cycle" to run it immediately.
        </p>
      </div>
    </div>
  );
}
