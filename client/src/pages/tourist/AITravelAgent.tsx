import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Bot, Send, User, Sparkles } from "lucide-react";

export default function AITravelAgent() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<{role: string; content: string}[]>([
    { role: "assistant", content: "Hello! I'm your TourismPay AI Travel Agent. I can help you plan your Nigeria trip, find the best hotels, suggest local experiences, and handle your payments. What would you like to explore?" }
  ]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: sessions } = trpc.agenticAI.mySessions.useQuery(undefined, { enabled: !!user?.id });

  useEffect(() => {
    if (sessions && sessions.length > 0 && !sessionId) {
      setSessionId(sessions[0].id);
    }
  }, [sessions]);

  const chatMut = trpc.agenticAI.chat.useMutation({
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    },
    onError: (e) => {
      toast.error("AI Error", { description: e.message });
      setMessages(prev => [...prev, { role: "assistant", content: "I'm having trouble connecting right now. Please try again in a moment." }]);
    },
  });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    chatMut.mutate({ message: userMessage, sessionId });
  };

  const suggestions = [
    "Plan a 7-day Lagos itinerary for under $500",
    "What are the best hotels near Victoria Island?",
    "Help me find local restaurants with QR payments",
    "What documents do I need for Nigeria e-Visa?",
  ];

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">AI Travel Agent</h1>
          <p className="text-sm text-gray-500 flex items-center gap-1"><Sparkles className="w-3 h-3" />Powered by TourismPay AI</p>
        </div>
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === "user" ? "bg-blue-600" : "bg-gradient-to-br from-blue-500 to-purple-600"}`}>
                {msg.role === "user" ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"}`}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {chatMut.isPending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>
              <div className="bg-gray-100 rounded-2xl px-4 py-2"><div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: `${i*0.15}s`}} />)}</div></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        {messages.length === 1 && (
          <div className="px-4 pb-2 grid grid-cols-2 gap-2">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => setInput(s)} className="text-left text-xs p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors">{s}</button>
            ))}
          </div>
        )}

        <div className="p-4 border-t flex gap-2">
          <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()} placeholder="Ask me anything about your Nigeria trip..." className="flex-1" />
          <Button onClick={handleSend} disabled={chatMut.isPending || !input.trim()} size="icon"><Send className="w-4 h-4" /></Button>
        </div>
      </Card>
    </div>
  );
}
