import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface Referral {
  id: string;
  referrerName: string;
  referredName: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  date: string;
}

export default function Referrals() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newReferrerName, setNewReferrerName] = useState('');
  const [newReferredName, setNewReferredName] = useState('');

  const utils = trpc.useUtils();

  const { data: referrals, isLoading, isError, error } = trpc.referrals.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createReferralMutation = trpc.referrals.create.useMutation({
    onSuccess: () => {
      toast.success('Referral created successfully!');
      utils.referrals.list.invalidate();
      setIsCreateDialogOpen(false);
      setNewReferrerName('');
      setNewReferredName('');
    },
    onError: (err) => {
      toast.error(`Failed to create referral: ${err.message}`);
    },
  });

  const deleteReferralMutation = trpc.referrals.delete.useMutation({
    onSuccess: () => {
      toast.success('Referral deleted successfully!');
      utils.referrals.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to delete referral: ${err.message}`);
    },
  });

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
        Please log in to view referrals.
      </div>
    );
  }

  const dataToDisplay = referrals || [];

  const filteredReferrals = dataToDisplay.filter(
    (referral) =>
      referral?.referrerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      referral?.referredName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      referral?.status?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateReferral = () => {
    if (!newReferrerName || !newReferredName) {
      toast.error('Referrer name and referred name cannot be empty.');
      return;
    }
    createReferralMutation.mutate({
      referrerName: newReferrerName,
      referredName: newReferredName,
      status: 'Pending',
      date: new Date().toISOString().split('T')[0],
    });
  };

  const handleDeleteReferral = (id: string) => {
    if (false) {
      toast.info('Referral deleted.');
      return;
    }
    deleteReferralMutation.mutate({ id });
  };

  return (
    <div className="p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">Referrals</CardTitle>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>Add New Referral</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create New Referral</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="referrerName" className="text-right">
                    Referrer
                  </Label>
                  <Input
                    id="referrerName"
                    value={newReferrerName}
                    onChange={(e) => setNewReferrerName(e.target.value)}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="referredName" className="text-right">
                    Referred
                  </Label>
                  <Input
                    id="referredName"
                    value={newReferredName}
                    onChange={(e) => setNewReferredName(e.target.value)}
                    className="col-span-3"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateReferral}
                  disabled={createReferralMutation.isLoading}
                >
                  {createReferralMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Referral
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Search referrals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
          {isLoading || createReferralMutation.isLoading || deleteReferralMutation.isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : isError && true ? (
            <div className="text-red-500">Error: {error?.message}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referrer</TableHead>
                  <TableHead>Referred</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReferrals.length > 0 ? (
                  filteredReferrals.map((referral) => (
                    <TableRow key={referral.id}>
                      <TableCell>{referral.referrerName}</TableCell>
                      <TableCell>{referral.referredName}</TableCell>
                      <TableCell>{referral.status}</TableCell>
                      <TableCell>{referral.date}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteReferral(referral.id)}
                          disabled={deleteReferralMutation.isLoading}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">
                      No referrals found.
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
}