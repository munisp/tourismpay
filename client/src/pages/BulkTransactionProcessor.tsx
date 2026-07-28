/**
 * Bulk Transaction Processor — S-02
 * Settlement officer tool for processing batch wallet transactions.
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
import { Layers, CheckCircle, XCircle, Clock, Search, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  failed: "bg-red-500/10 text-red-400 border-red-500/30",
  processing: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

export default function BulkTransactionProcessor() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"batches" | "transactions">("transactions");

  const { data: liveData, isLoading, isFetched } =
    trpc.bulkTransactionProcessor.list.useQuery(undefined, { retry: 1, refetchInterval: 30_000 });

  const items: any[] = liveData?.items ?? [];

  const filtered = items.filter(
    (r) => !search || r.type?.toLowerCase().includes(search.toLowerCase()) || r.status?.toLowerCase().includes(search.toLowerCase()) || r.reference?.toLowerCase().includes(search.toLowerCase())
  );

  const completed = items.filter(r => r.status === "completed").length;
  const pending = items.filter(r => r.status === "pending").length;
  const failed = items.filter(r => r.status === "failed").length;
  const totalAmount = items.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  const handleExport = () => {
    const csv = ["ID,Type,Status,Amount,Currency,Reference,Created"]
      .concat(filtered.map(r => `${r.id},${r.type ?? ""},${r.status ?? ""},${r.amount ?? ""},${r.fromCurrency ?? ""},${r.reference ?? ""},${r.createdAt ?? ""}`))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "bulk_transactions.csv"; a.click();
    toast.success("Exported to CSV");
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Bulk Transaction Processor" subtitle="Process and monitor batch wallet transactions for settlement" icon={<Layers className="w-6 h-6" />}>
        <div className="flex gap-2">
          <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />Export CSV
          </Button>
          <Button onClick={() => { utils.bulkTransactionProcessor.list.invalidate(); toast.success("Refreshed"); }} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="w-4 h-4" />Refresh
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Transactions" value={isLoading && !isFetched ? "—" : String(items.length)} icon={<Layers className="w-5 h-5 text-blue-500" />} trend="in database" />
        <StatCard title="Completed" value={isLoading && !isFetched ? "—" : String(completed)} icon={<CheckCircle className="w-5 h-5 text-emerald-500" />} trend="settled" />
        <StatCard title="Pending" value={isLoading && !isFetched ? "—" : String(pending)} icon={<Clock className="w-5 h-5 text-amber-500" />} trend="awaiting" />
        <StatCard title="Failed" value={isLoading && !isFetched ? "—" : String(failed)} icon={<XCircle className="w-5 h-5 text-red-500" />} trend="need review" />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search transactions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} records</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wallet Transactions</CardTitle>
          <CardDescription>Total volume: ${totalAmount.toLocaleString(undefined, {minimumFractionDigits:2})}</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["ID", "Type", "Status", "Amount", "Currency", "Counterparty", "Reference", "Created"].map(col => (
                  <th key={col} className="text-left p-3 text-muted-foreground font-medium">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && !isFetched ? Array.from({length:5}).map((_,i) => (
                <tr key={i} className="border-b border-border/50">{Array.from({length:8}).map((_,j) => <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No transactions found</td></tr>
              ) : filtered.map((r: any) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-mono text-xs text-primary">{String(r.id).slice(0,8)}…</td>
                  <td className="p-3 capitalize">{r.type ?? "—"}</td>
                  <td className="p-3"><Badge className={STATUS_COLORS[r.status] ?? ""}>{r.status ?? "—"}</Badge></td>
                  <td className="p-3 font-medium">{r.amount ? Number(r.amount).toLocaleString(undefined,{minimumFractionDigits:2}) : "—"}</td>
                  <td className="p-3">{r.fromCurrency ?? "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground truncate max-w-[120px]">{r.counterparty ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{r.reference ?? "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r.createdAt ? new Date(r.createdAt * 1000).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
