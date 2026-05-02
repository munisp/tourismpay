// @ts-nocheck
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users, TrendingUp, Clock, CheckCircle, XCircle, Download, Shield, Activity, Mail } from "lucide-react";
import { useLocation } from "wouter";

// Demo mode data for when authentication is not available
const demoStats = {
  totalUsers: 1247,
  totalParticipants: 89,
  pendingReviews: 12,
  productionParticipants: 45,
  recentRegistrations: 23,
  onboardingFunnel: {
    registered: 89,
    technicalComplete: 67,
    integrationComplete: 52,
    certified: 48,
    production: 45,
  },
};

const demoParticipants = [
  { merchantId: 1, organizationName: "First Bank Nigeria", businessType: "bank", userName: "John Adeyemi", userEmail: "john@firstbank.ng", registrationStatus: "approved", completionPercentage: 100, currentStep: 5 },
  { merchantId: 2, organizationName: "Paystack Technologies", businessType: "psp", userName: "Sarah Okonkwo", userEmail: "sarah@paystack.com", registrationStatus: "approved", completionPercentage: 85, currentStep: 4 },
  { merchantId: 3, organizationName: "Jumia Nigeria", businessType: "merchant", userName: "Michael Eze", userEmail: "michael@jumia.ng", registrationStatus: "pending", completionPercentage: 60, currentStep: 3 },
  { merchantId: 4, organizationName: "Flutterwave Inc", businessType: "fintech", userName: "Grace Afolabi", userEmail: "grace@flutterwave.com", registrationStatus: "approved", completionPercentage: 95, currentStep: 5 },
  { merchantId: 5, organizationName: "Kuda Bank", businessType: "bank", userName: "David Obi", userEmail: "david@kuda.com", registrationStatus: "pending", completionPercentage: 40, currentStep: 2 },
  { merchantId: 6, organizationName: "Opay Digital", businessType: "fintech", userName: "Amina Yusuf", userEmail: "amina@opay.com", registrationStatus: "approved", completionPercentage: 100, currentStep: 5 },
  { merchantId: 7, organizationName: "Interswitch Group", businessType: "psp", userName: "Chidi Nnamdi", userEmail: "chidi@interswitch.com", registrationStatus: "rejected", completionPercentage: 20, currentStep: 1 },
  { merchantId: 8, organizationName: "GTBank Plc", businessType: "bank", userName: "Funke Adebayo", userEmail: "funke@gtbank.com", registrationStatus: "approved", completionPercentage: 100, currentStep: 5 },
];

const demoUsers = [
  { id: 1, name: "Admin User", email: "admin@payment-switch.ng", role: "admin", loginMethod: "email", lastSignedIn: new Date() },
  { id: 2, name: "John Adeyemi", email: "john@firstbank.ng", role: "user", loginMethod: "oauth", lastSignedIn: new Date() },
  { id: 3, name: "Sarah Okonkwo", email: "sarah@paystack.com", role: "user", loginMethod: "oauth", lastSignedIn: new Date() },
  { id: 4, name: "Michael Eze", email: "michael@jumia.ng", role: "user", loginMethod: "email", lastSignedIn: new Date() },
  { id: 5, name: "Grace Afolabi", email: "grace@flutterwave.com", role: "admin", loginMethod: "oauth", lastSignedIn: new Date() },
];

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | undefined>(undefined);
  const [selectedParticipant, setSelectedParticipant] = useState<number | null>(null);

  // Demo mode: allow access without authentication for testing/demo purposes
  const isDemoMode = !user;

  // Queries - only run when authenticated
  const { data: stats, isLoading: statsLoading } = trpc.admin.getStats.useQuery(undefined, { enabled: !isDemoMode });
  const { data: participantsData, isLoading: participantsLoading } = trpc.admin.listParticipants.useQuery({
    page: currentPage,
    limit: 20,
    statusFilter,
  }, { enabled: !isDemoMode });
  const { data: usersData, isLoading: usersLoading } = trpc.admin.listAllUsers.useQuery({
    page: 1,
    limit: 50,
  }, { enabled: !isDemoMode });
  const { data: participantDetails } = trpc.admin.getParticipantDetails.useQuery(
    { applicationId: selectedParticipant! },
    { enabled: !!selectedParticipant && !isDemoMode }
  );

  // Use demo data when in demo mode
  const effectiveStats = isDemoMode ? demoStats : stats;
  const effectiveParticipants = isDemoMode ? { participants: demoParticipants, total: demoParticipants.length } : participantsData;
  const effectiveUsers = isDemoMode ? { users: demoUsers, total: demoUsers.length } : usersData;
  const effectiveParticipantDetails = isDemoMode && selectedParticipant ? {
    application: demoParticipants.find(p => p.merchantId === selectedParticipant) || demoParticipants[0],
    technicalReview: { status: "completed" },
    certificationResults: { status: "passed" },
    productionCredentials: { status: "active" },
  } : participantDetails;

  // Mutations
  const updateUserRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("User role updated successfully");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateApplicationStatus = trpc.admin.updateApplicationStatus.useMutation({
    onSuccess: () => {
      toast.success("Application status updated");
      setSelectedParticipant(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const utils = trpc.useUtils();

  const handleExport = async () => {
    const result = await utils.admin.exportParticipantData.fetch({ statusFilter });
    const blob = new Blob([result.csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `participants-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export completed");
  };

  if (authLoading || (!isDemoMode && statsLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Admin Dashboard</h1>
              <p className="text-gray-600 mt-1">Manage users and monitor onboarding progress</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setLocation("/admin/reminders")} variant="outline">
                <Mail className="w-4 h-4 mr-2" />
                Reminder Emails
              </Button>
            </div>
            <Button onClick={() => setLocation("/")} variant="outline">
              Back to Portal
            </Button>
          </div>
        </div>
      </div>

      <div className="container py-8">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{effectiveStats?.totalUsers || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Registered accounts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Participants</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                            <div className="text-2xl font-bold">{effectiveStats?.totalParticipants || 0}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {effectiveStats?.recentRegistrations || 0} in last 30 days
                            </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{effectiveStats?.pendingReviews || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Production Active</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{effectiveStats?.productionParticipants || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Live on network</p>
            </CardContent>
          </Card>
        </div>

        {/* Onboarding Funnel */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Onboarding Funnel</CardTitle>
            <CardDescription>Participant progress through onboarding stages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: "Registered", count: effectiveStats?.onboardingFunnel.registered || 0, color: "bg-blue-500" },
                { label: "Technical Complete", count: effectiveStats?.onboardingFunnel.technicalComplete || 0, color: "bg-indigo-500" },
                { label: "Integration Complete", count: effectiveStats?.onboardingFunnel.integrationComplete || 0, color: "bg-purple-500" },
                { label: "Certified", count: effectiveStats?.onboardingFunnel.certified || 0, color: "bg-green-500" },
                { label: "Production", count: effectiveStats?.onboardingFunnel.production || 0, color: "bg-emerald-500" },
              ].map((stage) => (
                <div key={stage.label} className="flex items-center gap-4">
                  <div className="w-40 text-sm font-medium">{stage.label}</div>
                  <div className="flex-1 bg-gray-200 rounded-full h-6 relative overflow-hidden">
                    <div
                      className={`${stage.color} h-full flex items-center justify-end pr-2 text-white text-xs font-medium transition-all`}
                      style={{
                        width: `${((stage.count / (effectiveStats?.totalParticipants || 1)) * 100).toFixed(0)}%`,
                      }}
                    >
                      {stage.count > 0 && stage.count}
                    </div>
                  </div>
                  <div className="w-16 text-sm text-gray-600">
                    {((stage.count / (effectiveStats?.totalParticipants || 1)) * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tabs for different views */}
        <Tabs defaultValue="participants" className="space-y-6">
          <TabsList>
            <TabsTrigger value="participants">Participants</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
          </TabsList>

          {/* Participants Tab */}
          <TabsContent value="participants" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Participant Applications</CardTitle>
                    <CardDescription>Review and manage participant onboarding progress</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Select
                      value={statusFilter || "all"}
                      onValueChange={(value) =>
                        setStatusFilter(value === "all" ? undefined : (value as any))
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={handleExport} variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!isDemoMode && participantsLoading ? (
                  <div className="text-center py-8">Loading participants...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Organization</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Current Step</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {effectiveParticipants?.participants.map((participant) => (
                        <TableRow key={participant.merchantId}>
                          <TableCell className="font-medium">{participant.organizationName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{participant.businessType}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{participant.userName}</div>
                              <div className="text-gray-500">{participant.userEmail}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                participant.registrationStatus === "approved"
                                  ? "default"
                                  : participant.registrationStatus === "rejected"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {participant.registrationStatus}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-24 bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full"
                                  style={{ width: `${participant.completionPercentage}%` }}
                                />
                              </div>
                              <span className="text-sm text-gray-600">
                                {participant.completionPercentage}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">Step {participant.currentStep}/5</span>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedParticipant(participant.merchantId)}
                            >
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {/* Pagination */}
                {effectiveParticipants && effectiveParticipants.total > 20 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-gray-600">
                      Showing {(currentPage - 1) * 20 + 1} to{" "}
                      {Math.min(currentPage * 20, effectiveParticipants.total)} of {effectiveParticipants.total}{" "}
                      participants
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => p + 1)}
                        disabled={currentPage * 20 >= effectiveParticipants.total}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* User Management Tab */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage user accounts and permissions</CardDescription>
              </CardHeader>
              <CardContent>
                {!isDemoMode && usersLoading ? (
                  <div className="text-center py-8">Loading users...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Login Method</TableHead>
                        <TableHead>Last Sign In</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {effectiveUsers?.users.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.name || "N/A"}</TableCell>
                          <TableCell>{u.email || "N/A"}</TableCell>
                          <TableCell>
                            <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                              {u.role === "admin" && <Shield className="w-3 h-3 mr-1" />}
                              {u.role}
                            </Badge>
                          </TableCell>
                          <TableCell>{u.loginMethod || "N/A"}</TableCell>
                          <TableCell>
                            {u.lastSignedIn
                              ? new Date(u.lastSignedIn).toLocaleDateString()
                              : "Never"}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={u.role}
                              onValueChange={(role) =>
                                updateUserRole.mutate({ userId: u.id, role: role as any })
                              }
                              disabled={isDemoMode}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Participant Details Dialog */}
        {selectedParticipant && effectiveParticipantDetails && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{effectiveParticipantDetails.application.organizationName}</CardTitle>
                    <CardDescription>Participant Details and Progress</CardDescription>
                  </div>
                  <Button variant="outline" onClick={() => setSelectedParticipant(null)}>
                    Close
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Application Info */}
                <div>
                  <h3 className="font-semibold mb-2">Application Information</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Business Type:</span>{" "}
                      <span className="font-medium">{effectiveParticipantDetails.application.businessType}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Status:</span>{" "}
                      <Badge>{effectiveParticipantDetails.application.registrationStatus || effectiveParticipantDetails.application.status}</Badge>
                    </div>
                    <div>
                      <span className="text-gray-600">Contact:</span>{" "}
                      <span className="font-medium">{effectiveParticipantDetails.application.userName || effectiveParticipantDetails.application.contactName}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Email:</span>{" "}
                      <span className="font-medium">{effectiveParticipantDetails.application.userEmail || effectiveParticipantDetails.application.contactEmail}</span>
                    </div>
                  </div>
                </div>

                {/* Progress Status */}
                <div>
                  <h3 className="font-semibold mb-2">Onboarding Progress</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Registration</span>
                      <Badge>{effectiveParticipantDetails.application.registrationStatus || effectiveParticipantDetails.application.status}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Technical Onboarding</span>
                      <Badge>{effectiveParticipantDetails.technicalReview?.status || "Not Started"}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Certification</span>
                      <Badge>{effectiveParticipantDetails.certificationResults?.status || "Not Started"}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Production</span>
                      <Badge>{effectiveParticipantDetails.productionCredentials?.status || "Not Started"}</Badge>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {!isDemoMode && (effectiveParticipantDetails.application.registrationStatus === "pending" || effectiveParticipantDetails.application.status === "pending") && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() =>
                        updateApplicationStatus.mutate({
                          applicationId: selectedParticipant,
                          status: "approved",
                        })
                      }
                      className="flex-1"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve Application
                    </Button>
                    <Button
                      onClick={() =>
                        updateApplicationStatus.mutate({
                          applicationId: selectedParticipant,
                          status: "rejected",
                          reviewNotes: "Application rejected",
                        })
                      }
                      variant="destructive"
                      className="flex-1"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject Application
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
