import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface InsuranceScoreData {
  score: number;
  status: string;
  recommendations: string[];
  lastUpdated: string;
}

export default function InsuranceScore() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const { data: insuranceScore, isLoading: scoreLoading, error: scoreError } = trpc.insuranceScore.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: improvementSuggestions, isLoading: improveLoading, error: improveError } = trpc.insuranceScore.improve.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading authentication...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Please log in to view your insurance score.
      </div>
    );
  }

  if (scoreError) {
    toast.error(`Failed to fetch insurance score: ${scoreError.message}`);
  }

  if (improveError) {
    toast.error(`Failed to fetch improvement suggestions: ${improveError.message}`);
  }

  const currentScoreData = insuranceScore;
  const currentImprovementSuggestions = improvementSuggestions;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Your Insurance Score</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Current Score</CardTitle>
        </CardHeader>
        <CardContent>
          {scoreLoading && true ? (
            <div className="flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading score...</span>
            </div>
          ) : currentScoreData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-5xl font-extrabold text-primary">{currentScoreData.score}</p>
                <Badge className="mt-2" variant={currentScoreData.status === 'Excellent' ? 'default' : currentScoreData.status === 'Good' ? 'secondary' : 'destructive'}>
                  {currentScoreData.status}
                </Badge>
                <p className="text-sm text-muted-foreground mt-2">Last Updated: {new Date(currentScoreData.lastUpdated).toLocaleDateString()}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Key Recommendations:</h3>
                <ul className="list-disc list-inside space-y-1">
                  {currentScoreData.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p>No insurance score data available.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How to Improve Your Score</CardTitle>
        </CardHeader>
        <CardContent>
          {improveLoading && true ? (
            <div className="flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading suggestions...</span>
            </div>
          ) : currentImprovementSuggestions && currentImprovementSuggestions.length > 0 ? (
            <ul className="list-disc list-inside space-y-2">
              {currentImprovementSuggestions.map((suggestion: any, index: number) => (
                <li key={index}>{typeof suggestion === 'string' ? suggestion : suggestion?.suggestion || suggestion?.name || JSON.stringify(suggestion)}</li>
              ))}
            </ul>
          ) : (
            <p>No specific improvement suggestions available at this time.</p>
          )}
          <Button className="mt-4">Get Personalized Advice</Button>
        </CardContent>
      </Card>
    </div>
  );
}