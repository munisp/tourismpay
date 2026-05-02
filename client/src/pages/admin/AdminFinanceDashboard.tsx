import { useState } from "react";
import {
  DollarSign, TrendingUp, Shield, CheckCircle, XCircle,
  Clock, RefreshCw, Filter, Eye, MoreHorizontal, Banknote,
  CreditCard, Umbrella, AlertCircle, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type FinanceType = "payout" | "loan" | "insurance";
type FinanceStatus = "pending" | "under_review" | "approved" | "rejected" | "active" | "completed" | "quoted";

interface FinanceRequest {
  id: string;
  userId: number;
  userName: string;
  userEmail: string;
  type: FinanceType;
  amount: number;
  currency: string;
  status: FinanceStatus;
  description: string | null;
  metadata: any;
  createdAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<FinanceType, { label: string; icon: React.ElementType; color: string }> = {
  payout: { label: "Payout", icon: Banknote, color: "text-blue-400" },
  loan: { label: "Loan", icon: CreditCard, color: "text-purple-400" },
  insurance: { label: "Insurance", icon: Umbrella, color: "text-teal-400" },
};

const STATUS_CONFIG: Record<FinanceStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  under_review: { label: "Under Review", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  approved: { label: "Approved", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  rejected: { label: "Rejected", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  active: { label: "Active", className: "bg-green-500/15 text-green-400 border-green-500/30" },
  completed: { label: "Completed", className: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
  quoted: { label: "Quoted", className: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30" },
};

function StatusBadge({ status }: { status: FinanceStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function TypeIcon({ type }: { type: FinanceType }) {
  const cfg = TYPE_CONFIG[type];
  const Icon = cfg.icon;
  return <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />;
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString();
}

// ─── Detail Dialog ────────────────────────────────────────────────────────────

interface DetailDialogProps {
  request: FinanceRequest | null;
  onClose: () => void;
  onStatusChange: (id: string, status: FinanceStatus, note?: string) => void;
  isUpdating: boolean;
}

function DetailDialog({ request, onClose, onStatusChange, isUpdating }: DetailDialogProps) {
  const [note, setNote] = useState("");

  if (!request) return null;

  const meta = typeof request.metadata === "string" ? JSON.parse(request.metadata) : (request.metadata ?? {});
  const canApprove = ["pending", "under_review"].includes(request.status);
  const canReject = ["pending", "under_review", "quoted"].includes(request.status);

  return (
    <Dialog open={!!request} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <TypeIcon type={request.type} />
            {TYPE_CONFIG[request.type].label} Request — #{request.id.slice(0, 8)}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Submitted by {request.userName} ({request.userEmail})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          {/* Summary row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="glass-card p-2.5 rounded-md">
              <p className="text-muted-foreground mb-0.5">Amount</p>
              <p className="font-mono font-bold text-sm text-foreground">
                {formatCurrency(request.amount, request.currency)}
              </p>
            </div>
            <div className="glass-card p-2.5 rounded-md">
              <p className="text-muted-foreground mb-0.5">Status</p>
              <StatusBadge status={request.status} />
            </div>
          </div>

          {/* Description */}
          {request.description && (
            <div className="glass-card p-2.5 rounded-md">
              <p className="text-muted-foreground mb-0.5">Description</p>
              <p className="text-foreground">{request.description}</p>
            </div>
          )}

          {/* Metadata */}
          {Object.keys(meta).length > 0 && (
            <div className="glass-card p-2.5 rounded-md">
              <p className="text-muted-foreground mb-1.5">Details</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(meta).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1").trim()}</dt>
                    <dd className="font-mono text-foreground truncate">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Submitted at */}
          <p className="text-muted-foreground">
            Submitted: <span className="text-foreground">{formatDate(request.createdAt)}</span>
          </p>

          {/* Admin note */}
          {(canApprove || canReject) && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Admin Note (optional)</Label>
              <Textarea
                placeholder="Add a note for this decision…"
                className="text-xs bg-white/5 border-border resize-none h-16"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          {canApprove && (
            <Button
              size="sm"
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
              onClick={() => { onStatusChange(request.id, "approved", note); onClose(); }}
              disabled={isUpdating}
            >
              <CheckCircle className="w-3 h-3 mr-1" />
              Approve
            </Button>
          )}
          {canReject && (
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              onClick={() => { onStatusChange(request.id, "rejected", note); onClose(); }}
              disabled={isUpdating}
            >
              <XCircle className="w-3 h-3 mr-1" />
              Reject
            </Button>
          )}
          {request.status === "pending" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-border bg-white/5"
              onClick={() => { onStatusChange(request.id, "under_review", note); onClose(); }}
              disabled={isUpdating}
            >
              <Clock className="w-3 h-3 mr-1" />
              Mark Under Review
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminFinanceDashboard() {
  const [typeFilter, setTypeFilter] = useState<FinanceType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<FinanceStatus | "all">("all");
  const [selectedRequest, setSelectedRequest] = useState<FinanceRequest | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.embeddedFinance.adminList.useQuery(
    typeFilter !== "all" ? { type: typeFilter } : {}
  );

  const updateStatus = trpc.embeddedFinance.updateStatus.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Request ${vars.status}`);
      utils.embeddedFinance.adminList.invalidate();
    },
    onError: (err) => toast.error(`Update failed: ${err.message}`),
  });

  const handleStatusChange = (id: string, status: FinanceStatus, note?: string) => {
    updateStatus.mutate({ requestId: id, status, note });
  };

  // Filter client-side by status
  const allItems: FinanceRequest[] = (data?.items ?? []) as FinanceRequest[];
  const filtered = statusFilter === "all"
    ? allItems
    : allItems.filter((r) => r.status === statusFilter);

  // Stats
  const pending = allItems.filter((r) => r.status === "pending").length;
  const underReview = allItems.filter((r) => r.status === "under_review").length;
  const approved = allItems.filter((r) => r.status === "approved" || r.status === "active").length;
  const totalVolume = allItems.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="p-6 min-h-full">
      <PageHeader
        title="Finance Requests"
        subtitle="Review and approve payout, loan, and insurance requests"
        actions={
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-border bg-white/5"
            onClick={() => refetch()}
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 stagger-children">
        <StatCard label="Pending Review" value={pending} color="amber" icon={Clock} animationDelay={0} />
        <StatCard label="Under Review" value={underReview} color="blue" icon={Eye} animationDelay={50} />
        <StatCard label="Approved / Active" value={approved} color="green" icon={CheckCircle} animationDelay={100} />
        <StatCard
          label="Total Volume"
          value={`$${(totalVolume / 1000).toFixed(1)}k`}
          color="blue"
          icon={DollarSign}
          animationDelay={150}
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {/* Type filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs border-border bg-white/5">
              <Filter className="w-3 h-3 mr-1" />
              Type: {typeFilter === "all" ? "All" : TYPE_CONFIG[typeFilter].label}
              <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-card border-border">
            <DropdownMenuItem className="text-xs" onClick={() => setTypeFilter("all")}>All Types</DropdownMenuItem>
            <DropdownMenuSeparator />
            {(["payout", "loan", "insurance"] as FinanceType[]).map((t) => (
              <DropdownMenuItem key={t} className="text-xs" onClick={() => setTypeFilter(t)}>
                <TypeIcon type={t} />
                <span className="ml-1.5">{TYPE_CONFIG[t].label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Status filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs border-border bg-white/5">
              <Filter className="w-3 h-3 mr-1" />
              Status: {statusFilter === "all" ? "All" : STATUS_CONFIG[statusFilter as FinanceStatus].label}
              <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-card border-border">
            <DropdownMenuItem className="text-xs" onClick={() => setStatusFilter("all")}>All Statuses</DropdownMenuItem>
            <DropdownMenuSeparator />
            {(Object.keys(STATUS_CONFIG) as FinanceStatus[]).map((s) => (
              <DropdownMenuItem key={s} className="text-xs" onClick={() => setStatusFilter(s)}>
                {STATUS_CONFIG[s].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-xs text-muted-foreground self-center ml-auto">
          {filtered.length} request{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-xs gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading finance requests…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <AlertCircle className="w-8 h-8 opacity-30" />
            <p className="text-xs">No finance requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">ID</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Type</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">User</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Amount</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Submitted</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((req) => (
                  <tr
                    key={req.id}
                    className="border-b border-border/30 hover:bg-white/3 transition-colors cursor-pointer"
                    onClick={() => setSelectedRequest(req)}
                  >
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">
                      {req.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <TypeIcon type={req.type} />
                        <span className="text-foreground capitalize">{req.type}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div>
                        <p className="text-foreground font-medium">{req.userName}</p>
                        <p className="text-muted-foreground text-[10px]">{req.userEmail}</p>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-foreground">
                      {formatCurrency(req.amount, req.currency)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={req.status} />
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border">
                          <DropdownMenuItem
                            className="text-xs"
                            onClick={() => setSelectedRequest(req)}
                          >
                            <Eye className="w-3 h-3 mr-1.5" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {["pending", "under_review"].includes(req.status) && (
                            <DropdownMenuItem
                              className="text-xs text-emerald-400"
                              onClick={() => handleStatusChange(req.id, "approved")}
                            >
                              <CheckCircle className="w-3 h-3 mr-1.5" /> Approve
                            </DropdownMenuItem>
                          )}
                          {req.status === "pending" && (
                            <DropdownMenuItem
                              className="text-xs text-blue-400"
                              onClick={() => handleStatusChange(req.id, "under_review")}
                            >
                              <Clock className="w-3 h-3 mr-1.5" /> Mark Under Review
                            </DropdownMenuItem>
                          )}
                          {["pending", "under_review", "quoted"].includes(req.status) && (
                            <DropdownMenuItem
                              className="text-xs text-red-400"
                              onClick={() => handleStatusChange(req.id, "rejected")}
                            >
                              <XCircle className="w-3 h-3 mr-1.5" /> Reject
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <DetailDialog
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
        onStatusChange={handleStatusChange}
        isUpdating={updateStatus.isPending}
      />
    </div>
  );
}
