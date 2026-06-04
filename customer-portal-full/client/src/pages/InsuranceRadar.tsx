import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface ScanResult {
  id: string;
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved';
  timestamp: string;
}

interface Alert {
  id: string;
  message: string;
  category: string;
  level: 'info' | 'warning' | 'critical';
  date: string;
}

const InsuranceRadar: React.FC = () => {
  const { isAuthenticated } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // tRPC queries
  const { data: scanResults, isLoading: isLoadingScanResults, isError: isErrorScanResults, error: scanResultsError } = trpc.insuranceRadar.scan.useQuery();
  const { data: alerts, isLoading: isLoadingAlerts, isError: isErrorAlerts, error: alertsError } = trpc.insuranceRadar.alerts.useQuery();

  // Demo data for scan results

  // Demo data for alerts

  if (isErrorScanResults) {
    toast.error(`Failed to load scan results: ${scanResultsError?.message}`);
  }

  if (isErrorAlerts) {
    toast.error(`Failed to load alerts: ${alertsError?.message}`);
  }

  const displayedScanResults = scanResults || [];
  const displayedAlerts = alerts || [];

  const filteredScanResults = displayedScanResults
    .filter(result =>
      result.description.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (filterSeverity === 'all' || result.severity === filterSeverity) &&
      (filterStatus === 'all' || result.status === filterStatus)
    );

  if (!isAuthenticated) {
    return <p>Please log in to view the Insurance Radar.</p>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Insurance Radar</h1>

      {/* Scan Results Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Scan Results</CardTitle>
          <CardDescription>Overview of potential risks and anomalies detected.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-4">
            <Input
              placeholder="Search scan results..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoadingScanResults ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredScanResults.length > 0 ? (
                  filteredScanResults.map((result) => (
                    <TableRow key={result.id}>
                      <TableCell>{result.type}</TableCell>
                      <TableCell>{result.description}</TableCell>
                      <TableCell>
                        <Badge variant={result.severity === 'high' ? 'destructive' : result.severity === 'medium' ? 'warning' : 'default'}>
                          {result.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={result.status === 'open' ? 'outline' : 'secondary'}>
                          {result.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(result.timestamp).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm">View Details</Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">
                      No scan results available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Alerts Section */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Alerts</CardTitle>
          <CardDescription>Important notifications and system alerts.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingAlerts ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Message</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedAlerts.length > 0 ? (
                  displayedAlerts.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell>{alert.message}</TableCell>
                      <TableCell>{alert.category}</TableCell>
                      <TableCell>
                        <Badge variant={alert.level === 'critical' ? 'destructive' : alert.level === 'warning' ? 'warning' : 'default'}>
                          {alert.level}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(alert.date).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm">Acknowledge</Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">
                      No alerts available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InsuranceRadar;