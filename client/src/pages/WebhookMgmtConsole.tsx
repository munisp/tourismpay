import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Webhook, Plus, Trash2, RefreshCw, Key, Activity } from "lucide-react";

export default function WebhookMgmtConsole() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState("payment.created,payment.failed");
  const utils = trpc.useUtils();

  const listQuery = trpc.webhooks.list.useQuery({ limit: 50 });
  const webhooks = listQuery.data ?? [];
  const filtered = webhooks.filter((w: any) =>
    !search || w.url?.toLowerCase().includes(search.toLowerCase())
  );

  const createMut = trpc.webhooks.create.useMutation({
    onSuccess: () => { toast.success("Webhook endpoint created"); utils.webhooks.list.invalidate(); setShowCreate(false); setNewUrl(""); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.webhooks.delete.useMutation({
    onSuccess: () => { toast.success("Webhook deleted"); utils.webhooks.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const retryMut = trpc.webhooks.retryDelivery.useMutation({
    onSuccess: () => toast.success("Delivery retried"),
    onError: (e) => toast.error(e.message),
  });
  const rotateMut = trpc.webhooks.rotateSecret.useMutation({
    onSuccess: (data: any) => { toast.success(`Secret rotated`); utils.webhooks.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Webhook className="h-6 w-6 text-emerald-400" />Webhook Management Console</h1>
          <p className="text-sm text-zinc-400 mt-1">Manage webhook endpoints, test deliveries, and monitor delivery logs</p>
        </div>
        <div className="flex gap-2">
          <input type="text" placeholder="Search endpoints..." value={search} onChange={e => setSearch(e.target.value)} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500" />
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"><Plus className="h-4 w-4" />Add Endpoint</button>
          <button onClick={() => listQuery.refetch()} className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{ label: "Total", value: webhooks.length }, { label: "Active", value: webhooks.filter((w: any) => w.enabled !== false).length }, { label: "Disabled", value: webhooks.filter((w: any) => w.enabled === false).length }, { label: "Event Types", value: new Set(webhooks.flatMap((w: any) => w.events ?? [])).size }].map(({ label, value }) => (
          <div key={label} className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold text-white mt-1">{value}</p>
          </div>
        ))}
      </div>
      {showCreate && (
        <div className="bg-zinc-800/50 border border-emerald-700/50 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">New Webhook Endpoint</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Endpoint URL *</label>
              <input type="url" value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://your-server.com/webhook" className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white" />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Events (comma-separated)</label>
              <input type="text" value={newEvents} onChange={e => setNewEvents(e.target.value)} placeholder="payment.created,payment.failed" className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => createMut.mutate({ url: newUrl, events: newEvents.split(",").map(e => e.trim()).filter(Boolean), secret: crypto.randomUUID() })} disabled={createMut.isPending} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">{createMut.isPending ? "Creating..." : "Create Endpoint"}</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-700/50"><h2 className="text-lg font-semibold text-white">Registered Endpoints ({filtered.length})</h2></div>
        {listQuery.isLoading ? (<div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-zinc-700/50 rounded-lg animate-pulse" />)}</div>) : filtered.length === 0 ? (
          <div className="p-12 text-center text-zinc-500"><Webhook className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>No webhook endpoints found</p><button onClick={() => setShowCreate(true)} className="mt-3 text-emerald-400 hover:text-emerald-300 text-sm">+ Add your first endpoint</button></div>
        ) : (
          <div className="divide-y divide-zinc-700/50">
            {filtered.map((w: any) => (
              <div key={w.id} className="px-6 py-4 flex items-center justify-between hover:bg-zinc-700/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${w.enabled !== false ? "bg-emerald-900/50 text-emerald-400" : "bg-zinc-700 text-zinc-400"}`}>{w.enabled !== false ? "Active" : "Disabled"}</span>
                    <span className="text-sm font-mono text-white truncate">{w.url}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                    <span className="flex items-center gap-1"><Activity className="h-3 w-3" />{(w.events ?? []).join(", ") || "All events"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button onClick={() => rotateMut.mutate({ id: w.id })} disabled={rotateMut.isPending} title="Rotate secret" className="p-2 text-zinc-400 hover:text-yellow-400 rounded-lg"><Key className="h-4 w-4" /></button>
                  <button onClick={() => retryMut.mutate({ webhookId: w.id, deliveryId: "latest" })} disabled={retryMut.isPending} title="Retry last delivery" className="p-2 text-zinc-400 hover:text-blue-400 rounded-lg"><RefreshCw className="h-4 w-4" /></button>
                  <button onClick={() => { if (confirm(`Delete webhook ${w.url}?`)) deleteMut.mutate({ id: w.id }); }} disabled={deleteMut.isPending} title="Delete" className="p-2 text-zinc-400 hover:text-red-400 rounded-lg"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
