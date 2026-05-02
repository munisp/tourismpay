// @ts-nocheck
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Bell, Mail, Smartphone, RotateCcw } from "lucide-react";

interface NotificationTypeConfig {
  id: string;
  title: string;
  description: string;
}

const notificationTypes: NotificationTypeConfig[] = [
  {
    id: "technical_onboarding_submission",
    title: "Technical Onboarding Submissions",
    description: "New participant submissions requiring review",
  },
  {
    id: "application_approved",
    title: "Application Approvals",
    description: "When you approve a participant application",
  },
  {
    id: "application_rejected",
    title: "Application Rejections",
    description: "When you reject a participant application",
  },
];

export default function NotificationPreferences() {
  const utils = trpc.useUtils();

  // Get current preferences
  const { data: preferences, isLoading } = trpc.notification.getPreferences.useQuery();

  // Update preferences mutation
  const updateMutation = trpc.notification.updatePreferences.useMutation({
    onSuccess: () => {
      utils.notification.getPreferences.invalidate();
      toast.success("Preferences updated successfully");
    },
    onError: (error: any) => {
      toast.error(`Failed to update preferences: ${error.message}`);
    },
  });

  // Reset preferences mutation
  const resetMutation = trpc.notification.resetPreferences.useMutation({
    onSuccess: () => {
      utils.notification.getPreferences.invalidate();
      toast.success("Preferences reset to defaults");
    },
    onError: (error: any) => {
      toast.error(`Failed to reset preferences: ${error.message}`);
    },
  });

  const handleToggle = async (notificationType: string, channel: "email" | "inApp", value: boolean) => {
    const currentPrefs = preferences?.[notificationType] || { emailEnabled: true, inAppEnabled: true };
    
    await updateMutation.mutateAsync({
      notificationType,
      emailEnabled: channel === "email" ? value : currentPrefs.emailEnabled,
      inAppEnabled: channel === "inApp" ? value : currentPrefs.inAppEnabled,
    });
  };

  const handleResetAll = async () => {
    if (confirm("Are you sure you want to reset all notification preferences to defaults?")) {
      await resetMutation.mutateAsync();
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Notification Preferences</h1>
        <p className="text-muted-foreground">
          Customize how you receive notifications for different events
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Notification Channels</CardTitle>
              <CardDescription>
                Choose which channels you want to receive notifications through
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetAll}
              disabled={resetMutation.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-center pb-4">
            <div className="font-medium text-sm text-muted-foreground">Notification Type</div>
            <div className="flex items-center gap-2 w-32 justify-center">
              <Mail className="h-4 w-4" />
              <span className="font-medium text-sm text-muted-foreground">Email</span>
            </div>
            <div className="flex items-center gap-2 w-32 justify-center">
              <Smartphone className="h-4 w-4" />
              <span className="font-medium text-sm text-muted-foreground">In-App</span>
            </div>
          </div>

          <Separator />

          {/* Notification type rows */}
          {notificationTypes.map((type, index) => {
            const prefs = preferences?.[type.id] || { emailEnabled: true, inAppEnabled: true };

            return (
              <div key={type.id}>
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-center">
                  <div>
                    <Label className="text-base font-medium">{type.title}</Label>
                    <p className="text-sm text-muted-foreground mt-1">{type.description}</p>
                  </div>

                  {/* Email toggle */}
                  <div className="flex justify-center w-32">
                    <Switch
                      checked={prefs.emailEnabled}
                      onCheckedChange={(checked) => handleToggle(type.id, "email", checked)}
                      disabled={updateMutation.isPending}
                    />
                  </div>

                  {/* In-app toggle */}
                  <div className="flex justify-center w-32">
                    <Switch
                      checked={prefs.inAppEnabled}
                      onCheckedChange={(checked) => handleToggle(type.id, "inApp", checked)}
                      disabled={updateMutation.isPending}
                    />
                  </div>
                </div>
                {index < notificationTypes.length - 1 && <Separator className="mt-6" />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            About Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong>Email notifications</strong> are sent to the project owner's email address configured in the system settings.
          </p>
          <p>
            <strong>In-app notifications</strong> appear in the notification bell at the top of the page and can be viewed anytime.
          </p>
          <p>
            You can disable either or both channels for each notification type. If all admins disable a notification type, 
            no notifications will be sent for that event.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
