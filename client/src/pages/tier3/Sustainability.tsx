import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Leaf, TreePine, Wind, Zap, Loader2, ShoppingCart } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  forestry: TreePine,
  renewable: Wind,
  clean_energy: Zap,
  blue_carbon: Leaf,
};

export default function Sustainability() {
  const utils = trpc.useUtils();
  const [buyOpen, setBuyOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState("");
  const [amount, setAmount] = useState("1");
  const { data: stats, isLoading: statsLoading } = trpc.sustainability.stats.useQuery();
  const { data: projects } = trpc.sustainability.listProjects.useQuery();
  const { data: myOffsets, isLoading } = trpc.sustainability.myOffsets.useQuery();
  const purchaseMutation = trpc.sustainability.purchaseOffset.useMutation({
    onSuccess: () => {
      utils.sustainability.myOffsets.invalidate();
      utils.sustainability.stats.invalidate();
      setBuyOpen(false);
      setAmount("1");
      toast.success("Carbon offset purchased!");
    },
    onError: (e) => toast.error("Purchase failed", { description: e.message }),
  });
  const selectedProj = projects?.find((p) => p.id === selectedProject);
  const cost = selectedProj ? (parseFloat(amount || "0") * selectedProj.pricePerTon).toFixed(2) : "0.00";
  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Leaf className="w-6 h-6 text-green-500" />Sustainability</h1>
          <p className="text-muted-foreground text-sm mt-1">Carbon offset marketplace for tourism operators</p>
        </div>
        <Button onClick={() => setBuyOpen(true)} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
          <ShoppingCart className="w-4 h-4" />Buy Offset
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Tonnes Offset", value: statsLoading ? "—" : stats?.totalOffsetTons ?? 0, unit: "tCO₂" },
          { label: "Total Spent", value: statsLoading ? "—" : `$${stats?.totalSpentUsd ?? 0}`, unit: "" },
          { label: "Purchases", value: statsLoading ? "—" : stats?.purchaseCount ?? 0, unit: "" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-2xl font-bold text-green-600">
                {s.value}{s.unit ? <span className="text-sm font-normal text-muted-foreground ml-1">{s.unit}</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Available Projects</CardTitle><CardDescription>Verified carbon offset projects across Africa</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(projects ?? []).map((p) => {
              const Icon = CATEGORY_ICONS[p.category] ?? Leaf;
              return (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.country} · {p.category}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">${p.pricePerTon}/t</p>
                    <Badge variant="outline" className="text-xs">Verified</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">My Offsets</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : !myOffsets?.length ? (
            <div className="text-center py-8 text-muted-foreground"><Leaf className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No offsets purchased yet.</p></div>
          ) : (
            <div className="space-y-2">
              {myOffsets.map((o) => (
                <div key={o.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">{o.projectName}</p>
                    <p className="text-xs text-muted-foreground">{o.projectCountry} · {o.vintageYear}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">{o.amount} tCO₂</p>
                    <p className="text-xs text-muted-foreground">${o.costUsd}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Buy Carbon Offset</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Project</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
                <SelectContent>
                  {(projects ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (${p.pricePerTon}/t)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount (tonnes CO₂)</Label>
              <Input type="number" min="0.1" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            {selectedProj && (
              <div className="p-3 bg-green-50 dark:bg-green-950 rounded text-sm">
                <strong>Total cost: ${cost} USD</strong>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuyOpen(false)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => purchaseMutation.mutate({ projectId: selectedProject, amountTons: parseFloat(amount) })}
              disabled={purchaseMutation.isPending || !selectedProject || parseFloat(amount) <= 0}
            >
              {purchaseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
