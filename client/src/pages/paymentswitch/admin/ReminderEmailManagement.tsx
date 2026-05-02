// @ts-nocheck
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Mail, Send, Clock, CheckCircle, XCircle, AlertTriangle, Settings } from "lucide-react";
import { useLocation } from "wouter";

type Stage = "registration" | "technical" | "integration" | "testing" | "production";

export default function ReminderEmailManagement() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedStage, setSelectedStage] = useState<Stage>("registration");
  const [editingConfig, setEditingConfig] = useState(false);

  // Redirect if not admin
  if (!authLoading && user?.role !== "admin") {
    setLocation("/");
    return null;
  }

  // Queries
  const { data: configs, isLoading: configsLoading, refetch: refetchConfigs } = trpc.reminderEmails.getAllConfigs.useQuery();
  const { data: stuckParticipants, isLoading: stuckLoading, refetch: refetchStuck } = trpc.reminderEmails.getStuckParticipants.useQuery({});
  const { data: reminderLog, isLoading: logLoading } = trpc.reminderEmails.getReminderLog.useQuery({});

  // Mutations
  const updateConfig = trpc.reminderEmails.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuration updated successfully");
      refetchConfigs();
      setEditingConfig(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const sendManualReminder = trpc.reminderEmails.sendManualReminder.useMutation({
    onSuccess: (data) => {
      toast.success(`Reminder #${data.reminderNumber} sent successfully`);
      refetchStuck();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const processReminders = trpc.reminderEmails.processReminders.useMutation({
    onSuccess: (data) => {
      toast.success(`Processed ${data.totalProcessed} participants: ${data.sentCount} sent, ${data.failedCount} failed`);
      refetchStuck();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const initializeDefaults = trpc.reminderEmails.initializeDefaults.useMutation({
    onSuccess: () => {
      toast.success("Default configurations initialized");
      refetchConfigs();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const selectedConfig = configs?.find((c) => c.stage === selectedStage);

  const [formData, setFormData] = useState({
    enabled: selectedConfig?.enabled === 1,
    thresholdDays: selectedConfig?.thresholdDays || 7,
    reminderIntervalDays: selectedConfig?.reminderIntervalDays || 3,
    maxReminders: selectedConfig?.maxReminders || 3,
    emailSubject: selectedConfig?.emailSubject || "",
    emailTemplate: selectedConfig?.emailTemplate || "",
  });

  const handleSaveConfig = () => {
    updateConfig.mutate({
      stage: selectedStage,
      ...formData,
    });
  };

  if (authLoading || configsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Mail className="w-8 h-8 animate-pulse mx-auto mb-4" />
          <p>Loading reminder email management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Reminder Email Management</h1>
              <p className="text-gray-600 mt-1">Automated reminders for stuck participants</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => processReminders.mutate()} variant="outline">
                <Send className="w-4 h-4 mr-2" />
                Process Now
              </Button>
              <Button onClick={() => setLocation("/admin")} variant="outline">
                Back to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stuck Participants</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stuckParticipants?.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Need reminders</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reminders Sent (All Time)</CardTitle>
              <Mail className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reminderLog?.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Total emails</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Stages</CardTitle>
              <Settings className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {configs?.filter((c) => c.enabled === 1).length || 0}/5
              </div>
              <p className="text-xs text-muted-foreground mt-1">Enabled</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="stuck" className="space-y-6">
          <TabsList>
            <TabsTrigger value="stuck">Stuck Participants</TabsTrigger>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="log">Email Log</TabsTrigger>
          </TabsList>

          {/* Stuck Participants Tab */}
          <TabsContent value="stuck" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Participants Needing Reminders</CardTitle>
                <CardDescription>
                  Participants who are stuck in a stage and eligible for reminder emails
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stuckLoading ? (
                  <div className="text-center py-8">Loading...</div>
                ) : stuckParticipants && stuckParticipants.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Organization</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Days Inactive</TableHead>
                        <TableHead>Reminders Sent</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stuckParticipants.map((participant) => (
                        <TableRow key={participant.applicationId}>
                          <TableCell className="font-medium">
                            {participant.organizationName}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{participant.contactName}</div>
                              <div className="text-gray-500">{participant.contactEmail}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{participant.stage}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4 text-gray-400" />
                              {participant.daysSinceLastActivity} days
                            </div>
                          </TableCell>
                          <TableCell>{participant.remindersSent}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() =>
                                sendManualReminder.mutate({
                                  applicationId: participant.applicationId,
                                  stage: participant.stage,
                                })
                              }
                              disabled={sendManualReminder.isPending}
                            >
                              <Send className="w-4 h-4 mr-1" />
                              Send Reminder
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                    <p>No participants need reminders at this time</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Configuration Tab */}
          <TabsContent value="config" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Reminder Configuration</CardTitle>
                    <CardDescription>Configure automated reminder rules for each stage</CardDescription>
                  </div>
                  {!configs || configs.length === 0 ? (
                    <Button onClick={() => initializeDefaults.mutate()}>
                      Initialize Defaults
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Stage Selector */}
                  <div className="flex gap-2">
                    {(["registration", "technical", "integration", "testing", "production"] as Stage[]).map(
                      (stage) => (
                        <Button
                          key={stage}
                          variant={selectedStage === stage ? "default" : "outline"}
                          onClick={() => {
                            setSelectedStage(stage);
                            const config = configs?.find((c) => c.stage === stage);
                            if (config) {
                              setFormData({
                                enabled: config.enabled === 1,
                                thresholdDays: config.thresholdDays,
                                reminderIntervalDays: config.reminderIntervalDays,
                                maxReminders: config.maxReminders,
                                emailSubject: config.emailSubject,
                                emailTemplate: config.emailTemplate,
                              });
                            }
                          }}
                        >
                          {stage.charAt(0).toUpperCase() + stage.slice(1)}
                        </Button>
                      )
                    )}
                  </div>

                  {selectedConfig ? (
                    <div className="space-y-4 border-t pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="enabled">Enable Reminders</Label>
                          <p className="text-sm text-gray-500">
                            Automatically send reminders for this stage
                          </p>
                        </div>
                        <Switch
                          id="enabled"
                          checked={formData.enabled}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, enabled: checked })
                          }
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="thresholdDays">Threshold (Days)</Label>
                          <Input
                            id="thresholdDays"
                            type="number"
                            min="1"
                            max="90"
                            value={formData.thresholdDays}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                thresholdDays: parseInt(e.target.value),
                              })
                            }
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Days of inactivity before first reminder
                          </p>
                        </div>

                        <div>
                          <Label htmlFor="reminderIntervalDays">Interval (Days)</Label>
                          <Input
                            id="reminderIntervalDays"
                            type="number"
                            min="1"
                            max="30"
                            value={formData.reminderIntervalDays}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                reminderIntervalDays: parseInt(e.target.value),
                              })
                            }
                          />
                          <p className="text-xs text-gray-500 mt-1">Days between reminders</p>
                        </div>

                        <div>
                          <Label htmlFor="maxReminders">Max Reminders</Label>
                          <Input
                            id="maxReminders"
                            type="number"
                            min="1"
                            max="10"
                            value={formData.maxReminders}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                maxReminders: parseInt(e.target.value),
                              })
                            }
                          />
                          <p className="text-xs text-gray-500 mt-1">Maximum reminders per participant</p>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="emailSubject">Email Subject</Label>
                        <Input
                          id="emailSubject"
                          value={formData.emailSubject}
                          onChange={(e) =>
                            setFormData({ ...formData, emailSubject: e.target.value })
                          }
                          placeholder="Reminder: Complete your onboarding"
                        />
                      </div>

                      <div>
                        <Label htmlFor="emailTemplate">Email Template (HTML)</Label>
                        <Textarea
                          id="emailTemplate"
                          value={formData.emailTemplate}
                          onChange={(e) =>
                            setFormData({ ...formData, emailTemplate: e.target.value })
                          }
                          rows={10}
                          placeholder="<html><body>...</body></html>"
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Use {`{{organizationName}}`}, {`{{contactName}}`}, {`{{stage}}`}, {`{{reminderNumber}}`}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={handleSaveConfig} disabled={updateConfig.isPending}>
                          Save Configuration
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            const config = configs?.find((c) => c.stage === selectedStage);
                            if (config) {
                              setFormData({
                                enabled: config.enabled === 1,
                                thresholdDays: config.thresholdDays,
                                reminderIntervalDays: config.reminderIntervalDays,
                                maxReminders: config.maxReminders,
                                emailSubject: config.emailSubject,
                                emailTemplate: config.emailTemplate,
                              });
                            }
                          }}
                        >
                          Reset
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No configuration found for this stage. Click "Initialize Defaults" to create one.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Email Log Tab */}
          <TabsContent value="log" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Reminder Email Log</CardTitle>
                <CardDescription>History of all sent reminder emails</CardDescription>
              </CardHeader>
              <CardContent>
                {logLoading ? (
                  <div className="text-center py-8">Loading...</div>
                ) : reminderLog && reminderLog.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sent At</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Reminder #</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reminderLog.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>{new Date(log.sentAt).toLocaleString()}</TableCell>
                          <TableCell>{log.recipientEmail}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{log.stage}</Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{log.subject}</TableCell>
                          <TableCell>{log.reminderCount}</TableCell>
                          <TableCell>
                            {log.status === "sent" ? (
                              <Badge variant="default">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Sent
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <XCircle className="w-3 h-3 mr-1" />
                                Failed
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Mail className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No reminder emails have been sent yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
