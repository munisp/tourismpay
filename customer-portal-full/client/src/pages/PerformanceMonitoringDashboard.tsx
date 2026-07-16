import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface PerformanceMetric {
  id: string;
  name: string;
  value: string;
  unit: string;
  trend: "up" | "down" | "stable";
}

export default function PerformanceMonitoringDashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const { data, isLoading, isError, error } = trpc.performance.metrics.useQuery();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        <p>You are not authorized to view this page. Please log in.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading performance metrics...</p>
      </div>
    );
  }

  if (isError) {
    toast.error("Failed to load performance metrics", {
      description: error?.message || "An unknown error occurred.",
    });
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        <p>Error: {error?.message || "Failed to load performance metrics."}</p>
      </div>
    );
  }

  const metricsToDisplay = Array.isArray(data) ? data : [];

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Performance Monitoring Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          {metricsToDisplay.length === 0 ? (
            <p>No performance metrics available.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metricsToDisplay.map((metric) => (
                  <TableRow key={metric.id}>
                    <TableCell className="font-medium">{metric.name}</TableCell>
                    <TableCell>{metric.value}</TableCell>
                    <TableCell>{metric.unit}</TableCell>
                    <TableCell>
                      <Badge
                        variant={metric.trend === "up" ? "default" : metric.trend === "down" ? "destructive" : "secondary"}
                      >
                        {metric.trend.charAt(0).toUpperCase() + metric.trend.slice(1)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}