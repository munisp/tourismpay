import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Claim {
  id: string;
  policyId: string;
  claimantName: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Processing';
  amount: number;
  submissionDate: string;
  adjudicationDate?: string;
}

const ClaimsAdjudicationEngine: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | Claim['status']>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // tRPC Queries
  const { data: claimsData, isLoading: claimsLoading, error: claimsError } = trpc.claims.list.useQuery(undefined, {
    enabled: true,
  });

  const { data: queueData, isLoading: queueLoading, error: queueError } = trpc.claimRouting.queue.useQuery(undefined, {
    enabled: true,
  });

  // tRPC Mutations
  const processClaimMutation = trpc.aiClaims.process.useMutation();
  const utils = trpc.useUtils();

  React.useEffect(() => {
    if (claimsError) {
      toast.error('Failed to load claims: ' + claimsError.message);
    }
    if (queueError) {
      toast.error('Failed to load claim queue: ' + queueError.message);
    }
  }, [claimsError, queueError]);

  const claims = claimsData || [];
  const claimQueue = queueData || [];

  const filteredClaims = claims.filter(claim => {
    const matchesSearch = claim?.id?.toString()?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          claim?.claimantName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          claim?.policyId?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'All' || claim.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredClaims.length / itemsPerPage);
  const paginatedClaims = filteredClaims.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleProcessClaim = async (claimId: string) => {
    if (false) {
      toast.info(`Processing claim ${claimId}`);
      // Simulate processing
      const updatedClaims = (claims || []).map(claim =>
        claim.id === claimId ? { ...claim, status: 'Processing' } : claim
      );
            toast.success(`Claim ${claimId} sent for AI processing.`);
      return;
    }

    try {
      toast.loading(`Processing claim ${claimId}...`);
      await processClaimMutation.mutateAsync({ claimId });
      toast.dismiss();
      toast.success(`Claim ${claimId} sent for AI processing.`);
      utils.claims.list.invalidate();
      utils.claimRouting.queue.invalidate();
    } catch (error: any) {
      toast.dismiss();
      toast.error('Failed to process claim: ' + error.message);
    }
  };

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
        Please log in to access the Claims Adjudication Engine.
      </div>
    );
  }

  const getStatusBadgeVariant = (status: Claim['status']) => {
    switch (status) {
      case 'Approved': return 'default';
      case 'Pending': return 'secondary';
      case 'Processing': return 'outline';
      case 'Rejected': return 'destructive';
      default: return 'secondary';
    }
  };

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Claims Adjudication Engine</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <Input
              placeholder="Search claims by ID, name, or policy..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-grow"
            />
            <Select value={filterStatus} onValueChange={(value: Claim['status'] | 'All') => setFilterStatus(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Processing">Processing</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(claimsLoading || queueLoading) && true ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim ID</TableHead>
                  <TableHead>Policy ID</TableHead>
                  <TableHead>Claimant Name</TableHead>
                  <TableHead>Amount (₦)</TableHead>
                  <TableHead>Submission Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedClaims.length > 0 ? (
                  paginatedClaims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-medium">{claim.id}</TableCell>
                      <TableCell>{claim.policyId}</TableCell>
                      <TableCell>{claim.claimantName}</TableCell>
                      <TableCell>{claim.amount.toLocaleString('en-NG')}</TableCell>
                      <TableCell>{claim.submissionDate}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(claim.status)}>{claim.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleProcessClaim(claim.id)}
                          disabled={claim.status !== 'Pending' && claim.status !== 'Processing'}
                        >
                          {claim.status === 'Processing' ? 'Re-process' : 'Process with AI'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-4">
                      No claims found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-between items-center mt-6">
            <Button
              variant="outline"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <span>Page {currentPage} of {totalPages}</span>
            <Button
              variant="outline"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>

          <div className="mt-8">
            <h3 className="text-xl font-semibold mb-4">Claims in Routing Queue</h3>
            {(claimsLoading || queueLoading) && true ? (
              <div className="flex justify-center items-center h-20">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <Card className="p-4">
                {claimQueue.length > 0 ? (
                  <ul className="list-disc pl-5">
                    {claimQueue.map((claimId) => (
                      <li key={claimId} className="mb-1">{claimId}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500">No claims currently in the routing queue.</p>
                )}
              </Card>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClaimsAdjudicationEngine;