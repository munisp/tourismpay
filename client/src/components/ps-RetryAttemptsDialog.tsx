// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Download } from "lucide-react";

interface RetryAttemptsDialogProps {
  deliveryLogId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RetryAttemptsDialog({
  deliveryLogId,
  open,
  onOpenChange,
}: RetryAttemptsDialogProps) {
  const { data: stats, isLoading } = trpc.apiKeyEnhancements.retryAttempts.getStats.useQuery(
    { deliveryLogId },
    { enabled: open }
  );

  const handleExport = () => {
    if (!stats) return;

    const json = JSON.stringify(stats.attempts, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `retry-attempts-${deliveryLogId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Retry Attempt Logs</DialogTitle>
          <DialogDescription>
            Detailed history of all retry attempts for this delivery
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}

        {stats && (
          <div className="space-y-6">
            {/* Statistics Summary */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-2xl font-bold">{stats.totalAttempts}</div>
                <div className="text-sm text-muted-foreground">Total Attempts</div>
              </div>
              <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats.successfulAttempts}
                </div>
                <div className="text-sm text-muted-foreground">Successful</div>
              </div>
              <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {stats.failedAttempts}
                </div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-2xl font-bold">{stats.avgDurationMs}ms</div>
                <div className="text-sm text-muted-foreground">Avg Duration</div>
              </div>
            </div>

            {/* Export Button */}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
            </div>

            {/* Attempt Timeline */}
            <div className="space-y-4">
              <h4 className="font-semibold">Attempt Timeline</h4>
              {stats.attempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className="border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {attempt.success ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <div>
                        <div className="font-medium">
                          Attempt #{attempt.attemptNumber}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {new Date(attempt.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {attempt.statusCode && (
                        <Badge variant={attempt.success ? "default" : "destructive"}>
                          {attempt.statusCode}
                        </Badge>
                      )}
                      {attempt.durationMs && (
                        <Badge variant="outline">{attempt.durationMs}ms</Badge>
                      )}
                    </div>
                  </div>

                  {attempt.errorMessage && (
                    <div className="bg-red-50 dark:bg-red-950 p-3 rounded">
                      <div className="text-sm font-medium text-red-900 dark:text-red-100">
                        Error
                      </div>
                      <div className="text-sm text-red-700 dark:text-red-300 mt-1">
                        {attempt.errorMessage}
                      </div>
                    </div>
                  )}

                  {attempt.responseBody && (
                    <details className="bg-muted p-3 rounded">
                      <summary className="text-sm font-medium cursor-pointer">
                        Response Body
                      </summary>
                      <pre className="text-xs mt-2 overflow-x-auto">
                        {attempt.responseBody}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
