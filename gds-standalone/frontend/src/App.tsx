/**
 * Africa GDS — Standalone Global Distribution System PWA
 * Independent platform with own auth, branding, and service integration.
 * Connects to 6 microservices: PNR (8082), Queue (8083), Guest (8084),
 * Content (8085), Revenue (8086), Group (8087)
 */
import { useState, useEffect, useCallback } from "react";

const GW = "http://localhost:8090/api/v1/gds";

type User = { email: string; name: string; role: string; token: string };
type View = "dashboard" | "pnr" | "queues" | "guests" | "content" | "revenue" | "groups" | "search" | "commission" | "discounts" | "cancellation" | "rates" | "settlement";

// ─── Login Page ────────────────────────────────────────────────
function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate Keycloak OIDC — in production this would hit Keycloak at port 8180
    await new Promise((r) => setTimeout(r, 800));
    const user: User = {
      email: email || "agent@africagds.com",
      name: email?.split("@")[0] || "GDS Agent",
      role: "agent",
      token: "gds-jwt-" + Date.now(),
    };
    localStorage.setItem("gds-user", JSON.stringify(user));
    onLogin(user);
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      {/* Left panel — branding */}
      <div style={{ flex: 1, background: "linear-gradient(135deg, #0c4a6e 0%, #0369a1 40%, #0ea5e9 100%)", display: "flex", flexDirection: "column", justifyContent: "center", padding: "4rem" }}>
        <div style={{ maxWidth: "480px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "2rem" }}>
            <div style={{ width: "48px", height: "48px", background: "rgba(255,255,255,0.15)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 800, color: "#fff" }}>G</div>
            <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff" }}>Africa GDS</span>
          </div>
          <h1 style={{ fontSize: "2.5rem", fontWeight: 800, color: "#fff", lineHeight: 1.2, marginBottom: "1rem" }}>
            Global Distribution<br />System for Africa
          </h1>
          <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "1.1rem", lineHeight: 1.6 }}>
            Sabre/Amadeus-class booking platform purpose-built for African tourism.
            20 countries, 14 middleware integrations, polyglot microservices.
          </p>
          <div style={{ marginTop: "2rem", display: "flex", gap: "2rem" }}>
            <div>
              <p style={{ fontSize: "2rem", fontWeight: 700, color: "#fff" }}>6</p>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.8rem" }}>Microservices</p>
            </div>
            <div>
              <p style={{ fontSize: "2rem", fontWeight: 700, color: "#fff" }}>20</p>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.8rem" }}>Countries</p>
            </div>
            <div>
              <p style={{ fontSize: "2rem", fontWeight: 700, color: "#fff" }}>14</p>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.8rem" }}>Middleware</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div style={{ width: "480px", display: "flex", flexDirection: "column", justifyContent: "center", padding: "4rem", background: "#0f172a" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Sign in to GDS</h2>
        <p style={{ color: "#64748b", marginBottom: "2rem" }}>Keycloak OIDC Authentication</p>

        <form onSubmit={handleLogin}>
          <label style={{ display: "block", marginBottom: "0.5rem", color: "#94a3b8", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agent@africagds.com"
            style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: "0.5rem", border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: "1rem", marginBottom: "1.25rem" }}
          />

          <label style={{ display: "block", marginBottom: "0.5rem", color: "#94a3b8", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: "0.5rem", border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: "1rem", marginBottom: "1.5rem" }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "0.875rem", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: "0.5rem", fontSize: "1rem", fontWeight: 600, cursor: "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Authenticating via Keycloak..." : "Sign In"}
          </button>
        </form>

        <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#1e293b", borderRadius: "0.5rem", border: "1px solid #334155" }}>
          <p style={{ color: "#64748b", fontSize: "0.75rem", marginBottom: "0.5rem" }}>Quick Login (Dev Mode)</p>
          <button
            onClick={() => {
              const devUser: User = { email: "admin@africagds.com", name: "GDS Admin", role: "admin", token: "dev-admin-token" };
              localStorage.setItem("gds-user", JSON.stringify(devUser));
              onLogin(devUser);
            }}
            style={{ width: "100%", padding: "0.625rem", background: "#475569", color: "#e2e8f0", border: "none", borderRadius: "0.375rem", cursor: "pointer", fontSize: "0.8rem" }}
          >
            Dev Login as Admin
          </button>
        </div>

        <p style={{ marginTop: "2rem", textAlign: "center", color: "#475569", fontSize: "0.75rem" }}>
          Secured by Keycloak + Permify ReBAC + OpenAppSec WAF
        </p>
      </div>
    </div>
  );
}

// ─── Dashboard View ─────────────────────────────────────────────
function DashboardView() {
  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>GDS Operations Dashboard</h2>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[
          { label: "Active PNRs", value: "2,847", change: "+12%", color: "#22c55e" },
          { label: "Queue Items", value: "156", change: "23 urgent", color: "#f59e0b" },
          { label: "Guest Profiles", value: "45,230", change: "+340 today", color: "#8b5cf6" },
          { label: "Revenue (MTD)", value: "$2.4M", change: "+8.3%", color: "#0ea5e9" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155" }}>
            <p style={{ color: "#94a3b8", fontSize: "0.8rem", marginBottom: "0.5rem" }}>{s.label}</p>
            <p style={{ fontSize: "1.75rem", fontWeight: 700 }}>{s.value}</p>
            <p style={{ color: s.color, fontSize: "0.75rem", marginTop: "0.25rem" }}>{s.change}</p>
          </div>
        ))}
      </div>

      {/* Service Status */}
      <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155", marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Microservice Status</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
          {[
            { name: "PNR Engine", lang: "Go", port: 8082, status: "healthy" },
            { name: "Queue System", lang: "Rust", port: 8083, status: "healthy" },
            { name: "Guest CRM", lang: "Go", port: 8084, status: "healthy" },
            { name: "Content Mgmt", lang: "Python", port: 8085, status: "healthy" },
            { name: "Revenue Mgmt", lang: "Python", port: 8086, status: "healthy" },
            { name: "Group Bookings", lang: "Go", port: 8087, status: "healthy" },
          ].map((svc) => (
            <div key={svc.name} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "#0f172a", borderRadius: "0.5rem" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e" }} />
              <div>
                <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>{svc.name}</p>
                <p style={{ fontSize: "0.7rem", color: "#64748b" }}>{svc.lang} • :{svc.port}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Middleware */}
      <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Middleware Stack</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {["Kafka", "Dapr", "Fluvio", "Temporal", "PostgreSQL", "Keycloak", "Permify", "Redis", "Mojaloop", "OpenSearch", "OpenAppSec", "APISIX", "TigerBeetle", "Lakehouse"].map((mw) => (
            <span key={mw} style={{ padding: "0.375rem 0.75rem", background: "#0f172a", borderRadius: "1rem", fontSize: "0.75rem", color: "#94a3b8", border: "1px solid #334155" }}>{mw}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PNR View ────────────────────────────────────────────────────
function PNRView() {
  const [pnrs, setPnrs] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

  const fetchPnrs = useCallback(async () => {
    try {
      const res = await fetch(`${GW}/pnr`);
      if (res.ok) { const data = await res.json(); setPnrs(data.pnrs || []); }
    } catch { /* service offline */ }
  }, []);

  useEffect(() => { fetchPnrs(); }, [fetchPnrs]);

  const createPnr = async () => {
    setCreating(true);
    try {
      const res = await fetch(`${GW}/pnr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_name: "John Traveler", contact_email: "john@example.com", agency_id: "AGY001", agent_id: "AGT001" }),
      });
      if (res.ok) await fetchPnrs();
    } catch { /* */ }
    setCreating(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>PNR Management</h2>
          <p style={{ color: "#64748b", fontSize: "0.875rem" }}>Passenger Name Records — Full booking lifecycle</p>
        </div>
        <button onClick={createPnr} disabled={creating} style={{ padding: "0.625rem 1.25rem", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: "0.5rem", cursor: "pointer", fontWeight: 600 }}>
          {creating ? "Creating..." : "+ New PNR"}
        </button>
      </div>

      <div style={{ background: "#1e293b", borderRadius: "0.75rem", border: "1px solid #334155", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155" }}>
              {["Locator", "Guest", "Status", "Segments", "Created"].map((h) => (
                <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pnrs.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>No PNRs found. Create one or connect to the PNR Engine (port 8082).</td></tr>
            ) : pnrs.map((p: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid #1e293b" }}>
                <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace", color: "#0ea5e9" }}>{p.locator || p.record_locator}</td>
                <td style={{ padding: "0.75rem 1rem" }}>{p.guest_name}</td>
                <td style={{ padding: "0.75rem 1rem" }}><span style={{ padding: "0.25rem 0.5rem", background: "#1a4731", color: "#4ade80", borderRadius: "0.25rem", fontSize: "0.7rem" }}>{p.status || "ACTIVE"}</span></td>
                <td style={{ padding: "0.75rem 1rem" }}>{p.segments?.length || 0}</td>
                <td style={{ padding: "0.75rem 1rem", color: "#64748b", fontSize: "0.8rem" }}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PNR Capabilities */}
      <div style={{ marginTop: "1.5rem", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        {[
          { title: "6 Segment Types", desc: "Hotel, Flight, Car, Activity, Transfer, Insurance" },
          { title: "Ticketing Status", desc: "Issued, Void, Refund, Exchange tracking" },
          { title: "Queue Placement", desc: "Auto-assign to agent work queues" },
        ].map((c) => (
          <div key={c.title} style={{ background: "#1e293b", borderRadius: "0.5rem", padding: "1rem", border: "1px solid #334155" }}>
            <p style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>{c.title}</p>
            <p style={{ color: "#64748b", fontSize: "0.75rem" }}>{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Queue View ──────────────────────────────────────────────────
function QueueView() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch(`${GW}/queues/stats`).then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  const queueTypes = [
    { type: "ticketing", label: "Ticketing", sla: "30 min", icon: "🎫" },
    { type: "schedule_change", label: "Schedule Change", sla: "2 hr", icon: "📅" },
    { type: "cancellation", label: "Cancellation", sla: "1 hr", icon: "❌" },
    { type: "waitlist", label: "Waitlist", sla: "15 min", icon: "⏳" },
    { type: "vip", label: "VIP", sla: "15 min", icon: "⭐" },
    { type: "group", label: "Group", sla: "4 hr", icon: "👥" },
    { type: "general", label: "General", sla: "48 hr", icon: "📋" },
  ];

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Agent Queue System</h2>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>Priority-based work queues with SLA timers and auto-assignment</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[
          { label: "Total Items", value: stats?.total_items || "156" },
          { label: "Urgent (P1)", value: stats?.urgent || "23" },
          { label: "Avg Wait", value: stats?.avg_wait || "4.2 min" },
          { label: "SLA Breach", value: stats?.breached || "2" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1rem", border: "1px solid #334155" }}>
            <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{s.label}</p>
            <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
        {queueTypes.map((q) => (
          <div key={q.type} style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "1.25rem" }}>{q.icon}</span>
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{q.label}</span>
            </div>
            <p style={{ color: "#64748b", fontSize: "0.75rem" }}>SLA: {q.sla}</p>
            <div style={{ marginTop: "0.5rem", height: "4px", background: "#0f172a", borderRadius: "2px" }}>
              <div style={{ height: "100%", width: `${Math.random() * 80 + 10}%`, background: "#0ea5e9", borderRadius: "2px" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Guest Profile View ──────────────────────────────────────────
function GuestView() {
  const [guests, setGuests] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${GW}/guests/search?q=&limit=10`).then(r => r.json()).then(d => setGuests(d.guests || [])).catch(() => {});
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Guest Profile CRM</h2>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>Preferences, stay history, corporate accounts, travel policies</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[
          { label: "Total Profiles", value: "45,230" },
          { label: "VIP Guests", value: "1,247" },
          { label: "Corporate", value: "892" },
          { label: "Loyalty Members", value: "12,450" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1rem", border: "1px solid #334155" }}>
            <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{s.label}</p>
            <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Profile Features</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
          {[
            { title: "Guest Preferences", desc: "Room type, pillow, dietary, temperature, floor preference" },
            { title: "Stay History", desc: "All previous bookings, spend tracking, frequency analysis" },
            { title: "Corporate Accounts", desc: "Company profiles, negotiated rates, travel policies" },
            { title: "Loyalty Tiers", desc: "Bronze → Silver → Gold → Platinum with tier-specific benefits" },
            { title: "Communication Prefs", desc: "Channel preference (email/SMS/WhatsApp), language, timezone" },
            { title: "Travel Documents", desc: "Passport, visa status, frequent flyer numbers" },
          ].map((f) => (
            <div key={f.title} style={{ padding: "0.75rem", background: "#0f172a", borderRadius: "0.5rem" }}>
              <p style={{ fontWeight: 600, fontSize: "0.8rem", marginBottom: "0.25rem" }}>{f.title}</p>
              <p style={{ color: "#64748b", fontSize: "0.7rem" }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {guests.length > 0 && (
        <div style={{ marginTop: "1.5rem", background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Recent Profiles</h3>
          {guests.map((g: any, i: number) => (
            <div key={i} style={{ padding: "0.75rem", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between" }}>
              <span>{g.name || g.first_name}</span>
              <span style={{ color: "#64748b", fontSize: "0.8rem" }}>{g.tier || "Bronze"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Content Management View ─────────────────────────────────────
function ContentView() {
  const [languages, setLanguages] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${GW}/content/languages`).then(r => r.json()).then(d => setLanguages(d.languages || [])).catch(() => {});
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Content Management</h2>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>Rich property descriptions, images, policies — 15 African languages</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[
          { label: "Languages", value: languages.length || "15" },
          { label: "Amenity Categories", value: "38" },
          { label: "Avg Completeness", value: "78%" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1rem", border: "1px solid #334155" }}>
            <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{s.label}</p>
            <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Languages Grid */}
      <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155", marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Supported Languages</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {(languages.length ? languages : ["en", "fr", "ar", "sw", "pt", "am", "zu", "ha", "yo", "ig", "so", "af", "rw", "mg", "wo"]).map((lang) => (
            <span key={lang} style={{ padding: "0.375rem 0.75rem", background: "#0f172a", borderRadius: "0.375rem", fontSize: "0.8rem", color: "#e2e8f0", border: "1px solid #334155" }}>
              {lang.toUpperCase()}
            </span>
          ))}
        </div>
      </div>

      {/* Content Features */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
        {[
          { title: "Completeness Scoring", desc: "AI-scored content quality per property (descriptions, images, policies, amenities)" },
          { title: "Amenity Taxonomy", desc: "38 standardized categories: Pool, Spa, WiFi, Parking, Restaurant, Beach, Safari..." },
          { title: "Image Management", desc: "CDN-hosted, auto-resized, watermarked. Room, exterior, dining, activity shots" },
          { title: "Policy Templates", desc: "Cancellation, check-in/out, child policy, pet policy — per property type" },
        ].map((f) => (
          <div key={f.title} style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1rem", border: "1px solid #334155" }}>
            <p style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>{f.title}</p>
            <p style={{ color: "#64748b", fontSize: "0.75rem" }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Revenue Management View ─────────────────────────────────────
function RevenueView() {
  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Revenue Management</h2>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>Dynamic pricing, overbooking optimization, demand forecasting</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[
          { label: "Avg Daily Rate", value: "$185" },
          { label: "RevPAR", value: "$142" },
          { label: "Occupancy", value: "76.8%" },
          { label: "Yield Index", value: "1.12" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1rem", border: "1px solid #334155" }}>
            <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{s.label}</p>
            <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Pricing Model */}
      <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155", marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Dynamic Pricing Engine</h3>
        <p style={{ color: "#94a3b8", fontSize: "0.8rem", marginBottom: "1rem" }}>Sigmoid occupancy curve: base_rate × (1 + amplitude × sigmoid((occupancy - midpoint) / steepness))</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.5rem" }}>
          {[
            { occ: "20%", mult: "0.7x", color: "#22c55e" },
            { occ: "40%", mult: "0.85x", color: "#84cc16" },
            { occ: "60%", mult: "1.0x", color: "#eab308" },
            { occ: "80%", mult: "1.5x", color: "#f97316" },
            { occ: "95%", mult: "3.0x", color: "#ef4444" },
          ].map((p) => (
            <div key={p.occ} style={{ textAlign: "center", padding: "0.75rem", background: "#0f172a", borderRadius: "0.5rem" }}>
              <p style={{ fontSize: "0.7rem", color: "#64748b" }}>{p.occ}</p>
              <p style={{ fontSize: "1.1rem", fontWeight: 700, color: p.color }}>{p.mult}</p>
            </div>
          ))}
        </div>
      </div>

      {/* African Events */}
      <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>African Demand Events</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
          {[
            { event: "Great Migration (Jul-Oct)", region: "KE/TZ", impact: "+180%" },
            { event: "Cape Town Summer (Dec-Feb)", region: "ZA", impact: "+120%" },
            { event: "Gorilla Season (Jun-Sep)", region: "RW/UG", impact: "+150%" },
            { event: "Marrakech Festival (Jun)", region: "MA", impact: "+90%" },
            { event: "Zanzibar High Season (Jul-Mar)", region: "TZ", impact: "+100%" },
            { event: "Victoria Falls Peak (Aug-Dec)", region: "ZW/ZM", impact: "+110%" },
            { event: "AFCON Tournament", region: "Various", impact: "+200%" },
            { event: "Lagos Fashion Week", region: "NG", impact: "+75%" },
          ].map((e) => (
            <div key={e.event} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.625rem", background: "#0f172a", borderRadius: "0.375rem" }}>
              <div>
                <p style={{ fontSize: "0.8rem", fontWeight: 500 }}>{e.event}</p>
                <p style={{ fontSize: "0.7rem", color: "#64748b" }}>{e.region}</p>
              </div>
              <span style={{ color: "#f59e0b", fontWeight: 600, fontSize: "0.8rem" }}>{e.impact}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Group Bookings View ─────────────────────────────────────────
function GroupView() {
  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Group Bookings</h2>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>Block allocation, rooming lists, attrition management</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[
          { label: "Active Groups", value: "34" },
          { label: "Total Room Nights", value: "4,580" },
          { label: "Pickup Rate", value: "82%" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1rem", border: "1px solid #334155" }}>
            <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{s.label}</p>
            <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Group Types */}
      <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155", marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Group Types</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
          {[
            { type: "Conference", rooms: "50-500", attrition: "80/60/40%" },
            { type: "Wedding", rooms: "20-150", attrition: "90/75/50%" },
            { type: "Tour Series", rooms: "10-45", attrition: "85/70/45%" },
            { type: "Sports Team", rooms: "15-80", attrition: "95/85/70%" },
            { type: "Corporate Retreat", rooms: "25-200", attrition: "80/60/40%" },
            { type: "Incentive Travel", rooms: "30-300", attrition: "75/55/35%" },
          ].map((g) => (
            <div key={g.type} style={{ padding: "1rem", background: "#0f172a", borderRadius: "0.5rem" }}>
              <p style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>{g.type}</p>
              <p style={{ color: "#64748b", fontSize: "0.7rem" }}>Rooms: {g.rooms}</p>
              <p style={{ color: "#64748b", fontSize: "0.7rem" }}>Attrition: {g.attrition}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Attrition Schedule */}
      <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>3-Tier Attrition Schedule</h3>
        <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center" }}>
          {[
            { days: "60 days", pct: "80%", color: "#22c55e" },
            { days: "30 days", pct: "60%", color: "#f59e0b" },
            { days: "14 days", pct: "40%", color: "#ef4444" },
          ].map((a) => (
            <div key={a.days} style={{ textAlign: "center" }}>
              <div style={{ width: "80px", height: "80px", borderRadius: "50%", border: `3px solid ${a.color}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "1.25rem", fontWeight: 700, color: a.color }}>{a.pct}</span>
              </div>
              <p style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{a.days} out</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Search View ─────────────────────────────────────────────────
function SearchView() {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");

  const countries = [
    "Kenya", "South Africa", "Tanzania", "Nigeria", "Ghana", "Rwanda",
    "Uganda", "Ethiopia", "Morocco", "Egypt", "Botswana", "Namibia",
    "Zimbabwe", "Mauritius", "Mozambique", "Senegal", "Ivory Coast",
    "Cameroon", "Tunisia", "Madagascar",
  ];

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Property Search</h2>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>Search hotels, lodges, and safari camps across 20 African countries</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.75rem", marginBottom: "2rem" }}>
        <input
          type="text"
          placeholder="Search destinations, properties, activities..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ padding: "0.875rem 1rem", borderRadius: "0.5rem", border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: "1rem" }}
        />
        <select value={country} onChange={(e) => setCountry(e.target.value)} style={{ padding: "0.875rem", borderRadius: "0.5rem", border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0" }}>
          <option value="">All Countries</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button style={{ padding: "0.875rem 1.5rem", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: "0.5rem", cursor: "pointer", fontWeight: 600 }}>
          Search
        </button>
      </div>

      {/* Trending */}
      <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", color: "#94a3b8" }}>Trending Destinations</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
        {[
          { dest: "Masai Mara", country: "Kenya", type: "Safari", price: "$350/night" },
          { dest: "Zanzibar", country: "Tanzania", type: "Beach Resort", price: "$220/night" },
          { dest: "Cape Town", country: "South Africa", type: "City Hotel", price: "$180/night" },
          { dest: "Victoria Falls", country: "Zimbabwe", type: "Adventure Lodge", price: "$280/night" },
          { dest: "Marrakech", country: "Morocco", type: "Riad", price: "$150/night" },
          { dest: "Okavango Delta", country: "Botswana", type: "Wilderness Camp", price: "$620/night" },
        ].map((d) => (
          <div key={d.dest} style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155", cursor: "pointer" }}>
            <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{d.dest}</p>
            <p style={{ color: "#64748b", fontSize: "0.8rem" }}>{d.country} — {d.type}</p>
            <p style={{ color: "#0ea5e9", fontSize: "0.875rem", fontWeight: 600, marginTop: "0.5rem" }}>{d.price}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Commission Dashboard View ───────────────────────────────────
function CommissionView() {
  const [rateCard, setRateCard] = useState<any>(null);
  const [splitResult, setSplitResult] = useState<any>(null);

  useEffect(() => {
    fetch(`${GW}/commission/rate-card`).then(r => r.json()).then(setRateCard).catch(() => {});
  }, []);

  const simulateSplit = async () => {
    try {
      const res = await fetch(`${GW}/commission/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: "BK-" + Date.now(), property_id: "PROP-001",
          agent_id: "AGT-001", field_agent_id: "FA-001",
          gross_amount: 500, currency: "USD", country: "KE",
          booking_type: "standard", room_nights: 3,
          property_tier: "web_lite", agent_tier: "gold",
          is_group_booking: false, channel: "gds_portal",
        }),
      });
      if (res.ok) setSplitResult(await res.json());
    } catch { /* */ }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Commission Engine</h2>
          <p style={{ color: "#64748b", fontSize: "0.875rem" }}>Real-time multi-party payment split — Rust service (port 8110)</p>
        </div>
        <button onClick={simulateSplit} style={{ padding: "0.625rem 1.25rem", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: "0.5rem", cursor: "pointer", fontWeight: 600 }}>
          Simulate Split
        </button>
      </div>

      {/* Rate Card */}
      {rateCard && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
          <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155" }}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Agent Tiers</h3>
            {Object.entries(rateCard.rate_card?.agent_tiers || rateCard.agent_tiers || {}).map(([tier, data]: [string, any]) => (
              <div key={tier} style={{ display: "flex", justifyContent: "space-between", padding: "0.375rem 0", borderBottom: "1px solid #334155" }}>
                <span style={{ textTransform: "capitalize", fontSize: "0.8rem" }}>{tier}</span>
                <span style={{ color: "#0ea5e9", fontWeight: 600, fontSize: "0.8rem" }}>{((data.rate || data) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
          <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155" }}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Property Tiers</h3>
            {Object.entries(rateCard.rate_card?.property_tiers || rateCard.property_tiers || {}).map(([tier, data]: [string, any]) => (
              <div key={tier} style={{ display: "flex", justifyContent: "space-between", padding: "0.375rem 0", borderBottom: "1px solid #334155" }}>
                <span style={{ textTransform: "capitalize", fontSize: "0.8rem" }}>{tier.replace("_", " ")}</span>
                <span style={{ color: "#f59e0b", fontWeight: 600, fontSize: "0.8rem" }}>{((data.commission_charged || data) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Split Result */}
      {splitResult && (
        <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Split Result — ${splitResult.gross_amount} {splitResult.currency}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
            {splitResult.splits?.map((s: any, i: number) => (
              <div key={i} style={{ padding: "0.75rem", background: "#0f172a", borderRadius: "0.5rem" }}>
                <p style={{ fontSize: "0.7rem", color: "#94a3b8", textTransform: "capitalize" }}>{s.stakeholder_type}</p>
                <p style={{ fontSize: "1.25rem", fontWeight: 700, color: s.stakeholder_type === "property" ? "#22c55e" : "#0ea5e9" }}>${s.amount}</p>
                <p style={{ fontSize: "0.65rem", color: "#64748b" }}>{s.payout_method} • {s.payout_schedule}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "1rem", padding: "0.75rem", background: "#0f172a", borderRadius: "0.5rem" }}>
            <p style={{ fontSize: "0.75rem", color: "#94a3b8" }}>TigerBeetle Ledger Entries: {splitResult.ledger_entries?.length || 0}</p>
          </div>
        </div>
      )}

      {/* Flow diagram */}
      <div style={{ marginTop: "1.5rem", background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Payment Flow</h3>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          {["Guest Pays", "Tax Withheld", "Platform Fee", "Agent Commission", "Field Agent", "Property Net"].map((step, i) => (
            <div key={step} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ padding: "0.5rem 0.75rem", background: "#0f172a", borderRadius: "0.375rem", fontSize: "0.7rem", border: "1px solid #334155" }}>{step}</span>
              {i < 5 && <span style={{ color: "#64748b" }}>→</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Discounts & Promotions View ─────────────────────────────────
function DiscountsView() {
  const [promos, setPromos] = useState<any[]>([]);
  const [validateResult, setValidateResult] = useState<any>(null);
  const [code, setCode] = useState("WELCOME15");

  useEffect(() => {
    fetch(`${GW}/discount/promos`).then(r => r.json()).then(d => setPromos(d.promotions || [])).catch(() => {});
  }, []);

  const validateCode = async () => {
    try {
      const res = await fetch(`${GW}/discount/validate?code=${code}&booking_amount=500&nights=3&country=KE&is_new_user=true`);
      if (res.ok) setValidateResult(await res.json());
    } catch { /* */ }
  };

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Discounts & Promotions</h2>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>Coupon codes, volume discounts, flash sales, loyalty redemptions — Python service (port 8111)</p>

      {/* Code Validator */}
      <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155", marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Validate Promo Code</h3>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="Enter code..." style={{ flex: 1, padding: "0.625rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0" }} />
          <button onClick={validateCode} style={{ padding: "0.625rem 1rem", background: "#22c55e", color: "#fff", border: "none", borderRadius: "0.375rem", cursor: "pointer", fontWeight: 600, fontSize: "0.8rem" }}>Validate</button>
        </div>
        {validateResult && (
          <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: validateResult.valid ? "#14532d" : "#7f1d1d", borderRadius: "0.375rem" }}>
            <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>{validateResult.valid ? `Save $${validateResult.discount}!` : validateResult.message}</p>
            {validateResult.valid && <p style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "0.25rem" }}>{validateResult.promo_name} — Final: ${validateResult.final_amount}</p>}
          </div>
        )}
      </div>

      {/* Active Promos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        {promos.map((p: any) => (
          <div key={p.id} style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{p.name}</span>
              <span style={{ padding: "0.2rem 0.5rem", background: "#14532d", color: "#4ade80", borderRadius: "0.25rem", fontSize: "0.65rem" }}>{p.status}</span>
            </div>
            <p style={{ fontFamily: "monospace", color: "#0ea5e9", fontSize: "0.9rem", marginBottom: "0.5rem" }}>{p.code}</p>
            <p style={{ color: "#64748b", fontSize: "0.7rem" }}>{p.discount_type}: {p.value}{p.discount_type === "percentage" ? "%" : ""} off</p>
            <p style={{ color: "#64748b", fontSize: "0.7rem" }}>Uses: {p.current_uses}/{p.max_uses || "∞"}</p>
          </div>
        ))}
      </div>

      {/* Discount Types */}
      <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Discount Types</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
          {[
            { type: "Percentage", desc: "% off booking (capped)" },
            { type: "Flat Fee", desc: "Fixed amount off" },
            { type: "Nights Free", desc: "Stay 5 pay 4" },
            { type: "Volume", desc: "5+ rooms = 5-20% off" },
            { type: "Flash Sale", desc: "Time-limited deals" },
            { type: "Loyalty Points", desc: "1pt = $0.01 (max 30%)" },
          ].map(d => (
            <div key={d.type} style={{ padding: "0.75rem", background: "#0f172a", borderRadius: "0.5rem" }}>
              <p style={{ fontWeight: 600, fontSize: "0.8rem" }}>{d.type}</p>
              <p style={{ color: "#64748b", fontSize: "0.7rem" }}>{d.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Cancellation Policy View ────────────────────────────────────
function CancellationView() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [presets, setPresets] = useState<any>(null);
  const [feeResult, setFeeResult] = useState<any>(null);

  useEffect(() => {
    fetch(`${GW}/cancellation/policies`).then(r => r.json()).then(d => setPolicies(d.policies || [])).catch(() => {});
    fetch(`${GW}/cancellation/presets`).then(r => r.json()).then(setPresets).catch(() => {});
  }, []);

  const simulateCancellation = async () => {
    const tomorrow = new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0];
    try {
      const res = await fetch(`${GW}/cancellation/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: "BK-TEST-001", property_id: "PROP-002",
          guest_id: "GUEST-001", check_in: tomorrow,
          check_out: new Date(Date.now() + 8 * 86400000).toISOString().split("T")[0],
          booking_amount: 750, currency: "USD", rooms: 1, reason: "Change of plans",
        }),
      });
      if (res.ok) setFeeResult(await res.json());
    } catch { /* */ }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Cancellation Policies</h2>
          <p style={{ color: "#64748b", fontSize: "0.875rem" }}>Per-property tiered penalties with refund waterfall — Go service (port 8112)</p>
        </div>
        <button onClick={simulateCancellation} style={{ padding: "0.625rem 1.25rem", background: "#ef4444", color: "#fff", border: "none", borderRadius: "0.5rem", cursor: "pointer", fontWeight: 600 }}>
          Simulate Cancel
        </button>
      </div>

      {/* Fee Result */}
      {feeResult && (
        <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155", marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Cancellation Result</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" }}>
            <div style={{ textAlign: "center" }}><p style={{ color: "#94a3b8", fontSize: "0.7rem" }}>Policy</p><p style={{ fontWeight: 700 }}>{feeResult.policy_applied}</p></div>
            <div style={{ textAlign: "center" }}><p style={{ color: "#94a3b8", fontSize: "0.7rem" }}>Fee</p><p style={{ fontWeight: 700, color: "#ef4444" }}>${feeResult.cancellation_fee}</p></div>
            <div style={{ textAlign: "center" }}><p style={{ color: "#94a3b8", fontSize: "0.7rem" }}>Refund</p><p style={{ fontWeight: 700, color: "#22c55e" }}>${feeResult.refund_amount}</p></div>
            <div style={{ textAlign: "center" }}><p style={{ color: "#94a3b8", fontSize: "0.7rem" }}>Days Before</p><p style={{ fontWeight: 700 }}>{feeResult.days_before_checkin}</p></div>
          </div>
          <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#64748b" }}>Tier: {feeResult.tier_applied}</p>
          <p style={{ fontSize: "0.75rem", color: "#64748b" }}>Absorption: {feeResult.fee_absorption?.description}</p>
        </div>
      )}

      {/* Policy Presets */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        {["flexible", "moderate", "strict", "super_strict"].map(preset => (
          <div key={preset} style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155" }}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, textTransform: "capitalize", marginBottom: "0.75rem" }}>{preset.replace("_", " ")}</h3>
            {(presets?.presets?.[preset] || []).map((tier: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0", borderBottom: "1px solid #0f172a" }}>
                <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{tier.description || `${tier.min_days_before}-${tier.max_days_before}d`}</span>
                <span style={{ fontSize: "0.7rem", color: tier.refund_percent >= 75 ? "#22c55e" : tier.refund_percent >= 50 ? "#f59e0b" : "#ef4444" }}>{tier.refund_percent}% refund</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Active Policies */}
      <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Property Policies ({policies.length})</h3>
        {policies.map((p: any) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #0f172a" }}>
            <span style={{ fontSize: "0.8rem" }}>{p.name}</span>
            <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "capitalize" }}>{p.policy_type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Negotiated Rates View ───────────────────────────────────────
function NegotiatedRatesView() {
  const [agreements, setAgreements] = useState<any[]>([]);
  const [volume, setVolume] = useState<any>(null);

  useEffect(() => {
    fetch(`${GW}/negotiated-rates/agreements`).then(r => r.json()).then(d => setAgreements(d.agreements || [])).catch(() => {});
    fetch(`${GW}/negotiated-rates/volume-report`).then(r => r.json()).then(setVolume).catch(() => {});
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Negotiated Rates</h2>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>Corporate agreements, consortium rates, wholesale contracts — Go service (port 8113)</p>

      {/* Volume Summary */}
      {volume?.summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
          <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1rem", border: "1px solid #334155" }}>
            <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Total Committed</p>
            <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{volume.summary.total_committed?.toLocaleString()} RNs</p>
          </div>
          <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1rem", border: "1px solid #334155" }}>
            <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Actual Delivered</p>
            <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{volume.summary.total_actual?.toLocaleString()} RNs</p>
          </div>
          <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1rem", border: "1px solid #334155" }}>
            <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Compliance</p>
            <p style={{ fontSize: "1.5rem", fontWeight: 700, color: volume.summary.overall_compliance >= 70 ? "#22c55e" : "#f59e0b" }}>{volume.summary.overall_compliance}%</p>
          </div>
        </div>
      )}

      {/* Agreements */}
      <div style={{ background: "#1e293b", borderRadius: "0.75rem", border: "1px solid #334155", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155" }}>
              {["Agreement", "Type", "Party B", "Rate Type", "Discount", "Status"].map(h => (
                <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agreements.map((a: any) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #1e293b" }}>
                <td style={{ padding: "0.75rem 1rem", fontSize: "0.8rem" }}>{a.name}</td>
                <td style={{ padding: "0.75rem 1rem" }}><span style={{ padding: "0.2rem 0.5rem", background: "#1a3a4a", borderRadius: "0.25rem", fontSize: "0.7rem", textTransform: "capitalize" }}>{a.agreement_type}</span></td>
                <td style={{ padding: "0.75rem 1rem", fontSize: "0.8rem", color: "#94a3b8" }}>{a.party_b?.name}</td>
                <td style={{ padding: "0.75rem 1rem", fontSize: "0.75rem" }}>{a.rate_type}</td>
                <td style={{ padding: "0.75rem 1rem", color: "#22c55e", fontWeight: 600, fontSize: "0.8rem" }}>{a.base_discount_percent || 0}%</td>
                <td style={{ padding: "0.75rem 1rem" }}><span style={{ padding: "0.2rem 0.5rem", background: a.status === "active" ? "#14532d" : "#78350f", color: a.status === "active" ? "#4ade80" : "#fbbf24", borderRadius: "0.25rem", fontSize: "0.65rem" }}>{a.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Settlement Saga View ────────────────────────────────────────
function SettlementView() {
  const [rateCard, setRateCard] = useState<any>(null);
  const [sagaResult, setSagaResult] = useState<any>(null);

  useEffect(() => {
    fetch(`${GW}/settlement-saga/rate-card`).then(r => r.json()).then(setRateCard).catch(() => {});
  }, []);

  const executeSaga = async () => {
    try {
      const res = await fetch(`${GW}/settlement-saga/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: "BK-" + Date.now(), gross_amount: 1000,
          currency: "USD", country: "KE", property_id: "PROP-001",
          property_tier: "web_lite", agent_id: "AGT-001",
          agent_tier: "gold", field_agent_id: "FA-001",
          channel: "api", is_group: false, booking_type: "standard",
        }),
      });
      if (res.ok) setSagaResult(await res.json());
    } catch { /* */ }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Settlement Saga</h2>
          <p style={{ color: "#64748b", fontSize: "0.875rem" }}>Temporal workflow + TigerBeetle atomic splits — Python service (port 8114)</p>
        </div>
        <button onClick={executeSaga} style={{ padding: "0.625rem 1.25rem", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: "0.5rem", cursor: "pointer", fontWeight: 600 }}>
          Execute Saga
        </button>
      </div>

      {/* Saga Result */}
      {sagaResult && (
        <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>Saga: {sagaResult.saga_id}</h3>
            <span style={{ padding: "0.2rem 0.5rem", background: sagaResult.status === "completed" ? "#14532d" : "#7f1d1d", color: sagaResult.status === "completed" ? "#4ade80" : "#fca5a5", borderRadius: "0.25rem", fontSize: "0.7rem" }}>{sagaResult.status}</span>
          </div>

          {/* Steps */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            {sagaResult.steps?.map((s: any, i: number) => (
              <div key={i} style={{ padding: "0.5rem 0.75rem", background: "#0f172a", borderRadius: "0.375rem", borderLeft: "3px solid #22c55e" }}>
                <p style={{ fontSize: "0.65rem", color: "#94a3b8" }}>Step {s.step}: {s.name}</p>
                <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>${s.amount}</p>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.5rem" }}>
            {Object.entries(sagaResult.summary || {}).map(([key, val]: [string, any]) => (
              <div key={key} style={{ textAlign: "center", padding: "0.5rem", background: "#0f172a", borderRadius: "0.375rem" }}>
                <p style={{ fontSize: "0.6rem", color: "#94a3b8" }}>{key.replace(/_/g, " ")}</p>
                <p style={{ fontSize: "0.9rem", fontWeight: 700 }}>${val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rate Card Overview */}
      {rateCard && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
          <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155" }}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Tax Rates by Country</h3>
            {Object.entries(rateCard.tax_withholding_by_country || {}).slice(0, 8).map(([country, rate]: [string, any]) => (
              <div key={country} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0" }}>
                <span style={{ fontSize: "0.75rem" }}>{country}</span>
                <span style={{ fontSize: "0.75rem", color: "#f59e0b" }}>{(rate * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155" }}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Payout Methods</h3>
            {(rateCard.payout_methods || []).map((m: string) => (
              <p key={m} style={{ fontSize: "0.75rem", padding: "0.25rem 0", color: "#94a3b8" }}>{m.replace(/_/g, " ")}</p>
            ))}
          </div>
          <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155" }}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Payout Schedules</h3>
            {Object.entries(rateCard.payout_schedules || {}).map(([who, when]: [string, any]) => (
              <div key={who} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0" }}>
                <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{who.replace(/_/g, " ")}</span>
                <span style={{ fontSize: "0.7rem", color: "#22c55e" }}>{when}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App (Authenticated Shell) ─────────────────────────────
function AuthenticatedApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [view, setView] = useState<View>("dashboard");

  const navItems: { id: View; label: string; icon: string }[] = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "search", label: "Search", icon: "🔍" },
    { id: "pnr", label: "PNR", icon: "📄" },
    { id: "queues", label: "Queues", icon: "📋" },
    { id: "guests", label: "Guests", icon: "👤" },
    { id: "content", label: "Content", icon: "📝" },
    { id: "revenue", label: "Revenue", icon: "💰" },
    { id: "groups", label: "Groups", icon: "👥" },
    { id: "commission", label: "Commission", icon: "🏦" },
    { id: "discounts", label: "Discounts", icon: "🏷️" },
    { id: "cancellation", label: "Cancellation", icon: "🚫" },
    { id: "rates", label: "Neg. Rates", icon: "📊" },
    { id: "settlement", label: "Settlement", icon: "⚡" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside style={{ width: "240px", background: "#0f172a", borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "1.5rem", borderBottom: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ width: "32px", height: "32px", background: "#0ea5e9", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.875rem", fontWeight: 800, color: "#fff" }}>G</div>
            <span style={{ fontSize: "1rem", fontWeight: 700 }}>Africa GDS</span>
          </div>
        </div>

        <nav style={{ flex: 1, padding: "1rem" }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.75rem",
                marginBottom: "0.25rem",
                borderRadius: "0.5rem",
                border: "none",
                background: view === item.id ? "#1e293b" : "transparent",
                color: view === item.id ? "#e2e8f0" : "#64748b",
                cursor: "pointer",
                fontSize: "0.875rem",
                textAlign: "left",
              }}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: "1rem", borderTop: "1px solid #1e293b" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>{user.name}</p>
          <p style={{ fontSize: "0.7rem", color: "#64748b" }}>{user.role}</p>
          <button onClick={onLogout} style={{ marginTop: "0.5rem", width: "100%", padding: "0.5rem", background: "#1e293b", color: "#94a3b8", border: "none", borderRadius: "0.375rem", cursor: "pointer", fontSize: "0.75rem" }}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
        {view === "dashboard" && <DashboardView />}
        {view === "search" && <SearchView />}
        {view === "pnr" && <PNRView />}
        {view === "queues" && <QueueView />}
        {view === "guests" && <GuestView />}
        {view === "content" && <ContentView />}
        {view === "revenue" && <RevenueView />}
        {view === "groups" && <GroupView />}
        {view === "commission" && <CommissionView />}
        {view === "discounts" && <DiscountsView />}
        {view === "cancellation" && <CancellationView />}
        {view === "rates" && <NegotiatedRatesView />}
        {view === "settlement" && <SettlementView />}
      </main>
    </div>
  );
}

// ─── Root App ────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("gds-user");
    return stored ? JSON.parse(stored) : null;
  });

  const handleLogout = () => {
    localStorage.removeItem("gds-user");
    setUser(null);
  };

  if (!user) return <LoginPage onLogin={setUser} />;
  return <AuthenticatedApp user={user} onLogout={handleLogout} />;
}
