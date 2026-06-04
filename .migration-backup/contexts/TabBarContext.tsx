import React, { createContext, useContext, useState, useMemo, ReactNode } from "react";

interface TabBarContextValue {
  tabBarVisible: boolean;
  setTabBarVisible: (visible: boolean) => void;
}

const TabBarContext = createContext<TabBarContextValue>({
  tabBarVisible: true,
  setTabBarVisible: () => {},
});

export function TabBarProvider({ children }: { children: ReactNode }) {
  const [tabBarVisible, setTabBarVisible] = useState(true);

  const value = useMemo(
    () => ({ tabBarVisible, setTabBarVisible }),
    [tabBarVisible]
  );

  return (
    <TabBarContext.Provider value={value}>{children}</TabBarContext.Provider>
  );
}

export function useTabBar() {
  return useContext(TabBarContext);
}
