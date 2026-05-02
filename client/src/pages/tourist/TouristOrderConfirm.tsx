/**
 * TouristOrderConfirm — Tourist order confirmation screen at /pay/:token
 *
 * Receives cart data as URL search params (populated by TouristProductCatalog).
 * If no cart params are present, falls back to a simple amount-entry form.
 * On confirm, calls qrPayment.pay and navigates to /receipt/:token.
 */
import { useParams, useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, CheckCircle2, Loader2, AlertCircle,
  ShoppingBag, Wallet, Star, Package, ScanLine, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface LineItem {
  name: string;
  qty: number;
  unitPrice: string;
  currency: string;
}

function formatPrice(amount: string | number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(typeof amount === "string" ? parseFloat(amount) : amount);
  } catch {
    return `${parseFloat(String(amount)).toFixed(2)} ${currency}`;
  }
}

export default function TouristOrderConfirm() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [manualAmount, setManualAmount] = useState("");
  const [manualCurrency] = useState("USD");
  const [showLimitWarning, setShowLimitWarning] = useState(false);

  // Parse cart from URL params (set by TouristProductCatalog)
  const cartParams = useMemo(() => {
    const params = new URLSearchParams(search);
    const amount = params.get("amount");
    const currency = params.get("currency") ?? "USD";
    const itemsRaw = params.get("items");
    let items: LineItem[] = [];
    try {
      if (itemsRaw) items = JSON.parse(itemsRaw);
    } catch {
      // ignore
    }
    return { amount, currency, items };
  }, [search]);

  const hasCart = !!cartParams.amount && cartParams.items.length > 0;
  const payAmount = hasCart ? cartParams.amount! : manualAmount;
  const payCurrency = hasCart ? cartParams.currency : manualCurrency;

  // Fetch QR token details
  const { data: qrToken, isLoading: loadingToken, error: tokenError } = trpc.qrPayment.getToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token, retry: false }
  );

  // Fetch wallet balance
  const { data: walletData } = trpc.wallet.balances.useQuery(
    undefined,
    { enabled: !!qrToken }
  );

  // Fetch spending limits
  const { data: spendingLimits = [] } = trpc.wallet.getSpendingLimits.useQuery(
    undefined,
    { enabled: !!qrToken }
  );

  const walletBalance = useMemo(() => {
    if (!walletData) return null;
    const balances = (walletData as any[]);
    const match = balances.find((b: any) => b.currency === payCurrency);
    return match ? parseFloat(match.balance ?? "0") : null;
  }, [walletData, payCurrency]);

  const payMut = trpc.qrPayment.pay.useMutation({
    onSuccess: (data) => {
      toast.success("Payment successful! Redirecting to receipt…");
      navigate(`/receipt/${data.token ?? token}`);
    },
    onError: (e) => {
      toast.error(e.message);
    },
  });

  const executePay = () => {
    if (!token || !payAmount) return;
    const amount = parseFloat(payAmount);
    payMut.mutate({
      token,
      amountUsd: amount.toFixed(2),
      currency: payCurrency,
      lineItems: hasCart ? cartParams.items : undefined,
    });
  };

  const handleConfirm = () => {
    if (!token || !payAmount) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    // Show spending limit warning if applicable
    if (spendingLimitWarning) {
      setShowLimitWarning(true);
      return;
    }
    executePay();
  };

  const isInsufficient = walletBalance !== null && parseFloat(payAmount || "0") > walletBalance;

  // Check if payment would exceed any active spending limit
  const spendingLimitWarning = useMemo(() => {
    const amount = parseFloat(payAmount || "0");
    if (!amount || !(spendingLimits as any[]).length) return null;
    for (const limit of spendingLimits as any[]) {
      if (!limit.isActive || limit.currency !== payCurrency) continue;
      const limitAmt = parseFloat(limit.limitAmount ?? "0");
      const spent = limit.period === "daily"
        ? parseFloat(limit.spentToday ?? "0")
        : parseFloat(limit.spentThisMonth ?? "0");
      const remaining = limitAmt - spent;
      if (amount > remaining) {
        return {
          period: limit.period as string,
          limitAmt,
          spent,
          remaining: Math.max(0, remaining),
          currency: limit.currency as string,
        };
      }
    }
    return null;
  }, [payAmount, payCurrency, spendingLimits]);

  if (!token) {
    return <ErrorState message="Invalid QR code link." />;
  }

  if (loadingToken) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (tokenError || !qrToken) {
    return <ErrorState message={tokenError?.message ?? "QR code not found or expired."} />;
  }

  if (qrToken.status === "expired") {
    return <ErrorState message="This QR code has expired. Please ask the merchant to generate a new one." />;
  }

  if (qrToken.status === "paid") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
          <p className="font-semibold text-lg">Already Paid</p>
          <p className="text-sm text-muted-foreground">This QR code has already been paid successfully.</p>
          <Button variant="outline" size="sm" onClick={() => navigate(`/receipt/${token}`)}>
            View Receipt
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => history.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">Confirm Payment</p>
          <p className="text-xs text-muted-foreground truncate">{qrToken.establishmentName}</p>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          <ScanLine className="w-3 h-3 mr-1" />
          QR Pay
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Merchant info card */}
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{qrToken.establishmentName}</p>
            <p className="text-xs text-muted-foreground capitalize">{qrToken.establishmentCountry}</p>
          </div>
          {qrToken.description && (
            <p className="text-xs text-muted-foreground text-right max-w-[120px] truncate">{qrToken.description}</p>
          )}
        </div>

        {/* Order summary — itemised if cart was passed */}
        {hasCart ? (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              <p className="font-semibold text-sm">Order Summary</p>
              <Badge className="ml-auto text-xs">{cartParams.items.reduce((s, i) => s + i.qty, 0)} items</Badge>
            </div>
            <div className="divide-y divide-border">
              {cartParams.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(item.unitPrice, item.currency)} × {item.qty}
                    </p>
                  </div>
                  <p className="text-sm font-semibold ml-3">
                    {formatPrice((parseFloat(item.unitPrice) * item.qty).toFixed(2), item.currency)}
                  </p>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-muted/30">
              <p className="text-sm font-semibold">Total</p>
              <p className="text-lg font-bold text-primary">
                {formatPrice(cartParams.amount!, cartParams.currency)}
              </p>
            </div>
          </div>
        ) : (
          /* Simple amount entry if no cart params */
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold">Payment Amount</p>
            {qrToken.amountUsd ? (
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">Fixed amount</p>
                <p className="text-xl font-bold text-primary">
                  {formatPrice(qrToken.amountUsd, qrToken.currency ?? "USD")}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Enter the amount to pay</p>
                <div className="flex gap-2">
                  <span className="flex items-center px-3 bg-muted rounded-l-md border border-border text-sm font-medium text-muted-foreground">
                    USD
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    className="flex-1 h-10 rounded-r-md border border-l-0 border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Wallet balance indicator */}
        {walletBalance !== null && (
          <div className={`flex items-center gap-3 rounded-xl p-3 border ${
            isInsufficient ? "bg-destructive/10 border-destructive/30" : "bg-emerald-500/10 border-emerald-500/20"
          }`}>
            <Wallet className={`w-4 h-4 shrink-0 ${isInsufficient ? "text-destructive" : "text-emerald-500"}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">Wallet Balance</p>
              <p className={`text-sm font-bold ${isInsufficient ? "text-destructive" : "text-emerald-500"}`}>
                {formatPrice(walletBalance.toFixed(2), payCurrency)}
              </p>
            </div>
            {isInsufficient && (
              <p className="text-xs text-destructive font-medium shrink-0">Insufficient</p>
            )}
          </div>
        )}

        {/* Loyalty points preview */}
        {parseFloat(payAmount || "0") > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>
              You'll earn approximately{" "}
              <strong className="text-amber-500">
                {Math.max(1, Math.round(parseFloat(payAmount || "0") * 10))} loyalty points
              </strong>{" "}
              for this payment.
            </span>
          </div>
        )}
      </div>

      {/* Spending limit warning */}
      {spendingLimitWarning && (
        <div className="mx-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-amber-600">Spending limit warning</p>
            <p className="text-muted-foreground mt-0.5">
              This payment exceeds your {spendingLimitWarning.period} limit.
              Remaining: {formatPrice(spendingLimitWarning.remaining.toFixed(2), spendingLimitWarning.currency)}
            </p>
          </div>
        </div>
      )}

      {/* Confirm CTA */}
      <div className="sticky bottom-0 bg-card border-t border-border p-4 space-y-2">
        <Button
          className="w-full h-12 text-base font-semibold gap-2"
          onClick={handleConfirm}
          disabled={
            payMut.isPending ||
            !payAmount ||
            parseFloat(payAmount) <= 0 ||
            isInsufficient
          }
        >
          {payMut.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Processing…
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Confirm & Pay {payAmount ? formatPrice(payAmount, payCurrency) : ""}
            </>
          )}
        </Button>
        {hasCart && (
          <Button
            variant="ghost"
            className="w-full h-9 text-sm text-muted-foreground"
            onClick={() => navigate(`/pay/${token}/catalog`)}
            disabled={payMut.isPending}
          >
            ← Edit Order
          </Button>
        )}
      </div>
    {/* Spending limit confirmation dialog */}
    <SpendingLimitDialog
      open={showLimitWarning}
      onCancel={() => setShowLimitWarning(false)}
      onConfirm={() => { setShowLimitWarning(false); executePay(); }}
      warning={spendingLimitWarning}
    />
  </div>
  );
}

// ─── Spending limit confirmation dialog ─────────────────────────────────────
function SpendingLimitDialog({
  open,
  onCancel,
  onConfirm,
  warning,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  warning: { period: string; limitAmt: number; spent: number; remaining: number; currency: string } | null;
}) {
  if (!warning) return null;
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Spending Limit Exceeded
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              This payment exceeds your <strong>{warning.period}</strong> spending limit of{" "}
              <strong>{formatPrice(warning.limitAmt.toFixed(2), warning.currency)}</strong>.
            </p>
            <p>
              You have spent{" "}
              <strong>{formatPrice(warning.spent.toFixed(2), warning.currency)}</strong>{" "}
              so far this {warning.period}, leaving{" "}
              <strong>{formatPrice(warning.remaining.toFixed(2), warning.currency)}</strong>{" "}
              remaining.
            </p>
            <p>Do you want to proceed anyway?</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-amber-500 hover:bg-amber-600 text-white"
            onClick={onConfirm}
          >
            Pay Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-sm">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
        <p className="font-semibold">Payment Unavailable</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" size="sm" onClick={() => history.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
        </Button>
      </div>
    </div>
  );
}
