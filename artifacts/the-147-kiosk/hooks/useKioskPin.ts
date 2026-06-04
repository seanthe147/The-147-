/**
 * useKioskPin — AsyncStorage-backed PIN management for the kiosk exit lock.
 *
 * Default PIN is "1147" (easy for staff to remember, hard for customers to
 * guess accidentally). Staff can change it from the staff-setup screen.
 */
import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@kiosk/exit_pin";
const DEFAULT_PIN = "1147";

export function useKioskPin() {
  const [pin, setPin] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        setPin(stored ?? DEFAULT_PIN);
      })
      .catch(() => {
        setPin(DEFAULT_PIN);
      })
      .finally(() => setLoading(false));
  }, []);

  const updatePin = useCallback(async (newPin: string) => {
    await AsyncStorage.setItem(STORAGE_KEY, newPin);
    setPin(newPin);
  }, []);

  const checkPin = useCallback(
    (candidate: string) => {
      const current = pin ?? DEFAULT_PIN;
      return candidate === current;
    },
    [pin]
  );

  return { pin, loading, updatePin, checkPin };
}
