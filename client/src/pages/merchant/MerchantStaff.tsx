/**
 * MerchantStaff — Merchant Staff Invite Management
 * Allows a merchant to invite staff (cashier/manager/supervisor) to their establishment,
 * view pending/accepted/revoked invites, and copy invite links.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  UserPlus, Copy, CheckCircle2, XCircle, Loader2,
  Mail, Clock, Users, RefreshCw, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

type StaffRole = "cashier" | "manager" | "supervisor";
type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

const ROLE_COLORS: Record<StaffRole, string> = {
  cashier: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  manager: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  supervisor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const STATUS_COLORS: Record<InviteStatus, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  accepted: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  revoked: "bg-red-500/10 text-red-400 border-red-500/20",
  expired: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function MerchantStaff() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Fetch merchant's establishments
  const [selectedEstId, setSelectedEstId] = useState<number | null>(null);

  const { data: estList, isLoading: loadingEstList } = trpc.merchantRevenue.myEstablishments.useQuery();

  // Use the establishment from the user's profile
  const establishmentId = selectedEstId ?? ((estList as any[])?.[0]?.id ?? null);

  const { data: invites, isLoading: loadingInvites, refetch } = trpc.staffInvites.list.useQuery(
    { establishmentId: establishmentId! },
    { enabled: !!establishmentId }
  );

  const createMutation = trpc.staffInvites.create.useMutation({
    onSuccess: (data) => {
      toast.success("Invite sent!", { description: `Invite link ready for ${data.email}` });
      setShowInviteDialog(false);
      setEmail("");
      setRole("cashier");
      setGeneratedLink(data.inviteUrl);
      setShowLinkDialog(true);
      utils.staffInvites.list.invalidate({ establishmentId: establishmentId! });
    },
    onError: (err) => toast.error("Failed to send invite", { description: err.message }),
  });

  const revokeMutation = trpc.staffInvites.revoke.useMutation({
    onSuccess: () => {
      toast.success("Invite revoked");
      utils.staffInvites.list.invalidate({ establishmentId: establishmentId! });
    },
    onError: (err) => toast.error("Failed to revoke", { description: err.message }),
  });

  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("cashier");
  const [copied, setCopied] = useState(false);

  const handleInvite = () => {
    if (!establishmentId) return toast.error("No establishment found");
    if (!email.trim()) return toast.error("Email is required");
    createMutation.mutate({
      establishmentId,
      email: email.trim(),
      role,
      origin: window.location.origin,
    });
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    toast.success("Invite link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const stats = useMemo(() => {
    if (!invites) return { pending: 0, accepted: 0, total: 0 };
    return {
      pending: invites.filter((i) => i.status === "pending").length,
      accepted: invites.filter((i) => i.status === "accepted").length,
      total: invites.length,
    };
  }, [invites]);

  if (loadingEstList) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Staff Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Invite and manage your establishment's staff members
          </p>
        </div>
        <Button onClick={() => setShowInviteDialog(true)} className="gap-2">
          <UserPlus className="w-4 h-4" /> Invite Staff
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Invites", value: stats.total, icon: Mail },
          { label: "Pending", value: stats.pending, icon: Clock },
          { label: "Accepted", value: stats.accepted, icon: CheckCircle2 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
            <Icon className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* No establishment warning */}
      {!establishmentId && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
          <p className="font-semibold text-amber-300">No establishment found</p>
          <p className="text-sm text-muted-foreground">
            Complete your merchant onboarding to start inviting staff.
          </p>
        </div>
      )}

      {/* Invites table */}
      {establishmentId && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="font-semibold text-sm">Invite History</p>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {loadingInvites ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !invites?.length ? (
            <div className="text-center py-12 space-y-2">
              <Users className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground text-sm">No invites yet. Start by inviting your first staff member.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium text-sm">{invite.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs capitalize ${ROLE_COLORS[invite.role as StaffRole] ?? ""}`}
                      >
                        {invite.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs capitalize ${STATUS_COLORS[invite.status as InviteStatus] ?? ""}`}
                      >
                        {invite.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(invite.expiresAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {invite.status === "pending" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Copy invite link"
                              onClick={() => {
                                const link = `${window.location.origin}/invite/${invite.token}`;
                                navigator.clipboard.writeText(link);
                                toast.success("Invite link copied");
                              }}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              title="Revoke invite"
                              onClick={() => revokeMutation.mutate({ id: invite.id })}
                              disabled={revokeMutation.isPending}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" /> Invite Staff Member
            </DialogTitle>
            <DialogDescription>
              Send a one-time invite link valid for 7 days. The staff member will need to sign in to accept.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="staff-email">Email Address</Label>
              <Input
                id="staff-email"
                type="email"
                placeholder="staff@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                <SelectTrigger id="staff-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cashier">Cashier — Process payments</SelectItem>
                  <SelectItem value="manager">Manager — View reports + manage cashiers</SelectItem>
                  <SelectItem value="supervisor">Supervisor — Full access except billing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={createMutation.isPending || !email.trim()}>
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generated Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" /> Invite Link Ready
            </DialogTitle>
            <DialogDescription>
              Share this link with your staff member. It expires in 7 days.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
            <p className="text-xs font-mono text-muted-foreground flex-1 truncate">{generatedLink}</p>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={handleCopyLink}>
              {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowLinkDialog(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
