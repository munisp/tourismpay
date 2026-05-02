// @ts-nocheck
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Shield, Check, X } from "lucide-react";

interface ApiKeyPermissionsProps {
  credentialId: number;
}

interface Permission {
  resource: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
}

const RESOURCES = ["transactions", "webhooks", "reports", "settings"];

export default function ApiKeyPermissions({ credentialId }: ApiKeyPermissionsProps) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  // Get current permissions
  const { data: currentPermissions, refetch } = trpc.apiKeyEnhancements.permissions.get.useQuery({
    credentialId,
  });

  // Get permission templates
  const { data: templates = [] } = trpc.apiKeyEnhancements.permissions.listTemplates.useQuery();

  // Set permissions mutation
  const setPermissionsMutation = trpc.apiKeyEnhancements.permissions.set.useMutation({
    onSuccess: () => {
      toast.success("Permissions updated successfully!");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to update permissions: ${error.message}`);
    },
  });

  // Initialize permissions from current or default
  useEffect(() => {
    if (currentPermissions && currentPermissions.length > 0) {
      setPermissions(currentPermissions);
    } else {
      // Initialize with all resources, no permissions
      setPermissions(
        RESOURCES.map((resource) => ({
          resource,
          canRead: false,
          canWrite: false,
          canDelete: false,
        }))
      );
    }
  }, [currentPermissions]);

  const handlePermissionChange = (
    resource: string,
    action: "canRead" | "canWrite" | "canDelete",
    value: boolean
  ) => {
    setPermissions((prev) =>
      prev.map((perm) =>
        perm.resource === resource
          ? { ...perm, [action]: value }
          : perm
      )
    );
  };

  const handleTemplateSelect = (templateName: string) => {
    setSelectedTemplate(templateName);
    const template = templates.find((t) => t.name === templateName);
    if (template) {
      // Merge template permissions with existing resources
      const templatePerms = template.permissions;
      setPermissions(
        RESOURCES.map((resource) => {
          const templatePerm = templatePerms.find((p) => p.resource === resource);
          return templatePerm || {
            resource,
            canRead: false,
            canWrite: false,
            canDelete: false,
          };
        })
      );
    }
  };

  const handleSave = async () => {
    await setPermissionsMutation.mutateAsync({
      credentialId,
      permissions,
    });
  };

  const hasAnyPermission = (perm: Permission) => {
    return perm.canRead || perm.canWrite || perm.canDelete;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Access Permissions
        </CardTitle>
        <CardDescription>
          Configure granular access control for this API key
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Template Selection */}
        <div>
          <Label>Quick Setup (Templates)</Label>
          <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select a permission template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.name} value={template.name}>
                  <div>
                    <div className="font-medium capitalize">{template.name.replace("_", " ")}</div>
                    <div className="text-xs text-muted-foreground">{template.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Permissions Grid */}
        <div>
          <Label className="mb-3 block">Resource Permissions</Label>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-medium">Resource</th>
                  <th className="text-center p-3 font-medium">Read</th>
                  <th className="text-center p-3 font-medium">Write</th>
                  <th className="text-center p-3 font-medium">Delete</th>
                  <th className="text-center p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {permissions.map((perm, index) => (
                  <tr key={perm.resource} className={index % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                    <td className="p-3 font-medium capitalize">{perm.resource}</td>
                    <td className="p-3 text-center">
                      <Checkbox
                        checked={perm.canRead}
                        onCheckedChange={(checked) =>
                          handlePermissionChange(perm.resource, "canRead", checked as boolean)
                        }
                      />
                    </td>
                    <td className="p-3 text-center">
                      <Checkbox
                        checked={perm.canWrite}
                        onCheckedChange={(checked) =>
                          handlePermissionChange(perm.resource, "canWrite", checked as boolean)
                        }
                      />
                    </td>
                    <td className="p-3 text-center">
                      <Checkbox
                        checked={perm.canDelete}
                        onCheckedChange={(checked) =>
                          handlePermissionChange(perm.resource, "canDelete", checked as boolean)
                        }
                      />
                    </td>
                    <td className="p-3 text-center">
                      {hasAnyPermission(perm) ? (
                        <Badge variant="default" className="text-xs">
                          <Check className="h-3 w-3 mr-1" />
                          Enabled
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <X className="h-3 w-3 mr-1" />
                          No Access
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={setPermissionsMutation.isPending}>
            {setPermissionsMutation.isPending ? "Saving..." : "Save Permissions"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
