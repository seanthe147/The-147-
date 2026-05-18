import * as Sentry from "@sentry/node";

// Initialise Sentry BEFORE any other import that may throw at load time, so
// errors from those modules are captured. No-op when SENTRY_DSN is unset, so
// local dev (and any deploy without the secret) costs nothing.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    release: process.env.GIT_COMMIT || process.env.REPL_COMMIT_SHA,
    // 10% trace sample is plenty for a venue-scale app — keeps the free tier
    // comfortable while still catching slow/failing requests.
    tracesSampleRate: 0.1,
  });
}

import express from "express";
import compression from "compression";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { runStartupMigrations } from "./storage";
import * as fs from "fs";
import * as path from "path";
import nodemailer from "nodemailer";
import * as http from "http";
import { ensureBuildInfo, getBuildInfo, runDeployVerification, detectPublicBaseUrl } from "./build-info";

// The venue is in Bradford (Europe/London). All loyalty day-boundary checks
// — birthday window opens, "double points today" reset, broadcast dedupe —
// must happen against London local time, not the server's UTC clock, or
// they will fire an hour early/late during BST and may skip a calendar day
// around midnight UTC. routes.ts has its own getLondonNow(); the schedulers
// in this file use this small helper for the same reason.
const VENUE_TZ = "Europe/London";
function getLondonDateString(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VENUE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function getLondonYearAndMonthDay(): { year: number; monthDay: string } {
  const dateStr = getLondonDateString();
  return { year: parseInt(dateStr.slice(0, 4), 10), monthDay: dateStr.slice(5) };
}
function msUntilNextLondonMidnight(): number {
  // Find the wall-clock now in London, then compute milliseconds until the
  // next 00:00:01 in London. We add a 1s grace so the run lands just inside
  // the new day rather than racing the boundary.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VENUE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  let h = parseInt(get("hour"), 10);
  if (h === 24) h = 0;
  const m = parseInt(get("minute"), 10);
  const s = parseInt(get("second"), 10);
  const secondsSinceMidnight = h * 3600 + m * 60 + s;
  const secondsUntil = (24 * 3600 - secondsSinceMidnight) + 1;
  return secondsUntil * 1000;
}
// getBuildInfo is used by the /api/build-info route below.

const app = express();
app.set("trust proxy", 1);
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    // Public booking API routes — allow any origin (no credentials needed)
    const isPublicBookingRoute =
      (req.path === "/api/bookings" && req.method === "POST") ||
      req.path === "/api/bookings/availability" ||
      req.method === "OPTIONS";

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    } else if (isPublicBookingRoute) {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupSecurityHeaders(app: express.Application) {
  // Remove the X-Powered-By header so the server technology is not fingerprinted
  app.disable("x-powered-by");
  const isProd = process.env.NODE_ENV === "production";
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    // HSTS — tell browsers to always use HTTPS (production only, 1 year)
    if (isProd) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    // In development, the Expo web app calls the API at the Replit dev domain (cross-origin
    // from localhost). We need connect-src * in dev so API calls work from any SPA route.
    const devConnectSrc = isProd ? null : "*";

    if (req.path === "/staff" || req.path.startsWith("/staff-portal") || req.path.startsWith("/admin-") || req.path.startsWith("/staff-")) {
      // All staff-facing SPA routes — locked down in production, open in dev
      res.setHeader("X-Frame-Options", "DENY");
      // Allow Stripe.js + TicketSource Box Office iframe for the Events & Payments page
      const connectSrc = devConnectSrc ?? "'self' https://api.stripe.com https://m.stripe.com https://m.stripe.network https://pci-connect.squareup.com https://pci-connect.squareupsandbox.com https://connect.squareup.com https://connect.squareupsandbox.com https://o160250.ingest.sentry.io";
      res.setHeader(
        "Content-Security-Policy",
        `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://m.stripe.network https://web.squarecdn.com https://sandbox.web.squarecdn.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://web.squarecdn.com https://sandbox.web.squarecdn.com; font-src 'self' data: https://fonts.gstatic.com https://square-fonts-production-f.squarecdn.com https://d1g145x70srn7h.cloudfront.net; connect-src ${connectSrc}; img-src 'self' data: blob: https:; frame-src https://js.stripe.com https://hooks.stripe.com https://*.ticketsource.co.uk https://*.ticketsource.com https://web.squarecdn.com https://sandbox.web.squarecdn.com; frame-ancestors 'none'`
      );
    } else if (req.path === "/widget/booking") {
      // Allow embedding anywhere (public booking widget for Wix and other websites)
      res.removeHeader("X-Frame-Options");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors *"
      );
    } else if (!req.path.startsWith("/api")) {
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      const genericConnectSrc = devConnectSrc ?? "'self' https://*.squareup.com https://*.squarecdn.com https://*.resend.com https://api.stripe.com https://m.stripe.com https://m.stripe.network";
      res.setHeader(
        "Content-Security-Policy",
        `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://js.stripe.com https://m.stripe.network https://web.squarecdn.com https://sandbox.web.squarecdn.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://web.squarecdn.com https://sandbox.web.squarecdn.com; font-src 'self' data: https://fonts.gstatic.com https://square-fonts-production-f.squarecdn.com https://d1g145x70srn7h.cloudfront.net; connect-src ${genericConnectSrc}; img-src 'self' data: https:; frame-src 'self' https://www.the147order.co.uk https://the147order.co.uk https://js.stripe.com https://hooks.stripe.com https://web.squarecdn.com https://sandbox.web.squarecdn.com`
      );
    } else {
      res.setHeader("X-Frame-Options", "DENY");
    }
    if (!req.path.startsWith("/api")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
    }
    next();
  });
}

// Fields whose values must never appear in logs
const SENSITIVE_FIELDS = new Set([
  "pin", "confirmPin", "masterPin", "newPin", "currentPin", "password",
  "passwordHash", "pinHash", "pinSalt", "token", "authorization",
  "customerName", "customerEmail", "customerPhone", "email", "phone",
  "name", "code", "otp",
]);

function redactSensitive(obj: unknown, depth = 0): unknown {
  if (depth > 4 || obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => redactSensitive(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = SENSITIVE_FIELDS.has(k) ? "[REDACTED]" : redactSensitive(v, depth + 1);
  }
  return out;
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "100kb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // Only log response body for non-sensitive, non-2xx responses to avoid PII in logs
      if (capturedJsonResponse && res.statusCode >= 400) {
        const safe = redactSensitive(capturedJsonResponse);
        const snippet = JSON.stringify(safe);
        logLine += ` :: ${snippet.length > 120 ? snippet.slice(0, 119) + "…" : snippet}`;
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response, req: Request) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  let manifestStr = fs.readFileSync(manifestPath, "utf-8");

  // Dynamically rewrite the domain so a static build works on any deployment domain.
  // The manifest was built with a specific base URL; replace it with the current host.
  try {
    const manifest = JSON.parse(manifestStr);
    const builtUrl: string | undefined = manifest?.launchAsset?.url;
    if (builtUrl) {
      const builtOrigin = new URL(builtUrl).origin;
      const forwardedProto = req.header("x-forwarded-proto");
      const protocol = forwardedProto || req.protocol || "https";
      const forwardedHost = req.header("x-forwarded-host");
      const host = forwardedHost || req.get("host") || "";
      const currentOrigin = `${protocol}://${host}`;
      if (builtOrigin !== currentOrigin) {
        manifestStr = manifestStr.split(builtOrigin).join(currentOrigin);
      }
    }
  } catch {
    // If rewriting fails, serve the manifest as-is
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  res.send(manifestStr);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      // In development, proxy the manifest request to the live Metro bundler
      // so Expo Go loads the current code, not a stale static build.
      if (process.env.NODE_ENV !== "production") {
        const proxyReq = http.request(
          {
            hostname: "localhost",
            port: 8081,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: "localhost:8081" },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
            proxyRes.pipe(res, { end: true });
          },
        );
        proxyReq.on("error", () => {
          // Metro not ready — fall back to static manifest
          return serveExpoManifest(platform, res, req);
        });
        req.pipe(proxyReq, { end: true });
        return;
      }
      return serveExpoManifest(platform, res, req);
    }

    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  // In development, pipe Metro bundler requests (bundle.js, hot-updates, _expo assets)
  // directly to Metro dev server on port 8081.
  if (process.env.NODE_ENV !== "production") {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) return next();
      const isMetro =
        req.path.startsWith("/_expo") ||
        req.path.startsWith("/hot") ||
        req.path.startsWith("/symbolicate") ||
        req.path.startsWith("/logs") ||
        req.path.startsWith("/inspector") ||
        /^\/\d+-\d+\//.test(req.path);
      if (!isMetro) return next();

      const proxyReq = http.request(
        {
          hostname: "localhost",
          port: 8081,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: "localhost:8081" },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        },
      );
      proxyReq.on("error", () => {
        if (!res.headersSent) res.status(502).send("Metro bundler not ready");
      });
      req.pipe(proxyReq, { end: true });
    });
  }

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

  // SEO: robots.txt — allow all crawlers, point to sitemap.
  app.get("/robots.txt", (req: Request, res: Response) => {
    const origin =
      process.env.PUBLIC_APP_URL?.replace(/\/+$/, "") ||
      `${req.protocol}://${req.get("host")}`;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).send(
      `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /staff-portal\nDisallow: /staff-hr\nDisallow: /admin-\n\nSitemap: ${origin}/sitemap.xml\n`,
    );
  });

  // SEO: minimal sitemap covering the public marketing surfaces.
  app.get("/sitemap.xml", (req: Request, res: Response) => {
    const origin =
      process.env.PUBLIC_APP_URL?.replace(/\/+$/, "") ||
      `${req.protocol}://${req.get("host")}`;
    const today = new Date().toISOString().slice(0, 10);
    const urls = ["/", "/membership", "/privacy-policy", "/terms-of-service", "/contact"];
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls
        .map(
          (p) =>
            `  <url><loc>${origin}${p}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq></url>`,
        )
        .join("\n") +
      `\n</urlset>\n`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).send(body);
  });

  // Serve Apple Pay / Google Pay domain-association files for Square wallet
  // domain verification. Place files in server/well-known/ — they'll be
  // reachable at https://<domain>/.well-known/<filename>
  app.use(
    "/.well-known",
    express.static(path.resolve(process.cwd(), "server", "well-known"), {
      // Apple's verification fetcher refuses anything that isn't served as
      // plain text with the exact filename it requested.
      setHeaders: (res) => {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300");
      },
      dotfiles: "allow",
    }),
  );
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  // Homepage mockup (preview only) — registered here, before SPA catch-all,
  // so it is reachable in both development and production without depending on Metro.
  app.get("/preview-home", (_req: Request, res: Response) => {
    try {
      const p = path.resolve(process.cwd(), "server", "templates", "home-mockup.html");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(fs.readFileSync(p, "utf-8"));
    } catch {
      res.status(500).send("Mockup unavailable");
    }
  });

  // ── Test website (multi-page mockup) ───────────────────────────────────────
  // Lives under /test-site/* and is fully self-contained from the production app.
  // Each page is a static HTML file in server/templates/test-site/. To edit any
  // page, just open the matching .html file (e.g. snooker.html) and change the
  // text — no rebuild needed.
  const TEST_SITE_PAGES: Record<string, string> = {
    "": "home.html",
    "snooker": "snooker.html",
    "dining": "dining.html",
    "events": "events.html",
    "function-rooms": "function-rooms.html",
    "gift-cards": "gift-cards.html",
    "contact": "contact.html",
    // Full native pages for interactive systems (replace modal popups)
    "membership": "membership.html",
    "order": "order.html",
    "book": "book.html",
    // Legacy minimal-chrome versions (kept for backwards compat)
    "join": "membership-join.html",
    "menu": "order-menu.html",
  };
  // Shared CSS file
  app.get("/test-site/styles.css", (_req: Request, res: Response) => {
    try {
      const p = path.resolve(process.cwd(), "server", "templates", "test-site", "styles.css");
      res.setHeader("Content-Type", "text/css; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.send(fs.readFileSync(p, "utf-8"));
    } catch {
      res.status(404).end();
    }
  });
  // Shared JS — embeds booking/membership/order in modals
  app.get("/test-site/embed.js", (_req: Request, res: Response) => {
    try {
      const p = path.resolve(process.cwd(), "server", "templates", "test-site", "embed.js");
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.send(fs.readFileSync(p, "utf-8"));
    } catch {
      res.status(404).end();
    }
  });
  // Page handler — `/test-site` and `/test-site/<page>`
  // 1. Try a built-in static HTML file first (the eight original pages).
  // 2. Otherwise fall through to a DB-backed custom page from the
  //    `marketing_pages` table (the owner's page-builder).
  // Site-wide overrides apply to BOTH paths so logo/colours/nav/footer
  // stay consistent across built-in and custom pages.
  app.get(["/test-site", "/test-site/:page"], async (req: Request, res: Response) => {
    const slug = String(req.params.page ?? "").toLowerCase();
    const file = TEST_SITE_PAGES[slug];
    try {
      const { applyWebContentOverrides, renderCustomPage } = await import("./web-content");
      if (file) {
        const p = path.resolve(process.cwd(), "server", "templates", "test-site", file);
        const raw = fs.readFileSync(p, "utf-8");
        const overrideSlug = slug || "home";
        const finalHtml = await applyWebContentOverrides(overrideSlug, raw);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(finalHtml);
      }
      const { storage } = await import("./storage");
      const customPage = await storage.getMarketingPage(slug);
      if (customPage && !customPage.hidden) {
        const shell = renderCustomPage(customPage);
        const finalHtml = await applyWebContentOverrides(slug, shell);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(finalHtml);
      }
      return res.status(404).send("Page not found");
    } catch {
      res.status(500).send("Page unavailable");
    }
  });

  // Public Wix-migration landing page — `/migrate/:token`
  // Members click this from the migration email to set up their card on Square.
  app.get("/migrate/:token", async (req: Request, res: Response) => {
    try {
      const { storage } = await import("./storage");
      const { renderMigrationLandingPage, renderMigrationErrorPage } = await import("./wix-migration");
      const subs = await storage.getMembershipSubscriptions();
      const sub = subs.find(s => s.migrationToken === req.params.token);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (!sub || !sub.customer || !sub.plan) {
        return res.status(404).send(renderMigrationErrorPage("This link is no longer valid."));
      }
      res.send(renderMigrationLandingPage({
        customer: sub.customer,
        plan: sub.plan,
        sub,
        alreadyDone: !!sub.migrationCompletedAt,
        token: String(req.params.token),
      }));
    } catch {
      res.status(500).send("Page unavailable");
    }
  });

  // SPA catch-all: any non-API, non-static path is an Expo Router client-side route.
  // In development, proxy to Metro (which serves the web bundle). In production, serve
  // the static build's index.html so deep links work.
  if (process.env.NODE_ENV !== "production") {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) return next();
      // Skip native mobile paths
      const platform = req.header("expo-platform");
      if (platform === "ios" || platform === "android") return next();
      // Server-rendered HTML pages registered in registerRoutes() must not be
      // proxied to Metro — Metro would just return the Expo shell, hiding the
      // real dashboard / page content. Keep this list in sync with the
      // `serverPages` Set in the production branch below.
      const devServerPages = new Set([
        "/staff",
        "/membership",
        "/delete-account",
        "/privacy-policy",
        "/terms",
        "/staff-privacy-notice",
        "/booking-widget",
        "/verify-email",
        "/reset-password",
      ]);
      if (devServerPages.has(req.path)) return next();
      // Proxy all other web requests to Metro so Expo Router handles client-side routes
      const proxyReq = http.request(
        {
          hostname: "localhost",
          port: 8081,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: "localhost:8081" },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        },
      );
      proxyReq.on("error", () => {
        if (!res.headersSent) res.status(502).send("Metro bundler not ready");
      });
      req.pipe(proxyReq, { end: true });
    });
  } else {
    // Production: serve static build index.html as SPA fallback.
    // IMPORTANT: skip /api paths and native-app manifest requests, otherwise
    // we'd swallow API calls (registered after this middleware) and Expo Go
    // manifest fetches, returning HTML with 200 OK instead of the real response.
    const indexPath = path.resolve(process.cwd(), "static-build", "index.html");
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (res.headersSent) return next();
      if (req.path.startsWith("/api")) return next();
      const platform = req.header("expo-platform");
      if (platform === "ios" || platform === "android") return next();
      // Server-rendered HTML pages registered later in registerRoutes()
      const serverPages = new Set([
        "/staff",
        "/membership",
        "/delete-account",
        "/privacy-policy",
        "/terms",
        "/staff-privacy-notice",
        "/booking-widget",
        "/verify-email",
        "/reset-password",
      ]);
      if (serverPages.has(req.path)) return next();
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
  }

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  const isProd = process.env.NODE_ENV === "production";
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    // In production, never expose raw error messages (could leak stack/DB info)
    const message = isProd && status >= 500
      ? "An unexpected error occurred. Please try again later."
      : error.message || "Internal Server Error";

    // Always log full error server-side for debugging
    console.error(`[${new Date().toISOString()}] ${status} error:`, err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

// Push a single "happy birthday week" notification per customer per year as
// soon as their 7-day birthday window opens. The window itself is computed
// the same way as in routes.ts (birthdayWindowForYear): starts on the
// customer's birthday at 00:00 local and runs for 7 days. We only push at
// the start of the window — the in-app banner takes care of reminding them
// every time they open the app.
function scheduleBirthdayWeekPushes() {
  async function runBirthdayPushes() {
    try {
      const { storage: store } = await import("./storage");
      const { sendPushToCustomerEmail } = await import("./push");
      const { year, monthDay } = getLondonYearAndMonthDay();

      const due = await store.getCustomersInBirthdayWindow(year, monthDay);
      if (!due.length) return;

      // Look up the current birthday-bonus value so the push can mention it.
      // Fall back to a generic message if loyalty isn't configured.
      let bonusPoints = 0;
      try {
        const raw = await store.getSetting("loyalty.birthdayBonus");
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) bonusPoints = n;
      } catch { /* settings table empty — use generic copy */ }

      for (const customer of due) {
        try {
          const body = bonusPoints > 0
            ? `Happy birthday week from The 147! Open the app to claim your ${bonusPoints}-point birthday bonus.`
            : "Happy birthday week from The 147! Open the app to see your birthday treat.";
          await sendPushToCustomerEmail(customer.email, "Happy birthday! 🎂", body, {
            type: "birthday_week",
          });
          await store.setLastBirthdayPushYear(customer.id, year);
          log(`[Birthday] Sent birthday-week push to customer #${customer.id}`);
        } catch (err) {
          console.error(`[Birthday] Failed for customer #${customer.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[Birthday] Scheduler error:", err);
    }
  }
  // Run once shortly after boot to catch anyone whose birthday window
  // already opened today (handles redeploys mid-day), then schedule the
  // next run for just after London midnight so birthday pushes arrive at
  // 00:00 local on the day the window opens. After the first midnight
  // run, repeat every 24 hours. The per-year marker keeps it idempotent.
  setTimeout(runBirthdayPushes, 60 * 1000);
  setTimeout(() => {
    runBirthdayPushes();
    setInterval(runBirthdayPushes, 24 * 60 * 60 * 1000);
  }, msUntilNextLondonMidnight());
}

// Auto-clear the doublePointsToday flag when the calendar day rolls over.
// Without this, staff could turn double-points on for a Saturday event and
// it would silently stay on indefinitely. Runs every 30 minutes — enough
// resolution to catch any timezone drift around midnight.
function scheduleNightlyBackup() {
  async function runNightly() {
    try {
      const { runBackup } = await import("./backup");
      const { filename, rowCounts } = await runBackup();
      const summary = Object.entries(rowCounts)
        .map(([t, n]) => `${t}:${n}`)
        .join(", ");
      log(`[Backup] Nightly snapshot complete — ${filename} (${summary})`);
    } catch (err: any) {
      console.error("[Backup] Nightly snapshot failed:", err?.message ?? err);
    }
  }
  // First run 2 hours after startup — gives the server time to fully settle
  // after a restart or code deploy before writing a snapshot.
  // Then every 24 hours thereafter.
  setTimeout(runNightly, 2 * 60 * 60 * 1000);
  setInterval(runNightly, 24 * 60 * 60 * 1000);
}

function scheduleDoublePointsDailyReset() {
  // Track the London-local date we last performed the reset check, so each
  // calendar day only triggers one clear. The very first check on startup
  // looks at the date the broadcast marker was last set: if it's an older
  // day than today (or absent), we clear immediately. That handles the
  // "server crashed and restarted next morning with stale flag" case.
  let lastCheckedDate: string | null = null;
  async function maybeReset() {
    try {
      const today = getLondonDateString();
      if (today === lastCheckedDate) return;
      const { storage: store } = await import("./storage");
      const current = await store.getSetting("loyalty.doublePointsToday");
      if (current === "true") {
        const lastBroadcast = await store.getSetting("loyalty.doublePointsLastBroadcastDate");
        if (lastBroadcast !== today) {
          // The flag is on, but it wasn't broadcast today — that means it
          // was set on a previous day (or by the boot-up of an old server)
          // and the calendar has rolled over. Clear it.
          await store.setSetting("loyalty.doublePointsToday", "false");
          log(`[Loyalty] Auto-cleared stale doublePointsToday at start of ${today} (last broadcast: ${lastBroadcast ?? "never"})`);
        }
      }
      lastCheckedDate = today;
    } catch (err) {
      console.error("[Loyalty] Daily reset error:", err);
    }
  }
  // Run immediately on boot, then every 30 minutes — enough resolution to
  // catch the day rollover regardless of when the server happened to start.
  setTimeout(maybeReset, 5 * 1000);
  setInterval(maybeReset, 30 * 60 * 1000);
}

function scheduleBookingReminders() {
  async function runReminders() {
    try {
      const { storage: store } = await import("./storage");
      // Find bookings starting in 55–65 minutes that haven't had a reminder sent yet
      const due = await store.getBookingsDueReminder(55, 65);
      if (!due.length) return;
      for (const booking of due) {
        try {
          const tokens = await store.getPushTokensByEmail(booking.customerEmail);
          if (tokens.length) {
            const tableLabel =
              booking.tableType === "dining"
                ? "dining area"
                : `${booking.tableType} table ${booking.tableNumber ?? ""}`.trim();
            const messages = tokens.map(t => ({
              to: t.token,
              sound: "default" as const,
              title: "Your booking starts soon ⏰",
              body: `Reminder: your ${tableLabel} booking at The 147 starts in about 1 hour (${booking.startTime}).`,
            }));
            await fetch("https://exp.host/--/api/v2/push/send", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify(messages),
            });
          }
          await store.markReminderSent(booking.id);
          log(`[Reminder] Sent push reminder for booking #${booking.id} (${booking.startTime})`);
        } catch (err) {
          console.error(`[Reminder] Failed for booking #${booking.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[Reminder] Scheduler error:", err);
    }
  }
  // Check every 5 minutes
  setInterval(runReminders, 5 * 60 * 1000);
}

async function bootstrapOwner() {
  try {
    const { storage: store } = await import("./storage");
    const allUsers = await store.getAllStaffUsers();
    const hasOwner = allUsers.some(u => u.role === "owner");
    if (!hasOwner) {
      const targets = ["seanclowe", "seanlowe"];
      for (const username of targets) {
        const user = allUsers.find(u => u.username === username);
        if (user) {
          await store.updateStaffRole(username, "owner");
          log(`[Bootstrap] Promoted '${username}' to owner (no owner account existed)`);
        }
      }
    }
  } catch (err) {
    console.error("[Bootstrap] Owner bootstrap error:", err);
  }
}

function scheduleDepositAutoCancel() {
  async function runAutoCancel() {
    try {
      const { storage: store } = await import("./storage");
      const expired = await store.getExpiredPendingDeposits(60);
      if (!expired.length) return;
      for (const booking of expired) {
        try {
          await store.updateBookingStatus(booking.id, "cancelled");
          void store.logBookingAction({
            bookingId: booking.id,
            action: "status_changed",
            staffUsername: "system:deposit-auto-cancel",
            staffId: null,
            fromValue: { status: booking.status },
            toValue: { status: "cancelled" },
            note: "Auto-cancelled — deposit not received within 1 hour",
          });
          log(`[DepositAutoCancel] Cancelled booking #${booking.id} — deposit not received within 1 hour`);

          // Send cancellation email to customer
          const smtpHost = process.env.SMTP_HOST;
          const smtpUser = process.env.SMTP_USER;
          const smtpPass = process.env.SMTP_PASS?.replace(/\s+/g, "");
          const smtpPort = parseInt(process.env.SMTP_PORT || "587");
          if (smtpHost && smtpUser && smtpPass && booking.customerEmail) {
            try {
              const transporter = nodemailer.createTransport({
                host: smtpHost, port: smtpPort, secure: smtpPort === 465,
                auth: { user: smtpUser, pass: smtpPass },
                tls: { rejectUnauthorized: false },
              });
              const dateFormatted = new Date(booking.date + "T12:00:00").toLocaleDateString("en-GB", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
              });
              const ref = "#" + String(booking.id).padStart(4, "0");
              await transporter.sendMail({
                from: `"The 147" <${smtpUser}>`,
                to: booking.customerEmail,
                subject: `Booking ${ref} Cancelled — Deposit Not Received`,
                html: `
                  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
                    <div style="background:#111827;padding:24px 32px;border-radius:8px 8px 0 0">
                      <h1 style="color:#fff;margin:0;font-size:22px">The 147 Bradford</h1>
                    </div>
                    <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
                      <h2 style="margin:0 0 16px;color:#DC2626">Booking Cancelled</h2>
                      <p style="margin:0 0 12px">Hi ${booking.customerName},</p>
                      <p style="margin:0 0 12px">Unfortunately your dining booking <strong>${ref}</strong> for <strong>${dateFormatted}</strong> at <strong>${booking.startTime}</strong> has been automatically cancelled because the £5.00 deposit was not received within 1 hour of booking.</p>
                      <p style="margin:0 0 24px">If you'd still like to dine with us, please visit our website to make a new reservation.</p>
                      <p style="margin:0;color:#6b7280;font-size:13px">The 147 Bradford &bull; Snooker &amp; Dining</p>
                    </div>
                  </div>`,
              });
              log(`[DepositAutoCancel] Cancellation email sent to ${booking.customerEmail} for booking #${booking.id}`);
            } catch (emailErr) {
              console.error(`[DepositAutoCancel] Email failed for booking #${booking.id}:`, emailErr);
            }
          }
        } catch (err) {
          console.error(`[DepositAutoCancel] Failed for booking #${booking.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[DepositAutoCancel] Scheduler error:", err);
    }
  }
  // Check every 30 minutes
  setInterval(runAutoCancel, 30 * 60 * 1000);
}

function scheduleOrderExpiry() {
  async function runExpiry() {
    try {
      const { storage: store } = await import("./storage");
      const expired = await store.expireStaleOrders(30);
      if (expired > 0) {
        log(`[Orders] Expired ${expired} abandoned pending order(s) (no payment after 30 min)`);
      }
    } catch (e: any) {
      log(`[Orders] Expiry job error: ${e.message}`);
    }
  }
  runExpiry();
  setInterval(runExpiry, 15 * 60 * 1000);
}

function scheduleMembershipPaymentReminders() {
  const REMIND_AFTER_HOURS = 24;
  const CANCEL_AFTER_HOURS = 72;
  const SITE_URL = "https://the147bradford.replit.app";

  function buildTransport() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS?.replace(/\s+/g, "");
    const smtpPort = parseInt(process.env.SMTP_PORT || "587");
    if (!smtpHost || !smtpUser || !smtpPass) return null;
    return {
      transporter: nodemailer.createTransport({
        host: smtpHost, port: smtpPort, secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { rejectUnauthorized: false },
      }),
      from: `"The 147" <${smtpUser}>`,
    };
  }

  async function runReminders() {
    try {
      const { storage: store } = await import("./storage");
      const due = await store.getPendingMembershipsNeedingReminder(REMIND_AFTER_HOURS);
      if (!due.length) return;
      const mail = buildTransport();
      for (const sub of due) {
        const customer = sub.customer;
        const plan = sub.plan;
        if (!customer?.email) {
          // Can't email — still mark as reminded so we don't keep retrying
          await store.markMembershipReminderSent(sub.id);
          continue;
        }
        if (mail) {
          try {
            await mail.transporter.sendMail({
              from: mail.from,
              to: customer.email,
              subject: `Finish setting up your ${plan?.name ?? "membership"} at The 147`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
                  <div style="background:#111827;padding:24px 32px;border-radius:8px 8px 0 0">
                    <h1 style="color:#fff;margin:0;font-size:22px">The 147 Bradford</h1>
                  </div>
                  <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
                    <h2 style="margin:0 0 16px">Your membership signup is incomplete</h2>
                    <p style="margin:0 0 12px">Hi ${customer.name},</p>
                    <p style="margin:0 0 12px">We noticed you started signing up for the <strong>${plan?.name ?? "membership"}</strong> plan at The 147 Bradford but didn't finish your payment.</p>
                    <p style="margin:0 0 24px">Tap the button below to complete your signup and start enjoying member benefits:</p>
                    <p style="margin:0 0 24px;text-align:center">
                      <a href="${SITE_URL}/membership" style="display:inline-block;background:#0047AB;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none">Complete My Membership</a>
                    </p>
                    <p style="margin:0 0 12px;color:#6b7280;font-size:13px">If you no longer wish to join, you can ignore this email — your incomplete signup will be cancelled automatically in a couple of days.</p>
                    <p style="margin:24px 0 0;color:#6b7280;font-size:13px">The 147 Bradford &bull; Snooker &amp; Dining</p>
                  </div>
                </div>`,
            });
            log(`[MembershipReminder] Sent payment reminder to ${customer.email} for sub #${sub.id}`);
          } catch (emailErr) {
            console.error(`[MembershipReminder] Email failed for sub #${sub.id}:`, emailErr);
            continue; // don't mark sent — try again next cycle
          }
        }
        await store.markMembershipReminderSent(sub.id);
      }
    } catch (err) {
      console.error("[MembershipReminder] Scheduler error:", err);
    }
  }

  async function runAutoCancel() {
    try {
      const { storage: store } = await import("./storage");
      const stale = await store.getPendingMembershipsToAutoCancel(CANCEL_AFTER_HOURS);
      if (!stale.length) return;
      const mail = buildTransport();
      for (const sub of stale) {
        try {
          await store.updateMembershipSubscription(sub.id, {
            status: "cancelled",
            cancelledAt: new Date(),
            staffNotes: (sub.staffNotes ? sub.staffNotes + "\n" : "") +
              `Auto-cancelled — payment not completed within ${CANCEL_AFTER_HOURS}h of signup.`,
          } as any);
          log(`[MembershipAutoCancel] Cancelled sub #${sub.id} — payment not completed in ${CANCEL_AFTER_HOURS}h`);

          const customer = sub.customer;
          const plan = sub.plan;
          if (mail && customer?.email) {
            try {
              await mail.transporter.sendMail({
                from: mail.from,
                to: customer.email,
                subject: `Your membership signup at The 147 has been cancelled`,
                html: `
                  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
                    <div style="background:#111827;padding:24px 32px;border-radius:8px 8px 0 0">
                      <h1 style="color:#fff;margin:0;font-size:22px">The 147 Bradford</h1>
                    </div>
                    <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
                      <h2 style="margin:0 0 16px;color:#DC2626">Signup Cancelled</h2>
                      <p style="margin:0 0 12px">Hi ${customer.name},</p>
                      <p style="margin:0 0 12px">Your incomplete signup for the <strong>${plan?.name ?? "membership"}</strong> plan has been cancelled because no payment was received.</p>
                      <p style="margin:0 0 24px">No charge has been made. If you'd still like to join, you're welcome to sign up again at any time:</p>
                      <p style="margin:0 0 24px;text-align:center">
                        <a href="${SITE_URL}/membership" style="display:inline-block;background:#0047AB;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none">View Membership Plans</a>
                      </p>
                      <p style="margin:24px 0 0;color:#6b7280;font-size:13px">The 147 Bradford &bull; Snooker &amp; Dining</p>
                    </div>
                  </div>`,
              });
            } catch (emailErr) {
              console.error(`[MembershipAutoCancel] Cancellation email failed for sub #${sub.id}:`, emailErr);
            }
          }
        } catch (err) {
          console.error(`[MembershipAutoCancel] Failed for sub #${sub.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[MembershipAutoCancel] Scheduler error:", err);
    }
  }

  // Run shortly after startup, then on regular intervals
  setTimeout(() => { runReminders(); runAutoCancel(); }, 60 * 1000);
  setInterval(runReminders, 30 * 60 * 1000);   // every 30 min
  setInterval(runAutoCancel, 60 * 60 * 1000);  // every 1 hour
}

function scheduleRetentionCleanup() {
  // Run data retention cleanup immediately on startup, then every 24 hours
  // This ensures the 12-month anonymisation policy and session cleanup run automatically
  async function runCleanup() {
    try {
      const { storage: store } = await import("./storage");
      const anonymized = await store.anonymizeOldBookings(365);
      const hrAnonymized = await store.anonymizeOldHRRecords();
      const sessionsCleared = await store.cleanupExpiredSessions();
      if (anonymized > 0 || hrAnonymized > 0 || sessionsCleared > 0) {
        log(`[GDPR Retention] Booking records: ${anonymized}, HR records: ${hrAnonymized}, sessions cleared: ${sessionsCleared}`);
      }
    } catch (err) {
      console.error("[GDPR Retention] Cleanup error:", err);
    }
  }
  // Run shortly after startup (30 seconds), then every 24 hours
  setTimeout(runCleanup, 30_000);
  setInterval(runCleanup, 24 * 60 * 60 * 1000);
}

(async () => {
  // Write Apple App Store Connect API key from secret to disk (needed for Expo Launch / EAS)
  // The /tmp directory is ephemeral — re-write on every server start so it's always present.
  const ascKeyContent = process.env.ASC_KEY_P8 || '';
  if (ascKeyContent) {
    try {
      const keyId = process.env.EXPO_ASC_KEY_ID || 'PRH75PPG5Z';
      const keyPath = process.env.EXPO_ASC_API_KEY_PATH || `/tmp/AuthKey_${keyId}.p8`;
      const base64 = ascKeyContent
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\s+/g, '');
      const lines = base64.match(/.{1,64}/g) || [];
      const pem = '-----BEGIN PRIVATE KEY-----\n' + lines.join('\n') + '\n-----END PRIVATE KEY-----\n';
      fs.mkdirSync(path.dirname(keyPath), { recursive: true });
      fs.writeFileSync(keyPath, pem, { mode: 0o600 });
      log(`✓ ASC .p8 key written to ${keyPath}`);
    } catch (e) {
      console.warn('⚠ Could not write ASC .p8 key:', e);
    }
  }

  setupCors(app);
  setupSecurityHeaders(app);
  // gzip every JSON / HTML response above ~1KB. Cuts menu, bookings list and
  // customer list payloads by ~70-80% on the wire. `filter` keeps the default
  // (skip already-compressed content like images and existing gzip).
  app.use(compression());
  setupBodyParsing(app);
  setupRequestLogging(app);

  // Widget route — reads fresh from disk on every request so deploys take effect immediately
  const widgetHtmlPath = path.resolve(process.cwd(), "server", "templates", "booking-widget.html");
  app.get("/widget/booking", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.setHeader("Cache-Control", "no-store");
    const html = fs.readFileSync(widgetHtmlPath, "utf-8");
    res.status(200).send(html);
  });

  // Privacy policy — public web page required for App Store listing
  const privacyPolicyHtmlPath = path.resolve(process.cwd(), "server", "templates", "privacy-policy.html");
  const privacyPolicyHtml = fs.readFileSync(privacyPolicyHtmlPath, "utf-8");
  app.get("/privacy-policy", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(privacyPolicyHtml);
  });

  // Terms & Conditions — public web page covering memberships, bookings, gift cards
  const termsHtmlPath = path.resolve(process.cwd(), "server", "templates", "terms-of-service.html");
  const termsHtml = fs.readFileSync(termsHtmlPath, "utf-8");
  app.get("/terms", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(termsHtml);
  });

  // Staff privacy notice — internal page linked from GDPR portal and mobile HR app
  const staffPrivacyHtmlPath = path.resolve(process.cwd(), "server", "templates", "staff-privacy-notice.html");
  const staffPrivacyHtml = fs.readFileSync(staffPrivacyHtmlPath, "utf-8");
  app.get("/staff-privacy-notice", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(staffPrivacyHtml);
  });

  // Fingerprint the freshly-exported web bundle so we can verify after
  // startup that the live site is actually serving THIS build (and not a
  // stale one). In dev there's no static-build to fingerprint — this is a
  // no-op then.
  ensureBuildInfo();

  // Tiny endpoint exposing the on-disk build fingerprint. Used by the
  // post-startup self-check and by scripts/verify-deploy.js.
  app.get("/api/build-info", (_req, res) => {
    const info = getBuildInfo();
    if (!info) {
      return res.status(404).json({ error: "no build info available (dev mode or missing static-build)" });
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(info);
  });

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  // Sentry's Express error handler must come AFTER all routes but BEFORE our
  // own error handler, so it captures unhandled exceptions from any route.
  // No-op when SENTRY_DSN isn't set (the init above didn't run).
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  setupErrorHandler(app);

  // Warn loudly when PUBLIC_APP_URL is not explicitly configured.
  // getPublicAppOrigin() falls back to REPLIT_DOMAINS / REPLIT_DEV_DOMAIN /
  // a hardcoded constant, but in production the explicit env var must be set
  // so that payment redirect URLs and email links always point to the correct
  // origin — a misconfigured or missing value could expose a wrong callback URL.
  if (!process.env.PUBLIC_APP_URL?.trim()) {
    const hasReplitDomains = !!process.env.REPLIT_DOMAINS?.trim() || !!process.env.REPLIT_DEV_DOMAIN?.trim();
    if (!hasReplitDomains) {
      console.warn(
        "[security] PUBLIC_APP_URL is not set and no REPLIT_DOMAINS/REPLIT_DEV_DOMAIN detected. " +
        "Payment redirect URLs and email links will use the hardcoded fallback origin. " +
        "Set PUBLIC_APP_URL=https://your-domain.com in production to prevent this."
      );
    }
  }

  // Open the port immediately so the Replit workflow health check succeeds.
  // Migrations and background tasks run afterwards.
  const port = parseInt(process.env.PORT || "5000", 10);
  await new Promise<void>((resolve) => {
    server.listen(port, "0.0.0.0", () => {
      log(`express server serving on port ${port}`);
      resolve();
    });
  });

  // After the listener is up, verify the live site is serving the freshly-built
  // web bundle. Runs in production only (in dev, Metro serves the bundle and
  // there's nothing static to verify). Fires-and-forgets so it never blocks
  // startup — failures show up as a loud banner in the logs. We always run
  // the verification (even when build info is missing) — a missing/invalid
  // build fingerprint is itself a deploy verification failure that the
  // verifier will report.
  if (process.env.NODE_ENV === "production") {
    setTimeout(() => {
      runDeployVerification({
        localBaseUrl: `http://127.0.0.1:${port}`,
        publicBaseUrl: detectPublicBaseUrl(),
      }).catch((err) => {
        console.error(`[deploy-verify] verification threw: ${err?.message ?? err}`);
      });
    }, 2000);
  }

  // In development, also bind port 8082 (the Replit preview port configured in .replit)
  // so the Replit browser preview and test agent can reach the Express server.
  if (process.env.NODE_ENV !== "production" && port !== 8082) {
    const previewServer = http.createServer(app);
    previewServer.listen(8082, "0.0.0.0", () => {
      log("express also serving on port 8082 (Replit preview)");
    });
  }

  // Apply safe, idempotent schema migrations (adds new columns, seeds required plans)
  await runStartupMigrations();
  // Auto-create Square subscription plans for any paid membership plan missing one.
  // This makes membership purchases bill recurringly instead of as one-off payments.
  try {
    const square = await import("./square");
    const { storage: storeForPlans } = await import("./storage");
    if (square.isConfigured()) {
      const plans = await storeForPlans.getMembershipPlans();
      for (const plan of plans) {
        if (plan.squarePlanVariationId) continue;
        if (!plan.priceMonthly || plan.priceMonthly <= 0) continue;
        try {
          const result = await square.createCatalogSubscriptionPlan({
            localPlanId: plan.id,
            name: plan.name,
            amountPence: plan.priceMonthly,
          });
          await storeForPlans.updateMembershipPlan(plan.id, { squarePlanVariationId: result.squarePlanVariationId });
          log(`[SQUARE BOOT SYNC] Created plan variation for ${plan.name}: ${result.squarePlanVariationId}`);
        } catch (err: any) {
          console.error(`[SQUARE BOOT SYNC] Failed to create plan for ${plan.name}:`, err?.message ?? err);
        }
      }
    }
  } catch (err: any) {
    console.error("[SQUARE BOOT SYNC] Skipped due to error:", err?.message ?? err);
  }
  // Encrypt any existing plaintext PII in customers, contact messages, push tokens, and orders
  const { storage: storeForMigration } = await import("./storage");
  await storeForMigration.migrateEncryptExistingPII();
  // Promote seanclowe/seanlowe to owner if no owner account exists (one-time bootstrap)
  await bootstrapOwner();
  // Automatically enforce GDPR data retention (90-day anonymisation + session cleanup)
  scheduleRetentionCleanup();
  // Send push reminders ~1 hour before bookings
  scheduleBookingReminders();
  // Auto-cancel pending deposit bookings older than 1 hour
  scheduleDepositAutoCancel();
  // Expire abandoned app orders (never paid within 30 minutes)
  scheduleOrderExpiry();
  // Remind pending memberships at 24h and auto-cancel at 72h if payment never completed
  scheduleMembershipPaymentReminders();
  // Push customers a "happy birthday week" notification at the start of their window
  scheduleBirthdayWeekPushes();
  // Auto-clear the doublePointsToday flag overnight so it never lingers past midnight
  scheduleDoublePointsDailyReset();
  scheduleNightlyBackup();
})().catch((err) => {
  console.error("FATAL SERVER ERROR:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});
