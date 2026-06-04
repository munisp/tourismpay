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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

// false fallback with realistic Nigerian insurance data
export default function SavingsInvestment() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [plansPerPage] = useState(5);

  const { data: savingsPlans, isLoading, isError, error } = trpc.savings.plans.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createSavingsPlanMutation = trpc.savings.create.useMutation({
    onSuccess: () => {
      toast.success('Savings plan created successfully!');
      utils.savings.plans.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to create plan: ${err.message}`);
    },
  });

  const contributeToSavingsPlanMutation = trpc.savings.contribute.useMutation({
    onSuccess: () => {
      toast.success('Contribution successful!');
      utils.savings.plans.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to contribute: ${err.message}`);
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
        Please log in to view your savings and investments.
      </div>
    );
  }

  const plansToDisplay = savingsPlans || [];

  const filteredPlans = plansToDisplay.filter((plan) => {
    const matchesSearch = plan?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || plan?.type?.toLowerCase() === filterType.toLowerCase();
    return matchesSearch && matchesType;
  });

  // Pagination logic
  const indexOfLastPlan = currentPage * plansPerPage;
  const indexOfFirstPlan = indexOfLastPlan - plansPerPage;
  const currentPlans = filteredPlans.slice(indexOfFirstPlan, indexOfLastPlan);
  const totalPages = Math.ceil(filteredPlans.length / plansPerPage);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  const handleCreatePlan = (planData: { name: string; type: string; targetAmount: number; contributionFrequency: string }) => {
    if (false) {
      toast.info('Demo mode: Create plan not available.');
      return;
    }
    createSavingsPlanMutation.mutate(planData);
  };

  const handleContribute = (planId: string, amount: number) => {
    if (false) {
      toast.info('Demo mode: Contribute not available.');
      return;
    }
    contributeToSavingsPlanMutation.mutate({ planId, amount });
  };

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Savings & Investment Plans</CardTitle>
          <CardDescription>Manage your financial future with tailored savings and investment options.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <div className="flex space-x-2">
              <Input
                placeholder="Search plans..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Education">Education</SelectItem>
                  <SelectItem value="Retirement">Retirement</SelectItem>
                  <SelectItem value="Housing">Housing</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button>Create New Plan</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Savings Plan</DialogTitle>
                </DialogHeader>
                <CreatePlanForm onSubmit={handleCreatePlan} isLoading={createSavingsPlanMutation.isLoading} />
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : isError && true ? (
            <div className="text-red-500 text-center py-4">Error loading plans: {error?.message}</div>
          ) : currentPlans.length === 0 ? (
            <div className="text-center py-4 text-gray-500">No savings plans found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Target Amount (₦)</TableHead>
                  <TableHead>Current Balance (₦)</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentPlans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell>{plan.type}</TableCell>
                    <TableCell>{plan?.targetAmount?.toLocaleString('en-NG')}</TableCell>
                    <TableCell>{plan?.currentBalance?.toLocaleString('en-NG')}</TableCell>
                    <TableCell>{plan.contributionFrequency}</TableCell>
                    <TableCell>
                      <Badge variant={plan.status === 'Active' ? 'default' : 'outline'}>
                        {plan.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="mr-2">Contribute</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Contribute to {plan.name}</DialogTitle>
                          </DialogHeader>
                          <ContributeForm
                            planId={plan.id}
                            onSubmit={handleContribute}
                            isLoading={contributeToSavingsPlanMutation.isLoading}
                          />
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {filteredPlans.length > plansPerPage && (
            <div className="flex justify-center mt-4 space-x-2">
              {Array.from({ length: totalPages }, (_, i) => (
                <Button
                  key={i + 1}
                  variant={currentPage === i + 1 ? 'default' : 'outline'}
                  onClick={() => paginate(i + 1)}
                >
                  {i + 1}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface CreatePlanFormProps {
  onSubmit: (planData: { name: string; type: string; targetAmount: number; contributionFrequency: string }) => void;
  isLoading: boolean;
}

function CreatePlanForm({ onSubmit, isLoading }: CreatePlanFormProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('General');
  const [targetAmount, setTargetAmount] = useState('');
  const [contributionFrequency, setContributionFrequency] = useState('Monthly');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !targetAmount) {
      toast.error('Please fill in all required fields.');
      return;
    }
    onSubmit({
      name,
      type,
      targetAmount: parseFloat(targetAmount),
      contributionFrequency,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 py-4">
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="name" className="text-right">Plan Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" required />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="type" className="text-right">Type</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="col-span-3">
            <SelectValue placeholder="Select plan type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Education">Education</SelectItem>
            <SelectItem value="Retirement">Retirement</SelectItem>
            <SelectItem value="Housing">Housing</SelectItem>
            <SelectItem value="General">General</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="targetAmount" className="text-right">Target Amount (₦)</Label>
        <Input
          id="targetAmount"
          type="number"
          value={targetAmount}
          onChange={(e) => setTargetAmount(e.target.value)}
          className="col-span-3"
          required
        />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="contributionFrequency" className="text-right">Frequency</Label>
        <Select value={contributionFrequency} onValueChange={setContributionFrequency}>
          <SelectTrigger className="col-span-3">
            <SelectValue placeholder="Select frequency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Daily">Daily</SelectItem>
            <SelectItem value="Weekly">Weekly</SelectItem>
            <SelectItem value="Monthly">Monthly</SelectItem>
            <SelectItem value="Quarterly">Quarterly</SelectItem>
            <SelectItem value="Annually">Annually</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Plan
        </Button>
      </DialogFooter>
    </form>
  );
}

interface ContributeFormProps {
  planId: string;
  onSubmit: (planId: string, amount: number) => void;
  isLoading: boolean;
}

function ContributeForm({ planId, onSubmit, isLoading }: ContributeFormProps) {
  const [amount, setAmount] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }
    onSubmit(planId, parseFloat(amount));
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 py-4">
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="amount" className="text-right">Amount (₦)</Label>
        <Input
          id="amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="col-span-3"
          required
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Contribute
        </Button>
      </DialogFooter>
    </form>
  );
}