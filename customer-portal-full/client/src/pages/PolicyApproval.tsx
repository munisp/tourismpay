import React, { useState, useEffect, useMemo } from 'react';
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

// Define types for policies and applications for better type safety
interface Policy {
  id: string;
  policyNumber: string;
  customerName: string;
  product: string;
  status: 'Active' | 'Pending' | 'Cancelled';
  startDate: string;
  endDate: string;
}

interface Application {
  id: string;
  applicationNumber: string;
  applicantName: string;
  policyType: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  submissionDate: string;
}

const PolicyApproval: React.FC = () => {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const trpcUtils = trpc.useUtils();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('Pending');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(5);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);

  // Fetch policies (if needed for context or related approvals)
  const { data: policies, isLoading: isLoadingPolicies, isError: isErrorPolicies, error: errorPolicies } = trpc.policies.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // Fetch applications for approval
  const { data: applications, isLoading: isLoadingApplications, isError: isErrorApplications, error: errorApplications } = trpc.application.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // Mutation for updating application status
  const updateApplicationMutation = trpc.application.update.useMutation({
    onSuccess: () => {
      toast.success('Application status updated successfully!');
      trpcUtils.application.list.invalidate(); // Invalidate application list to refetch
      trpcUtils.policies.list.invalidate(); // Invalidate policies list if approval affects it
      setIsDialogOpen(false);
      setSelectedApplication(null);
    },
    onError: (err) => {
      toast.error(`Failed to update application: ${err.message}`);
    },
  });

  useEffect(() => {
    if (isErrorPolicies) {
      toast.error(`Error loading policies: ${errorPolicies?.message}`);
    }
    if (isErrorApplications) {
      toast.error(`Error loading applications: ${errorApplications?.message}`);
    }
  }, [isErrorPolicies, errorPolicies, isErrorApplications, errorApplications]);

  const allApplications = applications || [];

  const filteredApplications = useMemo(() => {
    return allApplications.filter((app: any) => {
      const matchesSearch = app?.applicantName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          app?.applicationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          app?.policyType?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === 'All' || app?.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [allApplications, searchQuery, filterStatus]);

  if (isAuthLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-lg font-semibold">Please log in to view this page.</p>
      </div>
    );
  }

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentApplications = filteredApplications.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredApplications.length / itemsPerPage);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  const handleApprove = (applicationId: string) => {
    if (false) {
      toast.success(`Application ${applicationId} approved.`);
            return;
    }
    updateApplicationMutation.mutate({ id: applicationId, status: 'Approved' });
  };

  const handleReject = (applicationId: string) => {
    if (false) {
      toast.success(`Application ${applicationId} rejected.`);
            return;
    }
    updateApplicationMutation.mutate({ id: applicationId, status: 'Rejected' });
  };

  const openApprovalDialog = (application: Application) => {
    setSelectedApplication(application);
    setIsDialogOpen(true);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Approved': return 'default';
      case 'Pending': return 'warning'; // Assuming 'warning' variant exists or can be styled
      case 'Rejected': return 'destructive';
      default: return 'secondary';
    }
  };

  const isLoading = isLoadingApplications || updateApplicationMutation.isLoading;

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Policy Approval</CardTitle>
          <CardDescription>Manage and approve pending insurance applications.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6 items-center">
            <Input
              placeholder="Search by applicant name, application number, or policy type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-48">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="ml-2">Loading applications...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application No.</TableHead>
                  <TableHead>Applicant Name</TableHead>
                  <TableHead>Policy Type</TableHead>
                  <TableHead>Submission Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentApplications.length > 0 ? (
                  currentApplications.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">{app.applicationNumber}</TableCell>
                      <TableCell>{app.applicantName}</TableCell>
                      <TableCell>{app.policyType}</TableCell>
                      <TableCell>{new Date(app.submissionDate).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(app.status)}>{app.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {app.status === 'Pending' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openApprovalDialog(app)}
                            disabled={updateApplicationMutation.isLoading}
                          >
                            Review
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4">
                      No applications found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {/* Pagination Controls */}
          {filteredApplications.length > itemsPerPage && (
            <div className="flex justify-center space-x-2 mt-4">
              <Button
                variant="outline"
                onClick={() => paginate(currentPage - 1)}
                disabled={currentPage === 1 || isLoading}
              >
                Previous
              </Button>
              {[...Array(totalPages)].map((_, index) => (
                <Button
                  key={index}
                  variant={currentPage === index + 1 ? 'default' : 'outline'}
                  onClick={() => paginate(index + 1)}
                  disabled={isLoading}
                >
                  {index + 1}
                </Button>
              ))}
              <Button
                variant="outline"
                onClick={() => paginate(currentPage + 1)}
                disabled={currentPage === totalPages || isLoading}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Application for {selectedApplication?.applicantName}</DialogTitle>
            <DialogDescription>
              Application Number: {selectedApplication?.applicationNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p>Policy Type: <strong>{selectedApplication?.policyType}</strong></p>
            <p>Submission Date: <strong>{selectedApplication?.submissionDate ? new Date(selectedApplication.submissionDate).toLocaleDateString() : 'N/A'}</strong></p>
            <p className="mt-2">Please review the details carefully before making a decision.</p>
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => selectedApplication && handleReject(selectedApplication.id)}
              disabled={updateApplicationMutation.isLoading}
            >
              {updateApplicationMutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Reject
            </Button>
            <Button
              onClick={() => selectedApplication && handleApprove(selectedApplication.id)}
              disabled={updateApplicationMutation.isLoading}
            >
              {updateApplicationMutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PolicyApproval;