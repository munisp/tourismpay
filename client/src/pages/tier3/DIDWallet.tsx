import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { KeyRound, FileCheck, Trash2, Plus, Loader2, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DIDWallet() {
  const utils = trpc.useUtils();
  const [issueOpen, setIssueOpen] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [form, setForm] = useState({ type: "", issuer: "", subject: "" });
  const { data: stats, isLoading: statsLoading } = trpc.identity.stats.useQuery();
  const { data: credentials, isLoading } = trpc.identity.listCredentials.useQuery();
  const createDidMutation = trpc.identity.createDid.useMutation({
    onSuccess: () => { utils.identity.stats.invalidate(); toast.success("DID created"); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });
  const issueCredMutation = trpc.identity.issueCredential.useMutation({
    onSuccess: () => {
      utils.identity.listCredentials.invalidate();
      utils.identity.stats.invalidate();
      setIssueOpen(false);
      setForm({ type: "", issuer: "", subject: "" });
      toast.success("Credential issued");
    },
    onError: (e) => toast.error("Issue failed", { description: e.message }),
  });
  const revokeMutation = trpc.identity.revokeCredential.useMutation({
    onSuccess: () => {
      utils.identity.listCredentials.invalidate();
      utils.identity.stats.invalidate();
      setRevokeId(null);
      toast.success("Credential revoked");
    },
    onError: (e) => toast.error("Revoke failed", { description: e.message }),
  });
  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><KeyRound className="w-6 h-6 text-primary" />DID Wallet</h1>
          <p className="text-muted-foreground text-sm mt-1">Decentralised Identity and Verifiable Credentials</p>
        </div>
        <Button onClick={() => setIssueOpen(true)} className="gap-2" disabled={!stats?.hasDid}>
          <Plus className="w-4 h-4" />Issue Credential
        </Button>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Your DID</CardTitle></CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Loading…</span></div>
          ) : stats?.hasDid ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2 bg-muted rounded font-mono text-xs break-all">
                {stats.did}
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { if (stats.did) { navigator.clipboard.writeText(stats.did); toast.success("DID copied"); } }}><Copy className="w-3 h-3" /></Button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[["Total", stats.totalCredentials], ["Active", stats.activeCredentials], ["Revoked", stats.revokedCredentials]].map(([l, v]) => (
                  <div key={String(l)} className="text-center p-2 rounded border"><p className="text-xl font-bold">{v}</p><p className="text-xs text-muted-foreground">{l}</p></div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <KeyRound className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm text-muted-foreground mb-3">No DID found. Create one to get started.</p>
              <Button onClick={() => createDidMutation.mutate()} disabled={createDidMutation.isPending} className="gap-2">
                {createDidMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Create DID
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Verifiable Credentials</CardTitle><CardDescription>W3C VC Data Model 2.0</CardDescription></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : !credentials?.length ? (
            <div className="text-center py-8 text-muted-foreground"><FileCheck className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No credentials yet.</p></div>
          ) : (
            <div className="space-y-3">
              {credentials.map((c) => (
                <div key={c.id} className="flex items-start justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{c.type}</p>
                    <p className="text-xs text-muted-foreground">Issuer: {c.issuer}</p>
                    <p className="text-xs text-muted-foreground">Subject: {c.subject}</p>
                    <p className="text-xs text-muted-foreground">Issued {new Date(c.createdAt * 1000).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                    {c.status === "active" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setRevokeId(c.id)}><Trash2 className="w-4 h-4" /></Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Issue Verifiable Credential</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label>Credential Type</Label><Input placeholder="e.g. IdentityCredential" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Issuer</Label><Input placeholder="e.g. TourismPay Authority" value={form.issuer} onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Subject</Label><Input placeholder="e.g. Passport holder" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>Cancel</Button>
            <Button
              onClick={() => issueCredMutation.mutate({ type: form.type, issuer: form.issuer, subject: form.subject, credentialData: { issuedAt: Date.now() } })}
              disabled={issueCredMutation.isPending || !form.type || !form.issuer || !form.subject}
            >
              {issueCredMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
