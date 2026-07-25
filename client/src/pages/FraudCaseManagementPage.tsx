import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Shield, RefreshCw, Eye, AlertTriangle } from "lucide-react";

export default function FraudCaseManagementPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const utils = trpc.useUtils();

  const statsQuery = trpc.fraudCaseManagement.getStats.useQuery();
  const listQuery = trpc.fraudCaseManagement.list.useQuery({ limit: 50, status: statusFilter !== "all" ? statusFilter : undefined });
  const cases = listQuery.data ?? [];
  const filtered = cases.filter((c: any) => !search || JSON.stringify(c).toLowerCase().includes(search.toLowerCase()));

  const updateMut = trpc.fraud.updateStatus.useMutation({
    onSuccess: () => { toast.success("Case status updated"); utils.fraudCaseManagement.list.invalidate(); utils.fraudCaseManagement.getStats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const stats = statsQuery.data as any;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6 text-red-400" />Fraud Case Management</h1>
          <p className="text-sm text-zinc-400 mt-1">Review, investigate, and resolve fraud alerts and cases</p>
        </div>
        <div className="flex gap-2">
          <input type="text" placeholder="Search cases..." value={search} onChange={e => setSearch(e.target.value)} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white">
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
          <button onClick={() => { listQuery.refetch(); statsQuery.refetch(); }} className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{ label: "Total Cases", value: stats?.total ?? 0 }, { label: "Open", value: stats?.open ?? 0 }, { label: "Investigating", value: stats?.investigating ?? 0 }, { label: "Resolved", value: stats?.resolved ?? 0 }].map(({ label, value }) => (
          <div key={label} className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold text-white mt-1">{value}</p>
          </div>
        ))}
      </div>
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-700/50"><h2 className="text-lg font-semibold text-white">Cases ({filtered.length})</h2></div>
        {listQuery.isLoading ? (<div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-zinc-700/50 rounded-lg animate-pulse" />)}</div>) : filtered.length === 0 ? (
          <div className="p-12 text-center text-zinc-500"><AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>No fraud cases found</p></div>
        ) : (
          <div className="divide-y divide-zinc-700/50">
            {filtered.map((c: any) => (
              <div key={c.id} className="px-6 py-4 flex items-center justify-between hover:bg-zinc-700/20">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.status === "open" ? "bg-red-900/50 text-red-400" : c.status === "investigating" ? "bg-yellow-900/50 text-yellow-400" : "bg-emerald-900/50 text-emerald-400"}`}>{c.status ?? "open"}</span>
                    <span className="text-sm font-medium text-white">{c.alertType ?? c.type ?? "Fraud Alert"}</span>
                    <span className="text-xs text-zinc-500">#{c.id?.slice(0,8)}</span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {c.transactionId && <span>Tx: {c.transactionId} · </span>}
                    {c.amount && <span>Amount: ₦{Number(c.amount).toLocaleString()} · </span>}
                    {c.createdAt && <span>{new Date(Number(c.createdAt) * 1000).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {c.status === "open" && <button onClick={() => updateMut.mutate({ id: c.id, status: "investigating" })} disabled={updateMut.isPending} className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-xs">Investigate</button>}
                  {c.status === "investigating" && <button onClick={() => updateMut.mutate({ id: c.id, status: "resolved" })} disabled={updateMut.isPending} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs">Resolve</button>}
                  {(c.status === "open" || c.status === "investigating") && <button onClick={() => updateMut.mutate({ id: c.id, status: "dismissed" })} disabled={updateMut.isPending} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-xs">Dismiss</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
