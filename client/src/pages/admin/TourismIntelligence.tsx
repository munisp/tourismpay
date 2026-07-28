import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BarChart3, Globe, TrendingUp, Users, DollarSign, RefreshCw } from "lucide-react";

export default function TourismIntelligence() {
  const { data: dashboard, isLoading, refetch } = trpc.tourismIntelligence.getLatestSnapshot.useQuery({ country: "NG", days: 30 });
  const { data: snapshots } = trpc.tourismIntelligence.getHistory.useQuery({ country: "NG", limit: 30 });
  const { data: report } = trpc.tourismIntelligence.getCBNReport.useQuery({ country: "NG" });

  const snapshotMut = trpc.tourismIntelligence.generateSnapshot.useMutation({
    onSuccess: () => { toast.success("Snapshot created"); refetch(); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Tourism Intelligence</h1><p className="text-gray-500 mt-1">Aggregated market intelligence and analytics for Nigeria tourism</p></div>
        <Button onClick={() => snapshotMut.mutate({ country: "NG" })} disabled={snapshotMut.isPending} variant="outline" className="flex items-center gap-2"><RefreshCw className="w-4 h-4" />{snapshotMut.isPending ? "Generating..." : "Generate Snapshot"}</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : dashboard && (
        <>
          <div className="grid grid-cols-4 gap-4">
            {[
              ["Total Tourists", dashboard.live_stats.total_tourists, Users],
              ["Total Transactions", dashboard.live_stats.total_transactions, BarChart3],
              ["Volume (NGN)", Number(dashboard.live_stats.total_volume_ngn).toLocaleString(), DollarSign],
              ["Avg Transaction", `NGN ${Number(dashboard.live_stats.avg_transaction_ngn).toFixed(0)}`, TrendingUp],
            ].map(([label, value, Icon]: any) => (
              <Card key={label}><CardContent className="p-4"><div className="flex items-center gap-3"><Icon className="w-8 h-8 text-blue-600" /><div><p className="text-xl font-bold">{value}</p><p className="text-sm text-gray-500">{label}</p></div></div></CardContent></Card>
            ))}
          </div>

          {dashboard.establishment_breakdown?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Establishments by Category</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dashboard.establishment_breakdown.map((c: any) => (
                    <div key={c.category} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="capitalize font-medium">{c.category}</span>
                      <span className="text-gray-600">{c.count} establishments</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {report && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="w-5 h-5" />Market Report — Nigeria</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="font-semibold mb-2">Platform Statistics</p>
                <div className="space-y-1 text-sm">
                  {Object.entries(report.platform_stats).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span className="text-gray-600 capitalize">{k.replace(/_/g," ")}</span><span className="font-medium">{String(v)}</span></div>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-semibold mb-2">Market Indicators</p>
                <div className="space-y-1 text-sm">
                  {Object.entries(report.market_indicators).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span className="text-gray-600 capitalize">{k.replace(/_/g," ")}</span><span className="font-medium text-green-700">{String(v)}</span></div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {snapshots && snapshots.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Historical Snapshots</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b">{["Date","Tourists","Transactions","FX Volume (USD)","Avg Spend (USD)"].map(h => <th key={h} className="text-left p-2 text-gray-500">{h}</th>)}</tr></thead>
                <tbody>
                  {snapshots.slice(0, 10).map((s: any) => (
                    <tr key={s.snapshot_date} className="border-b hover:bg-gray-50">
                      <td className="p-2">{s.snapshot_date}</td>
                      <td className="p-2">{s.total_tourists}</td>
                      <td className="p-2">{s.total_transactions}</td>
                      <td className="p-2">USD {Number(s.total_fx_volume_usd).toLocaleString()}</td>
                      <td className="p-2">USD {Number(s.avg_spend_per_tourist_usd).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
