/**
 * Incident Playbook — N-06
 * NOC runbooks for handling platform incidents.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { BookOpen, AlertTriangle, CheckCircle, Clock, Search, RefreshCw, Play } from "lucide-react";
import { toast } from "sonner";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

// Built-in playbooks for common TourismPay incidents
const BUILTIN_PLAYBOOKS = [
  { id: "pb-001", title: "Payment Gateway Outage", severity: "critical", category: "Payments", steps: ["Activate fallback gateway", "Notify merchants via SMS", "Monitor transaction queue", "Escalate to payment team", "Post incident report"], estimatedTime: "15 min" },
  { id: "pb-002", title: "Settlement Batch Failure", severity: "high", category: "Settlement", steps: ["Identify failed batch IDs", "Check TigerBeetle ledger", "Retry failed transfers", "Notify settlement officer", "Reconcile discrepancies"], estimatedTime: "30 min" },
  { id: "pb-003", title: "Fraud Alert Spike", severity: "high", category: "Security", steps: ["Review alert dashboard", "Activate kill switch if needed", "Notify compliance team", "Block suspicious accounts", "Document incident"], estimatedTime: "20 min" },
  { id: "pb-004", title: "Database Connection Pool Exhausted", severity: "critical", category: "Infrastructure", steps: ["Check active connections", "Kill idle connections", "Scale connection pool", "Restart affected services", "Monitor recovery"], estimatedTime: "10 min" },
  { id: "pb-005", title: "BIS Investigation System Down", severity: "medium", category: "Compliance", steps: ["Check BIS service health", "Notify BIS analysts", "Enable manual investigation mode", "Restore service", "Verify data integrity"], estimatedTime: "25 min" },
  { id: "pb-006", title: "eNaira Gateway Timeout", severity: "medium", category: "Payments", steps: ["Check CBN API status", "Enable offline mode", "Queue pending transactions", "Monitor CBN status page", "Process queued transactions on recovery"], estimatedTime: "45 min" },
];

export default function IncidentPlaybook() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [selectedPlaybook, setSelectedPlaybook] = useState<typeof BUILTIN_PLAYBOOKS[0] | null>(null);
  const [activeSteps, setActiveSteps] = useState<Set<number>>(new Set());

  const { data: liveData, isLoading, isFetched } =
    trpc.incidentPlaybook.list.useQuery(undefined, { retry: 1, refetchInterval: 60_000 });

  const dbPlaybooks: any[] = liveData?.items ?? [];

  const filtered = BUILTIN_PLAYBOOKS.filter(
    (p) => !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleRunPlaybook = (pb: typeof BUILTIN_PLAYBOOKS[0]) => {
    setSelectedPlaybook(pb);
    setActiveSteps(new Set());
    toast.info(`Playbook started: ${pb.title}`);
  };

  const toggleStep = (idx: number) => {
    setActiveSteps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const allStepsComplete = selectedPlaybook && activeSteps.size === selectedPlaybook.steps.length;

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Incident Playbook" subtitle="NOC runbooks for handling platform incidents" icon={<BookOpen className="w-6 h-6" />}>
        <Button onClick={() => utils.incidentPlaybook.list.invalidate()} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="w-4 h-4" />Refresh
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Playbooks" value={String(BUILTIN_PLAYBOOKS.length)} icon={<BookOpen className="w-5 h-5 text-blue-500" />} trend="available runbooks" />
        <StatCard title="Critical" value={String(BUILTIN_PLAYBOOKS.filter(p => p.severity === "critical").length)} icon={<AlertTriangle className="w-5 h-5 text-red-500" />} trend="severity level" />
        <StatCard title="High" value={String(BUILTIN_PLAYBOOKS.filter(p => p.severity === "high").length)} icon={<AlertTriangle className="w-5 h-5 text-orange-500" />} trend="severity level" />
        <StatCard title="DB Records" value={isFetched ? String(dbPlaybooks.length) : "—"} icon={<Clock className="w-5 h-5 text-purple-500" />} trend="incident history" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Playbook List */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search playbooks..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="space-y-3">
            {filtered.map((pb) => (
              <Card key={pb.id} className={`cursor-pointer transition-all ${selectedPlaybook?.id === pb.id ? "ring-2 ring-primary" : "hover:bg-muted/30"}`} onClick={() => handleRunPlaybook(pb)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{pb.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{pb.category} · {pb.estimatedTime}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={SEVERITY_COLORS[pb.severity] ?? ""}>{pb.severity}</Badge>
                      <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleRunPlaybook(pb); }}>
                        <Play className="w-3 h-3" />Run
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Active Playbook Runner */}
        <div>
          {selectedPlaybook ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{selectedPlaybook.title}</CardTitle>
                  <Badge className={SEVERITY_COLORS[selectedPlaybook.severity] ?? ""}>{selectedPlaybook.severity}</Badge>
                </div>
                <CardDescription>{selectedPlaybook.category} · Est. {selectedPlaybook.estimatedTime}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Check off each step as you complete it:</p>
                {selectedPlaybook.steps.map((step, idx) => (
                  <div key={idx} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${activeSteps.has(idx) ? "bg-emerald-500/10 border-emerald-500/30" : "border-border hover:bg-muted/30"}`} onClick={() => toggleStep(idx)}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${activeSteps.has(idx) ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>
                      {activeSteps.has(idx) ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                    </div>
                    <span className={`text-sm ${activeSteps.has(idx) ? "line-through text-muted-foreground" : ""}`}>{step}</span>
                  </div>
                ))}
                <div className="pt-2">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Progress</span>
                    <span>{activeSteps.size}/{selectedPlaybook.steps.length} steps</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${(activeSteps.size / selectedPlaybook.steps.length) * 100}%` }} />
                  </div>
                </div>
                {allStepsComplete && (
                  <Button className="w-full gap-2" onClick={() => { toast.success("Incident resolved and logged"); setSelectedPlaybook(null); setActiveSteps(new Set()); }}>
                    <CheckCircle className="w-4 h-4" />Mark Incident Resolved
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="text-center py-12">
                <BookOpen className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Select a playbook to start the incident response workflow</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
