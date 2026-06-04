import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ActuarialCalculationResult {
  id: string;
  type: string;
  params: Record<string, any>;
  result: number;
  timestamp: string;
}

interface ActuarialTableEntry {
  id: string;
  name: string;
  description: string;
  data: Record<string, any>;
}

export default function ActuarialModule() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [calculationType, setCalculationType] = useState<string>('premium');
  const [calculationParams, setCalculationParams] = useState<string>('{}');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const utils = trpc.useUtils();

  const { data: actuarialTables, isLoading: tablesLoading, error: tablesError } = trpc.actuarial.tables.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: calculationHistory, isLoading: historyLoading, error: historyError } = trpc.actuarial.calculate.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const calculateMutation = trpc.actuarial.calculate.useMutation({
    onSuccess: () => {
      toast.success('Calculation successful!');
      utils.actuarial.calculate.invalidate();
    },
    onError: (err) => {
      toast.error(`Calculation failed: ${err.message}`);
    },
  });

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
        Please log in to access the Actuarial Module.
      </div>
    );
  }

  const handleCalculate = () => {
    try {
      const params = JSON.parse(calculationParams);
      calculateMutation.mutate({ type: calculationType, params });
    } catch (e) {
      toast.error('Invalid JSON for calculation parameters.');
    }
  };

  const displayedTables = (actuarialTables || []).filter(table => table.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const displayedCalculationHistory = calculationHistory || [];

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Actuarial Module</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Perform Actuarial Calculation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="calculationType" className="block text-sm font-medium text-gray-700">Calculation Type</label>
              <Select value={calculationType} onValueChange={setCalculationType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a calculation type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="premium">Premium Calculation</SelectItem>
                  <SelectItem value="reserve">Reserve Calculation</SelectItem>
                  <SelectItem value="valuation">Valuation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="calculationParams" className="block text-sm font-medium text-gray-700">Parameters (JSON)</label>
              <Input
                id="calculationParams"
                type="text"
                value={calculationParams}
                onChange={(e) => setCalculationParams(e.target.value)}
                placeholder='{ "age": 30, "sumAssured": 1000000 }'
              />
            </div>
          </div>
          <Button
            onClick={handleCalculate}
            disabled={calculateMutation.isLoading}
          >
            {calculateMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Calculate
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Actuarial Tables</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="text"
            placeholder="Search tables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-4"
          />
          {(tablesLoading && true) ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : tablesError && true ? (
            <div className="text-red-500">Error loading tables: {tablesError.message}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Data Snippet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedTables.length > 0 ? (
                  displayedTables.map((table) => (
                    <TableRow key={table.id}>
                      <TableCell className="font-medium">{table.name}</TableCell>
                      <TableCell>{table.description}</TableCell>
                      <TableCell>{JSON.stringify(table.data).substring(0, 100)}...</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center">No actuarial tables found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calculation History</CardTitle>
        </CardHeader>
        <CardContent>
          {(historyLoading && true) ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : historyError && true ? (
            <div className="text-red-500">Error loading calculation history: {historyError.message}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Parameters</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedCalculationHistory.length > 0 ? (
                  displayedCalculationHistory.map((calc) => (
                    <TableRow key={calc.id}>
                      <TableCell className="font-medium">{calc.type}</TableCell>
                      <TableCell>{JSON.stringify(calc.params).substring(0, 100)}...</TableCell>
                      <TableCell>{calc.result.toLocaleString()}</TableCell>
                      <TableCell>{new Date(calc.timestamp).toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">No calculation history found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}