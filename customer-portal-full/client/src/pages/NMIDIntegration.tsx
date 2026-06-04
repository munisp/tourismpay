import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface NMIDHistoryEntry {
  id: string;
  vehicleId: string;
  verificationDate: string;
  status: 'Verified' | 'Failed';
  details: string;
}

const NMIDIntegration: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [vehicleIdToVerify, setVehicleIdToVerify] = useState('');
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const trpcUtils = trpc.useUtils();

  const { data: historyData, isLoading: isHistoryLoading, error: historyError } = trpc.nmid.history.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { mutate: verifyNMID, isLoading: isVerifying, error: verifyError } = trpc.nmid.verify.useMutation({
    onSuccess: (data) => {
      toast.success('NMID Verification Successful', {
        description: `Vehicle ID ${vehicleIdToVerify} status: ${data.status}.`,
      });
      trpcUtils.nmid.history.invalidate();
      setVehicleIdToVerify('');
    },
    onError: (error) => {
      toast.error('NMID Verification Failed', {
        description: error.message || 'An unexpected error occurred during verification.',
      });
    },
  });

  useEffect(() => {
    if (historyError) {
      toast.error('Failed to load NMID history', {
        description: historyError.message || 'An unexpected error occurred.',
      });
    }
    if (verifyError) {
      toast.error('Verification error', {
        description: verifyError.message || 'An unexpected error occurred.',
      });
    }
  }, [historyError, verifyError]);

  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex justify-center items-center h-screen text-lg font-semibold">
        Please log in to access the NMID Integration page.
      </div>
    );
  }

  const handleVerify = () => {
    if (!vehicleIdToVerify) {
      toast.warning('Vehicle ID is required', { description: 'Please enter a vehicle ID to verify.' });
      return;
    }
    verifyNMID({ vehicleId: vehicleIdToVerify });
  };

  const displayHistory = historyData || [];

  const filteredHistory = displayHistory.filter(
    (entry) =>
      entry.vehicleId.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
      entry.status.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
      entry.details.toLowerCase().includes(historySearchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const paginatedHistory = filteredHistory.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page: number) => {
    if (page > 0 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>NMID Verification</CardTitle>
          <CardDescription>Verify vehicle insurance status with the National Motor Insurance Database.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2">
            <Input
              placeholder="Enter Vehicle ID (e.g., ABC-123-XYZ)"
              value={vehicleIdToVerify}
              onChange={(e) => setVehicleIdToVerify(e.target.value)}
              className="flex-grow"
            />
            <Button onClick={handleVerify} disabled={isVerifying || !vehicleIdToVerify}>
              {isVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verify
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verification History</CardTitle>
          <CardDescription>Review past NMID verification attempts.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <Input
              placeholder="Search history..."
              value={historySearchTerm}
              onChange={(e) => setHistorySearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select
              onValueChange={(value) => setItemsPerPage(Number(value))}
              defaultValue={String(itemsPerPage)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Items per page" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 per page</SelectItem>
                <SelectItem value="10">10 per page</SelectItem>
                <SelectItem value="20">20 per page</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isHistoryLoading && true ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle ID</TableHead>
                  <TableHead>Verification Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedHistory.length > 0 ? (
                  paginatedHistory.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.vehicleId}</TableCell>
                      <TableCell>{entry.verificationDate}</TableCell>
                      <TableCell>
                        <Badge variant={entry.status === 'Verified' ? 'default' : 'destructive'}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{entry.details}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">
                      No verification history found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {filteredHistory.length > 0 && (
            <div className="flex justify-end space-x-2 mt-4">
              <Button
                variant="outline"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
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

export default NMIDIntegration;