import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { logger } from "@/lib/logger";

interface MCMCParams {
  modelType: string;
  params: Record<string, any>;
}

interface GeospatialParams {
  lat: number;
  lng: number;
  radius: number;
}

const RiskAssessment: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [mcmcModelType, setMcmcModelType] = useState<string>('');
  const [mcmcInputParams, setMcmcInputParams] = useState<string>('{}'); // JSON string
  const [geospatialLat, setGeospatialLat] = useState<string>('');
  const [geospatialLng, setGeospatialLng] = useState<string>('');
  const [geospatialRadius, setGeospatialRadius] = useState<string>('');

  // tRPC mutations
  const mcmcSimulateMutation = trpc.mcmc.simulate.useMutation({
    onSuccess: (data) => {
      toast.success('MCMC Simulation initiated successfully!');
      logger.log('MCMC Simulation Results:', data);
      trpc.useUtils().mcmc.results.invalidate(); // Invalidate MCMC results cache
    },
    onError: (error) => {
      toast.error(`MCMC Simulation failed: ${error.message}`);
    },
  });
  const { data: mcmcResults, isLoading: mcmcResultsLoading, isError: mcmcResultsError } = trpc.mcmc.results.useQuery(undefined, { enabled: mcmcSimulateMutation.isSuccess || false });

  const geospatialAnalyzeMutation = trpc.geospatial.analyze.useMutation({
    onSuccess: (data) => {
      toast.success('Geospatial Analysis initiated successfully!');
      logger.log('Geospatial Analysis Results:', data);
      trpc.useUtils().geospatial.riskMap.invalidate(); // Invalidate Geospatial risk map cache
    },
    onError: (error) => {
      toast.error(`Geospatial Analysis failed: ${error.message}`);
    },
  });
  const { data: geospatialRiskMap, isLoading: geospatialRiskMapLoading, isError: geospatialRiskMapError } = trpc.geospatial.riskMap.useQuery({ lat: parseFloat(geospatialLat) || 0, lng: parseFloat(geospatialLng) || 0, radius: parseFloat(geospatialRadius) || 0 }, { enabled: geospatialAnalyzeMutation.isSuccess || false });

  const handleMCMCSimulate = () => {
    if (!isAuthenticated) {
      toast.error('You must be logged in to perform MCMC simulation.');
      return;
    }
    try {
      const params = JSON.parse(mcmcInputParams);
      mcmcSimulateMutation.mutate({ modelType: mcmcModelType, params });
    } catch (e) {
      toast.error('Invalid JSON for MCMC parameters.');
    }
  };

  const handleGeospatialAnalyze = () => {
    if (!isAuthenticated) {
      toast.error('You must be logged in to perform Geospatial analysis.');
      return;
    }
    const lat = parseFloat(geospatialLat);
    const lng = parseFloat(geospatialLng);
    const radius = parseFloat(geospatialRadius);

    if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
      toast.error('Invalid input for latitude, longitude, or radius.');
      return;
    }
    geospatialAnalyzeMutation.mutate({ lat, lng, radius });
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Please log in to access the Risk Assessment page.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Risk Assessment</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>MCMC Risk Simulation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mcmcModelType" className="block text-sm font-medium text-gray-700">Model Type</label>
              <Select value={mcmcModelType} onValueChange={setMcmcModelType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a model type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="modelA">Model A</SelectItem>
                  <SelectItem value="modelB">Model B</SelectItem>
                  <SelectItem value="modelC">Model C</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="mcmcInputParams" className="block text-sm font-medium text-gray-700">Input Parameters (JSON)</label>
              <Input
                id="mcmcInputParams"
                type="text"
                value={mcmcInputParams}
                onChange={(e) => setMcmcInputParams(e.target.value)}
                placeholder={'e.g., {"age": 30, "income": 50000}'}
              />
            </div>
          </div>
          <Button
            onClick={handleMCMCSimulate}
            className="mt-4"
            disabled={mcmcSimulateMutation.isLoading || !mcmcModelType || !mcmcInputParams}
          >
            {mcmcSimulateMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Run MCMC Simulation
          </Button>
          {mcmcResultsLoading && (
            <div className="mt-4 flex items-center justify-center">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading MCMC Results...
            </div>
          )}
          {mcmcResultsError && (
            <div className="mt-4 p-2 bg-red-100 border border-red-400 text-red-700 rounded">
              Error loading MCMC results.
            </div>
          )}
          {mcmcResults && (
            <div className="mt-4 p-2 bg-green-100 border border-green-400 text-green-700 rounded">
              <h3 className="font-semibold">MCMC Simulation Results:</h3>
              <pre className="whitespace-pre-wrap">{JSON.stringify(mcmcResults, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Geospatial Risk Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="geospatialLat" className="block text-sm font-medium text-gray-700">Latitude</label>
              <Input
                id="geospatialLat"
                type="number"
                value={geospatialLat}
                onChange={(e) => setGeospatialLat(e.target.value)}
                placeholder="e.g., 6.5244"
              />
            </div>
            <div>
              <label htmlFor="geospatialLng" className="block text-sm font-medium text-gray-700">Longitude</label>
              <Input
                id="geospatialLng"
                type="number"
                value={geospatialLng}
                onChange={(e) => setGeospatialLng(e.target.value)}
                placeholder="e.g., 3.3792"
              />
            </div>
            <div>
              <label htmlFor="geospatialRadius" className="block text-sm font-medium text-gray-700">Radius (km)</label>
              <Input
                id="geospatialRadius"
                type="number"
                value={geospatialRadius}
                onChange={(e) => setGeospatialRadius(e.target.value)}
                placeholder="e.g., 10"
              />
            </div>
          </div>
          <Button
            onClick={handleGeospatialAnalyze}
            className="mt-4"
            disabled={geospatialAnalyzeMutation.isLoading || !geospatialLat || !geospatialLng || !geospatialRadius}
          >
            {geospatialAnalyzeMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Run Geospatial Analysis
          </Button>
          {geospatialRiskMapLoading && (
            <div className="mt-4 flex items-center justify-center">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading Geospatial Risk Map...
            </div>
          )}
          {geospatialRiskMapError && (
            <div className="mt-4 p-2 bg-red-100 border border-red-400 text-red-700 rounded">
              Error loading Geospatial Risk Map.
            </div>
          )}
          {geospatialRiskMap && (
            <div className="mt-4 p-2 bg-green-100 border border-green-400 text-green-700 rounded">
              <h3 className="font-semibold">Geospatial Risk Map:</h3>
              <pre className="whitespace-pre-wrap">{JSON.stringify(geospatialRiskMap, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RiskAssessment;
