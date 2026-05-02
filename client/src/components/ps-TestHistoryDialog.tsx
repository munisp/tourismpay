// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { TestComparisonDialog } from "./ps-TestComparisonDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Loader2, ChevronLeft, ChevronRight, GitCompare } from "lucide-react";

interface TestHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentialId: number;
}

export function TestHistoryDialog({ open, onOpenChange, credentialId }: TestHistoryDialogProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const [comparisonDialogOpen, setComparisonDialogOpen] = useState(false);
  const [selectedExecutionId, setSelectedExecutionId] = useState<number | undefined>();

  // Get test history
  const { data: historyData, isLoading } = trpc.testingCertification.getTestHistory.useQuery(
    {
      credentialId,
      status: statusFilter === "all" ? undefined : (statusFilter as any),
      limit: pageSize,
      offset: page * pageSize,
    },
    { enabled: open }
  );

  // Get history statistics
  const { data: stats } = trpc.testingCertification.getHistoryStats.useQuery(
    { credentialId },
    { enabled: open }
  );

  const totalPages = historyData ? Math.ceil(historyData.total / pageSize) : 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "passed":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-600" />;
      case "running":
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
      case "pending":
        return <Clock className="h-5 w-5 text-gray-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      passed: "default",
      failed: "destructive",
      running: "secondary",
      pending: "outline",
    };

    return (
      <Badge variant={variants[status] || "outline"} className="capitalize">
        {status}
      </Badge>
    );
  };

  const formatDuration = (startedAt: Date | null, completedAt: Date | null) => {
    if (!startedAt || !completedAt) return "N/A";
    const duration = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(2)}s`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Test Execution History</DialogTitle>
              <DialogDescription>
                View all past test executions and their results
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => setComparisonDialogOpen(true)}
              disabled={!historyData || historyData.executions.length < 2}
            >
              <GitCompare className="h-4 w-4 mr-2" />
              Compare Tests
            </Button>
          </div>
        </DialogHeader>

        {/* Statistics */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Runs</CardDescription>
                <CardTitle className="text-2xl">{stats.totalRuns}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Success Rate</CardDescription>
                <CardTitle className="text-2xl text-green-600">{stats.successRate}%</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Avg Duration</CardDescription>
                <CardTitle className="text-2xl">{(stats.avgDuration / 1000).toFixed(2)}s</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Recent (7d)</CardDescription>
                <CardTitle className="text-2xl">{stats.recentRuns}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="passed">Passed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Execution List */}
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : historyData && historyData.executions.length > 0 ? (
          <div className="space-y-3">
            {historyData.executions.map((execution) => (
              <Card key={execution.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      {getStatusIcon(execution.status)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{execution.scenarioName || "Unknown Test"}</h4>
                          {getStatusBadge(execution.status)}
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>
                            Executed: {new Date(execution.startedAt || execution.completedAt || "").toLocaleString()}
                          </p>
                          <p>
                            Duration: {formatDuration(execution.startedAt, execution.completedAt)}
                          </p>
                          {execution.errorMessage && (
                            <p className="text-red-600 mt-2">
                              Error: {execution.errorMessage}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No test executions found
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages} ({historyData?.total} total)
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
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Comparison Dialog */}
        <TestComparisonDialog
          open={comparisonDialogOpen}
          onOpenChange={setComparisonDialogOpen}
          credentialId={credentialId}
          initialExecutionId={selectedExecutionId}
        />
      </DialogContent>
    </Dialog>
  );
}
