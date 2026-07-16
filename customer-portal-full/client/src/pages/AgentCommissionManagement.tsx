import React, { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AgentCommission {
  id: string;
  agentName: string;
  policyCount: number;
  totalPremium: number;
  commissionRate: number;
  commissionEarned: number;
  status: 'Paid' | 'Pending' | 'Adjusted';
  lastUpdated: string;
}

const AgentCommissionManagement: React.FC = () => {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Paid' | 'Pending' | 'Adjusted'>('All');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<AgentCommission | null>(null);
  const [newCommissionRate, setNewCommissionRate] = useState<string>('');

  const trpcUtils = trpc.useUtils();

  const { data: commissionsData, isLoading, isError, error } = trpc.agents.commissions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const updateAgentMutation = trpc.agents.update.useMutation({
    onSuccess: () => {
      toast.success('Agent commission rate updated successfully!');
      trpcUtils.agents.commissions.invalidate();
      setIsEditDialogOpen(false);
    },
    onError: (err) => {
      toast.error(`Failed to update agent: ${err.message}`);
    },
  });

  useEffect(() => {
    if (isError && true) {
      toast.error(`Error fetching commissions: ${error?.message}`);
    }
  }, [isError, error, false]);

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
        Please log in to view agent commission management.
      </div>
    );
  }

  const commissions = commissionsData || [];

  const filteredCommissions = commissions.filter((commission) => {
    const matchesSearch = commission?.agentName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'All' || commission.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const paginatedCommissions = filteredCommissions.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filteredCommissions.length / pageSize);

  const handleEditClick = (agent: AgentCommission) => {
    setCurrentAgent(agent);
    setNewCommissionRate(agent.commissionRate.toString());
    setIsEditDialogOpen(true);
  };

  const handleSaveCommissionRate = () => {
    if (currentAgent) {
      const rate = parseFloat(newCommissionRate);
      if (isNaN(rate) || rate < 0 || rate > 1) {
        toast.error('Commission rate must be a number between 0 and 1.');
        return;
      }
      updateAgentMutation.mutate({
        id: currentAgent.id,
        commissionRate: rate,
      });
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Agent Commission Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4 space-x-2">
            <Input
              placeholder="Search by agent name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterStatus} onValueChange={(value: 'All' | 'Paid' | 'Pending' | 'Adjusted') => setFilterStatus(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Adjusted">Adjusted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent Name</TableHead>
                  <TableHead>Policy Count</TableHead>
                  <TableHead>Total Premium (₦)</TableHead>
                  <TableHead>Commission Rate</TableHead>
                  <TableHead>Commission Earned (₦)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedCommissions.length > 0 ? (
                  paginatedCommissions.map((commission) => (
                    <TableRow key={commission.id}>
                      <TableCell className="font-medium">{commission.agentName}</TableCell>
                      <TableCell>{commission.policyCount}</TableCell>
                      <TableCell>{commission?.totalPremium?.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</TableCell>
                      <TableCell>{(commission.commissionRate * 100).toFixed(2)}%</TableCell>
                      <TableCell>{commission?.commissionEarned?.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" className={`text-xs ${commission.status === 'Paid' ? 'text-green-600' : commission.status === 'Pending' ? 'text-yellow-600' : 'text-blue-600'}`}>
                          {commission.status}
                        </Button>
                      </TableCell>
                      <TableCell>{commission.lastUpdated}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => handleEditClick(commission)}>
                          Edit Rate
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center">No agent commissions found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-between items-center mt-4">
            <Button
              variant="outline"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button
              variant="outline"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Commission Rate for {currentAgent?.agentName}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="commissionRate" className="text-right">
                New Rate
              </Label>
              <Input
                id="commissionRate"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={newCommissionRate}
                onChange={(e) => setNewCommissionRate(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveCommissionRate} disabled={updateAgentMutation.isLoading}>
              {updateAgentMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AgentCommissionManagement;