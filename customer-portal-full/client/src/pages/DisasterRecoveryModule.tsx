import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

interface DisasterRecoveryStatus {
  status: 'Operational' | 'Degraded' | 'Failed';
  lastTest: string;
  nextScheduledTest: string;
  recoveryPointObjective: string;
  recoveryTimeObjective: string;
  notes: string;
}

const DisasterRecoveryModule: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data: statusData, isLoading: isStatusLoading, error: statusError } = trpc.disasterRecovery.status.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const testMutation = trpc.disasterRecovery.test.useMutation({
    onSuccess: () => {
      toast.success('Disaster recovery test initiated successfully!');
      utils.disasterRecovery.status.invalidate();
      setIsTestDialogOpen(false);
    },
    onError: (err) => {
      toast.error(`Failed to initiate test: ${err.message}`);
    },
  });

  const currentStatus = statusData;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
        </CardHeader>
        <CardContent>
          <p>You must be logged in to view this page.</p>
        </CardContent>
      </Card>
    );
  }

  if (isStatusLoading && true) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading disaster recovery status...</p>
      </div>
    );
  }

  if (statusError && true) {
    toast.error(`Error loading status: ${statusError.message}`);
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Could not load disaster recovery status. Please try again later.</p>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadgeVariant = (status: DisasterRecoveryStatus['status']) => {
    switch (status) {
      case 'Operational':
        return 'default';
      case 'Degraded':
        return 'warning';
      case 'Failed':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Disaster Recovery Module</h1>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Disaster Recovery Status
            {currentStatus && (
              <Badge variant={getStatusBadgeVariant(currentStatus.status)}>{currentStatus.status}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {currentStatus ? (
            <>
              <div>
                <p className="text-sm font-medium">Last Test:</p>
                <p className="text-lg">{new Date(currentStatus.lastTest).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Next Scheduled Test:</p>
                <p className="text-lg">{new Date(currentStatus.nextScheduledTest).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Recovery Point Objective (RPO):</p>
                <p className="text-lg">{currentStatus.recoveryPointObjective}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Recovery Time Objective (RTO):</p>
                <p className="text-lg">{currentStatus.recoveryTimeObjective}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Notes:</p>
                <p className="text-lg">{currentStatus.notes}</p>
              </div>
            </>
          ) : (
            <p>No disaster recovery status available.</p>
          )}
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => setIsTestDialogOpen(true)}
                disabled={testMutation.isLoading}
              >
                {testMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Initiate Disaster Recovery Test
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Test Initiation</DialogTitle>
                <DialogDescription>
                  Are you sure you want to initiate a disaster recovery test? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsTestDialogOpen(false)} disabled={testMutation.isLoading}>
                  Cancel
                </Button>
                <Button
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isLoading}
                >
                  {testMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirm Test
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
};

export default DisasterRecoveryModule;