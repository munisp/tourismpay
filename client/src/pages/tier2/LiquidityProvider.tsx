import { useState } from "react";
import {
  Droplets, Shield, TrendingUp, BarChart3, AlertTriangle,
  Loader2, Wallet, ArrowDownUp, Clock, CheckCircle2, Info,
  Building2, Globe, Lock,
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

type LPTab = "overview" | "pools" | "positions" | "rewards" | "apply";

export default function LiquidityProvider() {
  const [tab, setTab] = useState<LPTab>("overview");
  const [depositPool, setDepositPool] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositStable, setDepositStable] = useState("USDC");
  const [depositing, setDepositing] = useState(false);

  const [applyType, setApplyType] = useState<"individual" | "business">("business");
  const [applyName, setApplyName] = useState("");
  const [applyCountry, setApplyCountry] = useState("NG");
  const [applyWallet, setApplyWallet] = useState("");
  const [applyDeposit, setApplyDeposit] = useState("5000");
  const [applying, setApplying] = useState(false);
  const [applyTerms, setApplyTerms] = useState(false);

  const overview = trpc.liquidityProvider.programOverview.useQuery();
  const dashboard = trpc.liquidityProvider.dashboard.useQuery();

  const depositMut = trpc.liquidityProvider.deposit.useMutation({
    onSuccess: (data) => {
      toast.success(`Deposited to pool — Tier: ${data.tier}`);
      setDepositAmount("");
      setDepositing(false);
      dashboard.refetch();
    },
    onError: (err) => { toast.error(err.message); setDepositing(false); },
  });

  const applyMut = trpc.liquidityProvider.applyAsLP.useMutation({
    onSuccess: (data) => {
      toast.success(`Application submitted — Tier: ${data.tier}`);
      setApplying(false);
    },
    onError: (err) => { toast.error(err.message); setApplying(false); },
  });

  const tabs: { id: LPTab; label: string; icon: typeof Droplets }[] = [
    { id: "overview", label: "Overview", icon: Info },
    { id: "pools", label: "Pools", icon: Droplets },
    { id: "positions", label: "My Positions", icon: Wallet },
    { id: "rewards", label: "Rewards", icon: TrendingUp },
    { id: "apply", label: "Become an LP", icon: Shield },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Liquidity Provider" subtitle="Provide liquidity for stablecoin on-ramp/off-ramp and earn fees" />

      {/* Tab Navigation */}
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
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW Tab ──────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* LP Status */}
          {dashboard.data?.isLP ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 sm:p-6 border rounded-xl text-center">
                <div className="text-2xl font-bold">${(dashboard.data.totalDeposited ?? 0).toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Total Deposited</div>
              </div>
              <div className="p-4 sm:p-6 border rounded-xl text-center">
                <div className="text-2xl font-bold text-green-500">${(dashboard.data.totalEarned ?? 0).toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Total Earned</div>
              </div>
              <div className="p-4 sm:p-6 border rounded-xl text-center">
                <Badge variant="outline" className="text-lg capitalize">{dashboard.data.tier}</Badge>
                <div className="text-sm text-muted-foreground mt-1">Current Tier</div>
              </div>
            </div>
          ) : (
            <div className="p-4 sm:p-6 border rounded-xl text-center space-y-3">
              <Droplets className="h-12 w-12 mx-auto text-blue-500" />
              <h3 className="text-lg font-semibold">Become a Liquidity Provider</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Earn 55-65% of on-ramp/off-ramp fees by providing stablecoin liquidity.
                Bonus APY for underserved African corridors.
              </p>
              <Button onClick={() => setTab("apply")}>Apply Now</Button>
            </div>
          )}

          {/* How it works */}
          <div className="p-4 sm:p-6 border rounded-xl space-y-4">
            <h3 className="text-lg font-semibold">How Liquidity Provision Works</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: Shield, title: "1. Apply & Verify", desc: "Complete KYB/KYC Tier 3 verification. Minimum $5,000 deposit." },
                { icon: Droplets, title: "2. Deposit", desc: "Add stablecoins to currency pools (USDC-NGN, USDC-KES, etc.)" },
                { icon: ArrowDownUp, title: "3. Enable Swaps", desc: "Your reserves back tourist buy/sell operations via payment rails" },
                { icon: TrendingUp, title: "4. Earn Fees", desc: "Receive 55-65% of swap fees proportional to your pool share" },
              ].map((step) => (
                <div key={step.title} className="space-y-2 p-3 rounded-lg bg-muted/50">
                  <step.icon className="h-6 w-6 text-blue-500" />
                  <h4 className="font-medium text-sm">{step.title}</h4>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tier Table */}
          {overview.data && (
            <div className="p-4 sm:p-6 border rounded-xl space-y-4">
              <h3 className="text-lg font-semibold">LP Tiers</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Tier</th>
                      <th className="text-right py-2">Min Deposit</th>
                      <th className="text-right py-2">Fee Share</th>
                      <th className="text-right py-2">Multiplier</th>
                      <th className="text-right py-2">Lock-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(overview.data.tiers).map(([tier, config]) => (
                      <tr key={tier} className="border-b">
                        <td className="py-2 capitalize font-medium">{tier}</td>
                        <td className="py-2 text-right font-mono">${config.minDeposit.toLocaleString()}</td>
                        <td className="py-2 text-right">{config.feeShare}%</td>
                        <td className="py-2 text-right">{config.rewardMultiplier}x</td>
                        <td className="py-2 text-right">{(overview.data.config.lockupDays as Record<string, number>)[tier] ?? 30}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── POOLS Tab ─────────────────────────────────────────────────── */}
      {tab === "pools" && overview.data && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {overview.data.pools.map((pool) => (
              <div key={pool.id} className="p-4 border rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{pool.id}</span>
                  {pool.isUnderserved && <Badge variant="secondary" className="text-xs">+{pool.bonusAPY}% Bonus</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span>{pool.stablecoin}</span> <ArrowDownUp className="inline h-3 w-3 mx-1" /> <span>{pool.fiatCurrency}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => { setDepositPool(pool.id); setTab("positions"); }}
                  disabled={!dashboard.data?.isLP}
                >
                  {dashboard.data?.isLP ? "Deposit" : "Apply First"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── POSITIONS Tab ─────────────────────────────────────────────── */}
      {tab === "positions" && (
        <div className="space-y-6">
          {/* Deposit Form */}
          {dashboard.data?.isLP && (
            <div className="p-4 sm:p-6 border rounded-xl space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Droplets className="h-5 w-5 text-blue-500" /> Deposit Liquidity
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Pool</Label>
                  <Select value={depositPool} onValueChange={setDepositPool}>
                    <SelectTrigger><SelectValue placeholder="Select pool" /></SelectTrigger>
                    <SelectContent>
                      {overview.data?.pools.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.id}{p.isUnderserved ? " (Bonus)" : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input type="number" placeholder="5000" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    disabled={!depositPool || !depositAmount || depositing}
                    onClick={() => {
                      setDepositing(true);
                      depositMut.mutate({
                        poolId: depositPool,
                        amount: parseFloat(depositAmount),
                        stablecoin: depositStable,
                      });
                    }}
                  >
                    {depositing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Deposit
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Active Positions */}
          <div className="p-4 sm:p-6 border rounded-xl space-y-4">
            <h3 className="text-lg font-semibold">Active Positions</h3>
            {dashboard.data?.positions && (dashboard.data.positions as any[]).length > 0 ? (
              <div className="space-y-2">
                {(dashboard.data.positions as any[]).map((pos: any) => (
                  <div key={pos.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{pos.pool_id}</Badge>
                        <span className="font-mono text-sm">${Number(pos.amount).toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {pos.locked_until && Number(pos.locked_until) > Date.now()
                          ? <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Locked until {new Date(Number(pos.locked_until)).toLocaleDateString()}</span>
                          : <span className="flex items-center gap-1 text-green-500"><CheckCircle2 className="h-3 w-3" /> Unlocked</span>
                        }
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No active positions. Deposit to a pool to start earning.</p>
            )}
          </div>
        </div>
      )}

      {/* ─── REWARDS Tab ───────────────────────────────────────────────── */}
      {tab === "rewards" && (
        <div className="p-4 sm:p-6 border rounded-xl space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" /> Reward History
          </h3>
          {dashboard.data?.rewards && (dashboard.data.rewards as any[]).length > 0 ? (
            <div className="space-y-2">
              {(dashboard.data.rewards as any[]).map((r: any) => (
                <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{r.pool_id}</Badge>
                      <span className="font-mono text-sm text-green-500">+${Number(r.amount).toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Period: {new Date(Number(r.period_start)).toLocaleDateString()} - {new Date(Number(r.period_end)).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No rewards yet. Deposit liquidity to start earning.</p>
          )}
        </div>
      )}

      {/* ─── APPLY Tab ─────────────────────────────────────────────────── */}
      {tab === "apply" && (
        <div className="max-w-xl mx-auto p-4 sm:p-6 border rounded-xl space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" /> LP Application
          </h3>

          <div className="space-y-4">
            <div>
              <Label>Entity Type</Label>
              <Select value={applyType} onValueChange={(v) => setApplyType(v as "individual" | "business")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual (KYC Tier 3)</SelectItem>
                  <SelectItem value="business">Business (KYB Verified)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{applyType === "business" ? "Business Name" : "Full Name"}</Label>
              <Input value={applyName} onChange={(e) => setApplyName(e.target.value)} placeholder={applyType === "business" ? "Acme Forex Ltd" : "John Doe"} />
            </div>
            <div>
              <Label>Registration Country</Label>
              <Select value={applyCountry} onValueChange={setApplyCountry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[
                    { code: "NG", name: "Nigeria" }, { code: "KE", name: "Kenya" },
                    { code: "GH", name: "Ghana" }, { code: "ZA", name: "South Africa" },
                    { code: "TZ", name: "Tanzania" }, { code: "UG", name: "Uganda" },
                    { code: "RW", name: "Rwanda" }, { code: "SN", name: "Senegal" },
                  ].map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Wallet Address</Label>
              <Input value={applyWallet} onChange={(e) => setApplyWallet(e.target.value)} placeholder="0x..." />
            </div>
            <div>
              <Label>Intended Deposit (USD)</Label>
              <Input type="number" value={applyDeposit} onChange={(e) => setApplyDeposit(e.target.value)} min={5000} />
            </div>
            <div className="flex items-start gap-2">
              <input type="checkbox" checked={applyTerms} onChange={(e) => setApplyTerms(e.target.checked)} className="mt-1" />
              <span className="text-sm text-muted-foreground">
                I accept the LP Agreement including lock-up periods, slippage tolerance, and 2% insurance fund contribution.
              </span>
            </div>
          </div>

          <Button
            className="w-full"
            disabled={!applyName || !applyWallet || !applyTerms || applying}
            onClick={() => {
              setApplying(true);
              applyMut.mutate({
                entityType: applyType,
                entityName: applyName,
                registrationCountry: applyCountry,
                walletAddress: applyWallet,
                intendedPools: ["USDC-NGN"],
                intendedDepositUsd: parseFloat(applyDeposit) || 5000,
                acceptedTerms: applyTerms,
              });
            }}
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Submit Application
          </Button>

          {/* Requirements */}
          <div className="pt-4 border-t space-y-2">
            <h4 className="text-sm font-medium">Requirements</h4>
            {overview.data?.requirements.map((req, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-green-500" />
                <span>{req}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
