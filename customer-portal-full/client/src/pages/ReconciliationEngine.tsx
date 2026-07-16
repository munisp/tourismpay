import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Card,
  CardContent,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

interface ReconciliationSummary {
  id: string;
  period: string;
  status: 'Pending' | 'Completed' | 'Failed';
  discrepancies: number;
  lastRun: string;
}

const ReconciliationEngine: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2024-06');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const { data: summaryData, isLoading: isSummaryLoading, error: summaryError, refetch: refetchSummary } = trpc.reconciliation.summary.useQuery(
    { period: selectedPeriod },
    { enabled: isAuthenticated }
  );

  const runReconciliationMutation = trpc.reconciliation.run.useMutation();
  const trpcUtils = trpc.useUtils();

  useEffect(() => {
    if (summaryError) {
      toast.error("Failed to fetch reconciliation summary.", { description: summaryError.message });
    }
  }, [summaryError]);

  const handleRunReconciliation = async () => {
    if (!isAuthenticated) {
      toast.error("Authentication required to run reconciliation.");
      return;
    }
    try {
      await runReconciliationMutation.mutateAsync({ period: selectedPeriod });
      toast.success("Reconciliation initiated successfully.");
      trpcUtils.reconciliation.summary.invalidate({ period: selectedPeriod });
    } catch (error: any) {
      toast.error("Failed to initiate reconciliation.", { description: error.message });
    }
  };

  const filteredSummaries = (summaryData || []).filter(summary =>
    summary.period.toLowerCase().includes(searchQuery.toLowerCase()) ||
    summary.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card className="w-full max-w-4xl mx-auto mt-8">
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Please log in to view the Reconciliation Engine.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-6xl mx-auto mt-8">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          Reconciliation Engine
          <Dialog>
            <DialogTrigger asChild>
              <Button onClick={() => {}}>
                Run Reconciliation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Reconciliation</DialogTitle>
                <DialogDescription>
                  Are you sure you want to run reconciliation for the period: {selectedPeriod}?
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => {}}>Cancel</Button>
                <Button
                  onClick={handleRunReconciliation}
                  disabled={runReconciliationMutation.isLoading}
                >
                  {runReconciliationMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirm
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-4 mb-6 items-center">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2024-06">June 2024</SelectItem>
              <SelectItem value="2024-05">May 2024</SelectItem>
              <SelectItem value="2024-04">April 2024</SelectItem>
              <SelectItem value="2024-03">March 2024</SelectItem>
              <SelectItem value="2024-02">February 2024</SelectItem>
              <SelectItem value="2024-01">January 2024</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Search by period or status..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-grow"
          />
        </div>

        {isSummaryLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Discrepancies</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSummaries.length > 0 ? (
                filteredSummaries.map((summary) => (
                  <TableRow key={summary.id}>
                    <TableCell className="font-medium">{summary.id}</TableCell>
                    <TableCell>{summary.period}</TableCell>
                    <TableCell>
                      <Badge
                        variant={summary.status === 'Completed' ? 'default' : summary.status === 'Pending' ? 'secondary' : 'destructive'}
                      >
                        {summary.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{summary.discrepancies}</TableCell>
                    <TableCell>{summary.lastRun}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => toast.info(`Viewing details for ${summary.id}`)}>
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">No reconciliation summaries found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default ReconciliationEngine;