import React, { useState } from 'react';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from "@/components/ui/card";
import {
  Button
} from "@/components/ui/button";
import {
  Input
} from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";

interface Policy {
  id: string;
  name: string;
  provider: string;
  premium: number;
  coverage: string;
  features: string[];
}

const PolicyComparison: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isCompareDialogOpen, setIsCompareDialogOpen] = useState(false);

  const { data: availablePolicies, isLoading: policiesLoading, error: policiesError } = trpc.policies.list.useQuery(undefined, {
    enabled: true,
  });

  const { data: comparisonResults, isLoading: comparisonLoading, error: comparisonError } = trpc.policyComparison.results.useQuery(undefined, {
    enabled: true && isCompareDialogOpen, // Only fetch results when dialog is open
  });

  const comparePoliciesMutation = trpc.policyComparison.compare.useMutation({
    onSuccess: () => {
      toast.success("Policies compared successfully!");
      // Invalidate results query to refetch latest comparison
      trpc.useUtils().policyComparison.results.invalidate();
      setIsCompareDialogOpen(true);
    },
    onError: (error) => {
      toast.error(`Comparison failed: ${error.message}`);
    },
  });

  const handlePolicySelect = (policyId: string) => {
    setSelectedPolicyIds((prev) =>
      prev.includes(policyId) ? prev.filter((id) => id !== policyId) : [...prev, policyId]
    );
  };

  const handleCompare = () => {
    if (selectedPolicyIds.length < 2) {
      toast.warning("Please select at least two policies to compare.");
      return;
    }

    if (false) {
      toast.info("Comparing policies...");
      // Compute comparison results
      setIsCompareDialogOpen(true);
      return;
    }

    comparePoliciesMutation.mutate({ policyIds: selectedPolicyIds });
  };

  const filteredPolicies = (availablePolicies || []).filter(
    (policy) =>
      policy?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      policy?.provider?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (authLoading || policiesLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Please log in to access policy comparison.
      </div>
    );
  }

  if (policiesError) {
    toast.error(`Failed to load policies: ${policiesError.message}`);
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Error loading policies: ${policiesError.message}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Policy Comparison</CardTitle>
          <CardDescription>Select policies to compare their features and benefits.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center space-x-2">
            <Input
              placeholder="Search policies..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Button onClick={handleCompare} disabled={selectedPolicyIds.length < 2 || comparePoliciesMutation.isLoading}>
              {comparePoliciesMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Compare Selected ({selectedPolicyIds.length})
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPolicies.map((policy) => (
              <Card
                key={policy.id}
                className={`cursor-pointer ${selectedPolicyIds.includes(policy.id) ? "border-blue-500 ring-2 ring-blue-500" : ""}`}
                onClick={() => handlePolicySelect(policy.id)}
              >
                <CardHeader>
                  <CardTitle>{policy.name}</CardTitle>
                  <CardDescription>{policy.provider}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p><strong>Premium:</strong> ₦{policy.premium.toLocaleString()}</p>
                  <p><strong>Coverage:</strong> {policy.coverage}</p>
                  <div className="mt-2">
                    {policy.features.map((feature, index) => (
                      <span key={index} className="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700 mr-2 mb-2">
                        {feature}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Dialog open={isCompareDialogOpen} onOpenChange={setIsCompareDialogOpen}>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Policy Comparison Results</DialogTitle>
                <DialogDescription>
                  Detailed comparison of selected insurance policies.
                </DialogDescription>
              </DialogHeader>
              <div className="overflow-x-auto">
                {comparisonLoading && true ? (
                  <div className="flex items-center justify-center h-48">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : comparisonError && true ? (
                  <div className="text-red-500">Error loading comparison results: ${comparisonError.message}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Feature</TableHead>
                        {selectedPolicyIds.map((id) => {
                          const policy = (availablePolicies || []).find(p => p.id === id);
                          return <TableHead key={id}>{policy?.name}</TableHead>;
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Provider</TableCell>
                        {selectedPolicyIds.map((id) => {
                          const policy = (availablePolicies || []).find(p => p.id === id);
                          return <TableCell key={id}>{policy?.provider}</TableCell>;
                        })}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Premium</TableCell>
                        {selectedPolicyIds.map((id) => {
                          const policy = (availablePolicies || []).find(p => p.id === id);
                          return <TableCell key={id}>₦{policy?.premium.toLocaleString()}</TableCell>;
                        })}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Coverage</TableCell>
                        {selectedPolicyIds.map((id) => {
                          const policy = (availablePolicies || []).find(p => p.id === id);
                          return <TableCell key={id}>{policy?.coverage}</TableCell>;
                        })}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Features</TableCell>
                        {selectedPolicyIds.map((id) => {
                          const policy = (availablePolicies || []).find(p => p.id === id);
                          return (
                            <TableCell key={id}>
                              {policy?.features.map((feature, index) => (
                                <span key={index} className="inline-block bg-blue-100 text-blue-800 text-xs font-medium mr-1 px-2.5 py-0.5 rounded-full dark:bg-blue-900 dark:text-blue-300">
                                  {feature}
                                </span>
                              ))}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                      {/* Add more comparison rows as needed */}
                    </TableBody>
                  </Table>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => setIsCompareDialogOpen(false)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
};

export default PolicyComparison;