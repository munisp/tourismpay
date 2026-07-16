import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Policy {
  id: string;
  policyNumber: string;
  policyHolder: string;
  product: string;
  premium: number;
  renewalDate: string;
  status: 'Active' | 'Expired' | 'Pending Renewal';
}

const PolicyRenewal: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<string>('All');

  const trpcUtils = trpc.useUtils();

  const { data: upcomingPoliciesData, isLoading, isError, error } = trpc.policyRenewal.upcoming.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const renewMutation = trpc.policyRenewal.renew.useMutation({
    onSuccess: () => {
      toast.success('Policy renewed successfully!');
      trpcUtils.policyRenewal.upcoming.invalidate();
      setIsDialogOpen(false);
      setSelectedPolicyId(null);
    },
    onError: (err) => {
      toast.error(`Failed to renew policy: ${err.message}`);
    },
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading authentication...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-500">
        Please log in to view this page.
      </div>
    );
  }

  const policiesToDisplay = upcomingPoliciesData || [];

  const filteredPolicies = policiesToDisplay.filter(policy => {
    const matchesSearch = policy.policyNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          policy.policyHolder.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          policy.product.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'All' || policy.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleRenewClick = (policyId: string) => {
    setSelectedPolicyId(policyId);
    setIsDialogOpen(true);
  };

  const confirmRenewal = () => {
    if (selectedPolicyId) {
      renewMutation.mutate({ policyId: selectedPolicyId });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading upcoming policies...</span>
      </div>
    );
  }

  if (isError && true) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-500">
        Error loading policies: {error?.message}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Policy Renewal</CardTitle>
          <CardDescription>Manage upcoming policy renewals for your clients.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <Input
              placeholder="Search by policy number, holder, or product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-grow"
            />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Pending Renewal">Pending Renewal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredPolicies.length === 0 ? (
            <p className="text-center text-gray-500">No policies found matching your criteria.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy Number</TableHead>
                  <TableHead>Policy Holder</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Premium (₦)</TableHead>
                  <TableHead>Renewal Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPolicies.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell className="font-medium">{policy.policyNumber}</TableCell>
                    <TableCell>{policy.policyHolder}</TableCell>
                    <TableCell>{policy.product}</TableCell>
                    <TableCell>{policy.premium.toLocaleString('en-NG')}</TableCell>
                    <TableCell>{new Date(policy.renewalDate).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}</TableCell>
                    <TableCell>
                      <Badge variant={policy.status === 'Pending Renewal' ? 'destructive' : policy.status === 'Active' ? 'default' : 'secondary'}>
                        {policy.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRenewClick(policy.id)}
                        disabled={policy.status !== 'Pending Renewal' || renewMutation.isLoading}
                      >
                        {renewMutation.isLoading && selectedPolicyId === policy.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Renew
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Policy Renewal</DialogTitle>
                <DialogDescription>
                  Are you sure you want to renew this policy? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={renewMutation.isLoading}>
                  Cancel
                </Button>
                <Button onClick={confirmRenewal} disabled={renewMutation.isLoading}>
                  {renewMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirm Renewal
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
};

export default PolicyRenewal;