/**
 * Africa GDS — Standalone Global Distribution System PWA
 * Full CRUD + Onboarding Workflows + 16 Views
 */
import { useState, useEffect, useCallback } from "react";

const GW = "http://localhost:8090/api/v1/gds";

type User = { email: string; name: string; role: string; token: string };
type View = "dashboard" | "onboarding" | "properties" | "field-agents" | "pnr" | "queues" | "guests" | "content" | "revenue" | "groups" | "search" | "commission" | "discounts" | "cancellation" | "rates" | "settlement";

// ─── Shared Components ──────────────────────────────────────────
const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.25rem", border: "1px solid #334155", ...style }}>{children}</div>
);
const Stat = ({ label, value, color }: { label: string; value: string | number; color?: string }) => (
  <Card><p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{label}</p><p style={{ fontSize: "1.5rem", fontWeight: 700, color }}>{value}</p></Card>
);
const Btn = ({ children, onClick, color, disabled, small }: { children: React.ReactNode; onClick: () => void; color?: string; disabled?: boolean; small?: boolean }) => (
  <button onClick={onClick} disabled={disabled} style={{ padding: small ? "0.375rem 0.75rem" : "0.625rem 1.25rem", background: color || "#0ea5e9", color: "#fff", border: "none", borderRadius: "0.5rem", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, fontSize: small ? "0.75rem" : "0.875rem", opacity: disabled ? 0.6 : 1 }}>{children}</button>
);
const Input = ({ label, value, onChange, placeholder, type }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) => (
  <div style={{ marginBottom: "0.75rem" }}>
    <label style={{ display: "block", marginBottom: "0.25rem", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase" }}>{label}</label>
    <input type={type || "text"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "0.625rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: "0.875rem" }} />
  </div>
);
const Select = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
  <div style={{ marginBottom: "0.75rem" }}>
    <label style={{ display: "block", marginBottom: "0.25rem", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase" }}>{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", padding: "0.625rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: "0.875rem" }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);
const Badge = ({ text, color }: { text: string; color: string }) => (
  <span style={{ padding: "0.2rem 0.5rem", background: color + "22", color, borderRadius: "0.25rem", fontSize: "0.65rem", fontWeight: 600, textTransform: "capitalize" }}>{text.replace(/_/g, " ")}</span>
);
const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{ background: "#0f172a", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155", width: "560px", maxHeight: "85vh", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "1.25rem" }}>x</button>
      </div>
      {children}
    </div>
  </div>
);

const statusColors: Record<string, string> = {
  active: "#22c55e", pending_verification: "#f59e0b", in_review: "#3b82f6", verified: "#22c55e",
  registered: "#8b5cf6", rate_setup: "#f59e0b", documents_pending: "#f97316", rejected: "#ef4444",
  pending_kyc: "#f59e0b", training: "#3b82f6", CONFIRMED: "#22c55e", WAITLISTED: "#f59e0b",
  CANCELLED: "#ef4444", Bronze: "#cd7f32", Silver: "#94a3b8", Gold: "#eab308", Platinum: "#a78bfa",
};

// ─── Login Page ────────────────────────────────────────────────
function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    onLogin({ email: email || "agent@africagds.com", name: email?.split("@")[0] || "GDS Agent", role: "agent", token: "gds-jwt-" + Date.now() });
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      <div style={{ flex: 1, background: "linear-gradient(135deg, #0c4a6e 0%, #0369a1 40%, #0ea5e9 100%)", display: "flex", flexDirection: "column", justifyContent: "center", padding: "4rem" }}>
        <div style={{ maxWidth: "480px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "2rem" }}>
            <div style={{ width: "48px", height: "48px", background: "rgba(255,255,255,0.15)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 800, color: "#fff" }}>G</div>
            <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff" }}>Africa GDS</span>
          </div>
          <h1 style={{ fontSize: "2.5rem", fontWeight: 800, color: "#fff", lineHeight: 1.2, marginBottom: "1rem" }}>Global Distribution<br />System for Africa</h1>
          <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "1.1rem", lineHeight: 1.6 }}>Sabre/Amadeus-class booking platform purpose-built for African tourism.</p>
          <div style={{ marginTop: "2rem", display: "flex", gap: "2rem" }}>
            {[["6", "Microservices"], ["20", "Countries"], ["14", "Middleware"]].map(([v, l]) => (
              <div key={l}><p style={{ fontSize: "2rem", fontWeight: 700, color: "#fff" }}>{v}</p><p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.8rem" }}>{l}</p></div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ width: "480px", display: "flex", flexDirection: "column", justifyContent: "center", padding: "4rem", background: "#0f172a" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Sign in to GDS</h2>
        <p style={{ color: "#64748b", marginBottom: "2rem" }}>Keycloak OIDC Authentication</p>
        <form onSubmit={handleLogin}>
          <Input label="Email" value={email} onChange={setEmail} placeholder="agent@africagds.com" type="email" />
          <Input label="Password" value={password} onChange={setPassword} placeholder="........" type="password" />
          <Btn onClick={() => {}} color="#0ea5e9" disabled={loading}>{loading ? "Authenticating..." : "Sign In"}</Btn>
        </form>
        <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#1e293b", borderRadius: "0.5rem", border: "1px solid #334155" }}>
          <p style={{ color: "#64748b", fontSize: "0.75rem", marginBottom: "0.5rem" }}>Quick Login (Dev Mode)</p>
          <button onClick={() => { const u: User = { email: "admin@africagds.com", name: "GDS Admin", role: "admin", token: "dev-admin-token" }; localStorage.setItem("gds-user", JSON.stringify(u)); onLogin(u); }} style={{ width: "100%", padding: "0.625rem", background: "#475569", color: "#e2e8f0", border: "none", borderRadius: "0.375rem", cursor: "pointer", fontSize: "0.8rem" }}>Dev Login as Admin</button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard View ─────────────────────────────────────────────
function DashboardView() {
  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>GDS Operations Dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[{ label: "Active PNRs", value: "2,847", color: "#22c55e" }, { label: "Queue Items", value: "156", color: "#f59e0b" }, { label: "Guest Profiles", value: "45,230", color: "#8b5cf6" }, { label: "Revenue (MTD)", value: "$2.4M", color: "#0ea5e9" }].map(s => <Stat key={s.label} {...s} />)}
      </div>
      <Card style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Microservice Status</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
          {[{ name: "PNR Engine", lang: "Go", port: 8082 }, { name: "Queue System", lang: "Rust", port: 8083 }, { name: "Guest CRM", lang: "Go", port: 8084 }, { name: "Content Mgmt", lang: "Python", port: 8085 }, { name: "Revenue Mgmt", lang: "Python", port: 8086 }, { name: "Group Bookings", lang: "Go", port: 8087 }].map(svc => (
            <div key={svc.name} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "#0f172a", borderRadius: "0.5rem" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e" }} />
              <div><p style={{ fontSize: "0.8rem", fontWeight: 600 }}>{svc.name}</p><p style={{ fontSize: "0.7rem", color: "#64748b" }}>{svc.lang} • :{svc.port}</p></div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Middleware Stack</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {["Kafka", "Dapr", "Fluvio", "Temporal", "PostgreSQL", "Keycloak", "Permify", "Redis", "Mojaloop", "OpenSearch", "OpenAppSec", "APISIX", "TigerBeetle", "Lakehouse"].map(mw => (
            <span key={mw} style={{ padding: "0.375rem 0.75rem", background: "#0f172a", borderRadius: "1rem", fontSize: "0.75rem", color: "#94a3b8", border: "1px solid #334155" }}>{mw}</span>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Onboarding View (Establishment + Agent Workflows) ───────────
function OnboardingView() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState({ establishment_name: "", contact_name: "", contact_email: "", contact_phone: "", country: "KE", city: "", property_type: "hotel", rooms: "10", channel: "web", base_rate: "100", currency: "USD" });
  const [agentData, setAgentData] = useState({ name: "", email: "", phone: "", region: "", country: "KE" });
  const [activeAppId, setActiveAppId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, a, ag] = await Promise.all([
        fetch(`${GW}/onboarding/dashboard`).then(r => r.json()),
        fetch(`${GW}/onboarding/applications`).then(r => r.json()),
        fetch(`${GW}/onboarding/agents`).then(r => r.json()),
      ]);
      setDashboard(d);
      setApplications(a.applications || []);
      setAgents(ag.agents || []);
    } catch { /* offline */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startWizard = async () => {
    const res = await fetch(`${GW}/onboarding/wizard/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(wizardData) });
    if (res.ok) { const d = await res.json(); setActiveAppId(d.application.id); setWizardStep(2); }
  };
  const advanceWizard = async (step: number, endpoint: string) => {
    if (!activeAppId) return;
    const res = await fetch(`${GW}/onboarding/wizard/${activeAppId}/${endpoint}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(wizardData) });
    if (res.ok) setWizardStep(step + 1);
  };
  const finishWizard = async () => {
    if (!activeAppId) return;
    await fetch(`${GW}/onboarding/wizard/${activeAppId}/activate`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(wizardData) });
    setShowWizard(false); setWizardStep(1); setActiveAppId(null); load();
  };
  const createAgent = async () => {
    await fetch(`${GW}/onboarding/agents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(agentData) });
    setShowAgentForm(false); load();
  };
  const deleteApp = async (id: string) => { await fetch(`${GW}/onboarding/applications/${id}`, { method: "DELETE" }); load(); };
  const deleteAgent = async (id: string) => { await fetch(`${GW}/onboarding/agents/${id}`, { method: "DELETE" }); load(); };
  const verifyKyc = async (id: string) => { await fetch(`${GW}/onboarding/agents/${id}/verify-kyc`, { method: "POST" }); load(); };
  const completeTraining = async (id: string) => { await fetch(`${GW}/onboarding/agents/${id}/complete-training`, { method: "POST" }); load(); };

  const steps = ["Register", "Property Details", "Rate Setup", "Documents", "Go Live"];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div><h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Onboarding</h2><p style={{ color: "#64748b", fontSize: "0.875rem" }}>Establishment & Agent onboarding workflows</p></div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Btn onClick={() => setShowWizard(true)} color="#22c55e">+ New Establishment</Btn>
          <Btn onClick={() => setShowAgentForm(true)} color="#8b5cf6">+ New Agent</Btn>
        </div>
      </div>

      {/* Pipeline Stats */}
      {dashboard && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
          <Stat label="Total Applications" value={dashboard.pipeline?.total_applications || 0} />
          <Stat label="Active Pipeline" value={dashboard.pipeline?.active || 0} color="#f59e0b" />
          <Stat label="Establishments" value={dashboard.establishments?.total || 0} color="#22c55e" />
          <Stat label="Field Agents" value={dashboard.agents?.total || 0} color="#8b5cf6" />
        </div>
      )}

      {/* Funnel */}
      {dashboard?.funnel && (
        <Card style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Onboarding Funnel</h3>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
            {Object.entries(dashboard.funnel).map(([k, v]: [string, any]) => (
              <div key={k} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ height: `${Math.max(20, (v / (dashboard.funnel.registered || 1)) * 120)}px`, background: k === "rejected" ? "#ef4444" : "#0ea5e9", borderRadius: "0.25rem 0.25rem 0 0", marginBottom: "0.25rem" }} />
                <p style={{ fontSize: "0.9rem", fontWeight: 700 }}>{v}</p>
                <p style={{ fontSize: "0.6rem", color: "#94a3b8" }}>{k.replace(/_/g, " ")}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Applications Table */}
      <Card style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Onboarding Applications ({applications.length})</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155" }}>
              {["Establishment", "Country", "Channel", "Step", "Status", "Actions"].map(h => (
                <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {applications.map((a: any) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #1e293b" }}>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>{a.establishment_name}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{a.country}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Badge text={a.channel} color="#3b82f6" /></td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{a.step}/{a.total_steps}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Badge text={a.status} color={statusColors[a.status] || "#94a3b8"} /></td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Btn onClick={() => deleteApp(a.id)} color="#ef4444" small>Delete</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Field Agents */}
      <Card>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Field Agents ({agents.length})</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155" }}>
              {["Name", "Region", "Status", "Properties", "Commission", "Actions"].map(h => (
                <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((a: any) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #1e293b" }}>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>{a.name}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{a.region}, {a.country}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Badge text={a.status} color={statusColors[a.status] || "#94a3b8"} /></td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{a.properties_onboarded}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "#22c55e" }}>${a.commission_earned?.toLocaleString()}</td>
                <td style={{ padding: "0.5rem 0.75rem", display: "flex", gap: "0.25rem" }}>
                  {a.status === "pending_kyc" && <Btn onClick={() => verifyKyc(a.id)} color="#3b82f6" small>Verify KYC</Btn>}
                  {a.status === "training" && <Btn onClick={() => completeTraining(a.id)} color="#22c55e" small>Complete Training</Btn>}
                  <Btn onClick={() => deleteAgent(a.id)} color="#ef4444" small>Delete</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Wizard Modal */}
      {showWizard && (
        <Modal title={`Onboard Establishment — Step ${wizardStep}/5: ${steps[wizardStep - 1]}`} onClose={() => { setShowWizard(false); setWizardStep(1); }}>
          <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1.5rem" }}>
            {steps.map((s, i) => (
              <div key={s} style={{ flex: 1, height: "4px", borderRadius: "2px", background: i < wizardStep ? "#22c55e" : "#334155" }} />
            ))}
          </div>
          {wizardStep === 1 && <>
            <Input label="Establishment Name" value={wizardData.establishment_name} onChange={v => setWizardData({ ...wizardData, establishment_name: v })} placeholder="e.g. Safari Lodge Nairobi" />
            <Input label="Contact Name" value={wizardData.contact_name} onChange={v => setWizardData({ ...wizardData, contact_name: v })} />
            <Input label="Contact Email" value={wizardData.contact_email} onChange={v => setWizardData({ ...wizardData, contact_email: v })} type="email" />
            <Input label="Contact Phone" value={wizardData.contact_phone} onChange={v => setWizardData({ ...wizardData, contact_phone: v })} />
            <Select label="Country" value={wizardData.country} onChange={v => setWizardData({ ...wizardData, country: v })} options={[{value:"KE",label:"Kenya"},{value:"NG",label:"Nigeria"},{value:"TZ",label:"Tanzania"},{value:"ZA",label:"South Africa"},{value:"GH",label:"Ghana"},{value:"RW",label:"Rwanda"},{value:"UG",label:"Uganda"},{value:"MA",label:"Morocco"},{value:"ET",label:"Ethiopia"},{value:"SN",label:"Senegal"}]} />
            <Btn onClick={startWizard} color="#22c55e">Register & Continue</Btn>
          </>}
          {wizardStep === 2 && <>
            <Select label="Property Type" value={wizardData.property_type} onChange={v => setWizardData({ ...wizardData, property_type: v })} options={[{value:"hotel",label:"Hotel"},{value:"resort",label:"Resort"},{value:"safari_camp",label:"Safari Camp"},{value:"lodge",label:"Lodge"},{value:"guesthouse",label:"Guesthouse"},{value:"hostel",label:"Hostel"},{value:"riad",label:"Riad"},{value:"eco_lodge",label:"Eco Lodge"},{value:"boutique_hotel",label:"Boutique Hotel"},{value:"farm_stay",label:"Farm Stay"}]} />
            <Input label="City" value={wizardData.city} onChange={v => setWizardData({ ...wizardData, city: v })} />
            <Input label="Number of Rooms" value={wizardData.rooms} onChange={v => setWizardData({ ...wizardData, rooms: v })} type="number" />
            <Btn onClick={() => advanceWizard(2, "details")} color="#22c55e">Save Details & Continue</Btn>
          </>}
          {wizardStep === 3 && <>
            <Select label="Currency" value={wizardData.currency} onChange={v => setWizardData({ ...wizardData, currency: v })} options={[{value:"USD",label:"USD"},{value:"KES",label:"KES"},{value:"NGN",label:"NGN"},{value:"TZS",label:"TZS"},{value:"ZAR",label:"ZAR"},{value:"GHS",label:"GHS"},{value:"RWF",label:"RWF"},{value:"MAD",label:"MAD"}]} />
            <Input label="Base Rate per Night" value={wizardData.base_rate} onChange={v => setWizardData({ ...wizardData, base_rate: v })} type="number" />
            <Btn onClick={() => advanceWizard(3, "rates")} color="#22c55e">Set Rates & Continue</Btn>
          </>}
          {wizardStep === 4 && <>
            <p style={{ color: "#94a3b8", marginBottom: "1rem" }}>Upload property photos, business license, and tax registration. In production, this integrates with document verification services.</p>
            <div style={{ padding: "2rem", border: "2px dashed #334155", borderRadius: "0.5rem", textAlign: "center", marginBottom: "1rem" }}>
              <p style={{ color: "#64748b" }}>Drag & drop documents here or click to upload</p>
              <p style={{ color: "#475569", fontSize: "0.75rem", marginTop: "0.5rem" }}>Supported: PDF, JPG, PNG (max 10MB each)</p>
            </div>
            <Btn onClick={() => advanceWizard(4, "verify")} color="#22c55e">Submit for Review</Btn>
          </>}
          {wizardStep === 5 && <>
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>&#127881;</div>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>Ready to Go Live!</h3>
              <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>All details verified. Click below to activate {wizardData.establishment_name}.</p>
              <Btn onClick={finishWizard} color="#22c55e">Activate Establishment</Btn>
            </div>
          </>}
        </Modal>
      )}

      {/* Agent Form Modal */}
      {showAgentForm && (
        <Modal title="Register New Field Agent" onClose={() => setShowAgentForm(false)}>
          <Input label="Full Name" value={agentData.name} onChange={v => setAgentData({ ...agentData, name: v })} />
          <Input label="Email" value={agentData.email} onChange={v => setAgentData({ ...agentData, email: v })} type="email" />
          <Input label="Phone" value={agentData.phone} onChange={v => setAgentData({ ...agentData, phone: v })} />
          <Input label="Region" value={agentData.region} onChange={v => setAgentData({ ...agentData, region: v })} placeholder="e.g. Nairobi, Lagos" />
          <Select label="Country" value={agentData.country} onChange={v => setAgentData({ ...agentData, country: v })} options={[{value:"KE",label:"Kenya"},{value:"NG",label:"Nigeria"},{value:"TZ",label:"Tanzania"},{value:"ZA",label:"South Africa"},{value:"GH",label:"Ghana"},{value:"RW",label:"Rwanda"},{value:"UG",label:"Uganda"}]} />
          <Btn onClick={createAgent} color="#8b5cf6">Register Agent</Btn>
        </Modal>
      )}
    </div>
  );
}

// ─── Properties View ─────────────────────────────────────────────
function PropertiesView() {
  const [properties, setProperties] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "hotel", country: "KE", city: "", rooms: "10", star_rating: "3", contact_name: "", contact_email: "", base_rate: "100", currency: "USD" });

  const load = useCallback(async () => {
    try { const r = await fetch(`${GW}/properties`); const d = await r.json(); setProperties(d.properties || []); } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const url = editId ? `${GW}/properties/${editId}` : `${GW}/properties`;
    await fetch(url, { method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, rooms: Number(form.rooms), star_rating: Number(form.star_rating), base_rate: Number(form.base_rate) }) });
    setShowForm(false); setEditId(null); load();
  };
  const edit = (p: any) => { setForm({ name: p.name, type: p.type, country: p.country, city: p.city, rooms: String(p.rooms), star_rating: String(p.star_rating), contact_name: p.contact_name, contact_email: p.contact_email, base_rate: String(p.base_rate), currency: p.currency }); setEditId(p.id); setShowForm(true); };
  const del = async (id: string) => { await fetch(`${GW}/properties/${id}`, { method: "DELETE" }); load(); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div><h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Properties</h2><p style={{ color: "#64748b", fontSize: "0.875rem" }}>Manage establishments across 20 African countries</p></div>
        <Btn onClick={() => { setForm({ name: "", type: "hotel", country: "KE", city: "", rooms: "10", star_rating: "3", contact_name: "", contact_email: "", base_rate: "100", currency: "USD" }); setEditId(null); setShowForm(true); }}>+ New Property</Btn>
      </div>
      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid #334155" }}>
            {["Name", "Type", "Country", "Rooms", "Stars", "Tier", "Status", "Actions"].map(h => <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {properties.map((p: any) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #1e293b" }}>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>{p.name}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Badge text={p.type} color="#3b82f6" /></td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{p.country}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{p.rooms}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{"*".repeat(p.star_rating)}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Badge text={p.tier} color="#f59e0b" /></td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Badge text={p.status} color={statusColors[p.status] || "#94a3b8"} /></td>
                <td style={{ padding: "0.5rem 0.75rem", display: "flex", gap: "0.25rem" }}>
                  <Btn onClick={() => edit(p)} color="#3b82f6" small>Edit</Btn>
                  <Btn onClick={() => del(p.id)} color="#ef4444" small>Delete</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {showForm && (
        <Modal title={editId ? "Edit Property" : "Add Property"} onClose={() => setShowForm(false)}>
          <Input label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <Select label="Type" value={form.type} onChange={v => setForm({ ...form, type: v })} options={[{value:"hotel",label:"Hotel"},{value:"resort",label:"Resort"},{value:"safari_camp",label:"Safari Camp"},{value:"lodge",label:"Lodge"},{value:"guesthouse",label:"Guesthouse"},{value:"hostel",label:"Hostel"},{value:"riad",label:"Riad"},{value:"eco_lodge",label:"Eco Lodge"},{value:"boutique_hotel",label:"Boutique Hotel"}]} />
          <Select label="Country" value={form.country} onChange={v => setForm({ ...form, country: v })} options={[{value:"KE",label:"Kenya"},{value:"NG",label:"Nigeria"},{value:"TZ",label:"Tanzania"},{value:"ZA",label:"South Africa"},{value:"GH",label:"Ghana"},{value:"RW",label:"Rwanda"},{value:"UG",label:"Uganda"},{value:"MA",label:"Morocco"}]} />
          <Input label="City" value={form.city} onChange={v => setForm({ ...form, city: v })} />
          <Input label="Rooms" value={form.rooms} onChange={v => setForm({ ...form, rooms: v })} type="number" />
          <Input label="Star Rating" value={form.star_rating} onChange={v => setForm({ ...form, star_rating: v })} type="number" />
          <Input label="Contact Name" value={form.contact_name} onChange={v => setForm({ ...form, contact_name: v })} />
          <Input label="Contact Email" value={form.contact_email} onChange={v => setForm({ ...form, contact_email: v })} type="email" />
          <Input label="Base Rate/Night" value={form.base_rate} onChange={v => setForm({ ...form, base_rate: v })} type="number" />
          <Select label="Currency" value={form.currency} onChange={v => setForm({ ...form, currency: v })} options={[{value:"USD",label:"USD"},{value:"KES",label:"KES"},{value:"NGN",label:"NGN"},{value:"TZS",label:"TZS"},{value:"ZAR",label:"ZAR"},{value:"GHS",label:"GHS"},{value:"RWF",label:"RWF"}]} />
          <Btn onClick={save} color="#22c55e">{editId ? "Update" : "Create"}</Btn>
        </Modal>
      )}
    </div>
  );
}

// ─── PNR View (with Edit/Delete) ─────────────────────────────────
function PNRView() {
  const [pnrs, setPnrs] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editLocator, setEditLocator] = useState<string | null>(null);
  const [form, setForm] = useState({ guest_name: "", contact_email: "", agency_id: "", agent_id: "", status: "CONFIRMED" });

  const load = useCallback(async () => { try { const r = await fetch(`${GW}/pnr`); const d = await r.json(); setPnrs(d.pnrs || []); } catch {} }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (editLocator) {
      await fetch(`${GW}/pnr/${editLocator}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    } else {
      await fetch(`${GW}/pnr`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    }
    setShowForm(false); setEditLocator(null); load();
  };
  const del = async (locator: string) => { await fetch(`${GW}/pnr/${locator}`, { method: "DELETE" }); load(); };
  const edit = (p: any) => { setForm({ guest_name: p.guest_name, contact_email: p.contact_email, agency_id: p.agency_id, agent_id: p.agent_id, status: p.status }); setEditLocator(p.locator); setShowForm(true); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div><h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>PNR Management</h2><p style={{ color: "#64748b", fontSize: "0.875rem" }}>Passenger Name Records — Full booking lifecycle</p></div>
        <Btn onClick={() => { setForm({ guest_name: "", contact_email: "", agency_id: "", agent_id: "", status: "CONFIRMED" }); setEditLocator(null); setShowForm(true); }}>+ New PNR</Btn>
      </div>
      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid #334155" }}>
            {["Locator", "Guest", "Status", "Ticketing", "Segments", "Created", "Actions"].map(h => <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {pnrs.map((p: any) => (
              <tr key={p.locator} style={{ borderBottom: "1px solid #1e293b" }}>
                <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace", color: "#0ea5e9" }}>{p.locator}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>{p.guest_name}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Badge text={p.status} color={statusColors[p.status] || "#94a3b8"} /></td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.75rem" }}>{p.ticketing_status}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{p.segments?.length || 0}</td>
                <td style={{ padding: "0.5rem 0.75rem", color: "#64748b", fontSize: "0.75rem" }}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</td>
                <td style={{ padding: "0.5rem 0.75rem", display: "flex", gap: "0.25rem" }}>
                  <Btn onClick={() => edit(p)} color="#3b82f6" small>Edit</Btn>
                  <Btn onClick={() => del(p.locator)} color="#ef4444" small>Delete</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {showForm && (
        <Modal title={editLocator ? `Edit PNR ${editLocator}` : "Create PNR"} onClose={() => setShowForm(false)}>
          <Input label="Guest Name" value={form.guest_name} onChange={v => setForm({ ...form, guest_name: v })} />
          <Input label="Contact Email" value={form.contact_email} onChange={v => setForm({ ...form, contact_email: v })} type="email" />
          <Input label="Agency ID" value={form.agency_id} onChange={v => setForm({ ...form, agency_id: v })} />
          <Input label="Agent ID" value={form.agent_id} onChange={v => setForm({ ...form, agent_id: v })} />
          {editLocator && <Select label="Status" value={form.status} onChange={v => setForm({ ...form, status: v })} options={[{value:"CONFIRMED",label:"Confirmed"},{value:"WAITLISTED",label:"Waitlisted"},{value:"CANCELLED",label:"Cancelled"}]} />}
          <Btn onClick={save} color="#22c55e">{editLocator ? "Update" : "Create"}</Btn>
        </Modal>
      )}
    </div>
  );
}

// ─── Guests View (Full CRUD) ─────────────────────────────────────
function GuestView() {
  const [guests, setGuests] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", nationality: "NG", tier: "Bronze" });

  const load = useCallback(async () => { try { const r = await fetch(`${GW}/guests/search?q=&limit=50`); const d = await r.json(); setGuests(d.guests || []); } catch {} }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const url = editId ? `${GW}/guests/${editId}` : `${GW}/guests`;
    await fetch(url, { method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowForm(false); setEditId(null); load();
  };
  const edit = (g: any) => { setForm({ first_name: g.first_name, last_name: g.last_name, email: g.email, phone: g.phone, nationality: g.nationality, tier: g.tier }); setEditId(g.id); setShowForm(true); };
  const del = async (id: string) => { await fetch(`${GW}/guests/${id}`, { method: "DELETE" }); load(); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div><h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Guest Profile CRM</h2><p style={{ color: "#64748b", fontSize: "0.875rem" }}>Preferences, loyalty tiers, corporate accounts</p></div>
        <Btn onClick={() => { setForm({ first_name: "", last_name: "", email: "", phone: "", nationality: "NG", tier: "Bronze" }); setEditId(null); setShowForm(true); }}>+ New Guest</Btn>
      </div>
      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid #334155" }}>
            {["Name", "Email", "Nationality", "Tier", "Points", "Stays", "Spend", "Actions"].map(h => <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {guests.map((g: any) => (
              <tr key={g.id} style={{ borderBottom: "1px solid #1e293b" }}>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>{g.name}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.75rem", color: "#64748b" }}>{g.email}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{g.nationality}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Badge text={g.tier} color={statusColors[g.tier] || "#94a3b8"} /></td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{g.loyalty_points?.toLocaleString()}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{g.total_stays}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "#22c55e" }}>${g.total_spend?.toLocaleString()}</td>
                <td style={{ padding: "0.5rem 0.75rem", display: "flex", gap: "0.25rem" }}>
                  <Btn onClick={() => edit(g)} color="#3b82f6" small>Edit</Btn>
                  <Btn onClick={() => del(g.id)} color="#ef4444" small>Delete</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {showForm && (
        <Modal title={editId ? "Edit Guest" : "New Guest Profile"} onClose={() => setShowForm(false)}>
          <Input label="First Name" value={form.first_name} onChange={v => setForm({ ...form, first_name: v })} />
          <Input label="Last Name" value={form.last_name} onChange={v => setForm({ ...form, last_name: v })} />
          <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} type="email" />
          <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
          <Input label="Nationality" value={form.nationality} onChange={v => setForm({ ...form, nationality: v })} />
          <Select label="Tier" value={form.tier} onChange={v => setForm({ ...form, tier: v })} options={[{value:"Bronze",label:"Bronze"},{value:"Silver",label:"Silver"},{value:"Gold",label:"Gold"},{value:"Platinum",label:"Platinum"}]} />
          <Btn onClick={save} color="#22c55e">{editId ? "Update" : "Create"}</Btn>
        </Modal>
      )}
    </div>
  );
}

// ─── Queue View ──────────────────────────────────────────────────
function QueueView() {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => { fetch(`${GW}/queues/stats`).then(r => r.json()).then(setStats).catch(() => {}); }, []);
  const queueTypes = [
    { type: "ticketing", label: "Ticketing", sla: "30 min" }, { type: "schedule_change", label: "Schedule Change", sla: "2 hr" },
    { type: "cancellation", label: "Cancellation", sla: "1 hr" }, { type: "waitlist", label: "Waitlist", sla: "15 min" },
    { type: "vip", label: "VIP", sla: "15 min" }, { type: "group", label: "Group", sla: "4 hr" }, { type: "general", label: "General", sla: "48 hr" },
  ];
  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>Agent Queue System</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[{ label: "Total Items", value: stats?.total_items || "156" }, { label: "Urgent", value: stats?.urgent || "23" }, { label: "Avg Wait", value: stats?.avg_wait || "4.2 min" }, { label: "SLA Breach", value: stats?.breached || "2" }].map(s => <Stat key={s.label} {...s} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
        {queueTypes.map(q => (
          <Card key={q.type}><p style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.5rem" }}>{q.label}</p><p style={{ color: "#64748b", fontSize: "0.75rem" }}>SLA: {q.sla}</p><div style={{ marginTop: "0.5rem", height: "4px", background: "#0f172a", borderRadius: "2px" }}><div style={{ height: "100%", width: `${Math.random() * 80 + 10}%`, background: "#0ea5e9", borderRadius: "2px" }} /></div></Card>
        ))}
      </div>
    </div>
  );
}

// ─── Content View ────────────────────────────────────────────────
function ContentView() {
  const [languages, setLanguages] = useState<string[]>([]);
  useEffect(() => { fetch(`${GW}/content/languages`).then(r => r.json()).then(d => setLanguages(d.languages || [])).catch(() => {}); }, []);
  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>Content Management</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        <Stat label="Languages" value={languages.length || "15"} /><Stat label="Amenity Categories" value="38" /><Stat label="Avg Completeness" value="78%" />
      </div>
      <Card style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Supported Languages</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {(languages.length ? languages : ["en","fr","ar","sw","pt","am","zu","ha","yo","ig","so","af","rw","mg","wo"]).map(l => <span key={l} style={{ padding: "0.375rem 0.75rem", background: "#0f172a", borderRadius: "0.375rem", fontSize: "0.8rem", border: "1px solid #334155" }}>{l.toUpperCase()}</span>)}
        </div>
      </Card>
    </div>
  );
}

// ─── Revenue View ────────────────────────────────────────────────
function RevenueView() {
  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>Revenue Management</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        <Stat label="Avg Daily Rate" value="$185" /><Stat label="RevPAR" value="$142" /><Stat label="Occupancy" value="76.8%" /><Stat label="Yield Index" value="1.12" />
      </div>
      <Card style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Dynamic Pricing Engine</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.5rem" }}>
          {[{ occ: "20%", mult: "0.7x", c: "#22c55e" }, { occ: "40%", mult: "0.85x", c: "#84cc16" }, { occ: "60%", mult: "1.0x", c: "#eab308" }, { occ: "80%", mult: "1.5x", c: "#f97316" }, { occ: "95%", mult: "3.0x", c: "#ef4444" }].map(p => (
            <div key={p.occ} style={{ textAlign: "center", padding: "0.75rem", background: "#0f172a", borderRadius: "0.5rem" }}><p style={{ fontSize: "0.7rem", color: "#64748b" }}>{p.occ}</p><p style={{ fontSize: "1.1rem", fontWeight: 700, color: p.c }}>{p.mult}</p></div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Group Bookings View ─────────────────────────────────────────
function GroupView() {
  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>Group Bookings</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        <Stat label="Active Groups" value="34" /><Stat label="Total Room Nights" value="4,580" /><Stat label="Pickup Rate" value="82%" />
      </div>
      <Card>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Group Types</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
          {[{ t: "Conference", r: "50-500", a: "80/60/40%" }, { t: "Wedding", r: "20-150", a: "90/75/50%" }, { t: "Tour Series", r: "10-45", a: "85/70/45%" }, { t: "Sports Team", r: "15-80", a: "95/85/70%" }, { t: "Corporate Retreat", r: "25-200", a: "80/60/40%" }, { t: "Incentive Travel", r: "30-300", a: "75/55/35%" }].map(g => (
            <div key={g.t} style={{ padding: "1rem", background: "#0f172a", borderRadius: "0.5rem" }}><p style={{ fontWeight: 600, fontSize: "0.875rem" }}>{g.t}</p><p style={{ color: "#64748b", fontSize: "0.7rem" }}>Rooms: {g.r} | Attrition: {g.a}</p></div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Search View ─────────────────────────────────────────────────
function SearchView() {
  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>Property Search</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.75rem", marginBottom: "2rem" }}>
        <input placeholder="Search destinations, properties..." style={{ padding: "0.875rem", borderRadius: "0.5rem", border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: "1rem" }} />
        <Btn onClick={() => {}}>Search</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
        {[{ d: "Masai Mara", c: "Kenya", t: "Safari", p: "$350" }, { d: "Zanzibar", c: "Tanzania", t: "Beach", p: "$220" }, { d: "Cape Town", c: "South Africa", t: "City", p: "$180" }, { d: "Victoria Falls", c: "Zimbabwe", t: "Adventure", p: "$280" }, { d: "Marrakech", c: "Morocco", t: "Riad", p: "$150" }, { d: "Okavango", c: "Botswana", t: "Wilderness", p: "$620" }].map(x => (
          <Card key={x.d} style={{ cursor: "pointer" }}><p style={{ fontWeight: 600 }}>{x.d}</p><p style={{ color: "#64748b", fontSize: "0.8rem" }}>{x.c} — {x.t}</p><p style={{ color: "#0ea5e9", fontWeight: 600, marginTop: "0.5rem" }}>{x.p}/night</p></Card>
        ))}
      </div>
    </div>
  );
}

// ─── Commission View ─────────────────────────────────────────────
function CommissionView() {
  const [rateCard, setRateCard] = useState<any>(null);
  const [splitResult, setSplitResult] = useState<any>(null);
  useEffect(() => { fetch(`${GW}/commission/rate-card`).then(r => r.json()).then(setRateCard).catch(() => {}); }, []);
  const simulateSplit = async () => {
    const res = await fetch(`${GW}/commission/split`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking_id: "BK-" + Date.now(), property_id: "PROP-001", agent_id: "AGT-001", field_agent_id: "FA-001", gross_amount: 500, currency: "USD", country: "KE", booking_type: "standard", room_nights: 3, property_tier: "web_lite", agent_tier: "gold", is_group_booking: false, channel: "gds_portal" }) });
    if (res.ok) setSplitResult(await res.json());
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div><h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Commission Engine</h2><p style={{ color: "#64748b", fontSize: "0.875rem" }}>Real-time multi-party payment split</p></div>
        <Btn onClick={simulateSplit}>Simulate Split</Btn>
      </div>
      {rateCard && <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        <Card><h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Agent Tiers</h3>
          {Object.entries(rateCard.rate_card?.agent_tiers || rateCard.agent_tiers || {}).map(([tier, data]: [string, any]) => (
            <div key={tier} style={{ display: "flex", justifyContent: "space-between", padding: "0.375rem 0", borderBottom: "1px solid #334155" }}><span style={{ textTransform: "capitalize", fontSize: "0.8rem" }}>{tier}</span><span style={{ color: "#0ea5e9", fontWeight: 600, fontSize: "0.8rem" }}>{((data.rate || data) * 100).toFixed(0)}%</span></div>
          ))}
        </Card>
        <Card><h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Property Tiers</h3>
          {Object.entries(rateCard.rate_card?.property_tiers || rateCard.property_tiers || {}).map(([tier, data]: [string, any]) => (
            <div key={tier} style={{ display: "flex", justifyContent: "space-between", padding: "0.375rem 0", borderBottom: "1px solid #334155" }}><span style={{ textTransform: "capitalize", fontSize: "0.8rem" }}>{tier.replace("_", " ")}</span><span style={{ color: "#f59e0b", fontWeight: 600, fontSize: "0.8rem" }}>{((typeof data === "number" ? data : (data.commission_charged ?? 0)) * 100).toFixed(0)}%</span></div>
          ))}
        </Card>
      </div>}
      {splitResult && <Card>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Split Result — ${splitResult.gross_amount}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
          {splitResult.splits?.map((s: any, i: number) => (
            <div key={i} style={{ padding: "0.75rem", background: "#0f172a", borderRadius: "0.5rem" }}><p style={{ fontSize: "0.7rem", color: "#94a3b8", textTransform: "capitalize" }}>{s.stakeholder_type}</p><p style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0ea5e9" }}>${s.amount}</p></div>
          ))}
        </div>
      </Card>}
    </div>
  );
}

// ─── Discounts View (with CRUD) ──────────────────────────────────
function DiscountsView() {
  const [promos, setPromos] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", type: "percentage", value: "15", max_discount: "100", target: "all", max_uses: "1000" });
  const [validateResult, setValidateResult] = useState<any>(null);
  const [code, setCode] = useState("WELCOME15");

  const load = useCallback(async () => { try { const r = await fetch(`${GW}/discount/promos`); const d = await r.json(); setPromos(d.promotions || []); } catch {} }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const url = editId ? `${GW}/discount/promos/${editId}` : `${GW}/discount/promos`;
    await fetch(url, { method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, value: Number(form.value), max_discount: Number(form.max_discount), max_uses: Number(form.max_uses) }) });
    setShowForm(false); setEditId(null); load();
  };
  const del = async (id: string) => { await fetch(`${GW}/discount/promos/${id}`, { method: "DELETE" }); load(); };
  const validate = async () => { const r = await fetch(`${GW}/discount/validate?code=${code}&booking_amount=500&nights=3&country=KE&is_new_user=true`); if (r.ok) setValidateResult(await r.json()); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div><h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Discounts & Promotions</h2></div>
        <Btn onClick={() => { setForm({ name: "", code: "", type: "percentage", value: "15", max_discount: "100", target: "all", max_uses: "1000" }); setEditId(null); setShowForm(true); }}>+ New Promo</Btn>
      </div>
      <Card style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Validate Code</h3>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input value={code} onChange={e => setCode(e.target.value)} style={{ flex: 1, padding: "0.625rem", borderRadius: "0.375rem", border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0" }} />
          <Btn onClick={validate} color="#22c55e" small>Validate</Btn>
        </div>
        {validateResult && <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: validateResult.valid ? "#14532d" : "#7f1d1d", borderRadius: "0.375rem" }}><p style={{ fontSize: "0.8rem", fontWeight: 600 }}>{validateResult.valid ? `Save $${validateResult.discount}! Final: $${validateResult.final_amount}` : validateResult.message}</p></div>}
      </Card>
      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid #334155" }}>
            {["Name", "Code", "Type", "Value", "Uses", "Status", "Actions"].map(h => <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {promos.map((p: any) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #1e293b" }}>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>{p.name}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace", color: "#0ea5e9" }}>{p.code}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Badge text={p.type} color="#3b82f6" /></td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{p.value}{p.type === "percentage" ? "%" : ""}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{p.uses}/{p.max_uses || "--"}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Badge text={p.status} color="#22c55e" /></td>
                <td style={{ padding: "0.5rem 0.75rem", display: "flex", gap: "0.25rem" }}>
                  <Btn onClick={() => { setForm({ name: p.name, code: p.code, type: p.type, value: String(p.value), max_discount: String(p.max_discount), target: p.target, max_uses: String(p.max_uses) }); setEditId(p.id); setShowForm(true); }} color="#3b82f6" small>Edit</Btn>
                  <Btn onClick={() => del(p.id)} color="#ef4444" small>Delete</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {showForm && (
        <Modal title={editId ? "Edit Promotion" : "Create Promotion"} onClose={() => setShowForm(false)}>
          <Input label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <Input label="Code" value={form.code} onChange={v => setForm({ ...form, code: v })} />
          <Select label="Type" value={form.type} onChange={v => setForm({ ...form, type: v })} options={[{value:"percentage",label:"Percentage"},{value:"flat",label:"Flat Amount"},{value:"nights_free",label:"Free Nights"}]} />
          <Input label="Value" value={form.value} onChange={v => setForm({ ...form, value: v })} type="number" />
          <Input label="Max Discount Cap" value={form.max_discount} onChange={v => setForm({ ...form, max_discount: v })} type="number" />
          <Input label="Max Uses" value={form.max_uses} onChange={v => setForm({ ...form, max_uses: v })} type="number" />
          <Select label="Target" value={form.target} onChange={v => setForm({ ...form, target: v })} options={[{value:"all",label:"All Users"},{value:"new_users",label:"New Users"},{value:"corporate",label:"Corporate"},{value:"loyalty_gold",label:"Loyalty Gold+"}]} />
          <Btn onClick={save} color="#22c55e">{editId ? "Update" : "Create"}</Btn>
        </Modal>
      )}
    </div>
  );
}

// ─── Cancellation View (with CRUD) ───────────────────────────────
function CancellationView() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [presets, setPresets] = useState<any>(null);
  const [feeResult, setFeeResult] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ property_id: "", name: "", policy_type: "moderate" });

  const load = useCallback(async () => {
    try {
      const [p, pr] = await Promise.all([fetch(`${GW}/cancellation/policies`).then(r => r.json()), fetch(`${GW}/cancellation/presets`).then(r => r.json())]);
      setPolicies(p.policies || []); setPresets(pr);
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const simulate = async () => {
    const tomorrow = new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0];
    const res = await fetch(`${GW}/cancellation/calculate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking_id: "BK-TEST", property_id: "PROP-002", guest_id: "GUEST-001", check_in: tomorrow, check_out: new Date(Date.now() + 8 * 86400000).toISOString().split("T")[0], booking_amount: 750, currency: "USD", rooms: 1, reason: "Change of plans" }) });
    if (res.ok) setFeeResult(await res.json());
  };
  const createPolicy = async () => {
    await fetch(`${GW}/cancellation/set-policy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowForm(false); load();
  };
  const delPolicy = async (id: string) => { await fetch(`${GW}/cancellation/policies/${id}`, { method: "DELETE" }); load(); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div><h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Cancellation Policies</h2></div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Btn onClick={simulate} color="#ef4444">Simulate Cancel</Btn>
          <Btn onClick={() => setShowForm(true)} color="#22c55e">+ New Policy</Btn>
        </div>
      </div>
      {feeResult && <Card style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" }}>
          <div style={{ textAlign: "center" }}><p style={{ color: "#94a3b8", fontSize: "0.7rem" }}>Policy</p><p style={{ fontWeight: 700 }}>{feeResult.policy_applied}</p></div>
          <div style={{ textAlign: "center" }}><p style={{ color: "#94a3b8", fontSize: "0.7rem" }}>Fee</p><p style={{ fontWeight: 700, color: "#ef4444" }}>${feeResult.cancellation_fee}</p></div>
          <div style={{ textAlign: "center" }}><p style={{ color: "#94a3b8", fontSize: "0.7rem" }}>Refund</p><p style={{ fontWeight: 700, color: "#22c55e" }}>${feeResult.refund_amount}</p></div>
          <div style={{ textAlign: "center" }}><p style={{ color: "#94a3b8", fontSize: "0.7rem" }}>Days Before</p><p style={{ fontWeight: 700 }}>{feeResult.days_before_checkin}</p></div>
        </div>
      </Card>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        {["flexible", "moderate", "strict", "super_strict"].map(preset => (
          <Card key={preset}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, textTransform: "capitalize", marginBottom: "0.75rem" }}>{preset.replace("_", " ")}</h3>
            {(presets?.presets?.[preset] || []).map((tier: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0", borderBottom: "1px solid #0f172a" }}>
                <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{tier.desc}</span>
                <span style={{ fontSize: "0.7rem", color: (tier.refund_pct) >= 75 ? "#22c55e" : (tier.refund_pct) >= 50 ? "#f59e0b" : "#ef4444" }}>{tier.refund_pct}%</span>
              </div>
            ))}
          </Card>
        ))}
      </div>
      <Card>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Active Policies ({policies.length})</h3>
        {policies.map((p: any) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #0f172a", alignItems: "center" }}>
            <div><span style={{ fontSize: "0.85rem" }}>{p.name}</span><span style={{ fontSize: "0.7rem", color: "#64748b", marginLeft: "0.5rem" }}>{p.policy_type}</span></div>
            <Btn onClick={() => delPolicy(p.id)} color="#ef4444" small>Delete</Btn>
          </div>
        ))}
      </Card>
      {showForm && (
        <Modal title="Create Cancellation Policy" onClose={() => setShowForm(false)}>
          <Input label="Property ID" value={form.property_id} onChange={v => setForm({ ...form, property_id: v })} placeholder="e.g. PROP-001" />
          <Input label="Policy Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <Select label="Policy Type" value={form.policy_type} onChange={v => setForm({ ...form, policy_type: v })} options={[{value:"flexible",label:"Flexible"},{value:"moderate",label:"Moderate"},{value:"strict",label:"Strict"},{value:"super_strict",label:"Super Strict"}]} />
          <Btn onClick={createPolicy} color="#22c55e">Create Policy</Btn>
        </Modal>
      )}
    </div>
  );
}

// ─── Negotiated Rates View (with CRUD) ───────────────────────────
function NegotiatedRatesView() {
  const [agreements, setAgreements] = useState<any[]>([]);
  const [volume, setVolume] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", agreement_type: "corporate", base_discount_percent: "20", rate_type: "discount_on_bar", min_room_nights: "500", party_b_name: "", party_b_type: "corporate" });

  const load = useCallback(async () => {
    try {
      const [a, v] = await Promise.all([fetch(`${GW}/negotiated-rates/agreements`).then(r => r.json()), fetch(`${GW}/negotiated-rates/volume-report`).then(r => r.json())]);
      setAgreements(a.agreements || []); setVolume(v);
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    await fetch(`${GW}/negotiated-rates/agreements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, base_discount_percent: Number(form.base_discount_percent), min_room_nights: Number(form.min_room_nights), party_b: { name: form.party_b_name, type: form.party_b_type } }) });
    setShowForm(false); load();
  };
  const del = async (id: string) => { await fetch(`${GW}/negotiated-rates/agreements/${id}`, { method: "DELETE" }); load(); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div><h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Negotiated Rates</h2></div>
        <Btn onClick={() => setShowForm(true)}>+ New Agreement</Btn>
      </div>
      {volume?.summary && <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        <Stat label="Total Committed" value={`${volume.summary.total_committed?.toLocaleString()} RNs`} />
        <Stat label="Actual Delivered" value={`${volume.summary.total_actual?.toLocaleString()} RNs`} />
        <Stat label="Compliance" value={`${volume.summary.overall_compliance}%`} color={volume.summary.overall_compliance >= 70 ? "#22c55e" : "#f59e0b"} />
      </div>}
      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid #334155" }}>
            {["Agreement", "Type", "Party B", "Discount", "Status", "Actions"].map(h => <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {agreements.map((a: any) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #1e293b" }}>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>{a.name}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Badge text={a.agreement_type} color="#3b82f6" /></td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{a.party_b?.name}</td>
                <td style={{ padding: "0.5rem 0.75rem", color: "#22c55e", fontWeight: 600 }}>{a.base_discount_percent}%</td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Badge text={a.status} color={statusColors[a.status] || "#94a3b8"} /></td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Btn onClick={() => del(a.id)} color="#ef4444" small>Delete</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {showForm && (
        <Modal title="Create Rate Agreement" onClose={() => setShowForm(false)}>
          <Input label="Agreement Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <Select label="Type" value={form.agreement_type} onChange={v => setForm({ ...form, agreement_type: v })} options={[{value:"corporate",label:"Corporate"},{value:"consortium",label:"Consortium"},{value:"wholesale",label:"Wholesale"},{value:"government",label:"Government"},{value:"ngo",label:"NGO"}]} />
          <Input label="Party B Name" value={form.party_b_name} onChange={v => setForm({ ...form, party_b_name: v })} />
          <Select label="Rate Type" value={form.rate_type} onChange={v => setForm({ ...form, rate_type: v })} options={[{value:"discount_on_bar",label:"Discount on BAR"},{value:"net_rate",label:"Net Rate"},{value:"fixed",label:"Fixed"},{value:"dynamic_floor",label:"Dynamic Floor"}]} />
          <Input label="Discount %" value={form.base_discount_percent} onChange={v => setForm({ ...form, base_discount_percent: v })} type="number" />
          <Input label="Min Room Nights" value={form.min_room_nights} onChange={v => setForm({ ...form, min_room_nights: v })} type="number" />
          <Btn onClick={create} color="#22c55e">Create Agreement</Btn>
        </Modal>
      )}
    </div>
  );
}

// ─── Settlement View ─────────────────────────────────────────────
function SettlementView() {
  const [sagaResult, setSagaResult] = useState<any>(null);
  const executeSaga = async () => {
    const res = await fetch(`${GW}/settlement-saga/execute`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking_id: "BK-" + Date.now(), gross_amount: 1000, currency: "USD", country: "KE", property_id: "PROP-001", property_tier: "web_lite", agent_id: "AGT-001", agent_tier: "gold", field_agent_id: "FA-001", channel: "api", is_group: false, booking_type: "standard" }) });
    if (res.ok) setSagaResult(await res.json());
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div><h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Settlement Saga</h2><p style={{ color: "#64748b", fontSize: "0.875rem" }}>Temporal workflow + TigerBeetle atomic splits</p></div>
        <Btn onClick={executeSaga} color="#8b5cf6">Execute Saga</Btn>
      </div>
      {sagaResult && <Card>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}><h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>Saga: {sagaResult.saga_id}</h3><Badge text={sagaResult.status} color="#22c55e" /></div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {sagaResult.steps?.map((s: any, i: number) => (
            <div key={i} style={{ padding: "0.5rem 0.75rem", background: "#0f172a", borderRadius: "0.375rem", borderLeft: "3px solid #22c55e" }}><p style={{ fontSize: "0.65rem", color: "#94a3b8" }}>Step {s.step}: {s.name}</p><p style={{ fontSize: "0.8rem", fontWeight: 600 }}>${s.amount}</p></div>
          ))}
        </div>
        {sagaResult.summary && <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.5rem" }}>
          {Object.entries(sagaResult.summary).map(([k, v]: [string, any]) => (
            <div key={k} style={{ textAlign: "center", padding: "0.5rem", background: "#0f172a", borderRadius: "0.375rem" }}><p style={{ fontSize: "0.6rem", color: "#94a3b8" }}>{k.replace(/_/g, " ")}</p><p style={{ fontSize: "0.9rem", fontWeight: 700 }}>${v}</p></div>
          ))}
        </div>}
      </Card>}
    </div>
  );
}

// ─── Field Agents (standalone view) ──────────────────────────────
function FieldAgentsView() {
  const [agents, setAgents] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", region: "", country: "KE" });

  const load = useCallback(async () => { try { const r = await fetch(`${GW}/onboarding/agents`); const d = await r.json(); setAgents(d.agents || []); } catch {} }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    await fetch(`${GW}/onboarding/agents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowForm(false); load();
  };
  const del = async (id: string) => { await fetch(`${GW}/onboarding/agents/${id}`, { method: "DELETE" }); load(); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div><h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Field Agents</h2><p style={{ color: "#64748b", fontSize: "0.875rem" }}>Manage field agents, KYC, training, certifications</p></div>
        <Btn onClick={() => setShowForm(true)} color="#8b5cf6">+ New Agent</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        <Stat label="Total Agents" value={agents.length} /><Stat label="Active" value={agents.filter((a:any) => a.status === "active").length} color="#22c55e" />
        <Stat label="Total Onboarded" value={agents.reduce((s:number, a:any) => s + (a.properties_onboarded||0), 0)} /><Stat label="Total Commission" value={`$${agents.reduce((s:number, a:any) => s + (a.commission_earned||0), 0).toLocaleString()}`} color="#22c55e" />
      </div>
      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid #334155" }}>
            {["Name", "Email", "Region", "Status", "KYC", "Certification", "Properties", "Commission", "Actions"].map(h => <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {agents.map((a: any) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #1e293b" }}>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>{a.name}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.75rem", color: "#64748b" }}>{a.email}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{a.region}, {a.country}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Badge text={a.status} color={statusColors[a.status] || "#94a3b8"} /></td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.75rem" }}>{a.kyc_verified ? "Verified" : "Pending"}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Badge text={a.certification || "none"} color={a.certification === "platinum" ? "#a78bfa" : a.certification === "gold" ? "#eab308" : "#94a3b8"} /></td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>{a.properties_onboarded}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "#22c55e" }}>${a.commission_earned?.toLocaleString()}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}><Btn onClick={() => del(a.id)} color="#ef4444" small>Delete</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {showForm && (
        <Modal title="Register Field Agent" onClose={() => setShowForm(false)}>
          <Input label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} type="email" />
          <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
          <Input label="Region" value={form.region} onChange={v => setForm({ ...form, region: v })} />
          <Select label="Country" value={form.country} onChange={v => setForm({ ...form, country: v })} options={[{value:"KE",label:"Kenya"},{value:"NG",label:"Nigeria"},{value:"TZ",label:"Tanzania"},{value:"ZA",label:"South Africa"},{value:"GH",label:"Ghana"},{value:"RW",label:"Rwanda"},{value:"UG",label:"Uganda"}]} />
          <Btn onClick={save} color="#8b5cf6">Register Agent</Btn>
        </Modal>
      )}
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────
function AuthenticatedApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [view, setView] = useState<View>("dashboard");

  const navItems: { id: View; label: string; section?: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "onboarding", label: "Onboarding", section: "Workflows" },
    { id: "properties", label: "Properties" },
    { id: "field-agents", label: "Field Agents" },
    { id: "search", label: "Search", section: "Booking" },
    { id: "pnr", label: "PNR" },
    { id: "queues", label: "Queues" },
    { id: "guests", label: "Guests" },
    { id: "content", label: "Content", section: "Management" },
    { id: "revenue", label: "Revenue" },
    { id: "groups", label: "Groups" },
    { id: "commission", label: "Commission", section: "Payments" },
    { id: "discounts", label: "Discounts" },
    { id: "cancellation", label: "Cancellation" },
    { id: "rates", label: "Neg. Rates" },
    { id: "settlement", label: "Settlement" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{ width: "240px", background: "#0f172a", borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "1.5rem", borderBottom: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ width: "32px", height: "32px", background: "#0ea5e9", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.875rem", fontWeight: 800, color: "#fff" }}>G</div>
            <span style={{ fontSize: "1rem", fontWeight: 700 }}>Africa GDS</span>
          </div>
        </div>
        <nav style={{ flex: 1, padding: "0.5rem", overflowY: "auto" }}>
          {navItems.map((item) => (
            <div key={item.id}>
              {item.section && <p style={{ padding: "0.75rem 0.75rem 0.25rem", fontSize: "0.65rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.section}</p>}
              <button onClick={() => setView(item.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.625rem 0.75rem", marginBottom: "0.125rem", borderRadius: "0.375rem", border: "none", background: view === item.id ? "#1e293b" : "transparent", color: view === item.id ? "#e2e8f0" : "#64748b", cursor: "pointer", fontSize: "0.8rem", textAlign: "left" }}>{item.label}</button>
            </div>
          ))}
        </nav>
        <div style={{ padding: "1rem", borderTop: "1px solid #1e293b" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>{user.name}</p>
          <p style={{ fontSize: "0.7rem", color: "#64748b" }}>{user.role}</p>
          <button onClick={onLogout} style={{ marginTop: "0.5rem", width: "100%", padding: "0.5rem", background: "#1e293b", color: "#94a3b8", border: "none", borderRadius: "0.375rem", cursor: "pointer", fontSize: "0.75rem" }}>Sign Out</button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
        {view === "dashboard" && <DashboardView />}
        {view === "onboarding" && <OnboardingView />}
        {view === "properties" && <PropertiesView />}
        {view === "field-agents" && <FieldAgentsView />}
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
  const handleLogout = () => { localStorage.removeItem("gds-user"); setUser(null); };
  if (!user) return <LoginPage onLogin={(u) => { localStorage.setItem("gds-user", JSON.stringify(u)); setUser(u); }} />;
  return <AuthenticatedApp user={user} onLogout={handleLogout} />;
}
