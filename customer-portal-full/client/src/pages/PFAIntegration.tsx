import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PiggyBank, Calculator, Loader2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function PFAIntegration() {
  const [amount, setAmount] = useState("");
  const [years, setYears] = useState("10");
  const { data: annuities, isLoading, refetch } = trpc.pfa.annuities.useQuery();
  const quoteMutation = trpc.pfa.quote.useMutation({
    onSuccess: (data: any) => toast.success("Annuity Quote: &#8358;" + Number(data?.monthlyPayment ?? 0).toLocaleString() + "/month"),
    onError: (e: any) => toast.error("Quote failed", { description: e.message }),
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold flex items-center gap-2"><PiggyBank className="h-8 w-8 text-blue-600"/>PFA Integration</h1><p className="text-muted-foreground mt-1">Pension Fund Administrator annuity products and quotes</p></div>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2"/>Refresh</Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Get Annuity Quote</CardTitle><CardDescription>Calculate your retirement annuity</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><label className="text-sm font-medium">Retirement Fund Amount (&#8358;)</label><Input type="number" placeholder="e.g. 5000000" value={amount} onChange={(e) => setAmount(e.target.value)}/></div>
            <div className="space-y-2"><label className="text-sm font-medium">Annuity Period (Years)</label><Input type="number" placeholder="e.g. 10" value={years} onChange={(e) => setYears(e.target.value)}/></div>
            <Button className="w-full" onClick={() => quoteMutation.mutate({ amount: Number(amount), years: Number(years) })} disabled={!amount || quoteMutation.isLoading}>{quoteMutation.isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Calculator className="h-4 w-4 mr-2"/>}Get Quote</Button>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Available Annuity Products</CardTitle></CardHeader><CardContent>
          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin"/></div> :
            <div className="space-y-3">{((annuities as any[]) ?? []).map((a: any, i: number) => (
              <div key={i} className="p-3 border rounded-lg flex items-center justify-between">
                <div><p className="font-medium text-sm">{a.name}</p><p className="text-xs text-muted-foreground">{a.pfa}</p></div>
                <div className="text-right"><p className="font-bold text-blue-600">{a.rate ?? 0}%</p><Badge variant="outline" className="text-xs">{a.type ?? "Annuity"}</Badge></div>
              </div>
            ))}</div>
          }
        </CardContent></Card>
      </div>
    </div>
  );
}
