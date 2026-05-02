/**
 * MLServicesDashboard.tsx
 *
 * Admin dashboard for the 5 Python ML/AI microservices.
 * Shows service health, live test panels for each service,
 * and a quick reference for available endpoints.
 *
 * Accessible to: admin only
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { RoleGuard } from "@/components/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  RefreshCw, CheckCircle, XCircle, AlertCircle, Brain,
  Shield, DollarSign, FileText, Activity,
} from "lucide-react";

// ─── Service metadata ────────────────────────────────────────────────────────

const SERVICES = [
  {
    key: "bis-ai-engine",
    label: "BIS AI Engine",
    port: 8001,
    icon: Brain,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    description: "Risk scoring and entity profiling for Background Investigation Service",
    endpoints: ["/api/v1/risk-score", "/api/v1/entity-profile", "/api/v1/auto-flag", "/api/v1/risk-heatmap"],
  },
  {
    key: "fraud-ml-service",
    label: "Fraud ML Service",
    port: 8002,
    icon: Shield,
    color: "text-red-400",
    bg: "bg-red-500/10",
    description: "Real-time fraud scoring and anomaly detection for transactions",
    endpoints: ["/api/v1/fraud/score", "/api/v1/fraud/anomaly", "/api/v1/fraud/stats"],
  },
  {
    key: "compliance-risk-engine",
    label: "Compliance Risk Engine",
    port: 8003,
    icon: Shield,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    description: "AML risk scoring, PEP screening, sanctions checks, KYB document scoring",
    endpoints: ["/api/v1/aml/risk-score", "/api/v1/pep/screen", "/api/v1/sanctions/screen", "/api/v1/kyb/document-score"],
  },
  {
    key: "exchange-rate-ml",
    label: "Exchange Rate ML",
    port: 8004,
    icon: DollarSign,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    description: "Rate forecasting, spread optimisation, and corridor pricing",
    endpoints: ["/api/v1/rates/forecast", "/api/v1/rates/optimize-spread", "/api/v1/rates/corridor-pricing"],
  },
  {
    key: "pdf-report-generator",
    label: "PDF Report Generator",
    port: 8005,
    icon: FileText,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    description: "Generates PDF reports for merchant revenue, BIS investigations, settlement, and compliance",
    endpoints: ["/api/v1/reports/merchant-revenue", "/api/v1/reports/bis-investigation", "/api/v1/reports/settlement-statement", "/api/v1/reports/compliance"],
  },
];

// ─── Fraud Score Test Panel ───────────────────────────────────────────────────

function FraudScorePanel() {
  const [txId, setTxId] = useState("TXN-TEST-001");
  const [amount, setAmount] = useState("250");
  const [currency, setCurrency] = useState("USD");
  const [result, setResult] = useState<any>(null);

  const mut = trpc.pythonServices.fraudScore.useMutation({
    onSuccess: (data) => setResult(data),
    onError: (err) => toast.error(`Fraud score failed: ${err.message}`),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Test the fraud ML service with a sample transaction.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Transaction ID</Label>
          <Input value={txId} onChange={(e) => setTxId(e.target.value)} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <Label className="text-xs">Amount</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <Label className="text-xs">Currency</Label>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-8 text-xs mt-1" />
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => mut.mutate({
          transactionId: txId,
          userId: "test-user",
          amount: Number(amount),
          currency,
        })}
        disabled={mut.isPending}
        className="gap-1"
      >
        {mut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
        Run Fraud Score
      </Button>
      {result && (
        <Textarea
          readOnly
          value={JSON.stringify(result, null, 2)}
          className="text-xs font-mono h-32 resize-none"
        />
      )}
    </div>
  );
}

// ─── Rates Forecast Test Panel ───────────────────────────────────────────────

function RatesForecastPanel() {
  const [base, setBase] = useState("USD");
  const [quote, setQuote] = useState("EUR");
  const [currentRate, setCurrentRate] = useState("0.92");
  const [result, setResult] = useState<any>(null);

  const mut = trpc.pythonServices.ratesForecast.useMutation({
    onSuccess: (data) => setResult(data),
    onError: (err) => toast.error(`Rates forecast failed: ${err.message}`),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Test the exchange rate ML forecasting service.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Base Currency</Label>
          <Input value={base} onChange={(e) => setBase(e.target.value)} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <Label className="text-xs">Quote Currency</Label>
          <Input value={quote} onChange={(e) => setQuote(e.target.value)} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <Label className="text-xs">Current Rate</Label>
          <Input type="number" step="0.0001" value={currentRate} onChange={(e) => setCurrentRate(e.target.value)} className="h-8 text-xs mt-1" />
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => mut.mutate({
          baseCurrency: base,
          quoteCurrency: quote,
          currentRate: Number(currentRate),
          horizonHours: 24,
        })}
        disabled={mut.isPending}
        className="gap-1"
      >
        {mut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
        Run Forecast
      </Button>
      {result && (
        <Textarea
          readOnly
          value={JSON.stringify(result, null, 2)}
          className="text-xs font-mono h-32 resize-none"
        />
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MLServicesDashboard() {
  const [activeTest, setActiveTest] = useState<string | null>(null);

  const { data: health, isLoading, refetch } = trpc.pythonServices.healthCheck.useQuery(
    undefined,
    { refetchInterval: 30_000 }
  );

  const healthMap = (health ?? []).reduce((acc: Record<string, any>, svc: any) => {
    acc[svc.name] = svc;
    return acc;
  }, {} as Record<string, any>);

  const healthyCount = (health ?? []).filter((s: any) => s.status === "healthy").length;
  const totalCount = SERVICES.length;

  return (
    <RoleGuard roles={["admin"]}>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">ML / AI Services</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Monitor and test the 5 Python FastAPI microservices powering BIS, fraud detection, compliance, exchange rates, and PDF generation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={healthyCount === totalCount
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : healthyCount > 0
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-red-500/10 text-red-400 border-red-500/20"}
            >
              {healthyCount}/{totalCount} services online
            </Badge>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1">
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Service Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {SERVICES.map((svc) => {
            const Icon = svc.icon;
            const h = healthMap[svc.key];
            const status = h?.status ?? "unreachable";
            const isHealthy = status === "healthy";
            const isActive = activeTest === svc.key;

            return (
              <Card key={svc.key} className="bg-card border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${svc.bg}`}>
                        <Icon className={`w-4 h-4 ${svc.color}`} />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold">{svc.label}</CardTitle>
                        <p className="text-xs text-muted-foreground font-mono">localhost:{svc.port}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={isHealthy
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs"
                        : "bg-orange-500/10 text-orange-400 border-orange-500/20 text-xs"}
                    >
                      {isHealthy ? (
                        <CheckCircle className="w-3 h-3 mr-1" />
                      ) : (
                        <AlertCircle className="w-3 h-3 mr-1" />
                      )}
                      {isHealthy ? "Online" : "Offline"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">{svc.description}</p>

                  {/* Endpoints */}
                  <div className="flex flex-wrap gap-1">
                    {svc.endpoints.map((ep) => (
                      <code key={ep} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                        {ep}
                      </code>
                    ))}
                  </div>

                  {/* Test panel toggle */}
                  {(svc.key === "fraud-ml-service" || svc.key === "exchange-rate-ml") && (
                    <>
                      <Separator />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs gap-1"
                        onClick={() => setActiveTest(isActive ? null : svc.key)}
                      >
                        <Activity className="w-3.5 h-3.5" />
                        {isActive ? "Hide Test Panel" : "Open Test Panel"}
                      </Button>
                      {isActive && (
                        <div className="pt-1">
                          {svc.key === "fraud-ml-service" && <FraudScorePanel />}
                          {svc.key === "exchange-rate-ml" && <RatesForecastPanel />}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Startup instructions */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Starting the Python Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>All 5 services are included in the archive under <code className="font-mono bg-muted px-1 rounded">07-python-services/</code>. Start them with Docker Compose:</p>
              <pre className="bg-muted rounded p-3 font-mono text-xs overflow-x-auto">
{`cd 07-python-services
docker-compose up -d

# Or start individually:
# Port 8001 — BIS AI Engine
uvicorn bis_ai_engine.main:app --port 8001

# Port 8002 — Fraud ML Service
uvicorn fraud_ml_service.main:app --port 8002

# Port 8003 — Compliance Risk Engine
uvicorn compliance_risk_engine.main:app --port 8003

# Port 8004 — Exchange Rate ML
uvicorn exchange_rate_ml.main:app --port 8004

# Port 8005 — PDF Report Generator
uvicorn pdf_report_generator.main:app --port 8005`}
              </pre>
              <p>Set the corresponding environment variables to override default localhost URLs in production:</p>
              <div className="grid grid-cols-2 gap-1 font-mono">
                {[
                  ["BIS_AI_ENGINE_URL", "http://bis-ai:8001"],
                  ["FRAUD_ML_SERVICE_URL", "http://fraud-ml:8002"],
                  ["COMPLIANCE_RISK_ENGINE_URL", "http://compliance:8003"],
                  ["EXCHANGE_RATE_ML_URL", "http://exchange-rate-ml:8004"],
                  ["PDF_REPORT_GENERATOR_URL", "http://pdf-reports:8005"],
                ].map(([key, val]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-foreground">{key}</span>
                    <span className="text-muted-foreground">=</span>
                    <span className="text-emerald-400">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}
