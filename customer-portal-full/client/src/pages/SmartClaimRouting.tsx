import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Route, Loader2, RefreshCw, Play, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function SmartClaimRouting() {
  const [claimId, setClaimId] = useState("");
  const [search, setSearch] = useState("");
  const { data: queue, isLoading, refetch } = trpc.claimRouting.queue.useQuery();
  const routeMutation = trpc.claimRouting.route.useMutation({
    onSuccess: (data: any) => { toast.success("Claim routed to: " + (data?.assignedTo ?? "adjudicator")); refetch(); },
    onError: (e: any) => toast.error("Routing failed", { description: e.message }),
  });
  const filtered = ((queue as any[]) ?? []).filter((c: any) => !search || c.claimId?.toLowerCase().includes(search.toLowerCase()) || c.type?.toLowerCase().includes(search.toLowerCase()));
  const PRIORITY_COLORS: Record<string, "destructive" | "default" | "secondary"> = { HIGH: "destructive", MEDIUM: "default", LOW: "secondary" };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold flex items-center gap-2"><Route className="h-8 w-8 text-blue-600"/>Smart Claim Routing</h1><p className="text-muted-foreground mt-1">AI-powered intelligent routing of claims to the right adjudicators</p></div>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2"/>Refresh</Button>
      </div>
      <Card><CardHeader><CardTitle>Route a Claim</CardTitle></CardHeader>
        <CardContent><div className="flex gap-2"><Input placeholder="Enter Claim ID..." value={claimId} onChange={(e) => setClaimId(e.target.value)}/><Button onClick={() => routeMutation.mutate({ claimId })} disabled={!claimId || routeMutation.isLoading}>{routeMutation.isLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Play className="h-4 w-4 mr-2"/>}Route</Button></div></CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Routing Queue</CardTitle><CardDescription>{filtered.length} claims pending</CardDescription></CardHeader>
        <CardContent>
          <div className="mb-4 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><Input placeholder="Search queue..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9"/></div>
          {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600"/></div> :
            <Table><TableHeader><TableRow><TableHead>Claim ID</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Priority</TableHead><TableHead>Assigned To</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Queue is empty</TableCell></TableRow> :
              filtered.map((c: any, i: number) => (<TableRow key={i}><TableCell className="font-mono text-sm">{c.claimId}</TableCell><TableCell>{c.type}</TableCell><TableCell>&#8358;{Number(c.amount ?? 0).toLocaleString()}</TableCell><TableCell><Badge variant={PRIORITY_COLORS[c.priority] ?? "default"}>{c.priority ?? "MEDIUM"}</Badge></TableCell><TableCell>{c.assignedTo ?? "Unassigned"}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => routeMutation.mutate({ claimId: c.claimId })} disabled={routeMutation.isLoading}><Route className="h-3 w-3 mr-1"/>Route</Button></TableCell></TableRow>))
            }</TableBody></Table>
          }
        </CardContent>
      </Card>
    </div>
  );
}
