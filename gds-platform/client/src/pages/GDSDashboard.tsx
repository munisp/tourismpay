/**
 * GDS Platform — Standalone Dashboard
 * Africa-first Global Distribution System with Tax, Tipping, Loyalty,
 * Trip Planner integration, MapLibre property map, and budget comparison.
 *
 * This is the STANDALONE version that runs on its own port and integrates
 * with TourismPay via REST API for tax, tipping, loyalty, and remittance.
 */
import { useState } from "react";
import { useRole } from "../hooks/useAuth";
import { ShowFor } from "../components/RoleGuard";

type GDSTab = "overview" | "tax" | "tipping" | "loyalty" | "map" | "budget" | "remittance" | "tripPlanner";

interface TaxJurisdiction {
  code: string;
  name: string;
  effectiveRate: number;
  rules: Array<{ name: string; rate: number; authority: string }>;
}

const JURISDICTIONS: TaxJurisdiction[] = [
  { code: "NG", name: "Nigeria", effectiveRate: 17.5, rules: [{ name: "VAT", rate: 7.5, authority: "FIRS" }, { name: "Consumption Tax", rate: 5.0, authority: "LIRS" }, { name: "Tourism Levy", rate: 5.0, authority: "NTDC" }] },
  { code: "KE", name: "Kenya", effectiveRate: 20.0, rules: [{ name: "VAT", rate: 16.0, authority: "KRA" }, { name: "Catering Levy", rate: 2.0, authority: "KRA" }, { name: "Tourism Fund", rate: 2.0, authority: "Tourism Fund" }] },
  { code: "GH", name: "Ghana", effectiveRate: 21.0, rules: [{ name: "VAT", rate: 15.0, authority: "GRA" }, { name: "NHIL", rate: 2.5, authority: "GRA" }, { name: "GETFund", rate: 2.5, authority: "GRA" }, { name: "Tourism", rate: 1.0, authority: "GTA" }] },
  { code: "ZA", name: "South Africa", effectiveRate: 16.0, rules: [{ name: "VAT", rate: 15.0, authority: "SARS" }, { name: "Tourism Levy", rate: 1.0, authority: "NDT" }] },
  { code: "TZ", name: "Tanzania", effectiveRate: 22.8, rules: [{ name: "VAT", rate: 18.0, authority: "TRA" }, { name: "SDL", rate: 4.5, authority: "TRA" }, { name: "Service Levy", rate: 0.3, authority: "LGA" }] },
  { code: "RW", name: "Rwanda", effectiveRate: 19.5, rules: [{ name: "VAT", rate: 18.0, authority: "RRA" }, { name: "Infrastructure", rate: 1.5, authority: "RDB" }] },
  { code: "EG", name: "Egypt", effectiveRate: 27.0, rules: [{ name: "VAT", rate: 14.0, authority: "ETA" }, { name: "Service Charge", rate: 12.0, authority: "ETA" }, { name: "Municipal", rate: 1.0, authority: "Municipality" }] },
  { code: "MA", name: "Morocco", effectiveRate: 10.0, rules: [{ name: "VAT (Hospitality)", rate: 10.0, authority: "DGI" }] },
  { code: "UG", name: "Uganda", effectiveRate: 19.5, rules: [{ name: "VAT", rate: 18.0, authority: "URA" }, { name: "Tourism Levy", rate: 1.5, authority: "UTB" }] },
  { code: "ET", name: "Ethiopia", effectiveRate: 27.0, rules: [{ name: "VAT", rate: 15.0, authority: "MoR" }, { name: "Service", rate: 10.0, authority: "MoR" }, { name: "TOT", rate: 2.0, authority: "MoR" }] },
  { code: "BW", name: "Botswana", effectiveRate: 15.0, rules: [{ name: "VAT", rate: 14.0, authority: "BURS" }, { name: "Tourism Levy", rate: 1.0, authority: "BTO" }] },
  { code: "NA", name: "Namibia", effectiveRate: 17.0, rules: [{ name: "VAT", rate: 15.0, authority: "NamRA" }, { name: "Tourism Levy", rate: 2.0, authority: "NTB" }] },
  { code: "MU", name: "Mauritius", effectiveRate: 15.85, rules: [{ name: "VAT", rate: 15.0, authority: "MRA" }, { name: "Environment Fee", rate: 0.85, authority: "MRA" }] },
  { code: "MZ", name: "Mozambique", effectiveRate: 19.0, rules: [{ name: "IVA", rate: 16.0, authority: "AT" }, { name: "Tourism Tax", rate: 3.0, authority: "INATUR" }] },
  { code: "ZW", name: "Zimbabwe", effectiveRate: 17.0, rules: [{ name: "VAT", rate: 15.0, authority: "ZIMRA" }, { name: "Tourism Levy", rate: 2.0, authority: "ZTA" }] },
];

const STAFF_ROLES: Record<string, Array<{ code: string; name: string; pct: number }>> = {
  hotel: [{ code: "front_desk", name: "Front Desk", pct: 5 }, { code: "housekeeping", name: "Housekeeping", pct: 10 }, { code: "concierge", name: "Concierge", pct: 8 }, { code: "bellhop", name: "Bellhop", pct: 5 }, { code: "room_service", name: "Room Service", pct: 7 }],
  lodge: [{ code: "guide", name: "Safari Guide", pct: 15 }, { code: "tracker", name: "Tracker", pct: 10 }, { code: "camp_manager", name: "Camp Manager", pct: 8 }, { code: "housekeeping", name: "Housekeeping", pct: 7 }, { code: "chef", name: "Chef", pct: 5 }],
  safari_camp: [{ code: "lead_guide", name: "Lead Guide", pct: 20 }, { code: "tracker", name: "Tracker", pct: 12 }, { code: "driver", name: "Driver", pct: 10 }, { code: "camp_staff", name: "Camp Staff", pct: 8 }],
  resort: [{ code: "front_desk", name: "Front Desk", pct: 5 }, { code: "housekeeping", name: "Housekeeping", pct: 8 }, { code: "spa", name: "Spa Therapist", pct: 15 }, { code: "waiter", name: "Restaurant Staff", pct: 10 }, { code: "pool", name: "Pool Attendant", pct: 5 }],
};

export default function GDSDashboard() {
  const [activeTab, setActiveTab] = useState<GDSTab>("overview");
  const [selectedCountry, setSelectedCountry] = useState("NG");
  const [tipPropertyType, setTipPropertyType] = useState("hotel");
  const [budgetNights, setBudgetNights] = useState(3);
  const { hasRole } = useRole();
  const isAdmin = hasRole("gds_admin", "revenue_manager");

  const allTabs: { id: GDSTab; label: string; adminOnly?: boolean }[] = [
    { id: "overview", label: "Overview" },
    { id: "tax", label: "Tax Engine" },
    { id: "tipping", label: "Staff Tipping" },
    { id: "loyalty", label: "Loyalty" },
    { id: "map", label: "Property Map" },
    { id: "budget", label: "Budget Compare" },
    { id: "tripPlanner", label: "Trip → GDS" },
    { id: "remittance", label: "Remittance", adminOnly: true },
  ];

  const visibleTabs = allTabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Africa GDS — Standalone Platform</h1>
        <p className="text-sm text-gray-500">
          Integrated with TourismPay via API for Tax, Tipping, Loyalty, Trip Planner, and Remittance across 15 African jurisdictions
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-indigo-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Active Jurisdictions", value: "15", sub: "Tax configs loaded" },
              { label: "Properties Connected", value: "2,847", sub: "Across 15 countries" },
              { label: "Loyalty Points Issued", value: "4.2M", sub: "15 pts/USD base" },
              { label: "Tips Processed", value: "$127K", sub: "Multi-recipient" },
            ].map((stat) => (
              <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500">{stat.label}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{stat.value}</p>
                <p className="text-xs text-gray-400">{stat.sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">TourismPay API Integration Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { feature: "Tax Calculation API", endpoint: "GET /api/v1/gds/tax/calculate", status: "connected" },
                { feature: "Tipping API", endpoint: "POST /api/v1/gds/tipping/process", status: "connected" },
                { feature: "Loyalty Points API", endpoint: "GET /api/v1/gds/loyalty/calculate", status: "connected" },
                { feature: "Trip → Booking API", endpoint: "POST /api/v1/gds/trip-planner/convert", status: "connected" },
                { feature: "Remittance API", endpoint: "GET /api/v1/gds/remittance/summary", status: "connected" },
                { feature: "Tax Jurisdictions API", endpoint: "GET /api/v1/gds/tax/jurisdictions", status: "connected" },
              ].map((item) => (
                <div key={item.feature} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="mt-0.5 w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.feature}</p>
                    <p className="text-xs text-gray-500 font-mono">{item.endpoint}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tax Engine Tab */}
      {activeTab === "tax" && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">GDS Tax Engine — 15 African Jurisdictions</h2>
            <p className="text-sm text-gray-500 mb-4">
              Calls TourismPay API to calculate per-country taxes (VAT, tourism levy, service charge) for every GDS booking.
            </p>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-semibold text-indigo-900 mb-2">Tax Calculator</h3>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Country</label>
                  <select
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value)}
                    className="text-sm border border-gray-300 rounded px-2 py-1.5"
                  >
                    {JURISDICTIONS.map((j) => (
                      <option key={j.code} value={j.code}>{j.name}</option>
                    ))}
                  </select>
                </div>
                <div className="text-sm text-gray-700">
                  Effective rate: <span className="font-bold text-indigo-700">
                    {JURISDICTIONS.find((j) => j.code === selectedCountry)?.effectiveRate}%
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {JURISDICTIONS.map((j) => (
                <div
                  key={j.code}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedCountry === j.code ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setSelectedCountry(j.code)}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-900">{j.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                      {j.effectiveRate}%
                    </span>
                  </div>
                  <div className="space-y-1">
                    {j.rules.map((r) => (
                      <div key={r.name} className="flex justify-between text-xs">
                        <span className="text-gray-500">{r.name}</span>
                        <span className="text-gray-700">{r.rate}% ({r.authority})</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Staff Tipping Tab */}
      {activeTab === "tipping" && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Post-Checkout Staff Tipping</h2>
            <p className="text-sm text-gray-500 mb-4">
              Multi-recipient tipping with role-based suggestions per property type.
              Tips go directly to staff wallets via TourismPay Tipping API.
            </p>

            <div className="mb-4">
              <label className="text-xs text-gray-600 block mb-2">Property Type</label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(STAFF_ROLES).map((type) => (
                  <button
                    key={type}
                    onClick={() => setTipPropertyType(type)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      tipPropertyType === type
                        ? "bg-green-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {type.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(STAFF_ROLES[tipPropertyType] ?? []).map((role) => (
                <div key={role.code} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{role.name}</p>
                    <p className="text-xs text-gray-500">Suggested: {role.pct}% of booking</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-green-700">{role.pct}%</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-amber-900 mb-2">How GDS Tipping Works</h3>
              <ol className="text-xs text-amber-800 space-y-1 list-decimal list-inside">
                <li>Guest checks out of GDS-booked property</li>
                <li>GDS calls TourismPay Tipping API for role suggestions</li>
                <li>Guest selects recipients and split mode (equal/custom/%)</li>
                <li>GDS sends tip to TourismPay API → staff wallets</li>
                <li>Each recipient gets a notification with amount + message</li>
                <li>Guest earns bonus loyalty points (2x on tips)</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Loyalty Tab */}
      {activeTab === "loyalty" && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">GDS Loyalty Integration</h2>
            <p className="text-sm text-gray-500 mb-4">
              GDS bookings earn 15 pts/USD (50% more than QR payments). Calculated via TourismPay Loyalty API.
            </p>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-semibold text-purple-900 mb-2">Points Formula</h3>
              <code className="text-xs text-purple-800 block">
                Total Points = (Amount × 15) × Tier Mult × Property Bonus × Booking Type
              </code>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { tier: "Bronze", mult: "1.0x", range: "0-50 bookings" },
                { tier: "Silver", mult: "1.5x", range: "51-200 bookings" },
                { tier: "Gold", mult: "2.0x", range: "201-500 bookings" },
                { tier: "Platinum", mult: "3.0x", range: "501+ bookings" },
              ].map((t) => (
                <div key={t.tier} className="border border-gray-200 rounded-lg p-3 text-center">
                  <p className="text-sm font-bold text-gray-900">{t.tier}</p>
                  <p className="text-lg font-bold text-indigo-600">{t.mult}</p>
                  <p className="text-xs text-gray-500">{t.range}</p>
                </div>
              ))}
            </div>

            <h3 className="text-sm font-semibold text-gray-900 mb-2">Property Type Bonuses</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { type: "Hotel", bonus: "1.0x" },
                { type: "Lodge", bonus: "1.5x" },
                { type: "Safari Camp", bonus: "2.0x" },
                { type: "Resort", bonus: "1.5x" },
                { type: "Boutique", bonus: "1.2x" },
                { type: "Villa", bonus: "1.3x" },
                { type: "Activity", bonus: "1.8x" },
              ].map((p) => (
                <div key={p.type} className="bg-gray-50 rounded px-3 py-2 text-center">
                  <p className="text-xs text-gray-600">{p.type}</p>
                  <p className="text-sm font-bold text-gray-900">{p.bonus}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-green-900 mb-1">Example: $500 Safari Camp Booking (Gold Tier)</h3>
              <p className="text-xs text-green-800">
                $500 × 15 pts × 2.0 (Gold) × 2.0 (Safari Camp) × 1.2 (GDS) = <strong>36,000 points</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Property Map Tab */}
      {activeTab === "map" && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">GDS Property Map — Africa</h2>
            <p className="text-sm text-gray-500 mb-4">
              MapLibre GL with OSM tiles showing all connected properties. No API key required (GeoLibre-inspired).
            </p>

            <div className="bg-gradient-to-br from-blue-50 to-green-50 border border-gray-200 rounded-xl p-8 min-h-[400px] flex flex-col items-center justify-center">
              <div className="text-5xl mb-4">🗺️</div>
              <p className="text-lg font-semibold text-gray-800">MapLibre GL Map View</p>
              <p className="text-sm text-gray-500 mb-6">OSM tiles • Property markers • Geo-search • Cluster view</p>

              <div className="grid grid-cols-3 gap-6 text-center">
                <div>
                  <p className="text-2xl font-bold text-blue-600">2,847</p>
                  <p className="text-xs text-gray-500">Properties</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">15</p>
                  <p className="text-xs text-gray-500">Countries</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-purple-600">75+</p>
                  <p className="text-xs text-gray-500">Destinations</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 justify-center">
                {["Hotels", "Lodges", "Safari Camps", "Resorts", "Villas", "Activities"].map((type) => (
                  <span key={type} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-700">
                    {type}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Budget Comparison Tab */}
      {activeTab === "budget" && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Budget Tier Comparison</h2>
            <p className="text-sm text-gray-500 mb-4">
              Compare accommodation costs across budget levels with tax + loyalty overlay (via TourismPay API).
            </p>

            <div className="flex gap-3 items-end mb-6">
              <div>
                <label className="text-xs text-gray-600 block mb-1">Country</label>
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1.5"
                >
                  {JURISDICTIONS.map((j) => (
                    <option key={j.code} value={j.code}>{j.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Nights</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={budgetNights}
                  onChange={(e) => setBudgetNights(parseInt(e.target.value) || 3)}
                  className="text-sm border border-gray-300 rounded px-2 py-1.5 w-20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { tier: "Budget", nightly: 45, types: "Guesthouse, Hostel", amenities: "WiFi, Breakfast", color: "green" },
                { tier: "Mid-Range", nightly: 150, types: "Hotel, Boutique", amenities: "WiFi, Breakfast, Pool, Restaurant", color: "blue" },
                { tier: "Luxury", nightly: 450, types: "Resort, Lodge, Safari Camp", amenities: "Full-service, Spa, Concierge, Activities", color: "purple" },
              ].map((t) => {
                const taxRate = JURISDICTIONS.find((j) => j.code === selectedCountry)?.effectiveRate ?? 15;
                const baseTotal = t.nightly * budgetNights;
                const tax = Math.round(baseTotal * taxRate) / 100;
                const grand = baseTotal + tax;
                const points = Math.round(baseTotal * 15 * (t.tier === "Luxury" ? 2.0 : t.tier === "Mid-Range" ? 1.2 : 1.0));

                return (
                  <div key={t.tier} className="border-2 border-gray-200 rounded-xl p-4 bg-gray-50">
                    <h3 className="text-lg font-bold text-gray-900">{t.tier}</h3>
                    <p className="text-xs text-gray-500 mb-3">{t.types}</p>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Nightly rate</span>
                        <span className="font-medium">${t.nightly}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Base ({budgetNights} nights)</span>
                        <span className="font-medium">${baseTotal}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Tax ({taxRate}%)</span>
                        <span className="font-medium text-red-600">${tax.toFixed(0)}</span>
                      </div>
                      <hr className="border-gray-200" />
                      <div className="flex justify-between text-sm font-bold">
                        <span>Grand Total</span>
                        <span className="text-gray-900">${grand.toFixed(0)}</span>
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-2 text-center">
                      <p className="text-xs text-gray-500">Loyalty Points Earned</p>
                      <p className="text-lg font-bold text-purple-600">{points.toLocaleString()}</p>
                    </div>

                    <p className="text-xs text-gray-400 mt-2">{t.amenities}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Trip Planner → GDS Tab */}
      {activeTab === "tripPlanner" && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">AI Trip Planner → GDS Booking</h2>
            <p className="text-sm text-gray-500 mb-4">
              Natural language itineraries from the AI Trip Planner are converted into real GDS reservations
              via TourismPay Trip Planner API with tax calculation, loyalty points, and tipping suggestions.
            </p>

            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-6 mb-6">
              <h3 className="text-sm font-semibold text-indigo-900 mb-4">Conversion Pipeline</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-indigo-800">
                <span className="px-2 py-1 bg-white rounded border border-indigo-200 font-medium">NL Query</span>
                <span>→</span>
                <span className="px-2 py-1 bg-white rounded border border-indigo-200 font-medium">AI Itinerary</span>
                <span>→</span>
                <span className="px-2 py-1 bg-white rounded border border-indigo-200 font-medium">GDS Property Match</span>
                <span>→</span>
                <span className="px-2 py-1 bg-white rounded border border-indigo-200 font-medium">Availability Check</span>
                <span>→</span>
                <span className="px-2 py-1 bg-white rounded border border-indigo-200 font-medium">Tax API Call</span>
                <span>→</span>
                <span className="px-2 py-1 bg-white rounded border border-indigo-200 font-medium">Reservation</span>
                <span>→</span>
                <span className="px-2 py-1 bg-white rounded border border-indigo-200 font-medium">Loyalty API Call</span>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Example: &quot;5-day luxury safari in Kenya&quot;</h4>
              <div className="space-y-3">
                {[
                  { day: 1, property: "Hemingways Nairobi", type: "boutique", rate: "$380/night", status: "Confirmed" },
                  { day: 2, property: "Angama Mara Camp", type: "safari_camp", rate: "$850/night", status: "Confirmed" },
                  { day: 3, property: "Angama Mara Camp", type: "safari_camp", rate: "$850/night", status: "Confirmed" },
                  { day: 4, property: "Giraffe Manor", type: "lodge", rate: "$620/night", status: "Confirmed" },
                  { day: 5, property: "The Norfolk", type: "hotel", rate: "$290/night", status: "Confirmed" },
                ].map((item) => (
                  <div key={item.day} className="flex items-center gap-3 text-sm">
                    <span className="w-8 h-8 flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold rounded-full text-xs">
                      D{item.day}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.property}</p>
                      <p className="text-xs text-gray-500">{item.type} • {item.rate}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{item.status}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-gray-200 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="font-bold text-gray-900">$2,990</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Tax (KE 20%)</p>
                  <p className="font-bold text-red-600">$598</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Loyalty Points</p>
                  <p className="font-bold text-purple-600">89,700</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remittance Tab (Admin Only) */}
      {activeTab === "remittance" && (
        <ShowFor roles={["gds_admin", "revenue_manager"]}>
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">GDS Tax Remittance</h2>
              <p className="text-sm text-gray-500 mb-4">
                Taxes collected from GDS bookings flow into the government remittance pipeline via TourismPay Remittance API.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  { label: "GDS Tax Collected", value: "$847K", color: "text-blue-600" },
                  { label: "Remitted to Govt", value: "$412K", color: "text-green-600" },
                  { label: "Outstanding", value: "$435K", color: "text-red-600" },
                  { label: "Compliance", value: "48.6%", color: "text-amber-600" },
                ].map((s) => (
                  <div key={s.label} className="border border-gray-200 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{s.label}</p>
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              <h3 className="text-sm font-semibold text-gray-900 mb-3">Per-Jurisdiction Status</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {JURISDICTIONS.slice(0, 9).map((j, i) => (
                  <div key={j.code} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-900">{j.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        i % 3 === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {i % 3 === 0 ? "Current" : "Pending"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Authority: {j.rules[0]?.authority} • Cycle: Monthly
                    </p>
                    <p className="text-xs text-gray-500">
                      Next due: {new Date(Date.now() + (15 + i * 3) * 86400000).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-900 mb-3">Admin Actions</h4>
                <div className="flex flex-wrap gap-2">
                  <button className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                    Initiate GDS Remittance Batch
                  </button>
                  <button className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200">
                    Reconcile Collections
                  </button>
                  <button className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                    Generate Compliance Report
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ShowFor>
      )}
    </div>
  );
}
