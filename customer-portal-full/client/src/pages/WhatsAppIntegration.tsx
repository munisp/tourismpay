import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, Phone, Loader2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function WhatsAppIntegration() {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const { data: history, isLoading, refetch } = trpc.whatsapp.history.useQuery();
  const sendMutation = trpc.whatsapp.send.useMutation({
    onSuccess: () => { toast.success("Message sent via WhatsApp"); setMessage(""); refetch(); },
    onError: (e: any) => toast.error("Send failed", { description: e.message }),
  });
  const messages = (history as any[]) ?? [];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold flex items-center gap-2"><MessageSquare className="h-8 w-8 text-green-600"/>WhatsApp Integration</h1><p className="text-muted-foreground mt-1">Send and receive messages via WhatsApp Business API</p></div>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2"/>Refresh</Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Send Message</CardTitle><CardDescription>Send a WhatsApp message to a customer</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><label className="text-sm font-medium">Phone Number</label><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><Input placeholder="+234 800 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-9"/></div></div>
            <div className="space-y-2"><label className="text-sm font-medium">Message</label><textarea className="w-full min-h-[120px] p-3 border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Type your message..." value={message} onChange={(e) => setMessage(e.target.value)}/></div>
            <Button className="w-full" onClick={() => sendMutation.mutate({ phone, message })} disabled={!phone || !message || sendMutation.isLoading}>{sendMutation.isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Send className="h-4 w-4 mr-2"/>}Send Message</Button>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Message History</CardTitle><CardDescription>{messages.length} messages</CardDescription></CardHeader>
          <CardContent>{isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin"/></div> :
            messages.length === 0 ? <p className="text-center text-muted-foreground py-8">No messages yet</p> :
            <div className="space-y-3 max-h-80 overflow-y-auto">{messages.map((msg: any, i: number) => (
              <div key={i} className="p-3 border rounded-lg space-y-1">
                <div className="flex items-center justify-between"><span className="font-medium text-sm">{msg.phone}</span><Badge variant={msg.status === "delivered" ? "default" : "secondary"}>{msg.status ?? "sent"}</Badge></div>
                <p className="text-sm text-muted-foreground">{msg.message}</p>
                <p className="text-xs text-muted-foreground">{msg.sentAt ? new Date(msg.sentAt).toLocaleString() : ""}</p>
              </div>
            ))}</div>
          }</CardContent>
        </Card>
      </div>
    </div>
  );
}
