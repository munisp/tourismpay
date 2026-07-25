import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, RefreshCw, Building2 } from "lucide-react";

export default function WhiteLabelApproval() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const utils = trpc.useUtils();

  const statsQuery = trpc.whiteLabelApproval.getStats.useQuery();
  const pendingQuery = trpc.whiteLabelApproval.listPending.useQuery({ limit: 50 });
  const stats = statsQuery.data;
  const pending = pendingQuery.data ?? [];

  const approveMut = trpc.whiteLabelApproval.approve.useMutation({
    onSuccess: () => { toast.success("Application approved"); utils.whiteLabelApproval.listPending.invalidate(); utils.whiteLabelApproval.getStats.invalidate(); setSelectedId(null); },
    onError: (e) => toast.error(e.message),
  });
  const rejectMut = trpc.whiteLabelApproval.reject.useMutation({
    onSuccess: () => { toast.success("Application rejected"); utils.whiteLabelApproval.listPending.invalidate(); utils.whiteLabelApproval.getStats.invalidate(); setSelectedId(null); setRejectReason(""); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6 text-emerald-400" />White-Label Approval Queue</h1>
          <p className="text-sm text-zinc-400 mt-1">Review and approve white-label partner applications</p>
        </div>
        <button onClick={() => { pendingQuery.refetch(); statsQuery.refetch(); }} className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{ label: "Total Applications", value: (stats as any)?.total ?? 0 }, { label: "Pending Review", value: pending.length }, { label: "Approved", value: (stats as any)?.approved ?? 0 }, { label: "Rejected", value: (stats as any)?.rejected ?? 0 }].map(({ label, value }) => (
          <div key={label} className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold text-white mt-1">{value}</p>
          </div>
        ))}
      </div>
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-700/50"><h2 className="text-lg font-semibold text-white flex items-center gap-2"><Clock className="h-5 w-5 text-yellow-400" />Pending Applications ({pending.length})</h2></div>
        {pendingQuery.isLoading ? (<div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-zinc-700/50 rounded-lg animate-pulse" />)}</div>) : pending.length === 0 ? (
          <div className="p-12 text-center text-zinc-500"><CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>No pending applications</p></div>
        ) : (
          <div className="divide-y divide-zinc-700/50">
            {pending.map((app: any) => (
              <div key={app.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-white">{app.companyName ?? app.name ?? app.id}</p>
                    <p className="text-sm text-zinc-400 mt-0.5">{app.email ?? ""} · {app.country ?? ""}</p>
                    {app.notes && <p className="text-xs text-zinc-500 mt-1">{app.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {selectedId === app.id ? (
                      <div className="flex items-center gap-2">
                        <input type="text" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Rejection reason..." className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-sm text-white w-48" />
                        <button onClick={() => rejectMut.mutate({ id: app.id, reason: rejectReason })} disabled={rejectMut.isPending} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm">{rejectMut.isPending ? "..." : "Confirm Reject"}</button>
                        <button onClick={() => setSelectedId(null)} className="px-3 py-1 bg-zinc-700 text-white rounded text-sm">Cancel</button>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => approveMut.mutate({ id: app.id })} disabled={approveMut.isPending} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />Approve</button>
                        <button onClick={() => setSelectedId(app.id)} className="px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-400 rounded-lg text-sm flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />Reject</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
