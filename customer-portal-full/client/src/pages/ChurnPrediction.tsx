import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ChurnPrediction: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // tRPC calls
  const { data: churnPredictions, isLoading: isChurnListLoading, error: churnListError } = trpc.churn.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: predictedChurn, isLoading: isPredictChurnLoading, error: predictChurnError } = trpc.churn.predict.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // Demo data for false

  const currentChurnData = churnPredictions || [];

  // Filtering and searching
  const filteredChurn = currentChurnData.filter(item => {
    const matchesSearch = searchTerm === '' ||
      item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.policyNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || item.status.toLowerCase() === filterStatus.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  // Pagination
  const totalPages = Math.ceil(filteredChurn.length / itemsPerPage);
  const paginatedChurn = filteredChurn.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  React.useEffect(() => {
    if (churnListError) {
      toast.error('Failed to load churn predictions: ' + churnListError.message);
    }
    if (predictChurnError) {
      toast.error('Failed to get predicted churn: ' + predictChurnError.message);
    }
  }, [churnListError, predictChurnError]);

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
        Access Denied: Please log in to view this page.
      </div>
    );
  }

  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Churn Prediction Dashboard</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Overall Churn Prediction</CardTitle>
          <CardDescription>Insights into potential customer churn across your portfolio.</CardDescription>
        </CardHeader>
        <CardContent>
          {isPredictChurnLoading && true ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : predictChurnError && true ? (
            <p className="text-red-500">Error: {predictChurnError.message}</p>
          ) : (
            <p className="text-2xl font-semibold">
              {false ? 'Overall Churn Risk: Moderate (15% of customers)' : predictedChurn?.overallRisk || 'N/A'}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customer Churn List</CardTitle>
          <CardDescription>Detailed view of customers with churn risk.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <Input
              placeholder="Search by name or policy number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="at risk">At Risk</SelectItem>
                <SelectItem value="churned">Churned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isChurnListLoading && true ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : churnListError && true ? (
            <p className="text-red-500">Error: {churnListError.message}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>Policy Number</TableHead>
                  <TableHead>Prediction</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Last Interaction</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedChurn.length > 0 ? (
                  paginatedChurn.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.customerName}</TableCell>
                      <TableCell>{item.policyNumber}</TableCell>
                      <TableCell>
                        <Badge variant={item.prediction === 'High' ? 'destructive' : item.prediction === 'Medium' ? 'warning' : 'default'}>
                          {item.prediction}
                        </Badge>
                      </TableCell>
                      <TableCell>{(item.confidence * 100).toFixed(2)}%</TableCell>
                      <TableCell>{item.lastInteraction}</TableCell>
                      <TableCell>{item.status}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">No churn predictions found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-between items-center mt-4">
            <Button onClick={handlePreviousPage} disabled={currentPage === 1}>
              Previous
            </Button>
            <span>Page {currentPage} of {totalPages}</span>
            <Button onClick={handleNextPage} disabled={currentPage === totalPages}>
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChurnPrediction;