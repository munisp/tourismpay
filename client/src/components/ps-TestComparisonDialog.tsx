// @ts-nocheck
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, XCircle, Clock, Loader2, ArrowRight, AlertTriangle, Save, X, Plus } from "lucide-react";
import { toast } from "sonner";

interface TestComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentialId: number;
  initialExecutionId?: number;
}

export function TestComparisonDialog({
  open,
  onOpenChange,
  credentialId,
  initialExecutionId,
}: TestComparisonDialogProps) {
  const [executionId1, setExecutionId1] = useState<number | undefined>(initialExecutionId);
  const [executionId2, setExecutionId2] = useState<number | undefined>();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveNotes, setSaveNotes] = useState("");
  const [saveTags, setSaveTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Get test history for selection
  const { data: historyData } = trpc.testingCertification.getTestHistory.useQuery(
    {
      credentialId,
      limit: 100,
      offset: 0,
    },
    { enabled: open }
  );

  const utils = trpc.useUtils();

  // Get comparison data
  const { data: comparison, isLoading: comparing } = trpc.testingCertification.compareExecutions.useQuery(
    {
      executionId1: executionId1!,
      executionId2: executionId2!,
    },
    {
      enabled: !!executionId1 && !!executionId2,
    }
  );

  // Save comparison mutation
  const saveComparisonMutation = trpc.testingCertification.saveComparison.useMutation({
    onSuccess: () => {
      toast.success("Comparison saved successfully");
      setSaveDialogOpen(false);
      setSaveName("");
      setSaveNotes("");
      setSaveTags([]);
      setTagInput("");
      utils.testingCertification.getSavedComparisons.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save comparison");
    },
  });

  const handleSaveComparison = () => {
    if (!saveName.trim()) {
      toast.error("Please enter a name for this comparison");
      return;
    }
    if (!executionId1 || !executionId2) {
      toast.error("No comparison to save");
      return;
    }

    saveComparisonMutation.mutate({
      credentialId,
      name: saveName,
      notes: saveNotes || undefined,
      executionId1,
      executionId2,
      tags: saveTags.length > 0 ? saveTags : undefined,
    });
  };

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

  const formatDuration = (duration: number | null) => {
    if (!duration) return "N/A";
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(2)}s`;
  };

  const formatDurationDiff = (diff: number | null) => {
    if (!diff) return "";
    const sign = diff > 0 ? "+" : "";
    if (Math.abs(diff) < 1000) return `${sign}${diff}ms`;
    return `${sign}${(diff / 1000).toFixed(2)}s`;
  };

  const handleCompare = () => {
    if (!executionId1 || !executionId2) {
      toast.error("Please select two test runs to compare");
      return;
    }
    if (executionId1 === executionId2) {
      toast.error("Please select two different test runs");
      return;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Compare Test Runs</DialogTitle>
              <DialogDescription>
                Select two test executions to compare side-by-side
              </DialogDescription>
            </div>
            {comparison && (
              <Button
                variant="outline"
                onClick={() => setSaveDialogOpen(true)}
                disabled={saveComparisonMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Comparison
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Selection */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="text-sm font-medium mb-2 block">Test Run 1</label>
            <Select
              value={executionId1?.toString()}
              onValueChange={(val) => setExecutionId1(parseInt(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select first test run" />
              </SelectTrigger>
              <SelectContent>
                {historyData?.executions.map((exec) => (
                  <SelectItem key={exec.id} value={exec.id.toString()}>
                    {exec.scenarioName} - {new Date(exec.completedAt || exec.startedAt || "").toLocaleString()} ({exec.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Test Run 2</label>
            <Select
              value={executionId2?.toString()}
              onValueChange={(val) => setExecutionId2(parseInt(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select second test run" />
              </SelectTrigger>
              <SelectContent>
                {historyData?.executions.map((exec) => (
                  <SelectItem key={exec.id} value={exec.id.toString()}>
                    {exec.scenarioName} - {new Date(exec.completedAt || exec.startedAt || "").toLocaleString()} ({exec.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Comparison Results */}
        {comparing && (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {comparison && !comparing && (
          <div className="space-y-6">
            {/* Summary */}
            {(comparison.summary.statusChanged ||
              comparison.summary.durationChanged ||
              comparison.summary.resultChanged ||
              comparison.summary.errorChanged) && (
              <Card className="border-yellow-200 bg-yellow-50">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <CardTitle className="text-yellow-900">Differences Detected</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-yellow-800 space-y-1">
                    {comparison.summary.statusChanged && <p>• Status changed</p>}
                    {comparison.summary.durationChanged && <p>• Duration changed</p>}
                    {comparison.summary.resultChanged && <p>• Results changed</p>}
                    {comparison.summary.errorChanged && <p>• Error messages changed</p>}
                    {comparison.summary.scenarioChanged && <p>• Different test scenarios</p>}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Side-by-Side Comparison */}
            <div className="grid grid-cols-2 gap-6">
              {/* Test Run 1 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Test Run 1</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Scenario</p>
                    <p className="font-medium">{comparison.execution1.scenarioName || "Unknown"}</p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Status</p>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(comparison.execution1.status)}
                      {getStatusBadge(comparison.execution1.status)}
                      {comparison.differences.status && (
                        <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                          Changed
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Duration</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{formatDuration(comparison.execution1.duration)}</p>
                      {comparison.differences.duration && comparison.durationDiff && (
                        <Badge
                          variant="outline"
                          className={
                            comparison.durationDiff > 0
                              ? "text-red-600 border-red-600"
                              : "text-green-600 border-green-600"
                          }
                        >
                          {formatDurationDiff(comparison.durationDiff)}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Executed At</p>
                    <p className="font-medium">
                      {new Date(comparison.execution1.completedAt || comparison.execution1.startedAt || "").toLocaleString()}
                    </p>
                  </div>

                  {comparison.execution1.errorMessage && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Error</p>
                      <p className="text-sm text-red-600">{comparison.execution1.errorMessage}</p>
                    </div>
                  )}

                  {comparison.execution1.resultData && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Result</p>
                      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                        {JSON.stringify(comparison.execution1.resultData, null, 2)}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Test Run 2 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Test Run 2</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Scenario</p>
                    <p className="font-medium">{comparison.execution2.scenarioName || "Unknown"}</p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Status</p>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(comparison.execution2.status)}
                      {getStatusBadge(comparison.execution2.status)}
                      {comparison.differences.status && (
                        <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                          Changed
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Duration</p>
                    <p className="font-medium">{formatDuration(comparison.execution2.duration)}</p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Executed At</p>
                    <p className="font-medium">
                      {new Date(comparison.execution2.completedAt || comparison.execution2.startedAt || "").toLocaleString()}
                    </p>
                  </div>

                  {comparison.execution2.errorMessage && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Error</p>
                      <p className="text-sm text-red-600">{comparison.execution2.errorMessage}</p>
                    </div>
                  )}

                  {comparison.execution2.resultData && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Result</p>
                      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                        {JSON.stringify(comparison.execution2.resultData, null, 2)}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {!executionId1 || !executionId2 ? (
          <div className="text-center py-8 text-muted-foreground">
            Select two test runs to compare
          </div>
        ) : null}

        {/* Save Comparison Dialog */}
        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Comparison</DialogTitle>
              <DialogDescription>
                Save this comparison for future reference and team sharing
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g., Before vs After Performance Fix"
                  maxLength={255}
                />
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={saveNotes}
                  onChange={(e) => setSaveNotes(e.target.value)}
                  placeholder="Add any notes about this comparison..."
                  rows={4}
                />
              </div>

              <div>
                <Label htmlFor="tags">Tags</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    id="tags"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && tagInput.trim()) {
                        e.preventDefault();
                        if (!saveTags.includes(tagInput.trim())) {
                          setSaveTags([...saveTags, tagInput.trim()]);
                        }
                        setTagInput("");
                      }
                    }}
                    placeholder="Type a tag and press Enter"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (tagInput.trim() && !saveTags.includes(tagInput.trim())) {
                        setSaveTags([...saveTags, tagInput.trim()]);
                        setTagInput("");
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {saveTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {saveTags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-sm"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => setSaveTags(saveTags.filter((_, i) => i !== index))}
                          className="hover:text-primary/70"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveComparison}
                disabled={saveComparisonMutation.isPending}
              >
                {saveComparisonMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
