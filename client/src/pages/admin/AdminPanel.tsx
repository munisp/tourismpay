import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import {
  Shield,
  Users,
  UserCheck,
  UserX,
  Crown,
  TrendingUp,
  Search,
  ChevronDown,
  Loader2,
  AlertTriangle,
} from "lucide-react";

type UserRow = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: "user" | "admin" | "tourist" | "merchant" | "compliance_officer" | "noc_operator" | "settlement_officer" | "bis_analyst";
  loginMethod: string | null;
  createdAt: Date;
  lastSignedIn: Date;
};

export default function AdminPanel() {
  const { user: currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "user" | "admin" | "tourist" | "merchant" | "compliance_officer" | "noc_operator" | "settlement_officer" | "bis_analyst">("all");
  const [confirmPromotion, setConfirmPromotion] = useState<{
    userId: number;
    name: string;
    targetRole: "user" | "admin" | "tourist" | "merchant" | "compliance_officer" | "noc_operator" | "settlement_officer" | "bis_analyst";
  } | null>(null);

  const utils = trpc.useUtils();

  const { data: stats, isLoading: statsLoading } = trpc.admin.platformStats.useQuery();
  const { data: users, isLoading: usersLoading } = trpc.admin.listUsers.useQuery({
    limit: 200,
    offset: 0,
    role: roleFilter === "all" ? undefined : roleFilter,
  });

  const setRoleMutation = trpc.admin.setUserRole.useMutation({
    onSuccess: (updated) => {
      toast.success(
        `${updated?.name ?? "User"} is now ${updated?.role === "admin" ? "an Admin" : "a regular User"}`
      );
      utils.admin.listUsers.invalidate();
      utils.admin.platformStats.invalidate();
      setConfirmPromotion(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirmPromotion(null);
    },
  });

  const filteredUsers = (users ?? []).filter((u: UserRow) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (u.name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) ||
      u.openId.toLowerCase().includes(q)
    );
  });

  const isAdmin = currentUser?.role === "admin";

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="w-16 h-16 text-amber-400" />
        <h2 className="text-2xl font-bold text-white">Access Restricted</h2>
        <p className="text-zinc-400 text-center max-w-md">
          You do not have administrator privileges to access this panel.
          Contact your platform administrator to request elevated access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Admin Control Panel"
        subtitle="Manage users, roles, and platform-wide settings"
        actions={
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">
            <Shield className="w-3 h-3" /> ADMIN ONLY
          </span>
        }
      />

      {/* Platform Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value={statsLoading ? "—" : stats?.totalUsers ?? 0}
          icon={Users}
          color="blue"
        />
        <StatCard
          label="Admins"
          value={statsLoading ? "—" : stats?.adminUsers ?? 0}
          icon={Crown}
          color="amber"
        />
        <StatCard
          label="Regular Users"
          value={statsLoading ? "—" : stats?.regularUsers ?? 0}
          icon={UserCheck}
          color="green"
        />
        <StatCard
          label="New (30d)"
          value={statsLoading ? "—" : stats?.recentSignups ?? 0}
          icon={TrendingUp}
          color="blue"
        />
      </div>

      {/* User Management Table */}
      <div className="glass-card rounded-xl p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            User Management
          </h3>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            {/* Role Filter */}
            <div className="relative">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as "all" | "user" | "admin" | "tourist" | "merchant" | "compliance_officer" | "noc_operator" | "settlement_officer" | "bis_analyst")}
                className="appearance-none pl-3 pr-8 py-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500/50 cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admins</option>
                <option value="user">Users</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            </div>
          </div>
        </div>

        {usersLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-3 px-4 text-zinc-400 font-medium">User</th>
                  <th className="text-left py-3 px-4 text-zinc-400 font-medium">Email</th>
                  <th className="text-left py-3 px-4 text-zinc-400 font-medium">Role</th>
                  <th className="text-left py-3 px-4 text-zinc-400 font-medium">Joined</th>
                  <th className="text-left py-3 px-4 text-zinc-400 font-medium">Last Seen</th>
                  <th className="text-right py-3 px-4 text-zinc-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u: UserRow) => {
                  const isSelf = u.id === currentUser?.id;
                  const isUserAdmin = u.role === "admin";
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500/30 to-blue-500/30 flex items-center justify-center text-xs font-bold text-white border border-zinc-700">
                            {(u.name ?? u.email ?? "?")[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-white font-medium">
                              {u.name ?? "Unnamed User"}
                              {isSelf && (
                                <span className="ml-2 text-xs text-emerald-400 font-mono">(you)</span>
                              )}
                            </p>
                            <p className="text-zinc-500 text-xs font-mono">{u.openId.slice(0, 16)}…</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-zinc-300">
                        {u.email ?? <span className="text-zinc-600 italic">no email</span>}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            isUserAdmin
                              ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                              : "bg-zinc-700/50 text-zinc-300 border border-zinc-600/30"
                          }`}
                        >
                          {isUserAdmin ? <Crown className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-zinc-400 text-xs">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-zinc-400 text-xs">
                        {new Date(u.lastSignedIn).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isSelf ? (
                          <span className="text-zinc-600 text-xs italic">—</span>
                        ) : (
                          <button
                            onClick={() =>
                              setConfirmPromotion({
                                userId: u.id,
                                name: u.name ?? u.email ?? "this user",
                                targetRole: isUserAdmin ? "user" : "admin",
                              })
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                              isUserAdmin
                                ? "bg-zinc-700/60 hover:bg-zinc-600/60 text-zinc-300 border border-zinc-600/40"
                                : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30"
                            }`}
                          >
                            {isUserAdmin ? (
                              <span className="flex items-center gap-1">
                                <UserX className="w-3 h-3" /> Demote
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <Crown className="w-3 h-3" /> Promote
                              </span>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmPromotion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="glass-card rounded-2xl p-8 max-w-md w-full mx-4 border border-zinc-700/50">
            <div className="flex items-center gap-3 mb-4">
              {confirmPromotion.targetRole === "admin" ? (
                <Crown className="w-8 h-8 text-amber-400" />
              ) : (
                <UserX className="w-8 h-8 text-red-400" />
              )}
              <h3 className="text-xl font-bold text-white">
                {confirmPromotion.targetRole === "admin" ? "Promote to Admin?" : "Demote to User?"}
              </h3>
            </div>
            <p className="text-zinc-400 mb-6">
              {confirmPromotion.targetRole === "admin"
                ? `This will grant ${confirmPromotion.name} full administrator privileges, including access to BIS investigation creation, KYB approval, and this admin panel.`
                : `This will revoke ${confirmPromotion.name}'s administrator privileges. They will no longer be able to create BIS investigations or approve KYB applications.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmPromotion(null)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  setRoleMutation.mutate({
                    userId: confirmPromotion.userId,
                    role: confirmPromotion.targetRole,
                  })
                }
                disabled={setRoleMutation.isPending}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                  confirmPromotion.targetRole === "admin"
                    ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40"
                    : "bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40"
                }`}
              >
                {setRoleMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : confirmPromotion.targetRole === "admin" ? (
                  <>
                    <Crown className="w-4 h-4" /> Confirm Promote
                  </>
                ) : (
                  <>
                    <UserX className="w-4 h-4" /> Confirm Demote
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
