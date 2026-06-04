import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react"; // Assuming lucide-react for icons
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ERPNextIntegration() {
  const { isAuthenticated } = useAuth();

  // tRPC query for ERPNext status
  const { data: erpnextStatus, isLoading: isLoadingStatus, isError: isErrorStatus, error: statusError, refetch: refetchStatus } = trpc.erpnext.status.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // tRPC mutation for ERPNext sync
  const utils = trpc.useUtils();
  const { mutate: syncERPNext, isLoading: isSyncing, isError: isErrorSync, error: syncError } = trpc.erpnext.sync.useMutation({
    onSuccess: () => {
      toast.success("ERPNext synchronization initiated successfully!");
      utils.erpnext.status.invalidate(); // Invalidate status to refetch
    },
    onError: (err) => {
      toast.error(`Failed to sync ERPNext: ${err.message}`);
    },
  });

  const handleSync = () => {
    if (isAuthenticated) {
      syncERPNext();
    } else {
      toast.error("You must be authenticated to perform this action.");
    }
  };

  // Demo data for ERPNext status

  const currentStatus = erpnextStatus;
  const currentIsLoading = isLoadingStatus;
  const currentIsError = isErrorStatus;
  const currentError = statusError;

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-lg text-red-500">Please log in to view ERPNext Integration status.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            ERPNext Integration Status
            <Button onClick={handleSync} disabled={isSyncing || currentIsLoading}>
              {isSyncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sync Now
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentIsLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="ml-2">Loading ERPNext status...</p>
            </div>
          ) : currentIsError ? (
            <div className="text-red-500">
              <p>Error loading status: {currentError?.message || "Unknown error"}</p>
              <Button onClick={() => refetchStatus()}>Retry</Button>
            </div>
          ) : (
            <div>
              <p className="mb-2">
                Last Sync:{" "}
                <Badge variant="secondary">
                  {currentStatus?.lastSync ? new Date(currentStatus.lastSync).toLocaleString() : "N/A"}
                </Badge>
              </p>
              <p className="mb-2">
                Status:{" "}
                <Badge variant={currentStatus?.status === "Synced" ? "default" : "destructive"}>
                  {currentStatus?.status || "Unknown"}
                </Badge>
              </p>
              <p className="mb-2">
                Records Synced:{" "}
                <Badge variant="outline">{currentStatus?.recordsSynced ?? "N/A"}</Badge>
              </p>
              <p className="mb-2">
                Pending Records:{" "}
                <Badge variant="outline">{currentStatus?.pendingRecords ?? "N/A"}</Badge>
              </p>
            </div>
          )}
          {isErrorSync && (
            <p className="text-red-500 mt-4">Synchronization Error: {syncError?.message || "Unknown error"}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
