// @ts-nocheck
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Code, Eye, RotateCcw, CheckCircle2, XCircle, Sparkles } from "lucide-react";

interface PayloadTemplateEditorProps {
  webhookId: number;
  initialTemplate?: string | null;
  onSave?: () => void;
}

const EVENT_TYPES = [
  { value: "key.expiring", label: "Key Expiring" },
  { value: "key.expired", label: "Key Expired" },
  { value: "key.revoked", label: "Key Revoked" },
  { value: "key.rotated", label: "Key Rotated" },
  { value: "usage.threshold", label: "Usage Threshold" },
  { value: "error.spike", label: "Error Spike" },
];

export default function PayloadTemplateEditor({
  webhookId,
  initialTemplate,
  onSave,
}: PayloadTemplateEditorProps) {
  const [template, setTemplate] = useState(initialTemplate || "");
  const [selectedEvent, setSelectedEvent] = useState("key.expiring");
  const [previewData, setPreviewData] = useState<any>(null);

  // Get default template for selected event
  const { data: defaultTemplate } = trpc.apiKeyEnhancements.payloadTemplates.getDefault.useQuery({
    eventType: selectedEvent,
  });

  // Get available variables for selected event
  const { data: availableVariables = [] } =
    trpc.apiKeyEnhancements.payloadTemplates.getVariables.useQuery({
      eventType: selectedEvent,
    });

  // Validate template
  const { data: validation } = trpc.apiKeyEnhancements.payloadTemplates.validate.useQuery(
    { template },
    { enabled: template.length > 0 }
  );

  // Preview template
  const { data: preview, refetch: refetchPreview } =
    trpc.apiKeyEnhancements.payloadTemplates.preview.useQuery(
      {
        template,
        eventType: selectedEvent,
      },
      { enabled: false }
    );

  // Save template mutation
  const saveTemplateMutation = trpc.apiKeyEnhancements.payloadTemplates.set.useMutation({
    onSuccess: () => {
      toast.success("Payload template saved successfully!");
      onSave?.();
    },
    onError: (error) => {
      toast.error(`Failed to save template: ${error.message}`);
    },
  });

  // Reset to default mutation
  const resetMutation = trpc.apiKeyEnhancements.payloadTemplates.resetToDefault.useMutation({
    onSuccess: () => {
      toast.success("Reset to default template");
      setTemplate(defaultTemplate || "");
      onSave?.();
    },
    onError: (error) => {
      toast.error(`Failed to reset: ${error.message}`);
    },
  });

  // Initialize with default template if no initial template
  useEffect(() => {
    if (!initialTemplate && defaultTemplate) {
      setTemplate(defaultTemplate);
    }
  }, [defaultTemplate, initialTemplate]);

  // Update preview when it changes
  useEffect(() => {
    if (preview) {
      setPreviewData(preview);
    }
  }, [preview]);

  const handlePreview = async () => {
    await refetchPreview();
  };

  const handleSave = async () => {
    await saveTemplateMutation.mutateAsync({
      webhookId,
      template,
    });
  };

  const handleReset = async () => {
    await resetMutation.mutateAsync({ webhookId });
  };

  const handleLoadDefault = () => {
    if (defaultTemplate) {
      setTemplate(defaultTemplate);
    }
  };

  const insertVariable = (variable: string) => {
    const textarea = document.getElementById("template-editor") as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = template;
      const before = text.substring(0, start);
      const after = text.substring(end);
      const newText = before + `{{${variable}}}` + after;
      setTemplate(newText);
      
      // Set cursor position after inserted variable
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length + 4, start + variable.length + 4);
      }, 0);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          Payload Template Customization
        </CardTitle>
        <CardDescription>
          Customize the webhook payload format using variables and JSON templates
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Event Type Selector */}
        <div>
          <Label>Event Type (for preview)</Label>
          <Select value={selectedEvent} onValueChange={setSelectedEvent}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((event) => (
                <SelectItem key={event.value} value={event.value}>
                  {event.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="editor">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="editor">Template Editor</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className="space-y-4">
            {/* Available Variables */}
            <div>
              <Label className="mb-2 block">Available Variables</Label>
              <div className="flex flex-wrap gap-2">
                {availableVariables.map((variable) => (
                  <Badge
                    key={variable}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => insertVariable(variable)}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    {`{{${variable}}}`}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Click a variable to insert it at cursor position
              </p>
            </div>

            {/* Template Editor */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="template-editor">JSON Template</Label>
                <Button variant="ghost" size="sm" onClick={handleLoadDefault}>
                  Load Default
                </Button>
              </div>
              <Textarea
                id="template-editor"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder="Enter your JSON template with variables..."
                className="font-mono text-sm min-h-[300px]"
              />
            </div>

            {/* Validation Status */}
            {validation && (
              <div className="flex items-start gap-2">
                {validation.valid ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-600">Template is valid</p>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-600">Template has errors:</p>
                      <ul className="text-xs text-red-600 list-disc list-inside mt-1">
                        {validation.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button onClick={handlePreview} variant="outline">
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
              <Button
                onClick={handleSave}
                disabled={saveTemplateMutation.isPending || !validation?.valid}
              >
                {saveTemplateMutation.isPending ? "Saving..." : "Save Template"}
              </Button>
              <Button
                onClick={handleReset}
                variant="destructive"
                disabled={resetMutation.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset to Default
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="preview">
            <div className="space-y-4">
              <div>
                <Label>Rendered Payload (with sample data)</Label>
                {previewData ? (
                  previewData.success ? (
                    <pre className="mt-2 p-4 bg-muted rounded-lg overflow-auto max-h-[400px] text-sm font-mono">
                      {JSON.stringify(previewData.payload, null, 2)}
                    </pre>
                  ) : (
                    <div className="mt-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-600">
                        <strong>Error:</strong> {previewData.error}
                      </p>
                    </div>
                  )
                ) : (
                  <div className="mt-2 p-12 bg-muted rounded-lg text-center">
                    <Eye className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Click "Preview" to see the rendered payload
                    </p>
                  </div>
                )}
              </div>

              <Button onClick={handlePreview} variant="outline" className="w-full">
                <Eye className="h-4 w-4 mr-2" />
                Refresh Preview
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
