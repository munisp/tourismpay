/**
 * Biometric Authentication Service — Face ID, Touch ID, and fingerprint support.
 * Uses react-native-biometrics for native biometric APIs.
 */
import ReactNativeBiometrics, { BiometryTypes } from "react-native-biometrics";

const rnBiometrics = new ReactNativeBiometrics({ allowDeviceCredentials: true });

export type BiometricType = "FaceID" | "TouchID" | "Fingerprint" | "None";

interface BiometricResult {
  success: boolean;
  error?: string;
}

interface BiometricCapability {
  available: boolean;
  type: BiometricType;
  enrolled: boolean;
}

export const biometricService = {
  async checkCapability(): Promise<BiometricCapability> {
    try {
      const { available, biometryType } = await rnBiometrics.isSensorAvailable();

      let type: BiometricType = "None";
      if (biometryType === BiometryTypes.FaceID) type = "FaceID";
      else if (biometryType === BiometryTypes.TouchID) type = "TouchID";
      else if (biometryType === BiometryTypes.Biometrics) type = "Fingerprint";

      return { available, type, enrolled: available };
    } catch {
      return { available: false, type: "None", enrolled: false };
    }
  },

  async authenticate(promptMessage?: string): Promise<BiometricResult> {
    try {
      const { success } = await rnBiometrics.simplePrompt({
        promptMessage: promptMessage ?? "Authenticate to continue",
        cancelButtonText: "Cancel",
      });

      return { success };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Authentication failed",
      };
    }
  },

  async createKeys(): Promise<{ publicKey: string } | null> {
    try {
      const { publicKey } = await rnBiometrics.createKeys();
      return { publicKey };
    } catch {
      return null;
    }
  },

  async createSignature(payload: string): Promise<{ signature: string } | null> {
    try {
      const { success, signature } = await rnBiometrics.createSignature({
        promptMessage: "Confirm transaction",
        payload,
      });
      if (success && signature) return { signature };
      return null;
    } catch {
      return null;
    }
  },

  async deleteKeys(): Promise<boolean> {
    try {
      const { keysDeleted } = await rnBiometrics.deleteKeys();
      return keysDeleted;
    } catch {
      return false;
    }
  },

  async authenticateForTransaction(amount: number, currency: string): Promise<BiometricResult> {
    return this.authenticate(`Confirm ${currency} ${amount.toFixed(2)} payment`);
  },

  async authenticateForLogin(): Promise<BiometricResult> {
    return this.authenticate("Sign in to TourismPay");
  },
};
