/**
 * InviteAccept — Staff Invite Acceptance Page
 * Accessible at /invite/:token
 * Allows a staff member to view and accept a merchant's invite.
 */
import { useParams, Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Loader2, AlertCircle, Building2,
  UserCheck, ArrowRight, LogIn,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

const ROLE_LABELS: Record<string, string> = {
  cashier: "Cashier",
  manager: "Manager",
  supervisor: "Supervisor",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  cashier: "Process QR payments on behalf of the establishment.",
  manager: "View revenue reports and manage cashier staff.",
  supervisor: "Full access to establishment operations except billing.",
};

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [accepted, setAccepted] = useState(false);

  const { data: invite, isLoading: loadingInvite, error: inviteError } = trpc.staffInvites.getByToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token, retry: false }
  );

  const acceptMutation = trpc.staffInvites.accept.useMutation({
    onSuccess: () => {
      setAccepted(true);
      toast.success("Welcome aboard!", { description: `You've joined as ${ROLE_LABELS[invite?.role ?? "cashier"] ?? invite?.role}.` });
    },
    onError: (err) => toast.error("Could not accept invite", { description: err.message }),
  });

  const handleAccept = () => {
    if (!token) return;
    acceptMutation.mutate({ token });
  };

  const handleLoginAndReturn = () => {
    // Store the invite path so we can redirect back after login
    sessionStorage.setItem("postLoginRedirect", `/invite/${token}`);
    window.location.href = getLoginUrl();
  };

  if (!token) {
    return <ErrorState message="Invalid invite link." />;
  }

  if (authLoading || loadingInvite) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (inviteError || !invite) {
    return <ErrorState message={inviteError?.message ?? "Invite not found."} />;
  }

  if (invite.isExpired || invite.status === "expired") {
    return <ErrorState message="This invite has expired. Please ask your employer to send a new one." icon="expired" />;
  }

  if (invite.status === "revoked") {
    return <ErrorState message="This invite has been revoked." icon="revoked" />;
  }

  if (invite.status === "accepted" || accepted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-emerald-600 px-6 py-8 text-white text-center space-y-3">
            <CheckCircle2 className="w-14 h-14 mx-auto" />
            <h1 className="text-xl font-bold">You're In!</h1>
            <p className="text-sm opacity-90">
              You've joined <strong>{invite.establishmentName}</strong> as a{" "}
              <strong>{ROLE_LABELS[invite.role] ?? invite.role}</strong>.
            </p>
          </div>
          <div className="px-6 py-6 space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              {ROLE_DESCRIPTIONS[invite.role] ?? ""}
            </p>
            <Button className="w-full" onClick={() => navigate("/")}>
              Go to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-primary/10 border-b border-border px-6 py-6 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Staff Invite</p>
            <h1 className="text-xl font-bold">{invite.establishmentName}</h1>
            {invite.establishmentCountry && (
              <p className="text-sm text-muted-foreground">{invite.establishmentCountry}</p>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Invited as</span>
            <Badge variant="outline" className="capitalize font-semibold">
              {ROLE_LABELS[invite.role] ?? invite.role}
            </Badge>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[invite.role] ?? ""}</p>
          </div>

          {!isAuthenticated ? (
            <div className="space-y-3 pt-2">
              <p className="text-sm text-center text-muted-foreground">
                You need to sign in to accept this invite.
              </p>
              <Button className="w-full" onClick={handleLoginAndReturn}>
                <LogIn className="w-4 h-4 mr-2" /> Sign In to Accept
              </Button>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <p className="text-sm text-center text-muted-foreground">
                Signed in as <strong>{user?.name ?? user?.email}</strong>
              </p>
              <Button
                className="w-full"
                onClick={handleAccept}
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <UserCheck className="w-4 h-4 mr-2" />
                )}
                Accept Invite
              </Button>
            </div>
          )}
        </div>

        {/* Branding */}
        <div className="border-t border-border px-6 py-3 text-center">
          <p className="text-xs text-muted-foreground">
            Powered by <span className="font-semibold text-primary">TourismPay</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message, icon }: { message: string; icon?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-sm">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
        <p className="font-semibold text-lg">Invite Unavailable</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link href="/">
          <Button variant="outline" size="sm">Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
