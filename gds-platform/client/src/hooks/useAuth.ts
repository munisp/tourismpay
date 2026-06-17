/**
 * GDS Platform Auth Hook — standalone authentication.
 * In the standalone GDS, auth is managed independently from TourismPay.
 */
import { useState, useCallback } from "react";

export type GDSRole = "gds_admin" | "revenue_manager" | "property_manager" | "gds_agent" | "front_desk";

interface GDSUser {
  id: string;
  email: string;
  name: string;
  role: GDSRole;
  propertyIds?: string[];
  agencyId?: string;
  countryCode?: string;
}

interface AuthState {
  user: GDSUser | null;
  token: string | null;
  isAuthenticated: boolean;
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(() => {
    const token = localStorage.getItem("gds_token");
    const userStr = localStorage.getItem("gds_user");
    if (token && userStr) {
      try {
        return { user: JSON.parse(userStr), token, isAuthenticated: true };
      } catch {
        return { user: null, token: null, isAuthenticated: false };
      }
    }
    return { user: null, token: null, isAuthenticated: false };
  });

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${import.meta.env.VITE_GDS_API_URL || "http://localhost:4000"}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error("Login failed");
    const data = await res.json();
    localStorage.setItem("gds_token", data.token);
    localStorage.setItem("gds_user", JSON.stringify(data.user));
    setAuth({ user: data.user, token: data.token, isAuthenticated: true });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("gds_token");
    localStorage.removeItem("gds_user");
    setAuth({ user: null, token: null, isAuthenticated: false });
  }, []);

  const hasRole = useCallback((...roles: GDSRole[]) => {
    if (!auth.user) return false;
    return roles.includes(auth.user.role);
  }, [auth.user]);

  return { ...auth, login, logout, hasRole };
}

export function useRole() {
  const { hasRole } = useAuth();
  return { hasRole: (...roles: string[]) => hasRole(...(roles as GDSRole[])) };
}
