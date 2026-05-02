// @ts-nocheck
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ChatWidget from "@/components/ps-ChatWidget";
import { Code2, Webhook, TestTube, Shield, Zap, Key, Plus, Copy, Trash2, RefreshCw, Eye, EyeOff, Loader2 } from "lucide-react";
import { APP_TITLE } from "@/const";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

function ApiKeysSection() {
  const { isAuthenticated } = useAuth();
  const [newKeyName, setNewKeyName] = useState("");
  const [showNewKey, setShowNewKey] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.apiKeys.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const generate = trpc.apiKeys.generate.useMutation({
    onSuccess: (result) => {
      setShowNewKey(result.key);
      setNewKeyName("");
      utils.apiKeys.list.invalidate();
      toast.success("API key created — copy it now, it won't be shown again!");
    },
    onError: (err) => toast.error(err.message),
  });

  const revoke = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => {
      utils.apiKeys.list.invalidate();
      toast.success("API key revoked");
    },
  });

  const rotate = trpc.apiKeys.rotate.useMutation({
    onSuccess: (result) => {
      setShowNewKey(result.key);
      utils.apiKeys.list.invalidate();
      toast.success("API key rotated — copy the new key now!");
    },
  });

  if (!isAuthenticated) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-blue-600" />
              My API Keys
            </CardTitle>
            <CardDescription>Manage your Payment Switch API keys</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* New key revealed */}
        {showNewKey && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
              <Eye className="h-4 w-4" />
              New API Key — copy it now, it won't be shown again
            </p>
            <div className="flex gap-2">
              <code className="flex-1 bg-white border rounded px-3 py-2 text-xs font-mono break-all">
                {showNewKey}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(showNewKey);
                  toast.success("Copied!");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowNewKey(null)}>
              Dismiss
            </Button>
          </div>
        )}

        {/* Create new key */}
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="key-name">Key Name</Label>
            <Input
              id="key-name"
              placeholder="e.g. Production Backend"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => generate.mutate({ name: newKeyName, environment: "sandbox" })}
              disabled={!newKeyName.trim() || generate.isPending}
            >
              {generate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span className="ml-1">Generate Key</span>
            </Button>
          </div>
        </div>

        {/* Key list */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading keys…
          </div>
        ) : !data?.keys?.length ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No API keys yet. Generate one above to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {data.keys.map((k: any) => (
              <div
                key={k.id}
                className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30"
              >
                <Key className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{k.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {k.keyPrefix}••••••••••••••••
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={k.environment === "production" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}
                >
                  {k.environment}
                </Badge>
                <Badge variant={k.isActive ? "default" : "secondary"}>
                  {k.isActive ? "Active" : "Revoked"}
                </Badge>
                {k.isActive && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Rotate key"
                      onClick={() => rotate.mutate({ id: k.id })}
                      disabled={rotate.isPending}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Revoke key"
                      onClick={() => revoke.mutate({ id: k.id })}
                      disabled={revoke.isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DeveloperPortal() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                <Code2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">{APP_TITLE} Developer Portal</h1>
                <p className="text-sm text-muted-foreground">Documentation & Resources</p>
              </div>
            </div>
            <Badge variant="outline" className="gap-1">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              All Systems Operational
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Hero Section */}
          <div className="text-center space-y-4 py-8">
            <h2 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Build with Payment Switch
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Integrate powerful payment processing into your application with our comprehensive SDKs and APIs
            </p>
          </div>

          {/* Quick Start Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-blue-600" />
                </div>
                <CardTitle>Quick Start</CardTitle>
                <CardDescription>Get up and running in 5 minutes</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Follow our step-by-step guide to integrate payments into your application quickly and securely.
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center mb-4">
                  <Code2 className="h-6 w-6 text-purple-600" />
                </div>
                <CardTitle>API Reference</CardTitle>
                <CardDescription>Complete API documentation</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Explore our comprehensive API reference with detailed endpoint descriptions and examples.
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center mb-4">
                  <TestTube className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle>Testing</CardTitle>
                <CardDescription>Test mode and sandbox</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Use test API keys and test cards to validate your integration before going live.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Documentation Tabs */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="sdks">SDKs</TabsTrigger>
              <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Getting Started</CardTitle>
                  <CardDescription>Learn the basics of Payment Switch integration</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">1. Get Your API Keys</h3>
                    <p className="text-sm text-muted-foreground">
                      Sign up for a merchant account and get your API keys from the dashboard. Use test keys (pk_test_...) for development.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">2. Create a Payment Session</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      Create a payment session on your backend using our API:
                    </p>
                    <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
{`const response = await fetch('/api/trpc/payment.createSession', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    apiKey: 'pk_test_...',
    amount: 5000, // $50.00 in cents
    currency: 'USD',
    description: 'Product Purchase'
  })
});

const { checkoutUrl } = await response.json();`}
                    </pre>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">3. Redirect to Checkout</h3>
                    <p className="text-sm text-muted-foreground">
                      Redirect your customer to the checkout URL. They'll complete payment and return to your success URL.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">4. Handle Webhooks</h3>
                    <p className="text-sm text-muted-foreground">
                      Configure webhooks to receive real-time notifications about payment events like successful payments, refunds, and failures.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sdks" className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>JavaScript SDK</CardTitle>
                    <CardDescription>For web applications</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">Install via npm:</p>
                    <pre className="bg-muted p-3 rounded text-xs">npm install @payment-switch/js-sdk</pre>
                    <p className="text-sm text-muted-foreground mt-4">Basic usage:</p>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`const paymentSwitch = new PaymentSwitch({
  apiKey: 'pk_test_...'
});

await paymentSwitch.checkout({
  amount: 5000,
  currency: 'USD'
});`}
                    </pre>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Python Library</CardTitle>
                    <CardDescription>For backend integration</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">Install via pip:</p>
                    <pre className="bg-muted p-3 rounded text-xs">pip install payment-switch</pre>
                    <p className="text-sm text-muted-foreground mt-4">Basic usage:</p>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`from payment_switch import PaymentSwitch

client = PaymentSwitch('pk_test_...')
session = client.create_session(
    amount=5000,
    currency='USD'
)`}
                    </pre>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>iOS SDK (Swift)</CardTitle>
                    <CardDescription>For native iOS apps</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">Swift Package Manager:</p>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`dependencies: [
  .package(url: "github.com/payment-switch/swift-sdk")
]`}
                    </pre>
                    <p className="text-sm text-muted-foreground mt-4">Basic usage:</p>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`let ps = PaymentSwitch(apiKey: "pk_test_...")
ps.checkout(amount: 5000, currency: "USD")`}
                    </pre>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Android SDK (Kotlin)</CardTitle>
                    <CardDescription>For native Android apps</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">Gradle:</p>
                    <pre className="bg-muted p-3 rounded text-xs">
{`implementation 'com.paymentswitch:android-sdk:1.0.0'`}
                    </pre>
                    <p className="text-sm text-muted-foreground mt-4">Basic usage:</p>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`val ps = PaymentSwitch(apiKey = "pk_test_...")
ps.checkout(activity, amount = 5000)`}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="webhooks" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Webhook Events</CardTitle>
                  <CardDescription>Real-time notifications about payment events</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Available Events</h3>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">payment.created</Badge>
                        <span className="text-muted-foreground">Payment session created</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">payment.completed</Badge>
                        <span className="text-muted-foreground">Payment successful</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">payment.failed</Badge>
                        <span className="text-muted-foreground">Payment failed</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline">refund.created</Badge>
                        <span className="text-muted-foreground">Refund initiated</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Example Webhook Handler</h3>
                    <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
{`app.post('/webhook', (req, res) => {
  const signature = req.headers['x-payment-switch-signature'];
  
  // Verify signature
  const isValid = verifySignature(req.body, signature);
  if (!isValid) return res.status(401).send('Invalid signature');
  
  const event = req.body;
  
  if (event.type === 'payment.completed') {
    // Update order status
    updateOrder(event.data.sessionId, 'paid');
  }
  
  res.send('OK');
});`}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Security Best Practices</CardTitle>
                  <CardDescription>Keep your integration secure</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold mb-1">Use HTTPS</h3>
                      <p className="text-sm text-muted-foreground">
                        Always use HTTPS in production to protect sensitive data in transit.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold mb-1">Never Expose Secret Keys</h3>
                      <p className="text-sm text-muted-foreground">
                        Keep your secret API keys on the server. Never include them in client-side code.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold mb-1">Verify Webhook Signatures</h3>
                      <p className="text-sm text-muted-foreground">
                        Always verify webhook signatures to ensure requests are from Payment Switch.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold mb-1">PCI Compliance</h3>
                      <p className="text-sm text-muted-foreground">
                        Use our hosted checkout to avoid handling card data directly and reduce PCI compliance scope.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Live API Keys Section */}
          <ApiKeysSection />

          {/* Test Cards */}
          <Card>
            <CardHeader>
              <CardTitle>Test Cards</CardTitle>
              <CardDescription>Use these cards in test mode</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 bg-muted rounded">
                    <code className="text-sm">4242 4242 4242 4242</code>
                    <Badge variant="outline" className="bg-green-100 text-green-700">Success</Badge>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted rounded">
                    <code className="text-sm">4000 0000 0000 0002</code>
                    <Badge variant="outline" className="bg-red-100 text-red-700">Decline</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 bg-muted rounded">
                    <code className="text-sm">4000 0000 0000 9995</code>
                    <Badge variant="outline" className="bg-yellow-100 text-yellow-700">Insufficient Funds</Badge>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted rounded">
                    <code className="text-sm">4000 0025 0000 3155</code>
                    <Badge variant="outline" className="bg-blue-100 text-blue-700">3D Secure</Badge>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Use any future expiry date, any 3-digit CVV, and any ZIP code.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Chat Widget */}
      <ChatWidget />
    </div>
  );
}
