import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBiometrics from 'react-native-biometrics';
import { authApi } from '../services/api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: 'customer' | 'agent' | 'admin';
  kycVerified: boolean;
  profileImage?: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  biometricEnabled: boolean;
  biometricType: 'fingerprint' | 'face' | 'iris' | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  loginWithBiometric: () => Promise<void>;
  logout: () => Promise<void>;
  enableBiometric: () => Promise<boolean>;
  disableBiometric: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = '@insureportal/auth_token';
const REFRESH_KEY = '@insureportal/refresh_token';
const BIOMETRIC_KEY = '@insureportal/biometric_enabled';
const USER_KEY = '@insureportal/cached_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    biometricEnabled: false,
    biometricType: null,
  });

  useEffect(() => {
    checkAuth();
    checkBiometricCapability();
  }, []);

  async function checkAuth() {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) {
        const cachedUser = await AsyncStorage.getItem(USER_KEY);
        if (cachedUser) {
          setState((prev) => ({
            ...prev,
            user: JSON.parse(cachedUser),
            isAuthenticated: true,
            isLoading: false,
          }));
        }
        try {
          const { data } = await authApi.getProfile();
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
          setState((prev) => ({ ...prev, user: data.user, isAuthenticated: true, isLoading: false }));
        } catch {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      } else {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    } catch {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }

  async function checkBiometricCapability() {
    const rnBiometrics = new ReactNativeBiometrics();
    const { available, biometryType } = await rnBiometrics.isSensorAvailable();
    const enabled = (await AsyncStorage.getItem(BIOMETRIC_KEY)) === 'true';
    let type: AuthState['biometricType'] = null;
    if (biometryType === 'FaceID' || biometryType === 'Face Recognition') type = 'face';
    else if (biometryType === 'TouchID' || biometryType === 'Biometrics') type = 'fingerprint';
    else if (biometryType === 'Iris') type = 'iris';
    setState((prev) => ({ ...prev, biometricEnabled: available && enabled, biometricType: type }));
  }

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.login(email, password);
    await AsyncStorage.setItem(TOKEN_KEY, data.accessToken);
    await AsyncStorage.setItem(REFRESH_KEY, data.refreshToken);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setState((prev) => ({ ...prev, user: data.user, isAuthenticated: true }));
  }, []);

  const loginWithBiometric = useCallback(async () => {
    const rnBiometrics = new ReactNativeBiometrics();
    const { success, signature } = await rnBiometrics.createSignature({
      promptMessage: 'Sign in to TourismPay',
      payload: `insureportal-auth-${Date.now()}`,
    });
    if (!success) throw new Error('Biometric authentication failed');
    const { data } = await authApi.loginBiometric(signature);
    await AsyncStorage.setItem(TOKEN_KEY, data.accessToken);
    await AsyncStorage.setItem(REFRESH_KEY, data.refreshToken);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setState((prev) => ({ ...prev, user: data.user, isAuthenticated: true }));
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY, USER_KEY]);
    setState((prev) => ({ ...prev, user: null, isAuthenticated: false }));
  }, []);

  const enableBiometric = useCallback(async () => {
    const rnBiometrics = new ReactNativeBiometrics();
    const { publicKey } = await rnBiometrics.createKeys();
    if (!publicKey) return false;
    await AsyncStorage.setItem(BIOMETRIC_KEY, 'true');
    setState((prev) => ({ ...prev, biometricEnabled: true }));
    return true;
  }, []);

  const disableBiometric = useCallback(async () => {
    const rnBiometrics = new ReactNativeBiometrics();
    await rnBiometrics.deleteKeys();
    await AsyncStorage.setItem(BIOMETRIC_KEY, 'false');
    setState((prev) => ({ ...prev, biometricEnabled: false }));
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await authApi.getProfile();
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setState((prev) => ({ ...prev, user: data.user }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, loginWithBiometric, logout, enableBiometric, disableBiometric, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
