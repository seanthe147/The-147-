/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML (Expo Go QR / app download)
 * - GET /<public-route> → lightweight public-route HTML with route-specific
 *   metadata (title, description, OG, canonical, JSON-LD) + app store links.
 *   These pages give crawlers real head content without serving the Expo Go
 *   landing page for every URL.
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");
const PUBLIC_ROUTE_TEMPLATE_PATH = path.resolve(__dirname, "templates", "public-route.html");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Per-route SEO metadata for known public Expo routes.
// title/description → injected into <head> for crawlers (OG, Twitter, canonical, JSON-LD).
// headline/bodyDescription → shown in the rendered public-route.html card body.
// "/" is handled separately (landing page); all others use the public-route template.
const ROUTE_META = {
  "/": {
    title: "The 147 Bradford — Snooker, Pool & Dining",
    description:
      "Book snooker and pool tables, order food and drinks, join our membership, and earn loyalty rewards at The 147 Bradford.",
    headline: "The 147 Bradford",
    bodyDescription:
      "Snooker, pool, and dining in Bradford. Book tables, order food and drinks, earn loyalty points, and manage your membership — all in the app.",
  },
  "/book": {
    title: "Book a Table — The 147 Bradford",
    description:
      "Reserve a snooker or pool table at The 147 Bradford. Check live availability and book online in seconds.",
    headline: "Book a Snooker or Pool Table",
    bodyDescription:
      "Check live availability and reserve your table at The 147 Bradford in seconds. Download the app to book.",
  },
  "/membership": {
    title: "Membership — The 147 Bradford",
    description:
      "Join The 147 Bradford as a member. Enjoy exclusive benefits, priority bookings, and loyalty perks with a monthly or annual membership.",
    headline: "The 147 Membership",
    bodyDescription:
      "Become a member and enjoy exclusive benefits — priority table bookings, discounted rates, and accelerated loyalty rewards. Monthly and annual plans available in the app.",
  },
  "/events": {
    title: "Events — The 147 Bradford",
    description:
      "Browse upcoming events and competitions at The 147 Bradford snooker club.",
    headline: "Events & Competitions",
    bodyDescription:
      "Tournaments, socials, and special evenings at The 147 Bradford. Download the app to browse the full events calendar and reserve your spot.",
  },
  "/order": {
    title: "Food & Drink — The 147 Bradford",
    description:
      "Order food and drinks to your table at The 147 Bradford. Browse the full menu and place your order.",
    headline: "Order Food & Drinks",
    bodyDescription:
      "Browse the full menu and order straight to your table at The 147 Bradford. Download the app to place your order.",
  },
  "/loyalty": {
    title: "Loyalty Rewards — The 147 Bradford",
    description:
      "Earn and spend loyalty points at The 147 Bradford. Sign up and start earning rewards on every visit.",
    headline: "Loyalty Rewards",
    bodyDescription:
      "Earn points on every table booking, food order, and drink. Redeem them for free sessions, discounts, and more. Download the app to get started.",
  },
  "/about": {
    title: "About — The 147 Bradford",
    description:
      "Learn about The 147 Bradford snooker club — our venue, facilities, and everything we offer.",
    headline: "About The 147 Bradford",
    bodyDescription:
      "The 147 Bradford is a premier snooker and pool venue in West Yorkshire, offering full-size snooker tables, pool tables, food, drinks, and events. Download the app to explore everything we offer.",
  },
  "/contact": {
    title: "Contact — The 147 Bradford",
    description:
      "Get in touch with The 147 Bradford. Find our contact details and send us a message.",
    headline: "Contact The 147 Bradford",
    bodyDescription:
      "Have a question or need to reach us? Download the app to send a message, or find us in Bradford, West Yorkshire.",
  },
  "/rewards": {
    title: "Rewards — The 147 Bradford",
    description:
      "Claim your prize and venue rewards at The 147 Bradford snooker club.",
    headline: "Prize & Venue Rewards",
    bodyDescription:
      "Redeem prize codes and venue rewards at The 147 Bradford. Download the app to claim your rewards.",
  },
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, "..", "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.writeHead(200, {
    "content-type": "application/json",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
  res.end(manifest);
}

function serveLandingPage(req, res, landingPageTemplate, appName, meta) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  const routeMeta = meta || ROUTE_META["/"];
  const title = routeMeta.title || appName;
  const description = routeMeta.description || "";
  const canonicalPath = routeMeta.canonicalPath || "";
  // basePath is stripped when routing but must be re-included in canonicals
  // so that search engines index the correct fully-qualified URL.
  const canonicalUrl = `${baseUrl}${basePath}${canonicalPath}`;

  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    "name": "The 147 Bradford",
    "description": "Snooker, pool, and dining venue in Bradford, UK.",
    "url": baseUrl,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Bradford",
      "addressRegion": "West Yorkshire",
      "addressCountry": "GB",
    },
  });

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName)
    .replace(/META_TITLE_PLACEHOLDER/g, escHtml(title))
    .replace(/META_DESCRIPTION_PLACEHOLDER/g, escHtml(description))
    .replace(/CANONICAL_URL_PLACEHOLDER/g, canonicalUrl)
    .replace(/STRUCTURED_DATA_PLACEHOLDER/g, structuredData);

  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function servePublicRoute(req, res, publicRouteTemplate, meta) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const baseUrl = `${protocol}://${host}`;

  const title = meta.title;
  const description = meta.description || "";
  const canonicalPath = meta.canonicalPath || "";
  // Include basePath so canonicals resolve correctly on subpath deployments.
  const canonicalUrl = `${baseUrl}${basePath}${canonicalPath}`;

  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    "name": "The 147 Bradford",
    "description": "Snooker, pool, and dining venue in Bradford, UK.",
    "url": `${baseUrl}${basePath}/`,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Bradford",
      "addressRegion": "West Yorkshire",
      "addressCountry": "GB",
    },
  });

  const html = publicRouteTemplate
    .replace(/META_TITLE_PLACEHOLDER/g, escHtml(title))
    .replace(/META_DESCRIPTION_PLACEHOLDER/g, escHtml(description))
    .replace(/CANONICAL_URL_PLACEHOLDER/g, canonicalUrl)
    .replace(/STRUCTURED_DATA_PLACEHOLDER/g, structuredData)
    .replace(/BODY_HEADLINE_PLACEHOLDER/g, escHtml(meta.headline || title))
    .replace(/BODY_DESCRIPTION_PLACEHOLDER/g, escHtml(meta.bodyDescription || description))
    .replace(/BASE_URL_PLACEHOLDER/g, `${baseUrl}${basePath}`);

  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function serveStaticFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(STATIC_ROOT, safePath);

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "content-type": contentType });
  res.end(content);
}

const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, "utf-8");
const publicRouteTemplate = fs.readFileSync(PUBLIC_ROUTE_TEMPLATE_PATH, "utf-8");
const appName = getAppName();

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  if (pathname === "/" || pathname === "/manifest") {
    const platform = req.headers["expo-platform"];
    if (platform === "ios" || platform === "android") {
      return serveManifest(platform, res);
    }

    if (pathname === "/") {
      return serveLandingPage(req, res, landingPageTemplate, appName, { ...ROUTE_META["/"], canonicalPath: "/" });
    }
  }

  // SEO / crawler discovery files
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml" || pathname === "/llms.txt") {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers["host"] || "";
    const origin = `${proto}://${host}`.replace(/\/+$/, "");

    if (pathname === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(
        [
          "User-agent: *",
          "Allow: /",
          "Disallow: /staff",
          "Disallow: /kiosk",
          "Disallow: /api/",
          "Disallow: /widget/",
          "Disallow: /verify-email",
          "Disallow: /reset-password",
          "Disallow: /delete-account",
          `Sitemap: ${origin}/sitemap.xml`,
          "",
        ].join("\n")
      );
      return;
    }

    if (pathname === "/sitemap.xml") {
      const today = new Date().toISOString().slice(0, 10);
      // Build sitemap from ROUTE_META, excluding "/" (covered as the site root).
      const sitemapPriority = { "/membership": "0.9", "/book": "0.9", "/events": "0.8", "/order": "0.8", "/loyalty": "0.7" };
      const publicRoutes = Object.keys(ROUTE_META).filter((r) => r !== "/");
      const urlEntries = publicRoutes.map((r) => {
        const priority = sitemapPriority[r] || "0.6";
        return (
          `  <url>\n` +
          `    <loc>${origin}${r}</loc>\n` +
          `    <lastmod>${today}</lastmod>\n` +
          `    <changefreq>weekly</changefreq>\n` +
          `    <priority>${priority}</priority>\n` +
          `  </url>`
        );
      }).join("\n");
      res.writeHead(200, { "content-type": "application/xml; charset=utf-8" });
      res.end(
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urlEntries + "\n" +
        `</urlset>\n`
      );
      return;
    }

    if (pathname === "/llms.txt") {
      const keyPages = Object.entries(ROUTE_META)
        .filter(([r]) => r !== "/")
        .map(([r, m]) => `- ${origin}${r} — ${m.description}`)
        .join("\n");
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(
        [
          "# The 147 — Bradford Snooker Club",
          "",
          "The 147 is a snooker, pool, and dining venue in Bradford, UK.",
          "This site covers table bookings, memberships, food & drink ordering, events, and loyalty rewards.",
          "",
          "## Key pages",
          "",
          keyPages,
          "",
          "## Do not cite",
          "",
          "The following paths are internal tools or transactional utilities, not public content:",
          "/staff, /kiosk, /api/*, /widget/*, /verify-email, /reset-password, /delete-account",
          "",
        ].join("\n")
      );
      return;
    }
  }

  // Known public Expo routes — serve a lightweight branded HTML page with
  // route-specific metadata (title, description, OG, canonical, JSON-LD) and
  // App Store / Google Play download links. This gives crawlers real head
  // content and a meaningful page for every listed public URL without serving
  // the Expo Go developer landing page (QR code page) at these addresses.
  // The production build is mobile-native OTA only; these HTML shells are the
  // correct public-web presence until a full web export is added.
  if (pathname !== "/" && ROUTE_META[pathname]) {
    return servePublicRoute(req, res, publicRouteTemplate, {
      ...ROUTE_META[pathname],
      canonicalPath: pathname,
    });
  }

  serveStaticFile(pathname, res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Serving static Expo build on port ${port}`);
});
