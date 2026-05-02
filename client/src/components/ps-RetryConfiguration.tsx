// @ts-nocheck
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Settings, RotateCw, Clock, TrendingUp } from "lucide-react";

interface RetryConfigurationProps {
  webhookId: number;
}

export default function RetryConfiguration({ webhookId }: RetryConfigurationProps) {
  const [maxRetries, setMaxRetries] = useState(5);
  const [retryBackoffMs, setRetryBackoffMs] = useState(60000);
  const [retriesEnabled, setRetriesEnabled] = useState(true);

  // Get current configuration
  const { data: config, refetch } = trpc.apiKeyEnhancements.retry.getConfig.useQuery({
    webhookId,
  });

  // Update configuration mutation
  const updateMutation = trpc.apiKeyEnhancements.retry.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("Retry configuration updated");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const pauseMutation = trpc.apiKeyEnhancements.retry.pause.useMutation({
    onSuccess: () => {
      toast.success("Automatic retries paused");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to pause: ${error.message}`);
    },
  });

  const resumeMutation = trpc.apiKeyEnhancements.retry.resume.useMutation({
    onSuccess: () => {
      toast.success("Automatic retries resumed");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to resume: ${error.message}`);
    },
  });

  // Load configuration when data is available
  useEffect(() => {
    if (config) {
      setMaxRetries(config.maxRetries);
      setRetryBackoffMs(config.retryBackoffMs);
      setRetriesEnabled(config.retriesEnabled);
    }
  }, [config]);

  const handleSave = async () => {
    await updateMutation.mutateAsync({
      webhookId,
      maxRetries,
      retryBackoffMs,
      retriesEnabled,
    });
  };

  // Calculate retry schedule for display
  const calculateRetrySchedule = () => {
    const schedule = [];
    for (let i = 1; i <= maxRetries; i++) {
      const backoffMs = Math.min(
        retryBackoffMs * Math.pow(2, i - 1),
        60 * 60 * 1000 // Max 1 hour
      );
      schedule.push({
        attempt: i,
        delay: backoffMs,
        delayFormatted: formatDuration(backoffMs),
      });
    }
    return schedule;
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const schedule = calculateRetrySchedule();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Retry Configuration
        </CardTitle>
        <CardDescription>
          Configure automatic retry behavior with exponential backoff
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Retries */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-0.5">
            <Label className="text-base">Automatic Retries</Label>
            <p className="text-sm text-muted-foreground">
              Automatically retry failed webhook deliveries
            </p>
          </div>
          <Switch
            checked={retriesEnabled}
            onCheckedChange={setRetriesEnabled}
          />
        </div>

        {/* Configuration Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="maxRetries">Maximum Retry Attempts</Label>
            <Input
              id="maxRetries"
              type="number"
              min={0}
              max={10}
              value={maxRetries}
              onChange={(e) => setMaxRetries(parseInt(e.target.value) || 0)}
              className="mt-1"
              disabled={!retriesEnabled}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Number of retry attempts before marking as permanently failed (0-10)
            </p>
          </div>

          <div>
            <Label htmlFor="retryBackoffMs">Base Backoff (milliseconds)</Label>
            <Input
              id="retryBackoffMs"
              type="number"
              min={10000}
              max={3600000}
              step={10000}
              value={retryBackoffMs}
              onChange={(e) => setRetryBackoffMs(parseInt(e.target.value) || 60000)}
              className="mt-1"
              disabled={!retriesEnabled}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Initial delay before first retry (10s - 1hr)
            </p>
          </div>
        </div>

        {/* Retry Schedule Preview */}
        {retriesEnabled && maxRetries > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4" />
              Retry Schedule Preview
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {schedule.map((item) => (
                <div
                  key={item.attempt}
                  className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    <RotateCw className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Attempt {item.attempt}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {item.delayFormatted}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <TrendingUp className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-900">
                <strong>Exponential Backoff:</strong> Each retry waits progressively longer
                (2^attempt × base delay), capped at 1 hour maximum.
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex gap-2">
            {retriesEnabled ? (
              <Button
                variant="outline"
                onClick={() => pauseMutation.mutate({ webhookId })}
                disabled={pauseMutation.isPending}
              >
                {pauseMutation.isPending ? "Pausing..." : "Pause Retries"}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => resumeMutation.mutate({ webhookId })}
                disabled={resumeMutation.isPending}
              >
                {resumeMutation.isPending ? "Resuming..." : "Resume Retries"}
              </Button>
            )}
          </div>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
