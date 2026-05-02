/* =============================================================================
   MOBILE NAV — Role-aware bottom tab bar for PWA mobile experience
   Shows on screens < lg breakpoint, replacing sidebar navigation

   Tourist:  Discover | Wallet | [QR SCAN] | Loyalty | Profile
   Merchant: Dashboard | QR Codes | Payouts | Products | Profile
   Admin:    Dashboard | Analytics | BIS | Co-Pilot | Wallet
   Default:  Dashboard | Africa | BIS | Co-Pilot | Wallet
   ============================================================================= */

import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Globe, Shield, MessageSquareText, Wallet,
  MapPin, QrCode, Banknote, Package, User, Award, BarChart3,
  ScanLine,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { Sun, Moon, Monitor } from "lucide-react";

type NavItem = { label: string; icon: React.ElementType; href: string };

// ── Tourist nav: 4 regular items + 1 center super-action ─────────────────────
const touristLeftItems: NavItem[] = [
  { label: "Discover", icon: MapPin, href: "/tourist" },
  { label: "Wallet",   icon: Wallet, href: "/wallet" },
];
const touristRightItems: NavItem[] = [
  { label: "Loyalty",  icon: Award, href: "/loyalty" },
  { label: "Profile",  icon: User,  href: "/settings/privacy" },
];

// ── Other role nav items ──────────────────────────────────────────────────────
const merchantNavItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/merchant/revenue" },
  { label: "QR Codes",  icon: QrCode,          href: "/merchant/qr" },
  { label: "Payouts",   icon: Banknote,         href: "/merchant/payouts" },
  { label: "Products",  icon: Package,          href: "/merchant/products" },
  { label: "Profile",   icon: User,             href: "/settings/privacy" },
];

const adminNavItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard,    href: "/" },
  { label: "Analytics", icon: BarChart3,           href: "/analytics" },
  { label: "BIS",       icon: Shield,              href: "/bis" },
  { label: "Co-Pilot",  icon: MessageSquareText,   href: "/copilot" },
  { label: "Wallet",    icon: Wallet,              href: "/wallet" },
];

const defaultNavItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard,    href: "/" },
  { label: "Africa",    icon: Globe,               href: "/africa/registry" },
  { label: "BIS",       icon: Shield,              href: "/bis" },
  { label: "Co-Pilot",  icon: MessageSquareText,   href: "/copilot" },
  { label: "Wallet",    icon: Wallet,              href: "/wallet" },
];

// ── QR Scan modal (tourist) ───────────────────────────────────────────────────

function QrScanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [token, setToken] = useState("");
  const [amountUsd, setAmountUsd] = useState("");
  const [, navigate] = useLocation();

  const redeemMut = trpc.qrPayment.pay.useMutation({
    onSuccess: (data: any) => {
      onClose();
      setToken("");
      setAmountUsd("");
      // Navigate to the payment confirmation page
      const id = data?.token ?? data?.id ?? token;
      navigate(`/receipt/${id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!token.trim() || !amountUsd.trim()) return;
    redeemMut.mutate({ token: token.trim(), amountUsd: amountUsd.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ScanLine className="w-4 h-4 text-primary" />
            Scan or Enter QR Code
          </DialogTitle>
        </DialogHeader>

        {/* Simulated viewfinder */}
        <div className="relative mx-auto w-48 h-48 rounded-2xl overflow-hidden bg-black/80 flex items-center justify-center my-2">
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Corner brackets */}
            <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-sm" />
            <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-sm" />
            <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-sm" />
            <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-sm" />
            {/* Scan line animation */}
            <div className="absolute left-4 right-4 h-0.5 bg-primary/70 animate-[scan_2s_ease-in-out_infinite]" />
          </div>
          <ScanLine className="w-16 h-16 text-primary/30" />
        </div>

        <p className="text-xs text-muted-foreground text-center -mt-1 mb-2">
          Point your camera at a TourismPay QR code, or enter the token manually below.
        </p>

        {/* Browse menu option — appears once a token is typed */}
        {token.trim() && (
          <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
            <p className="text-xs text-muted-foreground">Browse merchant menu first?</p>
            <button
              onClick={() => {
                onClose();
                navigate(`/pay/${token.trim()}/catalog`);
              }}
              className="text-xs text-primary font-semibold hover:underline"
            >
              View Menu →
            </button>
          </div>
        )}

        <div className="space-y-2">
          <input
            type="text"
            placeholder="Payment token (from QR code)…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount (USD)…"
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleSubmit}
              disabled={!token.trim() || !amountUsd.trim() || redeemMut.isPending}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 transition-opacity"
            >
              {redeemMut.isPending ? "…" : "Pay"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Mobile theme cycle button ────────────────────────────────────────────────
function MobileThemeButton() {
  const { theme, setTheme } = useTheme();
  const cycle = () => {
    if (theme === "dark") setTheme("light");
    else if (theme === "light") setTheme("system");
    else setTheme("dark");
  };
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";
  return (
    <button onClick={cycle} className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-all duration-150 text-muted-foreground">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MobileNav() {
  const [location] = useLocation();
  const { role } = useRole();
  const [scanOpen, setScanOpen] = useState(false);

  const isActive = (href: string) => {
    const base = href.split("?")[0];
    if (base === "/") return location === "/";
    return location.startsWith(base);
  };

  const renderItem = (item: NavItem) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href}>
        <div className={cn(
          "flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-all duration-150",
          active ? "text-primary" : "text-muted-foreground"
        )}>
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
            active ? "bg-primary/15" : ""
          )}>
            <Icon className={cn("w-5 h-5", active ? "text-primary" : "text-muted-foreground")} />
          </div>
          <span className={cn(
            "text-[10px] font-medium",
            active ? "text-primary" : "text-muted-foreground"
          )}>{item.label}</span>
        </div>
      </Link>
    );
  };

  // Tourist layout: left items | elevated scan button | right items
  if (role === "tourist") {
    return (
      <>
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-sidebar/95 backdrop-blur-xl safe-area-inset-bottom">
          <div className="flex items-center justify-around px-2 py-2">
            {touristLeftItems.map(renderItem)}

            {/* Elevated center QR scan super-action */}
            <div className="flex flex-col items-center gap-1 relative -mt-5">
              <button
                onClick={() => setScanOpen(true)}
                className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-150",
                  "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground",
                  "hover:scale-105 active:scale-95 ring-4 ring-sidebar"
                )}
                aria-label="Scan QR code"
              >
                <ScanLine className="w-6 h-6" />
              </button>
              <span className="text-[10px] font-semibold text-primary">Scan</span>
            </div>

            {touristRightItems.map(renderItem)}
          </div>
        </nav>

        <QrScanModal open={scanOpen} onClose={() => setScanOpen(false)} />
      </>
    );
  }

  // All other roles: standard flat nav (last slot replaced with theme toggle)
  const items =
    role === "merchant" ? merchantNavItems :
    role === "admin"    ? adminNavItems    :
    defaultNavItems;

  // Show 4 nav items + theme toggle button
  const visibleItems = items.slice(0, 4);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-sidebar/95 backdrop-blur-xl safe-area-inset-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {visibleItems.map(renderItem)}
        <MobileThemeButton />
      </div>
    </nav>
  );
}
