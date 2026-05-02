/**
 * TouristOnboarding.tsx
 *
 * Multi-step wizard that guides a new tourist through:
 *   Step 1 — Welcome & profile (home country, currency, language)
 *   Step 2 — Link a payment card (last4 + brand, no real card data)
 *   Step 3 — Activate wallet currencies
 *   Step 4 — All done — redirect to tourist experience
 *
 * Accessible to: tourist, admin (and unauthenticated users who just signed up)
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Globe, CreditCard, Wallet, CheckCircle2, ArrowRight, ArrowLeft,
  MapPin, Zap, Star, Loader2,
} from "lucide-react";

// ─── Static data ──────────────────────────────────────────────────────────────

const COUNTRIES = [
  { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" }, { code: "FR", name: "France" },
  { code: "NG", name: "Nigeria" }, { code: "KE", name: "Kenya" },
  { code: "ZA", name: "South Africa" }, { code: "GH", name: "Ghana" },
  { code: "TZ", name: "Tanzania" }, { code: "UG", name: "Uganda" },
  { code: "JP", name: "Japan" }, { code: "CN", name: "China" },
  { code: "IN", name: "India" }, { code: "BR", name: "Brazil" },
  { code: "AU", name: "Australia" }, { code: "CA", name: "Canada" },
  { code: "AE", name: "UAE" }, { code: "SG", name: "Singapore" },
];

const CURRENCIES = [
  { code: "USD", label: "🇺🇸 US Dollar (USD)" },
  { code: "EUR", label: "🇪🇺 Euro (EUR)" },
  { code: "GBP", label: "🇬🇧 British Pound (GBP)" },
  { code: "KES", label: "🇰🇪 Kenyan Shilling (KES)" },
  { code: "NGN", label: "🇳🇬 Nigerian Naira (NGN)" },
  { code: "ZAR", label: "🇿🇦 South African Rand (ZAR)" },
  { code: "GHS", label: "🇬🇭 Ghanaian Cedi (GHS)" },
  { code: "JPY", label: "🇯🇵 Japanese Yen (JPY)" },
  { code: "CNY", label: "🇨🇳 Chinese Yuan (CNY)" },
  { code: "INR", label: "🇮🇳 Indian Rupee (INR)" },
];

const LANGUAGES = [
  { code: "en", label: "English" }, { code: "fr", label: "Français" },
  { code: "sw", label: "Kiswahili" }, { code: "yo", label: "Yorùbá" },
  { code: "ha", label: "Hausa" }, { code: "ar", label: "العربية" },
  { code: "zh", label: "中文" }, { code: "pt", label: "Português" },
];

const WALLET_CURRENCIES = [
  { code: "USDC", label: "USDC (USD Coin)", desc: "Stable, pegged to US Dollar" },
  { code: "CBDC-NG", label: "eNaira (CBDC-NG)", desc: "Nigeria's digital currency" },
  { code: "XLM", label: "Stellar (XLM)", desc: "Fast cross-border payments" },
];

const CARD_BRANDS = ["Visa", "Mastercard", "Amex", "Discover", "Verve", "Other"];

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDot({ step, current, label }: { step: number; current: number; label: string }) {
  const done = step < current;
  const active = step === current;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
          done
            ? "bg-emerald-500 text-white"
            : active
            ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? <CheckCircle2 className="w-4 h-4" /> : step}
      </div>
      <span className={`text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TouristOnboarding() {
  const [, navigate] = useLocation();
  const { isAuthenticated, loading } = useAuth();

  const { data: onboardingData, isLoading: stateLoading } = trpc.touristOnboarding.getState.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Derive current step from server state, default to 1
  const serverStep = onboardingData?.state?.step ?? 1;
  const [localStep, setLocalStep] = useState<number | null>(null);
  const step = localStep ?? (onboardingData?.profile?.onboardingCompleted ? 4 : serverStep);

  // Step 1 form
  const [homeCountry, setHomeCountry] = useState(onboardingData?.profile?.homeCountry ?? "US");
  const [homeCurrency, setHomeCurrency] = useState(onboardingData?.profile?.homeCurrency ?? "USD");
  const [language, setLanguage] = useState(onboardingData?.profile?.preferredLanguage ?? "en");

  // Step 2 form
  const [cardLast4, setCardLast4] = useState("");
  const [cardBrand, setCardBrand] = useState("Visa");

  // Step 3 form
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(["USDC"]);

  const utils = trpc.useUtils();

  const prefMut = trpc.touristOnboarding.setPreferences.useMutation({
    onSuccess: () => { utils.touristOnboarding.getState.invalidate(); setLocalStep(2); },
    onError: (e) => toast.error(e.message),
  });

  const cardMut = trpc.touristOnboarding.linkCard.useMutation({
    onSuccess: () => { utils.touristOnboarding.getState.invalidate(); setLocalStep(3); },
    onError: (e) => toast.error(e.message),
  });

  const walletMut = trpc.touristOnboarding.activateWallet.useMutation({
    onSuccess: () => { utils.touristOnboarding.getState.invalidate(); setLocalStep(4); },
    onError: (e) => toast.error(e.message),
  });

  const toggleCurrency = (code: string) => {
    setSelectedCurrencies((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  if (loading || stateLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <Globe className="w-12 h-12 text-primary mb-4" />
        <h2 className="text-xl font-bold mb-2">Sign in to get started</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Create your TourismPay tourist account to pay at verified merchants across Africa.
        </p>
        <Button onClick={() => window.location.href = getLoginUrl()}>
          Sign In / Register
        </Button>
      </div>
    );
  }

  const progressPct = ((step - 1) / 3) * 100;

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Zap className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Welcome to TourismPay</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set up your tourist account in 3 quick steps
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-6 mb-6">
        <StepDot step={1} current={step} label="Profile" />
        <div className="flex-1 h-px bg-border max-w-[60px]" />
        <StepDot step={2} current={step} label="Card" />
        <div className="flex-1 h-px bg-border max-w-[60px]" />
        <StepDot step={3} current={step} label="Wallet" />
        <div className="flex-1 h-px bg-border max-w-[60px]" />
        <StepDot step={4} current={step} label="Done" />
      </div>

      <Progress value={progressPct} className="mb-8 h-1.5" />

      {/* ── Step 1: Profile ── */}
      {step === 1 && (
        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Your Profile</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Tell us where you're from so we can personalise your experience and currency conversions.
            </p>

            <div className="space-y-1.5">
              <Label>Home Country</Label>
              <Select value={homeCountry} onValueChange={setHomeCountry}>
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Preferred Currency</Label>
              <Select value={homeCurrency} onValueChange={setHomeCurrency}>
                <SelectTrigger>
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Preferred Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full"
              onClick={() => prefMut.mutate({ homeCurrency, homeCountry, preferredLanguage: language })}
              disabled={prefMut.isPending}
            >
              {prefMut.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
              ) : (
                <>Continue <ArrowRight className="w-4 h-4 ml-2" /></>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Link Card ── */}
      {step === 2 && (
        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Link a Payment Card</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              We store only the last 4 digits and card brand — no sensitive card data is ever stored.
            </p>

            <div className="space-y-1.5">
              <Label>Card Brand</Label>
              <Select value={cardBrand} onValueChange={setCardBrand}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARD_BRANDS.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Last 4 Digits</Label>
              <Input
                placeholder="e.g. 4242"
                maxLength={4}
                value={cardLast4}
                onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, ""))}
                className="font-mono text-lg tracking-widest"
              />
            </div>

            <div className="rounded-lg bg-muted/50 border p-3 text-xs text-muted-foreground">
              <strong>Privacy note:</strong> TourismPay never stores full card numbers, CVVs, or
              expiry dates. This information is used only to identify your card in transaction history.
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setLocalStep(1)}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
              <Button
                className="flex-1"
                onClick={() => cardMut.mutate({ last4: cardLast4, brand: cardBrand })}
                disabled={cardLast4.length !== 4 || cardMut.isPending}
              >
                {cardMut.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                ) : (
                  <>Continue <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </Button>
            </div>

            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setLocalStep(3)}>
              Skip for now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Activate Wallet ── */}
      {step === 3 && (
        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Activate Your Wallet</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Choose the digital currencies you want in your TourismPay wallet. You can add more later.
            </p>

            <div className="space-y-3">
              {WALLET_CURRENCIES.map((c) => (
                <label
                  key={c.code}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedCurrencies.includes(c.code)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <Checkbox
                    checked={selectedCurrencies.includes(c.code)}
                    onCheckedChange={() => toggleCurrency(c.code)}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.desc}</p>
                  </div>
                  {selectedCurrencies.includes(c.code) && (
                    <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
                      Selected
                    </Badge>
                  )}
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setLocalStep(2)}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
              <Button
                className="flex-1"
                onClick={() => walletMut.mutate({ currencies: selectedCurrencies })}
                disabled={selectedCurrencies.length === 0 || walletMut.isPending}
              >
                {walletMut.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Activating…</>
                ) : (
                  <>Activate Wallet <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: Done ── */}
      {step >= 4 && (
        <Card className="text-center">
          <CardContent className="p-8 space-y-5">
            <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">You're all set!</h2>
              <p className="text-sm text-muted-foreground">
                Your TourismPay tourist account is ready. Start discovering verified restaurants
                and paying with your digital wallet across Africa.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 py-2">
              {[
                { icon: MapPin, label: "Discover restaurants" },
                { icon: Zap, label: "Pay instantly" },
                { icon: Star, label: "Earn rewards" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-muted/50">
                  <Icon className="w-5 h-5 text-primary" />
                  <p className="text-xs text-center font-medium">{label}</p>
                </div>
              ))}
            </div>

            <Button className="w-full" size="lg" onClick={() => navigate("/tourist")}>
              <Zap className="w-4 h-4 mr-2" /> Start Exploring
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
