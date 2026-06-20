/**
 * Auth Context — provides authentication state with secure token persistence,
 * biometric login support, and session management.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { secureStorage } from "../services/secureStorage";
import { biometricService } from "../services/biometrics";
import { authAPI, UserProfile } from "../services/api";

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithBiometric: () => Promise<{ success: boolean; error?: string }>;
  register: (data: { name: string; email: string; password: string; role: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  enableBiometric: () => Promise<boolean>;
  disableBiometric: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  biometricAvailable: false,
  biometricEnabled: false,
  login: async () => ({ success: false }),
  loginWithBiometric: async () => ({ success: false }),
  register: async () => ({ success: false }),
  logout: async () => {},
  enableBiometric: async () => false,
  disableBiometric: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useEffect(() => {
    restoreSession();
    checkBiometric();
  }, []);

  const restoreSession = async () => {
    try {
      const savedToken = await secureStorage.getToken();
      if (savedToken) {
        setToken(savedToken);
        const profile = await authAPI.getProfile();
        setUser(profile);
      }
    } catch {
      await secureStorage.removeToken();
    } finally {
      setIsLoading(false);
    }
  };

  const checkBiometric = async () => {
    const capability = await biometricService.checkCapability();
    setBiometricAvailable(capability.available);
    const enabled = await secureStorage.getPreference("biometric_enabled");
    setBiometricEnabled(enabled === "true");
  };

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await authAPI.login(email, password);
      await secureStorage.setToken(response.token);
      await secureStorage.setRefreshToken(response.refreshToken);
      await secureStorage.setUserData(response.user as unknown as Record<string, unknown>);
      setToken(response.token);
      setUser(response.user);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      return { success: false, error: message };
    }
  }, []);

  const loginWithBiometric = useCallback(async () => {
    if (!biometricEnabled) return { success: false, error: "Biometric not enabled" };

    const authResult = await biometricService.authenticateForLogin();
    if (!authResult.success) return { success: false, error: authResult.error };

    // Use stored token to restore session
    const savedToken = await secureStorage.getToken();
    if (!savedToken) return { success: false, error: "No saved session" };

    try {
      setToken(savedToken);
      const profile = await authAPI.getProfile();
      setUser(profile);
      return { success: true };
    } catch {
      await secureStorage.removeToken();
      return { success: false, error: "Session expired" };
    }
  }, [biometricEnabled]);

  const register = useCallback(async (data: { name: string; email: string; password: string; role: string }) => {
    try {
      const response = await authAPI.register(data);
      await secureStorage.setToken(response.token);
      await secureStorage.setUserData(response.user as unknown as Record<string, unknown>);
      setToken(response.token);
      setUser(response.user);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      return { success: false, error: message };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch {
      // Server may be unreachable
    }
    await secureStorage.clearAll();
    setUser(null);
    setToken(null);
  }, []);

  const enableBiometric = useCallback(async () => {
    const result = await biometricService.authenticate("Enable biometric login");
    if (!result.success) return false;

    await biometricService.createKeys();
    await secureStorage.setPreference("biometric_enabled", "true");
    setBiometricEnabled(true);
    return true;
  }, []);

  const disableBiometric = useCallback(async () => {
    await biometricService.deleteKeys();
    await secureStorage.setPreference("biometric_enabled", "false");
    setBiometricEnabled(false);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await authAPI.getProfile();
      setUser(profile);
      await secureStorage.setUserData(profile as unknown as Record<string, unknown>);
    } catch {
      // Silently fail
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        biometricAvailable,
        biometricEnabled,
        login,
        loginWithBiometric,
        register,
        logout,
        enableBiometric,
        disableBiometric,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
