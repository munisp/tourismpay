import { TrendingUp, DollarSign, Shield, Clock, Send, Loader2, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-400",
  under_review: "text-blue-400",
  approved: "text-green-400",
  rejected: "text-red-400",
  active: "text-green-400",
  completed: "text-muted-foreground",
  quoted: "text-[oklch(0.82_0.18_75)]",
};

export default function EmbeddedFinance() {
  const [activeTab, setActiveTab] = useState<"payout" | "loan" | "insurance">("payout");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutBank, setPayoutBank] = useState("");
  const [payoutAccount, setPayoutAccount] = useState("");
  const [payoutName, setPayoutName] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [loanTerm, setLoanTerm] = useState("12");
  const [loanPurpose, setLoanPurpose] = useState("");
  const [coverageType, setCoverageType] = useState<"travel" | "health" | "business" | "equipment">("travel");
  const [coverageAmount, setCoverageAmount] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [destination, setDestination] = useState("");
  const [quoteResult, setQuoteResult] = useState<{
    quoteId: string;
    premium: number;
    coverageAmount: number;
    validUntil: number;
  } | null>(null);

  // Filter + pagination state
  const [filterType, setFilterType] = useState<"payout" | "loan" | "insurance" | "all">("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(0);

  const listInput = useMemo(() => ({
    limit: PAGE_SIZE,
    offset: currentPage * PAGE_SIZE,
    type: filterType !== "all" ? filterType as "payout" | "loan" | "insurance" : undefined,
    dateFrom: filterDateFrom ? new Date(filterDateFrom).getTime() : undefined,
    dateTo: filterDateTo ? new Date(filterDateTo + "T23:59:59").getTime() : undefined,
  }), [filterType, filterDateFrom, filterDateTo, currentPage]);

  const { data: listData, refetch } = trpc.embeddedFinance.list.useQuery(listInput);
  const totalPages = Math.max(1, Math.ceil((listData?.total ?? 0) / PAGE_SIZE));

  const hasFilters = filterType !== "all" || filterDateFrom !== "" || filterDateTo !== "";
  const clearFilters = () => { setFilterType("all"); setFilterDateFrom(""); setFilterDateTo(""); setCurrentPage(0); };

  const payoutMutation = trpc.embeddedFinance.requestPayout.useMutation({
    onSuccess: (data) => {
      toast.success("Payout request submitted! ID: " + data.id.slice(0, 8) + "...");
      setPayoutAmount(""); setPayoutBank(""); setPayoutAccount(""); setPayoutName("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const loanMutation = trpc.embeddedFinance.applyForLoan.useMutation({
    onSuccess: (data) => {
      toast.success("Loan application submitted! Monthly payment: $" + data.monthlyPayment);
      setLoanAmount(""); setLoanPurpose("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const insuranceMutation = trpc.embeddedFinance.getInsuranceQuote.useMutation({
    onSuccess: (data) => {
      setQuoteResult(data);
      toast.success("Quote ready: $" + data.premium + " premium");
    },
    onError: (err) => toast.error(err.message),
  });

  const purchaseMutation = trpc.embeddedFinance.purchaseInsurance.useMutation({
    onSuccess: () => {
      toast.success("Insurance policy activated!");
      setQuoteResult(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const items = listData?.items ?? [];
  // For stats, always use unfiltered counts from the full list
  const allPayouts = items.filter((i) => i.type === "payout");
  const allLoans = items.filter((i) => i.type === "loan");
  const allInsurances = items.filter((i) => i.type === "insurance");
  const totalDisbursed = allPayouts.filter((p) => p.status === "completed").reduce((s, p) => s + p.amount, 0);
  const activeLoans = allLoans.filter((l) => l.status === "active" || l.status === "approved").length;
  const activePolicies = allInsurances.filter((i) => i.status === "active").length;

  // History panel shows filtered results, further filtered by active tab (unless type filter overrides)
  const currentItems = filterType !== "all"
    ? items
    : activeTab === "payout" ? allPayouts : activeTab === "loan" ? allLoans : allInsurances;

  return (
    <div className="p-6 min-h-full">
      <PageHeader title="Embedded Finance" subtitle="Instant payouts · Working capital loans · Micro-insurance" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 stagger-children">
        <StatCard label="Total Disbursed" value={"$" + totalDisbursed.toLocaleString()} color="green" icon={DollarSign} animationDelay={0} />
        <StatCard label="Active Loans" value={String(activeLoans)} color="blue" icon={TrendingUp} animationDelay={50} />
        <StatCard label="Active Policies" value={String(activePolicies)} color="amber" icon={Shield} animationDelay={100} />
        <StatCard label="Total Requests" value={String(listData?.total ?? 0)} color="green" icon={Clock} animationDelay={150} />
      </div>

      <div className="flex gap-2 mb-4">
        {(["payout", "loan", "insurance"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={"px-4 py-1.5 rounded-full text-xs font-medium transition-colors " + (activeTab === tab ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground hover:bg-white/10")}
          >
            {tab === "payout" ? "Payouts" : tab === "loan" ? "Loans" : "Insurance"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-5 animate-fade-in-up opacity-0" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
          {activeTab === "payout" && (
            <>
              <h3 className="text-sm font-semibold text-foreground mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Request Payout</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Amount (USD)</label>
                  <Input className="h-8 text-xs" placeholder="e.g. 1500.00" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} type="number" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Bank Name</label>
                  <Input className="h-8 text-xs" placeholder="e.g. First Bank Nigeria" value={payoutBank} onChange={(e) => setPayoutBank(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Account Number</label>
                  <Input className="h-8 text-xs" placeholder="e.g. 0123456789" value={payoutAccount} onChange={(e) => setPayoutAccount(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Account Name</label>
                  <Input className="h-8 text-xs" placeholder="e.g. John Doe" value={payoutName} onChange={(e) => setPayoutName(e.target.value)} />
                </div>
                <Button
                  className="w-full h-9 text-xs"
                  disabled={payoutMutation.isPending || !payoutAmount || !payoutBank || !payoutAccount || !payoutName}
                  onClick={() => payoutMutation.mutate({ amount: parseFloat(payoutAmount), bankName: payoutBank, accountNumber: payoutAccount, accountName: payoutName })}
                >
                  {payoutMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                  {payoutMutation.isPending ? "Submitting..." : "Request Payout"}
                </Button>
              </div>
            </>
          )}

          {activeTab === "loan" && (
            <>
              <h3 className="text-sm font-semibold text-foreground mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Apply for Working Capital Loan</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Loan Amount (USD)</label>
                  <Input className="h-8 text-xs" placeholder="e.g. 10000" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} type="number" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Term (months)</label>
                  <Select value={loanTerm} onValueChange={setLoanTerm}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[3, 6, 12, 24, 36, 48, 60].map((m) => (
                        <SelectItem key={m} value={String(m)}>{m} months</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Purpose</label>
                  <Input className="h-8 text-xs" placeholder="e.g. Equipment purchase" value={loanPurpose} onChange={(e) => setLoanPurpose(e.target.value)} />
                </div>
                {loanAmount && (
                  <div className="p-3 rounded-md bg-white/5 text-[10px] text-muted-foreground">
                    <p>Estimated monthly payment: <span className="text-foreground font-mono">${((parseFloat(loanAmount || "0") * 0.01 * Math.pow(1.01, parseInt(loanTerm))) / (Math.pow(1.01, parseInt(loanTerm)) - 1)).toFixed(2)}</span></p>
                    <p>Interest rate: <span className="text-foreground">12% p.a.</span></p>
                  </div>
                )}
                <Button
                  className="w-full h-9 text-xs"
                  disabled={loanMutation.isPending || !loanAmount || !loanPurpose}
                  onClick={() => loanMutation.mutate({ amount: parseFloat(loanAmount), termMonths: parseInt(loanTerm), purpose: loanPurpose })}
                >
                  {loanMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <TrendingUp className="w-3.5 h-3.5 mr-1" />}
                  {loanMutation.isPending ? "Applying..." : "Apply for Loan"}
                </Button>
              </div>
            </>
          )}

          {activeTab === "insurance" && (
            <>
              <h3 className="text-sm font-semibold text-foreground mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Get Insurance Quote</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Coverage Type</label>
                  <Select value={coverageType} onValueChange={(v) => setCoverageType(v as typeof coverageType)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="travel">Travel Insurance</SelectItem>
                      <SelectItem value="health">Health Insurance</SelectItem>
                      <SelectItem value="business">Business Insurance</SelectItem>
                      <SelectItem value="equipment">Equipment Insurance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Coverage Amount (USD)</label>
                  <Input className="h-8 text-xs" placeholder="e.g. 5000" value={coverageAmount} onChange={(e) => setCoverageAmount(e.target.value)} type="number" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Duration (days)</label>
                  <Input className="h-8 text-xs" placeholder="e.g. 30" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} type="number" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Destination (optional)</label>
                  <Input className="h-8 text-xs" placeholder="e.g. Lagos, Nigeria" value={destination} onChange={(e) => setDestination(e.target.value)} />
                </div>
                {quoteResult && (
                  <div className="p-3 rounded-md bg-white/5 border border-[oklch(0.82_0.18_75)]/30">
                    <p className="text-xs font-semibold text-[oklch(0.82_0.18_75)] mb-1">Quote Ready</p>
                    <p className="text-[10px] text-muted-foreground">Premium: <span className="text-foreground font-mono">${quoteResult.premium}</span></p>
                    <p className="text-[10px] text-muted-foreground">Coverage: <span className="text-foreground font-mono">${quoteResult.coverageAmount.toLocaleString()}</span></p>
                    <p className="text-[10px] text-muted-foreground">Valid until: {new Date(quoteResult.validUntil).toLocaleString()}</p>
                    <Button className="w-full h-7 text-[10px] mt-2" onClick={() => purchaseMutation.mutate({ quoteId: quoteResult.quoteId })} disabled={purchaseMutation.isPending}>
                      {purchaseMutation.isPending ? "Activating..." : "Purchase Policy"}
                    </Button>
                  </div>
                )}
                <Button
                  className="w-full h-9 text-xs"
                  disabled={insuranceMutation.isPending || !coverageAmount}
                  onClick={() => {
                    setQuoteResult(null);
                    insuranceMutation.mutate({ coverageType, coverageAmount: parseFloat(coverageAmount), durationDays: parseInt(durationDays), destination: destination || undefined });
                  }}
                >
                  {insuranceMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Shield className="w-3.5 h-3.5 mr-1" />}
                  {insuranceMutation.isPending ? "Getting Quote..." : "Get Quote"}
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="glass-card p-5 animate-fade-in-up opacity-0" style={{ animationDelay: "250ms", animationFillMode: "forwards" }}>
          {/* History header with clear filters button */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              {filterType !== "all"
                ? `${filterType.charAt(0).toUpperCase() + filterType.slice(1)} History`
                : activeTab === "payout" ? "Payout History" : activeTab === "loan" ? "Loan Applications" : "Insurance Policies"}
            </h3>
            {hasFilters && (
              <Button size="sm" variant="ghost" className="h-6 text-[10px] text-muted-foreground hover:text-foreground" onClick={clearFilters}>
                <X className="w-3 h-3 mr-1" />Clear filters
              </Button>
            )}
          </div>

          {/* Filter controls */}
          <div className="flex flex-wrap gap-2 mb-3">
            <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
              <SelectTrigger className="h-7 text-[10px] w-32">
                <Filter className="w-3 h-3 mr-1 shrink-0" />
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="payout">Payout</SelectItem>
                <SelectItem value="loan">Loan</SelectItem>
                <SelectItem value="insurance">Insurance</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              className="h-7 text-[10px] w-32"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              title="From date"
            />
            <Input
              type="date"
              className="h-7 text-[10px] w-32"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              title="To date"
            />
          </div>

          {/* Results count */}
          {hasFilters && (
            <p className="text-[10px] text-muted-foreground mb-2">{currentItems.length} result{currentItems.length !== 1 ? "s" : ""} found</p>
          )}

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {currentItems.map((item) => (
              <div key={item.id} className="p-3 rounded-md bg-white/3 hover:bg-white/5 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase">{item.type}</span>
                    <span className="text-xs font-mono font-bold text-foreground">${item.amount.toLocaleString()} {item.currency}</span>
                  </div>
                  <span className={"text-[10px] font-medium " + (STATUS_COLORS[item.status] ?? "text-muted-foreground")}>{item.status.replace("_", " ").toUpperCase()}</span>
                </div>
                {item.description && <p className="text-[10px] text-muted-foreground">{item.description}</p>}
                <p className="text-[10px] text-muted-foreground mt-1">{new Date(item.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
            {currentItems.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs text-muted-foreground">
                  {hasFilters ? "No requests match the current filters" : `No ${activeTab} requests yet`}
                </p>
              </div>
            )}
          </div>
          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
              <span className="text-[10px] text-muted-foreground">Page {currentPage + 1} of {totalPages} &middot; {listData?.total ?? 0} total</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={currentPage === 0} onClick={() => setCurrentPage(0)}>«</Button>
                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}>‹</Button>
                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)}>›</Button>
                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(totalPages - 1)}>»</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
