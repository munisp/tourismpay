import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CreditCard, Plus, RefreshCw, CheckCircle, XCircle } from "lucide-react";

export default function ChargebackManagementPage() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ transactionId: "", reason: "fraud", amount: "", currency: "NGN" });
  const utils = trpc.useUtils();

  const statsQuery = trpc.chargebackManagement.getStats.useQuery();
  const listQuery = trpc.chargebackManagement.listChargebacks.useQuery({ limit: 50 });
  const chargebacks = listQuery.data ?? [];
  const filtered = chargebacks.filter((c: any) => !search || JSON.stringify(c).toLowerCase().includes(search.toLowerCase()));

  const createMut = trpc.chargebackManagement.createChargeback.useMutation({
    onSuccess: () => { toast.success("Chargeback created"); utils.chargebackManagement.listChargebacks.invalidate(); utils.chargebackManagement.getStats.invalidate(); setShowCreate(false); setForm({ transactionId: "", reason: "fraud", amount: "", currency: "NGN" }); },
    onError: (e) => toast.error(e.message),
  });
  const resolveMut = trpc.chargebackManagement.resolveChargeback.useMutation({
    onSuccess: () => { toast.success("Chargeback resolved"); utils.chargebackManagement.listChargebacks.invalidate(); utils.chargebackManagement.getStats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const stats = statsQuery.data as any;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="h-6 w-6 text-orange-400" />Chargeback Management</h1>
          <p className="text-sm text-zinc-400 mt-1">Create, track, and resolve payment chargebacks</p>
        </div>
        <div className="flex gap-2">
          <input type="text" placeholder="Search chargebacks..." value={search} onChange={e => setSearch(e.target.value)} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500" />
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"><Plus className="h-4 w-4" />New Chargeback</button>
          <button onClick={() => { listQuery.refetch(); statsQuery.refetch(); }} className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{ label: "Total", value: stats?.total ?? 0 }, { label: "Pending", value: stats?.pending ?? 0 }, { label: "Won", value: stats?.won ?? 0 }, { label: "Lost", value: stats?.lost ?? 0 }].map(({ label, value }) => (
          <div key={label} className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold text-white mt-1">{value}</p>
          </div>
        ))}
      </div>
      {showCreate && (
        <div className="bg-zinc-800/50 border border-orange-700/50 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">File New Chargeback</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm text-zinc-400 mb-1">Transaction ID *</label><input type="text" value={form.transactionId} onChange={e => setForm(f => ({...f, transactionId: e.target.value}))} placeholder="txn_..." className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white" /></div>
            <div><label className="block text-sm text-zinc-400 mb-1">Reason</label>
              <select value={form.reason} onChange={e => setForm(f => ({...f, reason: e.target.value}))} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white">
                <option value="fraud">Fraud</option><option value="not_received">Not Received</option><option value="duplicate">Duplicate</option><option value="not_as_described">Not As Described</option>
              </select>
            </div>
            <div><label className="block text-sm text-zinc-400 mb-1">Amount</label><input type="number" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} placeholder="0.00" className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white" /></div>
            <div><label className="block text-sm text-zinc-400 mb-1">Currency</label>
              <select value={form.currency} onChange={e => setForm(f => ({...f, currency: e.target.value}))} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white">
                <option value="NGN">NGN</option><option value="USD">USD</option><option value="GBP">GBP</option><option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => createMut.mutate({ transactionId: form.transactionId, reason: form.reason, amount: parseFloat(form.amount) || 0, currency: form.currency })} disabled={createMut.isPending || !form.transactionId} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">{createMut.isPending ? "Filing..." : "File Chargeback"}</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-700/50"><h2 className="text-lg font-semibold text-white">Chargebacks ({filtered.length})</h2></div>
        {listQuery.isLoading ? (<div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-zinc-700/50 rounded-lg animate-pulse" />)}</div>) : filtered.length === 0 ? (
          <div className="p-12 text-center text-zinc-500"><CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>No chargebacks found</p></div>
        ) : (
          <div className="divide-y divide-zinc-700/50">
            {filtered.map((c: any) => (
              <div key={c.id} className="px-6 py-4 flex items-center justify-between hover:bg-zinc-700/20">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.status === "pending" ? "bg-yellow-900/50 text-yellow-400" : c.status === "won" ? "bg-emerald-900/50 text-emerald-400" : "bg-red-900/50 text-red-400"}`}>{c.status ?? "pending"}</span>
                    <span className="text-sm font-medium text-white">₦{Number(c.amount ?? 0).toLocaleString()}</span>
                    <span className="text-xs text-zinc-500">{c.reason}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">Tx: {c.transactionId ?? c.id}</p>
                </div>
                {c.status === "pending" && (
                  <div className="flex gap-2">
                    <button onClick={() => resolveMut.mutate({ id: c.id, resolution: "won", notes: "Resolved in merchant favor" })} disabled={resolveMut.isPending} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs flex items-center gap-1"><CheckCircle className="h-3 w-3" />Won</button>
                    <button onClick={() => resolveMut.mutate({ id: c.id, resolution: "lost", notes: "Resolved against merchant" })} disabled={resolveMut.isPending} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs flex items-center gap-1"><XCircle className="h-3 w-3" />Lost</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
