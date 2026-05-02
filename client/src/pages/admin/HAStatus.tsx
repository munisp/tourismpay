import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  CheckCircle2,
  Clock,
  Database,
  GitBranch,
  Globe,
  Layers,
  RefreshCw,
  Server,
  Shield,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

function StatusBadge({ status }: { status: string }) {
  if (status === "online") {
    return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Online</Badge>;
  }
  return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">Configured</Badge>;
}

function MetricRow({ label, value }: { label: string; value: string | number | boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{String(value)}</span>
    </div>
  );
}

export default function HAStatus() {
  const [refetchKey, setRefetchKey] = useState(0);
  const { data, isLoading, refetch } = trpc.haConfig.overview.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const { data: kafka } = trpc.haConfig.kafka.useQuery();
  const { data: temporal } = trpc.haConfig.temporal.useQuery();
  const { data: redis } = trpc.haConfig.redis.useQuery();
  const { data: apisix } = trpc.haConfig.apisix.useQuery();
  const { data: tb } = trpc.haConfig.tigerBeetle.useQuery();

  const handleRefresh = () => {
    refetch();
    setRefetchKey(k => k + 1);
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-32 rounded-lg bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  const components = data?.components;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Infrastructure HA Status
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            High-availability configuration for all TourismPay infrastructure components
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {components && Object.entries(components).map(([key, comp]) => (
          <Card key={key} className="bg-card/50 border-border/50">
            <CardContent className="p-3 text-center">
              <StatusBadge status={comp.status} />
              <p className="text-xs font-medium mt-2 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Kafka */}
      {kafka && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-4 h-4 text-orange-400" />
              Apache Kafka — Event Streaming
              <StatusBadge status={components?.kafka?.status ?? "configured"} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">{components?.kafka?.description}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-orange-400">{kafka.brokerCount}</p>
                <p className="text-xs text-muted-foreground">Brokers</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-orange-400">{kafka.topicCount}</p>
                <p className="text-xs text-muted-foreground">Topics</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-orange-400">{kafka.consumerGroupCount}</p>
                <p className="text-xs text-muted-foreground">Consumer Groups</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-orange-400">{kafka.minReplicationFactor}x</p>
                <p className="text-xs text-muted-foreground">Replication</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <MetricRow label="Security Protocol" value={kafka.securityProtocol} />
                <MetricRow label="Idempotent Producer" value={kafka.idempotentProducer ? "Yes" : "No"} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Brokers</p>
                {kafka.brokers.map(b => (
                  <div key={b.id} className="text-xs font-mono text-muted-foreground">
                    {b.id}: {b.host}:{b.port} ({b.rack})
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Temporal */}
      {temporal && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4 text-blue-400" />
              Temporal — Workflow Orchestration
              <StatusBadge status={components?.temporal?.status ?? "configured"} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">{components?.temporal?.description}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{temporal.serverCount}</p>
                <p className="text-xs text-muted-foreground">Server Nodes</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{temporal.totalWorkers}</p>
                <p className="text-xs text-muted-foreground">Total Workers</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{temporal.workflowCount}</p>
                <p className="text-xs text-muted-foreground">Workflows</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{temporal.activityCount}</p>
                <p className="text-xs text-muted-foreground">Activities</p>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Task Queue</TableHead>
                  <TableHead>Max Timeout</TableHead>
                  <TableHead>Max Retries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {temporal.workflows.map(w => (
                  <TableRow key={w.name}>
                    <TableCell className="font-mono text-xs">{w.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{w.taskQueue}</TableCell>
                    <TableCell className="text-xs">{w.executionTimeout}</TableCell>
                    <TableCell className="text-xs">{w.maxAttempts}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Redis */}
      {redis && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="w-4 h-4 text-red-400" />
              Redis — Cache & Pub/Sub
              <StatusBadge status={components?.redis?.status ?? "configured"} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">{components?.redis?.description}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-400 capitalize">{redis.mode}</p>
                <p className="text-xs text-muted-foreground">Mode</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-400">{redis.nodeCount}</p>
                <p className="text-xs text-muted-foreground">Nodes</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-400">{redis.quorum ?? "N/A"}</p>
                <p className="text-xs text-muted-foreground">Quorum</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-400">{redis.maxConnections}</p>
                <p className="text-xs text-muted-foreground">Max Connections</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Cache Policies</p>
                {redis.cachePolicies.map(p => (
                  <div key={p.name} className="flex justify-between text-xs py-1 border-b border-border/30">
                    <span className="font-mono text-primary">{p.keyPrefix}</span>
                    <span className="text-muted-foreground">{p.name}</span>
                    <span>{p.ttlSeconds === 0 ? "no TTL" : `${p.ttlSeconds}s`}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Pub/Sub Channels</p>
                {redis.pubSubChannels.map(ch => (
                  <div key={ch} className="text-xs font-mono text-muted-foreground py-0.5">{ch}</div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* APISIX */}
      {apisix && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="w-4 h-4 text-purple-400" />
              APISIX — API Gateway
              <StatusBadge status={components?.apisix?.status ?? "configured"} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">{components?.apisix?.description}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-purple-400">{apisix.etcdNodes}</p>
                <p className="text-xs text-muted-foreground">etcd Nodes</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-purple-400">{apisix.upstreamCount}</p>
                <p className="text-xs text-muted-foreground">Upstreams</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-purple-400">{apisix.totalUpstreamNodes}</p>
                <p className="text-xs text-muted-foreground">Upstream Nodes</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-purple-400">{apisix.routeCount}</p>
                <p className="text-xs text-muted-foreground">Routes</p>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Upstream</TableHead>
                  <TableHead>Nodes</TableHead>
                  <TableHead>LB Algorithm</TableHead>
                  <TableHead>Circuit Breaker</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apisix.upstreams.map(u => (
                  <TableRow key={u.name}>
                    <TableCell className="font-mono text-xs">{u.name}</TableCell>
                    <TableCell className="text-xs">{u.nodeCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.lbAlgorithm}</TableCell>
                    <TableCell>
                      {u.circuitBreaker
                        ? <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">Enabled</Badge>
                        : <Badge className="bg-slate-500/20 text-slate-400 text-xs">Disabled</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* TigerBeetle */}
      {tb && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="w-4 h-4 text-yellow-400" />
              TigerBeetle — Double-Entry Ledger
              <StatusBadge status={components?.tigerBeetle?.status ?? "configured"} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">{components?.tigerBeetle?.description}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-yellow-400">{tb.replicaCount}</p>
                <p className="text-xs text-muted-foreground">Replicas</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-yellow-400">{tb.faultTolerance}</p>
                <p className="text-xs text-muted-foreground">Fault Tolerance</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-yellow-400">{tb.ledgerCount}</p>
                <p className="text-xs text-muted-foreground">Ledgers</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-yellow-400">{tb.cacheSizeGb}GB</p>
                <p className="text-xs text-muted-foreground">Cache/Replica</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <MetricRow label="Cluster ID" value={tb.clusterId} />
                <MetricRow label="Availability Zones" value={tb.zonesUsed.join(", ")} />
                <MetricRow label="Storage/Replica" value={`${tb.storageSizeGb}GB`} />
                <MetricRow label="Concurrency Max" value={tb.concurrencyMax} />
              </div>
              <div>
                <MetricRow label="Accounts Pre-allocated" value={tb.accountsPreallocated.toLocaleString()} />
                <MetricRow label="Transfers Pre-allocated" value={tb.transfersPreallocated.toLocaleString()} />
                <MetricRow label="Transfer Code Count" value={tb.transferCodeCount} />
                <MetricRow label="Live Status" value={tb.liveStatus?.connected ? "Connected" : "Simulated"} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center pb-4">
        Configuration data refreshes every 30 seconds. Live status requires deployed infrastructure.
        Last updated: {data ? new Date(data.timestamp).toLocaleTimeString() : "—"}
      </p>
    </div>
  );
}
