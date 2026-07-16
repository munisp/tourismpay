import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Calendar, DollarSign, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Policies() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { data: realPolicies, isLoading } = trpc.policies.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const policies = realPolicies;

  const renewMutation = trpc.policies.renew.useMutation({
    onSuccess: () => {
      toast.success("Policy Renewed", {
        description: "Your policy has been successfully renewed for another year.",
      });
      trpc.useUtils().policies.list.invalidate();
    },
    onError: (error) => {
      toast.error("Renewal Failed", {
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active": return "bg-green-100 text-green-800";
      case "Expired": return "bg-red-100 text-red-800";
      case "Cancelled": return "bg-gray-100 text-gray-800";
      default: return "bg-blue-100 text-blue-800";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
      <nav className="bg-white border-b">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/dashboard"><Button variant="ghost">← Back to Dashboard</Button></Link>
          <div className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold">TourismPay</span>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold mb-8">My Policies</h1>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : policies && policies.length > 0 ? (
          <div className="grid gap-6">
            {policies.map((policy) => (
              <Card key={policy.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-2xl">{policy.name}</CardTitle>
                      <p className="text-muted-foreground mt-1">{policy.type} Insurance</p>
                      <p className="text-sm text-muted-foreground mt-1">Policy #{policy.policyNumber}</p>
                    </div>
                    <Badge className={getStatusColor(policy.status)}>{policy.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="flex items-center gap-3">
                      <DollarSign className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Annual Premium</p>
                        <p className="font-semibold">₦{parseFloat(policy.premium).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Expiry Date</p>
                        <p className="font-semibold">
                          {new Date(policy.expiryDate).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        onClick={() => renewMutation.mutate({ id: policy.id })}
                        disabled={renewMutation.isPending || policy.status !== "Active"}
                      >
                        {renewMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Renew"
                        )}
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => toast.info("Download Started", {
                          description: "Your policy document is being prepared.",
                        })}
                      >
                        Download
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Shield className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <p className="text-xl font-semibold mb-2">No Policies Found</p>
              <p className="text-muted-foreground">You don't have any insurance policies yet.</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
