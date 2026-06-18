import express, { type Express, type Request, type Response, type NextFunction } from "express";
import compression from "compression";

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

export function createApp(): Express {
  const app = express();
  app.set("trust proxy", 1);

  // CORS
  app.use((req: Request, res: Response, next: NextFunction) => {
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
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");
    const isPublicBookingRoute =
      (req.path === "/api/bookings" && req.method === "POST") ||
      req.path === "/api/bookings/availability" ||
      req.method === "OPTIONS";
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
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

  // Security headers
  app.disable("x-powered-by");
  const isProd = process.env.NODE_ENV === "production";
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    if (isProd) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    const devConnectSrc = isProd ? null : "*";
    if (req.path === "/staff" || req.path.startsWith("/staff-portal") || req.path.startsWith("/admin-") || req.path.startsWith("/staff-")) {
      res.setHeader("X-Frame-Options", "DENY");
      const connectSrc = devConnectSrc ?? "'self' https://api.stripe.com https://m.stripe.com https://m.stripe.network https://pci-connect.squareup.com https://pci-connect.squareupsandbox.com https://connect.squareup.com https://connect.squareupsandbox.com https://o160250.ingest.sentry.io";
      res.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://m.stripe.network https://web.squarecdn.com https://sandbox.web.squarecdn.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://web.squarecdn.com https://sandbox.web.squarecdn.com; font-src 'self' data: https://fonts.gstatic.com https://square-fonts-production-f.squarecdn.com https://d1g145x70srn7h.cloudfront.net; connect-src ${connectSrc}; img-src 'self' data: blob: https:; frame-src https://js.stripe.com https://hooks.stripe.com https://*.ticketsource.co.uk https://*.ticketsource.com https://web.squarecdn.com https://sandbox.web.squarecdn.com; frame-ancestors 'none'`);
    } else if (req.path === "/widget/booking") {
      res.removeHeader("X-Frame-Options");
      res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors *");
    } else if (!req.path.startsWith("/api")) {
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      const genericConnectSrc = devConnectSrc ?? "'self' https://*.squareup.com https://*.squarecdn.com https://*.resend.com https://api.stripe.com https://m.stripe.com https://m.stripe.network";
      res.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://js.stripe.com https://m.stripe.network https://web.squarecdn.com https://sandbox.web.squarecdn.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://web.squarecdn.com https://sandbox.web.squarecdn.com; font-src 'self' data: https://fonts.gstatic.com https://square-fonts-production-f.squarecdn.com https://d1g145x70srn7h.cloudfront.net; connect-src ${genericConnectSrc}; img-src 'self' data: https:; frame-src 'self' https://www.the147order.co.uk https://the147order.co.uk https://js.stripe.com https://hooks.stripe.com https://web.squarecdn.com https://sandbox.web.squarecdn.com`);
    } else {
      res.setHeader("X-Frame-Options", "DENY");
    }
    if (req.path === "/test-site" || req.path.startsWith("/test-site/")) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }
    if (!req.path.startsWith("/api")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
    }
    next();
  });

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({
    limit: "100kb",
    verify: (req: any, _res: Response, buf: Buffer) => {
      req.rawBody = buf;
    },
  }));
  app.use(express.urlencoded({ extended: false }));

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const reqPath = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;
    const originalResJson = res.json.bind(res);
    res.json = function (bodyJson: any) {
      capturedJsonResponse = bodyJson;
      return originalResJson(bodyJson);
    };
    res.on("finish", () => {
      if (!reqPath.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && res.statusCode >= 400) {
        const safe = redactSensitive(capturedJsonResponse);
        const snippet = JSON.stringify(safe);
        logLine += ` :: ${snippet.length > 120 ? snippet.slice(0, 119) + "…" : snippet}`;
      }
      console.log(logLine);
    });
    next();
  });

  return app;
}

export function setupErrorHandler(app: Express) {
  const isProd = process.env.NODE_ENV === "production";
  // @ts-ignore — Express 5 error handler signature
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as { status?: number; statusCode?: number; message?: string };
    const status = error.status || error.statusCode || 500;
    const message = isProd && status >= 500
      ? "An unexpected error occurred. Please try again later."
      : error.message || "Internal Server Error";
    console.error(`[${new Date().toISOString()}] ${status} error:`, err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
