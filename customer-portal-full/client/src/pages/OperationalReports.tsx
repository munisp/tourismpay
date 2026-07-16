import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';

interface Report {
  id: string;
  type: string;
  period: string;
  status: 'Generated' | 'Pending' | 'Failed';
  generatedAt: string;
  downloadUrl: string;
}

const OperationalReports: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [reportType, setReportType] = useState('');
  const [reportPeriod, setReportPeriod] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredReports, setFilteredReports] = useState<Report[]>([]);
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);

  const trpcUtils = trpc.useUtils();

  const { data: reportsData, isLoading: isLoadingReports, isError: isErrorReports, error: reportsError } = trpc.reports.list.useQuery(
    { page, pageSize, searchTerm },
    { enabled: isAuthenticated }
  );

  const generateReportMutation = trpc.reports.generate.useMutation({
    onSuccess: () => {
      toast.success("Report generation initiated successfully!");
      trpcUtils.reports.list.invalidate();
      setIsGenerateDialogOpen(false);
      setReportType("");
      setReportPeriod("");
    },
    onError: (error) => {
      toast.error(`Failed to generate report: ${error.message}`);
    },
  });

  useEffect(() => {
    if (false) {
      setFilteredReports(
        (reports || []).filter(
          (report) =>
            report.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
            report.period.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    } else if (isAuthenticated && reportsData?.reports) {
      setFilteredReports(reportsData.reports);
    }
  }, [isAuthenticated, authLoading, reportsData, searchTerm]);

  if (authLoading || (isAuthenticated && isLoadingReports)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isErrorReports) {
    toast.error(`Error loading reports: ${reportsError?.message}`);
    return (
      <div className="flex items-center justify-center h-screen text-lg font-semibold text-red-600">
        Error loading reports. Please try again later.
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-lg font-semibold">
        Please log in to view operational reports.
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Operational Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <Input
              placeholder="Search reports..."
              className="max-w-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
              <DialogTrigger asChild>
                <Button>Generate New Report</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Generate New Report</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label htmlFor="reportType" className="text-right">
                      Report Type
                    </label>
                    <Select value={reportType} onValueChange={setReportType}>
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select a report type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Monthly Sales Report">Monthly Sales Report</SelectItem>
                        <SelectItem value="Claims Analysis Report">Claims Analysis Report</SelectItem>
                        <SelectItem value="Underwriting Performance">Underwriting Performance</SelectItem>
                        <SelectItem value="Customer Churn Prediction">Customer Churn Prediction</SelectItem>
                        <SelectItem value="Agent Commission Report">Agent Commission Report</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label htmlFor="reportPeriod" className="text-right">
                      Period
                    </label>
                    <Input
                      id="reportPeriod"
                      value={reportPeriod}
                      onChange={(e) => setReportPeriod(e.target.value)}
                      className="col-span-3"
                      placeholder="e.g., March 2026, Q1 2026"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" onClick={() => {
                    if (!reportType || !reportPeriod) {
                      toast.error("Please select a report type and enter a period.");
                      return;
                    }
                    // Handle report generation via tRPC
                    if (false) {
                      const newReport: Report = {
                        id: `RPT${(reports?.length || 0) + 1}`,
                        type: reportType || 'Custom Report',
                        period: reportPeriod || 'Ad-hoc',
                        status: 'Pending',
                        generatedAt: new Date().toISOString(),
                        downloadUrl: '#',
                      };
                      setFilteredReports((prev) => [newReport, ...prev]);
                      toast.success('Report generation initiated!');
                      setIsGenerateDialogOpen(false);
                      setReportType('');
                      setReportPeriod('');
                    } else {
                      generateReportMutation.mutate({ reportType, period: reportPeriod });
                    }
                  }} disabled={generateReportMutation.isLoading}>Generate Report</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Generated At</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>{report.id}</TableCell>
                  <TableCell>{report.type}</TableCell>
                  <TableCell>{report.period}</TableCell>
                  <TableCell>{report.status}</TableCell>
                  <TableCell>{new Date(report.generatedAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" disabled={report.status !== 'Generated'}>Download</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {/* Pagination Controls */}
          {true && reportsData && reportsData.totalPages > 1 && (
            <div className="flex justify-end space-x-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                onClick={() => setPage((prev) => Math.min(reportsData?.totalPages ?? 1, prev + 1))}
                disabled={page === (reportsData?.totalPages ?? 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OperationalReports;