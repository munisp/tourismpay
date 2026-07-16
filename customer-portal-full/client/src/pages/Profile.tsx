import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";

export default function Profile() {
  const { user: authUser, isAuthenticated, loading: authLoading } = useAuth();
  const user = authUser;
  const [formData, setFormData] = useState({
    name: "",
    email: "",
  });

  const updateProfileMutation = trpc.profile.update.useMutation({
    onSuccess: () => {
      toast.success("Profile Updated", {
        description: "Your profile has been successfully updated.",
      });
      trpc.useUtils().auth.me.invalidate();
    },
    onError: (error) => {
      toast.error("Update Failed", {
        description: error.message,
      });
    },
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || "",
        email: user.email || "",
      });
    }
  }, [user]);

  if ((authLoading || !isAuthenticated)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
      <nav className="bg-white border-b">
        <div className="container mx-auto px-6 py-4">
          <Link href="/dashboard"><Button variant="ghost">← Back to Dashboard</Button></Link>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-12 max-w-3xl">
        <h1 className="text-4xl font-bold mb-8">My Profile</h1>

        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label>Full Name</Label>
                <div className="relative">
                  <Input 
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter your full name"
                  />
                  <User className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              <div>
                <Label>Email</Label>
                <div className="relative">
                  <Input 
                    type="email" 
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter your email"
                  />
                  <Mail className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-900 font-medium mb-1">Account Information</p>
                <p className="text-xs text-blue-700">User ID: {user?.id}</p>
                <p className="text-xs text-blue-700">Login Method: {user?.loginMethod || 'OAuth'}</p>
                <p className="text-xs text-blue-700">
                  Last Sign In: {user?.lastSignedIn ? new Date(user.lastSignedIn).toLocaleString() : 'N/A'}
                </p>
              </div>

              <div className="flex gap-4">
                <Button 
                  type="submit" 
                  className="flex-1"
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Save Changes
                </Button>
                <Button 
                  type="button"
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    if (user) {
                      setFormData({
                        name: user.name || "",
                        email: user.email || "",
                      });
                    }
                  }}
                  disabled={updateProfileMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Security</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Password management is handled through the OAuth provider. 
              To change your password, please visit your account settings in the OAuth portal.
            </p>
            <Button 
              variant="outline"
              onClick={() => toast.info("Password Management", {
                description: "Please use the OAuth portal to manage your password.",
              })}
            >
              Manage Password
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
