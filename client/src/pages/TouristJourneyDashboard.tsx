import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Wallet, ArrowUpRight, Globe, CreditCard, MapPin, Star,
  Hotel, UtensilsCrossed, Car, Music, Wine, Home,
  RefreshCw, TrendingUp, Gift, Receipt, Loader2, Bitcoin
} from "lucide-react";

type ProfileType = "diaspora_usd" | "diaspora_gbp" | "crypto_fiat";

const PROFILE_META: Record<ProfileType, { label: string; currency: string; flag: string; color: string }> = {
  diaspora_usd: { label: "Nigerian Diaspora (USD)", currency: "USD", flag: "🇺🇸", color: "text-blue-400" },
  diaspora_gbp: { label: "Nigerian Diaspora (GBP)", currency: "GBP", flag: "🇬🇧", color: "text-red-400" },
  crypto_fiat: { label: "International (Stablecoin)", currency: "USDC", flag: "🌐", color: "text-purple-400" },
};

const SERVICE_ICONS: Record<string, any> = {
  hotel: Hotel, restaurant: UtensilsCrossed, transport: Car,
  concert: Music, nightclub: Wine, airbnb: Home,
};

export default function TouristJourneyDashboard() {
  const [profileType, setProfileType] = useState<ProfileType>("diaspora_usd");
  const [activeTab, setActiveTab] = useState<"overview" | "topup" | "pay" | "bookings">("overview");

  // Topup form
  const [topupForm, setTopupForm] = useState({
    touristProfileId: "self",
    sourceCurrency: "USD" as string,
    sourceAmount: "",
    topupMethod: "wire_transfer" as string,
    providerReference: "",
    onChainTxHash: "",
  });

  // Payment form
  const [payForm, setPayForm] = useState({
    touristProfileId: "self",
    merchantId: "",
    merchantType: "restaurant" as string,
    description: "",
    amountNgn: "",
    tipAmountNgn: "0",
    paymentMethod: "wallet" as string,
  });

  // Stablecoin conversion form
  const [cryptoForm, setCryptoForm] = useState({
    touristProfileId: "self",
    tokenSymbol: "USDC" as string,
    tokenAmount: "",
    walletAddress: "",
    onChainTxHash: "",
  });

  const utils = trpc.useUtils();

  // Queries
  const configQuery = trpc.journeyOrchestrator.getTouristJourneyConfig.useQuery({ profileType });
  const dashboardQuery = trpc.journeyOrchestrator.getJourneyDashboard.useQuery();
  const walletQuery = trpc.wallet.balances.useQuery();

  // Mutations
  const topupMut = trpc.journeyOrchestrator.initiateWalletTopup.useMutation({
    onSuccess: (data) => {
      toast.success(`₦${data.targetAmountNgn.toLocaleString("en-NG", { maximumFractionDigits: 2 })} credited to your wallet!`);
      utils.wallet.balances.invalidate();
      setTopupForm(f => ({ ...f, sourceAmount: "", providerReference: "" }));
    },
    onError: (e) => toast.error(e.message),
  });

  const payMut = trpc.journeyOrchestrator.payAtMerchant.useMutation({
    onSuccess: (data) => {
      toast.success(`Payment successful! ${data.loyaltyPointsEarned} loyalty points earned.`);
      utils.wallet.balances.invalidate();
      setPayForm(f => ({ ...f, amountNgn: "", description: "", merchantId: "" }));
    },
    onError: (e) => toast.error(e.message),
  });

  const cryptoMut = trpc.journeyOrchestrator.convertStablecoinToNgn.useMutation({
    onSuccess: (data) => {
      toast.success(`₦${data.ngnAmount.toLocaleString("en-NG", { maximumFractionDigits: 2 })} credited from ${data.tokenSymbol}!`);
      utils.wallet.balances.invalidate();
      setCryptoForm(f => ({ ...f, tokenAmount: "", onChainTxHash: "" }));
    },
    onError: (e) => toast.error(e.message),
  });

  const config = configQuery.data;
  const walletBalances = (walletQuery.data as any[]) ?? [];
  const ngnBalance = walletBalances.find((b: any) => b.currency === "NGN")?.balance ?? 0;
  const foreignBalance = walletBalances.find((b: any) => b.currency !== "NGN");

  const meta = PROFILE_META[profileType];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Globe className="h-6 w-6 text-emerald-400" />
            Tourist Journey Dashboard
          </h1>
          <p className="text-sm text-zinc-400 mt-1">End-to-end experience for international visitors in Nigeria</p>
        </div>
        <div className="flex gap-2">
          {(Object.entries(PROFILE_META) as [ProfileType, any][]).map(([type, m]) => (
            <button
              key={type}
              onClick={() => { setProfileType(type); setTopupForm(f => ({ ...f, sourceCurrency: m.currency })); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${profileType === type ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
            >
              {m.flag} {m.currency}
            </button>
          ))}
        </div>
      </div>

      {/* Wallet Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <p className="text-xs text-zinc-400 uppercase tracking-wider">NGN Balance</p>
          <p className="text-2xl font-bold text-white mt-1">₦{ngnBalance.toLocaleString("en-NG", { maximumFractionDigits: 2 })}</p>
        </div>
        {foreignBalance && (
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wider">{foreignBalance.currency} Balance</p>
            <p className="text-2xl font-bold text-white mt-1">{foreignBalance.balance?.toLocaleString()}</p>
          </div>
        )}
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <p className="text-xs text-zinc-400 uppercase tracking-wider">Profile Type</p>
          <p className="text-sm font-bold text-white mt-1">{meta.label}</p>
        </div>
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <p className="text-xs text-zinc-400 uppercase tracking-wider">FX Spread</p>
          <p className="text-2xl font-bold text-white mt-1">{config?.fxSpread ?? 1.5}%</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-zinc-800/50 rounded-xl p-1 w-fit">
        {[
          { key: "overview", label: "Overview", icon: TrendingUp },
          { key: "topup", label: "Top Up Wallet", icon: Wallet },
          { key: "pay", label: "Pay at Merchant", icon: CreditCard },
          { key: "bookings", label: "My Bookings", icon: MapPin },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${activeTab === key ? "bg-emerald-600 text-white" : "text-zinc-400 hover:text-white"}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && config && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Journey Configuration</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-zinc-400">Source Currency</span><span className="text-white font-medium">{config.sourceCurrency}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Top-up Method</span><span className="text-white font-medium">{config.topupMethod.replace(/_/g, " ")}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">FX Spread</span><span className="text-white font-medium">{config.fxSpread}%</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">KYC Level</span><span className="text-white font-medium capitalize">{config.kycLevel}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Loyalty Tier</span><span className="text-emerald-400 font-medium capitalize">{config.loyaltyTier}</span></div>
            </div>
          </div>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Supported Services</h2>
            <div className="grid grid-cols-3 gap-3">
              {config.supportedServices.map((service: string) => {
                const Icon = SERVICE_ICONS[service] ?? MapPin;
                return (
                  <div key={service} className="flex flex-col items-center gap-1 p-2 bg-zinc-900/50 rounded-lg">
                    <Icon className="h-5 w-5 text-emerald-400" />
                    <span className="text-xs text-zinc-400 capitalize">{service.replace(/_/g, " ")}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Tax Information (Nigeria)</h2>
            <div className="space-y-2 text-sm">
              {Object.entries(config.taxInfo).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-zinc-400 capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                  <span className="text-white font-medium">{value as string}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Gift className="h-5 w-5 text-yellow-400" />Loyalty Program</h2>
            <div className="space-y-2 text-sm">
              {Object.entries(config.loyaltyInfo).map(([key, value]) => (
                <div key={key}>
                  <span className="text-zinc-400 capitalize">{key.replace(/([A-Z])/g, " $1")}: </span>
                  <span className="text-white">{Array.isArray(value) ? (value as string[]).join(" → ") : value as string}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top Up Tab */}
      {activeTab === "topup" && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Wallet className="h-5 w-5 text-emerald-400" />Top Up Wallet</h2>

          {/* Stablecoin conversion for crypto_fiat profile */}
          {profileType === "crypto_fiat" && (
            <div className="bg-purple-900/20 border border-purple-700/50 rounded-xl p-5 space-y-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2"><Bitcoin className="h-5 w-5 text-purple-400" />Stablecoin → NGN Conversion</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Token</label>
                  <select value={cryptoForm.tokenSymbol} onChange={e => setCryptoForm(f => ({ ...f, tokenSymbol: e.target.value }))} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white">
                    {["USDC", "USDT", "DAI", "BUSD"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Amount</label>
                  <input type="number" value={cryptoForm.tokenAmount} onChange={e => setCryptoForm(f => ({ ...f, tokenAmount: e.target.value }))} placeholder="e.g. 10000" className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white" />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Wallet Address</label>
                  <input type="text" value={cryptoForm.walletAddress} onChange={e => setCryptoForm(f => ({ ...f, walletAddress: e.target.value }))} placeholder="0x..." className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white font-mono text-xs" />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">On-Chain TX Hash</label>
                  <input type="text" value={cryptoForm.onChainTxHash} onChange={e => setCryptoForm(f => ({ ...f, onChainTxHash: e.target.value }))} placeholder="0x..." className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white font-mono text-xs" />
                </div>
              </div>
              {cryptoForm.tokenAmount && (
                <div className="bg-zinc-900/50 rounded-lg p-3 text-sm">
                  <p className="text-zinc-400">Estimated NGN: <span className="text-white font-medium">≈ ₦{(parseFloat(cryptoForm.tokenAmount) * 1580 * 0.98).toLocaleString("en-NG", { maximumFractionDigits: 2 })}</span></p>
                  <p className="text-zinc-500 text-xs mt-1">Rate: ~₦1,580/USD · 2% conversion fee</p>
                </div>
              )}
              <button
                onClick={() => cryptoMut.mutate({ touristProfileId: "self", tokenSymbol: cryptoForm.tokenSymbol as any, tokenAmount: parseFloat(cryptoForm.tokenAmount), walletAddress: cryptoForm.walletAddress, onChainTxHash: cryptoForm.onChainTxHash })}
                disabled={cryptoMut.isPending || !cryptoForm.tokenAmount || !cryptoForm.walletAddress || !cryptoForm.onChainTxHash}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2"
              >
                {cryptoMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                {cryptoMut.isPending ? "Converting..." : "Convert to NGN"}
              </button>
            </div>
          )}

          {/* Standard top-up */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Source Currency</label>
              <select value={topupForm.sourceCurrency} onChange={e => setTopupForm(f => ({ ...f, sourceCurrency: e.target.value }))} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white">
                {["USD", "GBP", "EUR", "USDC", "USDT"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Amount</label>
              <input type="number" value={topupForm.sourceAmount} onChange={e => setTopupForm(f => ({ ...f, sourceAmount: e.target.value }))} placeholder="e.g. 10000" className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white" />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Top-up Method</label>
              <select value={topupForm.topupMethod} onChange={e => setTopupForm(f => ({ ...f, topupMethod: e.target.value }))} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white">
                {["wire_transfer", "swift", "sepa", "card", "crypto"].map(m => <option key={m} value={m}>{m.replace(/_/g, " ").toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Provider Reference</label>
              <input type="text" value={topupForm.providerReference} onChange={e => setTopupForm(f => ({ ...f, providerReference: e.target.value }))} placeholder="Bank reference / TX ID" className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white" />
            </div>
          </div>
          {topupForm.sourceAmount && (
            <div className="bg-zinc-900/50 rounded-lg p-3 text-sm">
              <p className="text-zinc-400">Estimated NGN: <span className="text-white font-medium">≈ ₦{(parseFloat(topupForm.sourceAmount) * (topupForm.sourceCurrency === "GBP" ? 2010 : topupForm.sourceCurrency === "EUR" ? 1720 : 1580) * 0.985).toLocaleString("en-NG", { maximumFractionDigits: 2 })}</span></p>
              <p className="text-zinc-500 text-xs mt-1">1.5% FX spread applied</p>
            </div>
          )}
          <button
            onClick={() => topupMut.mutate({ touristProfileId: "self", sourceCurrency: topupForm.sourceCurrency as any, sourceAmount: parseFloat(topupForm.sourceAmount), topupMethod: topupForm.topupMethod as any, providerReference: topupForm.providerReference || undefined })}
            disabled={topupMut.isPending || !topupForm.sourceAmount}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2"
          >
            {topupMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            {topupMut.isPending ? "Processing..." : "Top Up Wallet"}
          </button>
        </div>
      )}

      {/* Pay at Merchant Tab */}
      {activeTab === "pay" && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2"><CreditCard className="h-5 w-5 text-emerald-400" />Pay at Merchant</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Merchant Type</label>
              <select value={payForm.merchantType} onChange={e => setPayForm(f => ({ ...f, merchantType: e.target.value }))} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white">
                {["hotel", "restaurant", "airbnb", "concert", "transport", "nightclub"].map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Merchant ID</label>
              <input type="text" value={payForm.merchantId} onChange={e => setPayForm(f => ({ ...f, merchantId: e.target.value }))} placeholder="merchant_xxx" className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white font-mono text-xs" />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Description</label>
              <input type="text" value={payForm.description} onChange={e => setPayForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Dinner for 2, Room 304" className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white" />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Amount (NGN)</label>
              <input type="number" value={payForm.amountNgn} onChange={e => setPayForm(f => ({ ...f, amountNgn: e.target.value }))} placeholder="e.g. 25000" className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white" />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Tip Amount (NGN)</label>
              <input type="number" value={payForm.tipAmountNgn} onChange={e => setPayForm(f => ({ ...f, tipAmountNgn: e.target.value }))} placeholder="0" className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white" />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Payment Method</label>
              <select value={payForm.paymentMethod} onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value }))} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white">
                {["wallet", "ussd", "qr"].map(m => <option key={m} value={m} className="capitalize">{m.toUpperCase()}</option>)}
              </select>
            </div>
          </div>
          {payForm.amountNgn && (
            <div className="bg-zinc-900/50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-zinc-400">Subtotal</span><span className="text-white">₦{parseFloat(payForm.amountNgn).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">VAT (7.5%)</span><span className="text-white">₦{(parseFloat(payForm.amountNgn) * 0.075).toLocaleString("en-NG", { maximumFractionDigits: 2 })}</span></div>
              {["hotel", "restaurant", "nightclub"].includes(payForm.merchantType) && <div className="flex justify-between"><span className="text-zinc-400">Service Charge (10%)</span><span className="text-white">₦{(parseFloat(payForm.amountNgn) * 0.10).toLocaleString("en-NG", { maximumFractionDigits: 2 })}</span></div>}
              {parseFloat(payForm.tipAmountNgn) > 0 && <div className="flex justify-between"><span className="text-zinc-400">Tip</span><span className="text-white">₦{parseFloat(payForm.tipAmountNgn).toLocaleString()}</span></div>}
              <div className="flex justify-between border-t border-zinc-700 pt-1 font-medium"><span className="text-zinc-300">Total</span><span className="text-emerald-400">₦{(parseFloat(payForm.amountNgn) * (["hotel","restaurant","nightclub"].includes(payForm.merchantType) ? 1.175 : 1.075) + parseFloat(payForm.tipAmountNgn || "0")).toLocaleString("en-NG", { maximumFractionDigits: 2 })}</span></div>
            </div>
          )}
          <button
            onClick={() => payMut.mutate({ touristProfileId: "self", merchantId: payForm.merchantId, merchantType: payForm.merchantType as any, description: payForm.description, amountNgn: parseFloat(payForm.amountNgn), tipAmountNgn: parseFloat(payForm.tipAmountNgn || "0"), paymentMethod: payForm.paymentMethod as any })}
            disabled={payMut.isPending || !payForm.amountNgn || !payForm.merchantId || !payForm.description}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2"
          >
            {payMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {payMut.isPending ? "Processing Payment..." : "Pay Now"}
          </button>
        </div>
      )}

      {/* Bookings Tab */}
      {activeTab === "bookings" && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2"><MapPin className="h-5 w-5 text-emerald-400" />My Bookings & Payments</h2>
            <button onClick={() => utils.wallet.balances.invalidate()} className="p-2 text-zinc-400 hover:text-white rounded-lg"><RefreshCw className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3">
            {[
              { type: "hotel", name: "Eko Hotel & Suites", date: "Check-in: Dec 20", amount: "₦450,000", status: "confirmed", icon: Hotel },
              { type: "restaurant", name: "Nok by Alara", date: "Dec 21, 7:30 PM", amount: "₦85,000", status: "completed", icon: UtensilsCrossed },
              { type: "transport", name: "Airport Transfer", date: "Dec 20, 2:00 PM", amount: "₦35,000", status: "completed", icon: Car },
              { type: "concert", name: "Afrobeats Festival", date: "Dec 22, 9:00 PM", amount: "₦120,000", status: "confirmed", icon: Music },
            ].map(({ type, name, date, amount, status, icon: Icon }) => (
              <div key={name} className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-lg border border-zinc-700/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
                    <Icon className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{name}</p>
                    <p className="text-xs text-zinc-500">{date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-white">{amount}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status === "confirmed" ? "bg-blue-900/50 text-blue-400" : "bg-emerald-900/50 text-emerald-400"}`}>{status}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 bg-zinc-900/50 rounded-lg border border-zinc-700/30">
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-yellow-400" />
              <span className="text-sm font-medium text-white">Loyalty Points</span>
            </div>
            <p className="text-2xl font-bold text-yellow-400">2,450 pts</p>
            <p className="text-xs text-zinc-500 mt-1">≈ ₦24.50 redemption value · Diaspora tier</p>
          </div>
        </div>
      )}
    </div>
  );
}
