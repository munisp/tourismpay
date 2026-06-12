/**
 * Async Storage wrapper for persisting user data, tokens, and preferences.
 */

const KEYS = {
  AUTH_TOKEN: "@tourismpay/auth_token",
  USER_DATA: "@tourismpay/user",
  PREFERENCES: "@tourismpay/prefs",
  ONBOARDING_COMPLETE: "@tourismpay/onboarding",
} as const;

// Note: In production, use @react-native-async-storage/async-storage
// This is a memory-based fallback for dev
const memStore: Record<string, string> = {};

export const storage = {
  async get(key: string): Promise<string | null> {
    return memStore[key] ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    memStore[key] = value;
  },

  async remove(key: string): Promise<void> {
    delete memStore[key];
  },

  async clear(): Promise<void> {
    Object.keys(memStore).forEach((k) => delete memStore[k]);
  },

  keys: KEYS,
};
