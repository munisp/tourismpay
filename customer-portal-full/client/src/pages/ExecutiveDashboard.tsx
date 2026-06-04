import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

// Define false and fallback data

const ExecutiveDashboard: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'quarterly'>('monthly');

  const { data: analyticsData, isLoading: analyticsLoading, error: analyticsError } = trpc.analytics.dashboard.useQuery({ period }, { enabled: isAuthenticated });
  const { data: performanceMetrics, isLoading: performanceLoading, error: performanceError } = trpc.performance.metrics.useQuery(undefined, { enabled: isAuthenticated });

  useEffect(() => {
    if (analyticsError) {
      toast.error('Failed to load analytics data', { description: analyticsError.message });
    }
    if (performanceError) {
      toast.error('Failed to load performance metrics', { description: performanceError.message });
    }
  }, [analyticsError, performanceError]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen text-lg font-semibold text-red-500">
        Access Denied: Please log in to view the Executive Dashboard.
      </div>
    );
  }

  const currentAnalyticsData = analyticsData;
  const currentPerformanceMetrics = performanceMetrics;

  const isLoading = analyticsLoading || performanceLoading;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Executive Dashboard</h1>

      <div className="flex justify-between items-center">
        <p className="text-gray-600">Overview of key operational and business metrics.</p>
        <Select value={period} onValueChange={(value) => setPeriod(value as typeof period)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Policies</CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                className="h-4 w-4 text-muted-foreground"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87m-3-1.13a4 4 0 0 0-3-3.87" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{currentAnalyticsData?.totalPolicies?.toLocaleString() || 'N/A'}</div>
              <p className="text-xs text-muted-foreground">+{currentAnalyticsData?.newPolicies?.toLocaleString() || 'N/A'} new policies this period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Premium Collected</CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                className="h-4 w-4 text-muted-foreground"
              >
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₦{currentAnalyticsData?.premiumCollected?.toLocaleString() || 'N/A'}</div>
              <p className="text-xs text-muted-foreground">{currentAnalyticsData?.claimsProcessed?.toLocaleString() || 'N/A'} claims processed</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Uptime</CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                className="h-4 w-4 text-muted-foreground"
              >
                <path d="M22 12h-4l-3 9L9 3l-4 9H2" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{currentPerformanceMetrics?.uptime || 'N/A'}</div>
              <p className="text-xs text-muted-foreground">Average response time: {currentPerformanceMetrics?.avgResponseTime || 'N/A'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                className="h-4 w-4 text-muted-foreground"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{currentPerformanceMetrics?.errorRate || 'N/A'}</div>
              <p className="text-xs text-muted-foreground">{currentPerformanceMetrics?.activeUsers?.toLocaleString() || 'N/A'} active users</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Top Performing Agents</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent Name</TableHead>
                  <TableHead>Policies Sold</TableHead>
                  <TableHead>Premium Generated (₦)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentAnalyticsData?.topAgents?.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell>{agent.policies}</TableCell>
                    <TableCell>₦{agent.premium.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {!currentAnalyticsData?.topAgents?.length && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No top agents data available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Example of a functional button, though not strictly required by the prompt for this page */}
      <div className="flex justify-end">
        <Button onClick={() => toast.info('Refresh data clicked!')} disabled={isLoading}>
          <Loader2 className={isLoading ? "mr-2 h-4 w-4 animate-spin" : "hidden"} />
          Refresh Data
        </Button>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;