/**
 * KYB Document Review Panel — Admin only
 *
 * Lists all uploaded KYB documents across all establishments.
 * Admins can approve or reject individual documents (with optional notes)
 * or select multiple documents for bulk review.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  ChevronDown,
  Loader2,
  ExternalLink,
  FileCheck,
  FileX,
  Filter,
  Eye,
  Download,
  CheckSquare,
  Square,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// ─── Types ────────────────────────────────────────────────────────────────────

type DocStatus = "pending" | "verified" | "rejected" | "expired";

type KybDoc = {
  id: number;
  applicationId: number;
  establishmentId: number;
  documentType: string;
  status: DocStatus;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  reviewNotes: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  establishmentName: string | null;
  establishmentCountry: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  certificate_of_incorporation: "Certificate of Incorporation",
  business_license: "Business License",
  tax_certificate: "Tax Certificate",
  director_id: "Director ID",
  proof_of_address: "Proof of Address",
  bank_statement: "Bank Statement",
  audited_accounts: "Audited Accounts",
  ownership_structure: "Ownership Structure",
  regulatory_approval: "Regulatory Approval",
  other: "Other",
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: DocStatus }) {
  const map: Record<DocStatus, { label: string; className: string; icon: React.ElementType }> = {
    pending: { label: "Pending", className: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: Clock },
    verified: { label: "Verified", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
    rejected: { label: "Rejected", className: "bg-red-500/15 text-red-400 border-red-500/30", icon: XCircle },
    expired: { label: "Expired", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", icon: Clock },
  };
  const { label, className, icon: Icon } = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${className}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// ─── Review Dialog ────────────────────────────────────────────────────────────

function ReviewDialog({
  doc,
  onClose,
  onSuccess,
}: {
  doc: KybDoc;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [notes, setNotes] = useState(doc.reviewNotes ?? "");
  const utils = trpc.useUtils();

  const reviewMutation = trpc.kybDocuments.review.useMutation({
    onSuccess: () => {
      toast.success("Document review saved");
      utils.kybDocuments.listAll.invalidate();
      utils.kybDocuments.stats.invalidate();
      onSuccess();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Review Document
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Document info */}
          <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">Type</span>
              <span className="text-white font-medium">{DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">File</span>
              <span className="text-white font-mono text-xs truncate max-w-[200px]">{doc.fileName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Establishment</span>
              <span className="text-white">{doc.establishmentName ?? `#${doc.establishmentId}`}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Size</span>
              <span className="text-white">{formatBytes(doc.fileSizeBytes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Current Status</span>
              <StatusBadge status={doc.status} />
            </div>
          </div>

          {/* View document link */}
          <a
            href={doc.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open document in new tab
          </a>

          {/* Review notes */}
          <div className="space-y-2">
            <Label className="text-zinc-300 text-sm">Review Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this document..."
              className="bg-zinc-800/60 border-zinc-700 text-white placeholder-zinc-500 resize-none h-24"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Button>
          <Button
            onClick={() => reviewMutation.mutate({ documentId: doc.id, status: "rejected", reviewNotes: notes || undefined })}
            disabled={reviewMutation.isPending}
            className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40"
            variant="outline"
          >
            {reviewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileX className="w-4 h-4" /> Reject</>}
          </Button>
          <Button
            onClick={() => reviewMutation.mutate({ documentId: doc.id, status: "verified", reviewNotes: notes || undefined })}
            disabled={reviewMutation.isPending}
            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40"
            variant="outline"
          >
            {reviewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileCheck className="w-4 h-4" /> Approve</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Review Dialog ───────────────────────────────────────────────────────

function BulkReviewDialog({
  selectedIds,
  onClose,
  onSuccess,
}: {
  selectedIds: number[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [notes, setNotes] = useState("");
  const utils = trpc.useUtils();

  const bulkMutation = trpc.kybDocuments.bulkReview.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.updated} document(s) ${result.status === "verified" ? "approved" : "rejected"}`);
      utils.kybDocuments.listAll.invalidate();
      utils.kybDocuments.stats.invalidate();
      onSuccess();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Bulk Review — {selectedIds.length} Documents</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-zinc-400">
            You are about to review {selectedIds.length} selected document(s). This action will apply the same decision to all selected documents.
          </p>
          <div className="space-y-2">
            <Label className="text-zinc-300 text-sm">Review Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes for all selected documents..."
              className="bg-zinc-800/60 border-zinc-700 text-white placeholder-zinc-500 resize-none h-20"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
            Cancel
          </Button>
          <Button
            onClick={() => bulkMutation.mutate({ documentIds: selectedIds, status: "rejected", reviewNotes: notes || undefined })}
            disabled={bulkMutation.isPending}
            className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40"
            variant="outline"
          >
            {bulkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileX className="w-4 h-4" /> Reject All</>}
          </Button>
          <Button
            onClick={() => bulkMutation.mutate({ documentIds: selectedIds, status: "verified", reviewNotes: notes || undefined })}
            disabled={bulkMutation.isPending}
            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40"
            variant="outline"
          >
            {bulkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileCheck className="w-4 h-4" /> Approve All</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KybDocumentReview() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DocStatus>("pending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [reviewingDoc, setReviewingDoc] = useState<KybDoc | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkDialog, setShowBulkDialog] = useState(false);

  const { data: stats, isLoading: statsLoading } = trpc.kybDocuments.stats.useQuery();
  const { data: docs, isLoading: docsLoading, refetch } = trpc.kybDocuments.listAll.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    documentType: typeFilter === "all" ? undefined : typeFilter,
    limit: 200,
    offset: 0,
  });

  const isAdmin = user?.role === "admin";

  const filteredDocs = useMemo(() => {
    if (!docs) return [];
    if (!searchQuery) return docs as KybDoc[];
    const q = searchQuery.toLowerCase();
    return (docs as KybDoc[]).filter(
      (d) =>
        d.fileName.toLowerCase().includes(q) ||
        (d.establishmentName ?? "").toLowerCase().includes(q) ||
        (DOC_TYPE_LABELS[d.documentType] ?? d.documentType).toLowerCase().includes(q)
    );
  }, [docs, searchQuery]);

  const allSelected = filteredDocs.length > 0 && filteredDocs.every((d) => selectedIds.has(d.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDocs.map((d) => d.id)));
    }
  }

  function toggleSelect(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="w-16 h-16 text-amber-400" />
        <h2 className="text-2xl font-bold text-white">Access Restricted</h2>
        <p className="text-zinc-400 text-center max-w-md">
          You need administrator privileges to access the KYB document review panel.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="KYB Document Review"
        subtitle="Review and approve compliance documents submitted by establishments"
        actions={
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">
            <FileText className="w-3 h-3" /> ADMIN ONLY
          </span>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Documents"
          value={statsLoading ? "—" : stats?.total ?? 0}
          icon={FileText}
          color="blue"
        />
        <StatCard
          label="Pending Review"
          value={statsLoading ? "—" : stats?.pending ?? 0}
          icon={Clock}
          color="amber"
        />
        <StatCard
          label="Verified"
          value={statsLoading ? "—" : stats?.verified ?? 0}
          icon={CheckCircle2}
          color="green"
        />
        <StatCard
          label="Rejected"
          value={statsLoading ? "—" : stats?.rejected ?? 0}
          icon={XCircle}
          color="crimson"
        />
      </div>

      {/* Filters + Bulk Actions */}
      <div className="glass-card rounded-xl p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Document Queue
            {stats?.pending ? (
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">
                {stats.pending} pending
              </span>
            ) : null}
          </h3>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as any); setSelectedIds(new Set()); }}
                className="appearance-none pl-3 pr-8 py-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500/50 cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
                <option value="expired">Expired</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            </div>

            {/* Type Filter */}
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setSelectedIds(new Set()); }}
                className="appearance-none pl-3 pr-8 py-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500/50 cursor-pointer"
              >
                <option value="all">All Types</option>
                {Object.entries(DOC_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            </div>

            {/* Bulk action button */}
            {selectedIds.size > 0 && (
              <Button
                onClick={() => setShowBulkDialog(true)}
                className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/40 text-sm"
                variant="outline"
                size="sm"
              >
                <CheckSquare className="w-4 h-4 mr-1.5" />
                Review {selectedIds.size} Selected
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        {docsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No documents found</p>
            {statusFilter === "pending" && (
              <p className="text-sm mt-1 text-zinc-600">All documents have been reviewed.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="py-3 px-3 w-10">
                    <button onClick={toggleSelectAll} className="text-zinc-400 hover:text-white transition-colors">
                      {allSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="text-left py-3 px-3 text-zinc-400 font-medium">Document</th>
                  <th className="text-left py-3 px-3 text-zinc-400 font-medium">Establishment</th>
                  <th className="text-left py-3 px-3 text-zinc-400 font-medium">Type</th>
                  <th className="text-left py-3 px-3 text-zinc-400 font-medium">Size</th>
                  <th className="text-left py-3 px-3 text-zinc-400 font-medium">Status</th>
                  <th className="text-left py-3 px-3 text-zinc-400 font-medium">Uploaded</th>
                  <th className="text-right py-3 px-3 text-zinc-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((doc) => {
                  const isSelected = selectedIds.has(doc.id);
                  return (
                    <tr
                      key={doc.id}
                      className={`border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors ${isSelected ? "bg-blue-500/5" : ""}`}
                    >
                      <td className="py-3 px-3">
                        <button onClick={() => toggleSelect(doc.id)} className="text-zinc-400 hover:text-white transition-colors">
                          {isSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                          <span className="text-white font-mono text-xs truncate max-w-[160px]">{doc.fileName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div>
                          <p className="text-white text-sm">{doc.establishmentName ?? `Est. #${doc.establishmentId}`}</p>
                          {doc.establishmentCountry && (
                            <p className="text-zinc-500 text-xs uppercase">{doc.establishmentCountry}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-zinc-300 text-xs">
                        {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                      </td>
                      <td className="py-3 px-3 text-zinc-400 text-xs">
                        {formatBytes(doc.fileSizeBytes)}
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={doc.status} />
                      </td>
                      <td className="py-3 px-3 text-zinc-400 text-xs">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-md text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                            title="View document"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => setReviewingDoc(doc)}
                            className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30 transition-colors"
                          >
                            Review
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-zinc-600 mt-3 px-3">
              Showing {filteredDocs.length} document{filteredDocs.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>

      {/* Review Dialog */}
      {reviewingDoc && (
        <ReviewDialog
          doc={reviewingDoc}
          onClose={() => setReviewingDoc(null)}
          onSuccess={() => setReviewingDoc(null)}
        />
      )}

      {/* Bulk Review Dialog */}
      {showBulkDialog && (
        <BulkReviewDialog
          selectedIds={Array.from(selectedIds)}
          onClose={() => setShowBulkDialog(false)}
          onSuccess={() => setSelectedIds(new Set())}
        />
      )}
    </div>
  );
}
