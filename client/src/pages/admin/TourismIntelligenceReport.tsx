/**
 * J09 — Tourism Intelligence Report for Compliance
 * Compliance officer generates a tourism intelligence snapshot.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { BarChart3, FileText, CheckCircle, Loader2 } from "lucide-react";

export default function TourismIntelligenceReport() {
  const { user } = useAuth();
  const [form, setForm] = useState({ reportType: "monthly", periodStart: "", periodEnd: "", country: "NG" });
  const [result, setResult] = useState<any>(null);

  const snapshotQuery = trpc.journeyV2.getTourismSnapshot.useQuery(
    { snapshotId: result?.snapshotId ?? "" },
    { enabled: !!result?.snapshotId }
  );

  const startMut = trpc.journeyV2.startTourismIntelligenceReport.useMutation({
    onSuccess: (d) => {
      toast.success("Report Generated!", { description: d.message });
      setResult(d);
    },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tourism Intelligence Report</h1>
          <p className="text-gray-500 mt-1">Generate compliance-grade tourism intelligence snapshots</p>
        </div>
        <BarChart3 className="w-8 h-8 text-blue-600" />
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Report Ready!</p>
              <p className="text-sm text-green-700">Snapshot ID: {result.snapshotId}</p>
              <a href={result.reportUrl} className="text-sm text-blue-600 underline">View Report →</a>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Report Parameters</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Report Type</Label>
              <Select value={form.reportType} onValueChange={v => setForm(f => ({ ...f, reportType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["daily", "weekly", "monthly", "quarterly", "annual"].map(t => (
                    <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Country</Label>
              <Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="NG" />
            </div>
            <div>
              <Label>Period Start *</Label>
              <Input type="date" value={form.periodStart} onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))} />
            </div>
            <div>
              <Label>Period End *</Label>
              <Input type="date" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))} />
            </div>
          </div>
          <Button onClick={() => startMut.mutate(form)} disabled={startMut.isPending || !form.periodStart || !form.periodEnd} className="w-full">
            {startMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</> : "Generate Report"}
          </Button>
        </CardContent>
      </Card>

      {snapshotQuery.data && (
        <Card>
          <CardHeader><CardTitle>Snapshot Data</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              {[
                ["Total Arrivals", snapshotQuery.data.total_arrivals],
                ["Total Spend (NGN)", `₦${Number(snapshotQuery.data.total_spend_ngn || 0).toLocaleString()}`],
                ["FX Inflow (USD)", `$${Number(snapshotQuery.data.fx_inflow_usd || 0).toLocaleString()}`],
                ["Active Wallets", snapshotQuery.data.active_wallets],
                ["New Registrations", snapshotQuery.data.new_registrations],
              ].map(([label, val]) => (
                <div key={String(label)} className="bg-gray-50 rounded p-3">
                  <p className="text-gray-500">{label}</p>
                  <p className="font-bold text-lg">{val}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
