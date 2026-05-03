import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, type User } from "../services/api";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (role: string) => Promise<void>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (role: string) => {
    set({ isLoading: true });
    try {
      const { user } = await api.login(role);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ isLoading: false });
      throw new Error("Login failed");
    }
  },

  logout: async () => {
    await api.logout();
    await AsyncStorage.clear();
    set({ user: null, isAuthenticated: false });
  },

  restore: async () => {
    try {
      await api.init();
      const token = await AsyncStorage.getItem("auth_token");
      if (token) {
        const userStr = await AsyncStorage.getItem("user_data");
        if (userStr) {
          const user = JSON.parse(userStr) as User;
          set({ user, isAuthenticated: true, isLoading: false });
          return;
        }
      }
      set({ isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
}));
