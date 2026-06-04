import express from "express";
import { createApp, setupErrorHandler } from "./app";
import { registerRoutes } from "./routes/routes";
import { runStartupMigrations } from "./storage";
import * as fs from "node:fs";
import * as path from "node:path";


// __dirname is injected by the build banner (see build.mjs)
// It resolves to the dist/ directory. Use it to locate source assets.
declare const __dirname: string;

const log = console.log;

// Resolve template paths relative to this file's compiled location (dist/)
// going up one level to the artifact root then into src/templates.
function templatePath(...parts: string[]): string {
  return path.join(__dirname, "..", "src", "templates", ...parts);
}

// ── Venue timezone helpers ──────────────────────────────────────────────────
const VENUE_TZ = "Europe/London";
function getLondonDateString(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VENUE_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function getLondonYearAndMonthDay(): { year: number; monthDay: string } {
  const dateStr = getLondonDateString();
  return { year: parseInt(dateStr.slice(0, 4), 10), monthDay: dateStr.slice(5) };
}
function msUntilNextLondonMidnight(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VENUE_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
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

// ── Scheduled tasks ─────────────────────────────────────────────────────────
function scheduleRetentionCleanup() {
  async function runCleanup() {
    try {
      const { storage: store } = await import("./storage.js");
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
  setTimeout(runCleanup, 30_000);
  setInterval(runCleanup, 24 * 60 * 60 * 1000);
}

function scheduleBookingReminders() {
  async function runReminders() {
    try {
      const { storage: store } = await import("./storage.js");
      const due = await store.getBookingsDueReminder(55, 65);
      if (!due.length) return;
      for (const booking of due) {
        try {
          const tokens = await store.getPushTokensByEmail(booking.customerEmail);
          if (tokens.length) {
            const tableLabel = booking.tableType === "dining"
              ? "dining area"
              : `${booking.tableType} table ${booking.tableNumber ?? ""}`.trim();
            const messages = tokens.map((t: any) => ({
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
        } catch (err) {
          console.error(`[Reminder] Failed for booking #${booking.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[Reminder] Scheduler error:", err);
    }
  }
  setInterval(runReminders, 5 * 60 * 1000);
}

function scheduleDepositAutoCancel() {
  async function runAutoCancel() {
    try {
      const { storage: store } = await import("./storage.js");
      const expired = await store.getExpiredPendingDeposits(60);
      if (!expired.length) return;
      for (const booking of expired) {
        try {
          await store.updateBookingStatus(booking.id, "cancelled");
          log(`[DepositAutoCancel] Cancelled booking #${booking.id}`);
        } catch (err) {
          console.error(`[DepositAutoCancel] Failed for booking #${booking.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[DepositAutoCancel] Scheduler error:", err);
    }
  }
  setInterval(runAutoCancel, 30 * 60 * 1000);
}

function scheduleOrderExpiry() {
  async function runExpiry() {
    try {
      const { storage: store } = await import("./storage.js");
      const expired = await store.expireStaleOrders(30);
      if (expired > 0) {
        log(`[Orders] Expired ${expired} abandoned pending order(s)`);
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
  async function runReminders() {
    try {
      const { storage: store } = await import("./storage.js");
      const due = await store.getPendingMembershipsNeedingReminder(REMIND_AFTER_HOURS);
      for (const sub of due) {
        try {
          await store.markMembershipReminderSent(sub.id);
        } catch (err) {
          console.error(`[MembershipReminder] Failed for sub #${sub.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[MembershipReminder] Scheduler error:", err);
    }
  }
  async function runAutoCancel() {
    try {
      const { storage: store } = await import("./storage.js");
      const stale = await store.getPendingMembershipsToAutoCancel(CANCEL_AFTER_HOURS);
      for (const sub of stale) {
        try {
          await store.updateMembershipSubscription(sub.id, {
            status: "cancelled",
            cancelledAt: new Date(),
            staffNotes: (sub.staffNotes ? sub.staffNotes + "\n" : "") +
              `Auto-cancelled — payment not completed within ${CANCEL_AFTER_HOURS}h of signup.`,
          } as any);
        } catch (err) {
          console.error(`[MembershipAutoCancel] Failed for sub #${sub.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[MembershipAutoCancel] Scheduler error:", err);
    }
  }
  setTimeout(() => { runReminders(); runAutoCancel(); }, 60 * 1000);
  setInterval(runReminders, 30 * 60 * 1000);
  setInterval(runAutoCancel, 60 * 60 * 1000);
}

function scheduleBirthdayWeekPushes() {
  async function runBirthdayPushes() {
    try {
      const { storage: store } = await import("./storage.js");
      const { sendPushToCustomerEmail } = await import("./push.js");
      const { year, monthDay } = getLondonYearAndMonthDay();
      const due = await store.getCustomersInBirthdayWindow(year, monthDay);
      if (!due.length) return;
      let bonusPoints = 0;
      try {
        const raw = await store.getSetting("loyalty.birthdayBonus");
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) bonusPoints = n;
      } catch { /* ignore */ }
      for (const customer of due) {
        try {
          const body = bonusPoints > 0
            ? `Happy birthday week from The 147! Open the app to claim your ${bonusPoints}-point birthday bonus.`
            : "Happy birthday week from The 147! Open the app to see your birthday treat.";
          await sendPushToCustomerEmail(customer.email, "Happy birthday! 🎂", body, { type: "birthday_week" });
          await store.setLastBirthdayPushYear(customer.id, year);
        } catch (err) {
          console.error(`[Birthday] Failed for customer #${customer.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[Birthday] Scheduler error:", err);
    }
  }
  setTimeout(runBirthdayPushes, 60 * 1000);
  setTimeout(() => {
    runBirthdayPushes();
    setInterval(runBirthdayPushes, 24 * 60 * 60 * 1000);
  }, msUntilNextLondonMidnight());
}

function scheduleDoublePointsDailyReset() {
  let lastCheckedDate: string | null = null;
  async function maybeReset() {
    try {
      const today = getLondonDateString();
      if (today === lastCheckedDate) return;
      const { storage: store } = await import("./storage.js");
      const current = await store.getSetting("loyalty.doublePointsToday");
      if (current === "true") {
        const lastBroadcast = await store.getSetting("loyalty.doublePointsLastBroadcastDate");
        if (lastBroadcast !== today) {
          await store.setSetting("loyalty.doublePointsToday", "false");
          log(`[Loyalty] Auto-cleared stale doublePointsToday at start of ${today}`);
        }
      }
      lastCheckedDate = today;
    } catch (err) {
      console.error("[Loyalty] Daily reset error:", err);
    }
  }
  setTimeout(maybeReset, 5 * 1000);
  setInterval(maybeReset, 30 * 60 * 1000);
}

function scheduleNightlyBackup() {
  async function runNightly() {
    try {
      const { runBackup } = await import("./backup.js");
      const { filename, rowCounts } = await runBackup();
      const summary = Object.entries(rowCounts).map(([t, n]) => `${t}:${n}`).join(", ");
      log(`[Backup] Nightly snapshot complete — ${filename} (${summary})`);
    } catch (err: any) {
      console.error("[Backup] Nightly snapshot failed:", err?.message ?? err);
    }
  }
  setTimeout(runNightly, 2 * 60 * 60 * 1000);
  setInterval(runNightly, 24 * 60 * 60 * 1000);
}

async function bootstrapOwner() {
  try {
    const { storage: store } = await import("./storage.js");
    const allUsers = await store.getAllStaffUsers();
    const hasOwner = allUsers.some((u: any) => u.role === "owner");
    if (!hasOwner) {
      const targets = ["seanclowe", "seanlowe"];
      for (const username of targets) {
        const user = allUsers.find((u: any) => u.username === username);
        if (user) {
          await store.updateStaffRole(username, "owner");
          log(`[Bootstrap] Promoted '${username}' to owner`);
        }
      }
    }
  } catch (err) {
    console.error("[Bootstrap] Owner bootstrap error:", err);
  }
}

// ── Main startup ─────────────────────────────────────────────────────────────
(async () => {
  // Write Apple App Store Connect API key from secret to disk if present
  const ascKeyContent = process.env.ASC_KEY_P8 || "";
  if (ascKeyContent) {
    try {
      const keyId = process.env.EXPO_ASC_KEY_ID || "PRH75PPG5Z";
      const keyPath = process.env.EXPO_ASC_API_KEY_PATH || `/tmp/AuthKey_${keyId}.p8`;
      const base64 = ascKeyContent
        .replace(/-----BEGIN PRIVATE KEY-----/g, "")
        .replace(/-----END PRIVATE KEY-----/g, "")
        .replace(/\s+/g, "");
      const lines = base64.match(/.{1,64}/g) || [];
      const pem = "-----BEGIN PRIVATE KEY-----\n" + lines.join("\n") + "\n-----END PRIVATE KEY-----\n";
      fs.mkdirSync(path.dirname(keyPath), { recursive: true });
      fs.writeFileSync(keyPath, pem, { mode: 0o600 });
      log(`✓ ASC .p8 key written to ${keyPath}`);
    } catch (e) {
      console.warn("⚠ Could not write ASC .p8 key:", e);
    }
  }

  const app = createApp();

  // Widget route — reads fresh from disk on every request
  const widgetHtmlPath = templatePath("booking-widget.html");
  if (fs.existsSync(widgetHtmlPath)) {
    app.get("/widget/booking", (_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("X-Frame-Options", "ALLOWALL");
      res.setHeader("Content-Security-Policy", "frame-ancestors *");
      res.setHeader("Cache-Control", "no-store");
      const html = fs.readFileSync(widgetHtmlPath, "utf-8");
      res.status(200).send(html);
    });
  }

  // Privacy policy
  const privacyPolicyHtmlPath = templatePath("privacy-policy.html");
  if (fs.existsSync(privacyPolicyHtmlPath)) {
    const privacyPolicyHtml = fs.readFileSync(privacyPolicyHtmlPath, "utf-8");
    app.get("/privacy-policy", (_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(privacyPolicyHtml);
    });
  }

  // Terms & Conditions
  const termsHtmlPath = templatePath("terms-of-service.html");
  if (fs.existsSync(termsHtmlPath)) {
    const termsHtml = fs.readFileSync(termsHtmlPath, "utf-8");
    app.get("/terms", (_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(termsHtml);
    });
  }

  // Staff privacy notice
  const staffPrivacyHtmlPath = templatePath("staff-privacy-notice.html");
  if (fs.existsSync(staffPrivacyHtmlPath)) {
    const staffPrivacyHtml = fs.readFileSync(staffPrivacyHtmlPath, "utf-8");
    app.get("/staff-privacy-notice", (_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(staffPrivacyHtml);
    });
  }

  // Static assets / uploads
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use("/uploads", express.static(uploadsDir));

  // Register all API routes from the original server
  const server = await registerRoutes(app);


  // Error handler (must be last)
  setupErrorHandler(app);

  const rawPort = process.env["PORT"];
  if (!rawPort) {
    throw new Error("PORT environment variable is required but was not provided.");
  }
  const port = Number(rawPort);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  await new Promise<void>((resolve) => {
    server.listen(port, "0.0.0.0", () => {
      log(`express server serving on port ${port}`);
      resolve();
    });
  });

  // Run startup migrations and background tasks
  await runStartupMigrations();

  // Auto-create Square subscription plans if needed
  try {
    const square = await import("./square.js");
    const { storage: storeForPlans } = await import("./storage.js");
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

  // Encrypt any existing plaintext PII
  const { storage: storeForMigration } = await import("./storage.js");
  await storeForMigration.migrateEncryptExistingPII();

  // Bootstrap owner account
  await bootstrapOwner();

  // Schedule recurring tasks
  scheduleRetentionCleanup();
  scheduleBookingReminders();
  scheduleDepositAutoCancel();
  scheduleOrderExpiry();
  scheduleMembershipPaymentReminders();
  scheduleBirthdayWeekPushes();
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
