/* =============================================================================
   APPSHELL — Persistent sidebar layout for TourismPay Obsidian Intelligence
   ============================================================================= */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { GlobalSearchDropdown } from "@/components/GlobalSearchDropdown";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Globe, Building2, Shield, Cpu, Wifi,
  MessageSquareText, Wallet, TrendingUp, Award, Fingerprint,
  Leaf, Scan, Network, ChevronLeft, ChevronRight, Bell,
  Search, Settings, LogOut, User, AlertTriangle, Activity,
  Map, Zap, Crown, FileCheck, ClipboardList, DollarSign, Server, Eye,
  ArrowLeftRight, BarChart3, Code2, Repeat, Radio, MonitorDot, Landmark, Gauge, ArrowDownUp,
  MapPin, UtensilsCrossed, QrCode, UserCheck, ShoppingBag, CheckSquare, Banknote,
  Package, UserSearch, Users2, Terminal, Brain, CreditCard, Monitor, Sparkles, Inbox, Trophy, BarChart2, CalendarDays, Mail, Droplets, Receipt
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MobileNav from "./MobileNav";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRole, UserRole } from "@/hooks/useRole";
import { useOnboardingRedirect } from "@/hooks/useOnboardingRedirect";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { EmergencySOS } from "@/components/EmergencySOS";
import { FXRateTicker } from "@/components/FXRateTicker";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  badge?: string;
  badgeVariant?: "green" | "amber" | "crimson" | "blue";
  section?: string;
  /** If set, only users with at least one of these roles can see this item. */
  roles?: UserRole[];
}

const navItems: NavItem[] = [
  // ─── Overview (visible to all authenticated users) ──────────────────────────
  { label: "Dashboard", icon: LayoutDashboard, href: "/", section: "overview" },
  { label: "Cross-Platform Analytics", icon: BarChart3, href: "/analytics", section: "overview", roles: ["admin", "compliance_officer", "noc_operator", "settlement_officer", "bis_analyst"] },
  { label: "Integration Overview", icon: Network, href: "/integration-overview", section: "overview", roles: ["admin", "noc_operator"] },

  // ─── Tourist (tourist + admin) ───────────────────────────────────────────────
  { label: "Tourist Experience", icon: MapPin, href: "/tourist", section: "tourist", roles: ["tourist", "admin"] },
  { label: "Tourist Portal ✦", icon: Sparkles, href: "/tourist-portal", section: "tourist", roles: ["tourist", "admin"] },
  { label: "Onboarding Wizard", icon: UserCheck, href: "/tourist/onboarding", section: "tourist", roles: ["tourist", "admin"] },
  { label: "AI Trip Planner ✦", icon: Globe, href: "/tourist/trip-planner", section: "tourist", roles: ["tourist", "admin"] },
  { label: "Trip Itinerary", icon: Map, href: "/tourist/itinerary", section: "tourist", roles: ["tourist", "admin"] },
  { label: "Digital Wallet", icon: Wallet, href: "/wallet", section: "tourist", roles: ["tourist", "admin"] },
  { label: "Stablecoin Swap", icon: ArrowDownUp, href: "/wallet/stablecoin", section: "tourist", roles: ["tourist", "admin"] },
  { label: "Load Wallet", icon: Banknote, href: "/wallet/loading", section: "tourist", roles: ["tourist", "admin"] },
  { label: "Local Payments", icon: ShoppingBag, href: "/wallet/local-payments", section: "tourist", roles: ["tourist", "admin"] },
  { label: "Pre-Travel Readiness", icon: Shield, href: "/wallet/pre-travel", section: "tourist", roles: ["tourist", "admin"] },
  { label: "Tipping & Tax", icon: Receipt, href: "/wallet/tipping-tax", section: "tourist", roles: ["tourist", "admin"] },
  { label: "Loyalty & Rewards", icon: Award, href: "/loyalty", section: "tourist", roles: ["tourist", "admin"] },
  { label: "AI Co-Pilot", icon: MessageSquareText, href: "/copilot", section: "tourist", roles: ["tourist", "admin"] },
  { label: "AR Tourism", icon: Scan, href: "/ar", section: "tourist", roles: ["tourist", "admin"] },
  { label: "DID Identity", icon: Cpu, href: "/identity", section: "tourist", roles: ["tourist", "admin"] },
  { label: "Sustainability", icon: Leaf, href: "/sustainability", section: "tourist", roles: ["tourist", "admin"] },

  // ─── Merchant (merchant + admin) ─────────────────────────────────────────────
  { label: "Business Onboarding", icon: Building2, href: "/restaurant-onboarding", section: "merchant", roles: ["merchant", "admin"] },
  { label: "Revenue Dashboard", icon: ShoppingBag, href: "/merchant/revenue", section: "merchant", roles: ["merchant", "admin"] },
  { label: "QR Codes", icon: QrCode, href: "/merchant/qr", section: "merchant", roles: ["merchant", "admin"] },
  { label: "Payout History", icon: Banknote, href: "/merchant/payouts", section: "merchant", roles: ["merchant", "admin"] },
  { label: "Stripe Connect", icon: CreditCard, href: "/merchant/stripe-connect", section: "merchant", roles: ["merchant", "admin"] },
  { label: "Product Catalog", icon: Package, href: "/merchant/products", section: "merchant", roles: ["merchant", "admin"] },
  { label: "Channel Manager", icon: Globe, href: "/merchant/channels", section: "merchant", roles: ["merchant", "admin"] },
  { label: "Employee BIS Checks", icon: UserSearch, href: "/merchant/employee-bis", section: "merchant", roles: ["merchant", "admin"] },
  { label: "Staff Management", icon: Users2, href: "/merchant/staff", section: "merchant", roles: ["merchant", "admin"] },
  { label: "Cashier Terminal", icon: Terminal, href: "/merchant/cashier", section: "merchant", roles: ["merchant", "admin"] },
  { label: "Booking Inbox", icon: Inbox, href: "/merchant/bookings", section: "merchant", roles: ["merchant", "admin"] },
  { label: "Deal Leaderboard", icon: Trophy, href: "/merchant/deals/leaderboard", section: "merchant", roles: ["merchant", "admin"] },
  { label: "KPI Leaderboard", icon: BarChart2, href: "/merchant/leaderboard", section: "merchant", roles: ["merchant", "admin"] },
  { label: "Availability Calendar", icon: CalendarDays, href: "/merchant/availability", section: "merchant", roles: ["merchant", "admin"] },
  { label: "BIS Compliance", icon: Shield, href: "/merchant/bis-status", section: "merchant", roles: ["merchant", "admin"] },
  { label: "Digital Wallet", icon: Wallet, href: "/wallet", section: "merchant", roles: ["merchant", "admin"] },
  { label: "Stablecoin Swap", icon: ArrowDownUp, href: "/wallet/stablecoin", section: "merchant", roles: ["merchant", "admin"] },
  { label: "Embedded Finance", icon: TrendingUp, href: "/finance", section: "merchant", roles: ["merchant", "admin"] },
  { label: "Loyalty & Rewards", icon: Award, href: "/loyalty", section: "merchant", roles: ["merchant", "admin"] },
  { label: "AI Co-Pilot", icon: MessageSquareText, href: "/copilot", section: "merchant", roles: ["merchant", "admin"] },

  // ─── Compliance Officer ───────────────────────────────────────────────────────
  { label: "Compliance Dashboard", icon: CheckSquare, href: "/compliance", section: "compliance", roles: ["compliance_officer", "admin"] },
  { label: "KYB Applications", icon: ClipboardList, href: "/admin/kyb-applications", section: "compliance", roles: ["compliance_officer", "admin"] },
  { label: "KYB Doc Review", icon: FileCheck, href: "/admin/kyb-documents", section: "compliance", roles: ["compliance_officer", "admin"] },
  { label: "Exchange Rate Overrides", icon: TrendingUp, href: "/admin/exchange-rates", section: "compliance", roles: ["admin"] },

  // ─── GDS (agents + property managers + admin) ──────────────────────────────
  { label: "GDS Dashboard", icon: Globe, href: "/gds/dashboard", section: "gds", roles: ["merchant", "admin", "settlement_officer"] },
  { label: "Agent Portal", icon: Globe, href: "/gds/agent", section: "gds", roles: ["merchant", "admin"] },
  { label: "Property Manager", icon: Building2, href: "/gds/property", section: "gds", roles: ["merchant", "admin"] },

  // ─── Africa ──────────────────────────────────────────────────────────────────
  { label: "Africa Registry", icon: Globe, href: "/africa/registry", section: "africa", roles: ["admin", "compliance_officer", "merchant"] },
  { label: "KYB Onboarding", icon: Building2, href: "/africa/kyb", section: "africa", roles: ["admin", "compliance_officer", "merchant"] },

  // ─── BIS (bis_analyst + admin) ───────────────────────────────────────────────
  { label: "Investigations", icon: Shield, href: "/bis", section: "bis", roles: ["bis_analyst", "admin"] },
  { label: "New Investigation", icon: Search, href: "/bis/new", section: "bis", roles: ["bis_analyst", "admin"] },
  { label: "Auto-Flag History", icon: Zap, href: "/bis/auto-flag-history", section: "bis", roles: ["bis_analyst", "admin"] },

  // ─── Security (bis_analyst + compliance_officer + admin) ─────────────────────
  { label: "Fraud Monitor", icon: AlertTriangle, href: "/security/fraud", badge: "Live", badgeVariant: "green", section: "security", roles: ["bis_analyst", "compliance_officer", "admin"] },
  { label: "SOC Dashboard", icon: Activity, href: "/security/soc", section: "security", roles: ["bis_analyst", "compliance_officer", "admin"] },
  { label: "Biometric Auth", icon: Fingerprint, href: "/security/biometric", section: "security", roles: ["tourist", "merchant", "admin", "compliance_officer", "bis_analyst"] },

  // ─── Finance (merchant + admin + user — tourists get these under their own section) ───
  { label: "AI Co-Pilot", icon: MessageSquareText, href: "/copilot", section: "finance", roles: ["merchant", "admin", "user"] },
  { label: "Digital Wallet", icon: Wallet, href: "/wallet", section: "finance", roles: ["merchant", "admin", "user"] },
  { label: "Stablecoin Swap", icon: ArrowDownUp, href: "/wallet/stablecoin", section: "finance", roles: ["merchant", "admin", "user"] },
  { label: "Liquidity Provider", icon: Droplets, href: "/wallet/liquidity", section: "finance", roles: ["merchant", "admin"] },
  { label: "Embedded Finance", icon: TrendingUp, href: "/finance", section: "finance", roles: ["merchant", "admin", "user"] },
  { label: "Loyalty & Rewards", icon: Award, href: "/loyalty", section: "finance", roles: ["merchant", "admin", "user"] },

  // ─── Visionary (admin only — tourists get AR/DID/Sustainability in their section) ─────
  { label: "Mesh Payments", icon: Network, href: "/mesh", section: "visionary", roles: ["admin"] },

  // ─── Administration (admin only) ─────────────────────────────────────────────
  { label: "Admin Panel", icon: Crown, href: "/admin", badge: "Admin", badgeVariant: "amber", section: "admin", roles: ["admin"] },
  { label: "BIS Queue", icon: Activity, href: "/admin/bis-queue", section: "admin", roles: ["admin"] },
  { label: "Audit Log", icon: Shield, href: "/admin/audit-log", section: "admin", roles: ["admin", "compliance_officer"] },
  { label: "Users", icon: User, href: "/admin/users", section: "admin", roles: ["admin"] },
  { label: "Finance Requests", icon: DollarSign, href: "/admin/finance", section: "admin", roles: ["admin"] },
  { label: "Service Health", icon: Server, href: "/admin/service-health", section: "admin", roles: ["admin"] },
  { label: "ML / AI Services", icon: Brain, href: "/admin/ml-services", section: "admin", roles: ["admin"] },
  { label: "HA Status", icon: Shield, href: "/admin/ha-status", section: "admin", roles: ["admin"] },
  { label: "Email Preview", icon: Mail, href: "/admin/email-preview", section: "admin", roles: ["admin"] },
  { label: "Loyalty Rewards", icon: Award, href: "/admin/loyalty-rewards", section: "admin", roles: ["admin"] },
  { label: "BIS Settings", icon: Settings, href: "/admin/bis-settings", section: "admin", roles: ["admin"] },
  { label: "Auto-Flag Thresholds", icon: Zap, href: "/admin/bis-auto-flag-settings", section: "admin", roles: ["admin"] },
  { label: "Provider Onboarding", icon: Globe, href: "/admin/provider-onboarding", section: "admin", roles: ["admin"] },
  { label: "API Health Monitor", icon: Activity, href: "/admin/api-health", badge: "Live", badgeVariant: "green", section: "admin", roles: ["admin", "noc_operator"] },

  // ─── Settings (all authenticated users) ─────────────────────────────────────
  { label: "Notification Settings", icon: Bell, href: "/settings/notifications", section: "settings", roles: ["tourist", "merchant", "admin", "compliance_officer", "noc_operator", "settlement_officer", "bis_analyst", "user"] },
  { label: "Biometric Security", icon: Fingerprint, href: "/settings/biometric", section: "settings", roles: ["tourist", "merchant", "admin", "compliance_officer", "noc_operator", "settlement_officer", "bis_analyst", "user"] },
  { label: "Privacy Settings", icon: Eye, href: "/settings/privacy", section: "settings", roles: ["tourist", "merchant", "admin", "compliance_officer", "noc_operator", "settlement_officer", "bis_analyst", "user"] },

  // ─── PaymentSwitch (role-restricted) ─────────────────────────────────────────
  { label: "PS Dashboard", icon: ArrowLeftRight, href: "/paymentswitch", section: "paymentswitch", roles: ["admin", "noc_operator", "settlement_officer"] },
  { label: "NOC Dashboard", icon: MonitorDot, href: "/paymentswitch/noc", badge: "Live", badgeVariant: "green", section: "paymentswitch", roles: ["admin", "noc_operator"] },
  { label: "PS Admin", icon: Crown, href: "/paymentswitch/admin", section: "paymentswitch", roles: ["admin"] },
  { label: "Analytics", icon: BarChart3, href: "/paymentswitch/analytics", section: "paymentswitch", roles: ["admin", "noc_operator", "settlement_officer"] },
  { label: "Payment Gateway", icon: Landmark, href: "/paymentswitch/gateway", section: "paymentswitch", roles: ["admin", "noc_operator"] },
  { label: "Remittance", icon: Repeat, href: "/paymentswitch/remittance", section: "paymentswitch", roles: ["admin", "settlement_officer"] },
  { label: "Rate Alerts", icon: Radio, href: "/paymentswitch/rate-alerts", section: "paymentswitch", roles: ["admin", "noc_operator", "settlement_officer"] },
  { label: "Developer Portal", icon: Code2, href: "/paymentswitch/developer", section: "paymentswitch", roles: ["admin"] },
  { label: "Onboarding Portal", icon: FileCheck, href: "/paymentswitch/onboarding", section: "paymentswitch", roles: ["admin"] },
  { label: "Settlement Console", icon: BarChart3, href: "/settlement", section: "paymentswitch", roles: ["admin", "settlement_officer"] },
  { label: "Service Status", icon: Server, href: "/paymentswitch/service-status", section: "paymentswitch", roles: ["admin", "noc_operator"] },
  { label: "Kill Switch", icon: Shield, href: "/paymentswitch/kill-switch", badge: "Admin", badgeVariant: "crimson", section: "paymentswitch", roles: ["admin", "noc_operator"] },
  { label: "Rate Limits", icon: Gauge, href: "/paymentswitch/rate-limits", badge: "Admin", badgeVariant: "blue", section: "paymentswitch", roles: ["admin"] },
  { label: "Webhooks", icon: Code2, href: "/paymentswitch/webhooks", section: "paymentswitch", roles: ["admin", "noc_operator"] },
  { label: "PS Admin Portal", icon: Monitor, href: "/paymentswitch/portal", badge: "Live", badgeVariant: "green", section: "paymentswitch", roles: ["admin", "noc_operator"] },
];

const sectionLabels: Record<string, string> = {
  overview: "Overview",
  tourist: "Tourist Services",
  merchant: "Merchant Services",
  compliance: "Compliance",
  africa: "Africa Expansion",
  bis: "Background Investigation",
  security: "Security & Compliance",
  finance: "Digital Finance",
  visionary: "Visionary Features",
  admin: "Administration",
  settings: "Settings",
  paymentswitch: "Payment Switch",
  gds: "Africa GDS",
};

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [location, navigate] = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const { role, hasRole } = useRole();
  // Redirect first-time users to their role-specific onboarding flow
  useOnboardingRedirect();

  // Session timeout — auto-logout after 15 min of inactivity
  const { showWarning, secondsLeft, extendSession } = useSessionTimeout({
    timeoutMs: 15 * 60 * 1000,
    warningBeforeMs: 60 * 1000,
    onLogout: () => {
      logout();
      navigate("/login");
    },
  });

  // Live unread notification count
  const { data: unreadData } = trpc.notifications.unreadCount.useQuery(
    undefined,
    { enabled: isAuthenticated, refetchInterval: 30_000 }
  );
  const unreadCount = unreadData?.count ?? 0;

  // Live badge counts for KYB and BIS — admin only
  const isAdmin = user?.role === 'admin';
  const { data: kybStats } = trpc.kybApplications.stats.useQuery(
    undefined,
    { enabled: isAuthenticated && isAdmin, refetchInterval: 60_000 }
  );
  const { data: bisStats } = trpc.auditLogs.sidebarBadges.useQuery(
    undefined,
    { enabled: isAuthenticated && isAdmin, refetchInterval: 60_000 }
  );

  const kybPendingCount = (kybStats as { submitted?: number } | undefined)?.submitted ?? 0;
  const bisActiveCount = (bisStats as { bisProcessing?: number } | undefined)?.bisProcessing ?? 0;

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  /** Filter nav items by the current user's role */
  const visibleItems = navItems.filter((item) => {
    if (!item.roles || item.roles.length === 0) return true; // visible to all
    return hasRole(...item.roles);
  });

  // Group visible nav items by section
  const sections = visibleItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    const s = item.section || "other";
    if (!acc[s]) acc[s] = [];
    acc[s].push(item);
    return acc;
  }, {});

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col h-full transition-all duration-300 ease-out border-r border-border",
          "bg-sidebar relative z-20",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center h-14 px-4 border-b border-border shrink-0",
          collapsed ? "justify-center" : "justify-between"
        )}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-sm tracking-tight text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                TourismPay
              </span>
            </div>
          )}
          {collapsed && (
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
          )}
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 text-muted-foreground hover:text-foreground"
              onClick={() => setCollapsed(true)}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {/* Role badge */}
        {!collapsed && role !== "user" && (
          <div className="px-3 py-1.5 border-b border-border">
            <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-primary/10 text-primary">
              {role.replace(/_/g, " ")}
            </span>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section}>
              {!collapsed && (
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2 mb-1.5">
                  {sectionLabels[section] || section}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;

                  // Compute live badge for specific routes
                  let liveBadge: string | undefined = item.badge;
                  let liveBadgeVariant: NavItem["badgeVariant"] = item.badgeVariant;
                  if (item.href === "/africa/kyb" && kybPendingCount > 0) {
                    liveBadge = String(kybPendingCount);
                    liveBadgeVariant = "amber";
                  } else if (item.href === "/bis" && bisActiveCount > 0) {
                    liveBadge = String(bisActiveCount);
                    liveBadgeVariant = "crimson";
                  }

                  return (
                    <Tooltip key={item.href} delayDuration={0}>
                      <TooltipTrigger asChild>
                        <Link href={item.href}>
                          <div
                            className={cn(
                              "flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-all duration-150 group",
                              collapsed ? "justify-center" : "",
                              active
                                ? "sidebar-active font-medium"
                                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                            )}
                          >
                            <Icon className={cn(
                              "shrink-0 transition-colors",
                              collapsed ? "w-5 h-5" : "w-4 h-4",
                              active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                            )} />
                            {!collapsed && (
                              <>
                                <span className="flex-1 truncate">{item.label}</span>
                                {liveBadge && (
                                  <span className={cn(
                                    "text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold",
                                    liveBadgeVariant === "green" && "badge-green",
                                    liveBadgeVariant === "amber" && "badge-amber",
                                    liveBadgeVariant === "crimson" && "badge-crimson",
                                    liveBadgeVariant === "blue" && "badge-blue",
                                    !liveBadgeVariant && "badge-muted"
                                  )}>
                                    {liveBadge}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </Link>
                      </TooltipTrigger>
                      {collapsed && (
                        <TooltipContent side="right" className="bg-popover border-border text-foreground">
                          {item.label}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Expand button when collapsed */}
        {collapsed && (
          <div className="px-2 pb-3">
            <Button
              variant="ghost"
              size="icon"
              className="w-full h-8 text-muted-foreground hover:text-foreground"
              onClick={() => setCollapsed(false)}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* User profile */}
        {!collapsed && (
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2.5">
              <Avatar className="w-7 h-7">
                <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">TP</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{user?.name || "User"}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user?.email || ""}</p>
              </div>
              <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-foreground shrink-0">
                <Settings className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-background/80 backdrop-blur-sm flex items-center px-4 gap-3 shrink-0 z-10">
          <div className="flex-1 flex items-center gap-2">
            <div className="max-w-md w-full">
              <GlobalSearchDropdown />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Language switcher */}
            <LanguageSwitcher />
            {/* Theme toggle */}
            <ThemeToggle />
            {/* Live indicator */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-border">
              <div className="w-1.5 h-1.5 rounded-full bg-primary pulse-green" />
              <span className="text-[10px] font-mono text-primary">LIVE</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-foreground relative"
              onClick={() => navigate("/notifications")}
              title={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[14px] h-[14px] rounded-full bg-destructive text-[9px] font-bold text-white flex items-center justify-center px-0.5">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>
            <Avatar className="w-7 h-7">
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{user?.name?.charAt(0)?.toUpperCase() || "U"}</AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* FX rate ticker */}
        <FXRateTicker />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          {children}
        </main>
      </div>
      {/* Mobile bottom nav */}
      <MobileNav />

      {/* Emergency SOS — floating button available on every page */}
      <EmergencySOS />

      {/* Session timeout warning dialog */}
      <Dialog open={showWarning} onOpenChange={() => extendSession()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-5 h-5" />
              Session Expiring
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Your session will expire in <span className="font-mono font-bold text-foreground">{secondsLeft}s</span> due to inactivity.
            Click below to stay signed in.
          </p>
          <DialogFooter>
            <Button onClick={extendSession} className="w-full">Stay Signed In</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
