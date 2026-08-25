export function redirectSystemPath({
  path,
}: { path: string; initial: boolean }) {
  if (!path) return "/";
  if (path.startsWith("/")) return path;

  try {
    const url = new URL(path);
    if (url.protocol === "the147:") {
      const route = `${url.hostname}${url.pathname}`
        .replace(/\/+/g, "/")
        .replace(/^\/+|\/+$/g, "");
      return `${route ? `/${route}` : "/"}${url.search}${url.hash}`;
    }
    if (url.protocol === "https:" || url.protocol === "http:") {
      const configuredHost = process.env.EXPO_PUBLIC_DOMAIN?.replace(/^https?:\/\//, "").split("/")[0];
      const allowedHosts = new Set(["the147bradford.replit.app", configuredHost].filter(Boolean));
      if (!allowedHosts.has(url.host)) return "/";
      return `${url.pathname || "/"}${url.search}${url.hash}`;
    }
  } catch {
    // Malformed/unsupported native intents must not be passed to the router.
  }
  return "/";
}
