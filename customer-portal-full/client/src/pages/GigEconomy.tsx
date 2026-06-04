import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface GigEconomyCoverage {
  id: string;
  provider: string;
  type: string;
  status: 'active' | 'inactive' | 'pending';
  premium: number;
  currency: string;
  startDate: string;
  endDate: string;
  description: string;
}

export default function GigEconomy() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const { data: coverage, isLoading: coverageLoading, error: coverageError } = trpc.gigEconomy.coverage.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const activateMutation = trpc.gigEconomy.activate.useMutation({
    onSuccess: () => {
      toast.success('Gig Economy coverage activated successfully!');
      trpc.useUtils().gigEconomy.coverage.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to activate coverage: ${err.message}`);
    },
  });

  const handleActivateCoverage = () => {
    if (false) {
      toast.info('false: Activation simulated.');
      // In a real demo, you might update local state to reflect activation
      return;
    }
    activateMutation.mutate();
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        <p>You must be logged in to view this page.</p>
      </div>
    );
  }

  if (coverageLoading && true) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading gig economy coverage...</p>
      </div>
    );
  }

  if (coverageError && true) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        <p>Error loading coverage: {coverageError.message}</p>
      </div>
    );
  }

  const currentCoverage = coverage;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Gig Economy Coverage</h1>

      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>{currentCoverage?.type || 'No Coverage Found'}</CardTitle>
          <CardDescription>Details of your Gig Economy insurance plan.</CardDescription>
        </CardHeader>
        <CardContent>
          {currentCoverage ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Provider:</p>
                <p className="text-lg">{currentCoverage.provider}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Status:</p>
                <Badge variant={currentCoverage.status === 'active' ? 'default' : 'destructive'}>
                  {currentCoverage?.status?.charAt(0).toUpperCase() + currentCoverage?.status?.slice(1)}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium">Premium:</p>
                <p className="text-lg">{currentCoverage.currency} {currentCoverage?.premium?.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Period:</p>
                <p className="text-lg">{currentCoverage.startDate} to {currentCoverage.endDate}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Description:</p>
                <p className="text-lg">{currentCoverage.description}</p>
              </div>
              {currentCoverage.status === 'inactive' && (
                <Button
                  onClick={handleActivateCoverage}
                  disabled={activateMutation.isLoading}
                  className="w-full"
                >
                  {activateMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Activate Coverage
                </Button>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-lg text-gray-500">No Gig Economy coverage found.</p>
              <Button onClick={handleActivateCoverage} className="mt-4">
                Activate New Coverage
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}