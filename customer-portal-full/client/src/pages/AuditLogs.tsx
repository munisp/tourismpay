import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollText, Search, Download, RefreshCw, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const { data, isLoading, refetch } = trpc.auditTrail.list.useQuery({ page, limit: 20 }, { keepPreviousData: true } as any);
  const exportMutation = trpc.auditTrail.export.useMutation({
    onSuccess: () => toast.success("Audit log exported"),
    onError: (e: any) => toast.error("Export failed", { description: e.message }),
  });
  const logs = ((data as any)?.logs ?? []).filter((l: any) => {
    const ms = !search || l.action?.toLowerCase().includes(search.toLowerCase()) || l.entityType?.toLowerCase().includes(search.toLowerCase());
    const ma = actionFilter === "all" || l.action === actionFilter;
    return ms && ma;
  });
  const total = (data as any)?.total ?? 0;
  const totalPages = Math.ceil(total / 20);
  const ACTION_COLORS: Record<string,string> = { CREATE:"bg-green-100 text-green-800", UPDATE:"bg-blue-100 text-blue-800", DELETE:"bg-red-100 text-red-800", LOGIN:"bg-purple-100 text-purple-800" };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold flex items-center gap-2"><ScrollText className="h-8 w-8 text-blue-600"/>Audit Logs</h1><p className="text-muted-foreground mt-1">Complete audit trail of all platform activities</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2"/>Refresh</Button>
          <Button size="sm" onClick={() => exportMutation.mutate()} disabled={exportMutation.isLoading}>{exportMutation.isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Download className="h-4 w-4 mr-2"/>}Export CSV</Button>
        </div>
      </div>
      <Card><CardHeader><CardTitle>Filters</CardTitle></CardHeader><CardContent><div className="flex gap-4">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><Input placeholder="Search audit trail..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9"/></div>
        <Select value={actionFilter} onValueChange={setActionFilter}><SelectTrigger className="w-48"><SelectValue placeholder="Filter by action"/></SelectTrigger><SelectContent><SelectItem value="all">All Actions</SelectItem><SelectItem value="CREATE">Create</SelectItem><SelectItem value="UPDATE">Update</SelectItem><SelectItem value="DELETE">Delete</SelectItem><SelectItem value="LOGIN">Login</SelectItem><SelectItem value="LOGOUT">Logout</SelectItem></SelectContent></Select>
      </div></CardContent></Card>
      <Card><CardHeader><CardTitle>Activity Log</CardTitle><CardDescription>Showing {logs.length} of {total} entries</CardDescription></CardHeader><CardContent>
        {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600"/></div> : (
          <><Table><TableHeader><TableRow><TableHead>Timestamp</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>IP</TableHead></TableRow></TableHeader>
          <TableBody>{logs.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No audit logs found</TableCell></TableRow> :
            logs.map((log: any, i: number) => (<TableRow key={i}><TableCell className="text-xs">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}</TableCell><TableCell className="font-medium text-sm">{log.userId ?? "System"}</TableCell><TableCell><Badge className={ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-800"}>{log.action}</Badge></TableCell><TableCell className="text-sm">{log.entityType ?? "—"}</TableCell><TableCell className="text-xs">{log.ipAddress ?? "—"}</TableCell></TableRow>))
          }</TableBody></Table>
          {totalPages > 1 && <div className="flex items-center justify-between mt-4"><p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}><ChevronLeft className="h-4 w-4"/>Prev</Button><Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}>Next<ChevronRight className="h-4 w-4"/></Button></div></div>}
          </>
        )}
      </CardContent></Card>
    </div>
  );
}
