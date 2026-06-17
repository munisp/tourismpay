/**
 * useRole — Role-based access control hook for TourismPay
 *
 * Provides the current user's role and helpers for permission checks.
 * All role logic is centralised here so that pages and components
 * never need to hard-code role strings.
 */
import { useAuth } from "@/_core/hooks/useAuth";

export type UserRole =
  | "user"
  | "admin"
  | "tourist"
  | "merchant"
  | "compliance_officer"
  | "noc_operator"
  | "settlement_officer"
  | "bis_analyst";

/** Canonical set of pages / capabilities each role may access. */
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  user: ["dashboard", "wallet", "loyalty", "copilot", "notifications", "settings"],
  tourist: [
    "dashboard",
    "wallet",
    "loyalty",
    "copilot",
    "notifications",
    "settings",
    "tourist_experience",
    "tourist_onboarding",
    "tourist_itinerary",
    "tourist_trip_planner",
    "tipping_tax",
    "qr_pay",
    "pre_travel",
    "wallet_loading",
    "local_payments",
  ],
  merchant: [
    "dashboard",
    "wallet",
    "loyalty",
    "copilot",
    "notifications",
    "settings",
    "restaurant_onboarding",
    "merchant_revenue",
    "merchant_qr",
    "merchant_payouts",
    "merchant_products",
    "merchant_staff",
    "merchant_cashier",
    "merchant_bookings",
    "merchant_bis",
    "merchant_channels",
    "merchant_availability",
    "gds_property",
    "gds_agent",
    "tipping_tax",
    "qr_generate",
    "africa_registry",
    "africa_kyb",
  ],
  compliance_officer: [
    "dashboard",
    "notifications",
    "settings",
    "kyb_review",
    "kyb_applications",
    "kyb_documents",
    "compliance_dashboard",
    "audit_log",
    "bis_investigations",
    "analytics",
  ],
  noc_operator: [
    "dashboard",
    "notifications",
    "settings",
    "noc_dashboard",
    "service_status",
    "kill_switch",
    "rate_limits",
    "webhooks",
    "paymentswitch",
    "paymentswitch_analytics",
    "integration_overview",
    "analytics",
    "api_health",
    "ha_status",
  ],
  settlement_officer: [
    "dashboard",
    "notifications",
    "settings",
    "remittance_admin",
    "settlement_console",
    "paymentswitch",
    "paymentswitch_analytics",
    "service_status",
    "tipping_tax",
    "analytics",
    "exchange_rates",
    "finance",
  ],
  bis_analyst: [
    "dashboard",
    "notifications",
    "settings",
    "bis_investigations",
    "bis_new",
    "bis_report",
    "bis_queue",
    "auto_flag_history",
    "security_fraud",
    "security_soc",
    "analytics",
  ],
  admin: [
    // Admins can access everything
    "*",
  ],
};

export function useRole() {
  const { user, isAuthenticated, loading } = useAuth();

  const role: UserRole = (user?.role as UserRole) ?? "user";

  const permissions = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.user;
  const isAdmin = role === "admin";
  const hasAll = permissions.includes("*");

  /**
   * Returns true if the current user has the given permission key.
   * Admins always return true.
   */
  function can(permission: string): boolean {
    if (!isAuthenticated) return false;
    if (hasAll) return true;
    return permissions.includes(permission);
  }

  /**
   * Returns true if the current user has at least one of the given roles.
   */
  function hasRole(...roles: UserRole[]): boolean {
    return roles.includes(role);
  }

  return {
    role,
    isAdmin,
    can,
    hasRole,
    loading,
    isAuthenticated,
    user,
  };
}
