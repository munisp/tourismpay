import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Database, Play, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";

export default function LakehouseETL() {
  const { data: runs, isLoading, refetch } = trpc.lakehouseEtl.listRuns.useQuery({ limit: 20 });
  const { data: stats } = trpc.lakehouseEtl.getStats.useQuery({});

  const triggerMut = trpc.lakehouseEtl.triggerRun.useMutation({
    onSuccess: (d) => { toast.success("ETL Run Triggered", { description: d.message }); refetch(); },
    onError: (e) => toast.error("Failed to trigger run", { description: e.message }),
  });

  const statusColor = (s: string) => ({ completed: "bg-green-100 text-green-800", running: "bg-blue-100 text-blue-800", failed: "bg-red-100 text-red-800", pending: "bg-yellow-100 text-yellow-800" }[s] ?? "bg-gray-100 text-gray-800");
  const StatusIcon = ({ status }: { status: string }) => status === "completed" ? <CheckCircle className="w-4 h-4 text-green-600" /> : status === "failed" ? <XCircle className="w-4 h-4 text-red-600" /> : status === "running" ? <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" /> : <Clock className="w-4 h-4 text-yellow-600" />;

  const pipelines = ["tourist_transactions","merchant_revenue","bis_investigations","kyb_compliance","loyalty_activity","fx_rates","establishment_registry"];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Lakehouse ETL</h1><p className="text-gray-500 mt-1">Apache Iceberg data pipelines — Bronze / Silver / Gold layers</p></div>
        <div className="flex gap-2">
          {pipelines.slice(0,3).map(p => (
            <Button key={p} size="sm" variant="outline" onClick={() => triggerMut.mutate({ pipeline: p })} disabled={triggerMut.isPending} className="flex items-center gap-1"><Play className="w-3 h-3" />{p.split("_")[0]}</Button>
          ))}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-4">
          {[["Total Runs", stats.total_runs],["Completed", stats.completed],["Failed", stats.failed],["Avg Duration", `${stats.avg_duration_s}s`]].map(([label, value]) => (
            <Card key={label as string}><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{value}</p><p className="text-sm text-gray-500">{label}</p></CardContent></Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Database className="w-5 h-5" />ETL Run History</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : !runs?.length ? (
            <p className="text-center text-gray-500 py-8">No ETL runs yet. Trigger a pipeline to start.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={r.status} />
                    <div>
                      <p className="font-medium capitalize">{r.pipeline_name.replace(/_/g," ")}</p>
                      <p className="text-xs text-gray-500">{new Date(r.started_at).toLocaleString()} · {r.layer} layer</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {r.rows_processed > 0 && <span className="text-gray-600">{r.rows_processed.toLocaleString()} rows</span>}
                    {r.duration_seconds > 0 && <span className="text-gray-600">{r.duration_seconds}s</span>}
                    <Badge className={statusColor(r.status)}>{r.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Available Pipelines</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {pipelines.map(p => (
              <div key={p} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div><p className="font-medium capitalize">{p.replace(/_/g," ")}</p><p className="text-xs text-gray-500">Bronze → Silver → Gold</p></div>
                <Button size="sm" onClick={() => triggerMut.mutate({ pipeline: p })} disabled={triggerMut.isPending}><Play className="w-3 h-3" /></Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
