// @ts-nocheck
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Server, Zap, Globe, Database } from "lucide-react";

function StatusBadge({ connected, label }: { connected: boolean; label?: string }) {
  return connected ? (
    <Badge className="bg-green-100 text-green-800 border-green-200">
      <CheckCircle2 className="w-3 h-3 mr-1" />
      {label ?? "Online"}
    </Badge>
  ) : (
    <Badge variant="destructive">
      <XCircle className="w-3 h-3 mr-1" />
      {label ?? "Offline"}
    </Badge>
  );
}

export default function ServiceStatus() {
  const { data, isLoading, refetch, isFetching } = trpc.paymentSwitch.serviceStatus.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Service Status</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live connectivity to TigerBeetle ledger, Mojaloop DFSP hub, and settlement service
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-32" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Settlement Service */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-500" />
                Settlement Service (Go)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <StatusBadge connected={data?.settlementService?.online ?? false} />
              </div>
              {data?.settlementService?.version && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Version</span>
                  <span className="text-sm font-mono">{data.settlementService.version}</span>
                </div>
              )}
              {data?.settlementService?.timestamp && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Last Checked</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(data.settlementService.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              )}
              {!data?.settlementService?.online && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded p-2">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  Set SETTLEMENT_SERVICE_URL env var to connect to the Go microservice
                </div>
              )}
            </CardContent>
          </Card>

          {/* TigerBeetle */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="w-4 h-4 text-purple-500" />
                TigerBeetle Ledger
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Connection</span>
                <StatusBadge connected={data?.tigerbeetle?.connected ?? false} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Cluster ID</span>
                <span className="text-sm font-mono">{data?.tigerbeetle?.clusterId ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Accounts</span>
                <span className="text-sm font-semibold">{(data?.tigerbeetle?.accountsCount ?? 0).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Transfers</span>
                <span className="text-sm font-semibold">{(data?.tigerbeetle?.transfersCount ?? 0).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          {/* Mojaloop */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-green-500" />
                Mojaloop DFSP Hub
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Connection</span>
                <StatusBadge connected={data?.mojaloop?.connected ?? false} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">DFSP ID</span>
                <span className="text-sm font-mono">{data?.mojaloop?.dfspId ?? "tourismpay"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Participants</span>
                <span className="text-sm font-semibold">{data?.mojaloop?.participantsCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active Transfers</span>
                <span className="text-sm font-semibold">{data?.mojaloop?.activeTransfers ?? 0}</span>
              </div>
            </CardContent>
          </Card>

          {/* Settlement */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-500" />
                Settlement Engine
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Window</span>
                <StatusBadge
                  connected={data?.settlement?.windowOpen ?? false}
                  label={data?.settlement?.windowOpen ? "Open" : "Closed"}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Pending Batches</span>
                <span className="text-sm font-semibold">{data?.settlement?.pendingBatches ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Pending Amount</span>
                <span className="text-sm font-semibold">
                  ${(data?.settlement?.pendingAmount ?? 0).toLocaleString()}
                </span>
              </div>
              {data?.settlement?.lastSettlementAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Last Settlement</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(data.settlement.lastSettlementAt).toLocaleString()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Infrastructure detail */}
      {data?.infrastructure && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Infrastructure Detail</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">TigerBeetle</p>
                <StatusBadge connected={data.infrastructure.tigerbeetle?.connected ?? false} />
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Mojaloop</p>
                <StatusBadge connected={data.infrastructure.mojaloop?.connected ?? false} />
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Database</p>
                <StatusBadge connected={data.infrastructure.database?.connected ?? true} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
