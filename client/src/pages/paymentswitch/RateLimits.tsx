/**
 * RateLimits.tsx
 *
 * Corridor Rate-Limit management page.
 * Shows per-corridor transaction-per-minute and daily volume caps with
 * live utilization bars, create/edit/delete controls, and usage reset.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Switch } from "@/components/ui/switch";
import { Gauge, Plus, RefreshCw, Trash2, Edit, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type CorridorRow = {
  corridor: string;
  hasConfig: boolean;
  isActive: boolean;
  maxTxPerMinute: number;
  maxVolumePerDay: number;
  currency: string;
  currentTxThisMinute: number;
  currentVolumeToday: number;
  currentTxToday: number;
  txUtilizationPct: number;
  volumeUtilizationPct: number;
};

function utilizationColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-yellow-500";
  return "bg-emerald-500";
}

export default function RateLimits() {
  const utils = trpc.useUtils();
  const { data: corridors, isLoading } = trpc.corridorRateLimit.listWithUsage.useQuery();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCorridor, setSelectedCorridor] = useState<CorridorRow | null>(null);
  const [formData, setFormData] = useState({
    maxTxPerMinute: 0,
    maxVolumePerDay: 0,
    currency: "USD",
    isActive: true,
    notes: "",
  });

  const createMutation = trpc.corridorRateLimit.create.useMutation({
    onSuccess: () => {
      toast.success("Rate limit created");
      utils.corridorRateLimit.listWithUsage.invalidate();
      setEditDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.corridorRateLimit.update.useMutation({
    onSuccess: () => {
      toast.success("Rate limit updated");
      utils.corridorRateLimit.listWithUsage.invalidate();
      setEditDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.corridorRateLimit.delete.useMutation({
    onSuccess: () => {
      toast.success("Rate limit deleted");
      utils.corridorRateLimit.listWithUsage.invalidate();
      setDeleteDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const resetMutation = trpc.corridorRateLimit.reset.useMutation({
    onSuccess: (data) => {
      toast.success(`Usage counters reset for ${data.corridor}`);
      utils.corridorRateLimit.listWithUsage.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleEdit = (row: CorridorRow) => {
    setSelectedCorridor(row);
    setFormData({
      maxTxPerMinute: row.maxTxPerMinute,
      maxVolumePerDay: row.maxVolumePerDay,
      currency: row.currency,
      isActive: row.isActive,
      notes: "",
    });
    setEditDialogOpen(true);
  };

  const handleCreate = (corridor: string) => {
    setSelectedCorridor({ corridor } as CorridorRow);
    setFormData({ maxTxPerMinute: 60, maxVolumePerDay: 1000000, currency: "USD", isActive: true, notes: "" });
    setEditDialogOpen(true);
  };

  const handleSave = () => {
    if (!selectedCorridor) return;
    if (selectedCorridor.hasConfig) {
      updateMutation.mutate({ corridor: selectedCorridor.corridor, ...formData });
    } else {
      createMutation.mutate({ corridor: selectedCorridor.corridor, ...formData });
    }
  };

  const handleDelete = (row: CorridorRow) => {
    setSelectedCorridor(row);
    setDeleteDialogOpen(true);
  };

  const configuredCount = corridors?.filter((c) => c.hasConfig).length ?? 0;
  const activeCount = corridors?.filter((c) => c.isActive).length ?? 0;
  const highUtilization = corridors?.filter((c) => c.txUtilizationPct >= 70 || c.volumeUtilizationPct >= 70).length ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gauge className="w-6 h-6 text-blue-500" />
            Corridor Rate Limits
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Per-corridor transaction-per-minute and daily volume caps enforced on every remittance.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => utils.corridorRateLimit.listWithUsage.invalidate()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Configured Corridors</CardDescription>
            <CardTitle className="text-3xl">{configuredCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">of {corridors?.length ?? 0} total corridors</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Limits</CardDescription>
            <CardTitle className="text-3xl text-emerald-500">{activeCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">currently enforcing limits</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>High Utilization</CardDescription>
            <CardTitle className="text-3xl text-yellow-500">{highUtilization}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">corridors above 70% capacity</p>
          </CardContent>
        </Card>
      </div>

      {/* Corridor table */}
      <Card>
        <CardHeader>
          <CardTitle>All Corridors</CardTitle>
          <CardDescription>
            Click "Configure" on any unconfigured corridor to set limits. 0 = unlimited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading corridors…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Corridor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tx/min Limit</TableHead>
                  <TableHead>Tx/min Usage</TableHead>
                  <TableHead>Daily Volume</TableHead>
                  <TableHead>Volume Usage</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {corridors?.map((row) => (
                  <TableRow key={row.corridor}>
                    <TableCell className="font-mono font-semibold">{row.corridor}</TableCell>
                    <TableCell>
                      {!row.hasConfig ? (
                        <Badge variant="outline" className="text-muted-foreground">Unconfigured</Badge>
                      ) : row.isActive ? (
                        <Badge className="bg-emerald-500 text-white">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.maxTxPerMinute === 0 ? (
                        <span className="text-muted-foreground text-sm">Unlimited</span>
                      ) : (
                        <span className="font-mono">{row.maxTxPerMinute}/min</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.hasConfig && row.maxTxPerMinute > 0 ? (
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Progress
                            value={row.txUtilizationPct}
                            className="h-2 flex-1"
                          />
                          <span className="text-xs font-mono w-10 text-right">
                            {row.currentTxThisMinute}/{row.maxTxPerMinute}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.maxVolumePerDay === 0 ? (
                        <span className="text-muted-foreground text-sm">Unlimited</span>
                      ) : (
                        <span className="font-mono text-sm">
                          {(row.maxVolumePerDay / 100).toLocaleString()} {row.currency}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.hasConfig && row.maxVolumePerDay > 0 ? (
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Progress
                            value={row.volumeUtilizationPct}
                            className="h-2 flex-1"
                          />
                          <span className="text-xs font-mono w-10 text-right">
                            {row.volumeUtilizationPct}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!row.hasConfig ? (
                          <Button size="sm" variant="outline" onClick={() => handleCreate(row.corridor)}>
                            <Plus className="w-3 h-3 mr-1" />
                            Configure
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => resetMutation.mutate({ corridor: row.corridor })}
                              title="Reset usage counters"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleEdit(row)}>
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-600"
                              onClick={() => handleDelete(row)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedCorridor?.hasConfig ? "Edit" : "Configure"} Rate Limit — {selectedCorridor?.corridor}
            </DialogTitle>
            <DialogDescription>
              Set 0 for unlimited. Tx/min limit is enforced per 1-minute sliding window.
              Volume cap is enforced per 24-hour UTC day.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Tx/min</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.maxTxPerMinute}
                  onChange={(e) => setFormData((f) => ({ ...f, maxTxPerMinute: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Volume/day (minor units)</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.maxVolumePerDay}
                  onChange={(e) => setFormData((f) => ({ ...f, maxVolumePerDay: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input
                value={formData.currency}
                maxLength={3}
                onChange={(e) => setFormData((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Reason for this limit…"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(v) => setFormData((f) => ({ ...f, isActive: v }))}
              />
              <Label>Active (enforce limit)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rate Limit</AlertDialogTitle>
            <AlertDialogDescription>
              Remove the rate limit configuration for <strong>{selectedCorridor?.corridor}</strong>?
              This will allow unlimited transactions on this corridor until a new limit is configured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => selectedCorridor && deleteMutation.mutate({ corridor: selectedCorridor.corridor })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
