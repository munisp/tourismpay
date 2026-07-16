import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Search, UserPlus, Loader2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function GroupLifeAdmin() {
  const [search, setSearch] = useState("");
  const { data: schemes, isLoading, refetch } = trpc.groupLife.schemes.useQuery();
  const enrollMutation = trpc.groupLife.enroll.useMutation({
    onSuccess: () => { toast.success("Member enrolled successfully"); refetch(); },
    onError: (e: any) => toast.error("Enrollment failed", { description: e.message }),
  });
  const filtered = ((schemes as any[]) ?? []).filter((s: any) => !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.employer?.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold flex items-center gap-2"><Users className="h-8 w-8 text-blue-600"/>Group Life Administration</h1><p className="text-muted-foreground mt-1">Manage group life insurance schemes and member enrollments</p></div>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2"/>Refresh</Button>
      </div>
      <Card><CardHeader><CardTitle>Search Schemes</CardTitle></CardHeader><CardContent><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><Input placeholder="Search by scheme or employer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9"/></div></CardContent></Card>
      <Card><CardHeader><CardTitle>Group Life Schemes</CardTitle><CardDescription>{filtered.length} schemes</CardDescription></CardHeader><CardContent>
        {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600"/></div> :
          <Table><TableHeader><TableRow><TableHead>Scheme Name</TableHead><TableHead>Employer</TableHead><TableHead>Members</TableHead><TableHead>Coverage</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No schemes found</TableCell></TableRow> :
            filtered.map((scheme: any, i: number) => (<TableRow key={i}><TableCell className="font-medium">{scheme.name}</TableCell><TableCell>{scheme.employer}</TableCell><TableCell>{scheme.memberCount ?? 0}</TableCell><TableCell>&#8358;{Number(scheme.coverage ?? 0).toLocaleString()}</TableCell><TableCell><Badge variant={scheme.status === "Active" ? "default" : "secondary"}>{scheme.status ?? "Active"}</Badge></TableCell><TableCell><Button size="sm" variant="outline" onClick={() => enrollMutation.mutate({ schemeId: scheme.id })} disabled={enrollMutation.isLoading}><UserPlus className="h-4 w-4 mr-1"/>Enroll</Button></TableCell></TableRow>))
          }</TableBody></Table>
        }
      </CardContent></Card>
    </div>
  );
}
