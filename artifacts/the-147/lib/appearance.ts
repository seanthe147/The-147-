export type AppearancePreference = "system" | "light" | "dark";
export type ResolvedAppearance = "light" | "dark";

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function resolveAppearance(
  preference: AppearancePreference,
  systemScheme: "light" | "dark" | null | undefined,
  themesEnabled: boolean,
): ResolvedAppearance {
  if (!themesEnabled) return "dark";
  if (preference !== "system") return preference;
  return systemScheme === "light" ? "light" : "dark";
}