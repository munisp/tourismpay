/**
 * GDS Platform — Role Guard Components
 * Standalone RBAC enforcement for the GDS platform.
 */
import type { ReactNode } from "react";
import { useRole } from "../hooks/useAuth";

interface ShowForProps {
  roles: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function ShowFor({ roles, children, fallback = null }: ShowForProps) {
  const { hasRole } = useRole();
  if (!hasRole(...roles)) return <>{fallback}</>;
  return <>{children}</>;
}

export function AdminOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return <ShowFor roles={["gds_admin", "revenue_manager"]} fallback={fallback}>{children}</ShowFor>;
}
