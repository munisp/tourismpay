// @ts-nocheck
/**
 * Admin Dashboard for OCR Correction Patterns
 * Allows admins to view, manage, and generate correction patterns
 */

import { useState, useEffect as React_useEffect } from 'react';
import * as React from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Loader2, RefreshCw, Plus, Trash2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function CorrectionPatternsAdmin() {
  const [statusFilter, setStatusFilter] = useState<'active' | 'pending' | 'disabled' | undefined>();
  const [fieldNameFilter, setFieldNameFilter] = useState<string>('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newPattern, setNewPattern] = useState({
    fieldName: '',
    incorrectPattern: '',
    correctPattern: '',
    patternType: 'exact' as 'exact' | 'regex' | 'fuzzy',
  });
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settings, setSettings] = useState({
    globalMinConfidence: 80,
    suggestionThreshold: 50,
    autoApplyEnabled: true,
  });

  const utils = trpc.useUtils();

  // Queries
  const { data: stats, isLoading: statsLoading } = trpc.ocrCorrection.getStats.useQuery();
  const { data: currentSettings } = trpc.ocrCorrection.getSettings.useQuery();
  const { data: patterns, isLoading: patternsLoading } = trpc.ocrCorrection.listPatterns.useQuery({
    status: statusFilter,
    fieldName: fieldNameFilter || undefined,
  });

  // Mutations
  const generatePatternsMutation = trpc.ocrCorrection.generatePatterns.useMutation({
    onSuccess: (data) => {
      toast.success(`Generated ${data.patternsCreated} new correction patterns`);
      utils.ocrCorrection.listPatterns.invalidate();
      utils.ocrCorrection.getStats.invalidate();
    },
    onError: () => {
      toast.error('Failed to generate patterns');
    },
  });

  const createPatternMutation = trpc.ocrCorrection.createPattern.useMutation({
    onSuccess: () => {
      toast.success('Pattern created successfully');
      setShowCreateDialog(false);
      setNewPattern({
        fieldName: '',
        incorrectPattern: '',
        correctPattern: '',
        patternType: 'exact',
      });
      utils.ocrCorrection.listPatterns.invalidate();
      utils.ocrCorrection.getStats.invalidate();
    },
    onError: () => {
      toast.error('Failed to create pattern');
    },
  });

  const updateStatusMutation = trpc.ocrCorrection.updatePatternStatus.useMutation({
    onSuccess: () => {
      toast.success('Pattern status updated');
      utils.ocrCorrection.listPatterns.invalidate();
      utils.ocrCorrection.getStats.invalidate();
    },
    onError: () => {
      toast.error('Failed to update pattern status');
    },
  });

  const deletePatternMutation = trpc.ocrCorrection.deletePattern.useMutation({
    onSuccess: () => {
      toast.success('Pattern deleted');
      utils.ocrCorrection.listPatterns.invalidate();
      utils.ocrCorrection.getStats.invalidate();
    },
    onError: () => {
      toast.error('Failed to delete pattern');
    },
  });

  const updateSettingsMutation = trpc.ocrCorrection.updateSettings.useMutation({
    onSuccess: () => {
      toast.success('Settings updated successfully');
      setShowSettingsDialog(false);
      utils.ocrCorrection.getSettings.invalidate();
    },
    onError: () => {
      toast.error('Failed to update settings');
    },
  });

  // Load current settings when dialog opens
  React.useEffect(() => {
    if (currentSettings && showSettingsDialog) {
      setSettings(currentSettings);
    }
  }, [currentSettings, showSettingsDialog]);

  const handleGeneratePatterns = () => {
    generatePatternsMutation.mutate({ minOccurrences: 3 });
  };

  const handleCreatePattern = () => {
    if (!newPattern.fieldName || !newPattern.incorrectPattern || !newPattern.correctPattern) {
      toast.error('Please fill in all required fields');
      return;
    }
    createPatternMutation.mutate(newPattern);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
      case 'pending':
        return <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'disabled':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Disabled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getSuccessRate = (pattern: any) => {
    const total = pattern.successCount + pattern.failureCount;
    if (total === 0) return 'N/A';
    return `${Math.round((pattern.successCount / total) * 100)}%`;
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">OCR Correction Patterns</h1>
          <p className="text-muted-foreground">Manage auto-correction patterns learned from user feedback</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowSettingsDialog(true)}
          >
            Settings
          </Button>
          <Button
            onClick={handleGeneratePatterns}
            disabled={generatePatternsMutation.isPending}
          >
            {generatePatternsMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
            ) : (
              <><RefreshCw className="w-4 h-4 mr-2" />Generate from Feedback</>
            )}
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />Create Pattern
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Patterns</CardDescription>
            <CardTitle className="text-3xl">{statsLoading ? '...' : stats?.totalPatterns || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-3xl text-green-600">{statsLoading ? '...' : stats?.activePatterns || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{statsLoading ? '...' : stats?.pendingPatterns || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Corrections</CardDescription>
            <CardTitle className="text-3xl">{statsLoading ? '...' : stats?.totalCorrections || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Confidence</CardDescription>
            <CardTitle className="text-3xl">{statsLoading ? '...' : `${stats?.avgConfidence || 0}%`}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value === 'all' ? undefined : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label>Field Name</Label>
            <Input
              placeholder="Filter by field name..."
              value={fieldNameFilter}
              onChange={(e) => setFieldNameFilter(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Patterns Table */}
      <Card>
        <CardHeader>
          <CardTitle>Correction Patterns</CardTitle>
          <CardDescription>
            {patternsLoading ? 'Loading...' : `${patterns?.length || 0} patterns`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {patternsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field</TableHead>
                  <TableHead>Incorrect → Correct</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead>Feedback Count</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patterns?.map((pattern) => (
                  <TableRow key={pattern.id}>
                    <TableCell className="font-medium">{pattern.fieldName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="bg-red-50 text-red-700 px-2 py-1 rounded text-sm">
                          {pattern.incorrectPattern}
                        </code>
                        →
                        <code className="bg-green-50 text-green-700 px-2 py-1 rounded text-sm">
                          {pattern.correctPattern}
                        </code>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{pattern.patternType}</Badge>
                    </TableCell>
                    <TableCell>{pattern.confidence}%</TableCell>
                    <TableCell>{getSuccessRate(pattern)}</TableCell>
                    <TableCell>{pattern.feedbackCount}</TableCell>
                    <TableCell>{getStatusBadge(pattern.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {pattern.status !== 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatusMutation.mutate({ id: pattern.id, status: 'active' })}
                          >
                            Activate
                          </Button>
                        )}
                        {pattern.status === 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatusMutation.mutate({ id: pattern.id, status: 'disabled' })}
                          >
                            Disable
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deletePatternMutation.mutate({ id: pattern.id })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {patterns?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No correction patterns found. Generate patterns from feedback to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Pattern Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Correction Pattern</DialogTitle>
            <DialogDescription>
              Manually create a new correction pattern
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Field Name</Label>
              <Input
                value={newPattern.fieldName}
                onChange={(e) => setNewPattern({ ...newPattern, fieldName: e.target.value })}
                placeholder="e.g., organizationName"
              />
            </div>
            <div>
              <Label>Incorrect Pattern</Label>
              <Input
                value={newPattern.incorrectPattern}
                onChange={(e) => setNewPattern({ ...newPattern, incorrectPattern: e.target.value })}
                placeholder="What OCR extracts incorrectly"
              />
            </div>
            <div>
              <Label>Correct Pattern</Label>
              <Input
                value={newPattern.correctPattern}
                onChange={(e) => setNewPattern({ ...newPattern, correctPattern: e.target.value })}
                placeholder="What it should be"
              />
            </div>
            <div>
              <Label>Pattern Type</Label>
              <Select
                value={newPattern.patternType}
                onValueChange={(value: any) => setNewPattern({ ...newPattern, patternType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact">Exact Match</SelectItem>
                  <SelectItem value="regex">Regular Expression</SelectItem>
                  <SelectItem value="fuzzy">Fuzzy Match</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePattern} disabled={createPatternMutation.isPending}>
              {createPatternMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</>
              ) : (
                'Create Pattern'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Correction Settings</DialogTitle>
            <DialogDescription>
              Configure confidence thresholds for automatic correction application
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Auto-Apply Corrections</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically apply corrections above the minimum confidence threshold
                  </p>
                </div>
                <Switch
                  checked={settings.autoApplyEnabled}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, autoApplyEnabled: checked })
                  }
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Minimum Confidence for Auto-Apply</Label>
                  <span className="text-sm font-medium">{settings.globalMinConfidence}%</span>
                </div>
                <Slider
                  value={[settings.globalMinConfidence]}
                  onValueChange={([value]) =>
                    setSettings({ ...settings, globalMinConfidence: value })
                  }
                  min={0}
                  max={100}
                  step={5}
                  disabled={!settings.autoApplyEnabled}
                />
                <p className="text-xs text-muted-foreground">
                  Corrections with confidence above this threshold will be applied automatically
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Suggestion Threshold</Label>
                  <span className="text-sm font-medium">{settings.suggestionThreshold}%</span>
                </div>
                <Slider
                  value={[settings.suggestionThreshold]}
                  onValueChange={([value]) =>
                    setSettings({ ...settings, suggestionThreshold: value })
                  }
                  min={0}
                  max={settings.globalMinConfidence}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">
                  Corrections between this threshold and the minimum confidence will be shown as suggestions
                </p>
              </div>

              <div className="rounded-lg border p-4 bg-muted/50">
                <h4 className="text-sm font-medium mb-2">How it works:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• <strong>Above {settings.globalMinConfidence}%:</strong> {settings.autoApplyEnabled ? 'Auto-applied' : 'Shown as suggestion'}</li>
                  <li>• <strong>{settings.suggestionThreshold}% - {settings.globalMinConfidence}%:</strong> Shown as suggestion</li>
                  <li>• <strong>Below {settings.suggestionThreshold}%:</strong> Not shown</li>
                </ul>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateSettingsMutation.mutate(settings)}
              disabled={updateSettingsMutation.isPending}
            >
              {updateSettingsMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
              ) : (
                'Save Settings'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
