import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl, setStaffToken } from "@/lib/query-client";
import { fetch } from "expo/fetch";

const STORAGE_KEY = "staff_session_token";
const USERNAME_KEY = "staff_username";
const ROLE_KEY = "staff_role";

type StaffRole = "staff" | "manager" | "owner";

interface StaffAuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  username: string | null;
  displayName: string | null;
  role: StaffRole;
  isManager: boolean;
  isOwner: boolean;
  login: (username: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  register: (masterPin: string, username: string, pin: string, displayName?: string, role?: StaffRole) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const StaffAuthContext = createContext<StaffAuthContextValue | null>(null);

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [role, setRole] = useState<StaffRole>("staff");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setStaffToken(token);
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const storedUsername = await AsyncStorage.getItem(USERNAME_KEY);
        const storedRole = await AsyncStorage.getItem(ROLE_KEY);
        if (stored) {
          const baseUrl = getApiUrl();
          const url = new URL("/api/staff/verify", baseUrl);
          const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${stored}` },
          });
          if (res.ok) {
            const data = await res.json();
            setToken(stored);
            setUsername(data.username || storedUsername);
            setRole((data.role as StaffRole) || (storedRole as StaffRole) || "staff");
          } else {
            await AsyncStorage.removeItem(STORAGE_KEY);
            await AsyncStorage.removeItem(USERNAME_KEY);
            await AsyncStorage.removeItem(ROLE_KEY);
          }
        }
      } catch {
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (loginUsername: string, pin: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/staff/login", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, pin }),
      });

      if (!res.ok) {
        const data = await res.json();
        return { success: false, error: data.message || "Login failed" };
      }

      const data = await res.json();
      await AsyncStorage.setItem(STORAGE_KEY, data.token);
      if (data.username) {
        await AsyncStorage.setItem(USERNAME_KEY, data.username);
      }
      await AsyncStorage.setItem(ROLE_KEY, data.role || "staff");
      setToken(data.token);
      setUsername(data.username || loginUsername);
      setDisplayName(data.displayName || null);
      setRole((data.role as StaffRole) || "staff");
      return { success: true };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, []);

  const register = useCallback(async (masterPin: string, regUsername: string, pin: string, regDisplayName?: string, regRole?: StaffRole): Promise<{ success: boolean; error?: string }> => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/staff/register", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPin,
          username: regUsername,
          pin,
          displayName: regDisplayName,
          role: regRole || "staff",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        return { success: false, error: data.message || "Registration failed" };
      }

      return { success: true };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        const baseUrl = getApiUrl();
        const url = new URL("/api/staff/logout", baseUrl);
        await fetch(url.toString(), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
      }
    }
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(USERNAME_KEY);
    await AsyncStorage.removeItem(ROLE_KEY);
    setToken(null);
    setUsername(null);
    setDisplayName(null);
    setRole("staff");
  }, [token]);

  const value = useMemo(
    () => ({
      isAuthenticated: !!token,
      isLoading,
      token,
      username,
      displayName,
      role,
      isManager: role === "manager" || role === "owner",
      isOwner: role === "owner",
      login,
      register,
      logout,
    }),
    [token, isLoading, username, displayName, role, login, register, logout]
  );

  return (
    <StaffAuthContext.Provider value={value}>
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth() {
  const context = useContext(StaffAuthContext);
  if (!context) {
    throw new Error("useStaffAuth must be used within a StaffAuthProvider");
  }
  return context;
}
