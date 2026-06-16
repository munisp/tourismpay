import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { APP_TITLE, getLoginUrl } from "@/const";
import {
  CreditCard,
  Shield,
  Zap,
  Globe,
  ArrowRight,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const WALLET_CURRENCIES = [
  { value: "USDC", label: "USDC (USD Coin)" },
  { value: "USDT", label: "USDT (Tether)" },
  { value: "BTC", label: "BTC (Bitcoin)" },
  { value: "ETH", label: "ETH (Ethereum)" },
  { value: "KES", label: "KES (Kenyan Shilling)" },
  { value: "NGN", label: "NGN (Nigerian Naira)" },
  { value: "GHS", label: "GHS (Ghanaian Cedi)" },
  { value: "ZAR", label: "ZAR (South African Rand)" },
];

export default function PaymentGateway() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [amount, setAmount] = useState("10.00");
  const [currency, setCurrency] = useState("USDC");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const createCheckout = trpc.stripeConnect.createCheckoutSession.useMutation({
    onSuccess: ({ checkoutUrl }) => {
      toast.info("Redirecting to Stripe Checkout…");
      window.open(checkoutUrl, "_blank");
    },
    onError: (err) => {
      setCheckoutError(err.message);
      toast.error("Checkout failed: " + err.message);
    },
  });

  const handleCheckout = () => {
    setCheckoutError(null);
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 0.5) {
      setCheckoutError("Minimum amount is $0.50 USD");
      return;
    }
    createCheckout.mutate({
      amountUsd: amountNum,
      walletCurrency: currency,
      origin: window.location.origin,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-blue-600" />
            <span className="text-xl font-bold">{APP_TITLE}</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href="/">Home</Link>
            </Button>
            {isAuthenticated ? (
              <>
                <span className="text-sm text-muted-foreground">
                  Welcome, {user?.name}
                </span>
                <Button onClick={() => setLocation("/dashboard")}>
                  Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <a href={getLoginUrl()}>Sign In</a>
                </Button>
                <Button size="lg" asChild>
                  <a href={getLoginUrl()}>Get Started</a>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <div className="max-w-4xl mx-auto">
          <Badge className="mb-4 bg-blue-100 text-blue-700 border-blue-200">
            Powered by Stripe
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Accept Payments Anywhere
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Top up your TourismPay wallet or accept payments from tourists
            worldwide. Secure, instant, and multi-currency.
          </p>
        </div>
      </section>

      {/* Live Checkout Section */}
      <section className="container mx-auto px-4 pb-16">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8 items-start">
          {/* Checkout Form */}
          <Card className="border-2 border-blue-100 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-600" />
                Wallet Top-Up
              </CardTitle>
              <CardDescription>
                Add funds to your TourismPay wallet via Stripe Checkout
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isAuthenticated ? (
                <div className="text-center py-6 space-y-3">
                  <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
                  <p className="text-muted-foreground">
                    Please sign in to top up your wallet
                  </p>
                  <Button asChild>
                    <a href={getLoginUrl()}>
                      Sign In to Continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (USD)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                        $
                      </span>
                      <Input
                        id="amount"
                        type="number"
                        min="0.50"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="pl-7"
                        placeholder="10.00"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Minimum $0.50 USD
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Credit to Wallet Currency</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WALLET_CURRENCIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {checkoutError && (
                    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      {checkoutError}
                    </div>
                  )}
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleCheckout}
                    disabled={createCheckout.isPending}
                  >
                    {createCheckout.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Checkout…
                      </>
                    ) : (
                      <>
                        Pay ${parseFloat(amount || "0").toFixed(2)} USD
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    Secured by Stripe · PCI DSS compliant · Test card:{" "}
                    <code className="bg-muted px-1 rounded">
                      4242 4242 4242 4242
                    </code>
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Features */}
          <div className="space-y-4">
            {[
              {
                icon: Zap,
                color: "blue",
                title: "Instant Crediting",
                desc: "Funds appear in your wallet immediately after payment confirmation via Stripe webhook.",
              },
              {
                icon: Shield,
                color: "green",
                title: "Secure by Default",
                desc: "PCI DSS Level 1 compliant. Card data never touches our servers — handled entirely by Stripe.",
              },
              {
                icon: Globe,
                color: "purple",
                title: "8 Wallet Currencies",
                desc: "Top up in USD and receive USDC, USDT, BTC, ETH, KES, NGN, GHS, or ZAR.",
              },
              {
                icon: CheckCircle2,
                color: "amber",
                title: "Promotion Codes",
                desc: "Apply discount codes at checkout. Use our 99% test promo code in sandbox mode.",
              },
            ].map(({ icon: Icon, color, title, desc }) => (
              <Card key={title} className="border hover:shadow-md transition-shadow">
                <CardContent className="pt-4 flex gap-4 items-start">
                  <div
                    className={`h-10 w-10 rounded-lg bg-${color}-100 flex items-center justify-center flex-shrink-0`}
                  >
                    <Icon className={`h-5 w-5 text-${color}-600`} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Payment Methods */}
      <section className="bg-white py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-3">Supported Payment Methods</h2>
            <p className="text-muted-foreground">
              All major cards accepted through Stripe
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { label: "Credit & Debit Cards", sub: "Visa, Mastercard, Amex", live: true },
              { label: "Bank Transfer", sub: "ACH / SEPA / M-Pesa", live: true },
              { label: "QR Code", sub: "Tourist scan-to-pay", live: true },
              { label: "Digital Wallets", sub: "Apple Pay, Google Pay", live: true },
            ].map(({ label, sub, live }) => (
              <Card key={label} className={live ? "" : "opacity-60"}>
                <CardContent className="pt-5 text-center">
                  <CreditCard className="h-7 w-7 mx-auto mb-2 text-blue-600" />
                  <p className="font-semibold text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {live ? sub : "Coming Soon"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-xl mb-8 opacity-90">
            Join merchants across Africa using TourismPay to accept tourist
            payments
          </p>
          {isAuthenticated ? (
            <Button size="lg" variant="secondary" onClick={() => setLocation("/dashboard")}>
              Go to Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button size="lg" variant="secondary" asChild>
              <a href={getLoginUrl()}>
                Create Free Account
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-10">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CreditCard className="h-5 w-5" />
                <span className="font-bold">{APP_TITLE}</span>
              </div>
              <p className="text-sm text-gray-400">
                Modern payment infrastructure for African tourism
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Product</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <a href="#" className="hover:text-white">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Pricing
                  </a>
                </li>
                <li>
                  <Link href="/developer-portal" className="hover:text-white">
                    Documentation
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Company</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <Link href="/" className="hover:text-white">
                    Home
                  </Link>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Blog
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Legal</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <a href="#" className="hover:text-white">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Terms
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-6 text-center text-sm text-gray-400">
            <p>&copy; 2024 {APP_TITLE}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
