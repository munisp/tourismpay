/**
 * Tax Remittance Dashboard — Government tax remittance management UI.
 * Shows batch status per jurisdiction, filing deadlines, payment history,
 * compliance scores, and initiate remittance actions.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";

interface RemittanceDashboardProps {
  jurisdiction: string;
}

export default function TaxRemittanceDashboard({ jurisdiction }: RemittanceDashboardProps) {
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<string | null>(null);
  const [showInitiateModal, setShowInitiateModal] = useState(false);
  const [remitAmount, setRemitAmount] = useState("");

  const dashboard = trpc.taxRemittance.dashboard.useQuery();
  const detail = trpc.taxRemittance.jurisdictionDetail.useQuery(
    { jurisdictionCode: selectedJurisdiction ?? jurisdiction },
    { enabled: !!selectedJurisdiction || !!jurisdiction }
  );
  const initiate = trpc.taxRemittance.initiateRemittance.useMutation();

  const data = dashboard.data;
  const summary = data?.summary;

  const handleInitiate = async () => {
    if (!selectedJurisdiction || !remitAmount) return;
    try {
      await initiate.mutateAsync({
        jurisdictionCode: selectedJurisdiction,
        period: data?.currentPeriod ?? new Date().toISOString().slice(0, 7),
        amount: parseFloat(remitAmount),
      });
      setShowInitiateModal(false);
      setRemitAmount("");
      dashboard.refetch();
    } catch (err) {
      console.error("Remittance initiation failed:", err);
    }
  };

  if (dashboard.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🏛️</span>
          <h4 className="text-sm font-semibold text-amber-900">Government Tax Remittance</h4>
        </div>
        <p className="text-xs text-amber-700">
          Automated batch collection and remittance to tax authorities across 10 African jurisdictions.
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Collected</p>
            <p className="text-lg font-bold text-gray-900">
              {formatCompact(summary.totalCollected)}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Remitted</p>
            <p className="text-lg font-bold text-green-600">
              {formatCompact(summary.totalRemitted)}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Outstanding</p>
            <p className="text-lg font-bold text-red-600">
              {formatCompact(summary.totalOutstanding)}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Compliance</p>
            <p className="text-lg font-bold text-blue-600">
              {summary.overallCompliancePct}%
            </p>
          </div>
        </div>
      )}

      {/* Status Summary */}
      {summary && (
        <div className="flex gap-2 text-xs">
          <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full">
            {summary.remittedCount} Remitted
          </span>
          <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
            {summary.pendingCount} Pending
          </span>
          {summary.overdueCount > 0 && (
            <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full">
              {summary.overdueCount} Overdue
            </span>
          )}
        </div>
      )}

      {/* Jurisdiction Grid */}
      <div className="space-y-2">
        <h5 className="text-xs font-medium text-gray-600 uppercase tracking-wide">By Jurisdiction</h5>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data?.jurisdictions.map(j => (
            <button
              key={j.jurisdictionCode}
              onClick={() => {
                setSelectedJurisdiction(j.jurisdictionCode);
              }}
              className={`text-left bg-white border rounded-lg p-3 hover:shadow-sm transition-shadow ${
                selectedJurisdiction === j.jurisdictionCode ? "ring-2 ring-blue-500 border-blue-300" : ""
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-900">{j.jurisdictionCode}</p>
                  <p className="text-xs text-gray-500 truncate max-w-[160px]">{j.authority}</p>
                </div>
                <StatusBadge status={j.status} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-gray-600">
                <span>Due: {j.daysUntilDue > 0 ? `${j.daysUntilDue}d` : "Overdue"}</span>
                <span>{j.currency} {formatCompact(j.outstanding)}</span>
              </div>
              {/* Compliance bar */}
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    j.compliancePct >= 100 ? "bg-green-500" :
                    j.compliancePct >= 50 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${Math.min(j.compliancePct, 100)}%` }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Selected Jurisdiction Detail */}
      {selectedJurisdiction && detail.data && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h5 className="text-sm font-semibold text-gray-900">
              {detail.data.jurisdictionCode} — {detail.data.authority}
            </h5>
            <button
              onClick={() => setShowInitiateModal(true)}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Initiate Remittance
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-gray-50 rounded-lg p-2">
              <p className="text-gray-500">Filing Frequency</p>
              <p className="font-medium capitalize">{detail.data.schedule.frequency}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <p className="text-gray-500">Deadline Day</p>
              <p className="font-medium">{detail.data.schedule.deadlineDay}th of month</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <p className="text-gray-500">Grace Period</p>
              <p className="font-medium">{detail.data.schedule.gracePeriodDays} days</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <p className="text-gray-500">Transfer Method</p>
              <p className="font-medium">{detail.data.govtBankAccount.transferMethod}</p>
            </div>
          </div>

          {/* Government Bank Account */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-xs font-medium text-blue-900 mb-1">Government Bank Account</p>
            <div className="grid grid-cols-2 gap-1 text-xs text-blue-800">
              <span>Bank: {detail.data.govtBankAccount.bankName}</span>
              <span>A/C: {detail.data.govtBankAccount.accountNumber}</span>
              <span>Name: {detail.data.govtBankAccount.accountName}</span>
              <span>SWIFT: {detail.data.govtBankAccount.swiftCode}</span>
            </div>
          </div>

          {/* Penalty Rules */}
          {detail.data.penaltyRules && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3">
              <p className="text-xs font-medium text-red-900 mb-1">Late Payment Penalties</p>
              <div className="grid grid-cols-2 gap-1 text-xs text-red-800">
                <span>Daily: {detail.data.penaltyRules.dailyBps / 100}%</span>
                <span>Annual Interest: {detail.data.penaltyRules.annualInterestBps / 100}%</span>
                <span>Grace: {detail.data.penaltyRules.graceDays} days</span>
                <span>Max Penalty: {detail.data.penaltyRules.maxPct}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Initiate Remittance Modal */}
      {showInitiateModal && selectedJurisdiction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h4 className="text-lg font-semibold text-gray-900">
              Initiate Tax Remittance — {selectedJurisdiction}
            </h4>
            <p className="text-sm text-gray-600">
              Transfer collected taxes to {detail.data?.authority ?? "government authority"}.
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Amount ({detail.data?.currency})</label>
              <input
                type="number"
                value={remitAmount}
                onChange={e => setRemitAmount(e.target.value)}
                placeholder="Enter remittance amount"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {detail.data && (
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                <p><span className="text-gray-500">Bank:</span> {detail.data.govtBankAccount.bankName}</p>
                <p><span className="text-gray-500">Account:</span> {detail.data.govtBankAccount.accountName}</p>
                <p><span className="text-gray-500">Method:</span> {detail.data.govtBankAccount.transferMethod}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowInitiateModal(false)}
                className="flex-1 px-4 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleInitiate}
                disabled={!remitAmount || initiate.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {initiate.isPending ? "Processing..." : "Confirm & Send"}
              </button>
            </div>

            {initiate.isSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
                Payment initiated. Reference: {initiate.data.reference}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper Components ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    remitted: "bg-green-100 text-green-800",
    pending: "bg-amber-100 text-amber-800",
    overdue: "bg-red-100 text-red-800",
    processing: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}
