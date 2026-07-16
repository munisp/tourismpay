import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Search, Download, RefreshCw, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function AuditTrailSystem() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = trpc.auditTrail.list.useQuery({ page, limit: 25 }, { keepPreviousData: true } as any);
  const exportMutation = trpc.auditTrail.export.useMutation({
    onSuccess: () => toast.success("Audit trail exported"),
    onError: (e: any) => toast.error("Export failed", { description: e.message }),
  });
  const logs = ((data as any)?.logs ?? []).filter((l: any) => !search || l.action?.toLowerCase().includes(search.toLowerCase()) || l.entityType?.toLowerCase().includes(search.toLowerCase()));
  const total = (data as any)?.total ?? 0;
  const totalPages = Math.ceil(total / 25);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold flex items-center gap-2"><Shield className="h-8 w-8 text-blue-600"/>Audit Trail System</h1><p className="text-muted-foreground mt-1">Immutable record of all system actions for compliance</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2"/>Refresh</Button>
          <Button size="sm" onClick={() => exportMutation.mutate()} disabled={exportMutation.isLoading}>{exportMutation.isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Download className="h-4 w-4 mr-2"/>}Export</Button>
        </div>
      </div>
      <Card><CardHeader><CardTitle>Search</CardTitle></CardHeader><CardContent><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><Input placeholder="Search audit trail..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9"/></div></CardContent></Card>
      <Card><CardHeader><CardTitle>Audit Records</CardTitle><CardDescription>{total} total records</CardDescription></CardHeader><CardContent>
        {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600"/></div> : (
          <><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{logs.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No records found</TableCell></TableRow> :
            logs.map((log: any, i: number) => (<TableRow key={i}><TableCell className="text-xs">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}</TableCell><TableCell className="text-sm font-medium">{log.userId ?? "System"}</TableCell><TableCell><Badge variant="outline">{log.action}</Badge></TableCell><TableCell className="text-sm">{log.entityType ?? "—"}</TableCell><TableCell><Badge variant={log.success ? "default" : "destructive"}>{log.success ? "Success" : "Failed"}</Badge></TableCell></TableRow>))
          }</TableBody></Table>
          {totalPages > 1 && <div className="flex justify-between mt-4"><Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}><ChevronLeft className="h-4 w-4"/>Prev</Button><span className="text-sm text-muted-foreground">Page {page}/{totalPages}</span><Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}>Next<ChevronRight className="h-4 w-4"/></Button></div>}
          </>
        )}
      </CardContent></Card>
    </div>
  );
}
