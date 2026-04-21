import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const CRED_KEY = "customer_biometric_credentials";
const ENABLED_KEY = "customer_biometric_enabled";
const PROMPTED_KEY = "customer_biometric_prompted";

export interface StoredCredentials {
  email: string;
  password: string;
}

export type BiometricKind = "face" | "fingerprint" | "iris" | "generic";

export async function isBiometricSupported(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch {
    return false;
  }
}

export async function getBiometricKind(): Promise<BiometricKind> {
  if (Platform.OS === "web") return "generic";
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "face";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "fingerprint";
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return "iris";
    return "generic";
  } catch {
    return "generic";
  }
}

export function biometricLabel(kind: BiometricKind): string {
  switch (kind) {
    case "face":
      return Platform.OS === "ios" ? "Face ID" : "Face unlock";
    case "fingerprint":
      return Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
    case "iris":
      return "Iris unlock";
    default:
      return "Biometrics";
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const v = await SecureStore.getItemAsync(ENABLED_KEY);
    return v === "1";
  } catch {
    return false;
  }
}

export async function hasPromptedForBiometric(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  try {
    return (await SecureStore.getItemAsync(PROMPTED_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function markBiometricPrompted(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.setItemAsync(PROMPTED_KEY, "1");
  } catch {}
}

export async function saveBiometricCredentials(creds: StoredCredentials): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    await SecureStore.setItemAsync(CRED_KEY, JSON.stringify(creds), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await SecureStore.setItemAsync(ENABLED_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export async function clearBiometricCredentials(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(CRED_KEY);
    await SecureStore.deleteItemAsync(ENABLED_KEY);
  } catch {}
}

export async function authenticateAndGetCredentials(
  promptMessage: string
): Promise<StoredCredentials | null> {
  if (Platform.OS === "web") return null;
  try {
    const enabled = await isBiometricEnabled();
    if (!enabled) return null;
    const supported = await isBiometricSupported();
    if (!supported) return null;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: "Use password",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });
    if (!result.success) return null;
    const raw = await SecureStore.getItemAsync(CRED_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredCredentials;
  } catch {
    return null;
  }
}
