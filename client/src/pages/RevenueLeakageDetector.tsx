/**
 * Revenue Leakage Detector — S-04
 * Identifies missed commissions, fee discrepancies, and revenue gaps.
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
import { TrendingDown, DollarSign, AlertTriangle, CheckCircle, Search, RefreshCw, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "sonner";

export default function RevenueLeakageDetector() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");

  const { data: liveData, isLoading, isFetched } =
    trpc.revenueLeakageDetector.list.useQuery(undefined, { retry: 1, refetchInterval: 60_000 });

  const { data: discData, isFetched: discFetched } =
    trpc.revenueLeakageDetector.getDiscrepancies.useQuery(undefined, { retry: 1 });

  const items: any[] = liveData?.items ?? [];
  const discrepancies: any[] = discData?.items ?? [];

  const filtered = items.filter(
    (r) => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase())
  );

  // Derive metrics from billing_revenue_periods table
  const totalRevenue = items.reduce((s, r) => s + Number(r.totalRevenue ?? r.total_revenue ?? 0), 0);
  const totalExpected = items.reduce((s, r) => s + Number(r.expectedRevenue ?? r.expected_revenue ?? totalRevenue * 1.05), 0);
  const leakage = Math.max(0, totalExpected - totalRevenue);
  const leakagePct = totalExpected > 0 ? ((leakage / totalExpected) * 100).toFixed(1) : "0.0";

  const chartData = items.slice(0, 10).map((r: any) => ({
    period: r.periodLabel ?? r.period_label ?? r.id?.toString().slice(-4) ?? "—",
    revenue: Number(r.totalRevenue ?? r.total_revenue ?? 0),
    expected: Number(r.expectedRevenue ?? r.expected_revenue ?? Number(r.totalRevenue ?? 0) * 1.05),
  }));

  const handleExport = () => {
    const csv = ["Period,Revenue,Expected,Leakage"]
      .concat(chartData.map(r => `${r.period},${r.revenue},${r.expected},${Math.max(0,r.expected-r.revenue)}`))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "revenue_leakage.csv"; a.click();
    toast.success("Exported to CSV");
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Revenue Leakage Detector" subtitle="Identifies missed commissions, fee discrepancies, and revenue gaps" icon={<TrendingDown className="w-6 h-6" />}>
        <div className="flex gap-2">
          <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />Export
          </Button>
          <Button onClick={() => { utils.revenueLeakageDetector.list.invalidate(); toast.success("Refreshed"); }} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="w-4 h-4" />Refresh
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Revenue" value={isLoading && !isFetched ? "—" : `$${totalRevenue.toLocaleString(undefined,{minimumFractionDigits:2})}`} icon={<DollarSign className="w-5 h-5 text-emerald-500" />} trend="across all periods" />
        <StatCard title="Expected Revenue" value={isLoading && !isFetched ? "—" : `$${totalExpected.toLocaleString(undefined,{minimumFractionDigits:2})}`} icon={<TrendingDown className="w-5 h-5 text-blue-500" />} trend="projected" />
        <StatCard title="Leakage Detected" value={isLoading && !isFetched ? "—" : `$${leakage.toLocaleString(undefined,{minimumFractionDigits:2})}`} icon={<AlertTriangle className="w-5 h-5 text-red-500" />} trend={`${leakagePct}% of expected`} />
        <StatCard title="Periods Analyzed" value={isFetched ? String(items.length) : "—"} icon={<CheckCircle className="w-5 h-5 text-purple-500" />} trend="billing periods" />
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue vs Expected by Period</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, ""]} />
                <Bar dataKey="expected" fill="hsl(var(--muted))" name="Expected" />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Actual" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search periods..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} periods</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Billing Revenue Periods</CardTitle>
          <CardDescription>Revenue data from billing_revenue_periods table</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Period", "Revenue", "Transactions", "Avg Fee", "Status", "Created"].map(col => (
                  <th key={col} className="text-left p-3 text-muted-foreground font-medium">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && !isFetched ? Array.from({length:5}).map((_,i) => (
                <tr key={i} className="border-b border-border/50">{Array.from({length:6}).map((_,j) => <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No billing periods found</td></tr>
              ) : filtered.map((r: any) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-mono text-xs">{r.periodLabel ?? r.period_label ?? r.id?.toString().slice(-8) ?? "—"}</td>
                  <td className="p-3 font-medium">${Number(r.totalRevenue ?? r.total_revenue ?? 0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                  <td className="p-3">{r.transactionCount ?? r.transaction_count ?? "—"}</td>
                  <td className="p-3">{r.avgFee ?? r.avg_fee ? `$${Number(r.avgFee ?? r.avg_fee).toFixed(2)}` : "—"}</td>
                  <td className="p-3">
                    {r.status === "reconciled"
                      ? <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Reconciled</Badge>
                      : r.status === "pending"
                      ? <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">Pending</Badge>
                      : <Badge variant="outline">{r.status ?? "—"}</Badge>}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
