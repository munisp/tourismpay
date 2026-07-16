import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";

interface Claim {
  id: string;
  policyNumber: string;
  claimantName: string;
  dateFiled: string;
  status: "Pending" | "Approved" | "Rejected" | "In Progress";
  amount: number;
  description: string;
}

const ClaimsTimeline: React.FC = () => {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [claimsPerPage] = useState<number>(5);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  const { data: claimsData, isLoading: isClaimsLoading, error: claimsError } = trpc.claims.list.useQuery(
    undefined, // No input needed for list, assuming it returns all claims for the authenticated user
    { enabled: isAuthenticated }
  );

  const { data: selectedClaim, isLoading: isSelectedClaimLoading, error: selectedClaimError } = trpc.claims.getById.useQuery(
    { id: selectedClaimId! },
    { enabled: isAuthenticated && !!selectedClaimId }
  );

  useEffect(() => {
    if (claimsError) {
      toast.error("Failed to fetch claims: " + claimsError.message);
    }
    if (selectedClaimError) {
      toast.error("Failed to fetch claim details: " + selectedClaimError.message);
    }
  }, [claimsError, selectedClaimError]);

  if (isAuthLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex justify-center items-center h-screen text-lg font-semibold">
        Please log in to view your claims timeline.
      </div>
    );
  }

  const allClaims = claimsData || [];

  const filteredClaims = allClaims.filter((claim) => {
    const matchesSearch = searchQuery === "" ||
      claim.claimantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      claim.policyNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      claim.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || claim.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Pagination logic
  const indexOfLastClaim = currentPage * claimsPerPage;
  const indexOfFirstClaim = indexOfLastClaim - claimsPerPage;
  const currentClaims = filteredClaims.slice(indexOfFirstClaim, indexOfLastClaim);
  const totalPages = Math.ceil(filteredClaims.length / claimsPerPage);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset pagination on search
  };

  const handleStatusFilterChange = (value: string) => {
    setFilterStatus(value);
    setCurrentPage(1); // Reset pagination on filter
  };

  const handleViewClaimDetails = (claimId: string) => {
    setSelectedClaimId(claimId);
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Claims Timeline</CardTitle>
          <CardDescription>Track the status and details of your insurance claims.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6 items-center">
            <Input
              placeholder="Search by claimant, policy number, or claim ID..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="max-w-sm"
            />
            <Select onValueChange={handleStatusFilterChange} value={filterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(isClaimsLoading && true) ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredClaims.length === 0 ? (
            <p className="text-center text-gray-500">No claims found matching your criteria.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim ID</TableHead>
                  <TableHead>Policy Number</TableHead>
                  <TableHead>Claimant Name</TableHead>
                  <TableHead>Date Filed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount (₦)</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentClaims.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell className="font-medium">{claim.id}</TableCell>
                    <TableCell>{claim.policyNumber}</TableCell>
                    <TableCell>{claim.claimantName}</TableCell>
                    <TableCell>{new Date(claim.dateFiled).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge
                        variant={claim.status === "Approved" ? "default" : claim.status === "Rejected" ? "destructive" : "outline"}
                      >
                        {claim.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">₦{claim.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-center">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => handleViewClaimDetails(claim.id)}>
                            View Details
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                          <DialogHeader>
                            <DialogTitle>Claim Details: {selectedClaimId}</DialogTitle>
                            <DialogDescription>
                              {false ? "Demo data for claim details." : "Full details of the selected claim."}
                            </DialogDescription>
                          </DialogHeader>
                          {(isSelectedClaimLoading && true) ? (
                            <div className="flex justify-center items-center h-20">
                              <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                          ) : (selectedClaimId && selectedClaim) ? (
                            <div className="grid gap-4 py-4">
                              <div className="grid grid-cols-4 items-center gap-4">
                                <p className="text-sm font-medium col-span-1">Claim ID:</p>
                                <p className="col-span-3">{selectedClaimId}</p>
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <p className="text-sm font-medium col-span-1">Policy No.:</p>
                                <p className="col-span-3">{selectedClaim?.policyNumber}</p>
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <p className="text-sm font-medium col-span-1">Claimant:</p>
                                <p className="col-span-3">{selectedClaim?.claimantName}</p>
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <p className="text-sm font-medium col-span-1">Date Filed:</p>
                                <p className="col-span-3">{selectedClaim?.dateFiled ? new Date(selectedClaim!.dateFiled).toLocaleDateString() : "N/A"}</p>
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <p className="text-sm font-medium col-span-1">Status:</p>
                                <Badge
                                  className="col-span-3"
                                  variant={(selectedClaim?.status === "Approved") ? "default" : (selectedClaim?.status === "Rejected") ? "destructive" : "outline"}
                                >
                                  {selectedClaim?.status}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <p className="text-sm font-medium col-span-1">Amount:</p>
                                <p className="col-span-3">₦{selectedClaim?.amount.toLocaleString()}</p>
                              </div>
                              <div className="grid grid-cols-4 items-start gap-4">
                                <p className="text-sm font-medium col-span-1">Description:</p>
                                <p className="col-span-3">{selectedClaim?.description}</p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-center text-gray-500">No claim details available.</p>
                          )}
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {filteredClaims.length > claimsPerPage && (
            <div className="flex justify-center mt-6">
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => paginate(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                {[...Array(totalPages)].map((_, index) => (
                  <Button
                    key={index}
                    variant={currentPage === index + 1 ? "default" : "outline"}
                    onClick={() => paginate(index + 1)}
                  >
                    {index + 1}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  onClick={() => paginate(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ClaimsTimeline;