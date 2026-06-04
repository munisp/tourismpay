import React, { useState, useEffect } from 'react';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Application {
  id: string;
  policyType: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  applicantName: string;
  submissionDate: string;
  premium: number;
}

const InsuranceApplication: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentApplication, setCurrentApplication] = useState<Application | null>(null);
  const [newApplicationData, setNewApplicationData] = useState({
    policyType: '',
    applicantName: '',
    premium: 0,
  });

  const utils = trpc.useUtils();

  const { data: applicationsData, isLoading: isFetchingApplications, error: applicationsError } = trpc.application.list.useQuery(
    undefined, // No input needed for list, assuming it returns all applications
    { enabled: isAuthenticated }
  );

  const { data: singleApplicationData, isLoading: isFetchingSingleApplication, error: singleApplicationError } = trpc.application.get.useQuery(
    { id: currentApplication?.id || '' },
    { enabled: isAuthenticated && !!currentApplication?.id }
  );

  const createApplicationMutation = trpc.application.create.useMutation({
    onSuccess: () => {
      toast.success('Application created successfully!');
      utils.application.list.invalidate();
      setIsDialogOpen(false);
      setNewApplicationData({ policyType: '', applicantName: '', premium: 0 });
    },
    onError: (error) => {
      toast.error(`Failed to create application: ${error.message}`);
    },
  });

  const updateApplicationMutation = trpc.application.update.useMutation({
    onSuccess: () => {
      toast.success('Application updated successfully!');
      utils.application.list.invalidate();
      utils.application.get.invalidate({ id: currentApplication?.id });
      setIsDialogOpen(false);
      setCurrentApplication(null);
    },
    onError: (error) => {
      toast.error(`Failed to update application: ${error.message}`);
    },
  });

  useEffect(() => {
    if (applicationsError) {
      toast.error(`Error fetching applications: ${applicationsError.message}`);
    }
    if (singleApplicationError) {
      toast.error(`Error fetching application details: ${singleApplicationError.message}`);
    }
  }, [applicationsError, singleApplicationError]);

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
        Please log in to view your insurance applications.
      </div>
    );
  }

  const applications = applicationsData || [];

  const filteredApplications = applications.filter((app) => {
    const matchesSearch = app.applicantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          app.policyType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'All' || app.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const paginatedApplications = filteredApplications.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filteredApplications.length / pageSize);

  const handleCreateApplication = () => {
    createApplicationMutation.mutate({
      policyType: newApplicationData.policyType,
      applicantName: newApplicationData.applicantName,
      premium: newApplicationData.premium,
      // Assuming status and submissionDate are set by the backend
    });
  };

  const handleUpdateApplication = () => {
    if (currentApplication) {
      updateApplicationMutation.mutate({
        id: currentApplication.id,
        policyType: currentApplication.policyType,
        status: currentApplication.status,
        applicantName: currentApplication.applicantName,
        premium: currentApplication.premium,
      });
    }
  };

  const handleEditClick = (app: Application) => {
    setCurrentApplication(app);
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setCurrentApplication(null);
    setNewApplicationData({ policyType: '', applicantName: '', premium: 0 });
  };

  const isLoading = isFetchingApplications || isFetchingSingleApplication || createApplicationMutation.isPending || updateApplicationMutation.isPending;

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">Insurance Applications</CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsDialogOpen(true)}>Create New Application</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{currentApplication ? 'Edit Application' : 'Create New Application'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Input
                  placeholder="Policy Type"
                  value={currentApplication ? currentApplication.policyType : newApplicationData.policyType}
                  onChange={(e) => {
                    if (currentApplication) {
                      setCurrentApplication({ ...currentApplication, policyType: e.target.value });
                    } else {
                      setNewApplicationData({ ...newApplicationData, policyType: e.target.value });
                    }
                  }}
                />
                <Input
                  placeholder="Applicant Name"
                  value={currentApplication ? currentApplication.applicantName : newApplicationData.applicantName}
                  onChange={(e) => {
                    if (currentApplication) {
                      setCurrentApplication({ ...currentApplication, applicantName: e.target.value });
                    } else {
                      setNewApplicationData({ ...newApplicationData, applicantName: e.target.value });
                    }
                  }}
                />
                <Input
                  type="number"
                  placeholder="Premium"
                  value={currentApplication ? currentApplication.premium : newApplicationData.premium}
                  onChange={(e) => {
                    const premium = parseFloat(e.target.value);
                    if (currentApplication) {
                      setCurrentApplication({ ...currentApplication, premium: isNaN(premium) ? 0 : premium });
                    } else {
                      setNewApplicationData({ ...newApplicationData, premium: isNaN(premium) ? 0 : premium });
                    }
                  }}
                />
                {currentApplication && (
                  <Select
                    value={currentApplication.status}
                    onValueChange={(value) => setCurrentApplication({ ...currentApplication, status: value as 'Pending' | 'Approved' | 'Rejected' })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Approved">Approved</SelectItem>
                      <SelectItem value="Rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <DialogFooter>
                <Button onClick={currentApplication ? handleUpdateApplication : handleCreateApplication} disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {currentApplication ? 'Save Changes' : 'Create Application'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <Input
              placeholder="Search applications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select
              value={filterStatus}
              onValueChange={(value: 'All' | 'Pending' | 'Approved' | 'Rejected') => setFilterStatus(value)}
            >
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
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Policy Type</TableHead>
                  <TableHead>Applicant Name</TableHead>
                  <TableHead>Submission Date</TableHead>
                  <TableHead>Premium (NGN)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedApplications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">No applications found.</TableCell>
                  </TableRow>
                ) : (
                  paginatedApplications.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell>{app.id}</TableCell>
                      <TableCell>{app.policyType}</TableCell>
                      <TableCell>{app.applicantName}</TableCell>
                      <TableCell>{app.submissionDate}</TableCell>
                      <TableCell>{app.premium.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium
                            ${app.status === 'Approved' ? 'bg-green-100 text-green-800'
                            : app.status === 'Pending' ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'}`}
                        >
                          {app.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => handleEditClick(app)}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-between items-center mt-4">
            <Button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1 || isLoading}
            >
              Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages || isLoading}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InsuranceApplication;