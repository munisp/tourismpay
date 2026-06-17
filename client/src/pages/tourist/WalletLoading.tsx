/**
 * Foreign Tourist Wallet Loading — Unified loading page
 *
 * 4 tabs: Wire Transfer, Cash (Agent), Partner Apps, USSD
 * Mobile-first responsive design matching existing PWA patterns.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Banknote,
  Building2,
  CreditCard,
  Globe,
  Phone,
  ArrowRight,
  Copy,
  CheckCircle,
  Clock,
  Shield,
  Smartphone,
  Wallet,
  Send,
  QrCode,
} from "lucide-react";

// ─── Tab Types ──────────────────────────────────────────────────────────────

type LoadingTab = "wire" | "agent" | "partner" | "ussd";

const TABS: { id: LoadingTab; label: string; icon: React.ReactNode; description: string }[] = [
  { id: "wire", label: "Wire Transfer", icon: <Building2 className="w-4 h-4" />, description: "SWIFT, SEPA, ACH" },
  { id: "agent", label: "Cash at Kiosk", icon: <Banknote className="w-4 h-4" />, description: "Airport BDC" },
  { id: "partner", label: "Partner Apps", icon: <Globe className="w-4 h-4" />, description: "Wise, Revolut" },
  { id: "ussd", label: "USSD", icon: <Phone className="w-4 h-4" />, description: "Feature phone" },
];

const SOURCE_CURRENCIES = ["USD", "EUR", "GBP", "CHF", "CAD", "AUD"];
const TARGET_CURRENCIES = ["USDC", "NGN", "KES", "GHS", "ZAR", "USD"];
const COUNTRIES = [
  { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" }, { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" }, { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" }, { code: "CH", name: "Switzerland" },
  { code: "IT", name: "Italy" }, { code: "ES", name: "Spain" },
  { code: "IE", name: "Ireland" }, { code: "SG", name: "Singapore" },
  { code: "JP", name: "Japan" }, { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" }, { code: "GH", name: "Ghana" },
  { code: "ZA", name: "South Africa" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function WalletLoading() {
  const [activeTab, setActiveTab] = useState<LoadingTab>("wire");

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Load Your Wallet"
        subtitle="Choose how to add funds — bank wire, cash at airport, partner app, or feature phone"
      />

      {/* Tab navigation — scrollable on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0" style={{ touchAction: "manipulation" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-3 rounded-lg border transition-all text-sm ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground border-primary shadow-md"
                : "bg-card border-border hover:bg-accent"
            }`}
          >
            {tab.icon}
            <div className="text-left">
              <div className="font-medium text-xs sm:text-sm">{tab.label}</div>
              <div className="text-[10px] sm:text-xs opacity-70">{tab.description}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "wire" && <WireTransferTab />}
      {activeTab === "agent" && <AgentBankingTab />}
      {activeTab === "partner" && <PartnerAppsTab />}
      {activeTab === "ussd" && <USSDTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Wire Transfer Tab
// ═══════════════════════════════════════════════════════════════════════════

function WireTransferTab() {
  const [sourceCurrency, setSourceCurrency] = useState("USD");
  const [targetCurrency, setTargetCurrency] = useState("USDC");
  const [senderCountry, setSenderCountry] = useState("US");
  const [amount, setAmount] = useState("");
  const [senderName, setSenderName] = useState("");
  const [showQuote, setShowQuote] = useState(false);
  const [quote, setQuote] = useState<Record<string, unknown> | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const getQuote = trpc.foreignTouristLoading.wire.getQuote.useMutation({
    onSuccess: (data: Record<string, unknown>) => {
      setQuote(data);
      setShowQuote(true);
    },
    onError: (err) => toast.error(err.message),
  });

  const initiateWire = trpc.foreignTouristLoading.wire.initiate.useMutation({
    onSuccess: () => {
      setShowQuote(false);
      setShowInstructions(true);
      toast.success("Wire transfer initiated! Follow the instructions to complete payment.");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Building2 className="w-5 h-5" />
            International Wire Transfer
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Send money via SWIFT, SEPA (EU), ACH (US), or UK Faster Payments.
            We auto-select the fastest/cheapest rail for your country.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs sm:text-sm">Your Country</Label>
              <Select value={senderCountry} onValueChange={setSenderCountry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs sm:text-sm">Your Name (as on bank account)</Label>
              <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="John Smith" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs sm:text-sm">Send</Label>
              <Select value={sourceCurrency} onValueChange={setSourceCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs sm:text-sm">Amount</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs sm:text-sm">Receive</Label>
              <Select value={targetCurrency} onValueChange={setTargetCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TARGET_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={() => getQuote.mutate({ sourceCurrency, targetCurrency, senderCountry, amount: parseFloat(amount) || 0 })}
            disabled={!amount || !senderName || getQuote.isPending}
          >
            {getQuote.isPending ? "Getting quote..." : "Get Wire Transfer Quote"}
          </Button>

          {/* Rail info cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {[
              { rail: "SWIFT", time: "1-3 days", fee: "0.5% + $15" },
              { rail: "SEPA", time: "~10 sec", fee: "0.3%" },
              { rail: "ACH", time: "1-2 days", fee: "0.4%" },
              { rail: "UK FPS", time: "~2 hours", fee: "0.35%" },
            ].map((r) => (
              <div key={r.rail} className="p-2 rounded-lg border text-xs">
                <div className="font-semibold">{r.rail}</div>
                <div className="text-muted-foreground">{r.time}</div>
                <div className="text-muted-foreground">{r.fee}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quote Dialog */}
      <Dialog open={showQuote} onOpenChange={setShowQuote}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Wire Transfer Quote</DialogTitle>
            <DialogDescription>Review and confirm your transfer details</DialogDescription>
          </DialogHeader>
          {quote && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span>Send</span><span className="font-mono">{(quote as Record<string, unknown>).source_amount as string} {(quote as Record<string, unknown>).source_currency as string}</span></div>
              <div className="flex justify-between"><span>Receive</span><span className="font-mono font-bold">{((quote as Record<string, unknown>).target_amount as number)?.toFixed?.(2)} {(quote as Record<string, unknown>).target_currency as string}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Rate</span><span className="font-mono">{((quote as Record<string, unknown>).exchange_rate as number)?.toFixed?.(6)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Fee</span><span className="font-mono">${((quote as Record<string, unknown>).fee as number)?.toFixed?.(2)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Rail</span><Badge variant="outline">{(quote as Record<string, unknown>).rail as string}</Badge></div>
              <div className="flex justify-between text-muted-foreground"><span>Est. Time</span><span>{(quote as Record<string, unknown>).estimated_time as string}</span></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuote(false)}>Cancel</Button>
            <Button
              onClick={() => initiateWire.mutate({
                quote,
                senderName,
                senderCountry,
              })}
              disabled={initiateWire.isPending}
            >
              {initiateWire.isPending ? "Processing..." : "Confirm & Get Payment Instructions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Instructions Dialog */}
      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Transfer Initiated
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Send your wire transfer using the details below. Your wallet will be credited automatically once we receive the funds.</p>
            <Card className="bg-muted/50">
              <CardContent className="p-3 space-y-2 text-xs font-mono">
                <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span>Flutterwave International</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Account</span><span>TourismPay Ltd</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Reference</span>
                  <button className="flex items-center gap-1 hover:text-primary" onClick={() => { navigator.clipboard.writeText("TPWIRE-REF"); toast.success("Copied!"); }}>
                    <span>TPWIRE-REF</span><Copy className="w-3 h-3" />
                  </button>
                </div>
              </CardContent>
            </Card>
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 rounded-lg text-amber-700 text-xs">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>Wire expires in 72 hours. Include the reference exactly as shown.</span>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowInstructions(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Agent Banking Tab
// ═══════════════════════════════════════════════════════════════════════════

function AgentBankingTab() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [cashCurrency, setCashCurrency] = useState("USD");
  const [walletCurrency, setWalletCurrency] = useState("USDC");
  const [cashAmount, setCashAmount] = useState("");

  const agents = [
    { id: "AGT-MMIA-001", name: "TourismPay Kiosk — MMIA Terminal 1", location: "Lagos Airport", currencies: ["USD", "EUR", "GBP", "NGN"] },
    { id: "AGT-MMIA-002", name: "TourismPay Kiosk — MMIA Terminal 2", location: "Lagos Airport", currencies: ["USD", "EUR", "GBP", "NGN"] },
    { id: "AGT-NAI-001", name: "TourismPay Kiosk — Nnamdi Azikiwe", location: "Abuja Airport", currencies: ["USD", "EUR", "NGN"] },
    { id: "AGT-CAL-001", name: "Calabar Airport BDC", location: "Calabar Airport", currencies: ["USD", "NGN"] },
    { id: "AGT-SER-001", name: "Serena Safari Lodge", location: "Nairobi, Kenya", currencies: ["USD", "KES"] },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Banknote className="w-5 h-5" />
            Cash-to-Wallet at Airport/Hotel
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Hand cash (USD/EUR/GBP/NGN) to an agent at an airport kiosk or hotel.
            Show your passport for KYC verification. Wallet credited instantly.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
          {/* Agent Selection */}
          <Label className="text-xs sm:text-sm font-semibold">Select Nearest Agent</Label>
          <div className="grid grid-cols-1 gap-2">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(agent.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedAgent === agent.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-xs sm:text-sm">{agent.name}</div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground">{agent.location}</div>
                  </div>
                  <div className="flex gap-1">
                    {agent.currencies.map((c) => (
                      <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {selectedAgent && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs sm:text-sm">Cash Currency</Label>
                  <Select value={cashCurrency} onValueChange={setCashCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["USD", "EUR", "GBP", "NGN", "KES"].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs sm:text-sm">Amount</Label>
                  <Input type="number" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} placeholder="200" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs sm:text-sm">Credit To</Label>
                  <Select value={walletCurrency} onValueChange={setWalletCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["USDC", "NGN", "USD", "KES"].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/50 space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span>1.5%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">KYC Required</span><span>Passport scan (Tier 1 — up to $500/day)</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Process</span><span>Show passport → Agent scans → Wallet credited instantly</span></div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-blue-500/10 rounded-lg text-blue-700 text-xs">
                <Shield className="w-4 h-4 flex-shrink-0" />
                <span>Your passport number is hashed (SHA-256) and never stored in plaintext. KYC verification powered by Smile Identity.</span>
              </div>

              <Button className="w-full" disabled={!cashAmount}>
                <QrCode className="w-4 h-4 mr-2" />
                Show QR Code to Agent
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Partner Apps Tab
// ═══════════════════════════════════════════════════════════════════════════

function PartnerAppsTab() {
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [sourceCurrency, setSourceCurrency] = useState("USD");
  const [targetCurrency, setTargetCurrency] = useState("USDC");
  const [amount, setAmount] = useState("");

  const partners = [
    { id: "wise", name: "Wise", logo: "💚", fee: "0.5% + $1.50", time: "1-2 hours", desc: "Best for EUR/GBP" },
    { id: "revolut", name: "Revolut", logo: "💙", fee: "0.3%", time: "~30 min", desc: "Best for EU residents" },
    { id: "remitly", name: "Remitly", logo: "🟢", fee: "1% + $3.99", time: "15 min - 5 days", desc: "US/UK → Africa" },
    { id: "lemfi", name: "LemFi", logo: "🟡", fee: "Free", time: "~5 min", desc: "Diaspora favorite" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Globe className="w-5 h-5" />
            Load via Partner Apps
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Use your existing Wise, Revolut, Remitly, or LemFi account to load your wallet.
            We find the cheapest option for your currency.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
          {/* Partner Selection */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {partners.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPartner(p.id)}
                className={`p-3 sm:p-4 rounded-lg border text-left transition-all ${
                  selectedPartner === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <div className="text-2xl mb-1">{p.logo}</div>
                <div className="font-semibold text-sm">{p.name}</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground">{p.desc}</div>
                <div className="mt-2 flex flex-col sm:flex-row gap-1">
                  <Badge variant="outline" className="text-[10px]">{p.fee}</Badge>
                  <Badge variant="outline" className="text-[10px]">{p.time}</Badge>
                </div>
              </button>
            ))}
          </div>

          {selectedPartner && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs sm:text-sm">Send</Label>
                  <Select value={sourceCurrency} onValueChange={setSourceCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SOURCE_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs sm:text-sm">Amount</Label>
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="200" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs sm:text-sm">Receive</Label>
                  <Select value={targetCurrency} onValueChange={setTargetCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TARGET_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button className="w-full" disabled={!amount}>
                <Send className="w-4 h-4 mr-2" />
                Get {partners.find((p) => p.id === selectedPartner)?.name} Quote
              </Button>

              <div className="text-xs text-muted-foreground text-center">
                You'll be redirected to {partners.find((p) => p.id === selectedPartner)?.name} to complete payment.
                Your wallet is credited automatically when funds arrive.
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. USSD Tab
// ═══════════════════════════════════════════════════════════════════════════

function USSDTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Smartphone className="w-5 h-5" />
            USSD — Feature Phone Access
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            No smartphone? No internet? Dial our USSD shortcode from any phone.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
          {/* USSD Code Display */}
          <div className="text-center p-6 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border">
            <div className="text-4xl sm:text-5xl font-mono font-bold tracking-wider">*555#</div>
            <div className="mt-2 text-sm text-muted-foreground">Dial from any Nigerian mobile phone</div>
          </div>

          {/* Menu Preview */}
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm font-semibold">Menu Options</Label>
            <div className="p-4 rounded-lg bg-black text-green-400 font-mono text-xs sm:text-sm space-y-1">
              <div>Welcome to TourismPay</div>
              <div>1. Check Balance</div>
              <div>2. Load Wallet</div>
              <div>3. Send Money</div>
              <div>4. Mini Statement</div>
              <div>5. My QR Code</div>
              <div>6. Exchange Rate</div>
              <div>0. Exit</div>
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: <Wallet className="w-4 h-4" />, title: "Check Balance", desc: "View all currency balances" },
              { icon: <CreditCard className="w-4 h-4" />, title: "Load Wallet", desc: "Fund via mobile money" },
              { icon: <Send className="w-4 h-4" />, title: "Send Money", desc: "Transfer to any phone number" },
              { icon: <QrCode className="w-4 h-4" />, title: "My QR Code", desc: "Get SMS with payment QR link" },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-3 p-3 rounded-lg border">
                <div className="mt-0.5 text-muted-foreground">{f.icon}</div>
                <div>
                  <div className="font-medium text-xs sm:text-sm">{f.title}</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 p-3 bg-amber-500/10 rounded-lg text-amber-700 text-xs">
            <Phone className="w-4 h-4 flex-shrink-0" />
            <span>USSD works on any phone (smartphone or feature phone), even without internet. Requires Nigerian SIM card. Shortcode pending NCC approval.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
