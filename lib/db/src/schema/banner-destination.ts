/** New writes use "events"; "event" remains a supported legacy spelling. */
export type BannerLinkType = "events" | "order" | "url";
export type BannerTab = "home" | "events" | "order";

export function normalizeBannerLinkType(value: unknown): BannerLinkType | null {
  if (value === "event" || value === "events") return "events";
  return value === "order" || value === "url" ? value : null;
}

/** Only standard web navigation schemes may reach Linking.openURL. */
export function isSafePublicUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export type BannerDestination =
  | { type: "tab"; tab: "events" | "order"; href: "/(tabs)/events" | "/(tabs)/order" }
  | { type: "url"; url: string };

export function resolveBannerDestination(banner: { linkType?: string | null; linkValue?: string | null }): BannerDestination | null {
  const type = normalizeBannerLinkType(banner.linkType);
  if (type === "events") return { type: "tab", tab: "events", href: "/(tabs)/events" };
  if (type === "order") return { type: "tab", tab: "order", href: "/(tabs)/order" };
  if (type === "url" && isSafePublicUrl(banner.linkValue)) return { type: "url", url: banner.linkValue.trim() };
  return null;
}

/** Same-tab taps are intentionally a no-op; internal tabs never push a new screen. */
export function activateBannerDestination(
  destination: BannerDestination | null,
  currentTab: BannerTab,
  actions: { navigate: (href: "/(tabs)/events" | "/(tabs)/order") => void; openURL: (url: string) => unknown },
): void {
  if (!destination) return;
  if (destination.type === "tab") {
    if (destination.tab !== currentTab) actions.navigate(destination.href);
  } else if (isSafePublicUrl(destination.url)) {
    actions.openURL(destination.url);
  }
}
