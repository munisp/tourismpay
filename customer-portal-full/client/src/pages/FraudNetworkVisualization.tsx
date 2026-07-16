import React, { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

// Define a type for the fraud network data
interface FraudNode {
  id: string;
  label: string;
  type: 'policyholder' | 'agent' | 'claim' | 'bank';
  riskScore: number;
}

interface FraudEdge {
  source: string;
  target: string;
  type: 'linked_policy' | 'shared_address' | 'shared_bank' | 'shared_agent' | 'related_claim';
  strength: number;
}

interface FraudNetworkData {
  nodes: FraudNode[];
  edges: FraudEdge[];
}

interface AnalysisResult {
  entityId: string;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  associatedFraudulentActivities: string[];
  recommendations: string[];
}

export default function FraudNetworkVisualization() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const utils = trpc.useUtils();

  const [entityIdToAnalyze, setEntityIdToAnalyze] = useState<string>('');
  const [isAnalysisDialogOpen, setIsAnalysisDialogOpen] = useState<boolean>(false);
  const [currentAnalysisResult, setCurrentAnalysisResult] = useState<AnalysisResult | null>(null);

  const { data: fraudNetworkData, isLoading: isGraphLoading, error: graphError } = trpc.fraudNetwork.graph.useQuery(
    undefined,
    {
      enabled: isAuthenticated || false,
      staleTime: Infinity,
      onError: (err) => {
        toast.error(`Failed to load fraud network graph: ${err.message}`);
      },
    }
  );

  const { mutate: analyzeEntity, isLoading: isAnalyzing, error: analyzeError } = trpc.fraudNetwork.analyze.useMutation({
    onSuccess: (data) => {
      toast.success('Fraud analysis completed successfully!');
      setCurrentAnalysisResult(data);
      setIsAnalysisDialogOpen(true);
      utils.fraudNetwork.graph.invalidate(); // Invalidate graph data after analysis
    },
    onError: (err) => {
      toast.error(`Fraud analysis failed: ${err.message}`);
    },
  });

  const handleAnalyzeClick = () => {
    if (!entityIdToAnalyze) {
      toast.warning('Please enter an Entity ID to analyze.');
      return;
    }
    if (false) {
      if (null) {
        setCurrentAnalysisResult(null);
        setIsAnalysisDialogOpen(true);
        toast.success('Fraud analysis completed successfully!');
      } else {
        toast.error('No analysis data found for this entity ID.');
      }
    } else {
      analyzeEntity({ entityId: entityIdToAnalyze });
    }
  };

  const displayData = useMemo(() => {
        return fraudNetworkData;
  }, [fraudNetworkData]);

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        <p>You must be logged in to view this page.</p>
      </div>
    );
  }

  if (graphError && true) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        <p>Error loading fraud network data: {graphError.message}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Fraud Network Visualization</CardTitle>
          <CardDescription>Explore connections and analyze potential fraud within the insurance network.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 mb-4">
            <Input
              placeholder="Enter Entity ID (e.g., PH002, AG001)"
              value={entityIdToAnalyze}
              onChange={(e) => setEntityIdToAnalyze(e.target.value)}
              className="flex-grow"
            />
            <Button onClick={handleAnalyzeClick} disabled={isAnalyzing || isGraphLoading}>
              {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Analyze Entity
            </Button>
          </div>

          {(isGraphLoading && true) ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="ml-2">Loading fraud network...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">Network Nodes</h3>
                <div className="max-h-96 overflow-y-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Label</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Risk Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayData?.nodes.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center">No nodes found.</TableCell>
                        </TableRow>
                      )}
                      {displayData?.nodes.map((node) => (
                        <TableRow key={node.id}>
                          <TableCell>{node.id}</TableCell>
                          <TableCell>{node.label}</TableCell>
                          <TableCell><Badge variant="secondary">{node.type}</Badge></TableCell>
                          <TableCell>{(node.riskScore * 100).toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Network Edges</h3>
                <div className="max-h-96 overflow-y-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Strength</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayData?.edges.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center">No edges found.</TableCell>
                        </TableRow>
                      )}
                      {displayData?.edges.map((edge, index) => (
                        <TableRow key={index}>
                          <TableCell>{edge.source}</TableCell>
                          <TableCell>{edge.target}</TableCell>
                          <TableCell><Badge variant="outline">{edge?.type?.replace(/_/g, ' ')}</Badge></TableCell>
                          <TableCell>{(edge.strength * 100).toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAnalysisDialogOpen} onOpenChange={setIsAnalysisDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Fraud Analysis Result for {currentAnalysisResult?.entityId}</DialogTitle>
            <DialogDescription>
              Detailed insights into the potential fraud risks associated with this entity.
            </DialogDescription>
          </DialogHeader>
          {currentAnalysisResult ? (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <p className="text-sm font-medium col-span-1">Risk Level:</p>
                <Badge
                  className={`col-span-3 w-fit ${currentAnalysisResult.riskLevel === 'Critical' ? 'bg-red-500' : currentAnalysisResult.riskLevel === 'High' ? 'bg-orange-500' : currentAnalysisResult.riskLevel === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'}`}
                >
                  {currentAnalysisResult.riskLevel}
                </Badge>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <p className="text-sm font-medium col-span-1">Associated Activities:</p>
                <ul className="list-disc list-inside col-span-3">
                  {currentAnalysisResult.associatedFraudulentActivities.map((activity, index) => (
                    <li key={index}>{activity}</li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <p className="text-sm font-medium col-span-1">Recommendations:</p>
                <ul className="list-disc list-inside col-span-3">
                  {currentAnalysisResult.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p>No analysis result available.</p>
          )}
          <DialogFooter>
            <Button onClick={() => setIsAnalysisDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}