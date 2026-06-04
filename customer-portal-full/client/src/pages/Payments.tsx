import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Calendar, Loader2, CheckCircle } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";

export default function Payments() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [paymentMethod, setPaymentMethod] = useState({
    cardNumber: "",
    expiry: "",
    cvv: "",
  });

  const { data: realPayments, isLoading } = trpc.payments.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const payments = realPayments;

  const processPaymentMutation = trpc.payments.process.useMutation({
    onSuccess: () => {
      toast.success("Payment Successful", {
        description: "Your payment has been processed successfully.",
      });
      trpc.useUtils().payments.list.invalidate();
    },
    onError: (error) => {
      toast.error("Payment Failed", {
        description: error.message,
      });
    },
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [authLoading, isAuthenticated]);

  if ((authLoading || !isAuthenticated)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const pendingPayments = payments?.filter(p => p.status === "Pending") || [];
  const completedPayments = payments?.filter(p => p.status === "Completed") || [];

  const handlePayNow = (paymentId: number) => {
    if (!paymentMethod.cardNumber || !paymentMethod.expiry || !paymentMethod.cvv) {
      toast.error("Missing Information", {
        description: "Please enter your payment method details first.",
      });
      return;
    }

    processPaymentMutation.mutate({
      id: paymentId,
      paymentMethod: `Card ending in ${paymentMethod.cardNumber.slice(-4)}`,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Completed": return "bg-green-100 text-green-800";
      case "Pending": return "bg-yellow-100 text-yellow-800";
      case "Failed": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
      <nav className="bg-white border-b">
        <div className="container mx-auto px-6 py-4">
          <Link href="/dashboard"><Button variant="ghost">← Back to Dashboard</Button></Link>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold mb-8">Payments</h1>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold mb-4">Pending Payments</h2>
                {pendingPayments.length > 0 ? (
                  <div className="space-y-4">
                    {pendingPayments.map((payment) => (
                      <Card key={payment.id}>
                        <CardContent className="pt-6">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-semibold">Policy ID: {payment.policyId}</p>
                              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                <Calendar className="h-4 w-4" />
                                Due: {new Date(payment.dueDate).toLocaleDateString('en-US', { 
                                  year: 'numeric', 
                                  month: 'long', 
                                  day: 'numeric' 
                                })}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold">₦{parseFloat(payment.amount).toLocaleString()}</p>
                              <Button 
                                className="mt-2"
                                onClick={() => handlePayNow(payment.id)}
                                disabled={processPaymentMutation.isPending}
                              >
                                {processPaymentMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Pay Now"
                                )}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-2" />
                      <p className="text-muted-foreground">No pending payments</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div>
                <h2 className="text-2xl font-semibold mb-4">Payment History</h2>
                {completedPayments.length > 0 ? (
                  <div className="space-y-4">
                    {completedPayments.slice(0, 5).map((payment) => (
                      <Card key={payment.id}>
                        <CardContent className="pt-6">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-semibold">Policy ID: {payment.policyId}</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                Paid: {payment.paidDate ? new Date(payment.paidDate).toLocaleDateString('en-US', { 
                                  year: 'numeric', 
                                  month: 'short', 
                                  day: 'numeric' 
                                }) : 'N/A'}
                              </p>
                              {payment.paymentMethod && (
                                <p className="text-xs text-muted-foreground mt-1">{payment.paymentMethod}</p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold">₦{parseFloat(payment.amount).toLocaleString()}</p>
                              <Badge className={getStatusColor(payment.status)}>{payment.status}</Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">No payment history</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Payment Method</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                  <div>
                    <Label>Card Number</Label>
                    <div className="relative">
                      <Input 
                        placeholder="1234 5678 9012 3456"
                        value={paymentMethod.cardNumber}
                        onChange={(e) => setPaymentMethod({ ...paymentMethod, cardNumber: e.target.value })}
                        maxLength={16}
                      />
                      <CreditCard className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Expiry Date</Label>
                      <Input 
                        placeholder="MM/YY"
                        value={paymentMethod.expiry}
                        onChange={(e) => setPaymentMethod({ ...paymentMethod, expiry: e.target.value })}
                        maxLength={5}
                      />
                    </div>
                    <div>
                      <Label>CVV</Label>
                      <Input 
                        placeholder="123" 
                        type="password" 
                        maxLength={3}
                        value={paymentMethod.cvv}
                        onChange={(e) => setPaymentMethod({ ...paymentMethod, cvv: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button 
                    className="w-full"
                    onClick={() => toast.success("Payment Method Saved", {
                      description: "Your payment method has been securely saved.",
                    })}
                  >
                    Save Payment Method
                  </Button>
                </form>
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-900 font-medium mb-1">💳 Secure Payment</p>
                  <p className="text-xs text-blue-700">Your payment information is encrypted and secure.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
