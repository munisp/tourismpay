// @ts-nocheck
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Webhook,
  Plus,
  Trash2,
  TestTube,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Code,
} from "lucide-react";
import { format } from "date-fns";
import PayloadTemplateEditor from "@/components/ps-PayloadTemplateEditor";
import RetryConfiguration from "@/components/ps-RetryConfiguration";

interface WebhookConfigurationProps {
  credentialId: number;
}

const AVAILABLE_EVENTS = [
  { value: "key.expiring", label: "Key Expiring (7 days before)" },
  { value: "key.expired", label: "Key Expired" },
  { value: "key.revoked", label: "Key Revoked" },
  { value: "key.rotated", label: "Key Rotated" },
  { value: "usage.threshold", label: "Usage Threshold Exceeded" },
  { value: "error.spike", label: "Error Rate Spike" },
];

export default function WebhookConfiguration({ credentialId }: WebhookConfigurationProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [finalFailureUrl, setFinalFailureUrl] = useState("");
  const [finalFailureTemplate, setFinalFailureTemplate] = useState("");
  const [autoPauseThreshold, setAutoPauseThreshold] = useState(10);
  const [showSecret, setShowSecret] = useState<number | null>(null);
  const [editingTemplateFor, setEditingTemplateFor] = useState<number | null>(null);

  // Get webhooks list
  const { data: webhooks = [], refetch } = trpc.apiKeyEnhancements.webhooks.list.useQuery({
    credentialId,
  });

  // Register webhook mutation
  const registerMutation = trpc.apiKeyEnhancements.webhooks.register.useMutation({
    onSuccess: () => {
      toast.success("Webhook registered successfully!");
      setShowAddDialog(false);
      setWebhookUrl("");
      setSelectedEvents([]);
      setFinalFailureUrl("");
      setFinalFailureTemplate("");
      setAutoPauseThreshold(10);
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to register webhook: ${error.message}`);
    },
  });

  // Delete webhook mutation
  const deleteMutation = trpc.apiKeyEnhancements.webhooks.delete.useMutation({
    onSuccess: () => {
      toast.success("Webhook deleted successfully!");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to delete webhook: ${error.message}`);
    },
  });

  // Test webhook mutation
  const testMutation = trpc.apiKeyEnhancements.webhooks.test.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Test webhook sent successfully!");
      } else {
        toast.error(`Test webhook failed: ${data.error}`);
      }
    },
    onError: (error) => {
      toast.error(`Failed to send test webhook: ${error.message}`);
    },
  });

  const handleEventToggle = (eventValue: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventValue)
        ? prev.filter((e) => e !== eventValue)
        : [...prev, eventValue]
    );
  };

  const handleRegister = async () => {
    if (!webhookUrl.trim()) {
      toast.error("Webhook URL is required");
      return;
    }
    if (selectedEvents.length === 0) {
      toast.error("Please select at least one event");
      return;
    }

    await registerMutation.mutateAsync({
      credentialId,
      webhookUrl,
      events: selectedEvents,
      finalFailureNotificationUrl: finalFailureUrl.trim() || undefined,
      consecutiveFailureThreshold: autoPauseThreshold,
    } as any);
  };

  const handleDelete = async (webhookId: number) => {
    if (confirm("Are you sure you want to delete this webhook?")) {
      await deleteMutation.mutateAsync({ webhookId });
    }
  };

  const handleTest = async (webhookId: number) => {
    await testMutation.mutateAsync({ webhookId });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Webhook Notifications</h3>
          <p className="text-sm text-muted-foreground">
            Receive real-time notifications for key lifecycle events
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Webhook
        </Button>
      </div>

      {/* Webhooks List */}
      {webhooks.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Webhook className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h4 className="font-medium mb-2">No Webhooks Configured</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Add a webhook to receive notifications about API key events
            </p>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Webhook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {webhooks.map((webhook) => (
            <Card key={webhook.id}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Webhook className="h-4 w-4" />
                        <code className="text-sm font-mono">{webhook.webhookUrl}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(webhook.webhookUrl, "Webhook URL")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {webhook.events.map((event) => (
                          <Badge key={event} variant="outline" className="text-xs">
                            {event}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={webhook.isActive ? "default" : "secondary"}>
                        {webhook.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t">
                    <span className="text-xs text-muted-foreground">
                      Created {format(new Date(webhook.createdAt), "PPp")}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingTemplateFor(webhook.id)}
                      >
                        <Code className="h-4 w-4 mr-1" />
                        Customize Payload
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTest(webhook.id)}
                        disabled={testMutation.isPending}
                      >
                        <TestTube className="h-4 w-4 mr-1" />
                        Test
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(webhook.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Retry Configuration */}
      {webhooks.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Retry Settings</h3>
          {webhooks.map((webhook) => (
            <div key={webhook.id}>
              <p className="text-sm text-muted-foreground mb-3">
                Configure retry behavior for <code className="text-xs">{webhook.webhookUrl}</code>
              </p>
              <RetryConfiguration webhookId={webhook.id} />
            </div>
          ))}
        </div>
      )}

      {/* Payload Template Editor */}
      {editingTemplateFor && (
        <div className="mt-6">
          <PayloadTemplateEditor
            webhookId={editingTemplateFor}
            initialTemplate={webhooks.find((w) => w.id === editingTemplateFor)?.payloadTemplate}
            onSave={() => {
              setEditingTemplateFor(null);
              refetch();
            }}
          />
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setEditingTemplateFor(null)}
          >
            Close Editor
          </Button>
        </div>
      )}

      {/* Add Webhook Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Webhook</DialogTitle>
            <DialogDescription>
              Configure a webhook endpoint to receive notifications about API key events
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="webhookUrl">Webhook URL *</Label>
              <Input
                id="webhookUrl"
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-domain.com/webhooks/api-key-events"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Your endpoint will receive POST requests with event data
              </p>
            </div>

            <div>
              <Label className="mb-3 block">Events to Subscribe *</Label>
              <div className="space-y-2 border rounded-lg p-4">
                {AVAILABLE_EVENTS.map((event) => (
                  <div key={event.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={event.value}
                      checked={selectedEvents.includes(event.value)}
                      onCheckedChange={() => handleEventToggle(event.value)}
                    />
                    <label
                      htmlFor={event.value}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {event.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="finalFailureUrl">Final Failure Notification URL (Optional)</Label>
              <Input
                id="finalFailureUrl"
                type="url"
                value={finalFailureUrl}
                onChange={(e) => setFinalFailureUrl(e.target.value)}
                placeholder="https://your-domain.com/webhooks/failures"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Receive notifications when webhook deliveries permanently fail after max retries
              </p>
            </div>

            <div>
              <Label htmlFor="autoPauseThreshold">Auto-Pause Threshold</Label>
              <Input
                id="autoPauseThreshold"
                type="number"
                min="1"
                max="100"
                value={autoPauseThreshold}
                onChange={(e) => setAutoPauseThreshold(parseInt(e.target.value) || 10)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Automatically pause retries after this many consecutive failures (default: 10)
              </p>
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h4 className="text-sm font-medium mb-2">Webhook Security</h4>
              <p className="text-xs text-muted-foreground">
                All webhook requests include an <code>X-Webhook-Signature</code> header with an
                HMAC-SHA256 signature. You'll receive a secret key after registration to verify
                the authenticity of requests.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRegister}
              disabled={registerMutation.isPending || !webhookUrl.trim() || selectedEvents.length === 0}
            >
              {registerMutation.isPending ? "Registering..." : "Register Webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
