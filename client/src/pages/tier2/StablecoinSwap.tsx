import { useState, useMemo } from "react";
import {
  ArrowDownUp, DollarSign, Zap, CreditCard, Building2, Smartphone,
  TrendingUp, Clock, Shield, Loader2, ArrowRight, Wallet, BarChart3,
  Globe, Percent, PiggyBank, Timer, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// ─── Constants ───────────────────────────────────────────────────────────────

const STABLECOINS = [
  { symbol: "USDC", name: "USD Coin", icon: DollarSign, color: "text-blue-500" },
  { symbol: "USDT", name: "Tether USD", icon: DollarSign, color: "text-green-500" },
  { symbol: "DAI", name: "Dai", icon: DollarSign, color: "text-yellow-500" },
  { symbol: "CBDC-NG", name: "eNaira", icon: Zap, color: "text-green-600" },
  { symbol: "CBDC-KE", name: "eCedi (Kenya)", icon: Zap, color: "text-red-500" },
  { symbol: "CBDC-GH", name: "eCedi (Ghana)", icon: Zap, color: "text-orange-500" },
] as const;

const FIAT_CURRENCIES = [
  { symbol: "NGN", name: "Nigerian Naira", flag: "🇳🇬" },
  { symbol: "KES", name: "Kenyan Shilling", flag: "🇰🇪" },
  { symbol: "GHS", name: "Ghanaian Cedi", flag: "🇬🇭" },
  { symbol: "ZAR", name: "South African Rand", flag: "🇿🇦" },
  { symbol: "TZS", name: "Tanzanian Shilling", flag: "🇹🇿" },
  { symbol: "UGX", name: "Ugandan Shilling", flag: "🇺🇬" },
  { symbol: "XOF", name: "West African CFA", flag: "🌍" },
  { symbol: "USD", name: "US Dollar", flag: "🇺🇸" },
  { symbol: "EUR", name: "Euro", flag: "🇪🇺" },
  { symbol: "GBP", name: "British Pound", flag: "🇬🇧" },
] as const;

const PAYMENT_RAILS = [
  { id: "mpesa", name: "M-Pesa", icon: Smartphone, countries: ["KE", "TZ"] },
  { id: "mtn_momo", name: "MTN MoMo", icon: Smartphone, countries: ["GH", "UG", "CM"] },
  { id: "orange_money", name: "Orange Money", icon: Smartphone, countries: ["SN", "ML"] },
  { id: "airtel_money", name: "Airtel Money", icon: Smartphone, countries: ["ZM", "UG"] },
  { id: "opay", name: "OPay", icon: Smartphone, countries: ["NG"] },
  { id: "bank_transfer", name: "Bank Transfer", icon: Building2, countries: ["NG", "KE", "GH", "ZA", "US", "GB"] },
  { id: "stripe_card", name: "Card (Visa/MC)", icon: CreditCard, countries: ["US", "GB", "NG", "KE", "GH", "ZA"] },
  { id: "flutterwave", name: "Flutterwave", icon: Globe, countries: ["NG", "KE", "GH", "ZA"] },
  { id: "chipper_cash", name: "Chipper Cash", icon: Wallet, countries: ["NG", "KE", "GH", "ZA"] },
  { id: "mojaloop", name: "Mojaloop (Interbank)", icon: ArrowDownUp, countries: ["NG", "KE", "GH", "ZA"] },
  { id: "cbdc_bridge", name: "CBDC Bridge", icon: Zap, countries: ["NG", "GH"] },
] as const;

type TabType = "buy" | "sell" | "yield" | "limits" | "history";

export default function StablecoinSwap() {
  const [tab, setTab] = useState<TabType>("buy");
  const [buyAmount, setBuyAmount] = useState("");
  const [buyFiat, setBuyFiat] = useState("NGN");
  const [buyStable, setBuyStable] = useState("USDC");
  const [buyRail, setBuyRail] = useState("mpesa");
  const [buyMobile, setBuyMobile] = useState("");
  const [buying, setBuying] = useState(false);

  const [sellAmount, setSellAmount] = useState("");
  const [sellStable, setSellStable] = useState("USDC");
  const [sellFiat, setSellFiat] = useState("KES");
  const [sellRail, setSellRail] = useState("mpesa");
  const [sellRecipient, setSellRecipient] = useState("");
  const [sellPhone, setSellPhone] = useState("");
  const [sellBank, setSellBank] = useState("");
  const [sellAccount, setSellAccount] = useState("");
  const [selling, setSelling] = useState(false);

  const [yieldAmount, setYieldAmount] = useState("");
  const [yieldStable, setYieldStable] = useState("USDC");
  const [yieldProtocol, setYieldProtocol] = useState("tourismpay_vault");
  const [depositing, setDepositing] = useState(false);

  const [limitDir, setLimitDir] = useState<"buy" | "sell">("buy");
  const [limitAmount, setLimitAmount] = useState("");
  const [limitRate, setLimitRate] = useState("");
  const [limitFiat, setLimitFiat] = useState("NGN");
  const [limitStable, setLimitStable] = useState("USDC");
  const [creatingLimit, setCreatingLimit] = useState(false);

  const [resultDialog, setResultDialog] = useState<{ open: boolean; data: Record<string, unknown> | null }>({ open: false, data: null });

  // Queries
  const buyQuote = trpc.stablecoinSwap.onrampQuote.useQuery(
    { sourceCurrency: buyFiat as never, sourceAmount: parseFloat(buyAmount) || 1, targetStablecoin: buyStable as never, paymentRail: buyRail as never },
    { enabled: parseFloat(buyAmount) > 0 }
  );
  const sellQuote = trpc.stablecoinSwap.offrampQuote.useQuery(
    { sourceStablecoin: sellStable as never, sourceAmount: parseFloat(sellAmount) || 1, targetCurrency: sellFiat as never, payoutRail: sellRail as never },
    { enabled: parseFloat(sellAmount) > 0 }
  );
  const onrampHistory = trpc.stablecoinSwap.onrampHistory.useQuery({ limit: 10, offset: 0 });
  const offrampHistory = trpc.stablecoinSwap.offrampHistory.useQuery({ limit: 10, offset: 0 });
  const yieldPositions = trpc.stablecoinSwap.yieldPositions.useQuery();
  const limitOrders = trpc.stablecoinSwap.listLimitOrders.useQuery({});
  const railsInfo = trpc.stablecoinSwap.supportedRails.useQuery();

  // Mutations
  const buyMut = trpc.stablecoinSwap.onrampBuy.useMutation({
    onSuccess: (data) => {
      toast.success(`Bought ${data.targetAmount.toFixed(2)} ${buyStable}`);
      setResultDialog({ open: true, data: data as unknown as Record<string, unknown> });
      setBuyAmount("");
      setBuying(false);
      onrampHistory.refetch();
    },
    onError: (err) => { toast.error(err.message); setBuying(false); },
  });

  const sellMut = trpc.stablecoinSwap.offrampSell.useMutation({
    onSuccess: (data) => {
      toast.success(`Sold ${sellAmount} ${sellStable} → ${data.targetAmount.toFixed(2)} ${sellFiat}`);
      setResultDialog({ open: true, data: data as unknown as Record<string, unknown> });
      setSellAmount("");
      setSelling(false);
      offrampHistory.refetch();
    },
    onError: (err) => { toast.error(err.message); setSelling(false); },
  });

  const yieldMut = trpc.stablecoinSwap.yieldDeposit.useMutation({
    onSuccess: (data) => {
      toast.success(`Deposited to ${data.protocol} — APY ${data.apyPercent}`);
      setYieldAmount("");
      setDepositing(false);
      yieldPositions.refetch();
    },
    onError: (err) => { toast.error(err.message); setDepositing(false); },
  });

  const yieldWithdrawMut = trpc.stablecoinSwap.yieldWithdraw.useMutation({
    onSuccess: (data) => {
      toast.success(`Withdrew ${data.totalReturn.toFixed(2)} (+${data.accruedYield.toFixed(4)} yield)`);
      yieldPositions.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const limitMut = trpc.stablecoinSwap.createLimitOrder.useMutation({
    onSuccess: () => {
      toast.success("Limit order created");
      setLimitAmount("");
      setLimitRate("");
      setCreatingLimit(false);
      limitOrders.refetch();
    },
    onError: (err) => { toast.error(err.message); setCreatingLimit(false); },
  });

  const cancelLimitMut = trpc.stablecoinSwap.cancelLimitOrder.useMutation({
    onSuccess: () => { toast.success("Order cancelled"); limitOrders.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const tabs: { id: TabType; label: string; icon: typeof DollarSign }[] = [
    { id: "buy", label: "Buy (On-Ramp)", icon: ArrowRight },
    { id: "sell", label: "Sell (Off-Ramp)", icon: ArrowDownUp },
    { id: "yield", label: "Earn Yield", icon: PiggyBank },
    { id: "limits", label: "Limit Orders", icon: Timer },
    { id: "history", label: "History", icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Stablecoin Swap" subtitle="Buy and sell stablecoins with African payment rails" />

      {/* Tab Navigation — scrollable on mobile, full width on desktop */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors touch-manipulation ${
              tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4 shrink-0" />
            <span className="hidden xs:inline sm:inline">{t.label}</span>
            <span className="xs:hidden">{t.label.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      {/* ─── BUY (On-Ramp) Tab ────────────────────────────────────────────── */}
      {tab === "buy" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-4 p-4 sm:p-6 border rounded-xl">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-green-500" /> Buy Stablecoin
            </h3>

            <div className="space-y-3">
              <div>
                <Label>You Pay</Label>
                <div className="flex gap-2">
                  <Input type="number" placeholder="0.00" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} className="flex-1" />
                  <Select value={buyFiat} onValueChange={setBuyFiat}>
                    <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIAT_CURRENCIES.map((c) => (
                        <SelectItem key={c.symbol} value={c.symbol}>{c.flag} {c.symbol}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>You Receive</Label>
                <Select value={buyStable} onValueChange={setBuyStable}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STABLECOINS.map((s) => (
                      <SelectItem key={s.symbol} value={s.symbol}>{s.name} ({s.symbol})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Payment Method</Label>
                <Select value={buyRail} onValueChange={setBuyRail}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_RAILS.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} ({r.countries.join(", ")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(buyRail === "mpesa" || buyRail === "mtn_momo" || buyRail === "orange_money" || buyRail === "airtel_money") && (
                <div>
                  <Label>Mobile Number</Label>
                  <Input placeholder="+254..." value={buyMobile} onChange={(e) => setBuyMobile(e.target.value)} />
                </div>
              )}
            </div>

            <Button
              className="w-full"
              disabled={!buyAmount || parseFloat(buyAmount) <= 0 || buying}
              onClick={() => {
                setBuying(true);
                buyMut.mutate({
                  sourceCurrency: buyFiat as never,
                  sourceAmount: parseFloat(buyAmount),
                  targetStablecoin: buyStable as never,
                  paymentRail: buyRail as never,
                  mobileNumber: buyMobile || undefined,
                });
              }}
            >
              {buying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Buy {buyStable}
            </Button>
          </div>

          {/* Quote Preview */}
          <div className="p-4 sm:p-6 border rounded-xl space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5" /> Quote Preview
            </h3>
            {buyQuote.data && parseFloat(buyAmount) > 0 ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center"><span className="text-muted-foreground text-sm">You Pay</span><span className="font-mono text-sm">{buyAmount} {buyFiat}</span></div>
                <div className="flex justify-between items-center"><span className="text-muted-foreground text-sm">You Receive</span><span className="font-mono text-sm font-semibold text-green-500">{buyQuote.data.targetAmount.toFixed(2)} {buyStable}</span></div>
                <div className="flex justify-between items-center flex-wrap gap-1"><span className="text-muted-foreground text-sm">Exchange Rate</span><span className="font-mono text-xs sm:text-sm">1 {buyFiat} = {buyQuote.data.exchangeRate.toFixed(6)} {buyStable}</span></div>
                <div className="flex justify-between items-center"><span className="text-muted-foreground text-sm">Fee</span><span className="font-mono text-sm">${buyQuote.data.fee.toFixed(2)} ({buyQuote.data.feePercent}%)</span></div>
                <div className="flex justify-between items-center"><span className="text-muted-foreground text-sm">Spread</span><span className="font-mono text-sm">{buyQuote.data.spreadPercent}%</span></div>
                <div className="flex justify-between items-center"><span className="text-muted-foreground text-sm">Est. Time</span><span className="text-sm">{buyQuote.data.estimatedTime}</span></div>
                <div className="flex justify-between items-center"><span className="text-muted-foreground text-sm">Payment</span><Badge variant="outline">{buyRail.replace(/_/g, " ")}</Badge></div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Enter an amount to see a quote</p>
            )}

            {/* Supported Rails Info */}
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-2">Supported Payment Rails</h4>
              <div className="flex flex-wrap gap-1">
                {PAYMENT_RAILS.map((r) => (
                  <Badge key={r.id} variant="secondary" className="text-xs">{r.name}</Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── SELL (Off-Ramp) Tab ──────────────────────────────────────────── */}
      {tab === "sell" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-4 p-4 sm:p-6 border rounded-xl">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <ArrowDownUp className="h-5 w-5 text-orange-500" /> Sell Stablecoin
            </h3>

            <div className="space-y-3">
              <div>
                <Label>You Sell</Label>
                <div className="flex gap-2">
                  <Input type="number" placeholder="0.00" value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} className="flex-1" />
                  <Select value={sellStable} onValueChange={setSellStable}>
                    <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STABLECOINS.map((s) => (
                        <SelectItem key={s.symbol} value={s.symbol}>{s.symbol}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>You Receive</Label>
                <Select value={sellFiat} onValueChange={setSellFiat}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIAT_CURRENCIES.map((c) => (
                      <SelectItem key={c.symbol} value={c.symbol}>{c.flag} {c.symbol} — {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Payout Method</Label>
                <Select value={sellRail} onValueChange={setSellRail}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_RAILS.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Recipient Name</Label>
                <Input placeholder="John Doe" value={sellRecipient} onChange={(e) => setSellRecipient(e.target.value)} />
              </div>

              {(sellRail === "mpesa" || sellRail === "mtn_momo" || sellRail === "orange_money" || sellRail === "airtel_money") && (
                <div>
                  <Label>Recipient Phone</Label>
                  <Input placeholder="+254..." value={sellPhone} onChange={(e) => setSellPhone(e.target.value)} />
                </div>
              )}

              {(sellRail === "bank_transfer") && (
                <>
                  <div>
                    <Label>Bank Name</Label>
                    <Input placeholder="KCB Bank" value={sellBank} onChange={(e) => setSellBank(e.target.value)} />
                  </div>
                  <div>
                    <Label>Account Number</Label>
                    <Input placeholder="1234567890" value={sellAccount} onChange={(e) => setSellAccount(e.target.value)} />
                  </div>
                </>
              )}
            </div>

            <Button
              className="w-full"
              variant="destructive"
              disabled={!sellAmount || parseFloat(sellAmount) <= 0 || !sellRecipient || selling}
              onClick={() => {
                setSelling(true);
                sellMut.mutate({
                  sourceStablecoin: sellStable as never,
                  sourceAmount: parseFloat(sellAmount),
                  targetCurrency: sellFiat as never,
                  payoutRail: sellRail as never,
                  recipientName: sellRecipient,
                  recipientPhone: sellPhone || undefined,
                  recipientBank: sellBank || undefined,
                  recipientAccount: sellAccount || undefined,
                });
              }}
            >
              {selling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sell {sellStable}
            </Button>
          </div>

          {/* Off-Ramp Quote */}
          <div className="p-4 sm:p-6 border rounded-xl space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5" /> Off-Ramp Quote
            </h3>
            {sellQuote.data && parseFloat(sellAmount) > 0 ? (
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-muted-foreground">You Sell</span><span className="font-mono">{sellAmount} {sellStable}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">You Receive</span><span className="font-mono font-semibold text-orange-500">{sellQuote.data.targetAmount.toFixed(2)} {sellFiat}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Exchange Rate</span><span className="font-mono">1 {sellStable} = {sellQuote.data.exchangeRate.toFixed(4)} {sellFiat}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span className="font-mono">${sellQuote.data.fee.toFixed(2)} ({sellQuote.data.feePercent}%)</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Est. Time</span><span>{sellQuote.data.estimatedTime}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Payout</span><Badge variant="outline">{sellRail.replace(/_/g, " ")}</Badge></div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Enter an amount to see a quote</p>
            )}

            <div className="pt-4 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                Daily off-ramp limit: $5,000 USD
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── YIELD Tab ────────────────────────────────────────────────────── */}
      {tab === "yield" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-4 p-4 sm:p-6 border rounded-xl">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <PiggyBank className="h-5 w-5 text-purple-500" /> Deposit for Yield
              </h3>

              <div className="space-y-3">
                <div>
                  <Label>Stablecoin</Label>
                  <Select value={yieldStable} onValueChange={setYieldStable}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STABLECOINS.slice(0, 3).map((s) => (
                        <SelectItem key={s.symbol} value={s.symbol}>{s.name} ({s.symbol})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input type="number" placeholder="0.00" value={yieldAmount} onChange={(e) => setYieldAmount(e.target.value)} />
                </div>
                <div>
                  <Label>Protocol</Label>
                  <Select value={yieldProtocol} onValueChange={setYieldProtocol}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tourismpay_vault">TourismPay Vault — 5.0% APY</SelectItem>
                      <SelectItem value="compound_v3">Compound V3 — 4.2% APY</SelectItem>
                      <SelectItem value="aave_v3">Aave V3 — 3.8% APY</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                className="w-full"
                disabled={!yieldAmount || parseFloat(yieldAmount) <= 0 || depositing}
                onClick={() => {
                  setDepositing(true);
                  yieldMut.mutate({
                    stablecoin: yieldStable as never,
                    amount: parseFloat(yieldAmount),
                    protocol: yieldProtocol as never,
                  });
                }}
              >
                {depositing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Deposit {yieldStable}
              </Button>
            </div>

            {/* Protocol Comparison */}
            <div className="p-4 sm:p-6 border rounded-xl space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Percent className="h-5 w-5" /> Protocol Comparison
              </h3>
              <div className="space-y-3">
                {[
                  { name: "TourismPay Vault", apy: "5.0%", risk: "Low", desc: "TourismPay-managed lending pool" },
                  { name: "Compound V3", apy: "4.2%", risk: "Low", desc: "Decentralized lending protocol" },
                  { name: "Aave V3", apy: "3.8%", risk: "Low", desc: "Multi-chain lending protocol" },
                ].map((p) => (
                  <div key={p.name} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.desc}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold text-green-500">{p.apy}</div>
                      <Badge variant="secondary" className="text-xs">{p.risk}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Active Yield Positions */}
          {yieldPositions.data && yieldPositions.data.length > 0 && (
            <div className="p-4 sm:p-6 border rounded-xl">
              <h3 className="text-lg font-semibold mb-4">Active Positions</h3>
              <div className="space-y-3">
                {yieldPositions.data.map((pos) => (
                  <div key={pos.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium">{pos.principalAmount} {pos.stablecoin}</div>
                      <div className="text-sm text-muted-foreground">{pos.protocol} — {(pos.apyBps / 100).toFixed(1)}% APY</div>
                      <div className="text-xs text-muted-foreground">Status: {pos.status}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {pos.accruedYield && parseFloat(pos.accruedYield) > 0 && (
                        <Badge variant="secondary" className="text-green-500">+{parseFloat(pos.accruedYield).toFixed(4)}</Badge>
                      )}
                      {pos.status === "active" && (
                        <Button size="sm" variant="outline" onClick={() => yieldWithdrawMut.mutate({ positionId: pos.id })}>
                          Withdraw
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── LIMIT ORDERS Tab ─────────────────────────────────────────────── */}
      {tab === "limits" && (
        <div className="space-y-6">
          <div className="p-4 sm:p-6 border rounded-xl space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Timer className="h-5 w-5 text-blue-500" /> Create Limit Order
            </h3>
            <p className="text-sm text-muted-foreground">Schedule a buy or sell when the exchange rate hits your target.</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Direction</Label>
                <Select value={limitDir} onValueChange={(v) => setLimitDir(v as "buy" | "sell")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Buy (On-Ramp)</SelectItem>
                    <SelectItem value="sell">Sell (Off-Ramp)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Stablecoin</Label>
                <Select value={limitStable} onValueChange={setLimitStable}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STABLECOINS.slice(0, 3).map((s) => (
                      <SelectItem key={s.symbol} value={s.symbol}>{s.symbol}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount</Label>
                <Input type="number" placeholder="0.00" value={limitAmount} onChange={(e) => setLimitAmount(e.target.value)} />
              </div>
              <div>
                <Label>Target Rate</Label>
                <Input type="number" placeholder="1.0050" value={limitRate} onChange={(e) => setLimitRate(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Fiat Currency</Label>
              <Select value={limitFiat} onValueChange={setLimitFiat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIAT_CURRENCIES.map((c) => (
                    <SelectItem key={c.symbol} value={c.symbol}>{c.flag} {c.symbol}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full"
              disabled={!limitAmount || !limitRate || creatingLimit}
              onClick={() => {
                setCreatingLimit(true);
                limitMut.mutate({
                  direction: limitDir,
                  stablecoin: limitStable as never,
                  fiatCurrency: limitFiat as never,
                  amount: parseFloat(limitAmount),
                  targetRate: parseFloat(limitRate),
                });
              }}
            >
              {creatingLimit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Limit Order
            </Button>
          </div>

          {/* Active Limit Orders */}
          {limitOrders.data && limitOrders.data.length > 0 && (
            <div className="p-4 sm:p-6 border rounded-xl">
              <h3 className="text-lg font-semibold mb-4">Your Limit Orders</h3>
              <div className="space-y-3">
                {limitOrders.data.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={order.direction === "buy" ? "default" : "destructive"}>{order.direction.toUpperCase()}</Badge>
                        <span className="font-medium">{order.amount} {order.stablecoin}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">Target: {order.targetRate} {order.fiatCurrency}/{order.stablecoin}</div>
                      <div className="text-xs text-muted-foreground">Status: {order.status}</div>
                    </div>
                    {order.status === "active" && (
                      <Button size="sm" variant="outline" onClick={() => cancelLimitMut.mutate({ orderId: order.id })}>
                        Cancel
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── HISTORY Tab ──────────────────────────────────────────────────── */}
      {tab === "history" && (
        <div className="space-y-6">
          {/* On-Ramp History */}
          <div className="p-4 sm:p-6 border rounded-xl">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-green-500" /> On-Ramp History
            </h3>
            {onrampHistory.data?.orders && onrampHistory.data.orders.length > 0 ? (
              <div className="space-y-2">
                {onrampHistory.data.orders.map((order) => (
                  <div key={order.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-green-500 shrink-0">{order.status}</Badge>
                        <span className="font-mono text-xs sm:text-sm truncate">{order.sourceAmount} {order.sourceCurrency} → {order.targetAmount} {order.targetStablecoin}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        via {order.paymentRail} — Fee: ${order.fee}
                        {order.mintTxHash && <span className="ml-2">Tx: {order.mintTxHash.slice(0, 10)}...</span>}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">{order.createdAt ? new Date(Number(order.createdAt)).toLocaleDateString() : ""}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No on-ramp orders yet</p>
            )}
          </div>

          {/* Off-Ramp History */}
          <div className="p-4 sm:p-6 border rounded-xl">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ArrowDownUp className="h-5 w-5 text-orange-500" /> Off-Ramp History
            </h3>
            {offrampHistory.data?.requests && offrampHistory.data.requests.length > 0 ? (
              <div className="space-y-2">
                {offrampHistory.data.requests.map((req) => (
                  <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-orange-500 shrink-0">{req.status}</Badge>
                        <span className="font-mono text-xs sm:text-sm truncate">{req.sourceAmount} {req.sourceStablecoin} → {req.targetAmount} {req.targetCurrency}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        via {req.payoutRail} to {req.recipientName} — Fee: ${req.fee}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">{req.createdAt ? new Date(Number(req.createdAt)).toLocaleDateString() : ""}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No off-ramp requests yet</p>
            )}
          </div>
        </div>
      )}

      {/* ─── Result Dialog ────────────────────────────────────────────────── */}
      <Dialog open={resultDialog.open} onOpenChange={(o) => setResultDialog({ ...resultDialog, open: o })}>
        <DialogContent className="max-w-[95vw] sm:max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-500" /> Transaction Complete
            </DialogTitle>
          </DialogHeader>
          {resultDialog.data && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {Object.entries(resultDialog.data).map(([key, value]) => {
                if (key === "success") return null;
                const label = key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
                const display = typeof value === "number" ? value.toFixed(value < 1 ? 6 : 2) : String(value);
                return (
                  <div key={key} className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4">
                    <span className="text-muted-foreground capitalize text-sm">{label}</span>
                    <span className="font-mono text-sm truncate max-w-full sm:max-w-[200px]">{display}</span>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button className="w-full sm:w-auto" onClick={() => setResultDialog({ open: false, data: null })}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
