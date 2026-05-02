/**
 * ImpersonationBanner
 * Displayed at the top of every page when an admin is impersonating another user.
 * Shows who is being impersonated and provides a one-click "Exit Impersonation" button.
 */
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner() {
  const utils = trpc.useUtils();
  const { data: status, isLoading } = trpc.usersAdmin.impersonationStatus.useQuery(undefined, {
    refetchOnWindowFocus: true,
    refetchInterval: 60_000, // re-check every minute
  });

  const endImpersonation = trpc.usersAdmin.endImpersonation.useMutation({
    onSuccess: () => {
      toast.success("Impersonation ended — welcome back, Admin!");
      // Invalidate auth state so the UI reflects the restored admin session
      utils.auth.me.invalidate();
      utils.usersAdmin.impersonationStatus.invalidate();
      // Hard reload to ensure all queries are refreshed with the admin session
      setTimeout(() => {
        window.location.href = "/admin/users";
      }, 800);
    },
    onError: (e) => toast.error(`Failed to end impersonation: ${e.message}`),
  });

  if (isLoading || !status?.isImpersonating) return null;

  const user = status.impersonatedUser;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span>
          You are impersonating{" "}
          <strong>{user?.name ?? user?.email ?? `User #${user?.id}`}</strong>
          {user?.role && (
            <span className="ml-1 text-xs font-normal opacity-80">
              ({user.role})
            </span>
          )}
          . Actions taken here are recorded in the audit log.
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="bg-amber-950/10 border-amber-800 text-amber-950 hover:bg-amber-950/20 h-7 text-xs font-semibold ml-4 shrink-0"
        onClick={() => endImpersonation.mutate()}
        disabled={endImpersonation.isPending}
      >
        <X className="w-3 h-3 mr-1" />
        {endImpersonation.isPending ? "Exiting…" : "Exit Impersonation"}
      </Button>
    </div>
  );
}
