/**
 * Device Fleet Manager — N-08
 * POS terminal inventory, firmware tracking, and geofence violation monitoring.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { Smartphone, MapPin, AlertTriangle, CheckCircle, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function DeviceFleetManager() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"devices" | "violations">("devices");

  const { data: liveData, isLoading, isFetched } =
    trpc.deviceFleetManager.list.useQuery(undefined, { retry: 1, refetchInterval: 30_000 });

  const items: any[] = liveData?.items ?? [];

  const filtered = items.filter(
    (r) => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase())
  );

  const handleRefresh = () => {
    utils.deviceFleetManager.list.invalidate();
    toast.success("Device fleet data refreshed");
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Device Fleet Manager" subtitle="POS terminal inventory, firmware tracking, and geofence monitoring" icon={<Smartphone className="w-6 h-6" />}>
        <Button onClick={handleRefresh} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="w-4 h-4" />Refresh
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Records" value={isLoading && !isFetched ? "—" : String(items.length)} icon={<Smartphone className="w-5 h-5 text-blue-500" />} trend="fleet entries" />
        <StatCard title="Violations" value={isLoading && !isFetched ? "—" : String(items.filter((r: any) => r.severity === "high" || r.violationType).length)} icon={<AlertTriangle className="w-5 h-5 text-red-500" />} trend="geofence breaches" />
        <StatCard title="Resolved" value={isLoading && !isFetched ? "—" : String(items.filter((r: any) => r.resolved === true || r.status === "resolved").length)} icon={<CheckCircle className="w-5 h-5 text-emerald-500" />} trend="cleared violations" />
        <StatCard title="Monitoring" value="LIVE" icon={<MapPin className="w-5 h-5 text-purple-500" />} trend="real-time" />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search devices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} records</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Geofence Violation Log</CardTitle>
          <CardDescription>MDM-reported location violations for registered POS terminals</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Agent ID", "Violation Type", "Severity", "Lat", "Lng", "Distance (m)", "Resolved", "Occurred At"].map(col => (
                  <th key={col} className="text-left p-3 text-muted-foreground font-medium">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && !isFetched ? Array.from({length:5}).map((_,i) => (
                <tr key={i} className="border-b border-border/50">{Array.from({length:8}).map((_,j) => <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No geofence violations recorded</td></tr>
              ) : filtered.map((r: any) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-mono text-xs text-primary">{r.agentId ?? "—"}</td>
                  <td className="p-3">{r.violationType ?? "—"}</td>
                  <td className="p-3">
                    {r.severity === "high"
                      ? <Badge className="bg-red-500/10 text-red-400 border-red-500/30">High</Badge>
                      : r.severity === "medium"
                      ? <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">Medium</Badge>
                      : <Badge variant="outline">{r.severity ?? "Low"}</Badge>}
                  </td>
                  <td className="p-3 text-xs">{r.lat != null ? Number(r.lat).toFixed(4) : "—"}</td>
                  <td className="p-3 text-xs">{r.lng != null ? Number(r.lng).toFixed(4) : "—"}</td>
                  <td className="p-3">{r.distanceMeters ?? "—"}</td>
                  <td className="p-3">
                    {r.resolved
                      ? <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Yes</Badge>
                      : <Badge className="bg-red-500/10 text-red-400 border-red-500/30">No</Badge>}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {r.occurredAt ? new Date(r.occurredAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
