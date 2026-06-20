/**
 * Secure Storage — encrypted token and credential storage using react-native-keychain.
 * Falls back to AsyncStorage for non-sensitive data.
 */
import * as Keychain from "react-native-keychain";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SERVICE_NAME = "com.tourismpay.app";

export const secureStorage = {
  async setToken(token: string): Promise<void> {
    await Keychain.setGenericPassword("auth_token", token, {
      service: `${SERVICE_NAME}.auth`,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  async getToken(): Promise<string | null> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: `${SERVICE_NAME}.auth`,
      });
      if (credentials) return credentials.password;
      return null;
    } catch {
      return null;
    }
  },

  async removeToken(): Promise<void> {
    await Keychain.resetGenericPassword({ service: `${SERVICE_NAME}.auth` });
  },

  async setRefreshToken(token: string): Promise<void> {
    await Keychain.setGenericPassword("refresh_token", token, {
      service: `${SERVICE_NAME}.refresh`,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  async getRefreshToken(): Promise<string | null> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: `${SERVICE_NAME}.refresh`,
      });
      if (credentials) return credentials.password;
      return null;
    } catch {
      return null;
    }
  },

  async removeRefreshToken(): Promise<void> {
    await Keychain.resetGenericPassword({ service: `${SERVICE_NAME}.refresh` });
  },

  async setBiometricKey(key: string): Promise<void> {
    await Keychain.setGenericPassword("biometric_key", key, {
      service: `${SERVICE_NAME}.biometric`,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
      accessible: Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    });
  },

  async getBiometricKey(): Promise<string | null> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: `${SERVICE_NAME}.biometric`,
      });
      if (credentials) return credentials.password;
      return null;
    } catch {
      return null;
    }
  },

  // Non-sensitive data in AsyncStorage
  async setUserData(data: Record<string, unknown>): Promise<void> {
    await AsyncStorage.setItem("@tourismpay/user", JSON.stringify(data));
  },

  async getUserData<T>(): Promise<T | null> {
    const raw = await AsyncStorage.getItem("@tourismpay/user");
    return raw ? JSON.parse(raw) : null;
  },

  async setPreference(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(`@tourismpay/pref/${key}`, value);
  },

  async getPreference(key: string): Promise<string | null> {
    return AsyncStorage.getItem(`@tourismpay/pref/${key}`);
  },

  async clearAll(): Promise<void> {
    await Promise.all([
      Keychain.resetGenericPassword({ service: `${SERVICE_NAME}.auth` }),
      Keychain.resetGenericPassword({ service: `${SERVICE_NAME}.refresh` }),
      Keychain.resetGenericPassword({ service: `${SERVICE_NAME}.biometric` }),
      AsyncStorage.multiRemove([
        "@tourismpay/user",
        "@tourismpay/pref/theme",
        "@tourismpay/pref/notifications",
        "@tourismpay/pref/biometric_enabled",
      ]),
    ]);
  },
};
