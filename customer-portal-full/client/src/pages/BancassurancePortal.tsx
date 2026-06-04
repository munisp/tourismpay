import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Building2, Search, Plus, Loader2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function BancassurancePortal() {
  const [search, setSearch] = useState("");
  const { data: products, isLoading, refetch } = trpc.bancassurance.products.useQuery();
  const applyMutation = trpc.bancassurance.submitApplication.useMutation({
    onSuccess: () => { toast.success("Application submitted successfully"); refetch(); },
    onError: (e: any) => toast.error("Application failed", { description: e.message }),
  });
  const filtered = ((products as any[]) ?? []).filter((p: any) => !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.bank?.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold flex items-center gap-2"><Building2 className="h-8 w-8 text-blue-600"/>Bancassurance Portal</h1><p className="text-muted-foreground mt-1">Insurance products distributed through banking partners</p></div>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2"/>Refresh</Button>
      </div>
      <Card><CardHeader><CardTitle>Search Products</CardTitle></CardHeader><CardContent><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><Input placeholder="Search by product or bank..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9"/></div></CardContent></Card>
      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600"/></div> :
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? <Card className="col-span-full"><CardContent className="text-center py-12 text-muted-foreground">No bancassurance products found</CardContent></Card> :
            filtered.map((product: any, i: number) => (
              <Card key={i} className="hover:shadow-md transition-shadow">
                <CardHeader><CardTitle className="text-lg">{product.name}</CardTitle><CardDescription>{product.bank}</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Type</span><Badge>{product.type ?? "Insurance"}</Badge></div>
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Premium</span><span className="font-medium">&#8358;{Number(product.premium ?? 0).toLocaleString()}</span></div>
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Coverage</span><span className="font-medium">&#8358;{Number(product.coverage ?? 0).toLocaleString()}</span></div>
                  <Button className="w-full" size="sm" onClick={() => applyMutation.mutate({ productId: product.id })} disabled={applyMutation.isLoading}>{applyMutation.isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Plus className="h-4 w-4 mr-2"/>}Apply Now</Button>
                </CardContent>
              </Card>
            ))
          }
        </div>
      }
    </div>
  );
}
