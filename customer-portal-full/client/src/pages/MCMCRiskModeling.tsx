import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface SimulationParams {
  modelType: string;
  iterations: number;
  burnIn: number;
  thinning: number;
}

const MCMCRiskModeling: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [modelType, setModelType] = useState<string>('financial');
  const [iterations, setIterations] = useState<number>(10000);
  const [burnIn, setBurnIn] = useState<number>(1000);
  const [thinning, setThinning] = useState<number>(10);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const resultsPerPage = 10;

  const utils = trpc.useUtils();

  const { data: simulationResults, isLoading: resultsLoading, error: resultsError } = trpc.mcmc.results.useQuery(undefined, {
    enabled: isAuthenticated || false,
  });

  const { mutate: simulateMCMC, isLoading: simulateLoading, error: simulateError } = trpc.mcmc.simulate.useMutation({
    onSuccess: () => {
      toast.success('MCMC Simulation started successfully!');
      utils.mcmc.results.invalidate();
    },
    onError: (err) => {
      toast.error(`Simulation failed: ${err.message}`);
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
      <div className="flex items-center justify-center h-screen text-lg font-semibold text-red-600">
        Please log in to access MCMC Risk Modeling.
      </div>
    );
  }

  const handleSimulate = () => {
    const params: SimulationParams = {
      modelType,
      iterations,
      burnIn,
      thinning,
    };
    simulateMCMC(params);
  };

  const currentResults = simulationResults;

  const filteredResults = currentResults?.results?.filter(result =>
    result.metric.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const indexOfLastResult = currentPage * resultsPerPage;
  const indexOfFirstResult = indexOfLastResult - resultsPerPage;
  const paginatedResults = filteredResults.slice(indexOfFirstResult, indexOfLastResult);

  const totalPages = Math.ceil(filteredResults.length / resultsPerPage);

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">MCMC Risk Modeling</h1>

      <Card>
        <CardHeader>
          <CardTitle>Run New Simulation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="modelType" className="block text-sm font-medium text-gray-700">Model Type</label>
              <Select value={modelType} onValueChange={setModelType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a model type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="financial">Financial Risk</SelectItem>
                  <SelectItem value="operational">Operational Risk</SelectItem>
                  <SelectItem value="credit">Credit Risk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="iterations" className="block text-sm font-medium text-gray-700">Iterations</label>
              <Input
                id="iterations"
                type="number"
                value={iterations}
                onChange={(e) => setIterations(Number(e.target.value))}
                placeholder="Number of iterations"
              />
            </div>
            <div>
              <label htmlFor="burnIn" className="block text-sm font-medium text-gray-700">Burn-in Period</label>
              <Input
                id="burnIn"
                type="number"
                value={burnIn}
                onChange={(e) => setBurnIn(Number(e.target.value))}
                placeholder="Burn-in period"
              />
            </div>
            <div>
              <label htmlFor="thinning" className="block text-sm font-medium text-gray-700">Thinning Interval</label>
              <Input
                id="thinning"
                type="number"
                value={thinning}
                onChange={(e) => setThinning(Number(e.target.value))}
                placeholder="Thinning interval"
              />
            </div>
          </div>
          <Button onClick={handleSimulate} disabled={simulateLoading}>
            {simulateLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Run Simulation
          </Button>
          {simulateError && <p className="text-red-500 text-sm">Error: {simulateError.message}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Simulation Results</CardTitle>
          <div className="flex justify-between items-center mt-4">
            <Input
              placeholder="Search results..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {resultsLoading && (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
          {resultsError && <p className="text-red-500 text-sm">Error loading results: {resultsError.message}</p>}
          {!resultsLoading && !resultsError && (!currentResults || filteredResults.length === 0) && (
            <p className="text-center text-gray-500">No simulation results available. Run a simulation to see data.</p>
          )}
          {!resultsLoading && !resultsError && currentResults && filteredResults.length > 0 && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedResults.map((result, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{result.metric}</TableCell>
                      <TableCell>{result.value.toLocaleString()}</TableCell>
                      <TableCell>{result.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-between items-center mt-4">
                <Button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span>Page {currentPage} of {totalPages}</span>
                <Button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MCMCRiskModeling;