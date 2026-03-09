import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";

const TOKEN_KEY = "customer_session_token";

interface CustomerProfile {
  id: number;
  name: string;
  email: string;
  phone: string | null;
}

interface CustomerAuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  customer: CustomerProfile | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, phone: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (data: { name?: string; phone?: string }) => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
      return { success: true };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, []);

  const register = useCallback(async (name: string, email: string, phone: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/customers/register", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        return { success: false, error: data.message || "Registration failed" };
      }

      const data = await res.json();
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setCustomer(data.customer);
      return { success: true };
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
    setToken(null);
    setCustomer(null);
  }, [token]);

  const updateProfile = useCallback(async (data: { name?: string; phone?: string }): Promise<{ success: boolean; error?: string }> => {
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

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    const profile = await fetchProfile(token);
    if (profile) setCustomer(profile);
  }, [token, fetchProfile]);

  const value = useMemo(
    () => ({
      isAuthenticated: !!token,
      isLoading,
      customer,
      login,
      register,
      logout,
      updateProfile,
      refreshProfile,
    }),
    [token, isLoading, customer, login, register, logout, updateProfile, refreshProfile]
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
