import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Award, Clock, AlertTriangle, CheckCircle, XCircle, RefreshCw, Calendar, Package, BarChart2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface RewardRow {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  category: string;
  partner: string;
  isActive: boolean;
  stock: number | null;
  expiresAt: number | null;
  expired: boolean;
  expiringSoon: boolean;
}

export default function LoyaltyRewardsAdmin() {
  const utils = trpc.useUtils();

  const { data: rewards = [], isLoading } = trpc.loyalty.adminRewards.useQuery();
  const { data: analyticsData } = trpc.loyalty.rewardAnalytics.useQuery({ limit: 10 });

  const setExpiry = trpc.loyalty.setRewardExpiry.useMutation({
    onSuccess: () => {
      utils.loyalty.adminRewards.invalidate();
      toast.success("Expiry updated", { description: "Reward expiry date has been saved." });
    },
    onError: (e) => toast.error("Error", { description: e.message }),
  });

  const expireAll = trpc.loyalty.expireRewards.useMutation({
    onSuccess: (data) => {
      utils.loyalty.adminRewards.invalidate();
      toast.success("Expiry run complete", { description: `${data.deactivated} reward(s) deactivated.` });
    },
    onError: (e) => toast.error("Error", { description: e.message }),
  });

  // Restock mutation
  const restockMut = trpc.loyalty.restockReward.useMutation({
    onSuccess: (data) => {
      utils.loyalty.adminRewards.invalidate();
      toast.success(`Restocked: ${data.rewardName}`, {
        description: `Stock set to ${data.newStock}${data.reactivated ? " — reward reactivated" : ""}.`,
      });
      setRestockingReward(null);
      setRestockQty("50");
    },
    onError: (e) => toast.error("Restock failed", { description: e.message }),
  });

  // Expiry date picker dialog state
  const [editingReward, setEditingReward] = useState<RewardRow | null>(null);
  const [expiryDateInput, setExpiryDateInput] = useState("");

  // Restock dialog state
  const [restockingReward, setRestockingReward] = useState<RewardRow | null>(null);
  const [restockQty, setRestockQty] = useState("50");

  const openExpiryDialog = (reward: RewardRow) => {
    setEditingReward(reward);
    if (reward.expiresAt) {
      const d = new Date(reward.expiresAt);
      setExpiryDateInput(d.toISOString().slice(0, 16)); // datetime-local format
    } else {
      setExpiryDateInput("");
    }
  };

  const saveExpiry = () => {
    if (!editingReward) return;
    const expiresAt = expiryDateInput ? new Date(expiryDateInput).getTime() : null;
    setExpiry.mutate({ rewardId: editingReward.id, expiresAt });
    setEditingReward(null);
  };

  const clearExpiry = () => {
    if (!editingReward) return;
    setExpiry.mutate({ rewardId: editingReward.id, expiresAt: null });
    setEditingReward(null);
  };

  const formatExpiry = (expiresAt: number | null) => {
    if (!expiresAt) return <span className="text-muted-foreground text-xs">Never</span>;
    return (
      <span className="text-xs font-mono">
        {new Date(expiresAt).toLocaleDateString()} {new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    );
  };

  const expiredCount = (rewards as RewardRow[]).filter(r => r.expired).length;
  const expiringSoonCount = (rewards as RewardRow[]).filter(r => r.expiringSoon && !r.expired).length;
  const activeCount = (rewards as RewardRow[]).filter(r => r.isActive && !r.expired).length;
  const outOfStockCount = (rewards as RewardRow[]).filter(r => !r.isActive && r.stock === 0).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Award className="w-6 h-6 text-primary" />
            Loyalty Rewards Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage reward expiry dates, restock out-of-stock rewards, and deactivate expired rewards
          </p>
        </div>
        <Button
          onClick={() => expireAll.mutate()}
          disabled={expireAll.isPending}
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${expireAll.isPending ? "animate-spin" : ""}`} />
          Run Expiry Job
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold text-foreground">{activeCount}</p>
                <p className="text-xs text-muted-foreground">Active Rewards</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold text-foreground">{expiringSoonCount}</p>
                <p className="text-xs text-muted-foreground">Expiring Soon (&lt;7 days)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 text-destructive" />
              <div>
                <p className="text-2xl font-bold text-foreground">{expiredCount}</p>
                <p className="text-xs text-muted-foreground">Expired</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-orange-400" />
              <div>
                <p className="text-2xl font-bold text-foreground">{outOfStockCount}</p>
                <p className="text-xs text-muted-foreground">Out of Stock</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Redemption Analytics */}
      {analyticsData && analyticsData.rewards.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" />
                Redemption Analytics
              </CardTitle>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Total Redemptions: <strong className="text-foreground">{analyticsData.totalRedemptions}</strong></span>
                <span>Total Points Spent: <strong className="text-foreground">{analyticsData.totalPointsSpent.toLocaleString()}</strong></span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData.rewards} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.35 0.01 264 / 0.3)" />
                  <XAxis dataKey="rewardName" tick={{ fontSize: 10, fill: "oklch(0.65 0.01 264)" }} angle={-35} textAnchor="end" interval={0} height={55} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.65 0.01 264)" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "oklch(0.18 0.01 264)", border: "1px solid oklch(0.3 0.01 264)", borderRadius: 6, fontSize: 11 }} formatter={(value: number, name: string) => [value, name === "redemptionCount" ? "Redemptions" : "Points Spent"]} />
                  <Bar dataKey="redemptionCount" name="Redemptions" radius={[3, 3, 0, 0]}>
                    {analyticsData.rewards.map((entry: { isActive: boolean }, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.isActive ? "oklch(0.65 0.22 264)" : "oklch(0.55 0.01 264)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {analyticsData.topRedeemers.length > 0 && (
              <div className="mt-4 border-t border-border/30 pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Top Redeemers</p>
                <div className="space-y-2">
                  {analyticsData.topRedeemers.map((r: { userId: string; userName: string; redemptionCount: number; totalPointsSpent: number }, i: number) => (
                    <div key={r.userId} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">{i + 1}</span>
                        <span className="font-medium">{r.userName}</span>
                      </span>
                      <span className="text-muted-foreground">{r.redemptionCount} redemptions · {r.totalPointsSpent.toLocaleString()} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {/* Rewards Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">All Rewards</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Loading rewards...
            </div>
          ) : (rewards as RewardRow[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Award className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No rewards found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-xs">Reward</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs">Points</TableHead>
                  <TableHead className="text-xs">Stock</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Expires At</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rewards as RewardRow[]).map((reward) => (
                  <TableRow key={reward.id} className="border-border hover:bg-white/5">
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-foreground">{reward.name}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{reward.partner}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {reward.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-mono text-primary">{reward.pointsCost.toLocaleString()}</span>
                    </TableCell>
                    <TableCell>
                      {reward.stock === null ? (
                        <span className="text-xs text-muted-foreground">Unlimited</span>
                      ) : reward.stock === 0 ? (
                        <span className="text-xs font-mono text-destructive font-semibold">0 — Out of Stock</span>
                      ) : (
                        <span className={`text-xs font-mono ${reward.stock < 5 ? "text-amber-400" : "text-foreground"}`}>
                          {reward.stock}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {reward.expired ? (
                        <Badge className="text-xs bg-destructive/20 text-destructive border-destructive/30">
                          <XCircle className="w-3 h-3 mr-1" /> Expired
                        </Badge>
                      ) : reward.expiringSoon ? (
                        <Badge className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30">
                          <Clock className="w-3 h-3 mr-1" /> Expiring Soon
                        </Badge>
                      ) : reward.isActive ? (
                        <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                          <CheckCircle className="w-3 h-3 mr-1" /> Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {formatExpiry(reward.expiresAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Restock button: shown for out-of-stock or inactive rewards */}
                        {(!reward.isActive || (reward.stock !== null && reward.stock === 0)) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                            onClick={() => { setRestockingReward(reward); setRestockQty("50"); }}
                          >
                            <Package className="w-3 h-3" />
                            Restock
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => openExpiryDialog(reward)}
                        >
                          <Calendar className="w-3 h-3" />
                          Set Expiry
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Restock Dialog */}
      <Dialog open={!!restockingReward} onOpenChange={(open) => !open && setRestockingReward(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-400" />
              Restock Reward
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Reward: <span className="text-foreground font-medium">{restockingReward?.name}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Current stock: <span className="font-mono">{restockingReward?.stock ?? 0}</span>
              {!restockingReward?.isActive && (
                <span className="ml-2 text-amber-400">(inactive — will be reactivated)</span>
              )}
            </p>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">New stock quantity</label>
              <Input
                type="number"
                min="1"
                max="100000"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                className="bg-background border-border text-foreground text-sm"
                placeholder="e.g. 50"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRestockingReward(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!restockingReward) return;
                const qty = parseInt(restockQty, 10);
                if (!qty || qty < 1) { toast.error("Enter a valid quantity"); return; }
                restockMut.mutate({ rewardId: restockingReward.id, newStock: qty });
              }}
              disabled={restockMut.isPending}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {restockMut.isPending ? "Restocking..." : "Confirm Restock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expiry Date Picker Dialog */}
      <Dialog open={!!editingReward} onOpenChange={(open) => !open && setEditingReward(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Set Expiry Date
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Reward: <span className="text-foreground font-medium">{editingReward?.name}</span>
            </p>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Expiry date and time</label>
              <Input
                type="datetime-local"
                value={expiryDateInput}
                onChange={(e) => setExpiryDateInput(e.target.value)}
                className="bg-background border-border text-foreground text-sm"
              />
              <p className="text-xs text-muted-foreground">Leave empty to set "Never expires"</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={clearExpiry}
              disabled={setExpiry.isPending}
              className="text-xs"
            >
              Clear (Never Expires)
            </Button>
            <Button
              size="sm"
              onClick={saveExpiry}
              disabled={setExpiry.isPending}
              className="text-xs"
            >
              {setExpiry.isPending ? "Saving..." : "Save Expiry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
