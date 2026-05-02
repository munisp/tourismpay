/**
 * Stripe Connect Merchant Onboarding — /merchant/stripe-connect
 * Allows merchants to connect their Stripe account to receive payouts.
 * Covers: account creation, onboarding link, return handling, balance display, manual payout trigger.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { RoleGuard } from "@/components/RoleGuard";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  CreditCard,
  DollarSign,
  RefreshCw,
  Banknote,
  ArrowRight,
  Info,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

type ConnectStatus = "not_connected" | "onboarding" | "pending_verification" | "active" | "restricted";

const STATUS_CONFIG: Record<ConnectStatus, { label: string; color: string; icon: React.ElementType; description: string }> = {
  not_connected: {
    label: "Not Connected",
    color: "text-muted-foreground",
    icon: AlertTriangle,
    description: "Connect your Stripe account to start receiving payouts.",
  },
  onboarding: {
    label: "Onboarding",
    color: "text-amber-500",
    icon: Clock,
    description: "Complete the Stripe onboarding process to activate payouts.",
  },
  pending_verification: {
    label: "Pending Verification",
    color: "text-blue-500",
    icon: Clock,
    description: "Stripe is verifying your account details. This may take 1–2 business days.",
  },
  active: {
    label: "Active",
    color: "text-emerald-500",
    icon: CheckCircle2,
    description: "Your Stripe account is connected and payouts are enabled.",
  },
  restricted: {
    label: "Restricted",
    color: "text-red-500",
    icon: AlertTriangle,
    description: "Your Stripe account has restrictions. Please complete any outstanding requirements.",
  },
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount);
}

export default function StripeConnectOnboarding() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [selectedEstId, setSelectedEstId] = useState<number | null>(null);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutCurrency, setPayoutCurrency] = useState("usd");

  // Parse query params for Stripe return/refresh
  const params = new URLSearchParams(window.location.search);
  const stripeConnectParam = params.get("stripe_connect");
  const estIdParam = params.get("est");

  // Load establishments
  const { data: establishments = [], isLoading: loadingEst } = trpc.kyb.listEstablishments.useQuery();

  // Auto-select first establishment
  useEffect(() => {
    if (establishments.length > 0 && !selectedEstId) {
      setSelectedEstId(establishments[0].id);
    }
  }, [establishments, selectedEstId]);

  // Stripe Connect status
  const {
    data: connectStatus,
    isLoading: loadingStatus,
    refetch: refetchStatus,
  } = trpc.stripeConnect.getStatus.useQuery(
    { establishmentId: selectedEstId! },
    { enabled: !!selectedEstId }
  );

  // Payout balance
  const {
    data: balanceData,
    isLoading: loadingBalance,
    refetch: refetchBalance,
  } = trpc.stripeConnect.getPayoutBalance.useQuery(
    { establishmentId: selectedEstId! },
    { enabled: !!selectedEstId && connectStatus?.status === "active" }
  );

  // Payout list
  const {
    data: payoutsData,
    isLoading: loadingPayouts,
    refetch: refetchPayouts,
  } = trpc.stripeConnect.listPayouts.useQuery(
    { establishmentId: selectedEstId!, limit: 10 },
    { enabled: !!selectedEstId && connectStatus?.status === "active" }
  );

  const utils = trpc.useUtils();

  // Create onboarding link
  const createOnboardingMut = trpc.stripeConnect.createOnboardingLink.useMutation({
    onSuccess: (data) => {
      toast.info("Redirecting to Stripe onboarding...");
      window.open(data.url, "_blank");
    },
    onError: (err) => toast.error(`Failed to create onboarding link: ${err.message}`),
  });

  // Handle return from Stripe
  const handleReturnMut = trpc.stripeConnect.handleReturn.useMutation({
    onSuccess: (data) => {
      if (data.payoutsEnabled) {
        toast.success("Stripe account connected! Payouts are now enabled.");
      } else {
        toast.info("Account status updated. Additional verification may be required.");
      }
      refetchStatus();
      refetchBalance();
    },
    onError: (err) => toast.error(`Failed to refresh status: ${err.message}`),
  });

  // Trigger manual payout
  const triggerPayoutMut = trpc.stripeConnect.triggerPayout.useMutation({
    onSuccess: (data) => {
      toast.success(`Payout of ${formatCurrency(data.amount, data.currency)} initiated successfully.`);
      setPayoutDialogOpen(false);
      setPayoutAmount("");
      refetchBalance();
      refetchPayouts();
    },
    onError: (err) => toast.error(`Payout failed: ${err.message}`),
  });

  // Handle Stripe return/refresh query params
  useEffect(() => {
    if (stripeConnectParam && estIdParam && selectedEstId) {
      const estId = parseInt(estIdParam, 10);
      if (!isNaN(estId) && estId === selectedEstId) {
        if (stripeConnectParam === "return") {
          handleReturnMut.mutate({ establishmentId: estId });
        } else if (stripeConnectParam === "refresh") {
          toast.info("Refreshing Stripe connection status...");
          createOnboardingMut.mutate({
            establishmentId: estId,
            origin: window.location.origin,
          });
        }
        // Clean up URL
        window.history.replaceState({}, "", "/merchant/stripe-connect");
      }
    }
  }, [stripeConnectParam, estIdParam, selectedEstId]);

  const status: ConnectStatus = (connectStatus?.status as ConnectStatus) ?? "not_connected";
  const statusCfg = STATUS_CONFIG[status];
  const StatusIcon = statusCfg.icon;

  const handleConnectOrContinue = () => {
    if (!selectedEstId) return;
    createOnboardingMut.mutate({
      establishmentId: selectedEstId,
      origin: window.location.origin,
    });
  };

  const handleTriggerPayout = () => {
    if (!selectedEstId || !payoutAmount) return;
    const amountDollars = parseFloat(payoutAmount);
    if (isNaN(amountDollars) || amountDollars < 0.5) {
      toast.error("Minimum payout amount is $0.50");
      return;
    }
    triggerPayoutMut.mutate({
      establishmentId: selectedEstId,
      amount: amountDollars,
      currency: payoutCurrency,
    });
  };

  return (
    <RoleGuard roles={["merchant", "admin"]}>
      <div className="space-y-6">
        <PageHeader
          title="Stripe Connect"
          subtitle="Connect your business bank account to receive automated payouts from TourismPay."
        />

        {/* Establishment selector */}
        {establishments.length > 1 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Select Establishment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {establishments.map((est: any) => (
                  <Button
                    key={est.id}
                    variant={selectedEstId === est.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedEstId(est.id)}
                  >
                    {est.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {loadingEst || !selectedEstId ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {loadingEst ? "Loading establishments..." : "No establishments found. Complete KYB onboarding first."}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Connection Status Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusIcon className={`h-6 w-6 ${statusCfg.color}`} />
                    <div>
                      <CardTitle>Connection Status</CardTitle>
                      <CardDescription>{statusCfg.description}</CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`${statusCfg.color} border-current`}
                  >
                    {statusCfg.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {connectStatus && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Stripe Account ID</span>
                      <p className="font-mono text-xs mt-1">{connectStatus.stripeAccountId ?? "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Payouts Enabled</span>
                      <p className="mt-1">
                        {connectStatus.payoutsEnabled ? (
                          <span className="text-emerald-500 font-medium">Yes</span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Details Submitted</span>
                      <p className="mt-1">
                        {connectStatus.detailsSubmitted ? (
                          <span className="text-emerald-500 font-medium">Yes</span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Connected At</span>
                      <p className="mt-1 text-xs">
                        {connectStatus.stripeAccountId ? "Connected" : "—"}
                      </p>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="flex flex-wrap gap-3">
                  {status === "not_connected" || status === "onboarding" ? (
                    <Button
                      onClick={handleConnectOrContinue}
                      disabled={createOnboardingMut.isPending}
                      className="gap-2"
                    >
                      {createOnboardingMut.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="h-4 w-4" />
                      )}
                      {status === "not_connected" ? "Connect Stripe Account" : "Continue Onboarding"}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  ) : status === "pending_verification" ? (
                    <Button
                      variant="outline"
                      onClick={handleConnectOrContinue}
                      disabled={createOnboardingMut.isPending}
                      className="gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Complete Requirements
                    </Button>
                  ) : null}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      refetchStatus();
                      refetchBalance();
                      refetchPayouts();
                    }}
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh Status
                  </Button>
                </div>

                {status === "not_connected" && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      You will be redirected to Stripe to complete identity verification and bank account setup.
                      Use test card <strong>4242 4242 4242 4242</strong> in the test environment.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Balance Card — only shown when active */}
            {status === "active" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-emerald-500" />
                      Available Balance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingBalance ? (
                      <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                    ) : (
                      <div className="space-y-1">
                        {(balanceData?.available ?? []).length === 0 ? (
                          <p className="text-2xl font-bold">$0.00</p>
                        ) : (
                          (balanceData?.available ?? []).map((b: any) => (
                            <p key={b.currency} className="text-2xl font-bold">
                              {formatCurrency(b.amount / 100, b.currency)}
                            </p>
                          ))
                        )}
                        <p className="text-xs text-muted-foreground">Ready for payout</p>
                      </div>
                    )}
                    <Button
                      className="mt-4 gap-2"
                      size="sm"
                      onClick={() => setPayoutDialogOpen(true)}
                      disabled={triggerPayoutMut.isPending}
                    >
                      <Zap className="h-4 w-4" />
                      Trigger Manual Payout
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-500" />
                      Pending Balance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingBalance ? (
                      <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                    ) : (
                      <div className="space-y-1">
                        {(balanceData?.pending ?? []).length === 0 ? (
                          <p className="text-2xl font-bold">$0.00</p>
                        ) : (
                          (balanceData?.pending ?? []).map((b: any) => (
                            <p key={b.currency} className="text-2xl font-bold">
                              {formatCurrency(b.amount / 100, b.currency)}
                            </p>
                          ))
                        )}
                        <p className="text-xs text-muted-foreground">In transit (2–7 business days)</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Recent Payouts — only shown when active */}
            {status === "active" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Banknote className="h-5 w-5" />
                    Recent Payouts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingPayouts ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                      ))}
                    </div>
                  ) : (payoutsData?.payouts ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No payouts yet.</p>
                  ) : (
                    <div className="divide-y">
                      {(payoutsData?.payouts ?? []).map((payout: any) => (
                        <div key={payout.id} className="flex items-center justify-between py-3">
                          <div>
                            <p className="text-sm font-medium">{formatCurrency(payout.amount, payout.currency)}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(payout.createdAt).toLocaleDateString()} · {payout.description ?? "Automatic payout"}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              payout.status === "paid"
                                ? "text-emerald-500 border-emerald-500"
                                : payout.status === "pending"
                                ? "text-amber-500 border-amber-500"
                                : "text-red-500 border-red-500"
                            }
                          >
                            {payout.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* How it works */}
            <Card className="bg-muted/30">
              <CardHeader>
                <CardTitle className="text-sm">How Stripe Connect Works</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>1. Click <strong>Connect Stripe Account</strong> to begin the Stripe Express onboarding flow.</p>
                <p>2. Complete identity verification and add your bank account details on Stripe's secure platform.</p>
                <p>3. Once verified, TourismPay will automatically settle your earnings on a rolling 2-day basis.</p>
                <p>4. You can trigger manual payouts at any time from the Available Balance panel above.</p>
                <p className="text-xs pt-2">
                  <strong>Test mode:</strong> Use routing number <code>110000000</code> and account number <code>000123456789</code> for test bank accounts.
                </p>
              </CardContent>
            </Card>
          </>
        )}

        {/* Manual Payout Dialog */}
        <Dialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Trigger Manual Payout</DialogTitle>
              <DialogDescription>
                Initiate an immediate payout from your available Stripe balance to your connected bank account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Amount</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0.50"
                    step="0.01"
                    placeholder="0.00"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    className="flex-1"
                  />
                  <select
                    value={payoutCurrency}
                    onChange={(e) => setPayoutCurrency(e.target.value)}
                    className="border rounded-md px-3 py-2 bg-background text-sm"
                  >
                    <option value="usd">USD</option>
                    <option value="eur">EUR</option>
                    <option value="gbp">GBP</option>
                    <option value="ngn">NGN</option>
                    <option value="kes">KES</option>
                    <option value="zar">ZAR</option>
                  </select>
                </div>
                <p className="text-xs text-muted-foreground">Minimum: $0.50 USD equivalent</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayoutDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleTriggerPayout}
                disabled={triggerPayoutMut.isPending || !payoutAmount}
                className="gap-2"
              >
                {triggerPayoutMut.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Initiate Payout
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
