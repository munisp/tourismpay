import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap, Eye, EyeOff, Shield } from "lucide-react";

const HERO_URL = "/icons/pwa-512.png";

export default function Login() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setLocation("/");
    }, 1200);
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left: Hero image */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        <img src={HERO_URL} alt="TourismPay Africa Network" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/20 via-transparent to-background/80" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" />
        <div className="absolute bottom-12 left-10 right-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/20 border border-primary/30 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-primary pulse-green" />
            <span className="text-xs font-mono text-primary">12 Countries Active</span>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Africa's Premier Tourism<br />Payment Platform
          </h2>
          <p className="text-sm text-white/70 max-w-sm">
            Powering payments, compliance, and background investigations across the African continent.
          </p>
        </div>
      </div>

      {/* Right: Login form */}
      <div className="w-full lg:w-[420px] flex flex-col justify-center px-8 py-12 bg-background">
        <div className="max-w-sm mx-auto w-full">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-bold text-foreground text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>TourismPay</p>
              <p className="text-[10px] text-muted-foreground">Intelligence Platform</p>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Welcome back
          </h1>
          <p className="text-sm text-muted-foreground mb-8">Sign in to your secure workspace</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</Label>
              <Input
                type="email"
                defaultValue="admin@tourismpay.io"
                className="bg-white/5 border-border text-foreground placeholder:text-muted-foreground focus:ring-primary/50 h-10"
                placeholder="admin@tourismpay.io"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  defaultValue="••••••••"
                  className="bg-white/5 border-border text-foreground pr-10 h-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Authenticating...
                </span>
              ) : "Sign In"}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="w-3.5 h-3.5" />
              <span>Protected by FIDO2 biometric authentication</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
