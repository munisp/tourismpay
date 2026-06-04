import React, { useState, useEffect, useMemo } from 'react';
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Card, CardContent, CardHeader, CardTitle
} from "@/components/ui/card";
import {
  Button
} from "@/components/ui/button";
import {
  Badge
} from "@/components/ui/badge";
import {
  Input
} from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";

interface Claim {
  id: string;
  policyHolder: string;
  claimType: string;
  status: 'Pending' | 'Processing' | 'Adjudicated' | 'Rejected';
  amount: number;
  dateFiled: string;
}

interface AdjudicationResult {
  claimId: string;
  adjudicationStatus: 'Approved' | 'Denied' | 'Further Review';
  reason: string;
  recommendedAction: string;
}

export default function AIClaimsAdjudication() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  const [claimIdFilter, setClaimIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | Claim['status']>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [isProcessingDialogOpen, setIsProcessingDialogOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

  // tRPC Queries
  const { data: claimsData, isLoading: claimsLoading, error: claimsError } = trpc.claims.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: queueData, isLoading: queueLoading, error: queueError } = trpc.claimRouting.queue.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: adjudicationResultsData, isLoading: adjudicationResultsLoading, error: adjudicationResultsError } = trpc.aiClaims.results.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // tRPC Mutation
  const processClaimMutation = trpc.aiClaims.process.useMutation({
    onSuccess: () => {
      toast.success('Claim processed successfully!');
      utils.aiClaims.results.invalidate();
      utils.claims.list.invalidate();
      setIsProcessingDialogOpen(false);
      setSelectedClaim(null);
    },
    onError: (error) => {
      toast.error(`Failed to process claim: ${error.message}`);
    },
  });

  useEffect(() => {
    if (claimsError) {
      toast.error(`Error fetching claims: ${claimsError.message}`);
    }
    if (queueError) {
      toast.error(`Error fetching routing queue: ${queueError.message}`);
    }
    if (adjudicationResultsError) {
      toast.error(`Error fetching adjudication results: ${adjudicationResultsError.message}`);
    }
  }, [claimsError, queueError, adjudicationResultsError]);

  const allClaims = claimsData || [];
  const allAdjudicationResults = adjudicationResultsData || [];

  const filteredClaims = useMemo(() => {
    let filtered = allClaims;

    if (claimIdFilter) {
      filtered = filtered.filter((claim: any) =>
        claim?.id?.toString().toLowerCase().includes(claimIdFilter.toLowerCase())
      );
    }

    if (statusFilter !== 'All') {
      filtered = filtered.filter((claim: any) => claim?.status === statusFilter);
    }

    return filtered;
  }, [allClaims, claimIdFilter, statusFilter]);

  const totalPages = Math.ceil(filteredClaims.length / itemsPerPage);
  const paginatedClaims = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredClaims.slice(startIndex, endIndex);
  }, [filteredClaims, currentPage, itemsPerPage]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-lg font-semibold">
        Please log in to access the AI Claims Adjudication page.
      </div>
    );
  }

  const handlePageChange = (page: number) => {
    if (page > 0 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleProcessClaim = (claim: Claim) => {
    setSelectedClaim(claim);
    setIsProcessingDialogOpen(true);
  };

  const confirmProcessClaim = () => {
    if (selectedClaim) {
      processClaimMutation.mutate({ claimId: selectedClaim.id });
    }
  };

  const getAdjudicationStatus = (claimId: string) => {
    const result = allAdjudicationResults.find(res => res.claimId === claimId);
    return result ? result.adjudicationStatus : 'N/A';
  };

  const getStatusBadgeVariant = (status: Claim['status']) => {
    switch (status) {
      case 'Pending': return 'default';
      case 'Processing': return 'secondary';
      case 'Adjudicated': return 'success'; // Assuming 'success' variant exists or define one
      case 'Rejected': return 'destructive';
      default: return 'outline';
    }
  };

  const getAdjudicationBadgeVariant = (status: AdjudicationResult['adjudicationStatus'] | 'N/A') => {
    switch (status) {
      case 'Approved': return 'success';
      case 'Denied': return 'destructive';
      case 'Further Review': return 'secondary';
      default: return 'outline';
    }
  };

  const isLoading = claimsLoading || queueLoading || adjudicationResultsLoading || processClaimMutation.isLoading;

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">AI Claims Adjudication</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <Input
              placeholder="Filter by Claim ID..."
              value={claimIdFilter}
              onChange={(e) => setClaimIdFilter(e.target.value)}
              className="max-w-sm"
            />
            <Select
              value={statusFilter}
              onValueChange={(value: 'All' | Claim['status']) => setStatusFilter(value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Processing">Processing</SelectItem>
                <SelectItem value="Adjudicated">Adjudicated</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}

          {!isLoading && filteredClaims.length === 0 && (
            <div className="text-center py-10 text-gray-500">
              No claims found matching your criteria.
            </div>
          )}

          {!isLoading && filteredClaims.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim ID</TableHead>
                    <TableHead>Policy Holder</TableHead>
                    <TableHead>Claim Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount (₦)</TableHead>
                    <TableHead>Date Filed</TableHead>
                    <TableHead>AI Adjudication</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedClaims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-medium">{claim.id}</TableCell>
                      <TableCell>{claim.policyHolder}</TableCell>
                      <TableCell>{claim.claimType}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(claim.status)}>{claim.status}</Badge>
                      </TableCell>
                      <TableCell>{claim.amount.toLocaleString('en-NG')}</TableCell>
                      <TableCell>{new Date(claim.dateFiled).toLocaleDateString('en-NG')}</TableCell>
                      <TableCell>
                        <Badge variant={getAdjudicationBadgeVariant(getAdjudicationStatus(claim.id))}>
                          {getAdjudicationStatus(claim.id)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleProcessClaim(claim)}
                          disabled={claim.status !== 'Pending' || processClaimMutation.isLoading}
                        >
                          {processClaimMutation.isLoading && selectedClaim?.id === claim.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Process with AI
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {!isLoading && filteredClaims.length > 0 && (
            <div className="flex justify-between items-center mt-6">
              <Button
                variant="outline"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
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

      {/* Process Claim Dialog */}
      <Dialog open={isProcessingDialogOpen} onOpenChange={setIsProcessingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Claim with AI</DialogTitle>
            <DialogDescription>
              Are you sure you want to initiate AI adjudication for Claim ID: <strong>{selectedClaim?.id}</strong>?
              This action will trigger the AI to analyze the claim details and provide a recommendation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProcessingDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmProcessClaim}
              disabled={processClaimMutation.isLoading}
            >
              {processClaimMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Process
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}