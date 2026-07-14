/**
 * Tipping & Tax Collection Page
 * Multi-jurisdiction tipping selector + tax breakdown display
 * Accessible via /wallet/tipping-tax
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import MultiTipSelector from "@/components/MultiTipSelector";
import { ShowFor } from "@/components/RoleGuard";
import { useRole } from "@/hooks/useRole";
import TaxRemittanceDashboard from "@/components/TaxRemittanceDashboard";

// ─── Tip Selector Component ─────────────────────────────────────────────────

function TipSelector({ jurisdiction, onTipCalculated }: {
  jurisdiction: string;
  onTipCalculated?: (result: { tipAmount: number; grandTotal: number; currency: string }) => void;
}) {
  const [billAmount, setBillAmount] = useState("");
  const [tipType, setTipType] = useState<"percentage" | "flat" | "round_up">("percentage");
  const [selectedPct, setSelectedPct] = useState<number>(15);
  const [customAmount, setCustomAmount] = useState("");

  const configQuery = trpc.tipping.getConfig.useQuery({ jurisdictionCode: jurisdiction });
  const config = configQuery.data;

  const tipValue = tipType === "percentage" ? selectedPct : tipType === "flat" ? parseFloat(customAmount || "0") : 0;
  const calcQuery = trpc.tipping.calculate.useQuery(
    { jurisdictionCode: jurisdiction, billAmount: parseFloat(billAmount || "0"), tipType, tipValue },
    { enabled: !!billAmount && parseFloat(billAmount) > 0 }
  );

  const sendTip = trpc.tipping.send.useMutation({
    onSuccess: (data) => {
      if (onTipCalculated) onTipCalculated({ tipAmount: data.tipAmount, grandTotal: data.grandTotal, currency: data.currency });
    },
  });

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
        <h3 className="text-lg font-semibold text-green-900 mb-1">Add a Tip</h3>
        {config?.culturalNote && (
          <p className="text-sm text-green-700 italic">{config.culturalNote}</p>
        )}
      </div>

      {/* Bill Amount Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Bill Amount ({config?.currency ?? "USD"})</label>
        <input
          type="number"
          value={billAmount}
          onChange={e => setBillAmount(e.target.value)}
          placeholder="Enter bill amount"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
        />
      </div>

      {/* Tip Type Selector */}
      <div className="flex gap-2">
        {(["percentage", "flat", "round_up"] as const).map(type => (
          <button
            key={type}
            onClick={() => setTipType(type)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              tipType === type ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {type === "percentage" ? "%" : type === "flat" ? "Fixed" : "Round Up"}
          </button>
        ))}
      </div>

      {/* Percentage Buttons */}
      {tipType === "percentage" && config && (
        <div className="grid grid-cols-4 gap-2">
          {config.defaultPercentages.map(pct => (
            <button
              key={pct}
              onClick={() => setSelectedPct(pct)}
              className={`py-3 rounded-lg font-semibold transition-colors ${
                selectedPct === pct ? "bg-green-600 text-white shadow-md" : "bg-gray-100 text-gray-700 hover:bg-green-100"
              }`}
            >
              {pct}%
            </button>
          ))}
          <button
            onClick={() => setSelectedPct(0)}
            className={`py-3 rounded-lg font-semibold transition-colors ${
              !config.defaultPercentages.includes(selectedPct) && selectedPct !== 0 ? "bg-green-600 text-white shadow-md" : "bg-gray-100 text-gray-700 hover:bg-green-100"
            }`}
          >
            Custom
          </button>
        </div>
      )}

      {/* Flat Amount Suggestions */}
      {tipType === "flat" && config && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {config.suggestedFlat.map(amt => (
              <button
                key={amt}
                onClick={() => setCustomAmount(String(amt))}
                className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                  customAmount === String(amt) ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-green-100"
                }`}
              >
                {amt.toLocaleString()}
              </button>
            ))}
          </div>
          <input
            type="number"
            value={customAmount}
            onChange={e => setCustomAmount(e.target.value)}
            placeholder="Or enter custom amount"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          />
        </div>
      )}

      {/* Calculation Result */}
      {calcQuery.data && parseFloat(billAmount) > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Bill</span>
            <span>{calcQuery.data.billAmount.toLocaleString()} {calcQuery.data.currency}</span>
          </div>
          <div className="flex justify-between text-sm text-green-700 font-medium">
            <span>Tip ({calcQuery.data.percentage}%)</span>
            <span>+{calcQuery.data.tipAmount.toLocaleString()} {calcQuery.data.currency}</span>
          </div>
          {calcQuery.data.splits.length > 1 && (
            <div className="pl-4 border-l-2 border-green-200 space-y-1">
              {calcQuery.data.splits.map((s, i) => (
                <div key={i} className="flex justify-between text-xs text-gray-500">
                  <span className="capitalize">{s.role} ({s.percentage}%)</span>
                  <span>{s.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t pt-2 flex justify-between font-bold">
            <span>Total</span>
            <span>{calcQuery.data.grandTotal.toLocaleString()} {calcQuery.data.currency}</span>
          </div>
        </div>
      )}

      {/* Send Tip Button */}
      <button
        onClick={() => {
          if (!billAmount || parseFloat(billAmount) <= 0) return;
          sendTip.mutate({
            billAmount: parseFloat(billAmount),
            tipType,
            tipValue,
            jurisdictionCode: jurisdiction,
            currency: config?.currency ?? "NGN",
          });
        }}
        disabled={!billAmount || parseFloat(billAmount) <= 0 || sendTip.isPending}
        className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {sendTip.isPending ? "Sending..." : "Send Tip"}
      </button>

      {sendTip.data && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-green-800 font-medium">{sendTip.data.message}</p>
          <p className="text-xs text-green-600 mt-1">+{sendTip.data.loyaltyPointsEarned} loyalty points earned</p>
        </div>
      )}
    </div>
  );
}

// ─── Tax Breakdown Component ────────────────────────────────────────────────

function TaxBreakdown({ jurisdiction, category, subTotal }: {
  jurisdiction: string;
  category: string;
  subTotal: number;
}) {
  const calcQuery = trpc.taxCollection.calculate.useQuery(
    { jurisdictionCode: jurisdiction, category, subTotal },
    { enabled: subTotal > 0 }
  );

  if (!calcQuery.data) return null;
  const data = calcQuery.data;

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-2">
      <h4 className="text-sm font-semibold text-blue-900">Tax Breakdown ({data.jurisdictionCode})</h4>
      <div className="flex justify-between text-sm text-gray-600">
        <span>Subtotal</span>
        <span>{data.subTotal.toLocaleString()} {data.currency}</span>
      </div>
      {data.breakdown.map((item, i) => (
        <div key={i} className="flex justify-between text-sm text-gray-600">
          <span>{item.name} ({item.rate}%)</span>
          <span>+{item.amount.toLocaleString()} {data.currency}</span>
        </div>
      ))}
      <div className="border-t pt-2 flex justify-between font-bold text-blue-900">
        <span>Total (incl. tax)</span>
        <span>{data.grandTotal.toLocaleString()} {data.currency}</span>
      </div>
      <p className="text-xs text-gray-400">Receipt: {data.receiptNumber}</p>
    </div>
  );
}

// ─── Jurisdiction Selector ──────────────────────────────────────────────────

function JurisdictionSelector({ selected, onChange }: { selected: string; onChange: (code: string) => void }) {
  const jurisdictions = trpc.taxCollection.jurisdictions.useQuery();

  return (
    <select
      value={selected}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
    >
      {jurisdictions.data?.map(j => (
        <option key={j.code} value={j.code}>
          {j.name} — VAT {j.vatRate}% ({j.currency})
        </option>
      ))}
    </select>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function TippingTaxPage() {
  const { role, hasRole } = useRole();
  const isMerchant = role === "merchant";
  const isAdmin = hasRole("admin", "settlement_officer");

  // Merchants only see their own jurisdiction (scoped by backend)
  const [jurisdiction, setJurisdiction] = useState("NG");
  const [activeTab, setActiveTab] = useState<"tipping" | "tax" | "multi" | "remittance">("tipping");
  const [taxCategory, setTaxCategory] = useState("food");
  const [taxAmount, setTaxAmount] = useState("");

  // Available tabs differ by role
  const availableTabs = isMerchant
    ? ["tipping", "tax", "multi"] as const
    : isAdmin
      ? ["tipping", "tax", "multi", "remittance"] as const
      : ["tipping", "tax", "multi", "remittance"] as const;

  const tipJurisdictions = trpc.tipping.jurisdictions.useQuery();
  const taxRules = trpc.taxCollection.getRules.useQuery({ jurisdictionCode: jurisdiction });

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4">
        <h1 className="text-xl font-bold text-gray-900">Tipping & Tax</h1>
        <p className="text-sm text-gray-500">Multi-jurisdiction tipping and tax collection</p>
      </div>

      {/* Jurisdiction Selector */}
      <div className="px-4 pt-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Jurisdiction</label>
        <JurisdictionSelector selected={jurisdiction} onChange={setJurisdiction} />
      </div>

      {/* Tabs — role-based visibility */}
      <div className="flex gap-1 px-4 pt-4">
        {availableTabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium capitalize transition-colors ${
              activeTab === tab ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Merchant jurisdiction notice */}
      {isMerchant && (
        <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-800">
            Showing data for your registered jurisdiction ({jurisdiction}). Contact admin to update.
          </p>
        </div>
      )}

      {/* Tab Content */}
      <div className="px-4 pt-4">
        {activeTab === "tipping" && (
          <div className="space-y-4">
            <TipSelector jurisdiction={jurisdiction} />

            {/* Jurisdiction tipping info */}
            {tipJurisdictions.data && (
              <div className="bg-white border rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Tipping Customs by Country</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {tipJurisdictions.data.map(j => (
                    <div key={j.code} className="flex items-start gap-2 text-xs">
                      <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{j.code}</span>
                      <div>
                        <span className="font-medium">{j.name}</span>
                        <span className="text-gray-500 ml-1">({j.defaultPercentages.join("/")}%)</span>
                        <p className="text-gray-400 mt-0.5">{j.culturalNote}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "tax" && (
          <div className="space-y-4">
            {/* Category selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service Category</label>
              <select
                value={taxCategory}
                onChange={e => setTaxCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="food">Food & Dining</option>
                <option value="accommodation">Accommodation</option>
                <option value="transport">Transport</option>
                <option value="experience">Experience / Activity</option>
                <option value="all">General</option>
              </select>
            </div>

            {/* Amount input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Amount</label>
              <input
                type="number"
                value={taxAmount}
                onChange={e => setTaxAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            {/* Tax breakdown */}
            {parseFloat(taxAmount) > 0 && (
              <TaxBreakdown jurisdiction={jurisdiction} category={taxCategory} subTotal={parseFloat(taxAmount)} />
            )}

            {/* Applicable rules */}
            {taxRules.data && (
              <div className="bg-white border rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">
                  Tax Rules — {taxRules.data.name}
                </h4>
                <p className="text-xs text-gray-500 mb-2">
                  Authority: {taxRules.data.taxAuthority} | Filing: {taxRules.data.filingFrequency}
                </p>
                <div className="space-y-1">
                  {taxRules.data.rules.map((rule) => (
                    <div key={rule.id} className="flex justify-between text-xs py-1 border-b border-gray-50">
                      <span>
                        <span className="font-medium">{rule.name}</span>
                        <span className="text-gray-400 ml-1">({rule.appliesToCategory})</span>
                      </span>
                      <span className="font-mono">
                        {rule.flatAmount > 0 ? `${rule.flatAmount} flat` : `${rule.rate}%`}
                        {rule.minAmount > 0 && <span className="text-gray-400 ml-1">min {rule.minAmount.toLocaleString()}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "multi" && (
          <div className="space-y-4">
            <MultiTipSelector
              jurisdictionCode={jurisdiction}
              currency={tipJurisdictions.data?.find(j => j.code === jurisdiction)?.currency ?? "NGN"}
              billAmount={5000}
            />
          </div>
        )}

        {activeTab === "remittance" && (
          <TaxRemittanceDashboard jurisdiction={jurisdiction} />
        )}
      </div>
    </div>
  );
}
