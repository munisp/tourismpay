import React, { useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  policyId: string;
}

export default function FamilyPolicies() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRelationship, setFilterRelationship] = useState<string | undefined>(undefined);
  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRelationship, setNewMemberRelationship] = useState("");
  const [newMemberPolicyId, setNewMemberPolicyId] = useState("");

  const utils = trpc.useUtils();

  const { data: familyMembers, isLoading, isError, error } = trpc.familyCoverage.members.useQuery();

  const addMemberMutation = trpc.familyCoverage.add.useMutation({
    onSuccess: () => {
      toast.success("Family member added successfully!");
      utils.familyCoverage.members.invalidate();
      setIsAddMemberDialogOpen(false);
      setNewMemberName("");
      setNewMemberRelationship("");
      setNewMemberPolicyId("");
    },
    onError: (err) => {
      toast.error(`Failed to add family member: ${err.message}`);
    },
  });

  const removeMemberMutation = trpc.familyCoverage.remove.useMutation({
    onSuccess: () => {
      toast.success("Family member removed successfully!");
      utils.familyCoverage.members.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to remove family member: ${err.message}`);
    },
  });

  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card className="w-full max-w-md mx-auto mt-8">
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>Please log in to view family policies.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>You must be logged in to access this page.</p>
        </CardContent>
      </Card>
    );
  }

  const displayMembers = familyMembers || [];

  const filteredMembers = displayMembers.filter((member) => {
    const matchesSearch = member.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRelationship = filterRelationship ? member.relationship === filterRelationship : true;
    return matchesSearch && matchesRelationship;
  });

  const handleAddMember = () => {
    if (!newMemberName || !newMemberRelationship || !newMemberPolicyId) {
      toast.error("Please fill in all fields to add a family member.");
      return;
    }
    addMemberMutation.mutate({
      name: newMemberName,
      relationship: newMemberRelationship,
      policyId: newMemberPolicyId,
    });
  };

  const handleRemoveMember = (memberId: string) => {
    removeMemberMutation.mutate({ id: memberId });
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Family Policies</CardTitle>
          <CardDescription>Manage family members covered under various policies.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <div className="flex space-x-2">
              <Input
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
              <Select
                onValueChange={(value) => setFilterRelationship(value === "all" ? undefined : value)}
                value={filterRelationship || "all"}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by relationship" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Relationships</SelectItem>
                  <SelectItem value="Spouse">Spouse</SelectItem>
                  <SelectItem value="Child">Child</SelectItem>
                  <SelectItem value="Parent">Parent</SelectItem>
                  <SelectItem value="Sibling">Sibling</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Dialog open={isAddMemberDialogOpen} onOpenChange={setIsAddMemberDialogOpen}>
              <DialogTrigger asChild>
                <Button>Add Family Member</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Family Member</DialogTitle>
                  <DialogDescription>Enter details for the new family member.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Input
                    placeholder="Name"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                  />
                  <Select
                    onValueChange={setNewMemberRelationship}
                    value={newMemberRelationship}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Relationship" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Spouse">Spouse</SelectItem>
                      <SelectItem value="Child">Child</SelectItem>
                      <SelectItem value="Parent">Parent</SelectItem>
                      <SelectItem value="Sibling">Sibling</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Policy ID"
                    value={newMemberPolicyId}
                    onChange={(e) => setNewMemberPolicyId(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleAddMember}
                    disabled={addMemberMutation.isLoading}
                  >
                    {addMemberMutation.isLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Add Member
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-48">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : isError && true ? (
            <div className="text-red-500 text-center">Error: {error?.message}</div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center text-gray-500">No family members found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Policy ID</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell>{member.relationship}</TableCell>
                    <TableCell>{member.policyId}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemoveMember(member.id)}
                        disabled={removeMemberMutation.isLoading}
                      >
                        {removeMemberMutation.isLoading && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}