/**
 * API Health-Check Dashboard — Real-time monitoring of all external API connections
 */

import { useState, useEffect } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Activity, CheckCircle, XCircle, Clock, RefreshCw, Wifi, WifiOff,
  Shield, AlertTriangle, BarChart3, Globe, CreditCard, Phone, Banknote,
  ArrowUpRight, ArrowDownRight, Minus, Zap, Server
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ServiceEndpoint {
  id: string;
  name: string;
  provider: string;
  category: "payment" | "partner" | "messaging" | "infrastructure" | "settlement";
  icon: React.ReactNode;
  url: string;
  method: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  latencyMs: number;
  lastChecked: Date;
  uptimePercent: number;
  errorRate: number;
  circuitBreaker: "closed" | "half_open" | "open";
  lastError?: string;
  checksLast24h: number;
  failuresLast24h: number;
}

// ─── Mock Data (would be replaced by tRPC query in production) ──────────────

function generateEndpoints(): ServiceEndpoint[] {
  const now = new Date();
  return [
    {
      id: "flutterwave-collections", name: "Collections API", provider: "Flutterwave",
      category: "payment", icon: <Globe className="w-4 h-4" />,
      url: "https://api.flutterwave.com/v3/charges", method: "POST",
      status: "healthy", latencyMs: 245, lastChecked: now, uptimePercent: 99.94,
      errorRate: 0.06, circuitBreaker: "closed", checksLast24h: 1440, failuresLast24h: 1,
    },
    {
      id: "flutterwave-payouts", name: "Payouts API", provider: "Flutterwave",
      category: "payment", icon: <Globe className="w-4 h-4" />,
      url: "https://api.flutterwave.com/v3/transfers", method: "POST",
      status: "healthy", latencyMs: 312, lastChecked: now, uptimePercent: 99.87,
      errorRate: 0.13, circuitBreaker: "closed", checksLast24h: 1440, failuresLast24h: 2,
    },
    {
      id: "wise-quotes", name: "Quote API", provider: "Wise",
      category: "partner", icon: <Banknote className="w-4 h-4" />,
      url: "https://api.transferwise.com/v3/quotes", method: "POST",
      status: "healthy", latencyMs: 189, lastChecked: now, uptimePercent: 99.98,
      errorRate: 0.02, circuitBreaker: "closed", checksLast24h: 1440, failuresLast24h: 0,
    },
    {
      id: "wise-transfers", name: "Transfer API", provider: "Wise",
      category: "partner", icon: <Banknote className="w-4 h-4" />,
      url: "https://api.transferwise.com/v1/transfers", method: "POST",
      status: "healthy", latencyMs: 267, lastChecked: now, uptimePercent: 99.95,
      errorRate: 0.05, circuitBreaker: "closed", checksLast24h: 1440, failuresLast24h: 1,
    },
    {
      id: "revolut-payments", name: "Payments API", provider: "Revolut",
      category: "partner", icon: <CreditCard className="w-4 h-4" />,
      url: "https://b2b.revolut.com/api/1.0/pay", method: "POST",
      status: "degraded", latencyMs: 1250, lastChecked: now, uptimePercent: 98.60,
      errorRate: 1.4, circuitBreaker: "half_open", lastError: "Timeout after 5000ms at 14:23 UTC",
      checksLast24h: 1440, failuresLast24h: 20,
    },
    {
      id: "remitly-transfers", name: "Transfer API", provider: "Remitly",
      category: "partner", icon: <Globe className="w-4 h-4" />,
      url: "https://api.remitly.io/v3/transfers", method: "POST",
      status: "healthy", latencyMs: 345, lastChecked: now, uptimePercent: 99.72,
      errorRate: 0.28, circuitBreaker: "closed", checksLast24h: 1440, failuresLast24h: 4,
    },
    {
      id: "lemfi-transfers", name: "Transfer API", provider: "LemFi",
      category: "partner", icon: <Banknote className="w-4 h-4" />,
      url: "https://api.lemfi.com/v1/transfers", method: "POST",
      status: "healthy", latencyMs: 198, lastChecked: now, uptimePercent: 99.91,
      errorRate: 0.09, circuitBreaker: "closed", checksLast24h: 1440, failuresLast24h: 1,
    },
    {
      id: "africastalking-ussd", name: "USSD Gateway", provider: "Africa's Talking",
      category: "messaging", icon: <Phone className="w-4 h-4" />,
      url: "https://api.africastalking.com/ussd", method: "POST",
      status: "healthy", latencyMs: 85, lastChecked: now, uptimePercent: 99.99,
      errorRate: 0.01, circuitBreaker: "closed", checksLast24h: 1440, failuresLast24h: 0,
    },
    {
      id: "africastalking-sms", name: "SMS API", provider: "Africa's Talking",
      category: "messaging", icon: <Phone className="w-4 h-4" />,
      url: "https://api.africastalking.com/version1/messaging", method: "POST",
      status: "healthy", latencyMs: 112, lastChecked: now, uptimePercent: 99.97,
      errorRate: 0.03, circuitBreaker: "closed", checksLast24h: 1440, failuresLast24h: 0,
    },
    {
      id: "stripe-payments", name: "Payment Intents", provider: "Stripe",
      category: "payment", icon: <CreditCard className="w-4 h-4" />,
      url: "https://api.stripe.com/v1/payment_intents", method: "POST",
      status: "healthy", latencyMs: 156, lastChecked: now, uptimePercent: 99.99,
      errorRate: 0.01, circuitBreaker: "closed", checksLast24h: 1440, failuresLast24h: 0,
    },
    {
      id: "stripe-connect", name: "Connect Payouts", provider: "Stripe",
      category: "payment", icon: <CreditCard className="w-4 h-4" />,
      url: "https://api.stripe.com/v1/transfers", method: "POST",
      status: "healthy", latencyMs: 203, lastChecked: now, uptimePercent: 99.98,
      errorRate: 0.02, circuitBreaker: "closed", checksLast24h: 1440, failuresLast24h: 0,
    },
    {
      id: "go-settlement", name: "Settlement Service", provider: "Internal (Go)",
      category: "settlement", icon: <Server className="w-4 h-4" />,
      url: "http://localhost:8081/health", method: "GET",
      status: "healthy", latencyMs: 3, lastChecked: now, uptimePercent: 100,
      errorRate: 0, circuitBreaker: "closed", checksLast24h: 8640, failuresLast24h: 0,
    },
    {
      id: "go-wire", name: "Wire Transfer Service", provider: "Internal (Go)",
      category: "settlement", icon: <Server className="w-4 h-4" />,
      url: "http://localhost:8081/api/v1/wire/quote", method: "POST",
      status: "healthy", latencyMs: 12, lastChecked: now, uptimePercent: 100,
      errorRate: 0, circuitBreaker: "closed", checksLast24h: 8640, failuresLast24h: 0,
    },
    {
      id: "go-ussd", name: "USSD Callback Handler", provider: "Internal (Go)",
      category: "settlement", icon: <Server className="w-4 h-4" />,
      url: "http://localhost:8081/api/v1/ussd/callback", method: "POST",
      status: "healthy", latencyMs: 8, lastChecked: now, uptimePercent: 100,
      errorRate: 0, circuitBreaker: "closed", checksLast24h: 8640, failuresLast24h: 0,
    },
    {
      id: "gtbank-swift", name: "Virtual IBAN / SWIFT", provider: "GTBank",
      category: "payment", icon: <Globe className="w-4 h-4" />,
      url: "https://api.gtbank.com/v1/virtual-iban", method: "POST",
      status: "healthy", latencyMs: 320, lastChecked: now, uptimePercent: 99.85,
      errorRate: 0.15, circuitBreaker: "closed", checksLast24h: 1440, failuresLast24h: 2,
    },
    {
      id: "currencycloud-convert", name: "Conversion API", provider: "CurrencyCloud",
      category: "payment", icon: <Globe className="w-4 h-4" />,
      url: "https://devapi.currencycloud.com/v2/conversions/create", method: "POST",
      status: "healthy", latencyMs: 178, lastChecked: now, uptimePercent: 99.97,
      errorRate: 0.03, circuitBreaker: "closed", checksLast24h: 1440, failuresLast24h: 0,
    },
    {
      id: "currencycloud-payments", name: "Virtual Accounts", provider: "CurrencyCloud",
      category: "payment", icon: <Globe className="w-4 h-4" />,
      url: "https://devapi.currencycloud.com/v2/virtual_accounts", method: "GET",
      status: "healthy", latencyMs: 145, lastChecked: now, uptimePercent: 99.99,
      errorRate: 0.01, circuitBreaker: "closed", checksLast24h: 1440, failuresLast24h: 0,
    },
    {
      id: "banking-circle-payments", name: "SEPA/SWIFT Payments", provider: "Banking Circle",
      category: "payment", icon: <Globe className="w-4 h-4" />,
      url: "https://sandbox.bankingcircle.com/api/v1/payments", method: "POST",
      status: "healthy", latencyMs: 210, lastChecked: now, uptimePercent: 99.92,
      errorRate: 0.08, circuitBreaker: "closed", checksLast24h: 1440, failuresLast24h: 1,
    },
    {
      id: "go-bank-partner", name: "Bank Partner Service", provider: "Internal (Go)",
      category: "settlement", icon: <Server className="w-4 h-4" />,
      url: "http://localhost:8081/api/v1/bank-partner/providers", method: "GET",
      status: "healthy", latencyMs: 5, lastChecked: now, uptimePercent: 100,
      errorRate: 0, circuitBreaker: "closed", checksLast24h: 8640, failuresLast24h: 0,
    },
  ];
}

// ─── Helper Functions ───────────────────────────────────────────────────────

function getStatusColor(status: string) {
  switch (status) {
    case "healthy": return "text-emerald-400";
    case "degraded": return "text-amber-400";
    case "down": return "text-red-400";
    default: return "text-zinc-500";
  }
}

function getStatusBg(status: string) {
  switch (status) {
    case "healthy": return "bg-emerald-500/20 border-emerald-500/30";
    case "degraded": return "bg-amber-500/20 border-amber-500/30";
    case "down": return "bg-red-500/20 border-red-500/30";
    default: return "bg-zinc-500/20 border-zinc-500/30";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "healthy": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case "degraded": return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    case "down": return <XCircle className="w-4 h-4 text-red-400" />;
    default: return <Clock className="w-4 h-4 text-zinc-500" />;
  }
}

function getCircuitBreakerBadge(state: string) {
  switch (state) {
    case "closed": return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Closed</Badge>;
    case "half_open": return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">Half-Open</Badge>;
    case "open": return <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px]">Open</Badge>;
    default: return null;
  }
}

function getLatencyTrend(latencyMs: number) {
  if (latencyMs < 200) return <ArrowDownRight className="w-3 h-3 text-emerald-400" />;
  if (latencyMs < 500) return <Minus className="w-3 h-3 text-zinc-500" />;
  return <ArrowUpRight className="w-3 h-3 text-red-400" />;
}

function formatTimeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

// ─── Category Filter ────────────────────────────────────────────────────────

type CategoryFilter = "all" | "payment" | "partner" | "messaging" | "settlement";

const CATEGORY_FILTERS: { id: CategoryFilter; label: string }[] = [
  { id: "all", label: "All Services" },
  { id: "payment", label: "Payment Rails" },
  { id: "partner", label: "Partner APIs" },
  { id: "messaging", label: "Messaging" },
  { id: "settlement", label: "Internal" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function ApiHealthDashboard() {
  const [endpoints, setEndpoints] = useState<ServiceEndpoint[]>(generateEndpoints);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setEndpoints(generateEndpoints());
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setEndpoints(generateEndpoints());
      setIsRefreshing(false);
      toast.success("Health checks refreshed");
    }, 800);
  };

  const filtered = filter === "all" ? endpoints : endpoints.filter(e => e.category === filter);
  const healthyCount = endpoints.filter(e => e.status === "healthy").length;
  const degradedCount = endpoints.filter(e => e.status === "degraded").length;
  const downCount = endpoints.filter(e => e.status === "down").length;
  const avgLatency = Math.round(endpoints.reduce((sum, e) => sum + e.latencyMs, 0) / endpoints.length);
  const avgUptime = (endpoints.reduce((sum, e) => sum + e.uptimePercent, 0) / endpoints.length).toFixed(2);
  const openCircuitBreakers = endpoints.filter(e => e.circuitBreaker === "open").length;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader
          title="API Health Monitor"
          subtitle="Real-time status of all external API connections and internal services"
        />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={`text-xs gap-1.5 ${autoRefresh ? "text-emerald-400 border-emerald-500/30" : ""}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {autoRefresh ? "Auto" : "Manual"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-3 sm:p-4 text-center">
            <div className="text-xl sm:text-2xl font-bold text-emerald-400">{healthyCount}</div>
            <div className="text-[10px] sm:text-xs text-zinc-500">Healthy</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-3 sm:p-4 text-center">
            <div className="text-xl sm:text-2xl font-bold text-amber-400">{degradedCount}</div>
            <div className="text-[10px] sm:text-xs text-zinc-500">Degraded</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-3 sm:p-4 text-center">
            <div className="text-xl sm:text-2xl font-bold text-red-400">{downCount}</div>
            <div className="text-[10px] sm:text-xs text-zinc-500">Down</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-3 sm:p-4 text-center">
            <div className="text-xl sm:text-2xl font-bold text-white">{avgLatency}ms</div>
            <div className="text-[10px] sm:text-xs text-zinc-500">Avg Latency</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-3 sm:p-4 text-center">
            <div className="text-xl sm:text-2xl font-bold text-white">{avgUptime}%</div>
            <div className="text-[10px] sm:text-xs text-zinc-500">Avg Uptime</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-3 sm:p-4 text-center">
            <div className={`text-xl sm:text-2xl font-bold ${openCircuitBreakers > 0 ? "text-red-400" : "text-emerald-400"}`}>
              {openCircuitBreakers}
            </div>
            <div className="text-[10px] sm:text-xs text-zinc-500">Open Breakers</div>
          </CardContent>
        </Card>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: "touch" }}>
        {CATEGORY_FILTERS.map(f => (
          <button
            key={f.id}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f.id
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-800"
            }`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Endpoint Cards */}
      <div className="space-y-2">
        {filtered.map(endpoint => (
          <Card key={endpoint.id} className={`bg-zinc-900 border-zinc-800 ${endpoint.status === "degraded" ? "border-l-2 border-l-amber-500" : endpoint.status === "down" ? "border-l-2 border-l-red-500" : ""}`}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-3">
                {/* Status + Icon */}
                <div className="shrink-0">{getStatusIcon(endpoint.status)}</div>
                <div className="shrink-0 w-8 h-8 rounded bg-zinc-800 flex items-center justify-center">
                  {endpoint.icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">{endpoint.provider}</span>
                    <span className="text-xs text-zinc-500">→</span>
                    <span className="text-sm text-zinc-300">{endpoint.name}</span>
                    {getCircuitBreakerBadge(endpoint.circuitBreaker)}
                  </div>
                  <div className="text-[10px] text-zinc-600 font-mono mt-0.5 truncate">
                    {endpoint.method} {endpoint.url}
                  </div>
                  {endpoint.lastError && (
                    <div className="text-[10px] text-amber-400/70 mt-0.5 flex items-center gap-1">
                      <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> {endpoint.lastError}
                    </div>
                  )}
                </div>

                {/* Metrics */}
                <div className="hidden sm:flex items-center gap-4 shrink-0 text-right">
                  <div>
                    <div className="flex items-center gap-1 justify-end">
                      <span className={`text-sm font-mono font-medium ${endpoint.latencyMs > 1000 ? "text-red-400" : endpoint.latencyMs > 500 ? "text-amber-400" : "text-white"}`}>
                        {endpoint.latencyMs}ms
                      </span>
                      {getLatencyTrend(endpoint.latencyMs)}
                    </div>
                    <div className="text-[10px] text-zinc-600">latency</div>
                  </div>
                  <div>
                    <div className={`text-sm font-mono font-medium ${endpoint.uptimePercent >= 99.9 ? "text-emerald-400" : endpoint.uptimePercent >= 99 ? "text-amber-400" : "text-red-400"}`}>
                      {endpoint.uptimePercent}%
                    </div>
                    <div className="text-[10px] text-zinc-600">uptime</div>
                  </div>
                  <div>
                    <div className={`text-sm font-mono font-medium ${endpoint.errorRate < 0.1 ? "text-emerald-400" : endpoint.errorRate < 1 ? "text-amber-400" : "text-red-400"}`}>
                      {endpoint.errorRate}%
                    </div>
                    <div className="text-[10px] text-zinc-600">error</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">{endpoint.failuresLast24h}/{endpoint.checksLast24h}</div>
                    <div className="text-[10px] text-zinc-600">fail/24h</div>
                  </div>
                </div>

                {/* Mobile metrics */}
                <div className="sm:hidden flex flex-col items-end shrink-0">
                  <span className={`text-xs font-mono ${endpoint.latencyMs > 500 ? "text-amber-400" : "text-white"}`}>{endpoint.latencyMs}ms</span>
                  <span className="text-[10px] text-zinc-500">{endpoint.uptimePercent}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Legend */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-emerald-400" />
              <span><strong>Closed</strong> — Circuit breaker normal, traffic flowing</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-amber-400" />
              <span><strong>Half-Open</strong> — Testing recovery, limited traffic</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-red-400" />
              <span><strong>Open</strong> — Failover active, no traffic to provider</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
