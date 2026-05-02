/**
 * Webhooks Management Page
 *
 * Manage webhook endpoints, view delivery logs, retry failed deliveries,
 * and rotate signing secrets.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Webhook,
  Plus,
  RefreshCw,
  Trash2,
  Play,
  Eye,
  RotateCcw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  MailX,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

type WebhookRow = {
  id: number;
  webhookId: string;
  name: string;
  endpoint: string;
  events: string[];
  secret: string;
  isActive: boolean;
  participantId: string | null;
  createdByName: string | null;
  lastDeliveryAt: number | null;
  lastDeliveryStatus: string | null;
  totalDeliveries: number;
  failureCount: number;
  createdAt: number;
  updatedAt: number;
};

type DeliveryRow = {
  id: number;
  deliveryId: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  status: "pending" | "success" | "failed" | "retrying" | "exhausted";
  attempts: number;
  maxAttempts: number;
  nextRetryAt: number | null;
  lastAttemptAt: number | null;
  responseCode: number | null;
  responseBody: string | null;
  responseTimeMs: number | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
};

const STATUS_COLORS: Record<string, string> = {
  success: "text-emerald-500 border-emerald-500",
  failed: "text-destructive border-destructive",
  retrying: "text-amber-500 border-amber-500",
  exhausted: "text-red-700 border-red-700",
  pending: "text-muted-foreground border-muted-foreground",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  success: <CheckCircle className="w-3.5 h-3.5" />,
  failed: <XCircle className="w-3.5 h-3.5" />,
  retrying: <RefreshCw className="w-3.5 h-3.5" />,
  exhausted: <AlertTriangle className="w-3.5 h-3.5" />,
  pending: <Clock className="w-3.5 h-3.5" />,
};

export default function Webhooks() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookRow | null>(null);
  const [deliveriesOpen, setDeliveriesOpen] = useState(false);
  const [expandedDelivery, setExpandedDelivery] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);

  // Create form state
  const [form, setForm] = useState({
    name: "",
    endpoint: "",
    events: [] as string[],
    participantId: "",
  });

  const utils = trpc.useUtils();

  const { data: webhooks, isLoading } = trpc.webhooks.list.useQuery(
    { includeInactive: showInactive },
    { refetchInterval: 15_000 }
  );

  const { data: eventTypes } = trpc.webhooks.getEventTypes.useQuery();

  const { data: deliveries, isLoading: deliveriesLoading } =
    trpc.webhooks.getDeliveries.useQuery(
      {
        webhookId: selectedWebhook?.webhookId,
        status:
          statusFilter === "all"
            ? undefined
            : (statusFilter as DeliveryRow["status"]),
        limit: 50,
      },
      {
        enabled: deliveriesOpen && !!selectedWebhook,
        refetchInterval: 10_000,
      }
    );

  const { data: stats } = trpc.webhooks.getStats.useQuery(
    { webhookId: selectedWebhook?.webhookId ?? "" },
    { enabled: deliveriesOpen && !!selectedWebhook }
  );

  const createMutation = trpc.webhooks.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Webhook created — secret: ${data.secret.slice(0, 16)}...`);
      setCreateOpen(false);
      setForm({ name: "", endpoint: "", events: [], participantId: "" });
      utils.webhooks.list.invalidate();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const deleteMutation = trpc.webhooks.delete.useMutation({
    onSuccess: () => {
      toast.success("Webhook deleted");
      utils.webhooks.list.invalidate();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const testMutation = trpc.webhooks.test.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Test delivery succeeded (${data.responseTimeMs}ms)`);
      } else {
        toast.error(`Test delivery failed: ${data.errorMessage}`);
      }
      utils.webhooks.getDeliveries.invalidate();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const retryMutation = trpc.webhooks.retryDelivery.useMutation({
    onSuccess: () => {
      toast.success("Delivery queued for retry");
      utils.webhooks.getDeliveries.invalidate();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const rotateMutation = trpc.webhooks.rotateSecret.useMutation({
    onSuccess: (data) => {
      toast.success(`Secret rotated — new secret: ${data.newSecret.slice(0, 16)}...`);
      utils.webhooks.list.invalidate();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const toggleEvent = (event: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(event)
        ? f.events.filter((e) => e !== event)
        : [...f.events, event],
    }));
  };

  const handleCreate = () => {
    if (!form.name || !form.endpoint || form.events.length === 0) {
      toast.error("Name, endpoint, and at least one event are required");
      return;
    }
    createMutation.mutate({
      name: form.name,
      endpoint: form.endpoint,
      events: form.events as Array<
        | "remittance.created"
        | "remittance.completed"
        | "remittance.failed"
        | "remittance.reversed"
        | "settlement.completed"
        | "fraud.alert"
        | "kill_switch.activated"
        | "kill_switch.deactivated"
        | "participant.suspended"
      >,
      participantId: form.participantId || undefined,
    });
  };

  const openDeliveries = (wh: WebhookRow) => {
    setSelectedWebhook(wh);
    setDeliveriesOpen(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied!"));
  };

  const allWebhooks = webhooks ?? [];
  const activeCount = allWebhooks.filter((w: WebhookRow) => w.isActive).length;
  const totalDeliveries = allWebhooks.reduce(
    (sum: number, w: WebhookRow) => sum + w.totalDeliveries,
    0
  );
  const totalFailures = allWebhooks.reduce(
    (sum: number, w: WebhookRow) => sum + w.failureCount,
    0
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Webhook className="w-6 h-6 text-primary" />
            Webhook Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage webhook endpoints, view delivery logs, and retry failed deliveries.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Webhook
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active Endpoints</p>
            <p className="text-2xl font-bold text-foreground mt-1">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Deliveries</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {totalDeliveries.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Failures</p>
            <p className={cn("text-2xl font-bold mt-1", totalFailures > 0 ? "text-destructive" : "text-emerald-500")}>
              {totalFailures}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Success Rate</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {totalDeliveries > 0
                ? `${(((totalDeliveries - totalFailures) / totalDeliveries) * 100).toFixed(1)}%`
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox
            checked={showInactive}
            onCheckedChange={(v) => setShowInactive(!!v)}
          />
          Show inactive webhooks
        </label>
      </div>

      {/* Webhook list */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Webhook Endpoints ({allWebhooks.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Loading...</div>
          ) : allWebhooks.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              <Webhook className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No webhook endpoints configured.
            </div>
          ) : (
            <div className="space-y-3">
              {allWebhooks.map((wh: WebhookRow) => (
                <div
                  key={wh.webhookId}
                  className="border border-border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{wh.name}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            wh.isActive
                              ? "border-emerald-500 text-emerald-500"
                              : "border-muted-foreground text-muted-foreground"
                          )}
                        >
                          {wh.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-xs">
                          {wh.endpoint}
                        </p>
                        <button
                          onClick={() => copyToClipboard(wh.endpoint)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <a
                          href={wh.endpoint}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() =>
                          testMutation.mutate({ webhookId: wh.webhookId })
                        }
                        disabled={testMutation.isPending}
                      >
                        <Play className="w-3 h-3" />
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => openDeliveries(wh)}
                      >
                        <Eye className="w-3 h-3" />
                        Logs
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() =>
                          rotateMutation.mutate({ webhookId: wh.webhookId })
                        }
                        disabled={rotateMutation.isPending}
                      >
                        <RotateCcw className="w-3 h-3" />
                        Rotate
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() =>
                          deleteMutation.mutate({ webhookId: wh.webhookId })
                        }
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Events and stats */}
                  <div className="flex flex-wrap items-center gap-2">
                    {wh.events.map((event: string) => (
                      <Badge
                        key={event}
                        variant="secondary"
                        className="text-xs font-mono"
                      >
                        {event}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      {wh.totalDeliveries} deliveries
                    </span>
                    {wh.failureCount > 0 && (
                      <span className="text-destructive">
                        {wh.failureCount} failures
                      </span>
                    )}
                    {wh.lastDeliveryAt && (
                      <span>
                        Last:{" "}
                        <span
                          className={cn(
                            wh.lastDeliveryStatus === "success"
                              ? "text-emerald-500"
                              : "text-destructive"
                          )}
                        >
                          {wh.lastDeliveryStatus}
                        </span>{" "}
                        {new Date(wh.lastDeliveryAt).toLocaleString()}
                      </span>
                    )}
                    <span className="font-mono text-xs opacity-60">
                      {wh.webhookId}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dead Letter Queue ─────────────────────────────────────────── */}
      <DeadLetterQueue />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="w-5 h-5 text-primary" />
              Create Webhook Endpoint
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Production Notification Handler"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Endpoint URL</Label>
              <Input
                placeholder="https://your-service.com/webhooks/tourismpay"
                value={form.endpoint}
                onChange={(e) =>
                  setForm((f) => ({ ...f, endpoint: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Participant ID (optional)</Label>
              <Input
                placeholder="e.g. part_abc123"
                value={form.participantId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, participantId: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Events to subscribe</Label>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                {(eventTypes ?? []).map(
                  (et: { event: string; description: string }) => (
                    <label
                      key={et.event}
                      className="flex items-start gap-2 cursor-pointer"
                    >
                      <Checkbox
                        checked={form.events.includes(et.event)}
                        onCheckedChange={() => toggleEvent(et.event)}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-xs font-mono text-foreground">
                          {et.event}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {et.description}
                        </p>
                      </div>
                    </label>
                  )
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              A signing secret will be auto-generated. You can rotate it later.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery logs dialog */}
      <Dialog
        open={deliveriesOpen}
        onOpenChange={(v) => {
          setDeliveriesOpen(v);
          if (!v) setSelectedWebhook(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Delivery Logs — {selectedWebhook?.name}
            </DialogTitle>
          </DialogHeader>

          {/* Stats row */}
          {stats && (
            <div className="grid grid-cols-4 gap-3 py-2">
              {[
                { label: "Total", value: stats.total, color: "text-foreground" },
                {
                  label: "Success",
                  value: stats.succeeded,
                  color: "text-emerald-500",
                },
                {
                  label: "Failed",
                  value: stats.failed,
                  color: "text-destructive",
                },
                {
                  label: "Pending",
                  value: stats.pending,
                  color: "text-amber-500",
                },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <Label className="text-xs">Filter:</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="retrying">Retrying</SelectItem>
                <SelectItem value="exhausted">Exhausted</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Delivery list */}
          {deliveriesLoading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              Loading deliveries...
            </div>
          ) : !deliveries || deliveries.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No deliveries found.
            </div>
          ) : (
            <div className="space-y-2">
              {deliveries.map((d: DeliveryRow) => (
                <div
                  key={d.deliveryId}
                  className="border border-border rounded-lg overflow-hidden"
                >
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
                    onClick={() =>
                      setExpandedDelivery(
                        expandedDelivery === d.deliveryId ? null : d.deliveryId
                      )
                    }
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs flex items-center gap-1",
                          STATUS_COLORS[d.status]
                        )}
                      >
                        {STATUS_ICONS[d.status]}
                        {d.status}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">
                        {d.event}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        attempt {d.attempts}/{d.maxAttempts}
                      </span>
                      {d.responseCode && (
                        <span
                          className={cn(
                            "text-xs font-mono",
                            d.responseCode >= 200 && d.responseCode < 300
                              ? "text-emerald-500"
                              : "text-destructive"
                          )}
                        >
                          HTTP {d.responseCode}
                        </span>
                      )}
                      {d.responseTimeMs && (
                        <span className="text-xs text-muted-foreground">
                          {d.responseTimeMs}ms
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(d.createdAt).toLocaleString()}
                      </span>
                      {(d.status === "failed" || d.status === "exhausted") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            retryMutation.mutate({ deliveryId: d.deliveryId });
                          }}
                          disabled={retryMutation.isPending}
                        >
                          Retry
                        </Button>
                      )}
                      {expandedDelivery === d.deliveryId ? (
                        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {expandedDelivery === d.deliveryId && (
                    <div className="border-t border-border p-3 bg-muted/20 space-y-2">
                      {d.errorMessage && (
                        <div>
                          <p className="text-xs font-semibold text-destructive mb-1">
                            Error
                          </p>
                          <p className="text-xs font-mono text-destructive bg-destructive/10 p-2 rounded">
                            {d.errorMessage}
                          </p>
                        </div>
                      )}
                      {d.responseBody && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">
                            Response Body
                          </p>
                          <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto max-h-32">
                            {d.responseBody}
                          </pre>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">
                          Payload
                        </p>
                        <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto max-h-32">
                          {JSON.stringify(d.payload, null, 2)}
                        </pre>
                      </div>
                      {d.nextRetryAt && d.status === "retrying" && (
                        <p className="text-xs text-amber-500">
                          Next retry at {new Date(d.nextRetryAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Dead Letter Queue Component ───────────────────────────────────────────────

function DeadLetterQueue() {
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const PAGE_SIZE = 20;
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.webhooks.getExhaustedDeliveries.useQuery(
    {
      event: eventFilter === "all" ? undefined : eventFilter,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    { refetchInterval: 30_000 }
  );

   const requeueMutation = trpc.webhooks.requeueDelivery.useMutation({
    onSuccess: () => {
      toast.success("Delivery re-queued for immediate retry");
      utils.webhooks.getExhaustedDeliveries.invalidate();
      utils.webhooks.getDeliveries.invalidate();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });
  const bulkRequeueMutation = trpc.webhooks.bulkRequeue.useMutation({
    onSuccess: (result) => {
      const msg = result.skipped > 0
        ? `Re-queued ${result.requeued} deliveries (${result.skipped} skipped — wrong status)`
        : `Re-queued ${result.requeued} deliveries`;
      toast.success(msg);
      setSelectedIds(new Set());
      utils.webhooks.getExhaustedDeliveries.invalidate();
      utils.webhooks.getDeliveries.invalidate();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const allPageSelected = items.length > 0 && items.every((d: DeliveryRow) => selectedIds.has(d.deliveryId));
  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        items.forEach((d: DeliveryRow) => next.delete(d.deliveryId));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        items.forEach((d: DeliveryRow) => next.add(d.deliveryId));
        return next;
      });
    }
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  // Derive unique event types from loaded items for the filter dropdown
  const eventTypes = useMemo(() => {
    const seen = new Set<string>();
    items.forEach((d: DeliveryRow) => seen.add(d.event));
    return Array.from(seen).sort();
  }, [items]);

  if (!isLoading && total === 0 && eventFilter === "all") {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MailX className="w-4 h-4 text-muted-foreground" />
            Dead Letter Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground py-6 text-center">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60" />
            No exhausted deliveries — all webhooks are delivering successfully.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MailX className="w-4 h-4 text-destructive" />
            Dead Letter Queue
            {total > 0 && (
              <Badge variant="destructive" className="text-xs ml-1">
                {total}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={eventFilter} onValueChange={(v) => { setEventFilter(v); setPage(0); }}>
              <SelectTrigger className="h-7 text-xs w-44">
                <SelectValue placeholder="Filter by event" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                {eventTypes.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => refetch()}>
              <RefreshCw className="w-3 h-3" />
              Refresh
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Deliveries that have exhausted all retry attempts. Re-queue to attempt delivery again.
        </p>
      </CardHeader>
      <CardContent>
        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            <span className="text-xs text-amber-800 font-medium">
              {selectedIds.size} delivery{selectedIds.size !== 1 ? 'ies' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1 border-amber-500 text-amber-700 hover:bg-amber-100"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear selection
              </Button>
              <Button
                size="sm"
                className="h-6 text-xs gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => bulkRequeueMutation.mutate({ deliveryIds: Array.from(selectedIds) })}
                disabled={bulkRequeueMutation.isPending}
              >
                <Send className="w-3 h-3" />
                Re-queue {selectedIds.size} selected
              </Button>
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-4 text-center">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            No exhausted deliveries match the current filter.
          </div>
        ) : (
          <div className="space-y-2">
            {/* Select-all row */}
            <div className="flex items-center gap-2 px-1 pb-1 border-b border-border">
              <Checkbox
                checked={allPageSelected}
                onCheckedChange={toggleSelectAll}
                aria-label="Select all on this page"
              />
              <span className="text-xs text-muted-foreground">
                Select all on this page ({items.length})
              </span>
            </div>
            {items.map((d: DeliveryRow) => (
              <div key={d.deliveryId} className="border border-border rounded-lg overflow-hidden">
                {/* Row header */}
                <div
                  className="flex items-center justify-between gap-3 p-3 cursor-pointer hover:bg-muted/30"
                  onClick={() => setExpanded(expanded === d.deliveryId ? null : d.deliveryId)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Checkbox
                      checked={selectedIds.has(d.deliveryId)}
                      onCheckedChange={() => toggleSelect(d.deliveryId)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select delivery ${d.deliveryId}`}
                      className="shrink-0"
                    />
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                    <Badge variant="secondary" className="text-xs font-mono shrink-0">
                      {d.event}
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground truncate">
                      {d.webhookId}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {d.attempts}/{d.maxAttempts} attempts
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(d.updatedAt).toLocaleString()}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs gap-1 border-amber-500 text-amber-600 hover:bg-amber-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        requeueMutation.mutate({ deliveryId: d.deliveryId });
                      }}
                      disabled={requeueMutation.isPending}
                    >
                      <Send className="w-3 h-3" />
                      Re-queue
                    </Button>
                    {expanded === d.deliveryId ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded === d.deliveryId && (
                  <div className="border-t border-border p-3 bg-muted/20 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground mb-0.5">Delivery ID</p>
                        <p className="font-mono">{d.deliveryId}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Response Code</p>
                        <p className={cn("font-mono", d.responseCode && d.responseCode >= 400 ? "text-destructive" : "")}>
                          {d.responseCode ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Response Time</p>
                        <p className="font-mono">{d.responseTimeMs != null ? `${d.responseTimeMs}ms` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Created</p>
                        <p className="font-mono">{new Date(d.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                    {d.errorMessage && (
                      <div>
                        <p className="text-xs font-semibold text-destructive mb-1">Error</p>
                        <p className="text-xs font-mono text-destructive bg-destructive/10 p-2 rounded">
                          {d.errorMessage}
                        </p>
                      </div>
                    )}
                    {d.responseBody && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Response Body</p>
                        <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto max-h-28">
                          {d.responseBody}
                        </pre>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Payload</p>
                      <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto max-h-28">
                        {JSON.stringify(d.payload, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
