import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface Trigger {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  threshold: string;
  payout: string;
}

export default function ParametricInsurance() {
  const { isAuthenticated } = useAuth();
  const [selectedTriggerId, setSelectedTriggerId] = useState<string>('');
  const [claimDetails, setClaimDetails] = useState<string>('');

  const { data: triggers, isLoading: isLoadingTriggers, error: triggersError } = trpc.parametric.triggers.useQuery();
  const claimMutation = trpc.parametric.claim.useMutation();
  const utils = trpc.useUtils();

  if (!isAuthenticated) {
    return <div className="p-4 text-center text-red-500">Please log in to access parametric insurance services.</div>;
  }

  if (isLoadingTriggers) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading triggers...</span>
      </div>
    );
  }

  if (triggersError) {
    toast.error(`Failed to load triggers: ${triggersError.message}`);
    return <div className="p-4 text-center text-red-500">Error loading parametric triggers.</div>;
  }

  const handleClaimSubmission = async () => {
    if (!selectedTriggerId || !claimDetails) {
      toast.warning('Please select a trigger and provide claim details.');
      return;
    }

    try {
      await claimMutation.mutateAsync({
        triggerId: selectedTriggerId,
        details: claimDetails,
      });
      toast.success('Parametric claim submitted successfully!');
      setSelectedTriggerId('');
      setClaimDetails('');
      utils.parametric.triggers.invalidate(); // Invalidate to potentially show updated trigger statuses
    } catch (error: any) {
      toast.error(`Failed to submit claim: ${error.message}`);
    }
  };

  const displayTriggers = triggers || [];

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-3xl font-bold">Parametric Insurance</h1>

      <Card>
        <CardHeader>
          <CardTitle>Available Triggers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayTriggers.length > 0 ? (
              displayTriggers.map((trigger) => (
                <Card key={trigger.id} className="p-4">
                  <h3 className="text-lg font-semibold">{trigger.name}</h3>
                  <p className="text-sm text-gray-600">{trigger.description}</p>
                  <p className="text-sm">Threshold: <strong>{trigger.threshold}</strong></p>
                  <p className="text-sm">Payout: <strong>{trigger.payout}</strong></p>
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${trigger.status === 'active' ? 'bg-green-50 text-green-700 ring-green-600/20' : 'bg-red-50 text-red-700 ring-red-600/20'}`}
                  >
                    {trigger.status.charAt(0).toUpperCase() + trigger.status.slice(1)}
                  </span>
                </Card>
              ))
            ) : (
              <p>No parametric triggers available.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submit Parametric Claim</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label htmlFor="trigger-select" className="block text-sm font-medium text-gray-700">Select Trigger</label>
              <Select value={selectedTriggerId} onValueChange={setSelectedTriggerId}>
                <SelectTrigger id="trigger-select" className="w-full">
                  <SelectValue placeholder="Select a trigger" />
                </SelectTrigger>
                <SelectContent>
                  {displayTriggers.map((trigger) => (
                    <SelectItem key={trigger.id} value={trigger.id}>
                      {trigger.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="claim-details" className="block text-sm font-medium text-gray-700">Claim Details</label>
              <Input
                id="claim-details"
                placeholder="Provide details relevant to the claim event"
                value={claimDetails}
                onChange={(e) => setClaimDetails(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={handleClaimSubmission} disabled={claimMutation.isPending || !selectedTriggerId || !claimDetails}>
            {claimMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Claim
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}