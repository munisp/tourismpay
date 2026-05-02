/**
 * OfflinePaymentBanner
 * Shows a persistent banner when there are queued payments or the user is offline.
 * Listens for PAYMENT_REPLAYED messages from the service worker.
 */
import { useEffect } from "react";
import { WifiOff, Clock, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOfflinePaymentQueue } from "@/hooks/useOfflinePaymentQueue";
import { toast } from "sonner";

export function OfflinePaymentBanner() {
  const { isOnline, pendingCount, failedCount, isReplaying, replayQueue } =
    useOfflinePaymentQueue();

  // Listen for service worker PAYMENT_REPLAYED messages
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "PAYMENT_REPLAYED") {
        toast.success("Queued payment delivered", {
          description: `${event.data.amountUsd} ${event.data.currency} sent successfully.`,
          icon: <CheckCircle2 className="w-4 h-4 text-green-500" />,
        });
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);

  // Don't render if online and no queued payments
  if (isOnline && pendingCount === 0 && failedCount === 0) return null;

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium max-w-sm w-full mx-4 transition-all ${
        !isOnline
          ? "bg-amber-950 border-amber-700 text-amber-200"
          : failedCount > 0
          ? "bg-red-950 border-red-700 text-red-200"
          : "bg-blue-950 border-blue-700 text-blue-200"
      }`}
    >
      {!isOnline ? (
        <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
      ) : (
        <Clock className="w-4 h-4 shrink-0 text-blue-400" />
      )}

      <div className="flex-1 min-w-0">
        {!isOnline && pendingCount > 0 ? (
          <span>Offline — {pendingCount} payment{pendingCount > 1 ? "s" : ""} queued</span>
        ) : !isOnline ? (
          <span>You are offline</span>
        ) : pendingCount > 0 ? (
          <span>{pendingCount} payment{pendingCount > 1 ? "s" : ""} pending replay</span>
        ) : (
          <span>{failedCount} payment{failedCount > 1 ? "s" : ""} failed — tap to retry</span>
        )}
      </div>

      {isOnline && (pendingCount > 0 || failedCount > 0) && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs border-current bg-transparent hover:bg-white/10"
          onClick={replayQueue}
          disabled={isReplaying}
        >
          {isReplaying ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            "Retry"
          )}
        </Button>
      )}
    </div>
  );
}
