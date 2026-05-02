// @ts-nocheck
import { useState, useEffect } from "react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Bell, Plus, Trash2, TestTube, Mail, MessageSquare, CheckCircle2, XCircle, Moon, Clock } from "lucide-react";

interface NotificationChannelsProps {
  credentialId: number;
}

export default function NotificationChannels({ credentialId }: NotificationChannelsProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDNDDialog, setShowDNDDialog] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [dndDuration, setDndDuration] = useState<number>(60); // minutes
  const [dndStatuses, setDndStatuses] = useState<Record<number, any>>({});
  const [channelType, setChannelType] = useState<"slack" | "email">("slack");
  const [channelName, setChannelName] = useState("");
  const [template, setTemplate] = useState("");

  // Slack config
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [slackChannel, setSlackChannel] = useState("");
  const [slackUsername, setSlackUsername] = useState("Webhook Monitor");
  const [slackIconEmoji, setSlackIconEmoji] = useState(":warning:");

  // Email config
  const [emailTo, setEmailTo] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("Webhook Failure Alert");

  // Get channels list
  const { data: channels, refetch } = trpc.notificationChannels.list.useQuery({
    credentialId,
  });

  // Add channel mutation
  const addMutation = trpc.notificationChannels.add.useMutation({
    onSuccess: () => {
      toast.success("Notification channel added successfully!");
      setShowAddDialog(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to add channel: ${error.message}`);
    },
  });

  // Delete channel mutation
  const deleteMutation = trpc.notificationChannels.delete.useMutation({
    onSuccess: () => {
      toast.success("Channel deleted");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to delete channel: ${error.message}`);
    },
  });

  // Test channel mutation
  const testMutation = trpc.notificationChannels.test.useMutation({
    onSuccess: () => {
      toast.success("Test notification sent!");
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`);
    },
  });

  // Enable DND mutation
  const enableDNDMutation = trpc.notificationChannels.enableDND.useMutation({
    onSuccess: () => {
      toast.success("Do Not Disturb enabled");
      setShowDNDDialog(false);
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to enable DND: ${error.message}`);
    },
  });

  // Disable DND mutation
  const disableDNDMutation = trpc.notificationChannels.disableDND.useMutation({
    onSuccess: () => {
      toast.success("Do Not Disturb disabled");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to disable DND: ${error.message}`);
    },
  });

  const resetForm = () => {
    setChannelName("");
    setTemplate("");
    setSlackWebhookUrl("");
    setSlackChannel("");
    setSlackUsername("Webhook Monitor");
    setSlackIconEmoji(":warning:");
    setEmailTo("");
    setEmailFrom("");
    setEmailSubject("Webhook Failure Alert");
  };

  const handleAdd = async () => {
    if (!channelName.trim()) {
      toast.error("Please enter a channel name");
      return;
    }

    let config: any;
    if (channelType === "slack") {
      if (!slackWebhookUrl.trim()) {
        toast.error("Please enter Slack webhook URL");
        return;
      }
      config = {
        webhookUrl: slackWebhookUrl,
        channel: slackChannel || undefined,
        username: slackUsername || undefined,
        iconEmoji: slackIconEmoji || undefined,
      };
    } else {
      if (!emailTo.trim()) {
        toast.error("Please enter recipient email");
        return;
      }
      config = {
        to: emailTo,
        from: emailFrom || undefined,
        subject: emailSubject || undefined,
      };
    }

    await addMutation.mutateAsync({
      credentialId,
      channelType,
      channelName,
      config,
      template: template || undefined,
    });
  };

  const handleDelete = async (channelId: number) => {
    if (confirm("Are you sure you want to delete this notification channel?")) {
      await deleteMutation.mutateAsync({ channelId });
    }
  };

  const handleTest = async (channelId: number) => {
    await testMutation.mutateAsync({ channelId });
  };

  const handleEnableDND = async () => {
    if (!selectedChannelId) return;
    await enableDNDMutation.mutateAsync({
      channelId: selectedChannelId,
      durationMinutes: dndDuration > 0 ? dndDuration : undefined,
    });
  };

  const handleDisableDND = async (channelId: number) => {
    await disableDNDMutation.mutateAsync({ channelId });
  };

  // Fetch DND status for a channel
  const getDNDStatus = (channelId: number) => {
    return dndStatuses[channelId];
  };

  // Update DND statuses when channels change
  useEffect(() => {
    if (!channels) return;
    // For simplicity, we'll check DND status on-demand in the UI
    // In production, you might want to fetch all statuses upfront
  }, [channels]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Channels
              </CardTitle>
              <CardDescription>
                Configure Slack and email alerts for webhook failures
              </CardDescription>
            </div>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Channel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!channels || channels.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No notification channels configured</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Channel
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {channels.map((channel) => (
                <Card key={channel.id} className="border-2">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {channel.channelType === "slack" ? (
                            <MessageSquare className="h-5 w-5 text-purple-600" />
                          ) : (
                            <Mail className="h-5 w-5 text-blue-600" />
                          )}
                          <h4 className="font-semibold">{channel.channelName}</h4>
                          <Badge variant={channel.isActive ? "default" : "secondary"}>
                            {channel.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Badge variant="outline">{channel.channelType}</Badge>
                          {channel.dndEnabled === 1 && channel.dndUntil && new Date(channel.dndUntil) > new Date() && (
                            <Badge variant="outline" className="text-orange-600 border-orange-600">
                              <Moon className="h-3 w-3 mr-1" />
                              DND until {new Date(channel.dndUntil).toLocaleString()}
                            </Badge>
                          )}
                          {channel.dndEnabled === 1 && !channel.dndUntil && (
                            <Badge variant="outline" className="text-orange-600 border-orange-600">
                              <Moon className="h-3 w-3 mr-1" />
                              DND (indefinite)
                            </Badge>
                          )}
                        </div>

                        <div className="text-sm text-muted-foreground space-y-1">
                          {channel.channelType === "slack" && (
                            <>
                              <div>
                                <strong>Webhook URL:</strong> {channel.config.webhookUrl}
                              </div>
                              {channel.config.channel && (
                                <div>
                                  <strong>Channel:</strong> {channel.config.channel}
                                </div>
                              )}
                            </>
                          )}
                          {channel.channelType === "email" && (
                            <>
                              <div>
                                <strong>To:</strong> {channel.config.to}
                              </div>
                              {channel.config.subject && (
                                <div>
                                  <strong>Subject:</strong> {channel.config.subject}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 ml-4">
                        {channel.dndEnabled === 1 && channel.dndUntil && new Date(channel.dndUntil) > new Date() ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDisableDND(channel.id)}
                            disabled={disableDNDMutation.isPending}
                            className="text-orange-600"
                          >
                            <Moon className="h-4 w-4 mr-1" />
                            End DND
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedChannelId(channel.id);
                              setShowDNDDialog(true);
                            }}
                          >
                            <Moon className="h-4 w-4 mr-1" />
                            DND
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTest(channel.id)}
                          disabled={testMutation.isPending}
                        >
                          <TestTube className="h-4 w-4 mr-1" />
                          Test
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(channel.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Channel Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Notification Channel</DialogTitle>
            <DialogDescription>
              Configure a new channel to receive webhook failure alerts
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="channelType">Channel Type</Label>
              <Select
                value={channelType}
                onValueChange={(value: "slack" | "email") => setChannelType(value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slack">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Slack
                    </div>
                  </SelectItem>
                  <SelectItem value="email">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="channelName">Channel Name</Label>
              <Input
                id="channelName"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="e.g., Production Alerts"
                className="mt-1"
              />
            </div>

            {channelType === "slack" && (
              <>
                <div>
                  <Label htmlFor="slackWebhookUrl">Slack Webhook URL *</Label>
                  <Input
                    id="slackWebhookUrl"
                    type="url"
                    value={slackWebhookUrl}
                    onChange={(e) => setSlackWebhookUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/services/..."
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Get this from Slack's Incoming Webhooks integration
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="slackChannel">Channel (Optional)</Label>
                    <Input
                      id="slackChannel"
                      value={slackChannel}
                      onChange={(e) => setSlackChannel(e.target.value)}
                      placeholder="#alerts"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="slackUsername">Username</Label>
                    <Input
                      id="slackUsername"
                      value={slackUsername}
                      onChange={(e) => setSlackUsername(e.target.value)}
                      placeholder="Webhook Monitor"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="slackIconEmoji">Icon Emoji</Label>
                  <Input
                    id="slackIconEmoji"
                    value={slackIconEmoji}
                    onChange={(e) => setSlackIconEmoji(e.target.value)}
                    placeholder=":warning:"
                    className="mt-1"
                  />
                </div>
              </>
            )}

            {channelType === "email" && (
              <>
                <div>
                  <Label htmlFor="emailTo">Recipient Email *</Label>
                  <Input
                    id="emailTo"
                    type="email"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="alerts@example.com"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="emailFrom">From Email (Optional)</Label>
                  <Input
                    id="emailFrom"
                    type="email"
                    value={emailFrom}
                    onChange={(e) => setEmailFrom(e.target.value)}
                    placeholder="noreply@example.com"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="emailSubject">Subject</Label>
                  <Input
                    id="emailSubject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Webhook Failure Alert"
                    className="mt-1"
                  />
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    <strong>Note:</strong> Email notifications are currently logged to console.
                    For production use, configure SMTP or integrate with SendGrid/AWS SES.
                  </p>
                </div>
              </>
            )}

            <div>
              <Label htmlFor="template">Custom Template (Optional)</Label>
              <Textarea
                id="template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder='{"text": "{{message}}", "timestamp": "{{timestamp}}"}'
                className="mt-1 font-mono text-sm"
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use template variables like {"{"}
                {"{"}message{"}}"}
                {"}"}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending}>
              {addMutation.isPending ? "Adding..." : "Add Channel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DND Dialog */}
      <Dialog open={showDNDDialog} onOpenChange={setShowDNDDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable Do Not Disturb</DialogTitle>
            <DialogDescription>
              Temporarily mute notifications for this channel
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="dndDuration">Duration</Label>
              <Select
                value={dndDuration.toString()}
                onValueChange={(value) => setDndDuration(parseInt(value))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="240">4 hours</SelectItem>
                  <SelectItem value="480">8 hours</SelectItem>
                  <SelectItem value="1440">24 hours</SelectItem>
                  <SelectItem value="10080">7 days</SelectItem>
                  <SelectItem value="0">Until manually disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                {dndDuration > 0
                  ? `Notifications will be muted for ${dndDuration >= 1440 ? `${Math.floor(dndDuration / 1440)} day(s)` : `${Math.floor(dndDuration / 60)} hour(s)`}`
                  : "Notifications will be muted until you manually disable DND"}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDNDDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEnableDND} disabled={enableDNDMutation.isPending}>
              {enableDNDMutation.isPending ? "Enabling..." : "Enable DND"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
