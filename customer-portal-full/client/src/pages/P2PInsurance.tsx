import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card';
import {
  Button
} from '@/components/ui/button';
import {
  Input
} from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';

// false fallback data

const P2PInsurance: React.FC = () => {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [isContributeDialogOpen, setIsContributeDialogOpen] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [contributionAmount, setContributionAmount] = useState<number>(0);

  const { data: pools, isLoading, isError, error, refetch } = trpc.p2p.pools.useQuery();
  const joinPoolMutation = trpc.p2p.join.useMutation();
  const contributeMutation = trpc.p2p.contribute.useMutation();

  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <p>Please log in to view P2P Insurance pools.</p>;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isError) {
    toast.error(`Error loading P2P pools: ${error?.message || 'Unknown error'}`);
  }

  const displayPools = (pools || []);

  return (
    <P2PInsuranceContent
      pools={displayPools}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      filterStatus={filterStatus}
      setFilterStatus={setFilterStatus}
      setIsJoinDialogOpen={setIsJoinDialogOpen}
      setIsContributeDialogOpen={setIsContributeDialogOpen}
      setSelectedPoolId={setSelectedPoolId}
      joinPoolMutation={joinPoolMutation}
      contributeMutation={contributeMutation}
      contributionAmount={contributionAmount}
      setContributionAmount={setContributionAmount}
      isJoinDialogOpen={isJoinDialogOpen}
      isContributeDialogOpen={isContributeDialogOpen}
      selectedPoolId={selectedPoolId}
      refetchPools={refetch}
    />
  );
};

interface P2PInsuranceContentProps {
  pools: any[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterStatus: string;
  setFilterStatus: (status: string) => void;
  setIsJoinDialogOpen: (isOpen: boolean) => void;
  setIsContributeDialogOpen: (isOpen: boolean) => void;
  setSelectedPoolId: (id: string | null) => void;
  joinPoolMutation: ReturnType<typeof trpc.p2p.join.useMutation>;
  contributeMutation: ReturnType<typeof trpc.p2p.contribute.useMutation>;
  contributionAmount: number;
  setContributionAmount: (amount: number) => void;
  isJoinDialogOpen: boolean;
  isContributeDialogOpen: boolean;
  selectedPoolId: string | null;
  refetchPools: () => void;
}

const P2PInsuranceContent: React.FC<P2PInsuranceContentProps> = ({
  pools,
  searchQuery,
  setSearchQuery,
  filterStatus,
  setFilterStatus,
  setIsJoinDialogOpen,
  setIsContributeDialogOpen,
  setSelectedPoolId,
  joinPoolMutation,
  contributeMutation,
  contributionAmount,
  setContributionAmount,
  isJoinDialogOpen,
  isContributeDialogOpen,
  selectedPoolId,
  refetchPools,
}) => {
  const trpcUtils = trpc.useUtils();

  const filteredPools = pools.filter(pool => {
    const matchesSearch = pool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        pool.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || pool.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleJoinPool = async () => {
    if (!selectedPoolId) return;
    try {
      await joinPoolMutation.mutateAsync({ poolId: selectedPoolId });
      toast.success('Successfully joined the pool!');
      trpcUtils.p2p.pools.invalidate();
      refetchPools();
      setIsJoinDialogOpen(false);
    } catch (err: any) {
      toast.error(`Failed to join pool: ${err.message || 'Unknown error'}`);
    }
  };

  const handleContribute = async () => {
    if (!selectedPoolId || contributionAmount <= 0) {
      toast.error('Please select a pool and enter a valid contribution amount.');
      return;
    }
    try {
      await contributeMutation.mutateAsync({ poolId: selectedPoolId, amount: contributionAmount });
      toast.success('Contribution successful!');
      trpcUtils.p2p.pools.invalidate();
      refetchPools();
      setIsContributeDialogOpen(false);
      setContributionAmount(0);
    } catch (err: any) {
      toast.error(`Failed to contribute: ${err.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>P2P Insurance Pools</CardTitle>
          <CardDescription>Browse and manage community-driven insurance pools.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <Input
              placeholder="Search pools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-grow"
            />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pool Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Target/Current Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPools.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">No pools found.</TableCell>
                </TableRow>
              ) : (
                filteredPools.map((pool) => (
                  <TableRow key={pool.id}>
                    <TableCell className="font-medium">{pool.name}</TableCell>
                    <TableCell>{pool.description}</TableCell>
                    <TableCell>{pool.members}</TableCell>
                    <TableCell>{`${pool.currentAmount} / ${pool.targetAmount}`}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs ${pool.status === 'active' ? 'bg-green-100 text-green-800' : pool.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                        {pool.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Dialog open={isJoinDialogOpen && selectedPoolId === pool.id} onOpenChange={setIsJoinDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mr-2"
                            onClick={() => {
                              setSelectedPoolId(pool.id);
                              setIsJoinDialogOpen(true);
                            }}
                          >
                            Join
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Join Pool: {pool.name}</DialogTitle>
                            <DialogDescription>Are you sure you want to join this P2P insurance pool?</DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsJoinDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleJoinPool} disabled={joinPoolMutation.isLoading}>
                              {joinPoolMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Confirm Join
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Dialog open={isContributeDialogOpen && selectedPoolId === pool.id} onOpenChange={setIsContributeDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedPoolId(pool.id);
                              setIsContributeDialogOpen(true);
                            }}
                          >
                            Contribute
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Contribute to Pool: {pool.name}</DialogTitle>
                            <DialogDescription>Enter the amount you wish to contribute.</DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <Input
                              id="amount"
                              type="number"
                              value={contributionAmount}
                              onChange={(e) => setContributionAmount(parseFloat(e.target.value))}
                              className="col-span-3"
                            />
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsContributeDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleContribute} disabled={contributeMutation.isLoading || contributionAmount <= 0}>
                              {contributeMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Confirm Contribution
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default P2PInsurance;