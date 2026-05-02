/**
 * RoleGuard — Declarative role-based access control component
 *
 * Usage:
 *   <RoleGuard roles={["admin", "compliance_officer"]}>
 *     <SensitivePage />
 *   </RoleGuard>
 *
 *   <RoleGuard permission="kyb_review" fallback={<AccessDenied />}>
 *     <KybReviewPanel />
 *   </RoleGuard>
 */
import { useRole, UserRole } from "@/hooks/useRole";
import { ShieldOff } from "lucide-react";
import { ReactNode } from "react";

interface RoleGuardProps {
  /** Allow access to users with any of these roles. */
  roles?: UserRole[];
  /** Allow access to users with this permission key. */
  permission?: string;
  /** Content to render when access is denied. Defaults to a built-in message. */
  fallback?: ReactNode;
  children: ReactNode;
}

function DefaultAccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center p-8">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <ShieldOff className="w-8 h-8 text-destructive" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-1">Access Restricted</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          You do not have the required role or permissions to view this page.
          Contact your administrator if you believe this is an error.
        </p>
      </div>
    </div>
  );
}

export function RoleGuard({ roles, permission, fallback, children }: RoleGuardProps) {
  const { hasRole, can, loading, isAuthenticated } = useRole();

  if (loading) return null;
  if (!isAuthenticated) return fallback ?? <DefaultAccessDenied />;

  // Check role-based access
  if (roles && roles.length > 0) {
    if (!hasRole(...roles)) {
      return <>{fallback ?? <DefaultAccessDenied />}</>;
    }
  }

  // Check permission-based access
  if (permission) {
    if (!can(permission)) {
      return <>{fallback ?? <DefaultAccessDenied />}</>;
    }
  }

  return <>{children}</>;
}

/** Inline guard — renders children only if condition is met, otherwise null */
export function ShowFor({ roles, permission, children }: Omit<RoleGuardProps, "fallback">) {
  const { hasRole, can, loading, isAuthenticated } = useRole();

  if (loading || !isAuthenticated) return null;

  if (roles && roles.length > 0 && !hasRole(...roles)) return null;
  if (permission && !can(permission)) return null;

  return <>{children}</>;
}
