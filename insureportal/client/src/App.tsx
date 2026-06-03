import React, { useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import {
  Shield,
  FileText,
  Users,
  BarChart3,
  AlertTriangle,
  DollarSign,
  Building2,
  Heart,
  Car,
  Home as HomeIcon,
  Briefcase,
  Activity,
  Bell,
  Settings,
  Search,
  Menu,
  X,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  Layers,
  Globe,
  Lock,
  Zap,
} from "lucide-react";

// ─── Dashboard Stats ────────────────────────────────────────────────────────
const STATS = [
  { label: "Active Policies", value: "12,847", change: "+3.2%", trend: "up", icon: FileText },
  { label: "Open Claims", value: "1,293", change: "-5.1%", trend: "down", icon: AlertTriangle },
  { label: "Premium Revenue (₦)", value: "₦2.4B", change: "+12.8%", trend: "up", icon: DollarSign },
  { label: "Loss Ratio", value: "62.3%", change: "-1.4%", trend: "down", icon: Activity },
];

const RECENT_CLAIMS = [
  { id: "CLM-2024-8847", type: "Motor", status: "Under Review", amount: "₦2,450,000", date: "28 May 2026", priority: "high" },
  { id: "CLM-2024-8846", type: "Health", status: "Approved", amount: "₦890,000", date: "27 May 2026", priority: "medium" },
  { id: "CLM-2024-8845", type: "Property", status: "Pending Docs", amount: "₦5,200,000", date: "27 May 2026", priority: "high" },
  { id: "CLM-2024-8844", type: "Life", status: "Settled", amount: "₦15,000,000", date: "26 May 2026", priority: "low" },
  { id: "CLM-2024-8843", type: "Marine", status: "Investigation", amount: "₦8,750,000", date: "26 May 2026", priority: "medium" },
];

const PRODUCTS = [
  { name: "Motor Insurance", icon: Car, policies: 4521, premium: "₦680M" },
  { name: "Health Insurance", icon: Heart, policies: 3208, premium: "₦540M" },
  { name: "Property Insurance", icon: HomeIcon, policies: 2104, premium: "₦420M" },
  { name: "Life Insurance", icon: Shield, policies: 1847, premium: "₦380M" },
  { name: "Marine & Aviation", icon: Globe, policies: 892, premium: "₦260M" },
  { name: "Business/Liability", icon: Briefcase, policies: 275, premium: "₦120M" },
];

const NAV_ITEMS = [
  { label: "Dashboard", icon: BarChart3, path: "/" },
  { label: "Policies", icon: FileText, path: "/policies" },
  { label: "Claims", icon: AlertTriangle, path: "/claims" },
  { label: "Underwriting", icon: Shield, path: "/underwriting" },
  { label: "Agents", icon: Users, path: "/agents" },
  { label: "Reinsurance", icon: Layers, path: "/reinsurance" },
  { label: "Compliance", icon: Lock, path: "/compliance" },
  { label: "Analytics", icon: TrendingUp, path: "/analytics" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

// ─── Components ─────────────────────────────────────────────────────────────

function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [location] = useLocation();

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-[#111827] border-r border-[#1e293b] z-50 transform transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 lg:static lg:z-auto`}
      >
        <div className="p-6 border-b border-[#1e293b]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">InsurePortal</h1>
              <p className="text-xs text-slate-400">Insurance Platform</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1">
          {NAV_ITEMS.map(item => (
            <a
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                location === item.path
                  ? "bg-blue-500/10 text-blue-400 font-medium"
                  : "text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </a>
          ))}
        </nav>

        <div className="absolute bottom-4 left-4 right-4 p-3 bg-[#1e293b] rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
              <span className="text-xs font-medium text-blue-400">PM</span>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-200">Patrick Munis</p>
              <p className="text-[10px] text-slate-500">Administrator</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function StatCard({ stat }: { stat: typeof STATS[0] }) {
  const Icon = stat.icon;
  return (
    <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 hover:border-blue-500/30 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-blue-400" />
        </div>
        <span className={`flex items-center gap-1 text-xs font-medium ${
          stat.trend === "up" ? "text-emerald-400" : "text-red-400"
        }`}>
          {stat.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {stat.change}
        </span>
      </div>
      <p className="text-2xl font-bold text-white">{stat.value}</p>
      <p className="text-xs text-slate-400 mt-1">{stat.label}</p>
    </div>
  );
}

function ClaimStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "Under Review": "bg-yellow-500/10 text-yellow-400",
    "Approved": "bg-emerald-500/10 text-emerald-400",
    "Pending Docs": "bg-orange-500/10 text-orange-400",
    "Settled": "bg-blue-500/10 text-blue-400",
    "Investigation": "bg-purple-500/10 text-purple-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-slate-500/10 text-slate-400"}`}>
      {status}
    </span>
  );
}

function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-sm text-slate-400 mt-1">InsurePortal — Nigerian Insurance Management Platform</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map(stat => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Claims */}
        <div className="lg:col-span-2 bg-[#111827] border border-[#1e293b] rounded-xl">
          <div className="p-5 border-b border-[#1e293b] flex items-center justify-between">
            <h3 className="font-semibold text-white">Recent Claims</h3>
            <a href="/claims" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
              View All <ChevronRight className="w-3 h-3" />
            </a>
          </div>
          <div className="divide-y divide-[#1e293b]">
            {RECENT_CLAIMS.map(claim => (
              <div key={claim.id} className="px-5 py-3 flex items-center justify-between hover:bg-[#1e293b]/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    claim.priority === "high" ? "bg-red-400" : claim.priority === "medium" ? "bg-yellow-400" : "bg-emerald-400"
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-white">{claim.id}</p>
                    <p className="text-xs text-slate-400">{claim.type} • {claim.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-white">{claim.amount}</span>
                  <ClaimStatusBadge status={claim.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Products Overview */}
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl">
          <div className="p-5 border-b border-[#1e293b]">
            <h3 className="font-semibold text-white">Insurance Products</h3>
          </div>
          <div className="p-4 space-y-3">
            {PRODUCTS.map(product => (
              <div key={product.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#1e293b]/50 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <product.icon className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{product.name}</p>
                  <p className="text-xs text-slate-400">{product.policies.toLocaleString()} policies</p>
                </div>
                <span className="text-xs font-medium text-emerald-400">{product.premium}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5">
        <h3 className="font-semibold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "New Policy", icon: FileText, color: "blue" },
            { label: "File Claim", icon: AlertTriangle, color: "amber" },
            { label: "Agent Onboarding", icon: Users, color: "emerald" },
            { label: "NAICOM Report", icon: Building2, color: "purple" },
          ].map(action => (
            <button
              key={action.label}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[#1e293b] hover:bg-[#2d3748] transition-colors border border-transparent hover:border-blue-500/20"
            >
              <action.icon className={`w-5 h-5 text-${action.color}-400`} />
              <span className="text-xs font-medium text-slate-300">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Compliance & Regulatory */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-white">NAICOM Compliance</span>
          </div>
          <p className="text-2xl font-bold text-emerald-400">98.2%</p>
          <p className="text-xs text-slate-400 mt-1">All quarterly filings current</p>
        </div>
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-white">Solvency Ratio</span>
          </div>
          <p className="text-2xl font-bold text-blue-400">185%</p>
          <p className="text-xs text-slate-400 mt-1">Above NAICOM minimum (150%)</p>
        </div>
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-medium text-white">Avg. Claim TAT</span>
          </div>
          <p className="text-2xl font-bold text-yellow-400">4.2 days</p>
          <p className="text-xs text-slate-400 mt-1">Target: &lt; 5 business days</p>
        </div>
      </div>
    </div>
  );
}

function PoliciesPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Policy Management</h2>
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-blue-400">Active Policies</p>
            <p className="text-xl font-bold text-white mt-1">12,847</p>
          </div>
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-xs text-emerald-400">New This Month</p>
            <p className="text-xl font-bold text-white mt-1">342</p>
          </div>
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-400">Renewals Due</p>
            <p className="text-xl font-bold text-white mt-1">89</p>
          </div>
        </div>
        <p className="text-sm text-slate-400">Full policy lifecycle management — issuance, endorsements, renewals, cancellations.</p>
      </div>
    </div>
  );
}

function ClaimsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Claims Adjudication</h2>
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-400">Open Claims</p>
            <p className="text-xl font-bold text-white mt-1">1,293</p>
          </div>
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-xs text-yellow-400">Under Investigation</p>
            <p className="text-xl font-bold text-white mt-1">47</p>
          </div>
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-xs text-emerald-400">Settled This Month</p>
            <p className="text-xl font-bold text-white mt-1">218</p>
          </div>
          <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <p className="text-xs text-purple-400">Fraud Flagged</p>
            <p className="text-xl font-bold text-white mt-1">12</p>
          </div>
        </div>
        <p className="text-sm text-slate-400">End-to-end claims processing with AI-powered fraud detection and NAICOM-compliant workflows.</p>
      </div>
    </div>
  );
}

function UnderwritingPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Underwriting Engine</h2>
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-6">
        <p className="text-sm text-slate-400">Risk assessment, pricing models, and automated underwriting decisions for all insurance lines.</p>
      </div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[#0a0e1a]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-h-screen lg:ml-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-[#0a0e1a]/95 backdrop-blur-sm border-b border-[#1e293b] px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-[#1e293b] text-slate-400"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111827] border border-[#1e293b] w-64">
                <Search className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500">Search policies, claims... (Ctrl+K)</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="relative p-2 rounded-lg hover:bg-[#1e293b] text-slate-400">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
              </button>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center">
                <span className="text-xs font-bold text-white">IP</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/policies" component={PoliciesPage} />
            <Route path="/claims" component={ClaimsPage} />
            <Route path="/underwriting" component={UnderwritingPage} />
            <Route>
              <Dashboard />
            </Route>
          </Switch>
        </main>

        {/* Footer */}
        <footer className="border-t border-[#1e293b] px-6 py-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>© 2026 InsurePortal — NAICOM Licensed</span>
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-400" />
              All systems operational
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
