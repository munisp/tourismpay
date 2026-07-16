import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Network, Search, Loader2, MessageSquare } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Answer { question: string; answer: string; confidence: number; timestamp: string; }

export default function KnowledgeGraphExplorer() {
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const { data: entities, isLoading } = trpc.knowledgeGraph.entities.useQuery();
  const queryMutation = trpc.knowledgeGraph.query.useMutation({
    onSuccess: (data: any) => { setAnswers(prev => [{ question, answer: data?.answer ?? "", confidence: data?.confidence ?? 0, timestamp: new Date().toISOString() }, ...prev]); setQuestion(""); },
    onError: (e: any) => toast.error("Query failed", { description: e.message }),
  });
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold flex items-center gap-2"><Network className="h-8 w-8 text-purple-600"/>Knowledge Graph Explorer</h1><p className="text-muted-foreground mt-1">Query the insurance knowledge graph with natural language</p></div>
      <Card><CardHeader><CardTitle>Ask a Question</CardTitle><CardDescription>Query the knowledge graph using natural language</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><Input placeholder="e.g. What policies does customer John Doe have?" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && question) queryMutation.mutate({ question }); }} className="pl-9"/></div>
            <Button onClick={() => queryMutation.mutate({ question })} disabled={!question || queryMutation.isLoading}>{queryMutation.isLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <MessageSquare className="h-4 w-4"/>}</Button>
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto">{answers.map((a, i) => (
            <div key={i} className="p-3 border rounded-lg space-y-2">
              <p className="text-sm font-medium text-blue-600">Q: {a.question}</p>
              <p className="text-sm">{a.answer}</p>
              <div className="flex items-center gap-2"><Badge variant="outline" className="text-xs">Confidence: {Math.round(a.confidence * 100)}%</Badge><span className="text-xs text-muted-foreground">{new Date(a.timestamp).toLocaleTimeString()}</span></div>
            </div>
          ))}</div>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Graph Entities</CardTitle><CardDescription>{((entities as any[]) ?? []).length} entities</CardDescription></CardHeader>
        <CardContent>{isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin"/></div> :
          <div className="flex flex-wrap gap-2">{((entities as any[]) ?? []).slice(0, 50).map((e: any, i: number) => (<Badge key={i} variant="outline" className="text-xs">{e.name ?? e.id}</Badge>))}</div>
        }</CardContent>
      </Card>
    </div>
  );
}
