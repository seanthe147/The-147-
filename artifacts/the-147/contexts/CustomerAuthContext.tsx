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
const PROFILE_CACHE_KEY = "customer_profile_cache";

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
  register: (name: string, email: string, phone: string, password: string, dateOfBirth?: string | null) => Promise<{ success: boolean; pending?: boolean; error?: string }>;
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

  // Returns:
  //   { profile }       — server returned 2xx
  //   { unauthorized }  — server returned 4xx (token rejected — sign out)
  //   { networkError }  — request never completed (offline, timeout, captive
  //                       portal). Caller MUST keep the optimistic session;
  //                       a transient network failure must not log the user
  //                       out of an app that's already been signed in.
  const fetchProfile = useCallback(async (
    sessionToken: string,
  ): Promise<{ profile?: CustomerProfile; unauthorized?: boolean; networkError?: boolean }> => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/customers/me", baseUrl);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (res.ok) {
        const profile = (await res.json()) as CustomerProfile;
        return { profile };
      }
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        return { unauthorized: true };
      }
      // 5xx — treat like a network error so a flaky server doesn't log
      // people out.
      return { networkError: true };
    } catch {
      return { networkError: true };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Read token + cached profile in parallel so we can hydrate the UI
        // immediately. The profile cache is refreshed in the background after
        // first paint so a stale field never blocks rendering.
        const [stored, cachedProfileRaw] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(PROFILE_CACHE_KEY),
        ]);
        if (cancelled) return;
        if (stored) {
          // Hydrate from cache so the app renders as signed-in instantly.
          if (cachedProfileRaw) {
            try {
              const cached = JSON.parse(cachedProfileRaw) as CustomerProfile;
              if (cached && typeof cached.id === "number") {
                setCustomer(cached);
              }
            } catch {}
          }
          setToken(stored);
          setIsLoading(false);
          // Background revalidation: confirm the token is still valid and
          // pick up any server-side profile changes.
          //
          // Race guard — every state/storage mutation below first re-reads
          // the on-disk token. If the user has logged out OR logged in as a
          // different account while this verify was in flight, the on-disk
          // token will no longer match `stored` and we drop the result on
          // the floor. Without this guard a slow stale verify could clear
          // a brand-new session.
          fetchProfile(stored)
            .then(async (result) => {
              if (cancelled) return;
              const current = await AsyncStorage.getItem(TOKEN_KEY);
              if (current !== stored) return; // session changed mid-flight
              if (result.profile) {
                setCustomer(result.profile);
                AsyncStorage.setItem(
                  PROFILE_CACHE_KEY,
                  JSON.stringify(result.profile),
                ).catch(() => {});
              } else if (result.unauthorized) {
                // 4xx — token was explicitly rejected. Sign out cleanly.
                await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
                await AsyncStorage.removeItem(PROFILE_CACHE_KEY).catch(() => {});
                setToken(null);
                setCustomer(null);
              }
              // result.networkError — keep optimistic session; the next
              // authed request will retry.
            })
            .catch(() => {});
        } else {
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchProfile]);

  // After a successful login/register, bind any stored device push token to the
  // customer's account using the authenticated endpoint so that only the verified
  // session owner's email is used — never an attacker-supplied value.
  const bindPushToken = useCallback(async (customerToken: string) => {
    try {
      const pushToken = await AsyncStorage.getItem("expo_push_token");
      const pushRegistrationSecret = await AsyncStorage.getItem("expo_push_registration_secret");
      if (!pushToken || !pushRegistrationSecret) return;
      const baseUrl = getApiUrl();
      const url = new URL("/api/customers/me/push-token", baseUrl);
      await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${customerToken}` },
        body: JSON.stringify({ token: pushToken, pushRegistrationSecret }),
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
      if (data.customer) {
        AsyncStorage.setItem(
          PROFILE_CACHE_KEY,
          JSON.stringify(data.customer),
        ).catch(() => {});
      }
      setToken(data.token);
      setCustomer(data.customer);
      setLastLoginCredentials({ email, password });
      bindPushToken(data.token).catch(() => {});
      return { success: true };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, [bindPushToken]);

  const register = useCallback(async (name: string, email: string, phone: string, password: string, dateOfBirth?: string | null): Promise<{ success: boolean; pending?: boolean; error?: string }> => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/customers/register", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, password, privacyConsent: true, dateOfBirth: dateOfBirth || null }),
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
    AsyncStorage.removeItem(PROFILE_CACHE_KEY).catch(() => {});
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
      const updated = (await res.json()) as CustomerProfile;
      setCustomer(updated);
      AsyncStorage.setItem(
        PROFILE_CACHE_KEY,
        JSON.stringify(updated),
      ).catch(() => {});
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
      // Clear every locally-cached identifier for the deleted account.
      // PROFILE_CACHE_KEY in particular contains PII (name/email/phone/DOB)
      // and must not survive an account deletion.
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.removeItem(PROFILE_CACHE_KEY);
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
    const result = await fetchProfile(token);
    if (result.profile) {
      setCustomer(result.profile);
      AsyncStorage.setItem(
        PROFILE_CACHE_KEY,
        JSON.stringify(result.profile),
      ).catch(() => {});
    }
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
