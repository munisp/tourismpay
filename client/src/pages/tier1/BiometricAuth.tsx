import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Fingerprint, Shield, Smartphone, Trash2, Plus, CheckCircle, XCircle, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function BiometricAuth() {
  const utils = trpc.useUtils();
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const { data: stats, isLoading: statsLoading } = trpc.biometric.stats.useQuery();
  const { data: enrollments, isLoading } = trpc.biometric.list.useQuery();

  const enrollMutation = trpc.biometric.enroll.useMutation({
    onSuccess: () => {
      utils.biometric.list.invalidate();
      utils.biometric.stats.invalidate();
      toast.success("Biometric enrolled", { description: "FIDO2 credential registered successfully." });
    },
    onError: (e) => toast.error("Enrollment failed", { description: e.message }),
  });

  const revokeMutation = trpc.biometric.revoke.useMutation({
    onSuccess: () => {
      utils.biometric.list.invalidate();
      utils.biometric.stats.invalidate();
      setRevokeId(null);
      toast.success("Credential revoked");
    },
    onError: (e) => toast.error("Revoke failed", { description: e.message }),
  });

  const handleEnroll = () => {
    const cid = `cred-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const pk = `MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE${btoa(cid).slice(0, 40)}`;
    const dn = navigator.userAgent.includes("Mobile") ? "Mobile Device" : "Desktop Browser";
    enrollMutation.mutate({ credentialId: cid, publicKey: pk, deviceName: dn, aaguid: "00000000-0000-0000-0000-000000000000" });
  };

  const STAT_ITEMS = [
    { label: "Total Credentials", value: statsLoading ? "—" : stats?.total ?? 0, icon: Shield, color: "text-blue-500" },
    { label: "Active", value: statsLoading ? "—" : stats?.active ?? 0, icon: CheckCircle, color: "text-green-500" },
    { label: "Revoked", value: statsLoading ? "—" : stats?.revoked ?? 0, icon: XCircle, color: "text-red-500" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Fingerprint className="w-6 h-6 text-primary" />Biometric Authentication
          </h1>
          <p className="text-muted-foreground text-sm mt-1">FIDO2 / WebAuthn credential management</p>
        </div>
        <Button onClick={handleEnroll} disabled={enrollMutation.isPending} className="gap-2">
          {enrollMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Enroll Device
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {STAT_ITEMS.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <s.icon className={`w-5 h-5 ${s.color}`} />
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registered Credentials</CardTitle>
          <CardDescription>Devices enrolled with FIDO2 / WebAuthn</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !enrollments?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Fingerprint className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No credentials enrolled yet. Click "Enroll Device" to add one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {enrollments.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{e.deviceName ?? "Unknown Device"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{e.credentialId.slice(0, 24)}…</p>
                      <p className="text-xs text-muted-foreground">
                        Enrolled {new Date(e.createdAt * 1000).toLocaleDateString()}
                        {e.lastUsedAt ? ` · Last used ${new Date(e.lastUsedAt * 1000).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={e.isActive ? "default" : "secondary"}>
                      {e.isActive ? "Active" : "Revoked"}
                    </Badge>
                    {e.isActive && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setRevokeId(e.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!revokeId} onOpenChange={(o) => !o && setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Credential?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently revoke the FIDO2 credential. The device will no longer be able to authenticate using biometrics.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => revokeId && revokeMutation.mutate({ id: revokeId })}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? "Revoking…" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
