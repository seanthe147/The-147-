import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl, setStaffToken } from "@/lib/query-client";
import { fetch } from "expo/fetch";

const STORAGE_KEY = "staff_session_token";
const USERNAME_KEY = "staff_username";
const ROLE_KEY = "staff_role";
const DISPLAY_NAME_KEY = "staff_display_name";
const MUST_CHANGE_KEY = "staff_must_change_password";

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
  mustChangePassword: boolean;
  login: (username: string, secret: string) => Promise<{ success: boolean; error?: string; mustChangePassword?: boolean }>;
  register: (masterPin: string, username: string, password: string, displayName?: string, role?: StaffRole) => Promise<{ success: boolean; error?: string }>;
  setPassword: (newPassword: string, currentPassword?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const StaffAuthContext = createContext<StaffAuthContextValue | null>(null);

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [role, setRole] = useState<StaffRole>("staff");
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const storedUsername = await AsyncStorage.getItem(USERNAME_KEY);
        const storedRole = await AsyncStorage.getItem(ROLE_KEY);
        const storedDisplayName = await AsyncStorage.getItem(DISPLAY_NAME_KEY);
        const storedMustChange = await AsyncStorage.getItem(MUST_CHANGE_KEY);
        if (stored) {
          const baseUrl = getApiUrl();
          const url = new URL("/api/staff/verify", baseUrl);
          const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${stored}` },
          });
          if (res.ok) {
            const data = await res.json();
            // Set in-memory token synchronously before updating React state
            setStaffToken(stored);
            setToken(stored);
            setUsername(data.username || storedUsername);
            setRole((data.role as StaffRole) || (storedRole as StaffRole) || "staff");
            setDisplayName(data.displayName || storedDisplayName || null);
            setMustChangePassword(storedMustChange === "1");
          } else {
            setStaffToken(null);
            await AsyncStorage.removeItem(STORAGE_KEY);
            await AsyncStorage.removeItem(USERNAME_KEY);
            await AsyncStorage.removeItem(ROLE_KEY);
            await AsyncStorage.removeItem(DISPLAY_NAME_KEY);
            await AsyncStorage.removeItem(MUST_CHANGE_KEY);
          }
        }
      } catch {
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (loginUsername: string, secret: string) => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/staff/login", baseUrl);
      // Send both fields — server prefers `password`, falls back to `pin` for legacy / master-PIN.
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password: secret, pin: secret }),
      });

      if (!res.ok) {
        const data = await res.json();
        return { success: false, error: data.message || "Login failed" };
      }

      const data = await res.json();
      const mustChange = data.mustChangePassword === true;
      await AsyncStorage.setItem(STORAGE_KEY, data.token);
      if (data.username) {
        await AsyncStorage.setItem(USERNAME_KEY, data.username);
      }
      if (data.displayName) {
        await AsyncStorage.setItem(DISPLAY_NAME_KEY, data.displayName);
      }
      await AsyncStorage.setItem(ROLE_KEY, data.role || "staff");
      await AsyncStorage.setItem(MUST_CHANGE_KEY, mustChange ? "1" : "0");
      // Set in-memory token synchronously so it's available immediately
      setStaffToken(data.token);
      setToken(data.token);
      setUsername(data.username || loginUsername);
      setDisplayName(data.displayName || null);
      setRole((data.role as StaffRole) || "staff");
      setMustChangePassword(mustChange);
      return { success: true, mustChangePassword: mustChange };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, []);

  const register = useCallback(async (masterPin: string, regUsername: string, password: string, regDisplayName?: string, regRole?: StaffRole) => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/staff/register", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPin,
          username: regUsername,
          password,
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

  const setPassword = useCallback(async (newPassword: string, currentPassword?: string) => {
    if (!token) return { success: false, error: "Not signed in" };
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/staff/set-password", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword, currentPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { success: false, error: data.message || "Failed to update password" };
      }
      // Clear the must-change flag on success.
      await AsyncStorage.setItem(MUST_CHANGE_KEY, "0");
      setMustChangePassword(false);
      return { success: true };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, [token]);

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
    // Clear in-memory token synchronously
    setStaffToken(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(USERNAME_KEY);
    await AsyncStorage.removeItem(ROLE_KEY);
    await AsyncStorage.removeItem(DISPLAY_NAME_KEY);
    await AsyncStorage.removeItem(MUST_CHANGE_KEY);
    setToken(null);
    setUsername(null);
    setDisplayName(null);
    setRole("staff");
    setMustChangePassword(false);
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
      mustChangePassword,
      login,
      register,
      setPassword,
      logout,
    }),
    [token, isLoading, username, displayName, role, mustChangePassword, login, register, setPassword, logout]
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
