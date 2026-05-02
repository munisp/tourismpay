// @ts-nocheck
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Key, Copy, RotateCw, Trash2, Eye, EyeOff, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ApiKeyPermissions from "@/components/ps-ApiKeyPermissions";
import ApiKeyMonitoring from "@/components/ps-ApiKeyMonitoring";
import WebhookConfiguration from "@/components/ps-WebhookConfiguration";
import WebhookEventHistory from "@/components/ps-WebhookEventHistory";
import NotificationChannels from "@/components/ps-NotificationChannels";

interface ApiKeyManagementProps {
  environmentId: number;
  environmentType: string;
}

export default function ApiKeyManagement({ environmentId, environmentType }: ApiKeyManagementProps) {
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showRotateDialog, setShowRotateDialog] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [selectedCredentialId, setSelectedCredentialId] = useState<number | null>(null);
  const [rotateReason, setRotateReason] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number>(365);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [newApiSecret, setNewApiSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  // Get API keys list
  const { data: apiKeys = [], refetch } = trpc.apiKeys.list.useQuery({ environmentId });

  // Generate mutation
  const generateMutation = trpc.apiKeys.generate.useMutation({
    onSuccess: (data) => {
      setNewApiKey(data.apiKey);
      setNewApiSecret(data.apiSecret);
      toast.success("API key generated successfully!");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to generate API key: ${error.message}`);
    },
  });

  // Rotate mutation
  const rotateMutation = trpc.apiKeys.rotate.useMutation({
    onSuccess: (data) => {
      setNewApiKey(data.apiKey);
      setNewApiSecret(data.apiSecret);
      setShowRotateDialog(false);
      setRotateReason("");
      toast.success("API key rotated successfully!");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to rotate API key: ${error.message}`);
    },
  });

  // Revoke mutation
  const revokeMutation = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => {
      setShowRevokeDialog(false);
      setRevokeReason("");
      toast.success("API key revoked successfully!");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to revoke API key: ${error.message}`);
    },
  });

  const handleGenerate = async () => {
    await generateMutation.mutateAsync({
      environmentId,
      expiresInDays: expiresInDays > 0 ? expiresInDays : undefined,
    });
    setShowGenerateDialog(false);
  };

  const handleRotate = async () => {
    if (!selectedCredentialId) return;
    await rotateMutation.mutateAsync({
      credentialId: selectedCredentialId,
      reason: rotateReason || undefined,
      expiresInDays: expiresInDays > 0 ? expiresInDays : undefined,
    });
  };

  const handleRevoke = async () => {
    if (!selectedCredentialId || !revokeReason.trim()) {
      toast.error("Revocation reason is required");
      return;
    }
    await revokeMutation.mutateAsync({
      credentialId: selectedCredentialId,
      reason: revokeReason,
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const activeKeys = apiKeys.filter((key) => key.isActive);
  const inactiveKeys = apiKeys.filter((key) => !key.isActive);

  return (
    <Tabs defaultValue="keys" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="history">Event History</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

      <TabsContent value="keys" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">API Keys</h3>
          <p className="text-sm text-muted-foreground">
            Manage API credentials for {environmentType} environment
          </p>
        </div>
        <Button onClick={() => setShowGenerateDialog(true)}>
          <Key className="h-4 w-4 mr-2" />
          Generate New Key
        </Button>
      </div>

      {/* New Credentials Display */}
      {newApiKey && newApiSecret && (
        <Card className="border-green-600">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              New API Credentials Generated
            </CardTitle>
            <CardDescription>
              Save these credentials securely. The secret will not be shown again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>API Key</Label>
              <div className="flex gap-2 mt-1">
                <Input value={newApiKey} readOnly className="font-mono text-sm" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(newApiKey, "API Key")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>API Secret</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type={showSecret ? "text" : "password"}
                  value={newApiSecret}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(newApiSecret, "API Secret")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setNewApiKey(null);
                setNewApiSecret(null);
                setShowSecret(false);
              }}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active Keys */}
      {activeKeys.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium">Active Keys ({activeKeys.length})</h4>
          {activeKeys.map((key) => (
            <Card key={key.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">{key.apiKeyPreview}</code>
                      <Badge variant="default">v{key.keyVersion}</Badge>
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        Active
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Created {format(new Date(key.createdAt), "PPp")}</span>
                      {key.lastUsedAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last used {format(new Date(key.lastUsedAt), "PPp")}
                        </span>
                      )}
                      {key.expiresAt && (
                        <span
                          className={`flex items-center gap-1 ${
                            new Date(key.expiresAt) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                              ? "text-orange-600"
                              : ""
                          }`}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Expires {format(new Date(key.expiresAt), "PPp")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedCredentialId(key.id);
                        setShowRotateDialog(true);
                      }}
                    >
                      <RotateCw className="h-4 w-4 mr-1" />
                      Rotate
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setSelectedCredentialId(key.id);
                        setShowRevokeDialog(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Revoke
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Inactive Keys */}
      {inactiveKeys.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-muted-foreground">Revoked Keys ({inactiveKeys.length})</h4>
          {inactiveKeys.map((key) => (
            <Card key={key.id} className="opacity-60">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">{key.apiKeyPreview}</code>
                      <Badge variant="outline">v{key.keyVersion}</Badge>
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <XCircle className="h-3 w-3" />
                        Revoked
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Created {format(new Date(key.createdAt), "PPp")}</span>
                      {key.revokedAt && (
                        <span>Revoked {format(new Date(key.revokedAt), "PPp")}</span>
                      )}
                    </div>
                    {key.revocationReason && (
                      <p className="text-xs text-muted-foreground">
                        Reason: {key.revocationReason}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {apiKeys.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Key className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h4 className="font-medium mb-2">No API Keys</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Generate your first API key to start integrating
            </p>
            <Button onClick={() => setShowGenerateDialog(true)}>
              <Key className="h-4 w-4 mr-2" />
              Generate API Key
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Generate Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate New API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for the {environmentType} environment
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="expiresInDays">Expires In (days)</Label>
              <Input
                id="expiresInDays"
                type="number"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(parseInt(e.target.value) || 0)}
                placeholder="365"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Set to 0 for no expiration
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? "Generating..." : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotate Dialog */}
      <Dialog open={showRotateDialog} onOpenChange={setShowRotateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate API Key</DialogTitle>
            <DialogDescription>
              This will create a new key and deactivate the current one
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="rotateReason">Reason (optional)</Label>
              <Textarea
                id="rotateReason"
                value={rotateReason}
                onChange={(e) => setRotateReason(e.target.value)}
                placeholder="Why are you rotating this key?"
              />
            </div>
            <div>
              <Label htmlFor="rotateExpiresInDays">Expires In (days)</Label>
              <Input
                id="rotateExpiresInDays"
                type="number"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(parseInt(e.target.value) || 0)}
                placeholder="365"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRotateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRotate} disabled={rotateMutation.isPending}>
              {rotateMutation.isPending ? "Rotating..." : "Rotate Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Dialog */}
      <Dialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API Key</DialogTitle>
            <DialogDescription className="text-destructive">
              This action cannot be undone. The key will be permanently deactivated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="revokeReason">Reason *</Label>
              <Textarea
                id="revokeReason"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Why are you revoking this key?"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevokeDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revokeMutation.isPending || !revokeReason.trim()}
            >
              {revokeMutation.isPending ? "Revoking..." : "Revoke Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </TabsContent>

      <TabsContent value="permissions">
        {activeKeys.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select an API key to configure permissions:
            </p>
            {activeKeys.map((key) => (
              <ApiKeyPermissions key={key.id} credentialId={key.id} />
            ))}
          </div>
        )}
        {activeKeys.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">
                Generate an API key first to configure permissions
              </p>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="monitoring">
        {activeKeys.length > 0 && (
          <div className="space-y-6">
            {activeKeys.map((key) => (
              <div key={key.id}>
                <h3 className="text-lg font-semibold mb-4">
                  Monitoring for {key.apiKeyPreview}
                </h3>
                <ApiKeyMonitoring credentialId={key.id} />
              </div>
            ))}
          </div>
        )}
        {activeKeys.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">
                Generate an API key first to view monitoring data
              </p>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="webhooks">
        {activeKeys.length > 0 && (
          <div className="space-y-6">
            {activeKeys.map((key) => (
              <div key={key.id}>
                <h3 className="text-lg font-semibold mb-4">
                  Webhooks for {key.apiKeyPreview}
                </h3>
                <WebhookConfiguration credentialId={key.id} />
              </div>
            ))}
          </div>
        )}
        {activeKeys.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">
                Generate an API key first to configure webhooks
              </p>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="history">
        {activeKeys.length > 0 && (
          <div className="space-y-6">
            {activeKeys.map((key) => (
              <div key={key.id}>
                <h3 className="text-lg font-semibold mb-4">
                  Event History for {key.apiKeyPreview}
                </h3>
                <WebhookEventHistory credentialId={key.id} />
              </div>
            ))}
          </div>
        )}
        {activeKeys.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">
                Generate an API key first to view event history
              </p>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="notifications">
        {activeKeys.length > 0 && (
          <div className="space-y-6">
            {activeKeys.map((key) => (
              <div key={key.id}>
                <h3 className="text-lg font-semibold mb-4">
                  Notification Channels for {key.apiKeyPreview}
                </h3>
                <NotificationChannels credentialId={key.id} />
              </div>
            ))}
          </div>
        )}
        {activeKeys.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">
                Generate an API key first to configure notification channels
              </p>
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}
