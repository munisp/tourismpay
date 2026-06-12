/**
 * GDS Property Manager Dashboard — Property owners manage their listing,
 * rates, availability, and view distribution analytics.
 */
import { useState } from "react";

type PMTab = "overview" | "rates" | "availability" | "distribution" | "revenue";

export default function GDSPropertyManager() {
  const [activeTab, setActiveTab] = useState<PMTab>("overview");

  const tabs: { id: PMTab; label: string }[] = [
    { id: "overview", label: "Property Overview" },
    { id: "rates", label: "Rate Management" },
    { id: "availability", label: "Availability" },
    { id: "distribution", label: "Distribution" },
    { id: "revenue", label: "Revenue & Analytics" },
  ];

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e2e8f0" }}>
          GDS Property Manager
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
          Manage your property listing, rates, and distribution across the Africa GDS network.
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

      {activeTab === "overview" && (
        <div>
          {/* Property Registration Form */}
          <div style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1.5rem", marginBottom: "1.5rem" }}>
            <h2 style={{ color: "#e2e8f0", fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>Register Your Property</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Property Name</label>
                <input type="text" placeholder="e.g. Serena Safari Lodge" style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f0f1a", color: "#e2e8f0" }} />
              </div>
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Property Type</label>
                <select style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f0f1a", color: "#e2e8f0" }}>
                  <option value="hotel">Hotel</option>
                  <option value="lodge">Lodge</option>
                  <option value="safari_camp">Safari Camp</option>
                  <option value="resort">Resort</option>
                  <option value="boutique">Boutique Hotel</option>
                  <option value="guesthouse">Guesthouse</option>
                  <option value="villa">Villa</option>
                  <option value="tented_camp">Tented Camp</option>
                  <option value="treehouse">Tree House</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Country</label>
                <select style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f0f1a", color: "#e2e8f0" }}>
                  {[
                    "Kenya", "South Africa", "Tanzania", "Nigeria", "Ghana",
                    "Rwanda", "Uganda", "Ethiopia", "Morocco", "Egypt",
                    "Botswana", "Namibia", "Zimbabwe", "Mauritius", "Mozambique",
                  ].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Star Rating</label>
                <select style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f0f1a", color: "#e2e8f0" }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <option key={s} value={s}>{s} Star{s > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Currency</label>
                <select style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f0f1a", color: "#e2e8f0" }}>
                  {["USD", "KES", "ZAR", "NGN", "GHS", "TZS", "UGX", "RWF", "EUR", "GBP"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Agent Commission %</label>
                <input type="number" min={5} max={30} defaultValue={15} style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f0f1a", color: "#e2e8f0" }} />
              </div>
            </div>
            <button style={{ marginTop: "1.25rem", padding: "0.625rem 1.5rem", background: "#6366f1", color: "#fff", border: "none", borderRadius: "0.375rem", cursor: "pointer", fontWeight: 600 }}>
              Register Property
            </button>
          </div>

          {/* Room Types */}
          <div style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1.5rem" }}>
            <h3 style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Room Types</h3>
            <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
              Register your property above to manage room types, amenities, and images.
            </p>
          </div>
        </div>
      )}

      {activeTab === "rates" && (
        <div style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1.5rem" }}>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>Rate Plans</h2>
          <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Set base rates, seasonal adjustments, and meal plan pricing.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1rem" }}>
            {[
              { plan: "Best Available Rate (BAR)", desc: "Standard flexible rate", meal: "Room Only" },
              { plan: "Bed & Breakfast", desc: "Rate including breakfast", meal: "BB" },
              { plan: "Full Board", desc: "All meals included", meal: "FB" },
              { plan: "All Inclusive", desc: "Meals + drinks + activities", meal: "AI" },
            ].map((rp) => (
              <div key={rp.plan} style={{ border: "1px solid #334155", borderRadius: "0.375rem", padding: "1rem" }}>
                <p style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "0.875rem" }}>{rp.plan}</p>
                <p style={{ color: "#64748b", fontSize: "0.75rem" }}>{rp.desc}</p>
                <p style={{ color: "#6366f1", fontSize: "0.75rem", marginTop: "0.25rem" }}>Meal: {rp.meal}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "availability" && (
        <div style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1.5rem" }}>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>Availability Calendar</h2>
          <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Set available rooms per date. Close dates to arrival/departure as needed.
          </p>
          <div style={{ border: "1px solid #334155", borderRadius: "0.375rem", padding: "1rem", textAlign: "center" }}>
            <p style={{ color: "#64748b" }}>Calendar view — register a property to manage daily availability.</p>
          </div>
        </div>
      )}

      {activeTab === "distribution" && (
        <div style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1.5rem" }}>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>Distribution Channels</h2>
          <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Your property is distributed to travel agents via these channels:
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
            {[
              { channel: "GDS Direct", agents: "All GDS agents", status: "Active" },
              { channel: "Sabre", agents: "400K+ agencies", status: "Pending" },
              { channel: "Amadeus", agents: "300K+ agencies", status: "Pending" },
              { channel: "Expedia", agents: "Consumer + affiliates", status: "Pending" },
              { channel: "Booking.com", agents: "Consumer direct", status: "Pending" },
              { channel: "Little Emperors", agents: "Luxury flash sales", status: "Pending" },
            ].map((ch) => (
              <div key={ch.channel} style={{ border: "1px solid #334155", borderRadius: "0.375rem", padding: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "0.875rem" }}>{ch.channel}</p>
                  <span style={{ fontSize: "0.6875rem", padding: "0.125rem 0.5rem", borderRadius: "9999px", background: ch.status === "Active" ? "#065f4620" : "#1e293b", color: ch.status === "Active" ? "#10b981" : "#64748b" }}>
                    {ch.status}
                  </span>
                </div>
                <p style={{ color: "#64748b", fontSize: "0.75rem" }}>{ch.agents}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "revenue" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            {[
              { label: "Total Revenue", value: "$0", period: "This month" },
              { label: "Bookings", value: "0", period: "This month" },
              { label: "Occupancy", value: "0%", period: "This month" },
              { label: "RevPAR", value: "$0", period: "This month" },
              { label: "ADR", value: "$0", period: "Average daily rate" },
            ].map((stat) => (
              <div key={stat.label} style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1rem" }}>
                <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{stat.label}</p>
                <p style={{ color: "#e2e8f0", fontSize: "1.25rem", fontWeight: 700 }}>{stat.value}</p>
                <p style={{ color: "#64748b", fontSize: "0.6875rem" }}>{stat.period}</p>
              </div>
            ))}
          </div>
          <div style={{ background: "#1a1a2e", borderRadius: "0.5rem", padding: "1.5rem" }}>
            <h3 style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>Revenue Forecast</h3>
            <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
              ML-powered demand forecasting predicts revenue for the next 30 days based on seasonality, booking patterns, and market trends.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
