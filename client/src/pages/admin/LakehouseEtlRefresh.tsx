/**
 * J12 — Lakehouse ETL Trigger + Analytics Refresh
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Database, CheckCircle, Loader2, Plus, X } from "lucide-react";

const COMMON_TABLES = ["wallet_transactions", "direct_bookings", "bnpl_plans", "loyalty_transactions", "fraud_alerts", "tourism_intelligence_snapshots", "dcc_transactions", "insurance_claims"];

export default function LakehouseEtlRefresh() {
  const [form, setForm] = useState({ jobName: "", targetTables: [] as string[], priority: "normal" as "low" | "normal" | "high", tableInput: "" });
  const [result, setResult] = useState<any>(null);

  const runs = trpc.journeyV2.getEtlRuns.useQuery({ jobName: form.jobName || undefined });

  const triggerMut = trpc.journeyV2.startLakehouseEtl.useMutation({
    onSuccess: (d) => { toast.success("ETL Complete!", { description: d.message }); setResult(d); runs.refetch(); },
    onError: (e) => toast.error("ETL failed", { description: e.message }),
  });

  const addTable = (t: string) => { if (t && !form.targetTables.includes(t)) setForm(f => ({...f, targetTables: [...f.targetTables, t], tableInput: ""})); };
  const removeTable = (t: string) => setForm(f => ({...f, targetTables: f.targetTables.filter(x => x !== t)}));

  const statusColor = (s: string) => ({ completed: "bg-green-100 text-green-800", running: "bg-blue-100 text-blue-800", failed: "bg-red-100 text-red-800" }[s] ?? "bg-gray-100 text-gray-800");

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Lakehouse ETL Refresh</h1><p className="text-gray-500 mt-1">Trigger ETL jobs and refresh analytics tables</p></div>
        <Database className="w-8 h-8 text-blue-600" />
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">ETL Job Complete!</p>
              <p className="text-sm text-green-700">Run ID: {result.runId}</p>
              <p className="text-sm text-green-700">{result.tablesRefreshed} tables refreshed</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Trigger ETL Job</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Job Name *</Label><Input value={form.jobName} onChange={e => setForm(f => ({...f, jobName: e.target.value}))} placeholder="daily_analytics_refresh" /></div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({...f, priority: v as any}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Target Tables</Label>
            <div className="flex gap-2 mb-2">
              <Input value={form.tableInput} onChange={e => setForm(f => ({...f, tableInput: e.target.value}))} placeholder="table_name" onKeyDown={e => e.key === "Enter" && addTable(form.tableInput)} />
              <Button type="button" variant="outline" onClick={() => addTable(form.tableInput)}><Plus className="w-4 h-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {COMMON_TABLES.map(t => (
                <button key={t} onClick={() => addTable(t)} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-blue-100 hover:text-blue-800 transition-colors">{t}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {form.targetTables.map(t => (
                <Badge key={t} className="bg-blue-100 text-blue-800 flex items-center gap-1">
                  {t}<button onClick={() => removeTable(t)}><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
          </div>
          <Button onClick={() => triggerMut.mutate({ jobName: form.jobName, targetTables: form.targetTables, priority: form.priority })} disabled={triggerMut.isPending || !form.jobName || form.targetTables.length === 0} className="w-full">
            {triggerMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running ETL...</> : "Trigger ETL Job"}
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-3">Recent ETL Runs</h2>
        {(runs.data as any[] ?? []).slice(0, 5).map((r: any) => (
          <Card key={r.id} className="mb-2">
            <CardContent className="p-3 flex justify-between items-center">
              <div><p className="font-medium">{r.job_type}</p><p className="text-sm text-gray-500">{new Date(r.created_at * 1000 || r.created_at).toLocaleString()}</p></div>
              <Badge className={statusColor(r.status)}>{r.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
