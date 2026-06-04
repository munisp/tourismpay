import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, Mail, Lock, User, Phone, Eye, EyeOff, ArrowRight, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const redirectUrl = params.get("redirect") || "/dashboard";
  const productId = params.get("product");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kycWarning, setKycWarning] = useState<{ show: boolean; level: number; steps: string[] }>({ show: false, level: 0, steps: [] });

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    phone: "",
  });

  const loginMutation = trpc.auth.login.useMutation();
  const signupMutation = trpc.auth.signup.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setKycWarning({ show: false, level: 0, steps: [] });
    setLoading(true);

    try {
      if (isLogin) {
        const result = await loginMutation.mutateAsync({
          email: formData.email,
          password: formData.password,
        });

        if (result?.error) {
          setError(result.error);
          setLoading(false);
          return;
        }

        // Store token
        if (result?.token) {
          localStorage.setItem("insureportal-token", result.token);
          localStorage.setItem("insureportal-user", JSON.stringify(result));
        }

        // Check KYC gate
        if (result?.requiresKyc) {
          setKycWarning({
            show: true,
            level: result.kycLevel || 0,
            steps: result.kycRemainingSteps || [],
          });
          // After 3 seconds, redirect to KYC page
          setTimeout(() => setLocation("/kyc"), 3000);
        } else {
          setLocation(redirectUrl);
        }
      } else {
        // Validate passwords match
        if (formData.password !== formData.confirmPassword) {
          setError("Passwords do not match");
          setLoading(false);
          return;
        }

        const result = await signupMutation.mutateAsync({
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          phone: formData.phone,
        });

        if (result?.error) {
          setError(result.error);
          setLoading(false);
          return;
        }

        // Store token
        if (result?.token) {
          localStorage.setItem("insureportal-token", result.token);
          localStorage.setItem("insureportal-user", JSON.stringify(result));
        }

        // New users always go to KYC/onboarding
        setKycWarning({
          show: true,
          level: 0,
          steps: result?.kycRemainingSteps || ["bvn", "nin", "phone", "address", "id_document", "facial_match"],
        });
        setTimeout(() => setLocation("/kyc"), 3000);
      }
    } catch (err: any) {
      setError(err?.message || "An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-slate-900 flex flex-col">
      {/* Header */}
      <nav className="container mx-auto px-6 py-6 flex justify-between items-center">
        <Link href="/">
          <div className="flex items-center gap-2 text-white cursor-pointer">
            <Shield className="h-8 w-8" />
            <span className="text-2xl font-bold">InsurePortal</span>
          </div>
        </Link>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Product Context Banner */}
          {productId && (
            <Card className="mb-6 bg-white/10 backdrop-blur-lg border-white/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 text-white">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  <div>
                    <p className="font-medium">You selected: {productId.charAt(0).toUpperCase() + productId.slice(1)} Insurance</p>
                    <p className="text-sm text-blue-200">Create an account to continue your application</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* KYC Warning */}
          {kycWarning.show && (
            <Card className="mb-6 bg-amber-50 border-amber-200">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800">KYC Verification Required</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Your KYC level is {kycWarning.level}. You need to complete verification before accessing platform features.
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {kycWarning.steps.map((step) => (
                        <Badge key={step} variant="outline" className="text-xs bg-amber-100 border-amber-300">
                          {step.replace("_", " ")}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-amber-600 mt-2">Redirecting to KYC verification...</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Auth Card */}
          <Card className="shadow-2xl">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl">
                {isLogin ? "Welcome Back" : "Create Account"}
              </CardTitle>
              <CardDescription>
                {isLogin 
                  ? "Sign in to manage your insurance" 
                  : "Join InsurePortal to get started"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Registration Fields */}
                {!isLogin && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="fullName"
                          name="fullName"
                          placeholder="Enter your full name"
                          className="pl-10"
                          value={formData.fullName}
                          onChange={handleInputChange}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="phone"
                          name="phone"
                          type="tel"
                          placeholder="+234 801 234 5678"
                          className="pl-10"
                          value={formData.phone}
                          onChange={handleInputChange}
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Email Field */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="your@email.com"
                      className="pl-10"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      className="pl-10 pr-10"
                      value={formData.password}
                      onChange={handleInputChange}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password (Registration only) */}
                {!isLogin && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="confirmPassword"
                        name="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder="Confirm your password"
                        className="pl-10"
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                  </div>
                )}

                {/* Forgot Password Link (Login only) */}
                {isLogin && (
                  <div className="text-right">
                    <a href="#" className="text-sm text-blue-600 hover:underline">
                      Forgot password?
                    </a>
                  </div>
                )}

                {/* Submit Button */}
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {isLogin ? "Signing In..." : "Creating Account..."}
                    </>
                  ) : (
                    <>
                      {isLogin ? "Sign In" : "Create Account"}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>

                {/* Demo Login Hint */}
                {isLogin && (
                  <div className="text-center">
                    <p className="text-xs text-gray-400">
                      Demo: demo@insureportal.ng / demo123
                    </p>
                  </div>
                )}

                {/* Terms (Registration only) */}
                {!isLogin && (
                  <p className="text-xs text-gray-500 text-center">
                    By creating an account, you agree to our{" "}
                    <a href="#" className="text-blue-600 hover:underline">Terms of Service</a>
                    {" "}and{" "}
                    <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>
                  </p>
                )}
              </form>

              {/* Toggle Login/Register */}
              <div className="mt-6 text-center border-t pt-6">
                <p className="text-sm text-gray-600">
                  {isLogin ? "Don't have an account?" : "Already have an account?"}
                  <button
                    type="button"
                    onClick={() => { setIsLogin(!isLogin); setError(null); }}
                    className="ml-2 text-blue-600 font-medium hover:underline"
                  >
                    {isLogin ? "Sign Up" : "Sign In"}
                  </button>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Benefits */}
          <div className="mt-8 text-white text-center">
            <p className="text-sm text-blue-200 mb-4">Why create an account?</p>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <Shield className="h-5 w-5" />
                </div>
                <span>Secure Policies</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <span>Easy Claims</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <User className="h-5 w-5" />
                </div>
                <span>KYC Verified</span>
              </div>
            </div>
          </div>

          {/* KYC Tier Info */}
          <div className="mt-6 text-white">
            <Card className="bg-white/5 backdrop-blur-lg border-white/10">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-blue-200 mb-3">KYC Verification Tiers</p>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-red-500/20 text-red-200 border-red-400/30 text-[10px]">Tier 0</Badge>
                    <span className="text-blue-100">No access — complete BVN + NIN verification</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-yellow-500/20 text-yellow-200 border-yellow-400/30 text-[10px]">Tier 1</Badge>
                    <span className="text-blue-100">Basic — purchase policies, file claims, make payments</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-500/20 text-blue-200 border-blue-400/30 text-[10px]">Tier 2</Badge>
                    <span className="text-blue-100">Enhanced — high-value policies, international coverage</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-500/20 text-green-200 border-green-400/30 text-[10px]">Tier 3</Badge>
                    <span className="text-blue-100">Full — reinsurance access, broker API, commercial policies</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
