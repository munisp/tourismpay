import React, { useState } from 'react';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FraudNode {
  id: string;
  label: string;
  type: 'customer' | 'policy' | 'claim' | 'agent';
  riskScore: number;
  connections: string[];
}

interface FraudGraph {
  nodes: FraudNode[];
  edges: { source: string; target: string; type: string }[];
}

const FraudAlerts: React.FC = () => {
  useAuth();
  const utils = trpc.useUtils();

  const [entityId, setEntityId] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  const { data: fraudGraph, isLoading: isLoadingGraph, isError: isErrorGraph, error: graphError } = trpc.fraudNetwork.graph.useQuery(undefined, {
    enabled: true,
  });

  const { mutate: analyzeFraud, isLoading: isAnalyzing, isError: isErrorAnalyze, error: analyzeError } = trpc.fraudNetwork.analyze.useMutation({
    onSuccess: (data) => {
      toast.success('Fraud analysis initiated successfully!');
      setAnalysisResult(`Analysis for entity ${entityId}: ${data.message}`);
      utils.fraudNetwork.graph.invalidate(); // Invalidate graph to reflect potential changes
    },
    onError: (err) => {
      toast.error(`Failed to analyze fraud: ${err.message}`);
      setAnalysisResult(null);
    },
  });

  if (isErrorGraph) {
    toast.error(`Error loading fraud graph: ${graphError?.message}`);
  }
  if (isErrorAnalyze) {
    toast.error(`Error during fraud analysis: ${analyzeError?.message}`);
  }

  const handleAnalyze = () => {
    if (entityId.trim()) {
      if (false) {
        toast.info(`Analyzing entity ${entityId}`);
        setAnalysisResult(`Analysis for ${entityId}: No fraud detected.`);
      } else {
        analyzeFraud({ entityId });
      }
    } else {
      toast.warning('Please enter an Entity ID to analyze.');
    }
  };

  const displayGraph = fraudGraph;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Fraud Alerts & Network Analysis</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Fraud Network Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingGraph && true ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading fraud network...</span>
            </div>
          ) : (
            <div>
              <p className="mb-4">Visual representation of interconnected entities and their risk scores.</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Risk Score</TableHead>
                    <TableHead>Connections</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayGraph?.nodes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center">No fraud network data available.</TableCell>
                    </TableRow>
                  )}
                  {displayGraph?.nodes.map((node) => (
                    <TableRow key={node.id}>
                      <TableCell>{node.id}</TableCell>
                      <TableCell>{node.label}</TableCell>
                      <TableCell>{node.type}</TableCell>
                      <TableCell>
                        <Badge variant={node.riskScore > 0.7 ? 'destructive' : node.riskScore > 0.5 ? 'warning' : 'default'}>
                          {(node.riskScore * 100).toFixed(0)}%
                        </Badge>
                      </TableCell>
                      <TableCell>{node?.connections?.join(', ') || ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Analyze Specific Entity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2">
            <Input
              placeholder="Enter Entity ID (e.g., cust-001, claim-001)"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="flex-grow"
            />
            <Button onClick={handleAnalyze} disabled={isAnalyzing || !entityId.trim()}>
              {isAnalyzing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Analyze
            </Button>
          </div>
          {analysisResult && (
            <p className="mt-4 text-sm text-muted-foreground">{analysisResult}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FraudAlerts;