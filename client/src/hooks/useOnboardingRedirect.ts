/**
 * useOnboardingRedirect
 *
 * Detects first-time logins (loginCount === 1 OR onboardingCompleted === false)
 * and redirects the user to the appropriate onboarding flow based on their role.
 *
 * Role → Onboarding Route mapping:
 *   tourist              → /tourist/onboarding
 *   merchant             → /restaurant-onboarding
 *   compliance_officer   → /compliance
 *   noc_operator         → /integration-overview
 *   settlement_officer   → /settlement
 *   bis_analyst          → /bis
 *   admin                → /admin
 *   user (default)       → /tourist/onboarding (generic welcome)
 *
 * The hook marks onboarding as complete via auth.completeOnboarding mutation
 * once the user lands on the correct page, so they are not redirected again.
 *
 * Usage:
 *   Call this hook once at the top level (e.g., in AppShell or Dashboard).
 */
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

type UserRole =
  | "user"
  | "admin"
  | "tourist"
  | "merchant"
  | "compliance_officer"
  | "noc_operator"
  | "settlement_officer"
  | "bis_analyst";

const ONBOARDING_ROUTES: Record<UserRole, string> = {
  tourist: "/tourist/onboarding",
  merchant: "/restaurant-onboarding",
  compliance_officer: "/compliance",
  noc_operator: "/integration-overview",
  settlement_officer: "/settlement",
  bis_analyst: "/bis",
  admin: "/admin",
  user: "/tourist/onboarding",
};

// Pages that are themselves onboarding destinations — don't redirect away from them
const ONBOARDING_DESTINATIONS = new Set(Object.values(ONBOARDING_ROUTES));

// Pages that should never trigger a redirect (login, callback, etc.)
const EXCLUDED_PATHS = new Set(["/login", "/api/oauth/callback"]);

export function useOnboardingRedirect() {
  const { user, loading } = useAuth();
  const [location, navigate] = useLocation();
  const hasRedirected = useRef(false);
  const completeOnboarding = trpc.auth.completeOnboarding.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    // Wait for auth to resolve
    if (loading || !user) return;

    // Don't redirect if already redirected this session
    if (hasRedirected.current) return;

    // Don't redirect from excluded paths
    if (EXCLUDED_PATHS.has(location)) return;

    // Don't redirect if already on an onboarding destination
    if (ONBOARDING_DESTINATIONS.has(location)) {
      // Mark onboarding complete when user arrives at their destination
      if (!(user as any).onboardingCompleted) {
        completeOnboarding.mutate(undefined, {
          onSuccess: () => {
            utils.auth.me.invalidate();
          },
        });
      }
      return;
    }

    // Only redirect if this is a first login or onboarding not yet completed
    const isFirstLogin = (user as any).loginCount === 1;
    const onboardingCompleted = (user as any).onboardingCompleted ?? true;

    if (!isFirstLogin && onboardingCompleted) return;

    const role = (user as any).role as UserRole;
    const targetRoute = ONBOARDING_ROUTES[role] ?? "/tourist/onboarding";

    // Don't redirect if already on the target route
    if (location === targetRoute) return;

    hasRedirected.current = true;
    navigate(targetRoute);
  }, [user, loading, location, navigate, completeOnboarding, utils]);
}
