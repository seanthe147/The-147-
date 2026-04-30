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
    let cancelled = false;
    (async () => {
      try {
        // Read every staff key in parallel — sequential AsyncStorage awaits
        // were adding ~50–150ms to startup on cold launches.
        const [stored, storedUsername, storedRole, storedDisplayName, storedMustChange] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEY),
            AsyncStorage.getItem(USERNAME_KEY),
            AsyncStorage.getItem(ROLE_KEY),
            AsyncStorage.getItem(DISPLAY_NAME_KEY),
            AsyncStorage.getItem(MUST_CHANGE_KEY),
          ]);
        if (cancelled) return;

        if (stored) {
          // Optimistically hydrate from cache so the UI can render right
          // away. The /api/staff/verify call below runs in the background
          // and either confirms (no-op) or revokes the session.
          setStaffToken(stored);
          setToken(stored);
          setUsername(storedUsername);
          setRole((storedRole as StaffRole) || "staff");
          setDisplayName(storedDisplayName);
          setMustChangePassword(storedMustChange === "1");
          setIsLoading(false);

          (async () => {
            try {
              const baseUrl = getApiUrl();
              const url = new URL("/api/staff/verify", baseUrl);
              const res = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${stored}` },
              });
              if (cancelled) return;
              // Race guard — if the user logged out, switched accounts, or
              // logged in fresh while this verify was in flight, the on-disk
              // token will no longer match `stored`. Drop the stale result.
              const current = await AsyncStorage.getItem(STORAGE_KEY);
              if (current !== stored) return;
              if (res.ok) {
                const data = await res.json();
                // Refresh with anything the server returns that may have
                // changed since the last login (display name, role, etc).
                if (data.username) setUsername(data.username);
                if (data.role) setRole(data.role as StaffRole);
                if (data.displayName !== undefined) setDisplayName(data.displayName || null);
              } else if (res.status === 401 || res.status === 403 || res.status === 404) {
                // Explicit 4xx — token rejected. Clear everything.
                setStaffToken(null);
                setToken(null);
                setUsername(null);
                setDisplayName(null);
                setRole("staff");
                setMustChangePassword(false);
                await Promise.all([
                  AsyncStorage.removeItem(STORAGE_KEY),
                  AsyncStorage.removeItem(USERNAME_KEY),
                  AsyncStorage.removeItem(ROLE_KEY),
                  AsyncStorage.removeItem(DISPLAY_NAME_KEY),
                  AsyncStorage.removeItem(MUST_CHANGE_KEY),
                ]);
              }
              // Anything else (5xx) — keep the optimistic session.
            } catch {
              // Network error — keep the optimistic session; the next
              // authed request will surface a 401 if the token is bad.
            }
          })();
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
