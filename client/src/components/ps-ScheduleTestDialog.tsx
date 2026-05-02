// @ts-nocheck
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface ScheduleTestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentialId: number;
  scenarioId: number;
  scenarioName: string;
}

export default function ScheduleTestDialog({
  open,
  onOpenChange,
  credentialId,
  scenarioId,
  scenarioName,
}: ScheduleTestDialogProps) {
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly" | "custom">("daily");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [scheduledDay, setScheduledDay] = useState(1);
  const [customIntervalHours, setCustomIntervalHours] = useState(24);
  const [notifyOnSuccess, setNotifyOnSuccess] = useState(true);
  const [notifyOnFailure, setNotifyOnFailure] = useState(true);

  const utils = trpc.useUtils();

  const createScheduleMutation = trpc.testingCertification.createSchedule.useMutation({
    onSuccess: () => {
      toast.success("Test schedule created successfully!");
      utils.testingCertification.listSchedules.invalidate();
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Failed to create schedule: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFrequency("daily");
    setScheduledTime("09:00");
    setScheduledDay(1);
    setCustomIntervalHours(24);
    setNotifyOnSuccess(true);
    setNotifyOnFailure(true);
  };

  const handleSubmit = () => {
    createScheduleMutation.mutate({
      credentialId,
      scenarioId,
      frequency,
      scheduledTime: frequency !== "custom" ? scheduledTime : undefined,
      scheduledDay: frequency === "weekly" || frequency === "monthly" ? scheduledDay : undefined,
      customIntervalHours: frequency === "custom" ? customIntervalHours : undefined,
      notifyOnSuccess,
      notifyOnFailure,
    });
  };

  const getDayName = (day: number) => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[day];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Schedule Automated Test</DialogTitle>
          <DialogDescription>
            Configure automated recurring test for: <strong>{scenarioName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Frequency */}
          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={(value: any) => setFrequency(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="custom">Custom Interval</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Time (for daily, weekly, monthly) */}
          {frequency !== "custom" && (
            <div className="space-y-2">
              <Label>Time (24-hour format)</Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>
          )}

          {/* Day of week (for weekly) */}
          {frequency === "weekly" && (
            <div className="space-y-2">
              <Label>Day of Week</Label>
              <Select value={String(scheduledDay)} onValueChange={(value) => setScheduledDay(Number(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                    <SelectItem key={day} value={String(day)}>
                      {getDayName(day)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Day of month (for monthly) */}
          {frequency === "monthly" && (
            <div className="space-y-2">
              <Label>Day of Month</Label>
              <Select value={String(scheduledDay)} onValueChange={(value) => setScheduledDay(Number(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <SelectItem key={day} value={String(day)}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Custom interval (for custom) */}
          {frequency === "custom" && (
            <div className="space-y-2">
              <Label>Interval (hours)</Label>
              <Input
                type="number"
                min="1"
                max="168"
                value={customIntervalHours}
                onChange={(e) => setCustomIntervalHours(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Test will run every {customIntervalHours} hour{customIntervalHours !== 1 ? "s" : ""}
              </p>
            </div>
          )}

          {/* Notification settings */}
          <div className="space-y-3 pt-2 border-t">
            <Label>Notifications</Label>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notify-success" className="text-sm font-normal">
                  Notify on success
                </Label>
                <p className="text-xs text-muted-foreground">
                  Send notification when test passes
                </p>
              </div>
              <Switch
                id="notify-success"
                checked={notifyOnSuccess}
                onCheckedChange={setNotifyOnSuccess}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notify-failure" className="text-sm font-normal">
                  Notify on failure
                </Label>
                <p className="text-xs text-muted-foreground">
                  Send notification when test fails
                </p>
              </div>
              <Switch
                id="notify-failure"
                checked={notifyOnFailure}
                onCheckedChange={setNotifyOnFailure}
              />
            </div>
          </div>

          {/* Schedule preview */}
          <div className="bg-muted p-3 rounded-lg text-sm">
            <strong>Schedule:</strong>{" "}
            {frequency === "daily" && `Every day at ${scheduledTime}`}
            {frequency === "weekly" && `Every ${getDayName(scheduledDay)} at ${scheduledTime}`}
            {frequency === "monthly" && `Day ${scheduledDay} of every month at ${scheduledTime}`}
            {frequency === "custom" && `Every ${customIntervalHours} hour${customIntervalHours !== 1 ? "s" : ""}`}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createScheduleMutation.isPending}>
            {createScheduleMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Schedule"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
