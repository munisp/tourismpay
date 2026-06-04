import React, { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Application {
  id: string;
  policyType: string;
  status: "Pending" | "Approved" | "Rejected" | "Draft";
  submissionDate: string;
  applicantName: string;
  premium: number;
}

export default function MyApplications() {
  const { isAuthenticated, user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentApplication, setCurrentApplication] = useState<Application | null>(null);

  const [newApplicationData, setNewApplicationData] = useState({
    policyType: "",
    applicantName: "",
    premium: 0,
  });

  const [editApplicationData, setEditApplicationData] = useState({
    id: "",
    policyType: "",
    status: "",
    applicantName: "",
    premium: 0,
  });

  // tRPC queries and mutations
  const { data, isLoading, isError, error } = trpc.application.list.useQuery(
    {
      search: searchQuery,
      status: filterStatus,
      page: currentPage,
      limit: itemsPerPage,
    },
    { enabled: isAuthenticated }
  );

  const createApplicationMutation = trpc.application.create.useMutation({
    onSuccess: () => {
      toast.success("Application created successfully!");
      trpc.useUtils().application.list.invalidate();
      setIsCreateDialogOpen(false);
      setNewApplicationData({ policyType: "", applicantName: "", premium: 0 });
    },
    onError: (err) => {
      toast.error(`Failed to create application: ${err.message}`);
    },
  });

  const updateApplicationMutation = trpc.application.update.useMutation({
    onSuccess: () => {
      toast.success("Application updated successfully!");
      trpc.useUtils().application.list.invalidate();
      setIsEditDialogOpen(false);
      setCurrentApplication(null);
      setEditApplicationData({ id: "", policyType: "", status: "", applicantName: "", premium: 0 });
    },
    onError: (err) => {
      toast.error(`Failed to update application: ${err.message}`);
    },
  });

  const applications = data?.applications || [];

  const totalPages = data?.totalPages || 1;

  useEffect(() => {
    if (isError) {
      toast.error(`Error fetching applications: ${error?.message}`);
    }
  }, [isError, error]);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-[350px]">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Please log in to view your applications.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => (window.location.href = "/login")}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleCreateApplication = () => {
    if (!newApplicationData.policyType || !newApplicationData.applicantName || newApplicationData.premium <= 0) {
      toast.error("Please fill all fields correctly.");
      return;
    }
    createApplicationMutation.mutate({
      policyType: newApplicationData.policyType,
      applicantName: newApplicationData.applicantName,
      premium: newApplicationData.premium,
    });
  };

  const handleEditApplication = () => {
    if (!editApplicationData.id || !editApplicationData.policyType || !editApplicationData.applicantName || editApplicationData.premium <= 0 || !editApplicationData.status) {
      toast.error("Please fill all fields correctly.");
      return;
    }
    updateApplicationMutation.mutate({
      id: editApplicationData.id,
      policyType: editApplicationData.policyType,
      status: editApplicationData.status as Application["status"],
      applicantName: editApplicationData.applicantName,
      premium: editApplicationData.premium,
    });
  };

  const openEditDialog = (app: Application) => {
    setCurrentApplication(app);
    setEditApplicationData({
      id: app.id,
      policyType: app.policyType,
      status: app.status,
      applicantName: app.applicantName,
      premium: app.premium,
    });
    setIsEditDialogOpen(true);
  };

  const paginatedApplications = applications;

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>My Applications</CardTitle>
          <CardDescription>View and manage your insurance applications.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-4 items-center">
            <Input
              placeholder="Search by policy type or applicant name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-grow"
            />
            <Select onValueChange={(value) => setFilterStatus(value === "all" ? undefined : value)} value={filterStatus || "all"}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>Create New Application</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Application</DialogTitle>
                  <DialogDescription>Fill in the details for your new insurance application.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Input
                    placeholder="Policy Type"
                    value={newApplicationData.policyType}
                    onChange={(e) =>
                      setNewApplicationData({ ...newApplicationData, policyType: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Applicant Name"
                    value={newApplicationData.applicantName}
                    onChange={(e) =>
                      setNewApplicationData({ ...newApplicationData, applicantName: e.target.value })
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Premium"
                    value={newApplicationData.premium === 0 ? "" : newApplicationData.premium}
                    onChange={(e) =>
                      setNewApplicationData({ ...newApplicationData, premium: parseFloat(e.target.value) || 0 })
                    }
                  />
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleCreateApplication}
                    disabled={createApplicationMutation.isLoading}
                  >
                    {createApplicationMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Application
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (applications.length === 0 ? (
            <p className="text-center text-gray-500">No applications found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Policy Type</TableHead>
                  <TableHead>Applicant Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submission Date</TableHead>
                  <TableHead>Premium (₦)</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedApplications.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">{app.id}</TableCell>
                    <TableCell>{app.policyType}</TableCell>
                    <TableCell>{app.applicantName}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          app.status === "Approved"
                            ? "default"
                            : app.status === "Pending"
                            ? "secondary"
                            : app.status === "Rejected"
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {app.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{app.submissionDate}</TableCell>
                    <TableCell>₦{app.premium.toLocaleString()}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(app)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ))}

          {/* Pagination */}
          <div className="flex justify-between items-center mt-4">
            <Button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || isLoading}
            >
              Previous
            </Button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <Button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || isLoading}
            >
              Next
            </Button>
          </div>

          {/* Edit Application Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Application</DialogTitle>
                <DialogDescription>Update the details for application ID: {currentApplication?.id}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Input
                  placeholder="Policy Type"
                  value={editApplicationData.policyType}
                  onChange={(e) =>
                    setEditApplicationData({ ...editApplicationData, policyType: e.target.value })
                  }
                />
                <Input
                  placeholder="Applicant Name"
                  value={editApplicationData.applicantName}
                  onChange={(e) =>
                    setEditApplicationData({ ...editApplicationData, applicantName: e.target.value })
                  }
                />
                <Input
                  type="number"
                  placeholder="Premium"
                  value={editApplicationData.premium === 0 ? "" : editApplicationData.premium}
                  onChange={(e) =>
                    setEditApplicationData({ ...editApplicationData, premium: parseFloat(e.target.value) || 0 })
                  }
                />
                <Select
                  onValueChange={(value) => setEditApplicationData({ ...editApplicationData, status: value })}
                  value={editApplicationData.status}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleEditApplication}
                  disabled={updateApplicationMutation.isLoading}
                >
                  {updateApplicationMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}