/**
 * ProtectedRoute — Route-level role enforcement
 *
 * Wraps page components to enforce role-based access at the route level.
 * If the user doesn't have the required role, shows AccessDenied page
 * instead of the protected content.
 *
 * Usage in App.tsx:
 *   <Route path="/admin/users">
 *     {() => <ProtectedRoute roles={["admin"]}><UsersManagement /></ProtectedRoute>}
 *   </Route>
 */
import { RoleGuard } from "@/components/RoleGuard";
import { UserRole } from "@/hooks/useRole";
import { ReactNode } from "react";
import { useLocation } from "wouter";

interface ProtectedRouteProps {
  /** Roles allowed to access this route */
  roles: UserRole[];
  /** Optional permission key required */
  permission?: string;
  children: ReactNode;
}

function AccessDeniedPage() {
  const [, navigate] = useLocation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center p-8">
      <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          <path d="m9.5 9.5 5 5" />
          <path d="m14.5 9.5-5 5" />
        </svg>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
        <p className="text-muted-foreground max-w-md">
          You don't have permission to access this page. This area is restricted to authorized roles only.
        </p>
      </div>
      <button
        onClick={() => navigate("/")}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Return to Dashboard
      </button>
    </div>
  );
}

export function ProtectedRoute({ roles, permission, children }: ProtectedRouteProps) {
  return (
    <RoleGuard roles={roles} permission={permission} fallback={<AccessDeniedPage />}>
      {children}
    </RoleGuard>
  );
}
