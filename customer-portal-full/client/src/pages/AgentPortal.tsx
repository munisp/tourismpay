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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface Agent {
  id: string;
  name: string;
  email: string;
  status: 'Active' | 'Inactive' | 'Pending';
  region: string;
  performanceScore: number;
  totalCommission: number;
}

const AgentPortal: React.FC = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Inactive' | 'Pending'>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [agentsPerPage] = useState(5);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  // tRPC queries
  const { data: agentsData, isLoading: isLoadingAgents, error: agentsError } = trpc.agents.list.useQuery();
  const { data: performanceData, isLoading: isLoadingPerformance, error: performanceError } = trpc.agents.performance.useQuery();
  const { data: commissionsData, isLoading: isLoadingCommissions, error: commissionsError } = trpc.agents.commissions.useQuery();

  // tRPC mutation
  const updateAgentMutation = trpc.agents.update.useMutation();
  const trpcUtils = trpc.useUtils();

  const agents = agentsData || [];
  const performanceMetrics = performanceData || {};
  const commissions = commissionsData || {};

  // Error handling
  if (agentsError) {
    toast.error(`Failed to load agents: ${agentsError.message}`);
  }
  if (performanceError) {
    toast.error(`Failed to load performance data: ${performanceError.message}`);
  }
  if (commissionsError) {
    toast.error(`Failed to load commissions data: ${commissionsError.message}`);
  }

  // Filter and search logic
  const filteredAgents = agents.filter((agent) => {
    const matchesSearch = agent?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          agent?.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'All' || agent.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Pagination logic
  const indexOfLastAgent = currentPage * agentsPerPage;
  const indexOfFirstAgent = indexOfLastAgent - agentsPerPage;
  const currentAgents = filteredAgents.slice(indexOfFirstAgent, indexOfLastAgent);
  const totalPages = Math.ceil(filteredAgents.length / agentsPerPage);

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const handleUpdateAgent = async () => {
    if (!editingAgent) return;
    try {
      await updateAgentMutation.mutateAsync({
        id: editingAgent.id,
        name: editingAgent.name,
        email: editingAgent.email,
        status: editingAgent.status,
        region: editingAgent.region,
        performanceScore: editingAgent.performanceScore,
        totalCommission: editingAgent.totalCommission,
      });
      toast.success('Agent updated successfully!');
      trpcUtils.agents.list.invalidate(); // Invalidate agent list to refetch
      setEditingAgent(null);
    } catch (error: any) {
      toast.error(`Failed to update agent: ${error.message}`);
    }
  };

  if (!user) {
    return <div className="flex items-center justify-center h-screen text-lg font-semibold">Please log in to access the Agent Portal.</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Agent Portal</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Agent Overview</CardTitle>
          <CardDescription>Summary of agent performance and commissions.</CardDescription>
        </CardHeader>
        <CardContent>
          {(isLoadingPerformance || isLoadingCommissions) ? (
            <div className="flex justify-center items-center h-24">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-md">
                <h3 className="text-lg font-semibold">Total Agents</h3>
                <p className="text-2xl">{agents.length}</p>
              </div>
              <div className="p-4 border rounded-md">
                <h3 className="text-lg font-semibold">Average Performance Score</h3>
                <p className="text-2xl">{performanceMetrics.averageScore || 'N/A'}</p>
              </div>
              <div className="p-4 border rounded-md">
                <h3 className="text-lg font-semibold">Total Commissions Paid</h3>
                <p className="text-2xl">₦{commissions.totalPaid?.toLocaleString() || 'N/A'}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent List</CardTitle>
          <CardDescription>Manage your insurance agents.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <Input
              placeholder="Search agents by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-grow"
            />
            <Select value={filterStatus} onValueChange={(value: 'All' | 'Active' | 'Inactive' | 'Pending') => setFilterStatus(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoadingAgents ? (
            <div className="flex justify-center items-center h-48">
              <Loader2 className="h-10 w-10 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Performance</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentAgents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell>{agent.email}</TableCell>
                    <TableCell>
                      <Badge variant={agent.status === 'Active' ? 'default' : agent.status === 'Pending' ? 'secondary' : 'destructive'}>
                        {agent.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{agent.region}</TableCell>
                    <TableCell>{agent.performanceScore}</TableCell>
                    <TableCell>₦{agent?.totalCommission?.toLocaleString() || '0'}</TableCell>
                    <TableCell className="text-right">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => setEditingAgent(agent)}>Edit</Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                          <DialogHeader>
                            <DialogTitle>Edit Agent</DialogTitle>
                            <DialogDescription>
                              Make changes to agent profile here. Click save when you're done.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                              <label htmlFor="name" className="text-right">Name</label>
                              <Input
                                id="name"
                                value={editingAgent?.name || ''}
                                onChange={(e) => setEditingAgent(prev => prev ? { ...prev, name: e.target.value } : null)}
                                className="col-span-3"
                              />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                              <label htmlFor="email" className="text-right">Email</label>
                              <Input
                                id="email"
                                value={editingAgent?.email || ''}
                                onChange={(e) => setEditingAgent(prev => prev ? { ...prev, email: e.target.value } : null)}
                                className="col-span-3"
                              />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                              <label htmlFor="status" className="text-right">Status</label>
                              <Select
                                value={editingAgent?.status}
                                onValueChange={(value: 'Active' | 'Inactive' | 'Pending') => setEditingAgent(prev => prev ? { ...prev, status: value } : null)}
                              >
                                <SelectTrigger className="col-span-3">
                                  <SelectValue placeholder="Select Status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Active">Active</SelectItem>
                                  <SelectItem value="Inactive">Inactive</SelectItem>
                                  <SelectItem value="Pending">Pending</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                              <label htmlFor="region" className="text-right">Region</label>
                              <Input
                                id="region"
                                value={editingAgent?.region || ''}
                                onChange={(e) => setEditingAgent(prev => prev ? { ...prev, region: e.target.value } : null)}
                                className="col-span-3"
                              />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                              <label htmlFor="performanceScore" className="text-right">Performance Score</label>
                              <Input
                                id="performanceScore"
                                type="number"
                                value={editingAgent?.performanceScore || 0}
                                onChange={(e) => setEditingAgent(prev => prev ? { ...prev, performanceScore: parseInt(e.target.value) } : null)}
                                className="col-span-3"
                              />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                              <label htmlFor="totalCommission" className="text-right">Total Commission</label>
                              <Input
                                id="totalCommission"
                                type="number"
                                value={editingAgent?.totalCommission || 0}
                                onChange={(e) => setEditingAgent(prev => prev ? { ...prev, totalCommission: parseInt(e.target.value) } : null)}
                                className="col-span-3"
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button type="submit" onClick={handleUpdateAgent} disabled={updateAgentMutation.isLoading}>
                              {updateAgentMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Save changes
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-end space-x-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            {Array.from({ length: totalPages }, (_, i) => (
              <Button
                key={i + 1}
                variant={currentPage === i + 1 ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePageChange(i + 1)}
              >
                {i + 1}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentPortal;