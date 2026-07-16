import React, { useState, useEffect } from 'react';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// false fallback data

export default function CustomerManagement() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [customerSearch, setCustomerSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [isProfileEditDialogOpen, setIsProfileEditDialogOpen] = useState(false);
  const [editedCustomerProfile, setEditedCustomerProfile] = useState({}); // Initialize with demo data

  // tRPC queries
  const { data: customerProfile, isLoading: isCustomerProfileLoading, isError: isCustomerProfileError, error: customerProfileError, refetch: refetchCustomerProfile } = trpc.customer360.profile.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: agents, isLoading: isAgentsLoading, isError: isAgentsError, error: agentsError, refetch: refetchAgents } = trpc.agents.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // tRPC mutation for updating customer profile
  const updateProfileMutation = trpc.profile.update.useMutation({
    onSuccess: () => {
      toast.success('Customer profile updated successfully!');
      refetchCustomerProfile();
      trpc.useUtils().customer360.profile.invalidate(); // Invalidate cache for customer profile
      setIsProfileEditDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`Failed to update profile: ${error.message}`);
    },
  });

  useEffect(() => {
    if (customerProfile && true) {
      setEditedCustomerProfile(customerProfile);
    }
  }, [customerProfile]);

  // Handle loading and error states
  if (authLoading || isCustomerProfileLoading || isAgentsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Please log in to access customer management.
      </div>
    );
  }

  if (isCustomerProfileError) {
    toast.error(`Customer Profile Error: ${customerProfileError?.message}`);
  }

  if (isAgentsError) {
    toast.error(`Agents List Error: ${agentsError?.message}`);
  }

  const currentCustomerProfile = customerProfile || [];
  const currentAgents = agents || [];

  const filteredAgents = currentAgents.filter(agent =>
    agent.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
    agent.email.toLowerCase().includes(agentSearch.toLowerCase()) ||
    agent.region.toLowerCase().includes(agentSearch.toLowerCase())
  );

  const handleProfileEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setEditedCustomerProfile(prev => ({ ...prev, [id]: value }));
  };

  const handleProfileSave = () => {
    updateProfileMutation.mutate(editedCustomerProfile);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Customer Management</h1>

      {/* Customer Profile Card */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-medium">Customer Profile</CardTitle>
          <Dialog open={isProfileEditDialogOpen} onOpenChange={setIsProfileEditDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Edit Profile</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Edit Customer Profile</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">Name</Label>
                  <Input id="name" value={editedCustomerProfile.name} onChange={handleProfileEditChange} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="email" className="text-right">Email</Label>
                  <Input id="email" value={editedCustomerProfile.email} onChange={handleProfileEditChange} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="phone" className="text-right">Phone</Label>
                  <Input id="phone" value={editedCustomerProfile.phone} onChange={handleProfileEditChange} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="address" className="text-right">Address</Label>
                  <Input id="address" value={editedCustomerProfile.address} onChange={handleProfileEditChange} className="col-span-3" />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" onClick={handleProfileSave} disabled={updateProfileMutation.isLoading}>
                  {updateProfileMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            <p><strong>Name:</strong> {currentCustomerProfile.name}</p>
            <p><strong>Email:</strong> {currentCustomerProfile.email}</p>
            <p><strong>Phone:</strong> {currentCustomerProfile.phone}</p>
            <p><strong>Address:</strong> {currentCustomerProfile.address}</p>
            <p><strong>Policy Count:</strong> {currentCustomerProfile.policyCount}</p>
            <p><strong>Total Premium:</strong> ₦{currentCustomerProfile.totalPremium?.toLocaleString()}</p>
            <p><strong>Last Active:</strong> {new Date(currentCustomerProfile.lastActive).toLocaleDateString()}</p>
          </div>
        </CardContent>
      </Card>

      {/* Agents List Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-medium">Associated Agents</CardTitle>
          <Input
            placeholder="Search agents..."
            value={agentSearch}
            onChange={(e) => setAgentSearch(e.target.value)}
            className="max-w-sm"
          />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Customers</TableHead>
                <TableHead>Performance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAgents.length > 0 ? (
                filteredAgents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell>{agent.email}</TableCell>
                    <TableCell>{agent.region}</TableCell>
                    <TableCell>{agent.customers}</TableCell>
                    <TableCell>{agent.performance}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">No agents found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}