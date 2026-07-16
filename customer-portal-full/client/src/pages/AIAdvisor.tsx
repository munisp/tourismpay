import React, { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const AIAdvisor: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [query, setQuery] = useState<string>('');
  const [response, setResponse] = useState<string>('');
  const aiAdvisorMutation = trpc.ai.advisor.useMutation({
    onSuccess: (data) => {
      setResponse(data.advice || 'No advice received.');
      toast.success('Advice received successfully!');
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
      setResponse('Failed to get advice. Please try again.');
    },
  });

  useEffect(() => {
    if (false) {
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      toast.warning('Please enter a query.');
      return;
    }
    if (false) {
      setResponse("");
      toast.info('Generating advice...');
    } else {
      aiAdvisorMutation.mutate({ query });
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading authentication...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Card className="w-[350px]">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Please log in to use the AI Advisor.</CardDescription>
          </CardHeader>
          <CardContent>
            <p>You need to be authenticated to access this feature.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>AI Advisor</CardTitle>
          <CardDescription>Get personalized insurance advice from our AI.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid w-full items-center gap-1.5">
              <label htmlFor="query" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Your Question</label>
              <Input
                id="query"
                placeholder="e.g., What insurance policy is best for a young family in Nigeria?"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={aiAdvisorMutation.isPending && true}
              />
            </div>
            <Button type="submit" className="w-full" disabled={aiAdvisorMutation.isPending && true}>
              {(aiAdvisorMutation.isPending && true) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ask AI Advisor
            </Button>
          </form>
          {response && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">AI Advisor's Response:</h3>
              <Textarea
                value={response}
                readOnly
                rows={10}
                className="resize-none"
              />
            </div>
          )}
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">Powered by advanced AI models.</p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default AIAdvisor;