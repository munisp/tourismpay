import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const suggestions = [
  "Plan a 5-day Lagos cultural tour for a family of 4",
  "Best restaurants near Nairobi Safari Club",
  "Visa requirements for Nigeria from UK",
  "Budget safari options in Tanzania under $500",
];

type Message = { role: "user" | "assistant"; content: string };

const initialMessages: Message[] = [
  { role: "assistant", content: "Hello! I am your AI Travel Co-Pilot, specialising in African tourism. I can help you plan trips, find accommodations, navigate visa requirements, and discover hidden gems across Africa. What would you like to explore today?" }
];

export default function AICopilot() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const chatMutation = trpc.copilot.chat.useMutation({
    onSuccess: (data) => {
      setMessages(m => [...m, { role: "assistant", content: data.response }]);
    },
    onError: (err) => {
      toast.error("AI Co-Pilot error", { description: err.message });
      setMessages(m => [...m, { role: "assistant", content: "I encountered an error. Please try again." }]);
    },
  });

  const send = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setMessages(m => [...m, { role: "user" as const, content: msg }]);
    setInput("");
    chatMutation.mutate({ message: msg });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[oklch(0.82_0.18_75)]" />
          <div>
            <h1 className="text-sm font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>AI Travel Co-Pilot</h1>
            <p className="text-[10px] text-muted-foreground">Powered by Qwen2.5 · Local Ollama · No data leaves your infrastructure</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 animate-fade-in-up opacity-0 ${msg.role === "user" ? "flex-row-reverse" : ""}`} style={{ animationFillMode: "forwards" }}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === "assistant" ? "bg-primary/20" : "bg-white/10"}`}>
              {msg.role === "assistant" ? <Bot className="w-4 h-4 text-primary" /> : <User className="w-4 h-4 text-muted-foreground" />}
            </div>
            <div className={`max-w-lg rounded-xl px-4 py-3 text-sm ${msg.role === "assistant" ? "glass-card text-foreground" : "bg-primary/20 text-foreground"}`}>
              <p className="whitespace-pre-line leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center"><Bot className="w-4 h-4 text-primary" /></div>
            <div className="glass-card px-4 py-3 flex items-center gap-1">
              {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {messages.length === 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-border text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors">{s}</button>
          ))}
        </div>
      )}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Ask about destinations, visas, accommodations..."
            className="flex-1 bg-white/5 border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
          <Button onClick={() => send()} className="bg-primary text-primary-foreground h-10 w-10 p-0"><Send className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}