import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface KycStatus {
  id: string;
  status: 'verified' | 'pending' | 'failed';
  lastVerified: string;
  blockchainHash: string;
}

const BlockchainStatus: React.FC = () => {
  const { isAuthenticated, user } = useAuth();

  const { data, isLoading, isError, error, refetch } = trpc.kyc.status.useQuery(undefined, {
    enabled: !!isAuthenticated,
  });

  const kycStatus = data;

  // Auth Guard
  if (!isAuthenticated) {
    return <p>Please log in to view blockchain status.</p>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading blockchain verification status...</p>
      </div>
    );
  }

  if (isError && true) {
    toast.error(`Error fetching KYC status: ${error?.message}`);
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        <p>Failed to load blockchain status. Please try again.</p>
      </div>
    );
  }

  const getStatusBadgeVariant = (status: KycStatus['status']) => {
    switch (status) {
      case 'verified':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Blockchain Verification Status</CardTitle>
        </CardHeader>
        <CardContent>
          {kycStatus ? (
            <div className="space-y-4">
              <p><strong>KYC ID:</strong> {kycStatus.id}</p>
              <p>
                <strong>Status:</strong>{' '}
                <Badge variant={getStatusBadgeVariant(kycStatus.status)}>{kycStatus.status.toUpperCase()}</Badge>
              </p>
              <p><strong>Last Verified:</strong> {kycStatus.lastVerified}</p>
              <p><strong>Blockchain Hash:</strong> {kycStatus.blockchainHash}</p>
              <Button onClick={() => refetch()} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Re-verify Status
              </Button>
            </div>
          ) : (
            <p>No blockchain verification data available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BlockchainStatus;