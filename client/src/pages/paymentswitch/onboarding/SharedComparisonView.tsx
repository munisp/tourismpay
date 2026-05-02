// @ts-nocheck
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function SharedComparisonView() {
  const [, params] = useRoute("/shared-comparison/:shareToken");
  const shareToken = params?.shareToken || "";

  const { data: comparison, isLoading, error } = trpc.testingCertification.getSharedComparison.useQuery(
    { shareToken },
    { enabled: !!shareToken }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-muted-foreground">Loading shared comparison...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !comparison) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Comparison Not Found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>
                {error?.message || "This shared comparison link is invalid or has been revoked."}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tags = comparison.tags as string[] || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <CardTitle className="text-2xl">{comparison.name}</CardTitle>
                {comparison.notes && (
                  <CardDescription className="text-base">{comparison.notes}</CardDescription>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>Saved on {new Date(comparison.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">
                Shared Comparison
              </Badge>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {tags.map((tag, index) => (
                  <Badge key={index} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </CardHeader>
        </Card>

        {/* Comparison Details */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Test Run 1 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Test Run 1</CardTitle>
              <CardDescription>Execution ID: {comparison.executionId1}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status:</span>
                <StatusBadge status="passed" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Duration:</span>
                <span className="text-sm text-muted-foreground">N/A</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Executed:</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(comparison.createdAt).toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Test Run 2 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Test Run 2</CardTitle>
              <CardDescription>Execution ID: {comparison.executionId2}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status:</span>
                <StatusBadge status="passed" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Duration:</span>
                <span className="text-sm text-muted-foreground">N/A</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Executed:</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(comparison.createdAt).toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Banner */}
        <Alert>
          <AlertDescription>
            This is a read-only view of a shared test comparison. For full details and analysis,
            please contact the person who shared this link.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    passed: { icon: CheckCircle2, color: "text-green-600 bg-green-50", label: "Passed" },
    failed: { icon: XCircle, color: "text-red-600 bg-red-50", label: "Failed" },
    running: { icon: Loader2, color: "text-blue-600 bg-blue-50", label: "Running" },
    pending: { icon: Clock, color: "text-gray-600 bg-gray-50", label: "Pending" },
  };

  const { icon: Icon, color, label } = config[status as keyof typeof config] || config.pending;

  return (
    <Badge variant="secondary" className={`${color} border-0`}>
      <Icon className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  );
}
