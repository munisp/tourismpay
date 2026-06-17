/**
 * Provider Onboarding Checklist — API provider setup status, compliance steps, go-live readiness
 */

import { useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle, Circle, Clock, ExternalLink, Shield, AlertTriangle,
  Globe, CreditCard, Banknote, Phone, Building2, Zap, ChevronDown, ChevronUp, Copy
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Provider Definitions ───────────────────────────────────────────────────

interface ProviderStep {
  id: string;
  label: string;
  description: string;
  status: "completed" | "in_progress" | "pending" | "blocked";
  link?: string;
  note?: string;
}

interface Provider {
  id: string;
  name: string;
  logo: string;
  category: "payment_rail" | "partner_app" | "messaging" | "card";
  description: string;
  icon: React.ReactNode;
  website: string;
  sandboxUrl?: string;
  docsUrl: string;
  envVars: string[];
  steps: ProviderStep[];
  complianceRequirements: string[];
  estimatedTimeline: string;
}

const PROVIDERS: Provider[] = [
  {
    id: "flutterwave",
    name: "Flutterwave",
    logo: "FW",
    category: "payment_rail",
    description: "Primary payment aggregator for SWIFT, SEPA, ACH, and African mobile money. Licensed IMTO in Nigeria.",
    icon: <Globe className="w-5 h-5" />,
    website: "https://flutterwave.com",
    sandboxUrl: "https://developer.flutterwave.com/docs/integration-guides/testing-helpers",
    docsUrl: "https://developer.flutterwave.com/docs",
    envVars: ["FLUTTERWAVE_SECRET_KEY", "FLUTTERWAVE_PUBLIC_KEY", "FLUTTERWAVE_WEBHOOK_SECRET"],
    steps: [
      { id: "fw-1", label: "Create Developer Account", description: "Register at flutterwave.com/developers", status: "completed", link: "https://dashboard.flutterwave.com/signup" },
      { id: "fw-2", label: "Complete Business Verification", description: "CAC registration, director IDs, BVN verification", status: "completed" },
      { id: "fw-3", label: "Sandbox Integration", description: "Integrate API endpoints for collections & payouts", status: "completed" },
      { id: "fw-4", label: "Webhook Configuration", description: "Configure webhook URL and verify signatures", status: "in_progress", link: "https://developer.flutterwave.com/docs/integration-guides/webhooks" },
      { id: "fw-5", label: "Compliance Review", description: "Submit compliance documents for review by Flutterwave team", status: "pending" },
      { id: "fw-6", label: "Production API Keys", description: "Receive production secret/public keys after compliance approval", status: "pending" },
      { id: "fw-7", label: "Go-Live Testing", description: "Execute test transactions in production with real money", status: "pending" },
    ],
    complianceRequirements: ["CAC Certificate", "Tax Clearance", "AML/CFT Policy", "Director KYC (BVN + NIN)", "PSSP License (for direct collections)"],
    estimatedTimeline: "4–6 weeks",
  },
  {
    id: "wise",
    name: "Wise (TransferWise)",
    logo: "W",
    category: "partner_app",
    description: "International money transfer with mid-market exchange rates. EUR/GBP/USD corridors.",
    icon: <Banknote className="w-5 h-5" />,
    website: "https://wise.com",
    sandboxUrl: "https://api.sandbox.transferwise.tech",
    docsUrl: "https://api-docs.wise.com",
    envVars: ["WISE_API_BASE", "WISE_API_KEY", "WISE_WEBHOOK_SECRET"],
    steps: [
      { id: "w-1", label: "Apply for Business API Access", description: "Submit application at wise.com/business/api", status: "completed", link: "https://wise.com/business/api" },
      { id: "w-2", label: "API Token Generation", description: "Generate read-only and full-access API tokens in sandbox", status: "completed" },
      { id: "w-3", label: "Sandbox Integration", description: "Quote creation, transfer initiation, recipient management", status: "completed" },
      { id: "w-4", label: "Webhook Setup", description: "Configure transfer status webhooks (balance, transfer events)", status: "in_progress" },
      { id: "w-5", label: "Compliance Review", description: "Wise reviews your business model and AML procedures (~2-4 weeks)", status: "pending" },
      { id: "w-6", label: "Production Activation", description: "Switch from sandbox to production API base URL", status: "pending" },
    ],
    complianceRequirements: ["Business Registration Docs", "AML Policy", "Expected Volumes", "Source of Funds Documentation"],
    estimatedTimeline: "2–4 weeks",
  },
  {
    id: "revolut",
    name: "Revolut Business",
    logo: "R",
    category: "partner_app",
    description: "Multi-currency accounts with instant EU/UK transfers. OAuth2 integration.",
    icon: <CreditCard className="w-5 h-5" />,
    website: "https://revolut.com",
    sandboxUrl: "https://sandbox-b2b.revolut.com",
    docsUrl: "https://developer.revolut.com/docs/business",
    envVars: ["REVOLUT_API_BASE", "REVOLUT_API_KEY", "REVOLUT_WEBHOOK_SECRET"],
    steps: [
      { id: "r-1", label: "Register Business API App", description: "Create app at developer.revolut.com", status: "completed", link: "https://developer.revolut.com" },
      { id: "r-2", label: "OAuth2 Client Setup", description: "Configure redirect URIs and generate client credentials", status: "completed" },
      { id: "r-3", label: "Sandbox Testing", description: "Test payment creation, counterparties, and webhooks", status: "in_progress" },
      { id: "r-4", label: "Production Approval", description: "Revolut reviews integration quality and compliance", status: "pending" },
      { id: "r-5", label: "Go-Live", description: "Production API keys issued after approval", status: "pending" },
    ],
    complianceRequirements: ["EU/UK Business Entity", "Regulated Activity Registration", "OAuth2 Security Review"],
    estimatedTimeline: "2–3 weeks",
  },
  {
    id: "remitly",
    name: "Remitly",
    logo: "RM",
    category: "partner_app",
    description: "Enterprise remittance partnership for diaspora corridors. Not self-serve API.",
    icon: <Globe className="w-5 h-5" />,
    website: "https://remitly.com",
    docsUrl: "https://remitly.com/partners",
    envVars: ["REMITLY_API_BASE", "REMITLY_API_KEY", "REMITLY_WEBHOOK_SECRET"],
    steps: [
      { id: "rm-1", label: "Partnership Application", description: "Contact remitly.com/partners for enterprise API access", status: "in_progress", link: "https://remitly.com/partners" },
      { id: "rm-2", label: "Business Review", description: "Remitly evaluates use case, volumes, and compliance posture", status: "pending" },
      { id: "rm-3", label: "Technical Integration", description: "Receive API documentation and sandbox credentials", status: "pending" },
      { id: "rm-4", label: "Compliance Audit", description: "Remitly compliance team reviews AML/CFT procedures", status: "pending" },
      { id: "rm-5", label: "Production Launch", description: "Go-live with monitored rollout", status: "pending" },
    ],
    complianceRequirements: ["MSB License (for US corridors)", "AML/CFT Framework", "KYC Procedures", "Transaction Monitoring"],
    estimatedTimeline: "6–8 weeks",
  },
  {
    id: "lemfi",
    name: "LemFi",
    logo: "LF",
    category: "partner_app",
    description: "African diaspora-focused transfers with zero fees on select corridors.",
    icon: <Banknote className="w-5 h-5" />,
    website: "https://lemfi.com",
    docsUrl: "https://docs.lemfi.com",
    envVars: ["LEMFI_API_BASE", "LEMFI_API_KEY", "LEMFI_WEBHOOK_SECRET"],
    steps: [
      { id: "lf-1", label: "Partnership Application", description: "Apply at lemfi.com for API partner access", status: "in_progress", link: "https://lemfi.com" },
      { id: "lf-2", label: "Sandbox Access", description: "Receive sandbox API key and test endpoints", status: "pending" },
      { id: "lf-3", label: "Integration & Testing", description: "Quote, transfer, and webhook integration", status: "pending" },
      { id: "lf-4", label: "Production Keys", description: "Go-live after LemFi review", status: "pending" },
    ],
    complianceRequirements: ["Business Registration", "AML Policy", "KYC Procedures"],
    estimatedTimeline: "3–4 weeks",
  },
  {
    id: "africastalking",
    name: "Africa's Talking",
    logo: "AT",
    category: "messaging",
    description: "USSD gateway, SMS, and voice API for African markets. Powers *555# shortcode.",
    icon: <Phone className="w-5 h-5" />,
    website: "https://africastalking.com",
    sandboxUrl: "https://simulator.africastalking.com",
    docsUrl: "https://developers.africastalking.com/docs/ussd",
    envVars: ["AFRICASTALKING_API_KEY", "AFRICASTALKING_USERNAME"],
    steps: [
      { id: "at-1", label: "Create Developer Account", description: "Register at africastalking.com (self-serve)", status: "completed", link: "https://account.africastalking.com/auth/register" },
      { id: "at-2", label: "Generate API Key", description: "API key available immediately in dashboard", status: "completed" },
      { id: "at-3", label: "Sandbox USSD Testing", description: "Test USSD menu flows using AT simulator", status: "completed" },
      { id: "at-4", label: "NCC Shortcode Registration", description: "Apply to Nigerian Communications Commission for *555# shortcode", status: "in_progress", note: "NCC approval typically takes 4-8 weeks" },
      { id: "at-5", label: "Production USSD Binding", description: "Bind approved shortcode to Africa's Talking callback URL", status: "pending" },
      { id: "at-6", label: "SMS Sender ID Registration", description: "Register 'TourismPay' as sender ID for OTP/alerts", status: "pending" },
    ],
    complianceRequirements: ["NCC Shortcode License", "SMS Sender ID Registration", "Data Protection Compliance"],
    estimatedTimeline: "4–8 weeks (NCC dependent)",
  },
  {
    id: "stripe",
    name: "Stripe",
    logo: "S",
    category: "card",
    description: "Card processing (Visa/Mastercard), Stripe Connect for merchant payouts.",
    icon: <CreditCard className="w-5 h-5" />,
    website: "https://stripe.com",
    sandboxUrl: "https://dashboard.stripe.com/test",
    docsUrl: "https://stripe.com/docs",
    envVars: ["STRIPE_SECRET_KEY", "VITE_STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"],
    steps: [
      { id: "s-1", label: "Create Stripe Account", description: "Account created and verified", status: "completed", link: "https://dashboard.stripe.com" },
      { id: "s-2", label: "API Key Configuration", description: "Test and live keys generated", status: "completed" },
      { id: "s-3", label: "Payment Integration", description: "Checkout sessions, payment intents, webhooks", status: "completed" },
      { id: "s-4", label: "Connect Platform Setup", description: "Stripe Connect for merchant payouts", status: "completed" },
      { id: "s-5", label: "Webhook Verification", description: "Endpoint signature verification configured", status: "completed" },
      { id: "s-6", label: "3D Secure Configuration", description: "SCA/3DS2 for European card payments", status: "completed" },
      { id: "s-7", label: "Production Go-Live", description: "Switch to live keys, monitoring active", status: "completed" },
    ],
    complianceRequirements: ["PCI-DSS Level 4 (via Stripe.js)", "KYB for Connect accounts", "Dispute Policy"],
    estimatedTimeline: "Complete ✓",
  },
];

// ─── Helper Functions ───────────────────────────────────────────────────────

function getProviderProgress(provider: Provider): number {
  const completed = provider.steps.filter(s => s.status === "completed").length;
  return Math.round((completed / provider.steps.length) * 100);
}

function getProviderStatus(provider: Provider): "live" | "in_progress" | "not_started" {
  const progress = getProviderProgress(provider);
  if (progress === 100) return "live";
  if (progress > 0) return "in_progress";
  return "not_started";
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case "in_progress": return <Clock className="w-4 h-4 text-amber-400 animate-pulse" />;
    case "blocked": return <AlertTriangle className="w-4 h-4 text-red-400" />;
    default: return <Circle className="w-4 h-4 text-zinc-600" />;
  }
}

function getStatusBadge(status: "live" | "in_progress" | "not_started") {
  switch (status) {
    case "live": return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Live</Badge>;
    case "in_progress": return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">In Progress</Badge>;
    case "not_started": return <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30">Not Started</Badge>;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ProviderOnboarding() {
  const [expandedProvider, setExpandedProvider] = useState<string | null>("flutterwave");

  const totalProviders = PROVIDERS.length;
  const liveProviders = PROVIDERS.filter(p => getProviderStatus(p) === "live").length;
  const inProgressProviders = PROVIDERS.filter(p => getProviderStatus(p) === "in_progress").length;
  const totalSteps = PROVIDERS.reduce((sum, p) => sum + p.steps.length, 0);
  const completedSteps = PROVIDERS.reduce((sum, p) => sum + p.steps.filter(s => s.status === "completed").length, 0);
  const overallProgress = Math.round((completedSteps / totalSteps) * 100);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Provider Onboarding"
        subtitle="API integration status, compliance checklist, and go-live readiness for all payment providers"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-400">{liveProviders}/{totalProviders}</div>
            <div className="text-xs text-zinc-500 mt-1">Providers Live</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-400">{inProgressProviders}</div>
            <div className="text-xs text-zinc-500 mt-1">In Progress</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-white">{completedSteps}/{totalSteps}</div>
            <div className="text-xs text-zinc-500 mt-1">Steps Complete</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-white">{overallProgress}%</div>
            <Progress value={overallProgress} className="mt-2 h-1.5" />
            <div className="text-xs text-zinc-500 mt-1">Overall Progress</div>
          </CardContent>
        </Card>
      </div>

      {/* Provider Cards */}
      <div className="space-y-3">
        {PROVIDERS.map((provider) => {
          const isExpanded = expandedProvider === provider.id;
          const progress = getProviderProgress(provider);
          const status = getProviderStatus(provider);

          return (
            <Card key={provider.id} className="bg-zinc-900 border-zinc-800 overflow-hidden">
              {/* Header — always visible */}
              <button
                className="w-full text-left p-4 sm:p-5 flex items-center gap-4 hover:bg-zinc-800/50 transition-colors"
                onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
              >
                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {provider.logo}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white">{provider.name}</span>
                    {getStatusBadge(status)}
                    <Badge variant="outline" className="text-xs text-zinc-500 border-zinc-700">
                      {provider.category.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="text-sm text-zinc-500 mt-0.5 truncate">{provider.description}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-sm font-medium text-white">{progress}%</span>
                    <Progress value={progress} className="w-24 h-1.5 mt-1" />
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-zinc-800 p-4 sm:p-5 space-y-5">
                  {/* Links */}
                  <div className="flex flex-wrap gap-2">
                    <a href={provider.website} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="text-xs gap-1.5">
                        <ExternalLink className="w-3 h-3" /> Website
                      </Button>
                    </a>
                    <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="text-xs gap-1.5">
                        <ExternalLink className="w-3 h-3" /> API Docs
                      </Button>
                    </a>
                    {provider.sandboxUrl && (
                      <a href={provider.sandboxUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="text-xs gap-1.5">
                          <Zap className="w-3 h-3" /> Sandbox
                        </Button>
                      </a>
                    )}
                  </div>

                  {/* Setup Steps */}
                  <div>
                    <h4 className="text-sm font-medium text-zinc-300 mb-3">Setup Steps</h4>
                    <div className="space-y-2">
                      {provider.steps.map((step, idx) => (
                        <div key={step.id} className="flex items-start gap-3 group">
                          <div className="mt-0.5 shrink-0">{getStatusIcon(step.status)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-medium ${step.status === "completed" ? "text-zinc-400 line-through" : "text-white"}`}>
                                {idx + 1}. {step.label}
                              </span>
                              {step.link && (
                                <a href={step.link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 mt-0.5">{step.description}</p>
                            {step.note && (
                              <p className="text-xs text-amber-400/80 mt-0.5 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> {step.note}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Environment Variables */}
                  <div>
                    <h4 className="text-sm font-medium text-zinc-300 mb-2">Environment Variables</h4>
                    <div className="bg-zinc-950 rounded-lg p-3 space-y-1 font-mono text-xs">
                      {provider.envVars.map(v => (
                        <div key={v} className="flex items-center justify-between group">
                          <span className="text-emerald-400">{v}</span>
                          <button
                            className="text-zinc-600 hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(v);
                              toast.success(`Copied ${v}`);
                            }}
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Compliance Requirements */}
                  <div>
                    <h4 className="text-sm font-medium text-zinc-300 mb-2 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" /> Compliance Requirements
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {provider.complianceRequirements.map(req => (
                        <Badge key={req} variant="outline" className="text-xs text-zinc-400 border-zinc-700">
                          {req}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Clock className="w-4 h-4" />
                    <span>Estimated timeline: <strong className="text-white">{provider.estimatedTimeline}</strong></span>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
