import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface Agent {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Agent' | 'Underwriter' | 'Claims Adjuster';
  status: 'Active' | 'Inactive' | 'Pending';
  lastLogin: string;
}

const UserManagement: React.FC = () => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10); // Assuming a fixed page size for simplicity
  const [editingUser, setEditingUser] = useState<Agent | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data: agentsData, isLoading, isError, error } = trpc.agents.list.useQuery(
    {
      page,
      limit: pageSize,
      search: searchTerm,
    },
    {
      enabled: isAuthenticated,
      keepPreviousData: true,
    }
  );

  const updateAgentMutation = trpc.agents.update.useMutation({
    onSuccess: () => {
      toast.success('User updated successfully!');
      utils.agents.list.invalidate();
      setIsDialogOpen(false);
      setEditingUser(null);
    },
    onError: (err) => {
      toast.error(`Failed to update user: ${err.message}`);
    },
  });

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      // Redirect to login or show an unauthorized message
      toast.error('You are not authorized to view this page.');
      // Example: router.push('/login');
    }
  }, [isAuthenticated, isAuthLoading]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setPage(1); // Reset to first page on new search
  };

  const handleEditClick = (user: Agent) => {
    setEditingUser(user);
    setIsDialogOpen(true);
  };

  const handleSaveUser = () => {
    if (editingUser) {
      updateAgentMutation.mutate({
        id: editingUser.id,
        name: editingUser.name,
        email: editingUser.email,
        role: editingUser.role,
        status: editingUser.status,
      });
    }
  };

  const filteredDemoAgents = (agentsData?.agents || []).filter(
    (agent) =>
      agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const displayAgents = agentsData?.agents || [];
  const totalAgents = agentsData?.totalCount || 0;
  const totalPages = Math.ceil(totalAgents / pageSize);

  if (isAuthLoading || (!isAuthenticated)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading authentication...</span>
      </div>
    );
  }

  if (isError && true) {
    toast.error(`Error fetching users: ${error?.message}`);
    return (
      <div className="flex items-center justify-center min-h-screen text-red-500">
        Error: {error?.message || 'Failed to load users'}
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            User Management
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="max-w-sm"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading users...</span>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayAgents.length > 0 ? (
                    displayAgents.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{user.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={{
                              Active: 'bg-green-500',
                              Inactive: 'bg-red-500',
                              Pending: 'bg-yellow-500',
                            }[user.status] || 'bg-gray-500'}
                          >
                            {user.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(user.lastLogin).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => handleEditClick(user)}>
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-4">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="flex justify-between items-center mt-4">
                <Button
                  variant="outline"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page === 1 || isLoading}
                >
                  Previous
                </Button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page === totalPages || isLoading}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Make changes to the user profile here. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={editingUser?.name || ''}
                onChange={(e) => editingUser && setEditingUser({ ...editingUser, name: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                Email
              </Label>
              <Input
                id="email"
                value={editingUser?.email || ''}
                onChange={(e) => editingUser && setEditingUser({ ...editingUser, email: e.target.value })}
                className="col-span-3"
                type="email"
                disabled // Email usually not editable directly
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="role" className="text-right">
                Role
              </Label>
              <Select
                value={editingUser?.role || ''}
                onValueChange={(value: 'Admin' | 'Agent' | 'Underwriter' | 'Claims Adjuster') =>
                  editingUser && setEditingUser({ ...editingUser, role: value })
                }
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Admin">Admin</SelectItem>
                  <SelectItem value="Agent">Agent</SelectItem>
                  <SelectItem value="Underwriter">Underwriter</SelectItem>
                  <SelectItem value="Claims Adjuster">Claims Adjuster</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status" className="text-right">
                Status
              </Label>
              <Select
                value={editingUser?.status || ''}
                onValueChange={(value: 'Active' | 'Inactive' | 'Pending') =>
                  editingUser && setEditingUser({ ...editingUser, status: value })
                }
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" onClick={handleSaveUser} disabled={updateAgentMutation.isLoading}>
              {updateAgentMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagement;