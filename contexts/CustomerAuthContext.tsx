import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import {
  authenticateAndGetCredentials,
  clearBiometricCredentials,
  isBiometricEnabled as readBiometricEnabled,
  isBiometricSupported,
  saveBiometricCredentials,
  getBiometricKind,
  biometricLabel,
  type BiometricKind,
} from "@/lib/biometric";

const TOKEN_KEY = "customer_session_token";

interface CustomerProfile {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  emailVerified?: boolean;
  dateOfBirth?: string | null;
}

interface CustomerAuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  customer: CustomerProfile | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, phone: string, password: string) => Promise<{ success: boolean; pending?: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (data: { name?: string; phone?: string; dateOfBirth?: string | null }) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
  resendVerificationEmail: () => Promise<{ success: boolean; error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  resendVerificationEmailFor: (email: string) => Promise<{ success: boolean; error?: string }>;
  getCustomerToken: () => string | null;
  biometricSupported: boolean;
  biometricEnabled: boolean;
  biometricKind: BiometricKind;
  biometricLabelText: string;
  lastLoginCredentials: { email: string; password: string } | null;
  enableBiometric: (creds?: { email: string; password: string }) => Promise<boolean>;
  disableBiometric: () => Promise<void>;
  signInWithBiometric: () => Promise<{ success: boolean; error?: string }>;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricKind, setBiometricKind] = useState<BiometricKind>("generic");
  const [lastLoginCredentials, setLastLoginCredentials] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    (async () => {
      const supported = await isBiometricSupported();
      setBiometricSupported(supported);
      if (supported) {
        setBiometricKind(await getBiometricKind());
        setBiometricEnabled(await readBiometricEnabled());
      }
    })();
  }, []);

  const fetchProfile = useCallback(async (sessionToken: string): Promise<CustomerProfile | null> => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/customers/me", baseUrl);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(TOKEN_KEY);
        if (stored) {
          const profile = await fetchProfile(stored);
          if (profile) {
            setToken(stored);
            setCustomer(profile);
          } else {
            await AsyncStorage.removeItem(TOKEN_KEY);
          }
        }
      } catch {
      } finally {
        setIsLoading(false);
      }
    })();
  }, [fetchProfile]);

  // After a successful login/register, bind any stored device push token to the
  // customer's account using the authenticated endpoint so that only the verified
  // session owner's email is used — never an attacker-supplied value.
  const bindPushToken = useCallback(async (customerToken: string) => {
    try {
      const pushToken = await AsyncStorage.getItem("expo_push_token");
      if (!pushToken) return;
      const baseUrl = getApiUrl();
      const url = new URL("/api/customers/me/push-token", baseUrl);
      await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${customerToken}` },
        body: JSON.stringify({ token: pushToken }),
      });
    } catch {}
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/customers/login", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        return { success: false, error: data.message || "Login failed" };
      }

      const data = await res.json();
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setCustomer(data.customer);
      setLastLoginCredentials({ email, password });
      bindPushToken(data.token).catch(() => {});
      return { success: true };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, [bindPushToken]);

  const register = useCallback(async (name: string, email: string, phone: string, password: string): Promise<{ success: boolean; pending?: boolean; error?: string }> => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/customers/register", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, password, privacyConsent: true }),
      });

      if (!res.ok) {
        const data = await res.json();
        return { success: false, error: data.message || "Registration failed" };
      }

      // Server always returns { success: true } with no session token — the
      // user must verify their email and then log in. This keeps the response
      // identical whether the email was already registered or not, preventing
      // account enumeration through response differences.
      return { success: true, pending: true };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        const baseUrl = getApiUrl();
        const url = new URL("/api/customers/logout", baseUrl);
        await fetch(url.toString(), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
      }
    }
    await AsyncStorage.removeItem(TOKEN_KEY);
    setLastLoginCredentials(null);
    setToken(null);
    setCustomer(null);
  }, [token]);

  const updateProfile = useCallback(async (data: { name?: string; phone?: string; dateOfBirth?: string | null }): Promise<{ success: boolean; error?: string }> => {
    if (!token) return { success: false, error: "Not logged in" };
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/customers/me", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const resp = await res.json();
        return { success: false, error: resp.message || "Update failed" };
      }
      const updated = await res.json();
      setCustomer(updated);
      return { success: true };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, [token]);

  const deleteAccount = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!token) return { success: false, error: "Not logged in" };
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/customers/me", baseUrl);
      const res = await fetch(url.toString(), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const resp = await res.json();
        return { success: false, error: resp.message || "Deletion failed" };
      }
      await AsyncStorage.removeItem(TOKEN_KEY);
      await clearBiometricCredentials();
      setBiometricEnabled(false);
      setLastLoginCredentials(null);
      setToken(null);
      setCustomer(null);
      return { success: true };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, [token]);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    const profile = await fetchProfile(token);
    if (profile) setCustomer(profile);
  }, [token, fetchProfile]);

  const resendVerificationEmail = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!token) return { success: false, error: "Not logged in" };
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/customers/me/resend-verification", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, error: data.message || "Could not send verification email" };
      }
      return { success: true };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, [token]);

  const requestPasswordReset = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/customers/forgot-password", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data: { message?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: data.message || "Could not send reset link" };
      }
      return { success: true };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, []);

  const resendVerificationEmailFor = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/customers/resend-verification-public", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data: { message?: string } = await res.json().catch(() => ({}));
        return { success: false, error: data.message || "Could not send verification email" };
      }
      return { success: true };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, []);

  const getCustomerToken = useCallback(() => token, [token]);

  const enableBiometric = useCallback(async (creds?: { email: string; password: string }): Promise<boolean> => {
    const supported = await isBiometricSupported();
    if (!supported) return false;
    const toSave = creds ?? lastLoginCredentials;
    if (!toSave) return false;
    const ok = await saveBiometricCredentials(toSave);
    if (ok) setBiometricEnabled(true);
    return ok;
  }, [lastLoginCredentials]);

  const disableBiometric = useCallback(async () => {
    await clearBiometricCredentials();
    setBiometricEnabled(false);
  }, []);

  const signInWithBiometric = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const kind = await getBiometricKind();
    const promptMessage = `Sign in with ${biometricLabel(kind)}`;
    const creds = await authenticateAndGetCredentials(promptMessage);
    if (!creds) return { success: false, error: "Authentication cancelled" };
    return await login(creds.email, creds.password);
  }, [login]);

  const biometricLabelText = useMemo(() => biometricLabel(biometricKind), [biometricKind]);

  const value = useMemo(
    () => ({
      isAuthenticated: !!token,
      isLoading,
      customer,
      login,
      register,
      logout,
      updateProfile,
      deleteAccount,
      refreshProfile,
      resendVerificationEmail,
      requestPasswordReset,
      resendVerificationEmailFor,
      getCustomerToken,
      biometricSupported,
      biometricEnabled,
      biometricKind,
      biometricLabelText,
      lastLoginCredentials,
      enableBiometric,
      disableBiometric,
      signInWithBiometric,
    }),
    [token, isLoading, customer, login, register, logout, updateProfile, deleteAccount, refreshProfile, resendVerificationEmail, requestPasswordReset, resendVerificationEmailFor, getCustomerToken, biometricSupported, biometricEnabled, biometricKind, biometricLabelText, lastLoginCredentials, enableBiometric, disableBiometric, signInWithBiometric]
  );

  return (
    <CustomerAuthContext.Provider value={value}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext);
  if (!context) {
    throw new Error("useCustomerAuth must be used within a CustomerAuthProvider");
  }
  return context;
}
