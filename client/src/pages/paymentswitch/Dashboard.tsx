// @ts-nocheck
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Copy, RefreshCw, ExternalLink, CheckCircle2, XCircle, Clock, BarChart3 } from "lucide-react";
import Analytics from "./Analytics";
import BrandingSettings from "./BrandingSettings";
import { toast } from "sonner";

export default function Dashboard() {
  const { user } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<"ecommerce" | "saas" | "marketplace" | "nonprofit" | "other">("ecommerce");
  const [website, setWebsite] = useState("");
  const [selectedMerchant, setSelectedMerchant] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: merchants, isLoading: loadingMerchants } = trpc.merchant.list.useQuery();
  const { data: transactions, isLoading: loadingTransactions } = trpc.payment.listTransactions.useQuery(
    { merchantId: selectedMerchant! },
    { enabled: !!selectedMerchant }
  );
  const { data: sessions, isLoading: loadingSessions } = trpc.payment.listSessions.useQuery(
    { merchantId: selectedMerchant! },
    { enabled: !!selectedMerchant }
  );

  const createMerchant = trpc.merchant.create.useMutation({
    onSuccess: (data) => {
      toast.success("Merchant account created!");
      // Show API credentials
      toast.info(`API Key: ${data.apiKey}`, { duration: 10000 });
      toast.info(`API Secret: ${data.apiSecret}`, { duration: 10000 });
      setCreateDialogOpen(false);
      setBusinessName("");
      setWebsite("");
      utils.merchant.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to create merchant: ${err.message}`);
    },
  });

  const regenerateApiKey = trpc.merchant.regenerateApiKey.useMutation({
    onSuccess: (data) => {
      toast.success("API credentials regenerated!");
      toast.info(`New API Key: ${data.apiKey}`, { duration: 10000 });
      toast.info(`New API Secret: ${data.apiSecret}`, { duration: 10000 });
      utils.merchant.list.invalidate();
    },
  });

  const handleCreateMerchant = (e: React.FormEvent) => {
    e.preventDefault();
    createMerchant.mutate({ businessName, businessType, website: website || undefined });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const formatAmount = (amount: number, currency: string) => {
    return `${currency} ${(amount / 100).toFixed(2)}`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: "default",
      captured: "default",
      pending: "secondary",
      processing: "secondary",
      failed: "destructive",
      cancelled: "destructive",
    };
    const colors: Record<string, string> = {
      completed: "text-green-600",
      captured: "text-green-600",
      pending: "text-yellow-600",
      processing: "text-blue-600",
      failed: "text-red-600",
      cancelled: "text-gray-600",
    };
    return (
      <Badge variant={variants[status] || "outline"} className={colors[status]}>
        {status}
      </Badge>
    );
  };

  // Auto-select first merchant
  if (merchants && merchants.length > 0 && !selectedMerchant) {
    setSelectedMerchant(merchants[0].id);
  }

  const currentMerchant = merchants?.find(m => m.id === selectedMerchant);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Merchant Dashboard</h1>
            <p className="text-muted-foreground">Manage your payment integrations</p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Merchant Account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateMerchant}>
                <DialogHeader>
                  <DialogTitle>Create Merchant Account</DialogTitle>
                  <DialogDescription>
                    Set up a new merchant account to start accepting payments
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Business Name *</Label>
                    <Input
                      id="businessName"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Acme Inc."
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="businessType">Business Type *</Label>
                    <Select value={businessType} onValueChange={(v) => setBusinessType(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ecommerce">E-commerce</SelectItem>
                        <SelectItem value="saas">SaaS</SelectItem>
                        <SelectItem value="marketplace">Marketplace</SelectItem>
                        <SelectItem value="nonprofit">Non-profit</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMerchant.isPending}>
                    {createMerchant.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Account
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loadingMerchants ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : !merchants || merchants.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No merchant accounts yet</p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Merchant Account
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Merchant Selector */}
            {merchants.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Select Merchant</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={selectedMerchant?.toString()} onValueChange={(v) => setSelectedMerchant(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {merchants.map(m => (
                        <SelectItem key={m.id} value={m.id.toString()}>
                          {m.businessName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            )}

            {currentMerchant && (
              <>
                {/* API Credentials */}
                <Card>
                  <CardHeader>
                    <CardTitle>API Credentials</CardTitle>
                    <CardDescription>Use these credentials to integrate payments</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Label>API Key</Label>
                        <div className="flex gap-2 mt-1">
                          <Input value={currentMerchant.apiKey} readOnly className="font-mono text-sm" />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => copyToClipboard(currentMerchant.apiKey, "API Key")}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => regenerateApiKey.mutate({ id: currentMerchant.id })}
                        disabled={regenerateApiKey.isPending}
                      >
                        {regenerateApiKey.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Regenerate Credentials
                      </Button>
                    </div>
                    <div className="bg-muted p-4 rounded-lg">
                      <p className="text-sm font-semibold mb-2">Integration Example</p>
                      <pre className="text-xs overflow-x-auto">
{`// Create a payment session
const response = await fetch('/api/trpc/payment.createSession', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    apiKey: '${currentMerchant.apiKey}',
    amount: 5000, // $50.00 in cents
    currency: 'USD',
    successUrl: 'https://yoursite.com/success',
    cancelUrl: 'https://yoursite.com/cancel'
  })
});
const { checkoutUrl } = await response.json();
// Redirect customer to checkoutUrl`}
                      </pre>
                    </div>
                  </CardContent>
                </Card>

                {/* Tabs for Transactions and Sessions */}
                <Tabs defaultValue="analytics">
                  <TabsList>
                    <TabsTrigger value="analytics">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Analytics
                    </TabsTrigger>
                    <TabsTrigger value="transactions">Transactions</TabsTrigger>
                    <TabsTrigger value="sessions">Payment Sessions</TabsTrigger>
                    <TabsTrigger value="branding">Branding</TabsTrigger>
                  </TabsList>

                  <TabsContent value="analytics">
                    <Analytics merchantId={selectedMerchant!} />
                  </TabsContent>

                  <TabsContent value="transactions">
                    <Card>
                      <CardHeader>
                        <CardTitle>Recent Transactions</CardTitle>
                        <CardDescription>View all payment transactions</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {loadingTransactions ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : !transactions || transactions.length === 0 ? (
                          <p className="text-center text-muted-foreground py-8">No transactions yet</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Transaction ID</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Payment Method</TableHead>
                                <TableHead>Date</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {transactions.map(txn => (
                                <TableRow key={txn.id}>
                                  <TableCell className="font-mono text-sm">{txn.transactionId}</TableCell>
                                  <TableCell>{formatAmount(txn.amount, txn.currency)}</TableCell>
                                  <TableCell>{getStatusBadge(txn.status)}</TableCell>
                                  <TableCell className="capitalize">{txn.paymentMethod}</TableCell>
                                  <TableCell>{formatDate(txn.createdAt)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="sessions">
                    <Card>
                      <CardHeader>
                        <CardTitle>Payment Sessions</CardTitle>
                        <CardDescription>View all payment sessions</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {loadingSessions ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : !sessions || sessions.length === 0 ? (
                          <p className="text-center text-muted-foreground py-8">No sessions yet</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Session ID</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sessions.map(session => (
                                <TableRow key={session.id}>
                                  <TableCell className="font-mono text-sm">{session.sessionId}</TableCell>
                                  <TableCell>{formatAmount(session.amount, session.currency)}</TableCell>
                                  <TableCell>{getStatusBadge(session.status)}</TableCell>
                                  <TableCell>{session.customerEmail || session.customerName || "-"}</TableCell>
                                  <TableCell>{formatDate(session.createdAt)}</TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => window.open(`/checkout/${session.sessionId}`, '_blank')}
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="branding">
                    <BrandingSettings />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
