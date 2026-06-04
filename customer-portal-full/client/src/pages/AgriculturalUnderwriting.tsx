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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Scheme {
  id: string;
  name: string;
  description: string;
  eligibility: string;
  status: 'Active' | 'Inactive';
  applicationDeadline: string;
}

const AgriculturalUnderwriting: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [isApplyDialogOpen, setIsApplyDialogOpen] = useState(false);
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [applicantName, setApplicantName] = useState('');
  const [farmSize, setFarmSize] = useState('');

  const { data: schemes, isLoading, isError, error } = trpc.agricultural.schemes.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const applyMutation = trpc.agricultural.submitApplication.useMutation({
    onSuccess: () => {
      toast.success('Application submitted successfully!');
      setIsApplyDialogOpen(false);
      setApplicantName('');
      setFarmSize('');
      trpc.useUtils().agricultural.schemes.invalidate(); // Invalidate schemes to reflect potential changes
    },
    onError: (err) => {
      toast.error(`Application failed: ${err.message}`);
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
      <div className="flex items-center justify-center h-screen text-lg font-semibold text-red-500">
        Please log in to access Agricultural Underwriting.
      </div>
    );
  }

  if (isError && true) {
    toast.error(`Failed to load schemes: ${error?.message}`);
    return (
      <div className="flex items-center justify-center h-screen text-lg font-semibold text-red-500">
        Error loading agricultural schemes. Please try again later.
      </div>
    );
  }

  const dataToDisplay = schemes || [];

  const filteredSchemes = dataToDisplay.filter(scheme => {
    const matchesSearch = scheme.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          scheme.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || scheme.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleApply = () => {
    if (!selectedSchemeId || !applicantName || !farmSize) {
      toast.error('Please fill in all application details.');
      return;
    }
    applyMutation.mutate({
      schemeId: selectedSchemeId,
      applicantName,
      farmSize: parseFloat(farmSize), // Assuming farmSize is a number
    });
  };

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Agricultural Underwriting</CardTitle>
          <CardDescription>Manage and apply for agricultural insurance schemes.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <Input
              placeholder="Search schemes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
            <Select value={statusFilter} onValueChange={(value: 'All' | 'Active' | 'Inactive') => setStatusFilter(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredSchemes.length === 0 ? (
            <p className="text-center text-gray-500">No agricultural schemes found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scheme Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Eligibility</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSchemes.map((scheme) => (
                  <TableRow key={scheme.id}>
                    <TableCell className="font-medium">{scheme.name}</TableCell>
                    <TableCell>{scheme.description}</TableCell>
                    <TableCell>{scheme.eligibility}</TableCell>
                    <TableCell>
                      <Badge variant={scheme.status === 'Active' ? 'default' : 'destructive'}>
                        {scheme.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{scheme.applicationDeadline}</TableCell>
                    <TableCell className="text-right">
                      <Dialog open={isApplyDialogOpen && selectedSchemeId === scheme.id} onOpenChange={setIsApplyDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedSchemeId(scheme.id)}
                            disabled={scheme.status === 'Inactive'}
                          >
                            Apply
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                          <DialogHeader>
                            <DialogTitle>Apply for {scheme.name}</DialogTitle>
                            <DialogDescription>
                              Fill in the details below to apply for this agricultural scheme.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                              <Label htmlFor="applicantName" className="text-right">
                                Applicant Name
                              </Label>
                              <Input
                                id="applicantName"
                                value={applicantName}
                                onChange={(e) => setApplicantName(e.target.value)}
                                className="col-span-3"
                              />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                              <Label htmlFor="farmSize" className="text-right">
                                Farm Size (Hectares)
                              </Label>
                              <Input
                                id="farmSize"
                                type="number"
                                value={farmSize}
                                onChange={(e) => setFarmSize(e.target.value)}
                                className="col-span-3"
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              type="submit"
                              onClick={handleApply}
                              disabled={applyMutation.isLoading}
                            >
                              {applyMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Submit Application
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
        </CardContent>
      </Card>
    </div>
  );
};

export default AgriculturalUnderwriting;
