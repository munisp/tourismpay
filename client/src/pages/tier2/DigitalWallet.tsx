import { useState, useCallback, useEffect, useMemo } from "react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ArrowUpRight, ArrowDownLeft, RefreshCw, DollarSign,
  Bitcoin, Zap, Plus, Download, CheckCircle2, Loader2, TrendingUp, Bell, BellOff, Trash2, Fingerprint, ShieldAlert,
  FileText, Calendar, Pencil, Check, X, Pause, Play, CreditCard, BarChart2, Globe, TrendingDown,
} from "lucide-react";
import { HIGH_VALUE_TX_THRESHOLD_USD } from "@shared/const";

// Approximate USD rates for high-value threshold detection on the frontend
const APPROX_USD_RATES_FE: Record<string, number> = {
  USDC: 1, USD: 1, "CBDC-NG": 0.00065, "CBDC-KE": 0.0077, "CBDC-GH": 0.067,
  "CBDC-ZA": 0.054, XLM: 0.11, NGN: 0.00065, KES: 0.0077, GHS: 0.067, ZAR: 0.054,
};
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import PageHeader from "@/components/shared/PageHeader";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const CURRENCY_ICONS: Record<string, { Icon: typeof DollarSign; color: string; label: string }> = {
  USDC:      { Icon: DollarSign, color: "text-primary",                  label: "USDC (Circle)" },
  "CBDC-NG": { Icon: Zap,        color: "text-[oklch(0.82_0.18_75)]",   label: "CBDC-NG (eNaira)" },
  XLM:       { Icon: Bitcoin,    color: "text-[oklch(0.65_0.18_230)]",  label: "Stellar XLM" },
  KES:       { Icon: DollarSign, color: "text-[oklch(0.72_0.18_145)]",  label: "KES (Kenya Shilling)" },
  ZAR:       { Icon: DollarSign, color: "text-[oklch(0.78_0.12_60)]",   label: "ZAR (South Africa)" },
};
const SUPPORTED_CURRENCIES = ["USDC", "CBDC-NG", "XLM", "KES", "ZAR", "NGN", "GHS", "USD"] as const;
type WalletCurrency = "USDC" | "CBDC-NG" | "XLM" | "KES" | "ZAR" | "NGN" | "GHS" | "USD" | "CBDC-KE" | "CBDC-GH" | "CBDC-ZA";

function fmt(val: string | number) {
  const n = typeof val === "string" ? parseFloat(val) : val;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}
function ago(ts: number) {
  const d = Math.floor(Date.now() / 1000 - ts);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

const CATEGORY_COLORS = [
  "oklch(0.65 0.20 250)", "oklch(0.72 0.18 145)", "oklch(0.78 0.18 60)",
  "oklch(0.60 0.22 30)", "oklch(0.68 0.16 310)", "oklch(0.75 0.14 200)",
];

// ─── Exchange Rate Indicator ─────────────────────────────────────────────────────

const TOURIST_CURRENCIES = [
  { code: "NGN", label: "Nigerian Naira", flag: "🇳🇬" },
  { code: "KES", label: "Kenyan Shilling", flag: "🇰🇪" },
  { code: "GHS", label: "Ghanaian Cedi", flag: "🇬🇭" },
  { code: "ZAR", label: "South African Rand", flag: "🇿🇦" },
  { code: "EGP", label: "Egyptian Pound", flag: "🇪🇬" },
  { code: "EUR", label: "Euro", flag: "🇪🇺" },
  { code: "GBP", label: "British Pound", flag: "🇬🇧" },
  { code: "TZS", label: "Tanzanian Shilling", flag: "🇹🇿" },
];

function ExchangeRateIndicator() {
  const [selectedCurrency, setSelectedCurrency] = useState("NGN");
  const { data, isLoading, refetch, isFetching } = trpc.exchangeRates.getRate.useQuery(
    { targetCurrency: selectedCurrency },
    { refetchInterval: 5 * 60 * 1000 } // refresh every 5 min
  );

  const currency = TOURIST_CURRENCIES.find((c) => c.code === selectedCurrency);
  const rate = data?.rate;
  const fetchedAt = data?.fetchedAt;
  const ageMinutes = fetchedAt ? Math.floor((Date.now() - fetchedAt) / 60_000) : null;

  return (
    <div className="glass-card p-4 animate-fade-in-up opacity-0 mb-4" style={{ animationDelay: "180ms", animationFillMode: "forwards" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Live Exchange Rates</span>
          <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
            {ageMinutes !== null ? (ageMinutes === 0 ? "just now" : `${ageMinutes}m ago`) : ""}
          </span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh rates"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedCurrency}
          onChange={(e) => setSelectedCurrency(e.target.value)}
          className="text-xs bg-white/5 border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {TOURIST_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.label}</option>
          ))}
        </select>
        {isLoading ? (
          <div className="h-8 w-40 bg-white/5 rounded animate-pulse" />
        ) : rate ? (
          <div className="flex items-center gap-2">
            <span className="text-2xl font-mono font-bold text-primary">
              {currency?.flag} {rate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </span>
            <span className="text-xs text-muted-foreground">{selectedCurrency} per USD</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Rate unavailable</span>
        )}
      </div>
      {rate && (
        <p className="text-[10px] text-muted-foreground mt-2">
          1 USD = {rate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {selectedCurrency}
          &nbsp;·&nbsp;
          1 {selectedCurrency} = {(1 / rate).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })} USD
          {data?.isFallback && <span className="ml-1 text-amber-500">(estimated)</span>}
        </p>
      )}
    </div>
  );
}

function SpendingAnalyticsPanel() {
  const { data, isLoading } = trpc.wallet.spendingAnalytics.useQuery();
  if (isLoading) return (
    <div className="glass-card mt-4 p-6 flex items-center justify-center animate-fade-in-up opacity-0" style={{ animationDelay: "500ms", animationFillMode: "forwards" }}>
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
    </div>
  );
  const monthly = data?.monthlyQr ?? [];
  const byCategory = data?.qrByCategory ?? [];
  const totalSpend = data?.totalQrSpend ?? 0;
  const totalCount = data?.totalQrCount ?? 0;
  return (
    <div className="glass-card overflow-hidden animate-fade-in-up opacity-0 mt-4" style={{ animationDelay: "500ms", animationFillMode: "forwards" }}>
      <div className="p-3 border-b border-border flex items-center gap-2">
        <BarChart2 className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Spending Analytics</span>
        <Badge variant="outline" className="text-xs h-4 ml-auto">Last 6 months</Badge>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3 border-b border-border">
        <div className="bg-primary/10 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Total QR Spend</div>
          <div className="text-lg font-bold text-primary">${totalSpend.toFixed(2)}</div>
        </div>
        <div className="bg-primary/10 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">QR Payments</div>
          <div className="text-lg font-bold text-primary">{totalCount}</div>
        </div>
      </div>
      {monthly.length > 0 && (
        <div className="p-4 border-b border-border">
          <div className="text-xs font-medium text-muted-foreground mb-3">Monthly QR Payments (USD)</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthly} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.4 0 0 / 0.2)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <RechartsTooltip
                contentStyle={{ background: "oklch(0.18 0.02 250)", border: "1px solid oklch(0.35 0.05 250)", borderRadius: "8px", fontSize: 12 }}
                formatter={(v: number) => [`$${v.toFixed(2)}`, "Spend"]}
              />
              <Bar dataKey="total" fill="oklch(0.65 0.20 250)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {byCategory.length > 0 && (
        <div className="p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Spend by Category</div>
          <div className="flex items-center gap-4">
            <PieChart width={120} height={120}>
              <Pie data={byCategory} dataKey="total" cx={55} cy={55} outerRadius={50} innerRadius={28}>
                {byCategory.map((_: any, i: number) => (
                  <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{ background: "oklch(0.18 0.02 250)", border: "1px solid oklch(0.35 0.05 250)", borderRadius: "8px", fontSize: 11 }}
                formatter={(v: number, _: string, p: any) => [`$${v.toFixed(2)}`, p.payload.category]}
              />
            </PieChart>
            <div className="flex-1 space-y-1.5">
              {byCategory.map((c: any, i: number) => (
                <div key={c.category} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                  <span className="capitalize flex-1 truncate">{c.category}</span>
                  <span className="text-muted-foreground">${c.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {monthly.length === 0 && byCategory.length === 0 && (
        <div className="p-6 text-center text-muted-foreground text-sm">No QR payment data yet. Make your first QR payment to see spending analytics.</div>
      )}
    </div>
  );
}

export default function DigitalWallet() {
  const utils = trpc.useUtils();
  const { data: balances = [], isLoading: loadingBal } = trpc.wallet.balances.useQuery();
  // Cursor-based pagination state
  const [txCursor, setTxCursor] = useState<number | undefined>(undefined);
  const [txAllItems, setTxAllItems] = useState<any[]>([]);
  const { data: txData, isLoading: loadingTx, isFetching: fetchingTx } = trpc.wallet.transactions.useQuery({ limit: 20, cursor: txCursor });
  const { data: txCountData } = trpc.wallet.getTransactionCount.useQuery();
  // Accumulate pages as cursor advances
  useEffect(() => {
    if (!txData?.items) return;
    if (!txCursor) {
      setTxAllItems(txData.items);
    } else {
      setTxAllItems((prev) => [...prev, ...txData.items]);
    }
  }, [txData]);
  // Search state — overrides cursor-paginated list when active
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCurrency, setSearchCurrency] = useState<string>("");
  const [searchType, setSearchType] = useState<string>("");
  const [searchDateFrom, setSearchDateFrom] = useState("");
  const [searchDateTo, setSearchDateTo] = useState("");
  const [searchAmountMin, setSearchAmountMin] = useState("");
  const [searchAmountMax, setSearchAmountMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const hasActiveFilters = !!(searchQuery || searchCurrency || searchType || searchDateFrom || searchDateTo || searchAmountMin || searchAmountMax);
  const { data: searchData, isLoading: loadingSearch } = trpc.wallet.searchTransactions.useQuery(
    {
      query: searchQuery || undefined,
      currency: (searchCurrency as any) || undefined,
      type: (searchType as any) || undefined,
      dateFrom: searchDateFrom ? new Date(searchDateFrom).getTime() : undefined,
      dateTo: searchDateTo ? new Date(searchDateTo + "T23:59:59").getTime() : undefined,
      amountMin: searchAmountMin ? parseFloat(searchAmountMin) : undefined,
      amountMax: searchAmountMax ? parseFloat(searchAmountMax) : undefined,
      limit: 50,
      offset: 0,
    },
    { enabled: hasActiveFilters }
  );
  const txList = hasActiveFilters ? (searchData?.transactions ?? []) : txAllItems;
  const { data: portfolio } = trpc.wallet.portfolioSummary.useQuery();
  const { data: balanceSummaryData } = trpc.wallet.balanceSummary.useQuery();

  const sendMut = trpc.wallet.send.useMutation({
    onSuccess: () => { utils.wallet.balances.invalidate(); utils.wallet.transactions.invalidate(); utils.wallet.portfolioSummary.invalidate(); toast.success("Transfer sent"); setSendOpen(false); setSendForm({ currency: "USDC", amount: "", counterparty: "", note: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const depositMut = trpc.wallet.deposit.useMutation({
    onSuccess: () => { utils.wallet.balances.invalidate(); utils.wallet.transactions.invalidate(); utils.wallet.portfolioSummary.invalidate(); toast.success("Deposit simulated"); setDepositOpen(false); setDepositForm({ currency: "USDC", amount: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const swapMut = trpc.wallet.swap.useMutation({
    onSuccess: () => { utils.wallet.balances.invalidate(); utils.wallet.transactions.invalidate(); utils.wallet.portfolioSummary.invalidate(); toast.success("Swap completed"); setSwapOpen(false); setSwapForm({ fromCurrency: "USDC", toCurrency: "XLM", amount: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const exportTxMut = trpc.wallet.exportTransactions.useMutation({
    onSuccess: (data) => {
      if (!data.csv) { toast.info("No transactions to export."); return; }
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.rowCount} transactions`);
    },
    onError: () => toast.error("Export failed"),
  });
  const topUpMut = trpc.wallet.topUp.useMutation({
    onSuccess: (data) => { toast.success(data.message ?? "Top-up request submitted!"); setTopUpOpen(false); setTopUpForm({ currency: "USDC", amount: "", bankName: "", accountNumber: "", accountName: "" }); },
    onError: (e) => toast.error(e.message),
  });
  // Statement download state
  const [stmtOpen, setStmtOpen] = useState(false);
  const [stmtDateFrom, setStmtDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [stmtDateTo, setStmtDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [stmtCurrency, setStmtCurrency] = useState("");
  const exportStmtCsvMut = trpc.wallet.exportStatement.useMutation({
    onSuccess: (data) => {
      if (!data.csv) { toast.info("No transactions in the selected period."); return; }
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = data.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Statement exported: ${data.rowCount} transactions`);
      setStmtOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const exportStmtMdMut = trpc.wallet.exportStatementPdf.useMutation({
    onSuccess: (data) => {
      if (!data.markdown) { toast.info("No transactions in the selected period."); return; }
      const mdContent = typeof data.markdown === "string" ? data.markdown : JSON.stringify(data.markdown);
      const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = data.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Statement exported: ${data.rowCount} transactions`);
      setStmtOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const handleStmtDownload = useCallback((format: "csv" | "md") => {
    const payload = { dateFrom: stmtDateFrom, dateTo: stmtDateTo, currency: stmtCurrency || undefined };
    if (format === "csv") exportStmtCsvMut.mutate(payload);
    else exportStmtMdMut.mutate(payload);
  }, [stmtDateFrom, stmtDateTo, stmtCurrency, exportStmtCsvMut, exportStmtMdMut]);

  // Balance alert state
  const { data: balanceAlerts = [] } = trpc.wallet.getBalanceAlerts.useQuery();
  // Real-time breach detection: poll every 10s
  const { data: alertBreaches = [] } = trpc.wallet.activeAlertBreaches.useQuery(undefined, {
    refetchInterval: 10_000,
  });
  const [dismissedBreachIds, setDismissedBreachIds] = useState<Set<string>>(new Set());
  const visibleBreaches = (alertBreaches as any[]).filter((b) => !dismissedBreachIds.has(b.id));
  const dismissBreach = (id: string) => setDismissedBreachIds(prev => new Set(Array.from(prev).concat(id)));
  const dismissAllBreaches = () => setDismissedBreachIds(new Set(Array.from((alertBreaches as any[]).map((b) => b.id))));
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertCurrency, setAlertCurrency] = useState("USDC");
  const [alertThreshold, setAlertThreshold] = useState("");
  const setAlertMut = trpc.wallet.setBalanceAlert.useMutation({
    onSuccess: (data) => {
      toast.success(data.updated ? "Alert threshold updated!" : "Balance alert created!");
      setAlertOpen(false);
      setAlertThreshold("");
      utils.wallet.getBalanceAlerts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const toggleAlertMut = trpc.wallet.toggleBalanceAlert.useMutation({
    onSuccess: (data) => {
      toast.success(data.isActive ? "Alert enabled" : "Alert paused");
      utils.wallet.getBalanceAlerts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
   const deleteAlertMut = trpc.wallet.deleteBalanceAlert.useMutation({
    onSuccess: () => {
      toast.success("Alert deleted");
      utils.wallet.getBalanceAlerts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  // Inline edit state for balance alert thresholds
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);
  const [editingAlertValue, setEditingAlertValue] = useState("");
  const updateAlertMut = trpc.wallet.updateBalanceAlert.useMutation({
    onSuccess: () => {
      toast.success("Alert threshold updated");
      utils.wallet.getBalanceAlerts.invalidate();
      setEditingAlertId(null);
      setEditingAlertValue("");
    },
    onError: (err) => toast.error(err.message),
  });
  // Spending limits state
  const { data: spendingLimits = [] } = trpc.wallet.getSpendingLimits.useQuery();
  const [limitOpen, setLimitOpen] = useState(false);
  const [limitCurrency, setLimitCurrency] = useState<string>("USDC");
  const [limitPeriod, setLimitPeriod] = useState<"daily" | "monthly">("daily");
  const [limitAmount, setLimitAmount] = useState("");
  const setLimitMut = trpc.wallet.setSpendingLimit.useMutation({
    onSuccess: (data) => {
      toast.success((data as any).updated ? "Spending limit updated!" : "Spending limit set!");
      setLimitOpen(false);
      setLimitAmount("");
      utils.wallet.getSpendingLimits.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const toggleLimitMut = trpc.wallet.toggleSpendingLimit.useMutation({
    onSuccess: (data) => {
      toast.success((data as any).isActive ? "Limit enabled" : "Limit paused");
      utils.wallet.getSpendingLimits.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteLimitMut = trpc.wallet.deleteSpendingLimit.useMutation({
    onSuccess: () => {
      toast.success("Spending limit removed");
      utils.wallet.getSpendingLimits.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Transaction detail slide-over
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const { data: txDetail, isLoading: loadingTxDetail } = trpc.wallet.getTransaction.useQuery(
    { id: selectedTxId! },
    { enabled: !!selectedTxId }
  );
  const { data: receiptData } = trpc.wallet.getTransactionReceipt.useQuery(
    { id: selectedTxId! },
    { enabled: !!selectedTxId }
  );
  const handleDownloadReceipt = useCallback(() => {
    if (!receiptData?.receipt) return;
    const r = receiptData.receipt;
    const lines = [
      "=== TourismPay Transaction Receipt ===",
      `Receipt ID:       ${r.receiptId}`,
      `Transaction ID:   ${r.transactionId}`,
      `Type:             ${r.type}`,
      `Status:           ${r.status}`,
      `Amount:           ${r.amount} ${r.currency}`,
      `Fee:              ${r.fee} ${r.currency}`,
      `Net Amount:       ${r.netAmount} ${r.currency}`,
      r.isCrossCurrency ? `Converted:        ${r.convertedAmount} ${r.toCurrency}` : "",
      r.isCrossCurrency ? `Exchange Rate:    ${r.exchangeRate}` : "",
      r.counterparty ? `Counterparty:     ${r.counterparty}` : "",
      r.counterpartyAddress ? `Address:          ${r.counterpartyAddress}` : "",
      r.reference ? `Reference:        ${r.reference}` : "",
      r.note ? `Note:             ${r.note}` : "",
      r.txHash ? `TX Hash:          ${r.txHash}` : "",
      `Created:          ${r.createdAt ?? "—"}`,
      r.completedAt ? `Completed:        ${r.completedAt}` : "",
      `Generated:        ${r.generatedAt}`,
      `Platform:         ${r.platform}`,
      "=====================================",
    ].filter(Boolean).join("\n");
    const blob = new Blob([lines], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${r.receiptId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [receiptData]);

  const [sendOpen, setSendOpen] = useState(false);
  const [biometricStep, setBiometricStep] = useState(false);
  const [pendingBiometricToken, setPendingBiometricToken] = useState<string | null>(null);

  const requestTokenMut = trpc.biometric.requestHighValueToken.useMutation({
    onSuccess: (data) => {
      setPendingBiometricToken(data.token);
      setBiometricStep(true);
    },
    onError: (e) => {
      if ((e.data as any)?.code === "PRECONDITION_FAILED") {
        toast.error("Biometric re-auth required. Register a device via Settings → Biometric Security.");
      } else {
        toast.error(e.message);
      }
    },
  });

  const handleSendSubmit = () => {
    const amount = parseFloat(sendForm.amount);
    if (!amount || !sendForm.counterparty) return;
    const usdEquiv = amount * (APPROX_USD_RATES_FE[sendForm.currency] ?? 1);
    if (usdEquiv >= HIGH_VALUE_TX_THRESHOLD_USD) {
      requestTokenMut.mutate({ amount, currency: sendForm.currency });
    } else {
      sendMut.mutate({ currency: sendForm.currency, amount, counterparty: sendForm.counterparty, note: sendForm.note || undefined });
    }
  };

  const handleBiometricConfirm = () => {
    if (!pendingBiometricToken) return;
    const amount = parseFloat(sendForm.amount);
    sendMut.mutate({
      currency: sendForm.currency,
      amount,
      counterparty: sendForm.counterparty,
      note: sendForm.note || undefined,
      biometricToken: pendingBiometricToken,
    });
    setBiometricStep(false);
    setPendingBiometricToken(null);
  };

  const [depositOpen, setDepositOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<{ toAddress: string; counterpartyName: string; amount: string; currency: WalletCurrency; recurrence: "once" | "daily" | "weekly" | "monthly"; scheduledAt: string; note: string; reference: string }>({
    toAddress: "", counterpartyName: "", amount: "", currency: "USDC", recurrence: "once", scheduledAt: "", note: "", reference: "",
  });
  const { data: scheduledPaymentsData, refetch: refetchScheduled } = trpc.wallet.getScheduledPayments.useQuery({ status: undefined });
  const schedulePaymentMut = trpc.wallet.schedulePayment.useMutation({
    onSuccess: () => { toast.success("Payment scheduled successfully"); setScheduleOpen(false); setScheduleForm({ toAddress: "", counterpartyName: "", amount: "", currency: "USDC", recurrence: "once", scheduledAt: "", note: "", reference: "" }); refetchScheduled(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelScheduledMut = trpc.wallet.cancelScheduledPayment.useMutation({
    onSuccess: () => { toast.success("Scheduled payment cancelled"); refetchScheduled(); },
    onError: (e) => toast.error(e.message),
  });
  const pauseScheduledMut = trpc.wallet.pauseScheduledPayment.useMutation({
    onSuccess: () => { toast.success("Scheduled payment paused"); refetchScheduled(); },
    onError: (e) => toast.error(e.message),
  });
  const resumeScheduledMut = trpc.wallet.resumeScheduledPayment.useMutation({
    onSuccess: () => { toast.success("Scheduled payment resumed"); refetchScheduled(); },
    onError: (e) => toast.error(e.message),
  });
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertForm, setConvertForm] = useState<{ fromCurrency: WalletCurrency; toCurrency: WalletCurrency; amount: string }>({ fromCurrency: "USDC", toCurrency: "XLM", amount: "" });
  const { data: exchangeRatesData } = trpc.wallet.getExchangeRates.useQuery({ base: convertForm.fromCurrency }, { enabled: convertOpen });
  const convertMut = trpc.wallet.convertCurrency.useMutation({
    onSuccess: (data) => {
      utils.wallet.balances.invalidate();
      utils.wallet.transactions.invalidate();
      utils.wallet.portfolioSummary.invalidate();
      toast.success(`Converted ${data.fromAmount} ${data.fromCurrency} → ${data.toAmount.toFixed(6)} ${data.toCurrency}`);
      setConvertOpen(false);
      setConvertForm({ fromCurrency: "USDC", toCurrency: "XLM", amount: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Recurring Payments ──────────────────────────────────────────────────────
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [recurringForm, setRecurringForm] = useState<{ currency: WalletCurrency; recipientAddress: string; recipientName: string; amount: string; frequency: "daily" | "weekly" | "monthly"; note: string }>({
    currency: "USDC", recipientAddress: "", recipientName: "", amount: "", frequency: "monthly", note: "",
  });
  const { data: recurringPaymentsData = [], refetch: refetchRecurring } = trpc.wallet.getRecurringPayments.useQuery();
  const createRecurringMut = trpc.wallet.createRecurringPayment.useMutation({
    onSuccess: () => { toast.success("Recurring payment created"); setRecurringOpen(false); setRecurringForm({ currency: "USDC", recipientAddress: "", recipientName: "", amount: "", frequency: "monthly", note: "" }); refetchRecurring(); },
    onError: (e) => toast.error(e.message),
  });
  const updateRecurringMut = trpc.wallet.updateRecurringPayment.useMutation({
    onSuccess: () => { toast.success("Recurring payment updated"); refetchRecurring(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteRecurringMut = trpc.wallet.deleteRecurringPayment.useMutation({
    onSuccess: () => { toast.success("Recurring payment deleted"); refetchRecurring(); },
    onError: (e) => toast.error(e.message),
  });

  const [topUpOpen, setTopUpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendForm, setSendForm] = useState<{ currency: WalletCurrency; amount: string; counterparty: string; note: string }>({ currency: "USDC", amount: "", counterparty: "", note: "" });
  const [crossCurrencyMode, setCrossCurrencyMode] = useState(false);
  const [sendToCurrency, setSendToCurrency] = useState<WalletCurrency>("XLM");
  const sendCrossMut = trpc.wallet.sendCrossCurrency.useMutation({
    onSuccess: (data) => {
      utils.wallet.balances.invalidate();
      utils.wallet.transactions.invalidate();
      utils.wallet.portfolioSummary.invalidate();
      toast.success(`Sent ${data.sentAmount} ${data.fromCurrency} → ${data.convertedAmount.toFixed(4)} ${data.toCurrency}`);
      setSendOpen(false);
      setSendForm({ currency: "USDC", amount: "", counterparty: "", note: "" });
      setCrossCurrencyMode(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const fxRateQuery = trpc.wallet.getFxRate.useQuery(
    { fromCurrency: sendForm.currency, toCurrency: sendToCurrency, amount: parseFloat(sendForm.amount) || undefined },
    { enabled: crossCurrencyMode && !!sendForm.currency && !!sendToCurrency && sendForm.currency !== sendToCurrency }
  );
  const [depositForm, setDepositForm] = useState<{ currency: WalletCurrency; amount: string }>({ currency: "USDC", amount: "" });
  const [swapForm, setSwapForm] = useState<{ fromCurrency: WalletCurrency; toCurrency: WalletCurrency; amount: string }>({ fromCurrency: "USDC", toCurrency: "XLM", amount: "" });
  const [topUpForm, setTopUpForm] = useState<{ currency: WalletCurrency; amount: string; bankName: string; accountNumber: string; accountName: string }>({ currency: "USDC", amount: "", bankName: "", accountNumber: "", accountName: "" });
  const [stripeAmount, setStripeAmount] = useState("");
  const stripeCheckoutMut = trpc.wallet.stripeCheckout.useMutation({
    onSuccess: (data) => {
      toast.info("Redirecting to Stripe Checkout…");
      window.open(data.checkoutUrl, "_blank");
      setTopUpOpen(false);
      setStripeAmount("");
    },
    onError: (e) => toast.error(e.message),
  });

  const copyAddress = () => { navigator.clipboard.writeText("GDEMO1234STELLAR56789TOURISMPAY"); setCopied(true); setTimeout(() => setCopied(false), 2000); toast.success("Wallet address copied"); };

  return (
    <div className="p-6 min-h-full">
       <PageHeader title="Digital Currency Wallet" subtitle="CBDC · USDC/Circle · Stellar Network" />

      {/* Real-time Balance Alert Banners */}
      {visibleBreaches.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-destructive flex items-center gap-1">
              <Bell className="w-3 h-3" />
              {visibleBreaches.some((b: any) => b.severity === 'critical') ? '🚨' : '⚠️'} Balance Alerts ({visibleBreaches.length})
            </p>
            <button onClick={dismissAllBreaches} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Dismiss all</button>
          </div>
          {visibleBreaches.map((breach: any) => (
            <div key={breach.id} className={`flex items-center justify-between rounded-lg px-4 py-2.5 border text-xs ${
              breach.severity === 'critical'
                ? 'bg-destructive/10 border-destructive/30 text-destructive'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              <div>
                <span className="font-bold">{breach.currency}</span>
                <span className="ml-2 text-muted-foreground">
                  Balance {breach.currentBalance.toFixed(4)} ≤ threshold {breach.threshold.toFixed(4)}
                </span>
              </div>
              <button onClick={() => dismissBreach(breach.id)} className="ml-4 opacity-60 hover:opacity-100 transition-opacity">
                <BellOff className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 glass-card p-5 animate-fade-in-up opacity-0" style={{ animationFillMode: "forwards" }}>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Portfolio Value</p>
          {loadingBal ? <div className="h-10 w-40 bg-white/5 rounded animate-pulse mb-1" /> : <p className="text-4xl font-mono font-bold text-foreground mb-1">${fmt(portfolio?.totalUsd ?? 0)} USD</p>}
          <p className="text-sm text-muted-foreground mb-5">{portfolio?.balanceCount ?? 0} currencies · {portfolio?.txCount ?? 0} transactions</p>
          <div className="flex flex-wrap gap-2">
            <Button className="flex-1 min-w-[80px] bg-primary text-primary-foreground h-9 text-xs" onClick={() => setSendOpen(true)}><ArrowUpRight className="w-4 h-4 mr-1" /> Send</Button>
            <Button variant="outline" className="flex-1 min-w-[80px] border-border bg-white/5 h-9 text-xs" onClick={copyAddress}>{copied ? <CheckCircle2 className="w-4 h-4 mr-1 text-primary" /> : <ArrowDownLeft className="w-4 h-4 mr-1" />}{copied ? "Copied!" : "Receive"}</Button>
            <Button variant="outline" className="flex-1 min-w-[80px] border-border bg-white/5 h-9 text-xs" onClick={() => setSwapOpen(true)}><RefreshCw className="w-4 h-4 mr-1" /> Swap</Button>
            <Button variant="outline" className="flex-1 min-w-[80px] border-border bg-white/5 h-9 text-xs" onClick={() => setDepositOpen(true)}><Plus className="w-4 h-4 mr-1" /> Deposit</Button>
            <Button variant="outline" className="flex-1 min-w-[80px] border-primary/40 bg-primary/10 text-primary h-9 text-xs hover:bg-primary/20" onClick={() => setTopUpOpen(true)}><TrendingUp className="w-4 h-4 mr-1" /> Top Up</Button>
            <Button variant="outline" className="flex-1 min-w-[80px] border-border bg-white/5 h-9 text-xs" onClick={() => setScheduleOpen(true)}><Calendar className="w-4 h-4 mr-1" /> Schedule</Button>
            <Button variant="outline" className="flex-1 min-w-[80px] border-border bg-white/5 h-9 text-xs" onClick={() => setConvertOpen(true)}><RefreshCw className="w-4 h-4 mr-1" /> Convert</Button>
          </div>
        </div>
        {/* Multi-Currency Balance Dashboard */}
        <div className="glass-card overflow-hidden animate-fade-in-up opacity-0" style={{ animationFillMode: "forwards" }}>
          <div className="p-3 border-b border-border flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Currency Balances</h3>
            <span className="text-[10px] text-muted-foreground">7-day trend</span>
          </div>
          <div className="divide-y divide-border/30">
            {loadingBal ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                <div className="w-7 h-7 rounded-lg bg-white/5" />
                <div className="flex-1 space-y-1"><div className="h-3 w-24 bg-white/5 rounded" /><div className="h-2 w-16 bg-white/5 rounded" /></div>
                <div className="w-16 h-8 bg-white/5 rounded" />
              </div>
            )) : (balanceSummaryData?.balances ?? balances.map(b => ({ ...b, sparkline: [b.balance, b.balance, b.balance, b.balance, b.balance, b.balance, b.balance], change7d: 0, change7dPct: 0, label: CURRENCY_ICONS[b.currency]?.label ?? b.currency, network: "" }))).map((b, i) => {
              const m = CURRENCY_ICONS[b.currency] ?? { Icon: DollarSign, color: "text-foreground", label: b.currency };
              const sparkData = (b.sparkline ?? []).map((v: number, idx: number) => ({ day: idx, value: v }));
              const isUp = (b.change7d ?? 0) >= 0;
              const isAlertBreached = (b as any).alertBreached === true;
              const alertThresholdVal = (b as any).alertThreshold as number | null;
              return (
                <div key={b.currency} className={`flex items-center gap-3 p-3 hover:bg-white/5 transition-colors animate-fade-in-up opacity-0 ${isAlertBreached ? "border-l-2 border-amber-500/60 bg-amber-500/5" : ""}`} style={{ animationDelay: `${i * 40}ms`, animationFillMode: "forwards" }}>
                  <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><m.Icon className={`w-3.5 h-3.5 ${isAlertBreached ? "text-amber-400" : m.color}`} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <p className="text-xs font-medium text-foreground truncate">{b.label ?? m.label}</p>
                      {isAlertBreached && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 rounded px-1 py-0.5 leading-none flex-shrink-0">
                          ⚠️ {alertThresholdVal != null ? `< ${fmt(alertThresholdVal)}` : "ALERT"}
                        </span>
                      )}
                    </div>
                    <p className={`text-sm font-mono font-bold ${isAlertBreached ? "text-amber-400" : m.color}`}>{fmt(b.balance)}</p>
                    {parseFloat(String(b.lockedBalance)) > 0 && <p className="text-[10px] text-muted-foreground font-mono">{fmt(b.lockedBalance)} locked</p>}
                  </div>
                  {/* 7-day sparkline */}
                  <div className="w-16 h-8 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                        <defs>
                          <linearGradient id={`spark-${b.currency}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isUp ? "oklch(0.7 0.2 145)" : "oklch(0.6 0.2 25)"} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={isUp ? "oklch(0.7 0.2 145)" : "oklch(0.6 0.2 25)"} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="value" stroke={isUp ? "oklch(0.7 0.2 145)" : "oklch(0.6 0.2 25)"} strokeWidth={1.5} fill={`url(#spark-${b.currency})`} dot={false} />
                        <RechartsTooltip
                          contentStyle={{ background: "oklch(0.15 0.02 250)", border: "1px solid oklch(0.25 0.02 250)", borderRadius: 6, fontSize: 10, padding: "2px 6px" }}
                          formatter={(v: number) => [fmt(v), b.currency]}
                          labelFormatter={(label: number) => `Day ${label + 1}`}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  {/* 7d change */}
                  <div className="text-right flex-shrink-0 w-14">
                    <p className={`text-[10px] font-mono font-semibold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                      {isUp ? "+" : ""}{(b.change7d ?? 0).toFixed(2)}
                    </p>
                    <p className={`text-[9px] ${isUp ? "text-emerald-400/70" : "text-red-400/70"}`}>
                      {isUp ? "+" : ""}{(b.change7dPct ?? 0).toFixed(1)}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <ExchangeRateIndicator />
      <div className="glass-card overflow-hidden animate-fade-in-up opacity-0" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Recent Transactions
            {txCountData?.count !== undefined && (
              <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">{txCountData.count} total</span>
            )}
          </h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportTxMut.mutate({})} disabled={exportTxMut.isPending}>
              {exportTxMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />} Export CSV
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setStmtOpen(true)}>
              <FileText className="w-3 h-3 mr-1" /> Statement
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => utils.wallet.transactions.invalidate()}><RefreshCw className="w-3 h-3" /></Button>
          </div>
        </div>
        {/* ─── Search / Filter Bar ─── */}
        <div className="px-4 py-2.5 border-b border-border/50 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              className="h-7 text-xs flex-1"
              placeholder="Search by note, reference, counterparty…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 text-xs px-2 ${showFilters ? "bg-primary/10 text-primary" : ""}`}
              onClick={() => setShowFilters((v) => !v)}
            >
              Filters {hasActiveFilters && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary inline-block" />}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-muted-foreground" onClick={() => { setSearchQuery(""); setSearchCurrency(""); setSearchType(""); setSearchDateFrom(""); setSearchDateTo(""); setSearchAmountMin(""); setSearchAmountMax(""); }}>Clear</Button>
            )}
          </div>
          {showFilters && (
            <div className="grid grid-cols-2 gap-2">
              <Select value={searchCurrency} onValueChange={setSearchCurrency}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All currencies" /></SelectTrigger>
                <SelectContent>{["USDC","CBDC-NG","XLM","NGN","KES","GHS","ZAR","USD"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={searchType} onValueChange={setSearchType}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>{["send","receive","swap","deposit","withdraw","fee"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="h-7 text-xs" type="date" placeholder="From date" value={searchDateFrom} onChange={(e) => setSearchDateFrom(e.target.value)} />
              <Input className="h-7 text-xs" type="date" placeholder="To date" value={searchDateTo} onChange={(e) => setSearchDateTo(e.target.value)} />
              <Input className="h-7 text-xs" type="number" placeholder="Min amount" value={searchAmountMin} onChange={(e) => setSearchAmountMin(e.target.value)} />
              <Input className="h-7 text-xs" type="number" placeholder="Max amount" value={searchAmountMax} onChange={(e) => setSearchAmountMax(e.target.value)} />
            </div>
          )}
          {hasActiveFilters && searchData && (
            <p className="text-[10px] text-muted-foreground">{searchData.total} result{searchData.total !== 1 ? "s" : ""} found</p>
          )}
        </div>
        <div className="divide-y divide-border/30">
          {(hasActiveFilters ? loadingSearch : loadingTx) ? Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3.5">
              <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
              <div className="flex-1 space-y-1"><div className="h-3 w-32 bg-white/5 rounded animate-pulse" /><div className="h-2 w-20 bg-white/5 rounded animate-pulse" /></div>
              <div className="h-4 w-16 bg-white/5 rounded animate-pulse" />
            </div>
          )) : txList.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No transactions yet. Use Send or Deposit to get started.</div>
          ) : txList.map((tx) => (
            <div key={tx.id} className="flex items-center gap-4 p-3.5 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => setSelectedTxId(tx.id)}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === "receive" || tx.type === "deposit" ? "bg-primary/10" : tx.type === "swap" ? "bg-[oklch(0.82_0.18_75)]/10" : "bg-destructive/10"}`}>
                {tx.type === "receive" || tx.type === "deposit" ? <ArrowDownLeft className="w-4 h-4 text-primary" /> : tx.type === "swap" ? <RefreshCw className="w-4 h-4 text-[oklch(0.82_0.18_75)]" /> : <ArrowUpRight className="w-4 h-4 text-destructive" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{tx.counterparty || (tx.type === "swap" ? `${tx.fromCurrency} \u2192 ${tx.toCurrency}` : tx.type)}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{tx.fromCurrency} · {ago(tx.createdAt)} · {tx.status}</p>
              </div>
              <p className={`text-sm font-mono font-bold ${tx.type === "receive" || tx.type === "deposit" ? "text-primary" : "text-foreground"}`}>
                {tx.type === "receive" || tx.type === "deposit" ? "+" : "-"}{fmt(tx.amount)} {tx.fromCurrency}
              </p>
            </div>
          ))}
          {/* Load more button */}
          {txData?.hasMore && (
            <div className="p-3 border-t border-border/30 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs w-full"
                disabled={fetchingTx}
                onClick={() => {
                  if (txData?.nextCursor) setTxCursor(txData.nextCursor);
                }}
              >
                {fetchingTx ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <TrendingUp className="w-3 h-3 mr-1" />}
                {fetchingTx ? "Loading..." : `Load more (${txList.length} of ${txCountData?.count ?? "?"} shown)`}
              </Button>
            </div>
          )}
        </div>
      </div>
      {/* Transaction Detail Slide-Over */}
      <Sheet open={!!selectedTxId} onOpenChange={(o) => { if (!o) setSelectedTxId(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              {txDetail?.type === "receive" || txDetail?.type === "deposit" ? <ArrowDownLeft className="w-4 h-4 text-primary" /> : txDetail?.type === "swap" ? <RefreshCw className="w-4 h-4 text-amber-400" /> : <ArrowUpRight className="w-4 h-4 text-destructive" />}
              Transaction Detail
            </SheetTitle>
          </SheetHeader>
          {loadingTxDetail ? (
            <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-white/5 rounded animate-pulse" />)}</div>
          ) : txDetail ? (
            <div className="space-y-4">
              <div className="glass-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Amount</span>
                  <span className={`text-lg font-mono font-bold ${ txDetail.type === "receive" || txDetail.type === "deposit" ? "text-primary" : "text-foreground" }`}>
                    {txDetail.type === "receive" || txDetail.type === "deposit" ? "+" : "-"}{fmt(txDetail.amount)} {txDetail.fromCurrency}
                  </span>
                </div>
                {txDetail.toAmount && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Received</span>
                    <span className="text-sm font-mono text-primary">+{fmt(txDetail.toAmount)} {txDetail.toCurrency}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Fee</span>
                  <span className="text-sm font-mono text-muted-foreground">{fmt(txDetail.fee)} {txDetail.fromCurrency}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <Badge variant={txDetail.status === "completed" ? "default" : txDetail.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">{txDetail.status}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Type</span>
                  <span className="text-xs font-medium capitalize">{txDetail.type}</span>
                </div>
              </div>
              {(txDetail.counterparty || txDetail.counterpartyAddress) && (
                <div className="glass-card p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Counterparty</p>
                  {txDetail.counterparty && <p className="text-sm font-medium">{txDetail.counterparty}</p>}
                  {txDetail.counterpartyAddress && <p className="text-[10px] font-mono text-muted-foreground break-all">{txDetail.counterpartyAddress}</p>}
                </div>
              )}
              {txDetail.txHash && (
                <div className="glass-card p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transaction Hash</p>
                  <p className="text-[10px] font-mono text-muted-foreground break-all">{txDetail.txHash}</p>
                </div>
              )}
              {txDetail.note && (
                <div className="glass-card p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Note</p>
                  <p className="text-sm text-muted-foreground">{txDetail.note}</p>
                </div>
              )}
              <div className="glass-card p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timestamps</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Created</span>
                  <span className="text-xs font-mono">{new Date(txDetail.createdAt * 1000).toLocaleString()}</span>
                </div>
                {txDetail.completedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Completed</span>
                    <span className="text-xs font-mono">{new Date(txDetail.completedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
              {txDetail.biometricApproved && (
                <div className="glass-card p-4 border border-primary/20 space-y-2">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1"><Fingerprint className="w-3 h-3" /> Biometric Approval</p>
                  <p className="text-xs text-muted-foreground">This high-value transaction was verified with biometric authentication.</p>
                  {txDetail.biometricApprovedAt && (
                    <p className="text-[10px] font-mono text-muted-foreground">Approved at: {new Date(Number(txDetail.biometricApprovedAt) * 1000).toLocaleString()}</p>
                  )}
                </div>
              )}
              <div className="pt-2 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleDownloadReceipt}
                  disabled={!receiptData?.receipt}
                >
                  <Download className="w-3 h-3" /> Download Receipt
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground font-mono text-center pt-2">TX ID: {txDetail.id}</div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Transaction not found.</p>
          )}
        </SheetContent>
      </Sheet>

      {/* Send Dialog */}
      <Dialog open={sendOpen} onOpenChange={(open) => { setSendOpen(open); if (!open) { setCrossCurrencyMode(false); setBiometricStep(false); setPendingBiometricToken(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowUpRight className="w-4 h-4" /> Send Funds</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Cross-currency toggle */}
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
              <span className="text-xs font-medium text-foreground">Cross-currency transfer</span>
              <button
                type="button"
                onClick={() => setCrossCurrencyMode((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                  crossCurrencyMode ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                  crossCurrencyMode ? "translate-x-4" : "translate-x-0"
                }`} />
              </button>
            </div>
            <div className="space-y-1"><Label>From Currency</Label><Select value={sendForm.currency} onValueChange={(v) => setSendForm((f) => ({ ...f, currency: v as WalletCurrency }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            {crossCurrencyMode && (
              <div className="space-y-1">
                <Label>Recipient Receives (Currency)</Label>
                <Select value={sendToCurrency} onValueChange={(v) => setSendToCurrency(v as WalletCurrency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SUPPORTED_CURRENCIES.filter((c) => c !== sendForm.currency).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1"><Label>Amount</Label><Input type="number" min="0" step="0.000001" placeholder="0.00" value={sendForm.amount} onChange={(e) => setSendForm((f) => ({ ...f, amount: e.target.value }))} /></div>
            {/* FX Rate Preview */}
            {crossCurrencyMode && sendForm.currency !== sendToCurrency && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5 text-xs space-y-1">
                {fxRateQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Loading rate...</div>
                ) : fxRateQuery.data ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rate</span>
                      <span className="font-mono font-medium">1 {sendForm.currency} = {fxRateQuery.data.effectiveRate.toFixed(6)} {sendToCurrency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Spread</span>
                      <span className="text-amber-400">{fxRateQuery.data.spreadPct.toFixed(1)}%</span>
                    </div>
                    {fxRateQuery.data.effectiveAmount !== undefined && (
                      <div className="flex justify-between border-t border-primary/20 pt-1 mt-1">
                        <span className="font-medium">Recipient gets</span>
                        <span className="font-mono font-bold text-primary">{fxRateQuery.data.effectiveAmount.toFixed(4)} {sendToCurrency}</span>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}
            <div className="space-y-1"><Label>Recipient</Label><Input placeholder="Address or name" value={sendForm.counterparty} onChange={(e) => setSendForm((f) => ({ ...f, counterparty: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Note (optional)</Label><Input placeholder="Payment for..." value={sendForm.note} onChange={(e) => setSendForm((f) => ({ ...f, note: e.target.value }))} /></div>
          </div>
          {/* High-value biometric confirmation step */}
          {biometricStep && (
            <div className="mt-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Biometric Re-Authentication Required</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                This transaction exceeds ${HIGH_VALUE_TX_THRESHOLD_USD} USD. On your registered mobile device, confirm your identity using Face ID or Touch ID, then click <strong>Confirm &amp; Send</strong> below.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { setBiometricStep(false); setPendingBiometricToken(null); }}>Cancel</Button>
                <Button size="sm" className="flex-1" onClick={handleBiometricConfirm} disabled={sendMut.isPending}>
                  {sendMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Fingerprint className="w-3.5 h-3.5 mr-1" />}
                  Confirm &amp; Send
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSendOpen(false); setBiometricStep(false); setPendingBiometricToken(null); setCrossCurrencyMode(false); }}>Cancel</Button>
            {!biometricStep && (
              crossCurrencyMode ? (
                <Button
                  disabled={sendCrossMut.isPending || !sendForm.amount || !sendForm.counterparty || sendForm.currency === sendToCurrency}
                  onClick={() => {
                    const amount = parseFloat(sendForm.amount);
                    if (!amount || !sendForm.counterparty) return;
                    sendCrossMut.mutate({
                      fromCurrency: sendForm.currency,
                      toCurrency: sendToCurrency,
                      amount,
                      counterparty: sendForm.counterparty,
                      note: sendForm.note || undefined,
                    });
                  }}
                >
                  {sendCrossMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  Send Cross-Currency
                </Button>
              ) : (
                <Button
                  disabled={sendMut.isPending || requestTokenMut.isPending || !sendForm.amount || !sendForm.counterparty}
                  onClick={handleSendSubmit}
                >
                  {(sendMut.isPending || requestTokenMut.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  {parseFloat(sendForm.amount || "0") * (APPROX_USD_RATES_FE[sendForm.currency] ?? 1) >= HIGH_VALUE_TX_THRESHOLD_USD
                    ? <><Fingerprint className="w-4 h-4 mr-1" /> Verify &amp; Send</>
                    : "Send"
                  }
                </Button>
              )
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deposit Dialog */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4" /> Deposit Funds (Simulation)</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-400">Simulated deposit for demo. Connect a real payment gateway in production.</div>
            <div className="space-y-1"><Label>Currency</Label><Select value={depositForm.currency} onValueChange={(v) => setDepositForm((f) => ({ ...f, currency: v as WalletCurrency }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Amount</Label><Input type="number" min="0" step="0.000001" placeholder="0.00" value={depositForm.amount} onChange={(e) => setDepositForm((f) => ({ ...f, amount: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositOpen(false)}>Cancel</Button>
            <Button disabled={depositMut.isPending || !depositForm.amount} onClick={() => depositMut.mutate({ currency: depositForm.currency, amount: parseFloat(depositForm.amount) })}>
              {depositMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Simulate Deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Swap Dialog */}
      <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Swap Currencies</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label>From</Label><Select value={swapForm.fromCurrency} onValueChange={(v) => setSwapForm((f) => ({ ...f, fromCurrency: v as WalletCurrency }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>To</Label><Select value={swapForm.toCurrency} onValueChange={(v) => setSwapForm((f) => ({ ...f, toCurrency: v as WalletCurrency }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SUPPORTED_CURRENCIES.filter((c) => c !== swapForm.fromCurrency).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Amount ({swapForm.fromCurrency})</Label><Input type="number" min="0" step="0.000001" placeholder="0.00" value={swapForm.amount} onChange={(e) => setSwapForm((f) => ({ ...f, amount: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSwapOpen(false)}>Cancel</Button>
            <Button disabled={swapMut.isPending || !swapForm.amount || swapForm.fromCurrency === swapForm.toCurrency} onClick={() => swapMut.mutate({ fromCurrency: swapForm.fromCurrency, toCurrency: swapForm.toCurrency, amount: parseFloat(swapForm.amount) })}>
              {swapMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Swap
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Balance Alerts Panel */}
      <div className="glass-card overflow-hidden animate-fade-in-up opacity-0 mt-4" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            <Bell className="w-4 h-4 text-primary" /> Balance Alerts
          </h3>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAlertOpen(true)}>
            <Plus className="w-3 h-3 mr-1" /> Add Alert
          </Button>
        </div>
        <div className="divide-y divide-border/30">
          {balanceAlerts.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No balance alerts set. Add one to get notified when a currency drops below a threshold.
            </div>
          ) : balanceAlerts.map((alert) => (
            <div key={alert.id} className="flex items-center gap-3 p-3.5 hover:bg-white/3 transition-colors">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${alert.isActive ? "bg-primary/10" : "bg-white/5"}`}>
                {alert.isActive ? <Bell className="w-4 h-4 text-primary" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{alert.currency}</p>
                {editingAlertId === alert.id ? (
                  <div className="flex items-center gap-1 mt-1">
                    <Input
                      type="number"
                      className="h-6 text-[10px] w-24 px-1.5 bg-white/5 border-border"
                      value={editingAlertValue}
                      onChange={(e) => setEditingAlertValue(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editingAlertValue) updateAlertMut.mutate({ id: alert.id, threshold: parseFloat(editingAlertValue) });
                        if (e.key === "Escape") { setEditingAlertId(null); setEditingAlertValue(""); }
                      }}
                    />
                    <button
                      className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40"
                      disabled={!editingAlertValue || updateAlertMut.isPending}
                      onClick={() => updateAlertMut.mutate({ id: alert.id, threshold: parseFloat(editingAlertValue) })}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => { setEditingAlertId(null); setEditingAlertValue(""); }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground">Alert below <span className="font-mono text-foreground">{alert.threshold.toLocaleString()}</span></p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {editingAlertId !== alert.id && (
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0"
                    onClick={() => { setEditingAlertId(alert.id); setEditingAlertValue(String(alert.threshold)); }}
                    title="Edit threshold"
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                )}
                <Button
                  variant="ghost" size="sm" className="h-7 w-7 p-0"
                  onClick={() => toggleAlertMut.mutate({ id: alert.id })}
                  disabled={toggleAlertMut.isPending}
                  title={alert.isActive ? "Pause alert" : "Enable alert"}
                >
                  {alert.isActive ? <BellOff className="w-3.5 h-3.5 text-muted-foreground" /> : <Bell className="w-3.5 h-3.5 text-primary" />}
                </Button>
                <Button
                  variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => deleteAlertMut.mutate({ id: alert.id })}
                  disabled={deleteAlertMut.isPending}
                  title="Delete alert"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Spending Limits Panel */}
      <div className="glass-card overflow-hidden animate-fade-in-up opacity-0 mt-4" style={{ animationDelay: "350ms", animationFillMode: "forwards" }}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            <ShieldAlert className="w-4 h-4 text-primary" /> Spending Limits
          </h3>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setLimitOpen(true)}>
            <Plus className="w-3 h-3 mr-1" /> Set Limit
          </Button>
        </div>
        <div className="divide-y divide-border/30">
          {(spendingLimits as any[]).length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No spending limits set. Add one to block transactions that exceed your daily or monthly budget.
            </div>
          ) : (spendingLimits as any[]).map((limit) => {
            const limitAmt = parseFloat(limit.limitAmount);
            const spent = limit.period === "daily" ? (limit.spentToday ?? 0) : (limit.spentThisMonth ?? 0);
            const pct = limitAmt > 0 ? Math.min((spent / limitAmt) * 100, 100) : 0;
            const barColor = pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-amber-500" : "bg-primary";
            const textColor = pct >= 90 ? "text-destructive" : pct >= 70 ? "text-amber-500" : "text-primary";
            return (
              <div key={limit.id} className="p-3.5 hover:bg-white/3 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${limit.isActive ? "bg-primary/10" : "bg-white/5"}`}>
                    <ShieldAlert className={`w-4 h-4 ${limit.isActive ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-foreground">{limit.currency} — {limit.period === "daily" ? "Daily" : "Monthly"}</p>
                      <span className={`text-[10px] font-mono font-semibold ${textColor}`}>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[10px] text-muted-foreground"><span className="font-mono text-foreground">{spent.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span> / <span className="font-mono">{limitAmt.toLocaleString()}</span> {limit.currency}</p>
                      {!limit.isActive && <span className="text-[9px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">Paused</span>}
                    </div>
                    {limit.nextResetAt && limit.isActive && (
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        Resets {new Date(limit.nextResetAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost" size="sm" className="h-7 w-7 p-0"
                      onClick={() => toggleLimitMut.mutate({ id: limit.id })}
                      disabled={toggleLimitMut.isPending}
                      title={limit.isActive ? "Pause limit" : "Enable limit"}
                    >
                      {limit.isActive ? <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground" /> : <ShieldAlert className="w-3.5 h-3.5 text-primary" />}
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => deleteLimitMut.mutate({ id: limit.id })}
                      disabled={deleteLimitMut.isPending}
                      title="Remove limit"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scheduled Payments Panel */}
      <div className="glass-card overflow-hidden animate-fade-in-up opacity-0 mt-4" style={{ animationDelay: "400ms", animationFillMode: "forwards" }}>
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Scheduled Payments</span>
            <span className="text-xs text-muted-foreground">({(scheduledPaymentsData?.payments ?? []).length})</span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setScheduleOpen(true)}><Plus className="w-3 h-3 mr-1" /> New</Button>
        </div>
        {(scheduledPaymentsData?.payments ?? []).length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">No scheduled payments. Click New to create one.</div>
        ) : (
          <div className="divide-y divide-border">
            {(scheduledPaymentsData?.payments ?? []).map((p: any) => (
              <div key={p.id} className="p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{p.counterpartyName || p.toAddress}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      p.status === 'active' ? 'bg-primary/15 text-primary' :
                      p.status === 'completed' ? 'bg-green-500/15 text-green-400' :
                      p.status === 'failed' ? 'bg-red-500/15 text-red-400' :
                      p.status === 'cancelled' ? 'bg-muted text-muted-foreground' :
                      'bg-yellow-500/15 text-yellow-400'
                    }`}>{p.status}</span>
                    <span className="text-xs bg-muted/50 text-muted-foreground px-1.5 py-0.5 rounded">{p.recurrence}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {p.amount} {p.currency} · Next: {p.nextRunAt ? new Date(p.nextRunAt).toLocaleString() : '—'}
                    {p.note ? ` · ${p.note}` : ''}
                  </div>
                  {p.failureReason && <div className="text-xs text-red-400 mt-0.5">{p.failureReason}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.status === 'active' && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10" onClick={() => pauseScheduledMut.mutate({ id: p.id })} disabled={pauseScheduledMut.isPending} title="Pause">
                      <Pause className="w-3 h-3" />
                    </Button>
                  )}
                  {p.status === 'paused' && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-green-500 hover:text-green-400 hover:bg-green-500/10" onClick={() => resumeScheduledMut.mutate({ id: p.id })} disabled={resumeScheduledMut.isPending} title="Resume">
                      <Play className="w-3 h-3" />
                    </Button>
                  )}
                  {(p.status === 'active' || p.status === 'paused') && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => cancelScheduledMut.mutate({ id: p.id })} disabled={cancelScheduledMut.isPending} title="Cancel">
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recurring Payments Panel */}
      <div className="glass-card overflow-hidden animate-fade-in-up opacity-0 mt-4" style={{ animationDelay: "450ms", animationFillMode: "forwards" }}>
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Recurring Payments</span>
            <span className="text-xs text-muted-foreground">({(recurringPaymentsData as any[]).length})</span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRecurringOpen(true)}><Plus className="w-3 h-3 mr-1" /> New</Button>
        </div>
        {(recurringPaymentsData as any[]).length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">No recurring payments. Click New to set up automatic payments.</div>
        ) : (
          <div className="divide-y divide-border">
            {(recurringPaymentsData as any[]).map((p: any) => (
              <div key={p.id} className="p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{p.recipientName || p.recipientAddress}</span>
                    <Badge variant={p.status === 'active' ? 'default' : p.status === 'paused' ? 'secondary' : 'destructive'} className="text-xs h-4">{p.status}</Badge>
                    <Badge variant="outline" className="text-xs h-4 capitalize">{p.frequency}</Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{p.amount.toFixed(4)} {p.currency}</span>
                    <span>• Next: {p.nextRunAt ? new Date(p.nextRunAt).toLocaleDateString() : '—'}</span>
                    {p.runCount > 0 && <span>• Ran {p.runCount}x</span>}
                    {p.failureReason && <span className="text-red-400 truncate max-w-[120px]" title={p.failureReason}>⚠️ {p.failureReason}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {p.status === 'active' && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updateRecurringMut.mutate({ id: p.id, status: 'paused' })} disabled={updateRecurringMut.isPending} title="Pause">
                      <Pause className="w-3 h-3" />
                    </Button>
                  )}
                  {p.status === 'paused' && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-green-400 hover:text-green-300" onClick={() => updateRecurringMut.mutate({ id: p.id, status: 'active' })} disabled={updateRecurringMut.isPending} title="Resume">
                      <Play className="w-3 h-3" />
                    </Button>
                  )}
                  {p.status !== 'cancelled' && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => deleteRecurringMut.mutate({ id: p.id })} disabled={deleteRecurringMut.isPending} title="Delete">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spending Analytics Panel */}
      <SpendingAnalyticsPanel />

      {/* Set Spending Limit Dialog */}
      <Dialog open={limitOpen} onOpenChange={setLimitOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-primary" /> Set Spending Limit</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg text-xs text-primary">
              Transactions that would exceed this limit will be blocked with a clear error message.
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={limitCurrency} onValueChange={setLimitCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["USDC", "CBDC-NG", "XLM", "KES", "ZAR", "NGN", "GHS", "USD"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Period</Label>
              <Select value={limitPeriod} onValueChange={(v) => setLimitPeriod(v as "daily" | "monthly")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Maximum Amount</Label>
              <Input
                type="number" min="0" step="0.01"
                placeholder="e.g. 5000.00"
                value={limitAmount}
                onChange={(e) => setLimitAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLimitOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const amt = parseFloat(limitAmount);
                if (!amt || amt <= 0) { toast.error("Enter a valid limit amount"); return; }
                setLimitMut.mutate({ currency: limitCurrency as any, period: limitPeriod, limitAmount: amt });
              }}
              disabled={setLimitMut.isPending}
            >
              {setLimitMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Set Limit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Balance Alert Dialog */}
      <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> Add Balance Alert</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg text-xs text-primary">
              You will receive an in-app notification when your balance drops at or below the threshold after a send or swap.
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={alertCurrency} onValueChange={setAlertCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Alert Threshold</Label>
              <Input
                type="number" min="0" step="0.01"
                placeholder="e.g. 100.00"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">Notify me when {alertCurrency} balance drops below this amount</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlertOpen(false)}>Cancel</Button>
            <Button
              disabled={setAlertMut.isPending || !alertThreshold || parseFloat(alertThreshold) <= 0}
              onClick={() => setAlertMut.mutate({ currency: alertCurrency, threshold: parseFloat(alertThreshold) })}
            >
              {setAlertMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Save Alert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top Up Dialog */}
      <Dialog open={topUpOpen} onOpenChange={setTopUpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Top Up Wallet</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Stripe Card Top-Up */}
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                <CreditCard className="w-4 h-4" /> Instant Card Top-Up via Stripe
              </div>
              <div className="flex gap-2">
                <Input
                  type="number" min="1" max="10000" step="1" placeholder="Amount in USD"
                  value={stripeAmount}
                  onChange={(e) => setStripeAmount(e.target.value)}
                  className="flex-1 h-8 text-sm"
                />
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={stripeCheckoutMut.isPending || !stripeAmount || parseFloat(stripeAmount) < 1}
                  onClick={() => stripeCheckoutMut.mutate({ amountUsd: parseFloat(stripeAmount), currency: topUpForm.currency })}
                >
                  {stripeCheckoutMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  <span className="ml-1">Pay</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Test card: 4242 4242 4242 4242 · Any future date · Any CVC</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="flex-1 border-t border-border" /> or bank transfer <span className="flex-1 border-t border-border" /></div>
            <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg text-xs text-primary">
              Submit a bank transfer request to top up your wallet. Funds will be credited to your wallet address after admin approval.
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={topUpForm.currency} onValueChange={(v) => setTopUpForm((f) => ({ ...f, currency: v as WalletCurrency }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={topUpForm.amount} onChange={(e) => setTopUpForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Bank Name</Label>
              <Input placeholder="e.g. Access Bank" value={topUpForm.bankName} onChange={(e) => setTopUpForm((f) => ({ ...f, bankName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Account Number</Label>
              <Input placeholder="10-digit account number" value={topUpForm.accountNumber} onChange={(e) => setTopUpForm((f) => ({ ...f, accountNumber: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Account Name</Label>
              <Input placeholder="Name on account" value={topUpForm.accountName} onChange={(e) => setTopUpForm((f) => ({ ...f, accountName: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopUpOpen(false)}>Cancel</Button>
            <Button
              disabled={topUpMut.isPending || !topUpForm.amount || !topUpForm.bankName || !topUpForm.accountNumber || !topUpForm.accountName}
              onClick={() => topUpMut.mutate({ currency: topUpForm.currency, amount: parseFloat(topUpForm.amount), bankName: topUpForm.bankName, accountNumber: topUpForm.accountNumber, accountName: topUpForm.accountName })}
            >
              {topUpMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Submit Top-Up Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Statement Download Dialog */}
      <Dialog open={stmtOpen} onOpenChange={setStmtOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Download Statement
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg text-xs text-primary">
              Download a date-ranged statement as CSV (spreadsheet) or Markdown (formatted report).
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={stmtDateFrom} onChange={(e) => setStmtDateFrom(e.target.value)} className="text-xs h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={stmtDateTo} onChange={(e) => setStmtDateTo(e.target.value)} className="text-xs h-8" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Currency (optional)</Label>
              <Select value={stmtCurrency} onValueChange={setStmtCurrency}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All currencies" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All currencies</SelectItem>
                  {SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" size="sm" onClick={() => setStmtOpen(false)}>Cancel</Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exportStmtMdMut.isPending || !stmtDateFrom || !stmtDateTo}
              onClick={() => handleStmtDownload("md")}
            >
              {exportStmtMdMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <FileText className="w-3 h-3 mr-1" />}
              Markdown
            </Button>
            <Button
              size="sm"
              disabled={exportStmtCsvMut.isPending || !stmtDateFrom || !stmtDateTo}
              onClick={() => handleStmtDownload("csv")}
            >
              {exportStmtCsvMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
              CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Payment Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Schedule Payment</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Amount</Label>
                <Input className="h-8 text-sm" type="number" placeholder="0.00" value={scheduleForm.amount} onChange={e => setScheduleForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Currency</Label>
                <Select value={scheduleForm.currency} onValueChange={v => setScheduleForm(f => ({ ...f, currency: v as WalletCurrency }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{(["USDC","CBDC-NG","CBDC-KE","CBDC-GH","CBDC-ZA","XLM","NGN","KES","GHS","ZAR","USD"] as WalletCurrency[]).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Recipient Address / ID</Label>
              <Input className="h-8 text-sm" placeholder="Wallet address or user ID" value={scheduleForm.toAddress} onChange={e => setScheduleForm(f => ({ ...f, toAddress: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Recipient Name (optional)</Label>
              <Input className="h-8 text-sm" placeholder="Display name" value={scheduleForm.counterpartyName} onChange={e => setScheduleForm(f => ({ ...f, counterpartyName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Recurrence</Label>
                <Select value={scheduleForm.recurrence} onValueChange={v => setScheduleForm(f => ({ ...f, recurrence: v as any }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">One-time</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Scheduled Date &amp; Time</Label>
                <Input className="h-8 text-sm" type="datetime-local" value={scheduleForm.scheduledAt} onChange={e => setScheduleForm(f => ({ ...f, scheduledAt: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Note (optional)</Label>
              <Input className="h-8 text-sm" placeholder="Payment note" value={scheduleForm.note} onChange={e => setScheduleForm(f => ({ ...f, note: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Reference (optional)</Label>
              <Input className="h-8 text-sm" placeholder="Invoice or reference number" value={scheduleForm.reference} onChange={e => setScheduleForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={schedulePaymentMut.isPending || !scheduleForm.toAddress || !scheduleForm.amount || !scheduleForm.scheduledAt}
              onClick={() => {
                const scheduledAt = new Date(scheduleForm.scheduledAt).getTime();
                if (isNaN(scheduledAt) || scheduledAt <= Date.now()) { toast.error("Scheduled time must be in the future"); return; }
                schedulePaymentMut.mutate({ toAddress: scheduleForm.toAddress, counterpartyName: scheduleForm.counterpartyName || undefined, amount: parseFloat(scheduleForm.amount), currency: scheduleForm.currency, recurrence: scheduleForm.recurrence, scheduledAt, note: scheduleForm.note || undefined, reference: scheduleForm.reference || undefined });
              }}
            >{schedulePaymentMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Calendar className="w-3 h-3 mr-1" />}Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Convert Currency Dialog ─────────────────────────────────────────── */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Convert Currency</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Select value={convertForm.fromCurrency} onValueChange={(v) => setConvertForm((f) => ({ ...f, fromCurrency: v as WalletCurrency }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{(["USDC","CBDC-NG","CBDC-KE","CBDC-GH","CBDC-ZA","XLM","NGN","KES","GHS","ZAR","USD"] as WalletCurrency[]).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Select value={convertForm.toCurrency} onValueChange={(v) => setConvertForm((f) => ({ ...f, toCurrency: v as WalletCurrency }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{(["USDC","CBDC-NG","CBDC-KE","CBDC-GH","CBDC-ZA","XLM","NGN","KES","GHS","ZAR","USD"] as WalletCurrency[]).filter((c) => c !== convertForm.fromCurrency).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount ({convertForm.fromCurrency})</Label>
              <Input className="h-8 text-sm" type="number" min="0" step="0.000001" placeholder="0.00" value={convertForm.amount} onChange={(e) => setConvertForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            {convertForm.amount && exchangeRatesData?.rates && (() => {
              const rate = exchangeRatesData.rates[convertForm.toCurrency];
              const est = rate ? (parseFloat(convertForm.amount) * rate).toFixed(6) : null;
              return est ? (
                <div className="rounded-md bg-muted/40 border border-border p-3 text-sm">
                  <p className="text-muted-foreground text-xs mb-1">Estimated output ({exchangeRatesData.source === "live" ? "live rate" : "indicative rate"})</p>
                  <p className="font-mono font-semibold">{est} <span className="text-muted-foreground font-normal">{convertForm.toCurrency}</span></p>
                  <p className="text-xs text-muted-foreground mt-1">Rate: 1 {convertForm.fromCurrency} = {rate.toFixed(8)} {convertForm.toCurrency}</p>
                </div>
              ) : null;
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={convertMut.isPending || !convertForm.amount || convertForm.fromCurrency === convertForm.toCurrency}
              onClick={() => convertMut.mutate({ fromCurrency: convertForm.fromCurrency, toCurrency: convertForm.toCurrency, fromAmount: parseFloat(convertForm.amount) })}>
              {convertMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Create Recurring Payment Dialog */}
      <Dialog open={recurringOpen} onOpenChange={setRecurringOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><RefreshCw className="w-4 h-4 text-primary" /> New Recurring Payment</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={recurringForm.currency} onValueChange={(v) => setRecurringForm(f => ({ ...f, currency: v as WalletCurrency }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["USDC", "CBDC-NG", "XLM", "KES", "ZAR", "NGN", "GHS", "USD"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Recipient Address</Label>
              <Input placeholder="Wallet address or account number" value={recurringForm.recipientAddress} onChange={(e) => setRecurringForm(f => ({ ...f, recipientAddress: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Recipient Name (optional)</Label>
              <Input placeholder="e.g. Landlord, Subscription" value={recurringForm.recipientName} onChange={(e) => setRecurringForm(f => ({ ...f, recipientName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" min="0" step="any" placeholder="0.00" value={recurringForm.amount} onChange={(e) => setRecurringForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Frequency</Label>
              <Select value={recurringForm.frequency} onValueChange={(v) => setRecurringForm(f => ({ ...f, frequency: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Input placeholder="e.g. Rent, Netflix" value={recurringForm.note} onChange={(e) => setRecurringForm(f => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRecurringOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={createRecurringMut.isPending || !recurringForm.recipientAddress || !recurringForm.amount}
              onClick={() => createRecurringMut.mutate({
                currency: recurringForm.currency,
                recipientAddress: recurringForm.recipientAddress,
                recipientName: recurringForm.recipientName || undefined,
                amount: parseFloat(recurringForm.amount),
                frequency: recurringForm.frequency,
                note: recurringForm.note || undefined,
              })}>
              {createRecurringMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
