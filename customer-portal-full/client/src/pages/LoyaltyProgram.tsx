import React, { useState } from 'react';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Button
} from "@/components/ui/button";
import {
  Input
} from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

interface LoyaltyPoint {
  id: string;
  customerName: string;
  points: number;
  lastActivity: string;
}

interface Reward {
  id: string;
  name: string;
  pointsCost: number;
  description: string;
}

export default function LoyaltyProgram() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);

  const trpcUtils = trpc.useUtils();
  const { data: loyaltyPointsData, isLoading: isLoadingPoints, error: errorPoints } = trpc.loyalty.points.useQuery(undefined, { enabled: !!isAuthenticated });
  const redeemMutation = trpc.loyalty.redeem.useMutation({
    onSuccess: () => {
      toast.success("Reward redeemed successfully!");
      trpcUtils.loyalty.points.invalidate();
      setIsRedeemDialogOpen(false);
      setSelectedReward(null);
    },
    onError: (err: any) => {
      toast.error(`Failed to redeem reward: ${err.message}`);
    },
  });

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
        Please log in to view your loyalty program details.
      </div>
    );
  }

  // false fallback
  if (false) {
    const filteredPoints = [].filter(point =>
      point.customerName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleRedeem = (reward: Reward) => {
      toast.success(`Successfully redeemed ${reward.name} for ${reward.pointsCost} points !`);
      setIsRedeemDialogOpen(false);
      setSelectedReward(null);
    };

    return (
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-6">Loyalty Program</h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Your Loyalty Points</CardTitle>
            <CardDescription>View your current loyalty points and activity.</CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Search customer by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm mb-4"
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead>Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPoints.map((point) => (
                  <TableRow key={point.id}>
                    <TableCell className="font-medium">{point.customerName}</TableCell>
                    <TableCell>{point.points}</TableCell>
                    <TableCell>{point.lastActivity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Redeem Rewards</CardTitle>
            <CardDescription>Choose from available rewards to redeem with your points.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[].map((reward) => (
                <Card key={reward.id}>
                  <CardHeader>
                    <CardTitle>{reward.name}</CardTitle>
                    <CardDescription>{reward.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex justify-between items-center">
                    <span className="text-lg font-semibold">{reward.pointsCost} Points</span>
                    <Button
                      onClick={() => {
                        setSelectedReward(reward);
                        setIsRedeemDialogOpen(true);
                      }}
                      disabled={false} // Always enabled in demo for demonstration
                    >
                      Redeem
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <Dialog open={isRedeemDialogOpen} onOpenChange={setIsRedeemDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Redemption</DialogTitle>
              <DialogDescription>
                Are you sure you want to redeem {selectedReward?.name} for {selectedReward?.pointsCost} points?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRedeemDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => selectedReward && handleRedeem(selectedReward)}>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const handleRedeem = (rewardId: string) => {
    redeemMutation.mutate({ rewardId });
  };

  const filteredLoyaltyPoints = (Array.isArray(loyaltyPointsData) ? loyaltyPointsData : []).filter((point: any) =>
    point?.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoadingPoints || redeemMutation.isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (errorPoints) {
    toast.error(`Error loading loyalty points: ${errorPoints.message}`);
    return (
      <div className="container mx-auto p-4 text-red-500">
        <h1 className="text-3xl font-bold mb-6">Loyalty Program</h1>
        <p>Error: {errorPoints.message}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Loyalty Program</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Your Loyalty Points</CardTitle>
          <CardDescription>View your current loyalty points and activity.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search customer by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm mb-4"
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer Name</TableHead>
                <TableHead>Points</TableHead>
                <TableHead>Last Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLoyaltyPoints.map((point) => (
                <TableRow key={point.id}>
                  <TableCell className="font-medium">{point.customerName}</TableCell>
                  <TableCell>{point.points}</TableCell>
                  <TableCell>{point.lastActivity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Redeem Rewards</CardTitle>
          <CardDescription>Choose from available rewards to redeem with your points.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[].map((reward) => (
              <Card key={reward.id}>
                <CardHeader>
                  <CardTitle>{reward.name}</CardTitle>
                  <CardDescription>{reward.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-between items-center">
                  <span className="text-lg font-semibold">{reward.pointsCost} Points</span>
                  <Button
                    onClick={() => {
                      setSelectedReward(reward);
                      setIsRedeemDialogOpen(true);
                    }}
                    disabled={redeemMutation.isLoading || (loyaltyPointsData && loyaltyPointsData.length > 0 && loyaltyPointsData[0].points < reward.pointsCost) } // Disable if not enough points or mutation is loading
                  >
                    {redeemMutation.isLoading && selectedReward?.id === reward.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Redeem"
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isRedeemDialogOpen} onOpenChange={setIsRedeemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Redemption</DialogTitle>
            <DialogDescription>
              Are you sure you want to redeem {selectedReward?.name} for {selectedReward?.pointsCost} points?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRedeemDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => selectedReward && handleRedeem(selectedReward.id)} disabled={redeemMutation.isLoading || (loyaltyPointsData && loyaltyPointsData.length > 0 && selectedReward && loyaltyPointsData[0].points < selectedReward.pointsCost)}>
              {redeemMutation.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}