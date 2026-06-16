/**
 * GDS Agent Portal — Travel agent dashboard for the Africa-first GDS.
 * Property search, booking management, commission tracking, distribution config.
 */
import { useState } from "react";

type Tab = "search" | "bookings" | "commission" | "distribution" | "analytics";

interface SearchFilters {
  destination: string;
  country: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  rooms: number;
  propertyType: string;
  minPrice: string;
  maxPrice: string;
  starRating: string;
  mealPlan: string;
}

const AFRICAN_COUNTRIES = [
  { code: "KE", name: "Kenya" },
  { code: "ZA", name: "South Africa" },
  { code: "TZ", name: "Tanzania" },
  { code: "NG", name: "Nigeria" },
  { code: "GH", name: "Ghana" },
  { code: "RW", name: "Rwanda" },
  { code: "UG", name: "Uganda" },
  { code: "ET", name: "Ethiopia" },
  { code: "MA", name: "Morocco" },
  { code: "EG", name: "Egypt" },
  { code: "BW", name: "Botswana" },
  { code: "NA", name: "Namibia" },
  { code: "ZW", name: "Zimbabwe" },
  { code: "MU", name: "Mauritius" },
  { code: "MZ", name: "Mozambique" },
];

const PROPERTY_TYPES = [
  "hotel", "lodge", "safari_camp", "resort", "boutique",
  "guesthouse", "villa", "apartment", "activity",
];

export default function GDSAgentPortal() {
  const [activeTab, setActiveTab] = useState<Tab>("search");
  const [filters, setFilters] = useState<SearchFilters>({
    destination: "",
    country: "",
    checkIn: "",
    checkOut: "",
    guests: 2,
    rooms: 1,
    propertyType: "",
    minPrice: "",
    maxPrice: "",
    starRating: "",
    mealPlan: "",
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "search", label: "Search Properties" },
    { id: "bookings", label: "My Bookings" },
    { id: "commission", label: "Commission" },
    { id: "distribution", label: "Distribution" },
    { id: "analytics", label: "Performance" },
  ];

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e2e8f0" }}>
          Africa GDS — Agent Portal
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
          Search and book African tourism properties. Earn tiered commissions.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1.5rem", borderBottom: "1px solid #1e293b", paddingBottom: "0.5rem", flexWrap: "wrap" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "none",
              background: activeTab === tab.id ? "#6366f1" : "transparent",
              color: activeTab === tab.id ? "#fff" : "#94a3b8",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: activeTab === tab.id ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "search" && (
        <div>
          {/* Search Form */}
          <div style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1.25rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Destination</label>
                <input
                  type="text"
                  placeholder="e.g. Masai Mara, Serengeti..."
                  value={filters.destination}
                  onChange={(e) => setFilters({ ...filters, destination: e.target.value })}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f0f1a", color: "#e2e8f0" }}
                />
              </div>
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Country</label>
                <select
                  value={filters.country}
                  onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f0f1a", color: "#e2e8f0" }}
                >
                  <option value="">All Countries</option>
                  {AFRICAN_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Check-in</label>
                <input
                  type="date"
                  value={filters.checkIn}
                  onChange={(e) => setFilters({ ...filters, checkIn: e.target.value })}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f0f1a", color: "#e2e8f0" }}
                />
              </div>
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Check-out</label>
                <input
                  type="date"
                  value={filters.checkOut}
                  onChange={(e) => setFilters({ ...filters, checkOut: e.target.value })}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f0f1a", color: "#e2e8f0" }}
                />
              </div>
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Guests</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={filters.guests}
                  onChange={(e) => setFilters({ ...filters, guests: parseInt(e.target.value) || 2 })}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f0f1a", color: "#e2e8f0" }}
                />
              </div>
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Property Type</label>
                <select
                  value={filters.propertyType}
                  onChange={(e) => setFilters({ ...filters, propertyType: e.target.value })}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f0f1a", color: "#e2e8f0" }}
                >
                  <option value="">All Types</option>
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              style={{ marginTop: "1rem", padding: "0.625rem 1.5rem", background: "#6366f1", color: "#fff", border: "none", borderRadius: "0.375rem", cursor: "pointer", fontWeight: 600 }}
            >
              Search Properties
            </button>
          </div>

          {/* Results */}
          <div style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "2rem", textAlign: "center" }}>
            <p style={{ color: "#94a3b8" }}>Enter search criteria above to find African tourism properties.</p>
            <p style={{ color: "#64748b", fontSize: "0.875rem", marginTop: "0.5rem" }}>
              Connected to 20 African countries • Hotels, Lodges, Safari Camps, Villas & more
            </p>
          </div>
        </div>
      )}

      {activeTab === "bookings" && (
        <div style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1.5rem" }}>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>My Reservations</h2>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            {["All", "Confirmed", "Pending", "Cancelled"].map((status) => (
              <button key={status} style={{ padding: "0.375rem 0.75rem", borderRadius: "9999px", border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: "0.75rem" }}>
                {status}
              </button>
            ))}
          </div>
          <div style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
            <p>No reservations yet. Search and book properties to see them here.</p>
          </div>
        </div>
      )}

      {activeTab === "commission" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            {[
              { label: "Total Earned", value: "$0.00", sub: "Lifetime" },
              { label: "Pending Payout", value: "$0.00", sub: "Next cycle" },
              { label: "Commission Rate", value: "10%", sub: "Bronze tier" },
              { label: "Bookings This Month", value: "0", sub: "0 of 50 for Silver" },
            ].map((stat) => (
              <div key={stat.label} style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1rem" }}>
                <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{stat.label}</p>
                <p style={{ color: "#e2e8f0", fontSize: "1.25rem", fontWeight: 700 }}>{stat.value}</p>
                <p style={{ color: "#64748b", fontSize: "0.6875rem" }}>{stat.sub}</p>
              </div>
            ))}
          </div>
          <div style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1.25rem" }}>
            <h3 style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Commission Tiers</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
              {[
                { tier: "Bronze", rate: "10%", range: "0-50 bookings", color: "#cd7f32" },
                { tier: "Silver", rate: "12%", range: "51-200 bookings", color: "#c0c0c0" },
                { tier: "Gold", rate: "15%", range: "201-500 bookings", color: "#ffd700" },
                { tier: "Platinum", rate: "18%", range: "501+ bookings", color: "#e5e4e2" },
              ].map((t) => (
                <div key={t.tier} style={{ border: `1px solid ${t.color}40`, borderRadius: "0.375rem", padding: "0.75rem", textAlign: "center" }}>
                  <p style={{ color: t.color, fontWeight: 700, fontSize: "0.875rem" }}>{t.tier}</p>
                  <p style={{ color: "#e2e8f0", fontSize: "1.125rem", fontWeight: 700 }}>{t.rate}</p>
                  <p style={{ color: "#64748b", fontSize: "0.6875rem" }}>{t.range}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "distribution" && (
        <div style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1.5rem" }}>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>Distribution Configuration</h2>
          <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Configure how you receive rate/availability updates from the GDS.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1rem" }}>
            {[
              { type: "API", desc: "REST API push to your endpoint", icon: "🔌" },
              { type: "Streaming", desc: "Real-time Kafka/Fluvio feed", icon: "📡" },
              { type: "Webhook", desc: "HTTP webhook on rate changes", icon: "🔔" },
              { type: "Batch", desc: "Scheduled file export (CSV/JSON)", icon: "📁" },
            ].map((ch) => (
              <div key={ch.type} style={{ border: "1px solid #334155", borderRadius: "0.375rem", padding: "1rem", cursor: "pointer" }}>
                <p style={{ fontSize: "1.5rem" }}>{ch.icon}</p>
                <p style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "0.875rem" }}>{ch.type}</p>
                <p style={{ color: "#64748b", fontSize: "0.75rem" }}>{ch.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "analytics" && (
        <div style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1.5rem" }}>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>Agent Performance</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
            {[
              { label: "Performance Score", value: "0" },
              { label: "Conversion Rate", value: "0%" },
              { label: "Avg Booking Value", value: "$0" },
              { label: "Cancellation Rate", value: "0%" },
            ].map((m) => (
              <div key={m.label} style={{ border: "1px solid #334155", borderRadius: "0.375rem", padding: "1rem", textAlign: "center" }}>
                <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{m.label}</p>
                <p style={{ color: "#e2e8f0", fontSize: "1.25rem", fontWeight: 700 }}>{m.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
