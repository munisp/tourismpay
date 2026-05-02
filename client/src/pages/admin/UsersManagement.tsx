/**
 * Admin Users Management Page
 * Lists all registered users with role badges, full role assignment dropdown
 * covering all 8 stakeholder roles, role-breakdown stats, and CSV export.
 *
 * Accessible to: admin only
 */
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Users,
  Shield,
  User,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Crown,
  ArrowLeft,
  ShieldCheck,
  Briefcase,
  Globe,
  Banknote,
  FlaskConical,
  Wifi,
  UserCheck,
} from "lucide-react";

// ─── Role metadata ─────────────────────────────────────────────────────────────

type UserRole =
  | "user"
  | "admin"
  | "tourist"
  | "merchant"
  | "compliance_officer"
  | "noc_operator"
  | "settlement_officer"
  | "bis_analyst";

const ROLE_META: Record<
  UserRole,
  { label: string; color: string; badgeClass: string; icon: React.ElementType }
> = {
  user: {
    label: "User",
    color: "text-slate-400",
    badgeClass: "bg-slate-500/20 text-slate-300 border-slate-500/30",
    icon: User,
  },
  admin: {
    label: "Admin",
    color: "text-amber-400",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    icon: Crown,
  },
  tourist: {
    label: "Tourist",
    color: "text-sky-400",
    badgeClass: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    icon: Globe,
  },
  merchant: {
    label: "Merchant",
    color: "text-emerald-400",
    badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    icon: Briefcase,
  },
  compliance_officer: {
    label: "Compliance Officer",
    color: "text-violet-400",
    badgeClass: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    icon: ShieldCheck,
  },
  noc_operator: {
    label: "NOC Operator",
    color: "text-orange-400",
    badgeClass: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    icon: Wifi,
  },
  settlement_officer: {
    label: "Settlement Officer",
    color: "text-pink-400",
    badgeClass: "bg-pink-500/20 text-pink-300 border-pink-500/30",
    icon: Banknote,
  },
  bis_analyst: {
    label: "BIS Analyst",
    color: "text-indigo-400",
    badgeClass: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    icon: FlaskConical,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

type UserRow = {
  id: number;
  name: string | null;
  email: string | null;
  role: UserRole;
  loginMethod: string | null;
  createdAt: Date;
  lastSignedIn: Date | null;
};

// ─── Role assignment inline dropdown ─────────────────────────────────────────

function RoleSelector({
  user,
  currentUserId,
  onChangeRole,
  isPending,
}: {
  user: UserRow;
  currentUserId: number | undefined;
  onChangeRole: (userId: number, userName: string, newRole: UserRole) => void;
  isPending: boolean;
}) {
  // Current user cannot change their own role
  if (user.id === currentUserId) {
    const meta = ROLE_META[user.role];
    const Icon = meta.icon;
    return (
      <Badge className={meta.badgeClass}>
        <Icon className="w-3 h-3 mr-1" />
        {meta.label}
      </Badge>
    );
  }

  return (
    <Select
      value={user.role}
      onValueChange={(v) =>
        onChangeRole(user.id, user.name ?? user.email ?? `User #${user.id}`, v as UserRole)
      }
      disabled={isPending}
    >
      <SelectTrigger className="w-48 h-7 text-xs bg-[#0d1424] border-slate-600 text-slate-200">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-[#111827] border-slate-700 text-white">
        {(Object.entries(ROLE_META) as [UserRole, (typeof ROLE_META)[UserRole]][]).map(
          ([role, meta]) => {
            const Icon = meta.icon;
            return (
              <SelectItem key={role} value={role} className="text-xs">
                <span className="flex items-center gap-1.5">
                  <Icon className={`w-3 h-3 ${meta.color}`} />
                  {meta.label}
                </span>
              </SelectItem>
            );
          }
        )}
      </SelectContent>
    </Select>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UsersManagement() {
  const { user: currentUser } = useAuth();
  const [, navigate] = useLocation();
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    userId: number;
    userName: string;
    newRole: UserRole;
    currentRole: UserRole;
  } | null>(null);

  const utils = trpc.useUtils();
  const { data: stats } = trpc.usersAdmin.stats.useQuery();
  const { data, isLoading } = trpc.usersAdmin.listAll.useQuery({
    role: roleFilter === "all" ? undefined : roleFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const setRole = trpc.usersAdmin.setRole.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      utils.usersAdmin.listAll.invalidate();
      utils.usersAdmin.stats.invalidate();
      setConfirmDialog(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirmDialog(null);
    },
  });

  const startImpersonation = trpc.usersAdmin.startImpersonation.useMutation({
    onSuccess: (result) => {
      toast.success(`Now impersonating ${result.targetUser.name ?? result.targetUser.email ?? `User #${result.targetUser.id}`}. Reloading…`);
      // Reload so the session cookie change takes effect
      setTimeout(() => {
        window.location.href = "/";
      }, 800);
    },
    onError: (err) => toast.error(`Impersonation failed: ${err.message}`),
  });

  const exportCsv = trpc.csvExport.users.useMutation({
    onSuccess: (result) => {
      downloadCsv(result.csv, result.filename);
      toast.success(`Exported ${result.rowCount} users`);
    },
    onError: (err) => toast.error(`Export failed: ${err.message}`),
  });

  const filteredUsers = (data?.users ?? []).filter((u: UserRow) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.id.toString().includes(q)
    );
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  const roleStatItems: { role: UserRole; count: number }[] = [
    { role: "admin", count: (stats as any)?.admins ?? 0 },
    { role: "tourist", count: (stats as any)?.tourists ?? 0 },
    { role: "merchant", count: (stats as any)?.merchants ?? 0 },
    { role: "compliance_officer", count: (stats as any)?.complianceOfficers ?? 0 },
    { role: "noc_operator", count: (stats as any)?.nocOperators ?? 0 },
    { role: "settlement_officer", count: (stats as any)?.settlementOfficers ?? 0 },
    { role: "bis_analyst", count: (stats as any)?.bisAnalysts ?? 0 },
    { role: "user", count: (stats as any)?.regularUsers ?? 0 },
  ];

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin")}
          className="text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-400" />
            User Management
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Assign roles and manage access levels across all 8 stakeholder groups
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportCsv.mutate({})}
          disabled={exportCsv.isPending}
          className="border-slate-600 text-slate-300 hover:text-white"
        >
          <Download className="w-4 h-4 mr-2" />
          {exportCsv.isPending ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      {/* Summary stats — total + top 3 roles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card className="bg-[#111827] border-slate-700/50 col-span-2 sm:col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-400 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-white">{(stats as any)?.total ?? 0}</p>
              <p className="text-xs text-slate-400">Total Users</p>
            </div>
          </CardContent>
        </Card>
        {roleStatItems.slice(0, 3).map(({ role, count }) => {
          const meta = ROLE_META[role];
          const Icon = meta.icon;
          return (
            <Card key={role} className="bg-[#111827] border-slate-700/50">
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`w-8 h-8 ${meta.color} shrink-0`} />
                <div>
                  <p className="text-2xl font-bold text-white">{count}</p>
                  <p className="text-xs text-slate-400">{meta.label}s</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Role filter pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        {roleStatItems.map(({ role, count }) => {
          const meta = ROLE_META[role];
          const Icon = meta.icon;
          return (
            <button
              key={role}
              onClick={() => {
                setRoleFilter(roleFilter === role ? "all" : role);
                setPage(0);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                roleFilter === role
                  ? meta.badgeClass + " border-current"
                  : "bg-slate-800/60 text-slate-400 border-slate-700 hover:bg-slate-700/60"
              }`}
            >
              <Icon className="w-3 h-3" />
              {meta.label} ({count})
            </button>
          );
        })}
        {roleFilter !== "all" && (
          <button
            onClick={() => {
              setRoleFilter("all");
              setPage(0);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600"
          >
            Clear filter ×
          </button>
        )}
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-9 bg-[#111827] border-slate-700 text-white placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Table */}
      <Card className="bg-[#111827] border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200">
            {(data as any)?.total ?? 0} user{(data as any)?.total !== 1 ? "s" : ""}
            {roleFilter !== "all" && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                — filtered by {ROLE_META[roleFilter].label}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400">Loading users…</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">User</th>
                    <th className="text-left px-4 py-3">Role</th>
                    <th className="text-left px-4 py-3">Actions</th>
                    <th className="text-left px-4 py-3">Login Method</th>
                    <th className="text-left px-4 py-3">Last Signed In</th>
                    <th className="text-left px-4 py-3">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u: UserRow) => (
                    <tr
                      key={u.id}
                      className="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-semibold text-xs shrink-0">
                            {(u.name ?? u.email ?? "?").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-white">{u.name ?? "—"}</p>
                            <p className="text-xs text-slate-400">{u.email ?? "—"}</p>
                          </div>
                          {u.id === currentUser?.id && (
                            <Badge className="bg-indigo-500/20 text-indigo-300 text-[10px] ml-1">
                              You
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RoleSelector
                          user={u}
                          currentUserId={currentUser?.id}
                          onChangeRole={(userId, userName, newRole) => {
                            if (newRole === u.role) return;
                            setConfirmDialog({
                              open: true,
                              userId,
                              userName,
                              newRole,
                              currentRole: u.role,
                            });
                          }}
                          isPending={setRole.isPending}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {u.id !== currentUser?.id && u.role !== "admin" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 px-2"
                            onClick={() => startImpersonation.mutate({ userId: u.id })}
                            disabled={startImpersonation.isPending}
                            title={`Impersonate ${u.name ?? u.email ?? `User #${u.id}`}`}
                          >
                            <UserCheck className="w-3 h-3 mr-1" />
                            Impersonate
                          </Button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300 capitalize">
                        {u.loginMethod ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {u.lastSignedIn
                          ? new Date(u.lastSignedIn).toLocaleDateString()
                          : "Never"}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-400">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="border-slate-600 text-slate-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="border-slate-600 text-slate-300"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Confirm Role Change Dialog */}
      {confirmDialog && (
        <AlertDialog
          open={confirmDialog.open}
          onOpenChange={(open) => !open && setConfirmDialog(null)}
        >
          <AlertDialogContent className="bg-[#111827] border-slate-700 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-400" />
                Confirm Role Change
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Change{" "}
                <span className="text-white font-medium">{confirmDialog.userName}</span>'s role
                from{" "}
                <span className={ROLE_META[confirmDialog.currentRole].color + " font-medium"}>
                  {ROLE_META[confirmDialog.currentRole].label}
                </span>{" "}
                to{" "}
                <span className={ROLE_META[confirmDialog.newRole].color + " font-medium"}>
                  {ROLE_META[confirmDialog.newRole].label}
                </span>
                ?
                <br />
                <span className="text-xs mt-1 block">
                  This will immediately update their access permissions across the platform.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-600 text-slate-300 bg-transparent">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  setRole.mutate({
                    userId: confirmDialog.userId,
                    role: confirmDialog.newRole,
                  })
                }
                disabled={setRole.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {setRole.isPending
                  ? "Updating…"
                  : `Assign ${ROLE_META[confirmDialog.newRole].label}`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
