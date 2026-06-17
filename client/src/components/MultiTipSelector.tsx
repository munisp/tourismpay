/**
 * Multi-Recipient Tip Selector Component
 * Allows tourists to tip multiple individuals with custom per-person amounts,
 * equal splits, or percentage-based allocation.
 */
import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";

interface Recipient {
  id: string;
  recipientId: string;
  recipientName: string;
  role: string;
  amount: number;
  percentage: number;
  message: string;
}

interface MultiTipSelectorProps {
  jurisdictionCode: string;
  currency: string;
  billAmount: number;
  establishmentId?: number;
  onComplete?: (result: { groupId: string; totalTip: number; recipientCount: number }) => void;
}

const SERVICE_TYPES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "hotel", label: "Hotel" },
  { value: "safari", label: "Safari" },
  { value: "tour", label: "Tour" },
  { value: "spa", label: "Spa" },
  { value: "transport", label: "Transport" },
  { value: "nightlife", label: "Nightlife" },
];

export default function MultiTipSelector({
  jurisdictionCode,
  currency,
  billAmount,
  establishmentId,
  onComplete,
}: MultiTipSelectorProps) {
  const [serviceType, setServiceType] = useState("restaurant");
  const [splitMode, setSplitMode] = useState<"equal" | "custom_amount" | "custom_percent">("equal");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [totalTipInput, setTotalTipInput] = useState("");
  const [tipPercentage, setTipPercentage] = useState(15);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [sent, setSent] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);

  // Get suggested roles for the service type
  const suggestQuery = trpc.multiTipping.suggestRecipients.useQuery({
    jurisdictionCode,
    serviceType,
  });

  // Calculate tip preview
  const totalTip = totalTipInput ? parseFloat(totalTipInput) : Math.round(billAmount * tipPercentage / 100 * 100) / 100;

  const calcQuery = trpc.multiTipping.calculate.useQuery(
    {
      jurisdictionCode,
      billAmount,
      totalTipAmount: totalTip,
      tipPercentage,
      splitMode,
      recipients: recipients.map(r => ({
        recipientId: r.recipientId,
        recipientName: r.recipientName,
        role: r.role,
        amount: r.amount,
        percentage: r.percentage,
      })),
      currency,
    },
    { enabled: recipients.length > 0 && totalTip > 0 }
  );

  // Send mutation
  const sendMutation = trpc.multiTipping.send.useMutation({
    onSuccess: (data) => {
      setSent(true);
      setSendResult(data);
      onComplete?.({ groupId: data.groupId, totalTip: data.totalTip, recipientCount: data.recipientCount });
    },
  });

  // Add a recipient from suggested roles
  const addRecipientFromRole = useCallback((role: string, label: string, suggestedPct: number) => {
    if (recipients.some(r => r.role === role)) return; // Already added
    const newRecipient: Recipient = {
      id: crypto.randomUUID(),
      recipientId: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      recipientName: label,
      role,
      amount: 0,
      percentage: suggestedPct,
      message: "",
    };
    setRecipients(prev => [...prev, newRecipient]);
  }, [recipients]);

  // Add custom recipient
  const addCustomRecipient = useCallback(() => {
    if (!customName.trim()) return;
    const newRecipient: Recipient = {
      id: crypto.randomUUID(),
      recipientId: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      recipientName: customName.trim(),
      role: customRole.trim() || "staff",
      amount: 0,
      percentage: 0,
      message: "",
    };
    setRecipients(prev => [...prev, newRecipient]);
    setCustomName("");
    setCustomRole("");
    setShowAddCustom(false);
  }, [customName, customRole]);

  // Remove recipient
  const removeRecipient = (id: string) => {
    setRecipients(prev => prev.filter(r => r.id !== id));
  };

  // Update recipient amount/percentage
  const updateRecipient = (id: string, field: "amount" | "percentage" | "message", value: string) => {
    setRecipients(prev => prev.map(r => {
      if (r.id !== id) return r;
      if (field === "message") return { ...r, message: value };
      return { ...r, [field]: parseFloat(value) || 0 };
    }));
  };

  // Handle send
  const handleSend = () => {
    if (recipients.length === 0 || totalTip <= 0) return;
    sendMutation.mutate({
      jurisdictionCode,
      billAmount,
      totalTipAmount: totalTip,
      splitMode,
      recipients: recipients.map(r => ({
        recipientId: r.recipientId,
        recipientName: r.recipientName,
        role: r.role,
        amount: r.amount,
        percentage: r.percentage,
        message: r.message || undefined,
      })),
      currency,
      establishmentId,
    });
  };

  if (sent && sendResult) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <div className="text-4xl mb-2">🎉</div>
          <h3 className="text-lg font-bold text-green-900">Tips Sent Successfully!</h3>
          <p className="text-green-700 mt-1">
            {sendResult.totalTip.toLocaleString()} {sendResult.currency} distributed to {sendResult.recipientCount} recipients
          </p>
          <p className="text-xs text-green-600 mt-2">+{sendResult.loyaltyPointsEarned} loyalty points earned</p>
        </div>
        <div className="space-y-2">
          {sendResult.receipts?.map((r: any, i: number) => (
            <div key={i} className="flex justify-between items-center bg-white border rounded-lg p-3">
              <div>
                <span className="font-medium">{r.recipientName}</span>
              </div>
              <div className="text-right">
                <span className="font-bold text-green-700">{r.amount.toLocaleString()} {sendResult.currency}</span>
                <span className="block text-xs text-gray-500">{r.receipt}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4">
        <h3 className="text-lg font-semibold text-purple-900 flex items-center gap-2">
          <span>👥</span> Tip Multiple Recipients
        </h3>
        <p className="text-sm text-purple-700 mt-1">
          Distribute your tip among multiple service providers
        </p>
      </div>

      {/* Service Type Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {SERVICE_TYPES.map(st => (
            <button
              key={st.value}
              onClick={() => { setServiceType(st.value); setRecipients([]); }}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${
                serviceType === st.value ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-purple-100"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Suggested Roles */}
      {suggestQuery.data && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Add Recipients ({suggestQuery.data.serviceType})
          </label>
          {suggestQuery.data.culturalGuidance && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
              💡 {suggestQuery.data.culturalGuidance}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {suggestQuery.data.roles.map(role => {
              const isAdded = recipients.some(r => r.role === role.role);
              return (
                <button
                  key={role.role}
                  onClick={() => addRecipientFromRole(role.role, role.label, role.suggestedPct)}
                  disabled={isAdded}
                  className={`py-2 px-3 rounded-lg text-sm border transition-colors ${
                    isAdded
                      ? "bg-purple-100 border-purple-300 text-purple-700 cursor-default"
                      : "bg-white border-gray-200 text-gray-700 hover:border-purple-400 hover:bg-purple-50"
                  }`}
                >
                  {isAdded ? "✓ " : "+ "}{role.label}
                  <span className="text-xs text-gray-500 ml-1">({role.suggestedPct}%)</span>
                </button>
              );
            })}
            <button
              onClick={() => setShowAddCustom(!showAddCustom)}
              className="py-2 px-3 rounded-lg text-sm border border-dashed border-gray-300 text-gray-500 hover:border-purple-400 hover:text-purple-600"
            >
              + Custom
            </button>
          </div>
        </div>
      )}

      {/* Add Custom Recipient */}
      {showAddCustom && (
        <div className="flex gap-2 items-end bg-gray-50 rounded-lg p-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="e.g., John"
              className="w-full px-2 py-1.5 border rounded text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Role</label>
            <input
              value={customRole}
              onChange={e => setCustomRole(e.target.value)}
              placeholder="e.g., porter"
              className="w-full px-2 py-1.5 border rounded text-sm"
            />
          </div>
          <button onClick={addCustomRecipient} className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm font-medium">
            Add
          </button>
        </div>
      )}

      {/* Recipients List */}
      {recipients.length > 0 && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-gray-700">
              Recipients ({recipients.length})
            </label>
            {/* Split Mode */}
            <div className="flex gap-1">
              {(["equal", "custom_percent", "custom_amount"] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setSplitMode(mode)}
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    splitMode === mode ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {mode === "equal" ? "Equal" : mode === "custom_percent" ? "% Split" : "Custom $"}
                </button>
              ))}
            </div>
          </div>

          {recipients.map((r, idx) => (
            <div key={r.id} className="bg-white border rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-medium text-sm">{r.recipientName}</span>
                  <span className="text-xs text-gray-500 ml-2">({r.role})</span>
                </div>
                <button onClick={() => removeRecipient(r.id)} className="text-red-400 hover:text-red-600 text-lg">×</button>
              </div>

              <div className="flex gap-2 items-center">
                {splitMode === "custom_percent" && (
                  <div className="flex-1">
                    <input
                      type="number"
                      value={r.percentage || ""}
                      onChange={e => updateRecipient(r.id, "percentage", e.target.value)}
                      placeholder="%"
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                )}
                {splitMode === "custom_amount" && (
                  <div className="flex-1">
                    <input
                      type="number"
                      value={r.amount || ""}
                      onChange={e => updateRecipient(r.id, "amount", e.target.value)}
                      placeholder={`Amount (${currency})`}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                )}
                {splitMode === "equal" && calcQuery.data && (
                  <span className="text-sm font-semibold text-purple-700">
                    {calcQuery.data.distributions[idx]?.amount?.toLocaleString() ?? "..."} {currency}
                  </span>
                )}
                <input
                  type="text"
                  value={r.message}
                  onChange={e => updateRecipient(r.id, "message", e.target.value)}
                  placeholder="Personal message (optional)"
                  className="flex-1 px-2 py-1 border rounded text-xs text-gray-600"
                  maxLength={200}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Total Tip Amount */}
      {recipients.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Total Tip Amount</label>
          <div className="flex gap-2">
            {[10, 15, 20].map(pct => (
              <button
                key={pct}
                onClick={() => { setTipPercentage(pct); setTotalTipInput(""); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold ${
                  tipPercentage === pct && !totalTipInput ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-purple-100"
                }`}
              >
                {pct}%
              </button>
            ))}
            <input
              type="number"
              value={totalTipInput}
              onChange={e => setTotalTipInput(e.target.value)}
              placeholder="Custom"
              className="flex-1 px-2 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="text-right text-sm text-gray-500">
            Total: <span className="font-bold text-purple-700">{totalTip.toLocaleString()} {currency}</span>
          </div>
        </div>
      )}

      {/* Preview */}
      {calcQuery.data && recipients.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-2">
          <h4 className="text-sm font-semibold text-purple-900">Distribution Preview</h4>
          {calcQuery.data.distributions.map((d, i) => (
            <div key={i} className="flex justify-between items-center text-sm">
              <span className="text-purple-800">{d.recipientName} <span className="text-xs text-purple-500">({d.role})</span></span>
              <span className="font-semibold text-purple-900">
                {d.amount.toLocaleString()} {calcQuery.data!.currency}
                <span className="text-xs text-purple-500 ml-1">({d.percentage}%)</span>
              </span>
            </div>
          ))}
          <div className="border-t border-purple-200 pt-2 flex justify-between text-sm font-bold">
            <span className="text-purple-900">Grand Total (bill + tip)</span>
            <span className="text-purple-900">{calcQuery.data.grandTotal.toLocaleString()} {currency}</span>
          </div>
        </div>
      )}

      {/* Send Button */}
      {recipients.length > 0 && totalTip > 0 && (
        <button
          onClick={handleSend}
          disabled={sendMutation.isPending}
          className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-base transition-colors disabled:opacity-50"
        >
          {sendMutation.isPending
            ? "Sending tips..."
            : `Send ${totalTip.toLocaleString()} ${currency} to ${recipients.length} recipient${recipients.length > 1 ? "s" : ""}`
          }
        </button>
      )}

      {sendMutation.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          {sendMutation.error.message}
        </p>
      )}
    </div>
  );
}
