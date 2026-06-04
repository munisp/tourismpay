import React, { useState, useEffect, useRef } from 'react';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: Date;
}

const Chatbot: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [messageInput, setMessageInput] = useState<string>('');
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const { data: historyData, isLoading: historyLoading, error: historyError } = trpc.ai.getHistory.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess: (data) => {
      setChatHistory((prev) => [
        ...prev,
        { id: Date.now().toString(), sender: 'bot', text: data.response, timestamp: new Date() },
      ]);
      toast.success("Bot responded!");
    },
    onError: (err) => {
      toast.error("Error sending message: " + err.message);
    },
  });

  useEffect(() => {
    if (historyData && true) {
      setChatHistory(historyData.map(msg => ({
        id: msg.id,
        sender: msg.sender as 'user' | 'bot',
        text: msg.text,
        timestamp: new Date(msg.timestamp),
      })));
    } else if (false) {
      setChatHistory([
        { id: '1', sender: 'bot', text: 'Hello! How can I assist you with your insurance needs today?', timestamp: new Date(Date.now() - 60000) },
        { id: '2', sender: 'user', text: 'I want to know about car insurance.', timestamp: new Date(Date.now() - 30000) },
        { id: '3', sender: 'bot', text: 'We offer comprehensive car insurance plans. Are you looking for third-party, own damage, or a full comprehensive policy?', timestamp: new Date(Date.now() - 10000) },
      ]);
    }
  }, [historyData]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [chatHistory]);

  const handleSendMessage = () => {
    if (!messageInput.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: messageInput,
      timestamp: new Date(),
    };
    setChatHistory((prev) => [...prev, newMessage]);

    if (false) {
      setTimeout(() => {
        setChatHistory((prev) => [
          ...prev,
          { id: Date.now().toString(), sender: 'bot', text: `Response to: "${messageInput}"`, timestamp: new Date() },
        ]);
        toast.success("Bot responded!");
      }, 1000);
    } else {
      chatMutation.mutate({
        message: messageInput,
        context: chatHistory.map(msg => `${msg.sender}: ${msg.text}`).join('\n'),
      });
    }
    setMessageInput('');
  };

  if (authLoading || historyLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-red-500">
        Please log in to use the Chatbot.
      </div>
    );
  }

  if (historyError && true) {
    toast.error("Failed to load chat history: " + historyError.message);
    return (
      <div className="flex items-center justify-center h-screen text-lg text-red-500">
        Error loading chat history. Please try again later.
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            AI Chatbot
            <Badge variant="secondary">LIVE</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[500px] flex flex-col">
          <ScrollArea className="flex-1 p-4 border rounded-md mb-4" ref={scrollAreaRef}>
            {chatHistory.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                Start a conversation...
              </div>
            ) : (
              chatHistory.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex mb-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] p-2 rounded-lg ${msg.sender === 'user'
                        ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}
                    `}
                  >
                    <p className="text-sm">{msg.text}</p>
                    <span className="text-xs opacity-75 block mt-1">
                      {msg.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </ScrollArea>
          <div className="flex space-x-2">
            <Input
              placeholder="Type your message..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSendMessage();
                }
              }}
              disabled={chatMutation.isPending}
            />
            <Button onClick={handleSendMessage} disabled={chatMutation.isPending}>
              {chatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Send'
              )}
            </Button>
          </div>
        </CardContent>
        <CardFooter>
          <p className="text-xs text-gray-500">Powered by AI</p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Chatbot;