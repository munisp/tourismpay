/**
 * Africa GDS — Standalone White-Label Frontend
 * Configurable branding, independent of TourismPay platform.
 */
import { useState } from "react";

// White-label config (loaded from env/config at build time)
const BRAND = {
  name: "Africa GDS",
  primaryColor: "#6366f1",
  apiUrl: "http://localhost:8090",
};

type View = "search" | "bookings" | "agents" | "properties" | "analytics";

export default function App() {
  const [view, setView] = useState<View>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [country, setCountry] = useState("");

  const countries = [
    { code: "KE", name: "Kenya" }, { code: "ZA", name: "South Africa" },
    { code: "TZ", name: "Tanzania" }, { code: "NG", name: "Nigeria" },
    { code: "GH", name: "Ghana" }, { code: "RW", name: "Rwanda" },
    { code: "UG", name: "Uganda" }, { code: "ET", name: "Ethiopia" },
    { code: "MA", name: "Morocco" }, { code: "EG", name: "Egypt" },
    { code: "BW", name: "Botswana" }, { code: "NA", name: "Namibia" },
    { code: "ZW", name: "Zimbabwe" }, { code: "MU", name: "Mauritius" },
    { code: "MZ", name: "Mozambique" }, { code: "SN", name: "Senegal" },
    { code: "CI", name: "Ivory Coast" }, { code: "CM", name: "Cameroon" },
    { code: "TN", name: "Tunisia" }, { code: "MG", name: "Madagascar" },
  ];

  const navItems: { id: View; label: string }[] = [
    { id: "search", label: "Search" },
    { id: "bookings", label: "Bookings" },
    { id: "agents", label: "Agents" },
    { id: "properties", label: "Properties" },
    { id: "analytics", label: "Analytics" },
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{ background: "#1a1a2e", padding: "1rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #334155" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: BRAND.primaryColor }}>{BRAND.name}</h1>
        <nav style={{ display: "flex", gap: "0.5rem" }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.375rem",
                border: "none",
                background: view === item.id ? BRAND.primaryColor : "transparent",
                color: view === item.id ? "#fff" : "#94a3b8",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: "2rem", maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
        {view === "search" && (
          <div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>
              Discover African Tourism
            </h2>
            <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>
              Search hotels, lodges, safari camps, and activities across 20 African countries.
            </p>

            {/* Search Bar */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.75rem", marginBottom: "2rem" }}>
              <input
                type="text"
                placeholder="Search destinations, properties..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: "0.75rem 1rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#1a1a2e", color: "#e2e8f0", fontSize: "1rem" }}
              />
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                style={{ padding: "0.75rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#1a1a2e", color: "#e2e8f0" }}
              >
                <option value="">All Countries</option>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
              <button style={{ padding: "0.75rem 1.5rem", background: BRAND.primaryColor, color: "#fff", border: "none", borderRadius: "0.375rem", cursor: "pointer", fontWeight: 600 }}>
                Search
              </button>
            </div>

            {/* Trending */}
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", color: "#94a3b8" }}>Trending Destinations</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                {[
                  { dest: "Masai Mara", country: "Kenya", type: "Safari" },
                  { dest: "Zanzibar", country: "Tanzania", type: "Beach" },
                  { dest: "Cape Town", country: "South Africa", type: "City" },
                  { dest: "Victoria Falls", country: "Zimbabwe", type: "Adventure" },
                  { dest: "Marrakech", country: "Morocco", type: "Culture" },
                  { dest: "Okavango Delta", country: "Botswana", type: "Wilderness" },
                ].map((d) => (
                  <div key={d.dest} style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1.25rem", border: "1px solid #334155", cursor: "pointer" }}>
                    <p style={{ fontWeight: 600, fontSize: "0.875rem" }}>{d.dest}</p>
                    <p style={{ color: "#64748b", fontSize: "0.75rem" }}>{d.country} — {d.type}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === "bookings" && (
          <div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>My Reservations</h2>
            <div style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "2rem", textAlign: "center" }}>
              <p style={{ color: "#64748b" }}>No reservations yet. Search and book properties.</p>
            </div>
          </div>
        )}

        {view === "agents" && (
          <div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>Agent Portal</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
              {[
                { label: "Commission Rate", value: "10%", desc: "Bronze tier" },
                { label: "Total Bookings", value: "0", desc: "Lifetime" },
                { label: "Pending Payout", value: "$0.00", desc: "Next cycle" },
              ].map((s) => (
                <div key={s.label} style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1rem" }}>
                  <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{s.label}</p>
                  <p style={{ fontSize: "1.25rem", fontWeight: 700 }}>{s.value}</p>
                  <p style={{ color: "#64748b", fontSize: "0.6875rem" }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "properties" && (
          <div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>Property Management</h2>
            <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>Register and manage your tourism properties in the GDS network.</p>
            <div style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "2rem", textAlign: "center" }}>
              <p style={{ color: "#64748b" }}>Register a property to start distributing rates and availability.</p>
              <button style={{ marginTop: "1rem", padding: "0.625rem 1.25rem", background: BRAND.primaryColor, color: "#fff", border: "none", borderRadius: "0.375rem", cursor: "pointer" }}>
                Register Property
              </button>
            </div>
          </div>
        )}

        {view === "analytics" && (
          <div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>Market Analytics</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
              {[
                { label: "Properties Listed", value: "0", desc: "Active in GDS" },
                { label: "Connected Agents", value: "0", desc: "Active" },
                { label: "Bookings Today", value: "0", desc: "All markets" },
                { label: "Revenue (MTD)", value: "$0", desc: "Month to date" },
              ].map((m) => (
                <div key={m.label} style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1rem" }}>
                  <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{m.label}</p>
                  <p style={{ fontSize: "1.25rem", fontWeight: 700 }}>{m.value}</p>
                  <p style={{ color: "#64748b", fontSize: "0.6875rem" }}>{m.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ background: "#1a1a2e", padding: "1rem 2rem", borderTop: "1px solid #334155", textAlign: "center" }}>
        <p style={{ color: "#64748b", fontSize: "0.75rem" }}>
          {BRAND.name} — African Tourism Distribution • 20 Countries • {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
