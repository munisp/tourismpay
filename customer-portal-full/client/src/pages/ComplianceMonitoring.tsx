import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface ComplianceRecord {
  id: string;
  rule: string;
  status: 'Compliant' | 'Non-Compliant' | 'Pending';
  lastRun: string;
  details: string;
}

const ComplianceMonitoring: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Compliant' | 'Non-Compliant' | 'Pending'>('All');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const { data: complianceData, isLoading, isError, error, refetch } = trpc.compliance.list.useQuery();
  const runComplianceMutation = trpc.compliance.run.useMutation();
  const utils = trpc.useUtils();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <div className="text-center text-red-500">Access Denied: Please log in.</div>;
  }

  if (isError) {
    toast.error(`Error fetching compliance data: ${error?.message}`);
    return <div className="text-center text-red-500">Error: ${error?.message}</div>;
  }

  const filteredData = (complianceData || []).filter(record => {
    const matchesSearch = record.rule.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          record.details.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'All' || record.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const paginatedData = filteredData.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filteredData.length / pageSize);

  const handleRunComplianceCheck = async (ruleId: string) => {
    try {
      await runComplianceMutation.mutateAsync({ ruleId });
      toast.success('Compliance check initiated successfully!');
      utils.compliance.list.invalidate();
      refetch();
    } catch (err: any) {
      toast.error(`Failed to initiate compliance check: ${err.message}`);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            Compliance Monitoring
            <Button onClick={() => handleRunComplianceCheck('all')} disabled={runComplianceMutation.isLoading}>
              {runComplianceMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Run All Checks
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4 mb-4">
            <Input
              placeholder="Search rules or details..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterStatus} onValueChange={(value: 'All' | 'Compliant' | 'Non-Compliant' | 'Pending') => setFilterStatus(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="Compliant">Compliant</SelectItem>
                <SelectItem value="Non-Compliant">Non-Compliant</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.rule}</TableCell>
                    <TableCell>
                      <Badge variant={record.status === 'Compliant' ? 'default' : record.status === 'Non-Compliant' ? 'destructive' : 'secondary'}>
                        {record.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{record.lastRun}</TableCell>
                    <TableCell>{record.details}</TableCell>
                    <TableCell className="text-right">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">View Details</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{record.rule} Details</DialogTitle>
                            <DialogDescription>
                              {record.details}
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button onClick={() => handleRunComplianceCheck(record.id)} disabled={runComplianceMutation.isLoading}>
                              {runComplianceMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Re-run Check
                            </Button>
                            <Button variant="secondary">Close</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
                {paginatedData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">No compliance records found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-between items-center mt-4">
            <Button
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ComplianceMonitoring;