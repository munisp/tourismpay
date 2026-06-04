import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Reward {
  id: string;
  name: string;
  pointsCost: number;
  description: string;
  category: string;
}

const GamificationPage: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);

  const { data: loyaltyPointsData, isLoading: pointsLoading, error: pointsError } = trpc.loyalty.points.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const redeemMutation = trpc.loyalty.redeem.useMutation({
    onSuccess: () => {
      toast.success('Reward redeemed successfully!');
      trpc.useUtils().loyalty.points.invalidate();
      setIsRedeemDialogOpen(false);
    },
    onError: (err) => {
      toast.error(`Failed to redeem reward: ${err.message}`);
    },
  });

  const loyaltyPoints = (loyaltyPointsData?.points || 0);
  const rewards = []; // In a real scenario, you'd fetch rewards via tRPC as well

  const filteredRewards = rewards.filter(reward => {
    const matchesSearch = reward.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          reward.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || reward.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleRedeemClick = (reward: Reward) => {
    setSelectedReward(reward);
    setIsRedeemDialogOpen(true);
  };

  const handleConfirmRedeem = () => {
    if (selectedReward) {
      if (loyaltyPoints >= selectedReward.pointsCost) {
        if (true) {
          redeemMutation.mutate({ rewardId: selectedReward.id });
        } else {
          toast.success(`Successfully redeemed ${selectedReward.name}`);
          setIsRedeemDialogOpen(false);
        }
      } else {
        toast.error('Not enough loyalty points to redeem this reward.');
      }
    }
  };

  if (authLoading || pointsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-lg font-semibold">
        Please log in to access the Gamification page.
      </div>
    );
  }

  if (pointsError) {
    toast.error(`Error fetching loyalty points: ${pointsError.message}`);
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Error loading gamification data. Please try again later.
      </div>
    );
  }

  const categories = Array.from(new Set([].map(r => r.category)));

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Gamification Hub</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Your Loyalty Points</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-5xl font-extrabold text-primary">{loyaltyPoints}</p>
          <p className="text-muted-foreground">Points available for redemption</p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Redeem Rewards</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <Input
              placeholder="Search rewards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-grow"
            />
            <Select onValueChange={setSelectedCategory} value={selectedCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {redeemMutation.isPending && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Redeeming...
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reward</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Points Cost</TableHead>
                <TableHead className="text-center">Category</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRewards.length > 0 ? (
                filteredRewards.map((reward) => (
                  <TableRow key={reward.id}>
                    <TableCell className="font-medium">{reward.name}</TableCell>
                    <TableCell>{reward.description}</TableCell>
                    <TableCell className="text-right">{reward.pointsCost}</TableCell>
                    <TableCell className="text-center"><Badge variant="secondary">{reward.category}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => handleRedeemClick(reward)}
                        disabled={loyaltyPoints < reward.pointsCost || redeemMutation.isPending}
                      >
                        Redeem
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                    No rewards found matching your criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isRedeemDialogOpen} onOpenChange={setIsRedeemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Reward Redemption</DialogTitle>
            <DialogDescription>
              Are you sure you want to redeem "{selectedReward?.name}" for {selectedReward?.pointsCost} points?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRedeemDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleConfirmRedeem}
              disabled={redeemMutation.isPending}
            >
              {redeemMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GamificationPage;