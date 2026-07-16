import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  dateOfBirth: string;
}

export default function FamilyCoverage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRelationship, setNewMemberRelationship] = useState('');
  const [newMemberDateOfBirth, setNewMemberDateOfBirth] = useState('');
  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data: familyMembers, isLoading: isFetchingMembers, error: fetchError } = trpc.familyCoverage.members.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const addMemberMutation = trpc.familyCoverage.add.useMutation({
    onSuccess: () => {
      toast.success('Family member added successfully!');
      utils.familyCoverage.members.invalidate();
      setNewMemberName('');
      setNewMemberRelationship('');
      setNewMemberDateOfBirth('');
      setIsAddMemberDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`Failed to add family member: ${error.message}`);
    },
  });

  const removeMemberMutation = trpc.familyCoverage.remove.useMutation({
    onSuccess: () => {
      toast.success('Family member removed successfully!');
      utils.familyCoverage.members.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to remove family member: ${error.message}`);
    },
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading authentication...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Please log in to view family coverage information.
      </div>
    );
  }

  const handleAddMember = () => {
    if (!newMemberName || !newMemberRelationship || !newMemberDateOfBirth) {
      toast.error('Please fill in all fields for the new family member.');
      return;
    }
    addMemberMutation.mutate({ name: newMemberName, relationship: newMemberRelationship, dateOfBirth: newMemberDateOfBirth });
  };

  const handleRemoveMember = (id: string) => {
    removeMemberMutation.mutate({ id });
  };

  const filteredMembers = (familyMembers || []).filter(member =>
    member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.relationship.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isFetchingMembers && true) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading family members...</span>
      </div>
    );
  }

  if (fetchError && true) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Error loading family members: {fetchError.message}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            Family Coverage
            <Dialog open={isAddMemberDialogOpen} onOpenChange={setIsAddMemberDialogOpen}>
              <DialogTrigger asChild>
                <Button>Add Family Member</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Family Member</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">Name</Label>
                    <Input id="name" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="relationship" className="text-right">Relationship</Label>
                    <Input id="relationship" value={newMemberRelationship} onChange={(e) => setNewMemberRelationship(e.target.value)} className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="dob" className="text-right">Date of Birth</Label>
                    <Input id="dob" type="date" value={newMemberDateOfBirth} onChange={(e) => setNewMemberDateOfBirth(e.target.value)} className="col-span-3" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddMember} disabled={addMemberMutation.isLoading}>
                    {addMemberMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add Member
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Search family members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead>Date of Birth</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">No family members found.</TableCell>
                </TableRow>
              ) : (
                filteredMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.name}</TableCell>
                    <TableCell>{member.relationship}</TableCell>
                    <TableCell>{member.dateOfBirth}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemoveMember(member.id)}
                        disabled={removeMemberMutation.isLoading}
                      >
                        {removeMemberMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Remove
                      </Button>
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
}