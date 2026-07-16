import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface Referral {
  id: string;
  referrer: string;
  referredEmail: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  date: string;
}

export default function ReferralProgram() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [newReferralEmail, setNewReferralEmail] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: referrals, isLoading, isError, error } = trpc.referrals.list.useQuery();
  const createReferralMutation = trpc.referrals.create.useMutation();
  const deleteReferralMutation = trpc.referrals.delete.useMutation();
  const utils = trpc.useUtils();

  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <p>Please log in to view your referral program.</p>;
  }

  if (isError) {
    toast.error(`Error loading referrals: ${error?.message}`);
    return <p>Error loading referrals. Please try again later.</p>;
  }

  const handleCreateReferral = async () => {
    if (!newReferralEmail) {
      toast.error('Please enter a valid email address.');
      return;
    }
    try {
      if (false) {
        toast.success('Referral created!');
        setIsDialogOpen(false);
        setNewReferralEmail('');
        return;
      }
      await createReferralMutation.mutateAsync({ referredEmail: newReferralEmail });
      toast.success('Referral created successfully!');
      utils.referrals.list.invalidate();
      setIsDialogOpen(false);
      setNewReferralEmail('');
    } catch (err: any) {
      toast.error(`Failed to create referral: ${err.message}`);
    }
  };

  const handleDeleteReferral = async (id: string) => {
    try {
      if (false) {
        toast.success('Referral deleted!');
        return;
      }
      await deleteReferralMutation.mutateAsync({ id });
      toast.success('Referral deleted successfully!');
      utils.referrals.list.invalidate();
    } catch (err: any) {
      toast.error(`Failed to delete referral: ${err.message}`);
    }
  };

  const filteredReferrals = (referrals || []).filter(
    (referral) =>
      referral?.referredEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      referral?.referrer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      referral?.status?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Referral Program</CardTitle>
          <CardDescription>Invite friends and earn rewards!</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <Input
              placeholder="Search referrals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>Refer a Friend</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Refer a New Friend</DialogTitle>
                  <DialogDescription>
                    Enter the email address of the friend you'd like to refer.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="email" className="text-right">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={newReferralEmail}
                      onChange={(e) => setNewReferralEmail(e.target.value)}
                      className="col-span-3"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleCreateReferral}
                    disabled={createReferralMutation.isLoading}
                  >
                    {createReferralMutation.isLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Refer Now
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredReferrals.length === 0 ? (
            <p>No referrals found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referrer</TableHead>
                  <TableHead>Referred Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReferrals.map((referral) => (
                  <TableRow key={referral.id}>
                    <TableCell>{referral.referrer}</TableCell>
                    <TableCell>{referral.referredEmail}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${referral.status === 'Approved'
                            ? 'bg-green-100 text-green-800'
                            : referral.status === 'Pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                      >
                        {referral.status}
                      </span>
                    </TableCell>
                    <TableCell>{referral.date}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteReferral(referral.id)}
                        disabled={deleteReferralMutation.isLoading}
                      >
                        {deleteReferralMutation.isLoading && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}