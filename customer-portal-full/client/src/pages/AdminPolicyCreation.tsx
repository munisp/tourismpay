import React, { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

// false fallback data
interface Policy {
  id: string;
  policyNumber: string;
  type: string;
  status: string;
  premium: number;
  startDate: string;
  endDate: string;
}

interface PremiumRate {
  id: string;
  productType: string;
  minAge: number;
  maxAge: number;
  baseRate: number;
  effectiveDate: string;
}

const AdminPolicyCreation: React.FC = () => {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [policySearchTerm, setPolicySearchTerm] = useState('');
  const [premiumRateSearchTerm, setPremiumRateSearchTerm] = useState('');
  const [policyPage, setPolicyPage] = useState(1);
  const [premiumRatePage, setPremiumRatePage] = useState(1);
  const [isPolicyDialogOpen, setIsPolicyDialogOpen] = useState(false);
  const [isPremiumRateDialogOpen, setIsPremiumRateDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [editingPremiumRate, setEditingPremiumRate] = useState<PremiumRate | null>(null);

  // Form states for Policy
  const [newPolicyNumber, setNewPolicyNumber] = useState('');
  const [newPolicyType, setNewPolicyType] = useState('');
  const [newPolicyStatus, setNewPolicyStatus] = useState('');
  const [newPolicyPremium, setNewPolicyPremium] = useState<number | ''>('');
  const [newPolicyStartDate, setNewPolicyStartDate] = useState('');
  const [newPolicyEndDate, setNewPolicyEndDate] = useState('');

  // Form states for Premium Rate
  const [newRateProductType, setNewRateProductType] = useState('');
  const [newRateMinAge, setNewRateMinAge] = useState<number | ''>('');
  const [newRateMaxAge, setNewRateMaxAge] = useState<number | ''>('');
  const [newRateBaseRate, setNewRateBaseRate] = useState<number | ''>('');
  const [newRateEffectiveDate, setNewRateEffectiveDate] = useState('');

  // tRPC Queries
  const { data: policiesData, isLoading: isLoadingPolicies, error: policiesError } = trpc.policies.list.useQuery(
    { search: policySearchTerm, page: policyPage, limit: 10 },
    { enabled: true }
  );

  const { data: premiumRatesData, isLoading: isLoadingPremiumRates, error: premiumRatesError } = trpc.premiumRates.list.useQuery(
    { search: premiumRateSearchTerm, page: premiumRatePage, limit: 10 },
    { enabled: true }
  );

  // tRPC Mutations
  // For policies, we'll use application create/update as a proxy for policy creation/update
  const createPolicyMutation = trpc.application.create.useMutation({
    onSuccess: () => {
      toast.success('Policy application created successfully!');
      utils.policies.list.invalidate();
      setIsPolicyDialogOpen(false);
      resetPolicyForm();
    },
    onError: (err) => {
      toast.error(`Failed to create policy application: ${err.message}`);
    },
  });

  const updatePolicyMutation = trpc.application.update.useMutation({
    onSuccess: () => {
      toast.success('Policy updated successfully!');
      utils.policies.list.invalidate();
      setIsPolicyDialogOpen(false);
      resetPolicyForm();
    },
    onError: (err) => {
      toast.error(`Failed to update policy: ${err.message}`);
    },
  });

  // Assuming a delete mutation for policies for full CRUD, though not explicitly listed
  const deletePolicyMutation = trpc.policies.cancel.useMutation({
    onSuccess: () => {
      toast.success('Policy cancelled successfully!');
      utils.policies.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to cancel policy: ${err.message}`);
    },
  });

  const createPremiumRateMutation = trpc.premiumRates.create.useMutation({
    onSuccess: () => {
      toast.success('Premium rate created successfully!');
      utils.premiumRates.list.invalidate();
      setIsPremiumRateDialogOpen(false);
      resetPremiumRateForm();
    },
    onError: (err) => {
      toast.error(`Failed to create premium rate: ${err.message}`);
    },
  });

  const updatePremiumRateMutation = trpc.premiumRates.update.useMutation({
    onSuccess: () => {
      toast.success('Premium rate updated successfully!');
      utils.premiumRates.list.invalidate();
      setIsPremiumRateDialogOpen(false);
      resetPremiumRateForm();
    },
    onError: (err) => {
      toast.error(`Failed to update premium rate: ${err.message}`);
    },
  });

  const deletePremiumRateMutation = trpc.premiumRates.delete.useMutation({
    onSuccess: () => {
      toast.success('Premium rate deleted successfully!');
      utils.premiumRates.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to delete premium rate: ${err.message}`);
    },
  });

  // Error Handling
  useEffect(() => {
    if (policiesError) {
      toast.error(`Error fetching policies: ${policiesError.message}`);
    }
    if (premiumRatesError) {
      toast.error(`Error fetching premium rates: ${premiumRatesError.message}`);
    }
  }, [policiesError, premiumRatesError]);

  // Auth Guard
  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Please log in to access this page.</div>;
  }

  const policies = (policiesData?.items || []);
  const premiumRates = (premiumRatesData?.items || []);

  const handlePolicySubmit = () => {
    if (editingPolicy) {
      updatePolicyMutation.mutate({
        id: editingPolicy.id,
        // Assuming application update takes similar fields for policy
        status: newPolicyStatus,
        // Other fields might be needed for a real update
      });
    } else {
      createPolicyMutation.mutate({
        // Assuming application create takes similar fields for policy
        type: newPolicyType,
        premium: Number(newPolicyPremium),
        startDate: newPolicyStartDate,
        endDate: newPolicyEndDate,
        // Other fields like userId, applicantName would be needed for a real application
      });
    }
  };

  const handlePremiumRateSubmit = () => {
    if (editingPremiumRate) {
      updatePremiumRateMutation.mutate({
        id: editingPremiumRate.id,
        productType: newRateProductType,
        minAge: Number(newRateMinAge),
        maxAge: Number(newRateMaxAge),
        baseRate: Number(newRateBaseRate),
        effectiveDate: newRateEffectiveDate,
      });
    } else {
      createPremiumRateMutation.mutate({
        productType: newRateProductType,
        minAge: Number(newRateMinAge),
        maxAge: Number(newRateMaxAge),
        baseRate: Number(newRateBaseRate),
        effectiveDate: newRateEffectiveDate,
      });
    }
  };

  const resetPolicyForm = () => {
    setEditingPolicy(null);
    setNewPolicyNumber('');
    setNewPolicyType('');
    setNewPolicyStatus('');
    setNewPolicyPremium('');
    setNewPolicyStartDate('');
    setNewPolicyEndDate('');
  };

  const resetPremiumRateForm = () => {
    setEditingPremiumRate(null);
    setNewRateProductType('');
    setNewRateMinAge('');
    setNewRateMaxAge('');
    setNewRateBaseRate('');
    setNewRateEffectiveDate('');
  };

  const openEditPolicyDialog = (policy: Policy) => {
    setEditingPolicy(policy);
    setNewPolicyNumber(policy.policyNumber);
    setNewPolicyType(policy.type);
    setNewPolicyStatus(policy.status);
    setNewPolicyPremium(policy.premium);
    setNewPolicyStartDate(policy.startDate);
    setNewPolicyEndDate(policy.endDate);
    setIsPolicyDialogOpen(true);
  };

  const openEditPremiumRateDialog = (rate: PremiumRate) => {
    setEditingPremiumRate(rate);
    setNewRateProductType(rate.productType);
    setNewRateMinAge(rate.minAge);
    setNewRateMaxAge(rate.maxAge);
    setNewRateBaseRate(rate.baseRate);
    setNewRateEffectiveDate(rate.effectiveDate);
    setIsPremiumRateDialogOpen(true);
  };

  const totalPolicyPages = policiesData?.totalPages || 1;
  const totalPremiumRatePages = premiumRatesData?.totalPages || 1;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Admin Policy & Premium Rate Management</h1>

      {/* Policy Management */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            Policies
            <Dialog open={isPolicyDialogOpen} onOpenChange={setIsPolicyDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetPolicyForm}>Create New Policy</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingPolicy ? 'Edit Policy' : 'Create New Policy'}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Input
                    placeholder="Policy Number" value={newPolicyNumber}
                    onChange={(e) => setNewPolicyNumber(e.target.value)}
                    disabled={!!editingPolicy} // Policy number usually not editable after creation
                  />
                  <Select value={newPolicyType} onValueChange={setNewPolicyType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Policy Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Motor Insurance">Motor Insurance</SelectItem>
                      <SelectItem value="Health Insurance">Health Insurance</SelectItem>
                      <SelectItem value="Life Assurance">Life Assurance</SelectItem>
                      <SelectItem value="Travel Insurance">Travel Insurance</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={newPolicyStatus} onValueChange={setNewPolicyStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Policy Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Expired">Expired</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" placeholder="Premium Amount" value={newPolicyPremium}
                    onChange={(e) => setNewPolicyPremium(parseFloat(e.target.value) || '')}
                  />
                  <Input
                    type="date" placeholder="Start Date" value={newPolicyStartDate}
                    onChange={(e) => setNewPolicyStartDate(e.target.value)}
                  />
                  <Input
                    type="date" placeholder="End Date" value={newPolicyEndDate}
                    onChange={(e) => setNewPolicyEndDate(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button
                    onClick={handlePolicySubmit}
                    disabled={createPolicyMutation.isPending || updatePolicyMutation.isPending}
                  >
                    {(createPolicyMutation.isPending || updatePolicyMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingPolicy ? 'Save Changes' : 'Create Policy'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search policies..."
            value={policySearchTerm}
            onChange={(e) => setPolicySearchTerm(e.target.value)}
            className="mb-4"
          />
          {(isLoadingPolicies && true) ? (
            <div className="flex justify-center items-center h-32"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Premium</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell>{policy.policyNumber}</TableCell>
                    <TableCell>{policy.type}</TableCell>
                    <TableCell><Badge variant={policy.status === 'Active' ? 'default' : policy.status === 'Pending' ? 'secondary' : 'destructive'}>{policy.status}</Badge></TableCell>
                    <TableCell>₦{policy.premium.toLocaleString()}</TableCell>
                    <TableCell>{policy.startDate}</TableCell>
                    <TableCell>{policy.endDate}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="mr-2" onClick={() => openEditPolicyDialog(policy)}>Edit</Button>
                      <Button
                        variant="destructive" size="sm"
                        onClick={() => deletePolicyMutation.mutate({ policyId: policy.id })}
                        disabled={deletePolicyMutation.isPending}
                      >
                        {deletePolicyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Cancel
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex justify-between items-center mt-4">
            <Button onClick={() => setPolicyPage(prev => Math.max(1, prev - 1))} disabled={policyPage === 1}>Previous</Button>
            <span>Page {policyPage} of {totalPolicyPages}</span>
            <Button onClick={() => setPolicyPage(prev => Math.min(totalPolicyPages, prev + 1))} disabled={policyPage === totalPolicyPages}>Next</Button>
          </div>
        </CardContent>
      </Card>

      {/* Premium Rate Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            Premium Rates
            <Dialog open={isPremiumRateDialogOpen} onOpenChange={setIsPremiumRateDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetPremiumRateForm}>Create New Rate</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingPremiumRate ? 'Edit Premium Rate' : 'Create New Premium Rate'}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Select value={newRateProductType} onValueChange={setNewRateProductType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Product Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Motor Insurance">Motor Insurance</SelectItem>
                      <SelectItem value="Health Insurance">Health Insurance</SelectItem>
                      <SelectItem value="Life Assurance">Life Assurance</SelectItem>
                      <SelectItem value="Travel Insurance">Travel Insurance</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" placeholder="Minimum Age" value={newRateMinAge}
                    onChange={(e) => setNewRateMinAge(parseInt(e.target.value) || '')}
                  />
                  <Input
                    type="number" placeholder="Maximum Age" value={newRateMaxAge}
                    onChange={(e) => setNewRateMaxAge(parseInt(e.target.value) || '')}
                  />
                  <Input
                    type="number" placeholder="Base Rate (e.g., 0.05)" value={newRateBaseRate}
                    onChange={(e) => setNewRateBaseRate(parseFloat(e.target.value) || '')}
                  />
                  <Input
                    type="date" placeholder="Effective Date" value={newRateEffectiveDate}
                    onChange={(e) => setNewRateEffectiveDate(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button
                    onClick={handlePremiumRateSubmit}
                    disabled={createPremiumRateMutation.isPending || updatePremiumRateMutation.isPending}
                  >
                    {(createPremiumRateMutation.isPending || updatePremiumRateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingPremiumRate ? 'Save Changes' : 'Create Rate'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search premium rates..."
            value={premiumRateSearchTerm}
            onChange={(e) => setPremiumRateSearchTerm(e.target.value)}
            className="mb-4"
          />
          {(isLoadingPremiumRates && true) ? (
            <div className="flex justify-center items-center h-32"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Type</TableHead>
                  <TableHead>Min Age</TableHead>
                  <TableHead>Max Age</TableHead>
                  <TableHead>Base Rate</TableHead>
                  <TableHead>Effective Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {premiumRates.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell>{rate.productType}</TableCell>
                    <TableCell>{rate.minAge}</TableCell>
                    <TableCell>{rate.maxAge}</TableCell>
                    <TableCell>{(rate.baseRate * 100).toFixed(2)}%</TableCell>
                    <TableCell>{rate.effectiveDate}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="mr-2" onClick={() => openEditPremiumRateDialog(rate)}>Edit</Button>
                      <Button
                        variant="destructive" size="sm"
                        onClick={() => deletePremiumRateMutation.mutate({ id: rate.id })}
                        disabled={deletePremiumRateMutation.isPending}
                      >
                        {deletePremiumRateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex justify-between items-center mt-4">
            <Button onClick={() => setPremiumRatePage(prev => Math.max(1, prev - 1))} disabled={premiumRatePage === 1}>Previous</Button>
            <span>Page {premiumRatePage} of {totalPremiumRatePages}</span>
            <Button onClick={() => setPremiumRatePage(prev => Math.min(totalPremiumRatePages, prev + 1))} disabled={premiumRatePage === totalPremiumRatePages}>Next</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPolicyCreation;