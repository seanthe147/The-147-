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
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_ENABLED = "kiosk_mode_enabled";
const STORAGE_KEY_PIN = "kiosk_exit_pin";

const IDLE_TIMEOUT_MS = 60_000;

// Master kill-switch — when false, kiosk mode is force-disabled everywhere
// regardless of any persisted "enabled" flag on the device. Flip to true to
// re-enable the feature.
const KIOSK_FEATURE_ENABLED = false;

interface KioskContextValue {
  isKioskMode: boolean;
  isReady: boolean;
  attractVisible: boolean;
  enableKioskMode: (pin: string) => Promise<void>;
  disableKioskMode: (pin: string) => Promise<boolean>;
  dismissAttract: () => void;
  showAttract: () => void;
  resetIdle: () => void;
  setOnIdle: (fn: (() => void) | null) => void;
}

const KioskContext = createContext<KioskContextValue | null>(null);

export function KioskProvider({ children }: { children: ReactNode }) {
  const [isKioskMode, setIsKioskMode] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [attractVisible, setAttractVisible] = useState(true);
  const onIdleRef = useRef<(() => void) | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (!KIOSK_FEATURE_ENABLED) {
          // Feature is disabled — clear any stale persisted flag so previously
          // kiosked devices come out of kiosk mode on next launch.
          await AsyncStorage.setItem(STORAGE_KEY_ENABLED, "0");
          setIsKioskMode(false);
        } else {
          const enabled = await AsyncStorage.getItem(STORAGE_KEY_ENABLED);
          setIsKioskMode(enabled === "1");
        }
      } catch {}
      setIsReady(true);
    })();
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const armIdleTimer = useCallback(() => {
    clearIdleTimer();
    if (!isKioskMode || attractVisible) return;
    idleTimerRef.current = setTimeout(() => {
      try {
        onIdleRef.current?.();
      } catch {}
      setAttractVisible(true);
    }, IDLE_TIMEOUT_MS);
  }, [isKioskMode, attractVisible, clearIdleTimer]);

  useEffect(() => {
    armIdleTimer();
    return () => clearIdleTimer();
  }, [armIdleTimer, clearIdleTimer]);

  const resetIdle = useCallback(() => {
    armIdleTimer();
  }, [armIdleTimer]);

  const enableKioskMode = useCallback(async (pin: string) => {
    if (!KIOSK_FEATURE_ENABLED) {
      throw new Error("Kiosk mode is disabled");
    }
    const cleanPin = pin.trim();
    if (cleanPin.length < 4) throw new Error("PIN must be at least 4 digits");
    await AsyncStorage.setItem(STORAGE_KEY_PIN, cleanPin);
    await AsyncStorage.setItem(STORAGE_KEY_ENABLED, "1");
    setIsKioskMode(true);
    setAttractVisible(true);
  }, []);

  const disableKioskMode = useCallback(async (pin: string): Promise<boolean> => {
    const stored = (await AsyncStorage.getItem(STORAGE_KEY_PIN)) ?? "";
    if (stored !== pin.trim()) return false;
    await AsyncStorage.setItem(STORAGE_KEY_ENABLED, "0");
    setIsKioskMode(false);
    setAttractVisible(true);
    clearIdleTimer();
    return true;
  }, [clearIdleTimer]);

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
      isKioskMode,
      isReady,
      attractVisible,
      enableKioskMode,
      disableKioskMode,
      dismissAttract,
      showAttract,
      resetIdle,
      setOnIdle,
    }),
    [isKioskMode, isReady, attractVisible, enableKioskMode, disableKioskMode, dismissAttract, showAttract, resetIdle, setOnIdle],
  );

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
}

export function useKiosk() {
  const ctx = useContext(KioskContext);
  if (!ctx) throw new Error("useKiosk must be used within a KioskProvider");
  return ctx;
}
