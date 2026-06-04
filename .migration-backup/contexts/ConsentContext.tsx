import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CONSENT_KEY = "@the147_consent";

interface ConsentState {
  hasConsented: boolean | null;
  consentDate: string | null;
  analyticsConsent: boolean;
  marketingConsent: boolean;
}

interface ConsentContextValue {
  consent: ConsentState;
  isLoading: boolean;
  acceptAll: () => Promise<void>;
  acceptEssentialOnly: () => Promise<void>;
  revokeConsent: () => Promise<void>;
}

const defaultConsent: ConsentState = {
  hasConsented: null,
  consentDate: null,
  analyticsConsent: false,
  marketingConsent: false,
};

const ConsentContext = createContext<ConsentContextValue>({
  consent: defaultConsent,
  isLoading: true,
  acceptAll: async () => {},
  acceptEssentialOnly: async () => {},
  revokeConsent: async () => {},
});

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentState>(defaultConsent);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadConsent();
  }, []);

  async function loadConsent() {
    try {
      const stored = await AsyncStorage.getItem(CONSENT_KEY);
      if (stored) {
        setConsent(JSON.parse(stored));
      }
    } catch {}
    setIsLoading(false);
  }

  const saveConsent = useCallback(async (newConsent: ConsentState) => {
    try {
      await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(newConsent));
      setConsent(newConsent);
    } catch {}
  }, []);

  const acceptAll = useCallback(async () => {
    await saveConsent({
      hasConsented: true,
      consentDate: new Date().toISOString(),
      analyticsConsent: true,
      marketingConsent: true,
    });
  }, [saveConsent]);

  const acceptEssentialOnly = useCallback(async () => {
    await saveConsent({
      hasConsented: true,
      consentDate: new Date().toISOString(),
      analyticsConsent: false,
      marketingConsent: false,
    });
  }, [saveConsent]);

  const revokeConsent = useCallback(async () => {
    await saveConsent(defaultConsent);
  }, [saveConsent]);

  const value = useMemo(
    () => ({ consent, isLoading, acceptAll, acceptEssentialOnly, revokeConsent }),
    [consent, isLoading, acceptAll, acceptEssentialOnly, revokeConsent]
  );

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

export function useConsent() {
  return useContext(ConsentContext);
}
