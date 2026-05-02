// @ts-nocheck
import { useState } from "react";
import RetryAttemptsDialog from "@/components/ps-RetryAttemptsDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  History,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  Download,
  ChevronLeft,
  ChevronRight,
  Eye,
  TrendingUp,
  TrendingDown,
  Activity,
} from "lucide-react";
import { format } from "date-fns";

interface WebhookEventHistoryProps {
  credentialId: number;
}

const STATUS_COLORS = {
  delivered: "bg-green-100 text-green-800 border-green-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
};

const STATUS_ICONS = {
  delivered: CheckCircle2,
  failed: XCircle,
  pending: Clock,
};

export default function WebhookEventHistory({ credentialId }: WebhookEventHistoryProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [selectedDeliveryForLogs, setSelectedDeliveryForLogs] = useState<number | null>(null);
  const pageSize = 20;

  // Get event history
  const { data: historyData, refetch } = trpc.apiKeyEnhancements.eventHistory.list.useQuery({
    credentialId,
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
    eventType: eventTypeFilter !== "all" ? eventTypeFilter : undefined,
    limit: pageSize,
    offset: page * pageSize,
  });

  // Get delivery stats
  const { data: stats } = trpc.apiKeyEnhancements.eventHistory.getStats.useQuery({
    credentialId,
  });

  // Get event details
  const { data: eventDetails } = trpc.apiKeyEnhancements.eventHistory.getDetails.useQuery(
    { eventId: selectedEvent! },
    { enabled: selectedEvent !== null }
  );

  // Retry mutation
  const retryMutation = trpc.apiKeyEnhancements.eventHistory.retry.useMutation({
    onSuccess: () => {
      toast.success("Delivery retry initiated");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to retry: ${error.message}`);
    },
  });

  // Export mutation
  const { refetch: exportData } = trpc.apiKeyEnhancements.eventHistory.export.useQuery(
    {
      status: statusFilter !== "all" ? (statusFilter as any) : undefined,
      eventType: eventTypeFilter !== "all" ? eventTypeFilter : undefined,
    },
    { enabled: false }
  );

  const handleRetry = async (eventId: number) => {
    await retryMutation.mutateAsync({ eventId });
  };

  const handleExport = async () => {
    const result = await exportData();
    if (result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `webhook-history-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Event history exported");
    }
  };

  const events = historyData?.events || [];
  const hasMore = historyData?.hasMore || false;

  return (
    <div className="space-y-6">
      {/* Statistics Dashboard */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Events</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Activity className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold">{stats.successRate.toFixed(1)}%</p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Failed</p>
                  <p className="text-2xl font-bold">{stats.failed}</p>
                </div>
                <TrendingDown className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg Duration</p>
                  <p className="text-2xl font-bold">{stats.averageDurationMs}ms</p>
                </div>
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Event History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Event History
              </CardTitle>
              <CardDescription>View detailed webhook delivery history and status</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Event Type</Label>
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="key.expiring">Key Expiring</SelectItem>
                  <SelectItem value="key.expired">Key Expired</SelectItem>
                  <SelectItem value="key.revoked">Key Revoked</SelectItem>
                  <SelectItem value="key.rotated">Key Rotated</SelectItem>
                  <SelectItem value="usage.threshold">Usage Threshold</SelectItem>
                  <SelectItem value="error.spike">Error Spike</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Event List */}
          {events.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No events found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => {
                const StatusIcon = STATUS_ICONS[event.status];
                return (
                  <Card key={event.id} className="hover:bg-muted/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3">
                            <Badge className={STATUS_COLORS[event.status]}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {event.status}
                            </Badge>
                            <span className="font-medium">{event.event}</span>
                            {event.statusCode && (
                              <Badge variant="outline">HTTP {event.statusCode}</Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                            <div>
                              <span className="font-medium">Created:</span>{" "}
                              {format(new Date(event.createdAt), "PPp")}
                            </div>
                            <div>
                              <span className="font-medium">Attempts:</span> {event.attempts}
                            </div>
                            {event.deliveryDurationMs && (
                              <div>
                                <span className="font-medium">Duration:</span>{" "}
                                {event.deliveryDurationMs}ms
                              </div>
                            )}
                            {event.lastAttemptAt && (
                              <div>
                                <span className="font-medium">Last Attempt:</span>{" "}
                                {format(new Date(event.lastAttemptAt), "PPp")}
                              </div>
                            )}
                            {event.nextRetryAt && event.status === "pending" && (
                              <div className="col-span-2 text-blue-600">
                                <span className="font-medium">Next Retry:</span>{" "}
                                {format(new Date(event.nextRetryAt), "PPp")}
                              </div>
                            )}
                          </div>

                          {event.errorMessage && (
                            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                              <strong>Error:</strong> {event.errorMessage}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedDeliveryForLogs(event.id)}
                          >
                            View Logs
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedEvent(event.id)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Details
                          </Button>
                          {event.status === "failed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRetry(event.id)}
                              disabled={retryMutation.isPending}
                            >
                              <RotateCw className="h-4 w-4 mr-1" />
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {events.length > 0 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {page * pageSize + 1} - {page * pageSize + events.length} of{" "}
                {historyData?.total || 0}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasMore}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Details Dialog */}
      <Dialog open={selectedEvent !== null} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Event Details</DialogTitle>
            <DialogDescription>Detailed information about the webhook delivery</DialogDescription>
          </DialogHeader>

          {eventDetails && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Event Type</Label>
                  <p className="text-sm font-medium mt-1">{eventDetails.event}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <Badge className={`mt-1 ${STATUS_COLORS[eventDetails.status]}`}>
                    {eventDetails.status}
                  </Badge>
                </div>
                <div>
                  <Label>Status Code</Label>
                  <p className="text-sm font-medium mt-1">
                    {eventDetails.statusCode || "N/A"}
                  </p>
                </div>
                <div>
                  <Label>Delivery Duration</Label>
                  <p className="text-sm font-medium mt-1">
                    {eventDetails.deliveryDurationMs
                      ? `${eventDetails.deliveryDurationMs}ms`
                      : "N/A"}
                  </p>
                </div>
              </div>

              <div>
                <Label>Payload</Label>
                <pre className="mt-2 p-4 bg-muted rounded-lg overflow-auto max-h-[200px] text-xs font-mono">
                  {JSON.stringify(eventDetails.payload, null, 2)}
                </pre>
              </div>

              {eventDetails.responseBody && (
                <div>
                  <Label>Response Body</Label>
                  <pre className="mt-2 p-4 bg-muted rounded-lg overflow-auto max-h-[200px] text-xs font-mono">
                    {eventDetails.responseBody}
                  </pre>
                </div>
              )}

              {eventDetails.errorMessage && (
                <div>
                  <Label>Error Message</Label>
                  <div className="mt-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                    {eventDetails.errorMessage}
                  </div>
                </div>
              )}

              {eventDetails.eventData && (
                <div>
                  <Label>Event Data</Label>
                  <pre className="mt-2 p-4 bg-muted rounded-lg overflow-auto max-h-[200px] text-xs font-mono">
                    {JSON.stringify(eventDetails.eventData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}        </DialogContent>
      </Dialog>

      {/* Retry Attempts Dialog */}
      {selectedDeliveryForLogs && (
        <RetryAttemptsDialog
          deliveryLogId={selectedDeliveryForLogs}
          open={selectedDeliveryForLogs !== null}
          onOpenChange={(open) => !open && setSelectedDeliveryForLogs(null)}
        />
      )}
    </div>
  );
}
