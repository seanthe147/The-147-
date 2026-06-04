/**
 * KioskContext for the standalone Kiosk app.
 *
 * Unlike the main app's KioskContext (which has enable/disable toggle),
 * this one is always-on. The kiosk app IS the kiosk — no PIN, no toggle.
 * It just manages attract screen visibility and the idle timer.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";

const IDLE_TIMEOUT_MS = 90_000;

interface KioskContextValue {
  attractVisible: boolean;
  dismissAttract: () => void;
  showAttract: () => void;
  resetIdle: () => void;
  setOnIdle: (fn: (() => void) | null) => void;
}

const KioskContext = createContext<KioskContextValue | null>(null);

export function KioskProvider({ children }: { children: ReactNode }) {
  const [attractVisible, setAttractVisible] = useState(true);
  const onIdleRef = useRef<(() => void) | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const armIdleTimer = useCallback(() => {
    clearIdleTimer();
    if (attractVisible) return;
    idleTimerRef.current = setTimeout(() => {
      try {
        onIdleRef.current?.();
      } catch {}
      setAttractVisible(true);
    }, IDLE_TIMEOUT_MS);
  }, [attractVisible, clearIdleTimer]);

  useEffect(() => {
    armIdleTimer();
    return () => clearIdleTimer();
  }, [armIdleTimer, clearIdleTimer]);

  const resetIdle = useCallback(() => {
    armIdleTimer();
  }, [armIdleTimer]);

  const dismissAttract = useCallback(() => {
    setAttractVisible(false);
  }, []);

  const showAttract = useCallback(() => {
    setAttractVisible(true);
    clearIdleTimer();
  }, [clearIdleTimer]);

  const setOnIdle = useCallback((fn: (() => void) | null) => {
    onIdleRef.current = fn;
  }, []);

  const value = useMemo<KioskContextValue>(
    () => ({
      attractVisible,
      dismissAttract,
      showAttract,
      resetIdle,
      setOnIdle,
    }),
    [attractVisible, dismissAttract, showAttract, resetIdle, setOnIdle]
  );

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
}

export function useKiosk() {
  const ctx = useContext(KioskContext);
  if (!ctx) throw new Error("useKiosk must be used within a KioskProvider");
  return ctx;
}
