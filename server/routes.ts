import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { randomBytes, timingSafeEqual, createHash, createHmac } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import multer from "multer";
import sharp from "sharp";
import nodemailer from "nodemailer";
import { storage, db } from "./storage";
import { insertOfferSchema, insertPushTokenSchema, insertBookingSchema, insertContactMessageSchema, insertEventSchema, insertBannerImageSchema, isSafePublicUrl, tabs, tabItems, bookings as bookingsTable, tableSessions } from "@shared/schema";
import type { InsertBannerImage } from "@shared/schema";
import { and as dAnd, eq as dEq, desc as dDesc } from "drizzle-orm";
import { getServerFeatureFlags } from "./featureFlags";
import { hashPin, verifyPin, hashPassword, verifyPassword, hashEmail } from "./encryption";
import * as square from "./square";
import { buildReorderPayload, type ReorderMenuItem, type ReorderRawItem } from "./reorder-matching";

// ── Square POS → Live Tables sync helpers ───────────────────────────────────
// Parses a Square ticket name like "Snooker 4" / "Pool 2" / "Dining 7" into a
// (tableType, tableNumber) pair. Tolerates extra whitespace, casing, and a
// missing space (e.g. "snooker4"). Returns null for tickets that don't match
// the convention so non-table orders (online orders, takeaway, etc.) are
// ignored.
function parseTicketName(raw: string | null | undefined): { tableType: string; tableNumber: string } | null {
  if (!raw) return null;
  const m = /^\s*(snooker|pool|dining)\s*(\d{1,3})\s*$/i.exec(raw);
  if (!m) return null;
  return { tableType: m[1].toLowerCase(), tableNumber: m[2] };
}

// Mirror a single Square order into the table_sessions table. Idempotent —
// safe to call from a webhook AND from the safety-net poll.
async function syncSquareOrderToSession(order: any): Promise<void> {
  const orderId: string | undefined = order?.id;
  if (!orderId) return;
  const ticketName: string = order.ticket_name || order.name || "";
  const parsed = parseTicketName(ticketName);
  const sqState: string = order.state || "";
  const totalPence = Number(order.total_money?.amount ?? order.net_amounts?.total_money?.amount ?? 0);
  const itemCount = Array.isArray(order.line_items) ? order.line_items.length : 0;
  const state = sqState === "COMPLETED" ? "paid" : sqState === "CANCELED" ? "cancelled" : "open";
  const closedAt = state !== "open" ? new Date(order.closed_at || order.updated_at || Date.now()) : null;

  const existing = await db.select().from(tableSessions).where(dEq(tableSessions.squareOrderId, orderId));
  if (existing.length === 0 && !parsed) return;

  const values = {
    squareOrderId: orderId,
    ticketName: ticketName || null,
    tableType: parsed?.tableType ?? existing[0]?.tableType ?? null,
    tableNumber: parsed?.tableNumber ?? existing[0]?.tableNumber ?? null,
    state,
    totalPence: Number.isFinite(totalPence) ? totalPence : 0,
    itemCount,
    closedAt: closedAt ?? existing[0]?.closedAt ?? null,
    lastSyncedAt: new Date(),
  };

  if (existing.length > 0) {
    if (existing[0].state !== "open" && state === "open") return;
    await db.update(tableSessions).set(values).where(dEq(tableSessions.squareOrderId, orderId));
  } else {
    await db.insert(tableSessions).values(values);
  }
}

// Safety-net poll: every 60 seconds, query Square for OPEN orders and
// reconcile. Catches the case where a webhook is missed (e.g. transient
// network blip). Marks any local "open" session whose Square order is no
// longer OPEN as paid (Square is the source of truth).
async function pollSquareOrders(): Promise<void> {
  if (!square.isConfigured()) return;
  try {
    const orders = await square.searchOpenOrders();
    const liveOrderIds = new Set<string>();
    for (const o of orders) {
      liveOrderIds.add(o.id);
      await syncSquareOrderToSession(o).catch(() => {});
    }
    // Reconcile: any "open" session in our DB that isn't in Square's OPEN
    // list anymore has been settled or voided — re-fetch each to find out.
    const localOpen = await db.select().from(tableSessions).where(dEq(tableSessions.state, "open"));
    for (const s of localOpen) {
      if (liveOrderIds.has(s.squareOrderId)) continue;
      const fresh = await square.getOrder(s.squareOrderId).catch(() => null);
      if (fresh) await syncSquareOrderToSession(fresh).catch(() => {});
    }
  } catch (err: any) {
    // Don't spam logs if Square is unreachable
    if (err?.code !== "UNAUTHORIZED") {
      console.warn("[POS-POLL]", err?.message || err);
    }
  }
}
import { fetchTicketSourceEvents, type AppEvent } from "./ticketsource";
import { isStripeConfigured, getStripeClient, getPublishableKey } from "./stripe";
import { countWorkingDays, calculateLeaveYearBounds, calculateProRataEntitlement, applyCarryOverCap, getEnglandWalesBankHolidays } from "./uk-leave-utils";

function tsIdToNumber(tsId: string): number {
  let hash = 5381;
  for (let i = 0; i < tsId.length; i++) {
    hash = ((hash << 5) + hash) + tsId.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) + 1_000_000;
}

function mapTsEvent(e: AppEvent) {
  return {
    id: tsIdToNumber(e.id),
    title: e.title,
    description: e.description || null,
    date: e.date || null,
    time: e.time || null,
    endTime: e.endTime || null,
    ticketUrl: e.ticketUrl || null,
    imageColor: "#0047AB",
    imageUrl: e.imageUrl || null,
    active: true,
    eventType: "event",
    dayOfWeek: null,
    isSoldOut: e.isSoldOut,
    capacity: e.capacity,
    availableCapacity: e.availableCapacity,
    createdAt: new Date(),
    source: "ticketsource",
  };
}

const uploadsDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP and GIF images are allowed"));
    }
  },
});

// ── HTML escaping for email templates ──────────────────────────────────────────
function escHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── Simple in-memory rate limiter ─────────────────────────────────────────────
interface RateEntry { count: number; windowStart: number; }
const rateLimitStore = new Map<string, RateEntry>();
function checkRateLimit(
  key: string, maxRequests: number, windowMs: number
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key) || { count: 0, windowStart: now };
  if (now - entry.windowStart > windowMs) {
    // Reset window
    entry.count = 1;
    entry.windowStart = now;
    rateLimitStore.set(key, entry);
    return { allowed: true, retryAfter: 0 };
  }
  entry.count++;
  rateLimitStore.set(key, entry);
  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((windowMs - (now - entry.windowStart)) / 1000);
    return { allowed: false, retryAfter };
  }
  return { allowed: true, retryAfter: 0 };
}
// Clean up rate limit store every 15 minutes to prevent memory leaks
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [k, v] of rateLimitStore) {
    if (v.windowStart < cutoff) rateLimitStore.delete(k);
  }
}, 15 * 60 * 1000);

const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;
const ATTEMPT_WINDOW = 10 * 60 * 1000;

// Rate limiter for sensitive/GDPR endpoints — 10 requests per 15 minutes per IP
const sensitiveEndpointAttempts = new Map<string, { count: number; resetAt: number }>();
const SENSITIVE_RATE_LIMIT = 10;

// In-memory store for pending deletion confirmation tokens (email-ownership verification)
// token → { email, expiresAt }  — tokens expire after 1 hour
const pendingDeletionTokens = new Map<string, { email: string; expiresAt: number }>();
// Rate-limit for the public deletion request endpoint — max 3 requests per hour per IP
const deletionRequestAttempts = new Map<string, { count: number; resetAt: number }>();
const DELETION_REQUEST_LIMIT = 3;
const DELETION_REQUEST_WINDOW = 60 * 60 * 1000;
const SENSITIVE_RATE_WINDOW = 15 * 60 * 1000;
function checkSensitiveRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = sensitiveEndpointAttempts.get(ip);
  if (!record || now > record.resetAt) {
    sensitiveEndpointAttempts.set(ip, { count: 1, resetAt: now + SENSITIVE_RATE_WINDOW });
    return true;
  }
  if (record.count >= SENSITIVE_RATE_LIMIT) return false;
  record.count++;
  return true;
}

const loyaltyOtps = new Map<string, { code: string; phone: string; expiresAt: number; attempts: number }>();
const loyaltySessions = new Map<string, { phone: string; expiresAt: number }>();
const OTP_EXPIRY = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 3;
const LOYALTY_SESSION_EXPIRY = 30 * 24 * 60 * 60 * 1000;

function generateOtp(): string {
  const bytes = randomBytes(3);
  const num = (bytes[0] * 65536 + bytes[1] * 256 + bytes[2]) % 1000000;
  return num.toString().padStart(6, "0");
}

// Mask email addresses in logs to protect customer privacy
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.length > 2 ? local[0] + local[1] : local[0];
  return `${visible}***@${domain}`;
}

function cleanupExpiredOtps(): void {
  const now = Date.now();
  for (const [key, val] of loyaltyOtps) {
    if (val.expiresAt <= now) loyaltyOtps.delete(key);
  }
}

function cleanupExpiredLoyaltySessions(): void {
  const now = Date.now();
  for (const [key, val] of loyaltySessions) {
    if (val.expiresAt <= now) loyaltySessions.delete(key);
  }
}

function validateLoyaltySession(token: string): string | null {
  const session = loyaltySessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    loyaltySessions.delete(token);
    return null;
  }
  return session.phone;
}

const OTP_HTML = (code: string) => `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
  <h2 style="color: #0A1628; margin-bottom: 8px;">The 147 Loyalty</h2>
  <p style="color: #555; font-size: 15px;">Your verification code is:</p>
  <div style="background: #F5F5F5; border-radius: 12px; padding: 24px; text-align: center; margin: 20px 0;">
    <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #0047AB;">${code}</span>
  </div>
  <p style="color: #555; font-size: 14px;">This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="color: #999; font-size: 12px;">The 147 &mdash; Snooker, Bar &amp; Restaurant</p>
</div>`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function isValidCssColor(color: unknown): color is string {
  if (typeof color !== "string") return false;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}

const PAYMENT_RECEIPT_HTML = (p: {
  amountPence: number;
  description: string;
  customerName: string;
  last4: string;
  brand: string;
  receiptNumber: string;
  dateStr: string;
}) => {
  const amount = "£" + (p.amountPence / 100).toFixed(2);
  const brandLabel = p.brand.charAt(0).toUpperCase() + p.brand.slice(1);
  return `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #ffffff;">
    <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #0047AB;">
      <h1 style="color: #0A1628; margin: 0; font-size: 24px;">The 147 Bradford</h1>
      <p style="color: #6B7280; margin: 4px 0 0; font-size: 13px;">Snooker, Bar &amp; Restaurant</p>
    </div>
    <h2 style="color: #1A1A2E; font-size: 20px; margin-top: 28px;">Payment receipt</h2>
    <p style="color: #555; font-size: 15px; line-height: 1.5;">Hi ${escapeHtml(p.customerName)},</p>
    <p style="color: #555; font-size: 15px; line-height: 1.5;">Thank you for your payment. Here are the details:</p>
    <div style="background: #F8F9FB; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 15px; color: #1A1A2E;">
        <tr><td style="padding: 6px 0; color: #6B7280;">Amount paid</td><td style="padding: 6px 0; text-align: right; font-weight: 700; font-size: 20px; color: #0047AB;">${amount}</td></tr>
        <tr><td style="padding: 6px 0; color: #6B7280;">For</td><td style="padding: 6px 0; text-align: right;">${escapeHtml(p.description)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6B7280;">Date</td><td style="padding: 6px 0; text-align: right;">${escapeHtml(p.dateStr)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6B7280;">Card</td><td style="padding: 6px 0; text-align: right;">${escapeHtml(brandLabel)} •••• ${escapeHtml(p.last4)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6B7280;">Receipt no.</td><td style="padding: 6px 0; text-align: right; font-family: monospace; font-size: 13px;">${escapeHtml(p.receiptNumber)}</td></tr>
      </table>
    </div>
    <p style="color: #555; font-size: 14px; line-height: 1.5;">If you have any questions about this payment, just reply to this email and our team will be happy to help.</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 28px 0;" />
    <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">The 147 Bradford &mdash; Snooker, Bar &amp; Restaurant<br />This is an automated receipt. Please keep it for your records.</p>
  </div>`;
};

async function sendEmailViaSMTP(to: string, subject: string, html: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  // Google App Passwords are shown with spaces but work with or without — strip them to be safe
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");
  const port = parseInt(process.env.SMTP_PORT || "587");
  if (!host || !user || !pass) return false;
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: true },
    });
    // Public-facing "from" address shown in the customer's inbox. Gmail still
    // authenticates as `user` (bookings@the147.co.uk) but the visible sender
    // is the friendlier Info@the147.co.uk — set via PUBLIC_FROM_EMAIL so we
    // can change it without a redeploy.
    const publicFrom = process.env.PUBLIC_FROM_EMAIL || user;
    await transporter.sendMail({ from: `"The 147" <${publicFrom}>`, to, subject, html, replyTo: publicFrom });
    console.log(`[EMAIL SMTP] Sent to ${maskEmail(to)}`);
    return true;
  } catch (err) {
    console.error("[EMAIL SMTP] Error:", err);
    return false;
  }
}

// Send the Wix → Square migration email to a single member.
// Returns success/message; updates migrationEmailedAt on success.
async function sendMigrationEmail(subId: number, req: Request): Promise<{ success: boolean; message?: string }> {
  const { buildMigrationEmail, makeMigrationToken } = await import("./wix-migration");
  const subs = await storage.getMembershipSubscriptions();
  const sub = subs.find(s => s.id === subId);
  if (!sub || !sub.customer || !sub.plan) return { success: false, message: "Member not found" };
  if (!sub.customer.email) return { success: false, message: "No email on file" };
  // Issue a token if missing (e.g. legacy import)
  let token = sub.migrationToken;
  if (!token) {
    token = makeMigrationToken();
    await storage.updateMembershipSubscription(sub.id, { migrationToken: token } as any);
  }
  // Build the migration link from the trusted configured origin, NOT from
  // request headers — Host / X-Forwarded-Proto are attacker-controllable
  // and an emailed link with a poisoned domain would be a phishing vector.
  const migrateUrl = `${getPublicAppOrigin()}/migrate/${token}`;
  const { subject, html } = buildMigrationEmail({ name: sub.customer.name, plan: sub.plan, migrateUrl });
  const sent = await sendEmailViaSMTP(sub.customer.email, subject, html);
  if (!sent) return { success: false, message: "SMTP not configured or send failed" };
  await storage.updateMembershipSubscription(sub.id, { migrationEmailedAt: new Date() } as any);
  return { success: true };
}

async function sendOtpEmail(email: string, code: string): Promise<boolean> {
  const subject = "Your Loyalty Verification Code — The 147";
  const html = OTP_HTML(code);
  const resendKey = process.env.RESEND_API_KEY;

  // SMTP first — works with Gmail/Outlook without any domain verification
  const smtpSent = await sendEmailViaSMTP(email, subject, html);
  if (smtpSent) return true;

  // Resend fallback (requires verified domain for non-owner addresses)
  if (resendKey) {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const fromName = process.env.RESEND_FROM_NAME || "The 147";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: email, subject, html }),
      });
      if (response.ok) {
        console.log(`[LOYALTY OTP] Email sent via Resend to ${maskEmail(email)}`);
        return true;
      }
      const errorText = await response.text();
      console.warn(`[LOYALTY OTP] Resend also failed (${response.status}): ${errorText}`);
    } catch (err) {
      console.warn("[LOYALTY OTP] Resend exception:", err);
    }
  }

  // Both failed — log code so staff can manually provide it
  console.warn(`[LOYALTY OTP] All email methods failed for ${maskEmail(email)} — OTP not delivered`);
  return false;
}

async function sendDepositLinkEmail(booking: {
  customerName: string;
  customerEmail: string;
  guestCount: number;
  date: string;
  startTime: string;
  id: number;
  depositPaymentUrl: string;
}): Promise<boolean> {
  const dateObj = new Date(booking.date + "T00:00:00");
  const dateFormatted = dateObj.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const bookingRef = `147-${booking.id.toString().padStart(5, "0")}`;
  const subject = `Deposit Required – Dining Booking ${bookingRef} on ${dateFormatted}`;

  const html = `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #ffffff;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #0A1628; font-size: 24px; margin: 0;">The 147</h1>
      <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0;">Snooker, Bar &amp; Restaurant</p>
    </div>
    <div style="background: #FFF7E6; border: 1.5px solid #FCD34D; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 28px;">💳</span>
      <h2 style="color: #92400E; font-size: 18px; margin: 8px 0 0;">Deposit Required</h2>
    </div>
    <p style="color: #374151; font-size: 15px;">Hi ${escHtml(booking.customerName)},</p>
    <p style="color: #374151; font-size: 15px;">Thank you for your dining booking at The 147 for <strong>${booking.guestCount} guests</strong> on ${escHtml(dateFormatted)} at ${escHtml(booking.startTime)}.</p>
    <p style="color: #374151; font-size: 15px;">A <strong>£5.00 deposit</strong> is required to confirm your booking. Please click the button below to pay securely.</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${booking.depositPaymentUrl}" style="display: inline-block; background: #16A34A; color: #fff; font-size: 16px; font-weight: 700; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Pay £5.00 Deposit →</a>
    </div>
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Booking Ref</td><td style="padding: 8px 0; color: #0047AB; font-size: 15px; font-weight: 700; text-align: right;">${escHtml(bookingRef)}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Date</td><td style="padding: 8px 0; color: #0A1628; font-size: 14px; font-weight: 600; text-align: right;">${escHtml(dateFormatted)}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Time</td><td style="padding: 8px 0; color: #0A1628; font-size: 14px; font-weight: 600; text-align: right;">${escHtml(booking.startTime)}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Guests</td><td style="padding: 8px 0; color: #0A1628; font-size: 14px; font-weight: 600; text-align: right;">${booking.guestCount} guests</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Deposit</td><td style="padding: 8px 0; color: #D97706; font-size: 14px; font-weight: 700; text-align: right;">£5.00 due</td></tr>
      </table>
    </div>
    <p style="color: #374151; font-size: 13px; line-height: 1.6;">Your booking will be confirmed once the deposit is received. If you have any questions, please contact us.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 12px; text-align: center;">The 147 &mdash; Snooker, Bar &amp; Restaurant<br/>www.the147.co.uk</p>
  </div>`;

  const smtpSent = await sendEmailViaSMTP(booking.customerEmail, subject, html);
  if (smtpSent) {
    console.log(`[BOOKING] Deposit link email sent via SMTP to ${maskEmail(booking.customerEmail)} for booking #${booking.id}`);
    return true;
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const fromName = process.env.RESEND_FROM_NAME || "The 147";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: booking.customerEmail, subject, html }),
      });
      if (response.ok) return true;
    } catch (_) {}
  }
  console.warn(`[BOOKING] Deposit link email failed for booking #${booking.id}`);
  return false;
}

function getPublicAppOrigin(): string {
  // Trusted origin for email links — must NOT be derived from request headers
  // (Host header is attacker-controllable and would let us mint phishing links).
  const fromEnv = process.env.PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  // In a deployed Replit, REPLIT_DOMAINS is a comma-separated list with the
  // primary custom domain first. Prefer that over the dev preview domain.
  const replitDomains = process.env.REPLIT_DOMAINS?.trim();
  if (replitDomains) {
    const primary = replitDomains.split(",")[0].trim();
    if (primary) return `https://${primary}`;
  }
  const devDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (devDomain) return `https://${devDomain}`;
  return "https://the147bradford.replit.app";
}

function buildVerifyUrl(tokenRaw: string): string {
  return `${getPublicAppOrigin()}/verify-email?token=${encodeURIComponent(tokenRaw)}`;
}

async function sendVerificationEmail(opts: { name: string; email: string; tokenRaw: string }): Promise<boolean> {
  const verifyUrl = buildVerifyUrl(opts.tokenRaw);
  const subject = "Confirm your email — The 147";
  const html = `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #ffffff;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #0A1628; font-size: 24px; margin: 0;">The 147</h1>
      <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0;">Snooker, Bar &amp; Restaurant</p>
    </div>
    <div style="background: #EFF6FF; border: 1.5px solid #BFDBFE; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 28px;">✉️</span>
      <h2 style="color: #1E40AF; font-size: 18px; margin: 8px 0 0;">Confirm your email address</h2>
    </div>
    <p style="color: #374151; font-size: 15px;">Hi ${escHtml(opts.name)},</p>
    <p style="color: #374151; font-size: 15px;">Thanks for creating your account at The 147. Please confirm your email address so we can keep your account secure and let you recover bookings or your membership if you ever lose access.</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${verifyUrl}" style="display: inline-block; background: #0047AB; color: #fff; font-size: 16px; font-weight: 700; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Confirm Email →</a>
    </div>
    <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">Or paste this link into your browser:<br/><span style="word-break: break-all; color: #0047AB;">${escHtml(verifyUrl)}</span></p>
    <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">This link expires in 7 days. You can keep using your account and bookings without verifying — but recovery features need a confirmed email.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 12px; text-align: center;">If you didn't create an account at The 147, you can safely ignore this email.</p>
  </div>`;
  const sent = await sendEmailViaSMTP(opts.email, subject, html);
  if (sent) {
    console.log(`[VERIFY EMAIL] Sent via SMTP to ${maskEmail(opts.email)}`);
    return true;
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const fromName = process.env.RESEND_FROM_NAME || "The 147";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: opts.email, subject, html }),
      });
      if (response.ok) {
        console.log(`[VERIFY EMAIL] Sent via Resend to ${maskEmail(opts.email)}`);
        return true;
      }
    } catch (_) {}
  }
  console.warn(`[VERIFY EMAIL] Failed to send to ${maskEmail(opts.email)}`);
  return false;
}

async function sendPasswordResetEmail(opts: { name: string; email: string; tokenRaw: string }): Promise<boolean> {
  const resetUrl = `${getPublicAppOrigin()}/reset-password?token=${encodeURIComponent(opts.tokenRaw)}`;
  const subject = "Reset your password — The 147";
  const html = `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #ffffff;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #0A1628; font-size: 24px; margin: 0;">The 147</h1>
      <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0;">Snooker, Bar &amp; Restaurant</p>
    </div>
    <div style="background: #EFF6FF; border: 1.5px solid #BFDBFE; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 28px;">🔑</span>
      <h2 style="color: #1E40AF; font-size: 18px; margin: 8px 0 0;">Reset your password</h2>
    </div>
    <p style="color: #374151; font-size: 15px;">Hi ${escHtml(opts.name)},</p>
    <p style="color: #374151; font-size: 15px;">We received a request to reset the password on your The 147 account. Click the button below to choose a new password.</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${resetUrl}" style="display: inline-block; background: #0047AB; color: #fff; font-size: 16px; font-weight: 700; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Reset Password →</a>
    </div>
    <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">Or paste this link into your browser:<br/><span style="word-break: break-all; color: #0047AB;">${escHtml(resetUrl)}</span></p>
    <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 12px; text-align: center;">The 147 &mdash; Snooker, Bar &amp; Restaurant</p>
  </div>`;
  const sent = await sendEmailViaSMTP(opts.email, subject, html);
  if (sent) {
    console.log(`[RESET EMAIL] Sent via SMTP to ${maskEmail(opts.email)}`);
    return true;
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const fromName = process.env.RESEND_FROM_NAME || "The 147";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: opts.email, subject, html }),
      });
      if (response.ok) {
        console.log(`[RESET EMAIL] Sent via Resend to ${maskEmail(opts.email)}`);
        return true;
      }
    } catch (_) {}
  }
  console.warn(`[RESET EMAIL] Failed to send to ${maskEmail(opts.email)}`);
  return false;
}

function renderResetPasswordPage(opts: { token: string; error?: string; success?: boolean }): string {
  const { token, error, success } = opts;
  if (success) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Password updated — The 147</title><style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#F2F5FA;color:#0D1526;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#fff;border-radius:24px;max-width:480px;width:100%;padding:40px 32px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.08)}
.ring{width:80px;height:80px;border-radius:50%;background:#DCFCE7;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
h1{font-size:24px;font-weight:800;color:#0A1628;margin-bottom:12px}
p{color:#4B5A72;font-size:15px;line-height:1.6;margin-bottom:24px}
a.btn{display:inline-block;background:#0047AB;color:#fff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:12px;text-decoration:none}
</style></head><body><div class="card"><div class="ring"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#16A34A" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></div><h1>Password updated</h1><p>Your password has been reset. You can now sign in with your new password.</p><a class="btn" href="/membership">Back to The 147</a></div></body></html>`;
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Reset password — The 147</title><style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#F2F5FA;color:#0D1526;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#fff;border-radius:24px;max-width:440px;width:100%;padding:36px 28px;box-shadow:0 8px 32px rgba(0,0,0,.08)}
h1{font-size:22px;font-weight:800;color:#0A1628;margin-bottom:8px;text-align:center}
.sub{color:#4B5A72;font-size:14px;line-height:1.5;margin-bottom:24px;text-align:center}
label{display:block;font-size:13px;font-weight:600;color:#0A1628;margin-bottom:6px}
input{width:100%;padding:12px 14px;border:1.5px solid #D6DCEA;border-radius:10px;font-size:15px;margin-bottom:16px}
input:focus{outline:none;border-color:#0047AB}
button{width:100%;background:#0047AB;color:#fff;font-weight:700;font-size:15px;padding:13px;border:0;border-radius:12px;cursor:pointer}
button:disabled{opacity:.6;cursor:not-allowed}
.err{background:#FEE2E2;border:1px solid #FCA5A5;color:#B91C1C;padding:10px 12px;border-radius:10px;font-size:13px;margin-bottom:16px;display:${error?'block':'none'}}
</style></head><body><div class="card">
<h1>Choose a new password</h1>
<p class="sub">Enter a new password for your The 147 account. It must be at least 6 characters.</p>
<div class="err" id="err">${escHtml(error||'')}</div>
<form id="rf" onsubmit="return false;">
  <label>New password</label>
  <input type="password" id="p1" autocomplete="new-password" placeholder="Min. 6 characters" minlength="6" required>
  <label>Confirm new password</label>
  <input type="password" id="p2" autocomplete="new-password" placeholder="Re-enter password" minlength="6" required>
  <button type="submit" id="b">Update password</button>
</form>
<script>
const tok=${JSON.stringify(token)};
const err=document.getElementById('err');
const btn=document.getElementById('b');
document.getElementById('rf').addEventListener('submit',async()=>{
  const p1=document.getElementById('p1').value;
  const p2=document.getElementById('p2').value;
  err.style.display='none';
  if(p1.length<6){err.textContent='Password must be at least 6 characters.';err.style.display='block';return;}
  if(p1!==p2){err.textContent='Passwords do not match.';err.style.display='block';return;}
  btn.disabled=true;btn.textContent='Updating…';
  try{
    const r=await fetch('/api/customers/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:tok,password:p1})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){err.textContent=d.message||'Could not reset password.';err.style.display='block';btn.disabled=false;btn.textContent='Update password';return;}
    window.location.href='/reset-password?done=1';
  }catch{err.textContent='Network error — please try again.';err.style.display='block';btn.disabled=false;btn.textContent='Update password';}
});
</script>
</div></body></html>`;
}

function renderVerifyResultPage(kind: "success" | "error", message: string): string {
  const isSuccess = kind === "success";
  const accent = isSuccess ? "#16A34A" : "#DC2626";
  const bg = isSuccess ? "#DCFCE7" : "#FEE2E2";
  const icon = isSuccess
    ? `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="${accent}" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="${accent}" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  const title = isSuccess ? "Email verified" : "We couldn't verify that link";
  const appScheme = "the147://";
  const websiteUrl = "https://www.the147.co.uk";
  // On phones, attempt to deep-link into the installed app; if it isn't installed
  // (no scheme handler), fall back to the public website. On desktop/tablet,
  // always go straight to the website.
  const redirectScript = isSuccess ? `<script>(function(){
    try {
      var ua = navigator.userAgent || "";
      var isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
      var btn = document.getElementById("openBtn");
      if (!btn) return;
      if (isMobile) {
        btn.textContent = "Open the app";
        btn.setAttribute("href", ${JSON.stringify(appScheme)});
        btn.addEventListener("click", function(e){
          // Try to launch the app, fall back to the website after ~1.5s if the
          // page is still visible (i.e. the app didn't take over).
          var fallback = setTimeout(function(){
            if (!document.hidden) window.location.href = ${JSON.stringify(websiteUrl)};
          }, 1500);
          document.addEventListener("visibilitychange", function once(){
            if (document.hidden) {
              clearTimeout(fallback);
              document.removeEventListener("visibilitychange", once);
            }
          });
        });
      } else {
        btn.textContent = "Visit www.the147.co.uk";
        btn.setAttribute("href", ${JSON.stringify(websiteUrl)});
      }
    } catch (e) {}
  })();</script>` : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escHtml(title)} — The 147</title><style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#F2F5FA;color:#0D1526;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border-radius:24px;max-width:480px;width:100%;padding:40px 32px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.08)}
  .ring{width:80px;height:80px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
  h1{font-size:24px;font-weight:800;color:#0A1628;margin-bottom:12px}
  p{color:#4B5A72;font-size:15px;line-height:1.6;margin-bottom:24px}
  a.btn{display:inline-block;background:#0047AB;color:#fff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:12px;text-decoration:none}
  .brand{margin-top:24px;font-size:12px;color:#8EA0BB}
  </style></head><body><div class="card"><div class="ring">${icon}</div><h1>${escHtml(title)}</h1><p>${escHtml(message)}</p><a id="openBtn" class="btn" href="${websiteUrl}">Visit www.the147.co.uk</a><div class="brand">The 147 — Snooker, Bar &amp; Restaurant</div></div>${redirectScript}</body></html>`;
}

async function sendMembershipPaymentLinkEmail(opts: {
  customerName: string;
  customerEmail: string;
  planName: string;
  priceMonthly: number;
  paymentUrl: string;
}): Promise<boolean> {
  const price = `£${(opts.priceMonthly / 100).toFixed(2)}`;
  const subject = `Your ${opts.planName} Membership — Payment Required`;
  const html = `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #ffffff;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #0A1628; font-size: 24px; margin: 0;">The 147</h1>
      <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0;">Snooker, Bar &amp; Restaurant</p>
    </div>
    <div style="background: #EFF6FF; border: 1.5px solid #BFDBFE; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 28px;">🎱</span>
      <h2 style="color: #1E40AF; font-size: 18px; margin: 8px 0 0;">${escHtml(opts.planName)} Membership</h2>
    </div>
    <p style="color: #374151; font-size: 15px;">Hi ${escHtml(opts.customerName)},</p>
    <p style="color: #374151; font-size: 15px;">Welcome to The 147! Your <strong>${escHtml(opts.planName)} Membership</strong> has been set up by our team.</p>
    <p style="color: #374151; font-size: 15px;">To activate your membership, please complete your first payment of <strong>${price}/month</strong> using the secure link below.</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${opts.paymentUrl}" style="display: inline-block; background: #0047AB; color: #fff; font-size: 16px; font-weight: 700; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Pay ${price} &amp; Activate →</a>
    </div>
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Membership</td><td style="padding: 8px 0; color: #0A1628; font-size: 14px; font-weight: 700; text-align: right;">${escHtml(opts.planName)}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Monthly Price</td><td style="padding: 8px 0; color: #0047AB; font-size: 14px; font-weight: 700; text-align: right;">${price}/month</td></tr>
      </table>
    </div>
    <p style="color: #374151; font-size: 13px; line-height: 1.6;">Your membership will be activated as soon as payment is received. If you have any questions please don't hesitate to get in touch.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 12px; text-align: center;">The 147 &mdash; Snooker, Bar &amp; Restaurant<br/>www.the147.co.uk</p>
  </div>`;

  const smtpSent = await sendEmailViaSMTP(opts.customerEmail, subject, html);
  if (smtpSent) {
    console.log(`[MEMBERSHIP] Payment link email sent via SMTP to ${maskEmail(opts.customerEmail)}`);
    return true;
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const fromName = process.env.RESEND_FROM_NAME || "The 147";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: opts.customerEmail, subject, html }),
      });
      if (response.ok) {
        console.log(`[MEMBERSHIP] Payment link email sent via Resend to ${maskEmail(opts.customerEmail)}`);
        return true;
      }
    } catch (_) {}
  }
  console.warn(`[MEMBERSHIP] Payment link email failed for ${maskEmail(opts.customerEmail)}`);
  return false;
}

async function sendBookingConfirmationEmail(booking: {
  customerName: string;
  customerEmail: string;
  tableType: string;
  tableNumber?: string | null;
  date: string;
  startTime: string;
  duration: number;
  id: number;
}): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;

  const tableNames: Record<string, string> = {
    snooker: "Snooker Table",
    pool: "Pool Table",
    "american-pool": "American Pool Table",
    darts: "Darts Lane",
    shuffleboard: "Shuffleboard",
  };
  const tableName = tableNames[booking.tableType] || booking.tableType;
  const tableDisplay = booking.tableNumber
    ? `${tableName} #${booking.tableNumber}`
    : tableName;

  const dateObj = new Date(booking.date + "T00:00:00");
  const dateFormatted = dateObj.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const endHour = parseInt(booking.startTime.split(":")[0]) + booking.duration;
  const endTime = `${endHour.toString().padStart(2, "0")}:00`;
  const durationLabel = booking.duration === 1 ? "1 hour" : `${booking.duration} hours`;
  const bookingRef = `147-${booking.id.toString().padStart(5, "0")}`;

  const html = `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #ffffff;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #0A1628; font-size: 24px; margin: 0;">The 147</h1>
      <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0;">Snooker, Bar &amp; Restaurant</p>
    </div>
    <div style="background: #dcfce7; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 28px;">&#10003;</span>
      <h2 style="color: #16A34A; font-size: 18px; margin: 8px 0 0;">Booking Confirmed</h2>
    </div>
    <p style="color: #374151; font-size: 15px;">Hi ${escHtml(booking.customerName)},</p>
    <p style="color: #374151; font-size: 15px;">Your booking at The 147 has been confirmed. Here are your details:</p>
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Booking Ref</td><td style="padding: 8px 0; color: #0047AB; font-size: 15px; font-weight: 700; text-align: right;">${escHtml(bookingRef)}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Table</td><td style="padding: 8px 0; color: #0A1628; font-size: 14px; font-weight: 600; text-align: right;">${escHtml(tableDisplay)}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Date</td><td style="padding: 8px 0; color: #0A1628; font-size: 14px; font-weight: 600; text-align: right;">${escHtml(dateFormatted)}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Time</td><td style="padding: 8px 0; color: #0A1628; font-size: 14px; font-weight: 600; text-align: right;">${escHtml(booking.startTime)} - ${escHtml(endTime)} (${escHtml(durationLabel)})</td></tr>
      </table>
    </div>
    <p style="color: #374151; font-size: 14px;">Please arrive 5 minutes before your slot. If you need to cancel or change your booking, please contact us.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 12px; text-align: center;">The 147 &mdash; Snooker, Bar &amp; Restaurant<br/>www.the147.co.uk</p>
  </div>`;

  const subject = `Booking Confirmed - ${tableDisplay} on ${dateFormatted}`;

  // SMTP first — works with Gmail/Outlook without any domain verification
  const smtpSent = await sendEmailViaSMTP(booking.customerEmail, subject, html);
  if (smtpSent) {
    console.log(`[BOOKING] Confirmation email sent via SMTP to ${maskEmail(booking.customerEmail)} for booking #${booking.id}`);
    return true;
  }

  // Resend fallback (requires verified domain for non-owner addresses)
  if (resendKey) {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const fromName = process.env.RESEND_FROM_NAME || "The 147";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: booking.customerEmail, subject, html }),
      });
      if (response.ok) {
        console.log(`[BOOKING] Confirmation email sent via Resend to ${maskEmail(booking.customerEmail)} for booking #${booking.id}`);
        return true;
      }
      console.warn("[BOOKING] Resend also failed:", await response.text());
    } catch (err) {
      console.warn("[BOOKING] Resend exception:", err);
    }
  }

  console.warn(`[BOOKING] Confirmation email could not be sent for booking #${booking.id} to ${maskEmail(booking.customerEmail)}`);
  return false;
}

async function sendBookingCancellationEmail(booking: {
  customerName: string;
  customerEmail: string;
  date: string;
  startTime: string;
  duration: number;
  tableType: string;
  tableNumber?: string;
  id: number;
}): Promise<boolean> {
  const tableLabels: Record<string, string> = { snooker: "Snooker Table", pool: "Pool Table", dining: "Dining Table" };
  const tableLabel = tableLabels[booking.tableType] ?? booking.tableType;
  const tableNum = booking.tableNumber ? ` #${booking.tableNumber}` : "";
  const [dy, dm, dd] = booking.date.split("-").map(Number);
  const dateObj = new Date(dy, dm - 1, dd);
  const dateStr = dateObj.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const [sh, sm] = booking.startTime.split(":").map(Number);
  const endMins = sh * 60 + sm + booking.duration * 60;
  const endTime = `${Math.floor(endMins / 60).toString().padStart(2, "0")}:${(endMins % 60).toString().padStart(2, "0")}`;

  const subject = `Booking Cancelled – The 147`;
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f9f9f9;padding:32px;border-radius:12px">
    <h2 style="color:#1a1a2e;margin-bottom:4px">Booking Cancelled</h2>
    <p style="color:#555;margin-top:0">Hi ${booking.customerName}, your booking has been cancelled.</p>
    <div style="background:#fff;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #DC2626">
      <p style="margin:0 0 8px 0"><strong>${tableLabel}${tableNum}</strong></p>
      <p style="margin:0 0 4px 0;color:#555">${dateStr}</p>
      <p style="margin:0;color:#555">${booking.startTime} – ${endTime} (${booking.duration} hour${booking.duration > 1 ? "s" : ""})</p>
    </div>
    <p style="color:#555;font-size:13px">If you'd like to make a new booking, you can do so through the app at any time.</p>
    <p style="color:#888;font-size:12px;margin-top:24px">The 147 Bradford · Snooker &amp; Pool Club</p>
  </div>`;

  const smtpSent = await sendEmailViaSMTP(booking.customerEmail, subject, html);
  if (smtpSent) return true;
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const fromName = "The 147 Bradford";
      const fromEmail = process.env.RESEND_FROM_EMAIL || "bookings@the147bradford.com";
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: booking.customerEmail, subject, html }),
      });
      if (response.ok) return true;
    } catch (_) {}
  }
  return false;
}

async function sendBookingRescheduleEmail(booking: {
  customerName: string;
  customerEmail: string;
  date: string;
  startTime: string;
  duration: number;
  tableType: string;
  tableNumber?: string | null;
  id: number;
}): Promise<boolean> {
  const tableLabels: Record<string, string> = {
    snooker: "Snooker Table",
    pool: "Pool Table",
    "american-pool": "American Pool Table",
    darts: "Darts Lane",
    shuffleboard: "Shuffleboard",
    dining: "Dining Table",
  };
  const tableLabel = tableLabels[booking.tableType] ?? booking.tableType;
  const tableNum = booking.tableNumber ? ` #${booking.tableNumber}` : "";
  const tableDisplay = `${tableLabel}${tableNum}`;
  const [dy, dm, dd] = booking.date.split("-").map(Number);
  const dateObj = new Date(dy, dm - 1, dd);
  const dateStr = dateObj.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const [sh, sm] = booking.startTime.split(":").map(Number);
  const endMins = sh * 60 + sm + booking.duration * 60;
  const endTime = `${Math.floor(endMins / 60).toString().padStart(2, "0")}:${(endMins % 60).toString().padStart(2, "0")}`;
  const durationLabel = booking.duration === 1 ? "1 hour" : `${booking.duration} hours`;
  const bookingRef = `147-${booking.id.toString().padStart(5, "0")}`;

  const subject = `Booking Rescheduled – ${tableDisplay} on ${dateStr}`;
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f9f9f9;padding:32px;border-radius:12px">
    <div style="text-align:center;margin-bottom:24px">
      <h1 style="color:#0A1628;font-size:24px;margin:0">The 147</h1>
      <p style="color:#6b7280;font-size:13px;margin:4px 0 0">Snooker, Bar &amp; Restaurant</p>
    </div>
    <div style="background:#dbeafe;border-radius:12px;padding:16px;text-align:center;margin-bottom:24px">
      <span style="font-size:28px">&#128197;</span>
      <h2 style="color:#0047AB;font-size:18px;margin:8px 0 0">Booking Rescheduled</h2>
    </div>
    <p style="color:#374151;font-size:15px">Hi ${escHtml(booking.customerName)},</p>
    <p style="color:#374151;font-size:15px">Your booking at The 147 has been rescheduled. Here are your updated details:</p>
    <div style="background:#fff;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #0047AB">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600">Booking Ref</td><td style="padding:8px 0;color:#0047AB;font-size:15px;font-weight:700;text-align:right">${escHtml(bookingRef)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600">Table</td><td style="padding:8px 0;color:#0A1628;font-size:14px;font-weight:600;text-align:right">${escHtml(tableDisplay)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600">New Date</td><td style="padding:8px 0;color:#0A1628;font-size:14px;font-weight:600;text-align:right">${escHtml(dateStr)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600">New Time</td><td style="padding:8px 0;color:#0A1628;font-size:14px;font-weight:600;text-align:right">${escHtml(booking.startTime)} – ${escHtml(endTime)} (${escHtml(durationLabel)})</td></tr>
      </table>
    </div>
    <p style="color:#374151;font-size:14px">Please arrive 5 minutes before your slot. If you need to cancel or change your booking again, you can do so through the app.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
    <p style="color:#9ca3af;font-size:12px;text-align:center">The 147 &mdash; Snooker, Bar &amp; Restaurant<br/>www.the147.co.uk</p>
  </div>`;

  const smtpSent = await sendEmailViaSMTP(booking.customerEmail, subject, html);
  if (smtpSent) {
    console.log(`[BOOKING] Reschedule email sent via SMTP to ${maskEmail(booking.customerEmail)} for booking #${booking.id}`);
    return true;
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const fromName = process.env.RESEND_FROM_NAME || "The 147";
      const fromEmail = process.env.RESEND_FROM_EMAIL || "bookings@the147bradford.com";
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: booking.customerEmail, subject, html }),
      });
      if (response.ok) {
        console.log(`[BOOKING] Reschedule email sent via Resend to ${maskEmail(booking.customerEmail)} for booking #${booking.id}`);
        return true;
      }
    } catch (_) {}
  }
  console.warn(`[BOOKING] Reschedule email could not be sent for booking #${booking.id} to ${maskEmail(booking.customerEmail)}`);
  return false;
}

function getClientIp(req: Request): string {
  return req.ip || "unknown";
}

function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const entry = loginAttempts.get(ip);
  if (!entry) return { allowed: true };
  if (entry.blockedUntil > Date.now()) {
    return { allowed: false, retryAfter: Math.ceil((entry.blockedUntil - Date.now()) / 1000) };
  }
  if (entry.blockedUntil > 0 && entry.blockedUntil <= Date.now()) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordFailedLogin(ip: string): void {
  const entry = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.blockedUntil = Date.now() + LOCKOUT_DURATION;
    entry.count = 0;
  }
  loginAttempts.set(ip, entry);
  setTimeout(() => {
    const current = loginAttempts.get(ip);
    if (current && current.blockedUntil === 0) {
      loginAttempts.delete(ip);
    }
  }, ATTEMPT_WINDOW);
}

function clearFailedLogins(ip: string): void {
  loginAttempts.delete(ip);
}

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a.padEnd(64, "\0"));
  const bufB = Buffer.from(b.padEnd(64, "\0"));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Paths we deliberately exclude from the generic staff action audit log because
// they are read-only/heartbeat checks (verify) or generate one entry per page
// load (logout) — keeping them out keeps the audit table focused on real
// state-changing actions.
const AUDIT_SKIP_PATHS = new Set<string>([
  "/api/staff/verify",
  "/api/staff/logout",
]);

// Field names whose values must NEVER be persisted in the audit log.
const SENSITIVE_BODY_KEYS = new Set<string>([
  "password", "currentpassword", "newpassword", "oldpassword",
  "pin", "currentpin", "newpin", "oldpin",
  "token", "accesstoken", "refreshtoken", "sessiontoken", "csrftoken", "verificationtoken",
  "secret", "apikey", "key",
  "otp", "code", "authcode", "verificationcode",
  "signature", "sourceid", "nonce",
  "cardnumber", "cvv", "cvc", "cardcvv",
]);

function sanitizeBodyForAudit(body: unknown): unknown {
  if (body === null || body === undefined) return body;
  if (typeof body !== "object") return body;
  if (Array.isArray(body)) return body.map((v) => sanitizeBodyForAudit(v));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_BODY_KEYS.has(k.toLowerCase())) {
      out[k] = "[REDACTED]";
    } else if (typeof v === "object") {
      out[k] = sanitizeBodyForAudit(v);
    } else if (typeof v === "string" && v.length > 1000) {
      out[k] = v.slice(0, 1000) + "...(truncated)";
    } else {
      out[k] = v;
    }
  }
  return out;
}

function attachStaffActionAudit(req: Request, res: Response): void {
  // Skip read-only requests and heartbeat endpoints.
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  if (AUDIT_SKIP_PATHS.has(req.path)) return;

  const startedAt = Date.now();
  res.on("finish", () => {
    try {
      // Skip 401 (unauth) — request didn't actually do anything. Log everything
      // else (2xx success, 4xx client error like 403/404/409, 5xx server error)
      // so attempted-but-blocked actions are still visible to managers.
      if (res.statusCode === 401) return;

      const username = (req as any).staffUsername as string | null;
      const user = (req as any).staffUser as { id?: number } | null;
      const role = (req as any).staffRole as string | undefined;
      // Without an authenticated staff session we have no actor to attribute
      // the action to — skip rather than write a misleading row.
      if (!username || !role) return;

      let bodyJson: string | null = null;
      try {
        const sanitized = sanitizeBodyForAudit(req.body);
        if (sanitized !== undefined) {
          const s = JSON.stringify(sanitized);
          if (s && s !== "{}" && s !== "null") {
            bodyJson = s.length > 4000 ? s.slice(0, 4000) + "...(truncated)" : s;
          }
        }
      } catch {
        bodyJson = null;
      }

      const xff = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
      const ip = xff || req.ip || (req.socket as any)?.remoteAddress || null;
      const ua = (req.headers["user-agent"] as string | undefined) || null;

      void storage.logStaffAction({
        staffUsername: username,
        staffId: user?.id ?? null,
        staffRole: role,
        method: req.method,
        path: req.originalUrl.split("?")[0].slice(0, 500),
        route: req.route?.path ? String(req.route.path).slice(0, 500) : null,
        statusCode: res.statusCode,
        requestBody: bodyJson,
        ipAddress: ip ? String(ip).slice(0, 64) : null,
        userAgent: ua ? ua.slice(0, 500) : null,
      });
      // Latency is not stored, but we read startedAt to keep the closure honest
      // and allow future metric collection without changing this signature.
      void startedAt;
    } catch (err) {
      console.error("[staff-audit] hook failed:", err);
    }
  });
}

async function staffAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const token = authHeader.slice(7);
  if (token.length < 32 || token.length > 128) {
    return res.status(401).json({ message: "Invalid session" });
  }
  const session = await storage.validateStaffSession(token);
  if (!session) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
  if (session.staffUsername) {
    const user = await storage.getStaffUserByUsername(session.staffUsername);
    // Re-check the underlying account every request so locked/rejected/deleted
    // staff are kicked out immediately rather than waiting for token expiry.
    if (!user) {
      await storage.invalidateStaffSession(token).catch(() => undefined);
      return res.status(401).json({ message: "Account no longer exists" });
    }
    if (user.active === false) {
      await storage.invalidateStaffSessionsByUserId(user.id).catch(() => undefined);
      return res.status(401).json({ message: "Account is locked" });
    }
    if (user.approvalStatus === "rejected" || user.approvalStatus === "pending") {
      await storage.invalidateStaffSessionsByUserId(user.id).catch(() => undefined);
      return res.status(401).json({ message: "Account is not approved" });
    }
    // Block sessions that still require a forced password change from reaching
    // any route other than the three needed to complete the password-change
    // flow. This enforces the credential-rotation control server-side so that
    // callers cannot bypass it by skipping the client UI and calling APIs
    // directly with the bearer token.
    if (user.mustChangePassword === true) {
      const allowedPaths = ["/api/staff/set-password", "/api/staff/logout", "/api/staff/verify"];
      if (!allowedPaths.includes(req.path)) {
        return res.status(403).json({
          mustChangePassword: true,
          message: "You must set a new password before accessing the application.",
        });
      }
    }
    (req as any).staffRole = user.role || "staff";
    (req as any).staffUsername = session.staffUsername;
    (req as any).staffUser = user;
  } else {
    // Legacy: a small number of pre-existing sessions may still have no
    // staffUsername (created via the old master-PIN-as-manager fallback,
    // which has now been removed). Treat them as the lowest privilege
    // ("staff") so they cannot reach managerAuth/ownerAuth routes; they
    // will fully drop off as the 24h expiry passes.
    (req as any).staffRole = "staff";
    (req as any).staffUsername = null;
    (req as any).staffUser = null;
  }
  // Install the generic staff action audit log hook. Runs once per
  // authenticated staff request; logs on response finish so it captures the
  // actual outcome (status code) without delaying the response.
  attachStaffActionAudit(req, res);
  next();
}

async function managerAuth(req: Request, res: Response, next: NextFunction) {
  const role = (req as any).staffRole;
  if (role !== "manager" && role !== "owner") {
    return res.status(403).json({ message: "Manager access required" });
  }
  next();
}

async function ownerAuth(req: Request, res: Response, next: NextFunction) {
  if ((req as any).staffRole !== "owner") {
    return res.status(403).json({ message: "Owner access required" });
  }
  next();
}

const customerLoginAttempts = new Map<string, { count: number; blockedUntil: number }>();

function checkCustomerRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = customerLoginAttempts.get(ip);
  if (record && record.blockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((record.blockedUntil - now) / 1000) };
  }
  if (record && record.blockedUntil > 0 && record.blockedUntil <= now) {
    customerLoginAttempts.delete(ip);
  }
  return { allowed: true };
}

function recordCustomerLoginFailure(ip: string) {
  const now = Date.now();
  const record = customerLoginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
  record.count++;
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.blockedUntil = now + LOCKOUT_DURATION;
    record.count = 0;
  }
  customerLoginAttempts.set(ip, record);
  setTimeout(() => {
    const current = customerLoginAttempts.get(ip);
    if (current && current.blockedUntil === 0) {
      customerLoginAttempts.delete(ip);
    }
  }, ATTEMPT_WINDOW);
}

async function customerAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const token = authHeader.slice(7);
  if (token.length < 32 || token.length > 128) {
    return res.status(401).json({ message: "Invalid session" });
  }
  const session = await storage.validateCustomerSession(token);
  if (!session) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
  const customer = await storage.getCustomerById(session.customerId);
  if (!customer) {
    return res.status(401).json({ message: "Account not found" });
  }
  if (customer.expiresAt && customer.expiresAt.getTime() < Date.now()) {
    await storage.invalidateCustomerSession(token);
    return res.status(401).json({ message: "This account has expired." });
  }
  (req as any).customerId = customer.id;
  (req as any).customerEmail = customer.email;
  next();
}

type MemberDiscountResult = {
  discountPercent?: number;
  discountLabel?: string;
  excludeWithDeals: boolean;
};

// Resolve a membership discount for an order. The discount is granted only when
// the buyer is signed in and the membership belongs to that signed-in account.
// The form-supplied email is *never* trusted on its own; we always log the
// attempted-vs-applied discount for auditing.
async function resolveMemberDiscountImpl(
  req: Request,
  formCustomer: { email?: string; name?: string } | undefined,
  syncSquareMembership: (customerId: number, email: string) => Promise<void>,
): Promise<MemberDiscountResult> {
  const result: { discountPercent?: number; discountLabel?: string; excludeWithDeals: boolean } =
    { excludeWithDeals: false };

  // Compute the "attempted" discount — what the buyer would have received under
  // the old, email-only lookup. Used for audit logging only.
  const attemptedEmail = (formCustomer?.email || "").toLowerCase().trim();
  let attempted: { percent: number; label: string; customerId: number } | null = null;
  if (attemptedEmail) {
    try {
      const cust = await storage.getCustomerByEmail(attemptedEmail);
      if (cust) {
        const sub = await storage.getMembershipSubscriptionByCustomer(cust.id);
        const isActive = sub?.status === "active";
        const notCancelled = !sub?.cancelledAt;
        const periodValid = !sub?.currentPeriodEnd || new Date(sub.currentPeriodEnd) >= new Date();
        const planActive = sub?.plan !== null;
        const hasDiscount = (sub?.plan?.foodDrinkDiscount ?? 0) > 0;
        if (sub && isActive && notCancelled && periodValid && planActive && hasDiscount) {
          attempted = {
            percent: sub.plan!.foodDrinkDiscount!,
            label: `${sub.plan!.name} Member Discount`,
            customerId: cust.id,
          };
        }
      }
    } catch (err: any) {
      console.warn("[ORDER] Attempted-discount lookup failed:", err.message);
    }
  }

  // Resolve the signed-in customer (if any) from the Authorization header.
  // Auth is *optional* here — guests can still place orders, just without a discount.
  let signedInCustomerId: number | null = null;
  let signedInEmail: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token.length >= 32 && token.length <= 128) {
      try {
        const session = await storage.validateCustomerSession(token);
        if (session) {
          const cust = await storage.getCustomerById(session.customerId);
          if (cust) {
            signedInCustomerId = cust.id;
            signedInEmail = cust.email;
          }
        }
      } catch (err: any) {
        console.warn("[ORDER] Session validation failed:", err.message);
      }
    }
  }

  // Apply discount only if the signed-in account itself owns a valid membership.
  if (signedInCustomerId) {
    try {
      const preSub = await storage.getMembershipSubscriptionByCustomer(signedInCustomerId);
      const needsSync = !preSub || (preSub as any).source === "square_group_sync";
      if (needsSync && signedInEmail) {
        await syncSquareMembership(signedInCustomerId, signedInEmail).catch((e: any) =>
          console.warn("[ORDER] Pre-checkout sync failed:", e.message),
        );
      }
      const sub = await storage.getMembershipSubscriptionByCustomer(signedInCustomerId);
      const isActive = sub?.status === "active";
      const notCancelled = !sub?.cancelledAt;
      const periodValid = !sub?.currentPeriodEnd || new Date(sub.currentPeriodEnd) >= new Date();
      const planActive = sub?.plan !== null;
      const hasDiscount = (sub?.plan?.foodDrinkDiscount ?? 0) > 0;
      if (sub && isActive && notCancelled && periodValid && planActive && hasDiscount) {
        result.discountPercent = sub.plan!.foodDrinkDiscount;
        result.discountLabel = `${sub.plan!.name} Member Discount`;
        result.excludeWithDeals = !!((sub.plan as any)?.excludeWithDeals);
      } else if (sub && isActive && notCancelled && periodValid && !planActive) {
        // Loud warning for the silent-failure mode that bit us in May 2026:
        // a customer has a perfectly valid active subscription (sub.planId is
        // set) but the plan itself was deactivated in the staff portal.
        // getMembershipSubscriptionByCustomer filters the joined plan by
        // active=true and returns it as null, which causes the discount to
        // be silently dropped at every checkout for every member on that
        // plan. Surface it so it shows up in production logs immediately.
        console.warn(
          `[ORDER][AUDIT][PLAN-INACTIVE] Customer #${signedInCustomerId} (${signedInEmail}) ` +
          `has an active subscription on plan #${(sub as any).planId} but that plan is ` +
          `marked inactive in the staff portal — discount NOT applied. ` +
          `Re-activate the plan to restore member pricing.`,
        );
      } else if (sub && isActive && notCancelled && periodValid && planActive && !hasDiscount) {
        console.warn(
          `[ORDER][AUDIT][PLAN-NO-DISCOUNT] Customer #${signedInCustomerId} (${signedInEmail}) ` +
          `is on plan "${sub.plan!.name}" which has foodDrinkDiscount=0 — nothing to apply.`,
        );
      }
    } catch (err: any) {
      console.warn("[ORDER] Could not look up signed-in member discount:", err.message);
    }
  }

  // Audit: attempted vs applied. Flag the suspicious case where someone typed a
  // member's email but is either not signed in or signed in as a different account.
  const appliedSummary = result.discountPercent
    ? `${result.discountPercent}% (${result.discountLabel})`
    : "none";
  if (attempted) {
    const ownsAttempted = signedInCustomerId === attempted.customerId;
    if (!signedInCustomerId) {
      console.warn(
        `[ORDER][AUDIT] Email ${attemptedEmail} would have received ${attempted.percent}% ` +
        `but buyer is a guest. Applied=${appliedSummary}.`,
      );
    } else if (!ownsAttempted) {
      console.warn(
        `[ORDER][AUDIT] Email ${attemptedEmail} would have received ${attempted.percent}% ` +
        `but signed-in account #${signedInCustomerId} (${signedInEmail}) does not own that membership. ` +
        `Applied=${appliedSummary}.`,
      );
    } else {
      console.log(
        `[ORDER][AUDIT] Member discount applied for #${signedInCustomerId} (${signedInEmail}): ${appliedSummary}.`,
      );
    }
  } else if (result.discountPercent) {
    console.log(
      `[ORDER][AUDIT] Member discount applied for #${signedInCustomerId} (${signedInEmail}): ${appliedSummary} ` +
      `(form email: ${attemptedEmail || "none"}).`,
    );
  }

  return result;
}

// Password strength rules: min 10 chars, must contain a letter and a number.
// Returns an error message if invalid, or null if OK.
function validatePasswordStrength(password: string): string | null {
  if (typeof password !== "string") return "Password is required";
  if (password.length < 10) return "Password must be at least 10 characters";
  if (password.length > 200) return "Password is too long";
  if (!/[a-zA-Z]/.test(password)) return "Password must include a letter";
  if (!/\d/.test(password)) return "Password must include a number";
  return null;
}

// Verify a staff credential against either their password (preferred) or their
// legacy numeric PIN (fallback). Used by sensitive in-app actions like refunds
// where staff confirm their identity.
function verifyStaffCredential(
  credential: string,
  user: { passwordHash: string | null; passwordSalt: string | null; pinHash: string | null; pinSalt: string | null }
): boolean {
  if (!credential) return false;
  if (user.passwordHash && user.passwordSalt) {
    if (verifyPassword(credential, user.passwordHash, user.passwordSalt)) return true;
  }
  if (user.pinHash && user.pinSalt && /^\d{4,8}$/.test(credential)) {
    if (verifyPin(credential, user.pinHash, user.pinSalt)) return true;
  }
  return false;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/staff/register", async (req, res) => {
    const clientIp = getClientIp(req);
    const rateCheck = checkLoginRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.setHeader("Retry-After", String(rateCheck.retryAfter));
      return res.status(429).json({
        message: `Too many attempts. Please try again later.`,
      });
    }

    const { masterPin, username, password, pin, displayName, role } = req.body;

    if (!masterPin || !username || (!password && !pin)) {
      return res.status(400).json({ message: "Master PIN, username, and password are required" });
    }

    const staffPin = process.env.STAFF_PIN;
    if (!staffPin) {
      return res.status(503).json({ message: "Staff access not configured" });
    }

    if (!timingSafeCompare(masterPin, staffPin)) {
      recordFailedLogin(clientIp);
      return res.status(401).json({ message: "Invalid master PIN" });
    }

    if (typeof username !== "string" || username.trim().length < 3 || username.trim().length > 30) {
      return res.status(400).json({ message: "Username must be 3-30 characters" });
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(username.trim())) {
      return res.status(400).json({ message: "Username can only contain letters, numbers, dots, hyphens, and underscores" });
    }

    // Prefer password; fall back to legacy PIN if password not supplied (HTML dashboard).
    let pwHash: string | null = null;
    let pwSalt: string | null = null;
    let pinHash: string | null = null;
    let pinSalt: string | null = null;

    if (typeof password === "string" && password.length > 0) {
      const passwordError = validatePasswordStrength(password);
      if (passwordError) {
        return res.status(400).json({ message: passwordError });
      }
      const hashed = hashPassword(password);
      pwHash = hashed.hash;
      pwSalt = hashed.salt;
    } else {
      if (typeof pin !== "string" || pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
        return res.status(400).json({ message: "Password is required (min 10 characters, must include a letter and a number)" });
      }
      const hashed = hashPin(pin);
      pinHash = hashed.hash;
      pinSalt = hashed.salt;
    }

    const existing = await storage.getStaffUserByUsername(username.trim());
    if (existing) {
      return res.status(409).json({ message: "Username already taken" });
    }

    if (role && !["staff", "manager", "owner"].includes(role)) {
      return res.status(400).json({ message: "Role must be 'staff', 'manager', or 'owner'" });
    }

    const assignedRole = role || "staff";
    // Every newly registered account — including plain staff — must be
    // approved by an owner before it can sign in. The shared venue STAFF_PIN
    // is treated as an onboarding aid only, not as a standalone credential
    // that grants access. This prevents anyone who knows (or once knew)
    // the PIN from minting themselves a usable account on demand.
    const staffUser = await storage.createStaffUser({
      username: username.trim(),
      passwordHash: pwHash,
      passwordSalt: pwSalt,
      pinHash,
      pinSalt,
      // Force password setup at first login if they registered with the legacy PIN field.
      mustChangePassword: !pwHash,
      displayName: displayName?.trim() || undefined,
      role: assignedRole,
      approvalStatus: "pending",
    });

    clearFailedLogins(clientIp);
    res.status(201).json({
      message: "Account created and awaiting owner approval before you can sign in.",
      username: staffUser.username,
      displayName: staffUser.displayName,
      role: staffUser.role,
      approvalStatus: staffUser.approvalStatus,
    });
  });

  app.post("/api/staff/login", async (req, res) => {
    const clientIp = getClientIp(req);
    const rateCheck = checkLoginRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.setHeader("Retry-After", String(rateCheck.retryAfter));
      return res.status(429).json({
        message: `Too many login attempts. Please try again in ${Math.ceil((rateCheck.retryAfter || 900) / 60)} minutes.`,
      });
    }

    const { username, pin, password } = req.body;
    // Accept either `password` (new) or `pin` (legacy named-account login).
    const credential: string | undefined =
      typeof password === "string" && password.length > 0
        ? password
        : (typeof pin === "string" ? pin : undefined);

    if (!credential) {
      return res.status(400).json({ message: "Password is required" });
    }

    // Username is now mandatory. The previous "no-username + master PIN ⇒
    // synthetic manager session" fallback was a privilege-escalation path:
    // anyone who knew the venue's onboarding STAFF_PIN could obtain a
    // manager bearer token. Manager access is now only granted to real
    // approved manager/owner accounts that authenticate by username.
    if (!username || typeof username !== "string" || username.trim().length === 0) {
      recordFailedLogin(clientIp);
      return res.status(400).json({ message: "Username and password are required" });
    }

    {
      const staffUser = await storage.getStaffUserByUsername(username.trim());
      if (!staffUser || !staffUser.active) {
        recordFailedLogin(clientIp);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (staffUser.approvalStatus === "pending") {
        return res.status(403).json({ message: "Your account is awaiting approval from an owner. Please contact your manager." });
      }

      if (staffUser.approvalStatus === "rejected") {
        return res.status(403).json({ message: "Your account request was not approved. Please contact your manager." });
      }

      // The147 master/owner account is protected — it keeps its legacy PIN and
      // is never forced into the password flow (set-password is blocked for it).
      const isProtectedLegacy =
        staffUser.username.toLowerCase() === "the147" ||
        (staffUser.displayName || "").toUpperCase().trim() === "THE 147";

      // Try password first if user has one set; fall back to legacy PIN otherwise.
      let mustChangePassword = !isProtectedLegacy && staffUser.mustChangePassword === true;
      let authed = false;

      if (staffUser.passwordHash && staffUser.passwordSalt) {
        if (verifyPassword(credential, staffUser.passwordHash, staffUser.passwordSalt)) {
          authed = true;
        }
      } else if (staffUser.pinHash && staffUser.pinSalt) {
        // Legacy account — accept the credential against the stored PIN hash
        // regardless of format. The hash check itself is the authority; the
        // earlier digit-only regex was a sanity filter, not a security gate,
        // and was confusing legitimate users who typed their PIN into the
        // password field. A wrong guess (numeric or otherwise) still fails
        // the constant-time hash comparison and returns "Invalid credentials".
        if (verifyPin(credential, staffUser.pinHash, staffUser.pinSalt)) {
          authed = true;
          // Force password setup on next step — they sign in with the legacy
          // PIN exactly once, then the SetPasswordScreen is shown before any
          // dashboard access. mustChangePassword is set both in the response
          // (read by the client immediately) and persisted to the DB so the
          // forced-change survives a token refresh or a different device.
          mustChangePassword = true;
          if (!staffUser.mustChangePassword) {
            await storage.setMustChangePassword(staffUser.username, true);
          }
        }
      }

      if (!authed) {
        recordFailedLogin(clientIp);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      clearFailedLogins(clientIp);
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const session = await storage.createStaffSession(token, expiresAt, staffUser.id, staffUser.username);
      return res.json({
        token: session.token,
        expiresAt: session.expiresAt,
        username: staffUser.username,
        displayName: staffUser.displayName,
        role: staffUser.role,
        mustChangePassword,
      });
    }
  });

  app.post("/api/staff/logout", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      await storage.invalidateStaffSession(authHeader.slice(7));
    }
    res.status(204).send();
  });

  app.get("/api/staff/verify", staffAuth, async (req, res) => {
    const staffUser = (req as any).staffUser;
    res.json({
      authenticated: true,
      role: (req as any).staffRole || "staff",
      username: (req as any).staffUsername || null,
      // Returned so the dashboard sidebar greeting ("Good morning, X")
      // works after a hard reload, where state.displayName isn't carried
      // over from the prior login response.
      displayName: staffUser?.displayName || null,
      mustChangePassword: staffUser ? (staffUser.mustChangePassword === true) : false,
    });
  });

  app.get("/api/staff/users", staffAuth, managerAuth, async (_req, res) => {
    const users = await storage.getAllStaffUsers();
    res.json(users.map(u => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      createdAt: u.createdAt,
      active: u.active,
      approvalStatus: u.approvalStatus,
    })));
  });

  app.post("/api/staff/change-pin", staffAuth, async (req, res) => {
    const { currentPin, newPin } = req.body;
    const username = (req as any).staffUsername;

    if (!username) {
      return res.status(400).json({ message: "PIN change is only available for named accounts" });
    }

    if (!currentPin || typeof currentPin !== "string") {
      return res.status(400).json({ message: "Current PIN is required" });
    }

    if (!newPin || typeof newPin !== "string" || newPin.length < 4 || newPin.length > 8 || !/^\d+$/.test(newPin)) {
      return res.status(400).json({ message: "New PIN must be 4-8 digits" });
    }

    if (currentPin === newPin) {
      return res.status(400).json({ message: "New PIN must be different from current PIN" });
    }

    const staffUser = await storage.getStaffUserByUsername(username);
    if (!staffUser) {
      return res.status(404).json({ message: "Account not found" });
    }

    const displayNameUpper = (staffUser.displayName || "").toUpperCase().trim();
    if (displayNameUpper === "THE 147" || username.toLowerCase() === "the147") {
      return res.status(403).json({ message: "PIN changes are not allowed for this account" });
    }

    if (!staffUser.pinHash || !staffUser.pinSalt) {
      return res.status(400).json({ message: "This account uses a password — please use Change Password instead." });
    }

    if (!verifyPin(currentPin, staffUser.pinHash, staffUser.pinSalt)) {
      return res.status(401).json({ message: "Current PIN is incorrect" });
    }

    const { hash, salt } = hashPin(newPin);
    await storage.updateStaffPin(username, hash, salt);
    // Self-initiated rotation: revoke every OTHER session for this user so a
    // forgotten device or stolen token cannot survive the change. The token
    // making this request stays valid — the user remains signed in.
    const currentToken = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7) : undefined;
    await storage.invalidateStaffSessionsByUserId(staffUser.id, currentToken).catch(() => undefined);
    res.json({ message: "PIN changed successfully" });
  });

  // New: staff sets/changes their own password.
  // Used both for the initial PIN→password migration (no current password yet)
  // and for normal password changes by the user.
  app.post("/api/staff/set-password", staffAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const username = (req as any).staffUsername;

    if (!username) {
      return res.status(400).json({ message: "Password change is only available for named accounts" });
    }

    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const staffUser = await storage.getStaffUserByUsername(username);
    if (!staffUser) {
      return res.status(404).json({ message: "Account not found" });
    }

    const displayNameUpper = (staffUser.displayName || "").toUpperCase().trim();
    if (displayNameUpper === "THE 147" || username.toLowerCase() === "the147") {
      return res.status(403).json({ message: "Password changes are not allowed for this account" });
    }

    // When the staff user is being forced to change their credential
    // (mustChangePassword=true) — whether because they're a legacy PIN user
    // logging in for the first time, or because a manager just reset their
    // password to a temp value — they don't need to re-enter the current
    // credential. They've already proved possession of it during login.
    // Otherwise (normal change-password), require the current password.
    const hasPassword = !!(staffUser.passwordHash && staffUser.passwordSalt);
    const isForcedChange = staffUser.mustChangePassword === true;
    if (!isForcedChange) {
      if (!currentPassword || typeof currentPassword !== "string") {
        return res.status(400).json({ message: "Current password is required" });
      }
      if (hasPassword) {
        if (!verifyPassword(currentPassword, staffUser.passwordHash!, staffUser.passwordSalt!)) {
          return res.status(401).json({ message: "Current password is incorrect" });
        }
      } else if (staffUser.pinHash && staffUser.pinSalt) {
        // No password yet but also not flagged forced — accept old PIN.
        if (!verifyPin(currentPassword, staffUser.pinHash, staffUser.pinSalt)) {
          return res.status(401).json({ message: "Current credential is incorrect" });
        }
      }
    }

    if (hasPassword && verifyPassword(newPassword, staffUser.passwordHash!, staffUser.passwordSalt!)) {
      return res.status(400).json({ message: "New password must be different from current password" });
    }

    const { hash, salt } = hashPassword(newPassword);
    await storage.updateStaffPassword(username, hash, salt, false);
    // Self-initiated rotation: revoke every OTHER session for this user. The
    // bearer token making this request is preserved so the user stays signed
    // in after the change.
    const currentToken = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7) : undefined;
    await storage.invalidateStaffSessionsByUserId(staffUser.id, currentToken).catch(() => undefined);
    res.json({ message: "Password updated successfully" });
  });

  // Owner resets another staff user's password to a temporary value and
  // forces them to change it on next login.
  // SECURITY: this is owner-only (matches the rest of staff-account
  // administration: /update-role, /toggle-active, DELETE /:id, /approve).
  // It used to allow managerAuth, which let a manager pick a temp password
  // for any non-owner staff member, sign in as them, and perform actions
  // (including HR self-service writes) attributed to the victim — a
  // cross-role-boundary impersonation vector. The owner-only inner check
  // below is now redundant given ownerAuth but kept as defense-in-depth.
  app.post("/api/staff/reset-password", staffAuth, ownerAuth, async (req, res) => {
    const { username, tempPassword } = req.body;

    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return res.status(400).json({ message: "Username is required" });
    }

    const passwordError = validatePasswordStrength(tempPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const staffUser = await storage.getStaffUserByUsername(username.trim());
    if (!staffUser) {
      return res.status(404).json({ message: "Staff user not found" });
    }

    // Defense-in-depth: ownerAuth above already guarantees the caller is
    // an owner, so this check is unreachable in normal operation. We keep
    // it so the route body itself documents the owner-only intent and
    // would still fail closed if the middleware were ever loosened.
    const requestingUser = (req as any).staffUser;
    if (staffUser.role === "owner" && requestingUser?.role !== "owner") {
      return res.status(403).json({ message: "Only owner accounts may reset another owner's credentials" });
    }

    const { hash, salt } = hashPassword(tempPassword);
    // mustChangePassword=true so the user is forced to pick a new one immediately.
    await storage.updateStaffPassword(staffUser.username, hash, salt, true);
    // Owner-initiated rotation: kill every session this user currently holds
    // so a stale or stolen token cannot survive the credential change.
    await storage.invalidateStaffSessionsByUserId(staffUser.id).catch(() => undefined);
    res.json({ message: "Password reset successfully for " + staffUser.username });
  });

  // Owner-only: see the SECURITY note on /api/staff/reset-password above.
  // Resetting another staff member's PIN allows in-person (kiosk-style)
  // login as that user, so it must be gated to owners just like password
  // reset and the other staff-account-administration endpoints.
  app.post("/api/staff/reset-pin", staffAuth, ownerAuth, async (req, res) => {
    const { username, newPin } = req.body;

    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return res.status(400).json({ message: "Username is required" });
    }

    if (!newPin || typeof newPin !== "string" || newPin.length < 4 || newPin.length > 8 || !/^\d+$/.test(newPin)) {
      return res.status(400).json({ message: "New PIN must be 4-8 digits" });
    }

    const staffUser = await storage.getStaffUserByUsername(username.trim());
    if (!staffUser) {
      return res.status(404).json({ message: "Staff user not found" });
    }

    // Defense-in-depth: see the matching note on /api/staff/reset-password.
    // Unreachable under ownerAuth, kept so the route body documents the
    // owner-only intent and fails closed if middleware is ever changed.
    const requestingUser = (req as any).staffUser;
    if (staffUser.role === "owner" && requestingUser?.role !== "owner") {
      return res.status(403).json({ message: "Only owner accounts may reset another owner's credentials" });
    }

    const { hash, salt } = hashPin(newPin);
    await storage.updateStaffPin(username.trim(), hash, salt);
    // Owner-initiated rotation: revoke existing sessions for this user.
    await storage.invalidateStaffSessionsByUserId(staffUser.id).catch(() => undefined);
    res.json({ message: "PIN reset successfully for " + staffUser.username });
  });

  app.patch("/api/staff/update-role", staffAuth, ownerAuth, async (req, res) => {
    const { username, role } = req.body;
    if (!username || typeof username !== "string") {
      return res.status(400).json({ message: "Username is required" });
    }
    if (!role || !["staff", "manager", "owner"].includes(role)) {
      return res.status(400).json({ message: "Role must be 'staff', 'manager', or 'owner'" });
    }
    const currentUser = (req as any).staffUsername;
    if (username.toLowerCase().trim() === currentUser?.toLowerCase()) {
      return res.status(400).json({ message: "You cannot change your own role" });
    }
    const staffUser = await storage.getStaffUserByUsername(username.trim());
    if (!staffUser) {
      return res.status(404).json({ message: "Staff user not found" });
    }
    const updated = await storage.updateStaffRole(username.trim(), role);
    if (!updated) {
      return res.status(500).json({ message: "Failed to update role" });
    }
    res.json({ message: `Role updated to ${role} for ${updated.username}` });
  });

  app.patch("/api/staff/toggle-active", staffAuth, ownerAuth, async (req, res) => {
    const id = parseInt(req.body.id, 10);
    const active = req.body.active;
    if (isNaN(id) || typeof active !== "boolean") {
      return res.status(400).json({ message: "id (number) and active (boolean) are required" });
    }
    const currentUser = (req as any).staffUsername;
    const currentUserRecord = currentUser ? await storage.getStaffUserByUsername(currentUser) : null;
    if (currentUserRecord && currentUserRecord.id === id) {
      return res.status(400).json({ message: "You cannot lock your own account" });
    }
    const updated = await storage.setStaffActive(id, active);
    if (!updated) return res.status(404).json({ message: "Staff user not found" });
    res.json({ message: `Account ${active ? "unlocked" : "locked"} successfully`, user: { id: updated.id, username: updated.username, active: updated.active } });
  });

  app.delete("/api/staff/:id", staffAuth, ownerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const currentUser = (req as any).staffUsername;
    const currentUserRecord = currentUser ? await storage.getStaffUserByUsername(currentUser) : null;
    if (currentUserRecord && currentUserRecord.id === id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }
    const deleted = await storage.deleteStaffUser(id);
    if (!deleted) return res.status(404).json({ message: "Staff user not found" });
    res.json({ message: "Staff account deleted" });
  });

  app.get("/api/staff/customers/search", staffAuth, async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json([]);
    try {
      const results = await storage.searchCustomers(q, 6);
      res.json(results);
    } catch (err) {
      console.error("[customer-search] error:", err);
      res.json([]);
    }
  });

  // Global RBAC-aware search.
  // - Always requires an approved staff session (staffAuth).
  // - Each result group is gated server-side by role. Plain staff cannot see
  //   customers, bookings, memberships, or other staff records — those groups
  //   are simply not queried for them.
  // - Returns a uniform shape so the dashboard can render results without
  //   guessing the caller's permissions on the client.
  app.get("/api/staff/search", staffAuth, async (req, res) => {
    const q = String(req.query.q || "").trim();
    const groups = {
      products: [] as Array<{ id: string; label: string; sub?: string }>,
      events: [] as Array<{ id: string; label: string; sub?: string }>,
      customers: [] as Array<{ id: string; label: string; sub?: string }>,
      bookings: [] as Array<{ id: string; label: string; sub?: string }>,
      memberships: [] as Array<{ id: string; label: string; sub?: string }>,
      staff: [] as Array<{ id: string; label: string; sub?: string }>,
    };

    const role: string = (req as any).staffUser?.role || "staff";
    const isManager = role === "manager" || role === "owner";

    if (q.length < 2) {
      return res.json({ q, role, groups });
    }

    const needle = q.toLowerCase();
    const tasks: Promise<unknown>[] = [];

    // ── PRODUCTS (all staff) ────────────────────────────────────────────────
    tasks.push((async () => {
      try {
        const categories = await square.getMenuFromSquare();
        const matches: { id: string; label: string; sub?: string }[] = [];
        for (const cat of categories) {
          for (const item of cat.items) {
            const name = String(item.name || "");
            const variant = String(item.variationName || "");
            if (
              name.toLowerCase().includes(needle) ||
              variant.toLowerCase().includes(needle)
            ) {
              const priceNum = Number(item.price);
              const priceLabel = Number.isFinite(priceNum) ? `£${(priceNum / 100).toFixed(2)}` : "";
              const subParts = [cat.name, variant && variant !== name ? variant : null, priceLabel]
                .filter(Boolean);
              matches.push({
                id: item.variationId,
                label: name || variant || "(unnamed)",
                sub: subParts.join(" · "),
              });
              if (matches.length >= 5) break;
            }
          }
          if (matches.length >= 5) break;
        }
        groups.products = matches;
      } catch (err) {
        console.error("[global-search] products error:", err);
      }
    })());

    // ── EVENTS (all staff) ──────────────────────────────────────────────────
    tasks.push((async () => {
      try {
        const events = await storage.getActiveEvents();
        groups.events = events
          .filter(e =>
            (e.title || "").toLowerCase().includes(needle) ||
            (e.description || "").toLowerCase().includes(needle)
          )
          .slice(0, 5)
          .map(e => ({
            id: String(e.id),
            label: e.title || `Event #${e.id}`,
            sub: [e.eventType === "weekly" ? `Weekly · ${e.dayOfWeek || ""}`.trim() : e.date, e.time]
              .filter(Boolean)
              .join(" · "),
          }));
      } catch (err) {
        console.error("[global-search] events error:", err);
      }
    })());

    // ── CUSTOMERS + BOOKINGS (all approved staff) ──────────────────────────
    // Floor staff need to look up customer details and find bookings during
    // shift work (taking phone reservations, marking arrivals, handling
    // walk-ins). The matching endpoints (/api/bookings,
    // /api/staff/customers/search) are also staff-accessible, so global
    // search results stay consistent with what staff can actually open.
    tasks.push((async () => {
      try {
        const customers = await storage.searchCustomers(q, 5);
        groups.customers = customers.map(c => ({
          id: c.id != null ? String(c.id) : c.email,
          label: c.name || c.email || c.phone || "(unnamed)",
          sub: [c.email, c.phone].filter(Boolean).join(" · "),
        }));
      } catch (err) {
        console.error("[global-search] customers error:", err);
      }
    })());

    tasks.push((async () => {
      try {
        const matches = await storage.searchBookings(q, 5);
        groups.bookings = matches.map(b => ({
          id: String(b.id),
          label: `#${b.id} · ${b.customerName || "(no name)"}`,
          sub: [
            b.date,
            b.startTime,
            b.tableType,
            b.tableNumber ? `Table ${b.tableNumber}` : null,
            b.status,
          ].filter(Boolean).join(" · "),
        }));
      } catch (err) {
        console.error("[global-search] bookings error:", err);
      }
    })());

    // ── MANAGER-ONLY GROUPS ────────────────────────────────────────────────
    // Membership plans (business config) and the staff user list (privacy)
    // remain restricted to managers/owners.
    if (isManager) {
      // Memberships (plans)
      tasks.push((async () => {
        try {
          const plans = await storage.getMembershipPlans(false);
          groups.memberships = plans
            .filter(p =>
              (p.name || "").toLowerCase().includes(needle) ||
              (p.tier || "").toLowerCase().includes(needle)
            )
            .slice(0, 5)
            .map(p => ({
              id: String(p.id),
              label: p.name || p.tier,
              sub: `${p.tier} · £${(p.priceMonthly / 100).toFixed(2)}/mo`,
            }));
        } catch (err) {
          console.error("[global-search] memberships error:", err);
        }
      })());

      // Staff users
      tasks.push((async () => {
        try {
          const all = await storage.getAllStaffUsers();
          groups.staff = all
            .filter(s =>
              (s.username || "").toLowerCase().includes(needle) ||
              (s.displayName || "").toLowerCase().includes(needle)
            )
            .slice(0, 5)
            .map(s => ({
              id: String(s.id),
              label: s.displayName || s.username,
              sub: [s.username, s.role, s.active ? null : "inactive", s.approvalStatus !== "approved" ? s.approvalStatus : null]
                .filter(Boolean).join(" · "),
            }));
        } catch (err) {
          console.error("[global-search] staff error:", err);
        }
      })());
    }

    await Promise.all(tasks);
    res.json({ q, role, groups });
  });

  // Manager-initiated password reset — emails the verified customer a reset link.
  // Mirrors POST /api/customers/forgot-password but requires staff manager auth
  // and identifies the customer by id (preferred) or email.
  app.post("/api/staff/customers/forgot-password", staffAuth, managerAuth, async (req, res) => {
    const staffActor = (req as any).staffUser;
    const actorUsername: string = staffActor?.username || "system";
    const recordAudit = async (
      outcome: string,
      customer?: { id?: number | null; email?: string | null; name?: string | null } | null,
      fallbackEmail?: string,
    ) => {
      try {
        await storage.logPasswordResetAttempt({
          staffUsername: actorUsername,
          customerId: customer?.id ?? null,
          customerEmail: customer?.email ?? (fallbackEmail || null),
          customerName: customer?.name ?? null,
          outcome,
        });
      } catch (auditErr: any) {
        console.error("[staff-pwreset] failed to write audit entry:", auditErr?.message);
      }
    };

    const clientIp = getClientIp(req);
    if (!checkSensitiveRateLimit(clientIp)) {
      await recordAudit("rate_limited", null, String(req.body?.email || "").trim() || undefined);
      return res.status(429).json({ message: "Too many requests. Please try again later." });
    }
    const rawId = req.body?.customerId;
    const rawEmail = String(req.body?.email || "").trim();
    if (rawId === undefined && !rawEmail) {
      return res.status(400).json({ message: "customerId or email is required" });
    }
    try {
      let customer: import("@shared/schema").Customer | undefined;
      if (rawId !== undefined && rawId !== null) {
        const numId = typeof rawId === "number" ? rawId : parseInt(String(rawId), 10);
        if (!isNaN(numId)) {
          customer = await storage.getCustomerById(numId);
        }
      }
      if (!customer && rawEmail) {
        customer = await storage.getCustomerByEmail(rawEmail);
      }
      if (!customer) {
        await recordAudit("not_found", null, rawEmail || undefined);
        return res.status(404).json({ message: "Customer not found" });
      }
      if (!customer.emailVerified) {
        await recordAudit("email_not_verified", customer);
        return res.status(403).json({
          code: "EMAIL_NOT_VERIFIED",
          message: "This customer's email is not verified. They must verify their email before a password reset can be sent.",
          email: customer.email,
        });
      }
      const lastSent = customer.passwordResetLastSentAt;
      if (lastSent && Date.now() - lastSent.getTime() < 60_000) {
        await recordAudit("rate_limited_recent_send", customer);
        return res.status(429).json({
          message: "A reset email was sent to this customer in the last minute. Please wait before trying again.",
        });
      }
      const tokenRaw = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(tokenRaw).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await storage.setPasswordResetToken(customer.id, tokenHash, expiresAt);
      const sent = await sendPasswordResetEmail({ name: customer.name, email: customer.email, tokenRaw });
      if (!sent) {
        await recordAudit("send_failed", customer);
        return res.status(502).json({ message: "Could not send the reset email. Please try again later." });
      }
      await recordAudit("sent", customer);
      console.log(`[staff-pwreset] Manager '${actorUsername}' triggered reset for customer ${customer.id} <${customer.email}>`);
      res.json({ success: true, email: customer.email });
    } catch (err: any) {
      console.error("Staff forgot-password error:", err.message);
      await recordAudit("error", null, rawEmail || undefined);
      res.status(500).json({ message: "Could not process the request" });
    }
  });

  // Manager-only audit history of staff-initiated password resets.
  app.get("/api/staff/customers/password-reset-history", staffAuth, managerAuth, async (req, res) => {
    const limitRaw = parseInt(String(req.query.limit ?? "50"), 10);
    const limit = isNaN(limitRaw) ? 50 : Math.min(Math.max(limitRaw, 1), 200);
    try {
      const entries = await storage.listPasswordResetAuditLog(limit);
      res.json(entries);
    } catch (err: any) {
      console.error("[staff-pwreset] history fetch failed:", err?.message);
      res.status(500).json({ message: "Could not load reset history" });
    }
  });

  app.patch("/api/staff/approve", staffAuth, ownerAuth, async (req, res) => {
    console.log("[approve] req.body:", JSON.stringify(req.body));
    // Accept both formats: {username, approvalStatus} (new) and {id, status} (legacy)
    const username = req.body.username;
    const id = req.body.id;
    const finalStatus: string = req.body.approvalStatus || req.body.status || "";
    if (!["approved", "rejected"].includes(finalStatus)) {
      return res.status(400).json({ message: "approvalStatus ('approved' or 'rejected') is required" });
    }
    let staffUser: import("@shared/schema").StaffUser | undefined;
    if (username && typeof username === "string") {
      staffUser = await storage.getStaffUserByUsername(username.trim());
    } else if (id !== undefined && id !== null) {
      const numId = typeof id === "number" ? id : parseInt(String(id), 10);
      if (!isNaN(numId)) {
        const allUsers = await storage.getAllStaffUsers();
        staffUser = allUsers.find(u => u.id === numId);
      }
    }
    if (!staffUser) return res.status(404).json({ message: "Staff user not found" });
    const updated = await storage.updateStaffApproval(staffUser.id, finalStatus);
    if (!updated) return res.status(404).json({ message: "Staff user not found" });
    res.json({ message: `Account ${finalStatus}`, user: { id: updated.id, username: updated.username, approvalStatus: updated.approvalStatus } });
  });

  // ── Owner-only website content editor ─────────────────────────────────────
  // Lets the owner edit hero text on each /test-site page from the staff portal.
  // Overrides are stored in site_settings (key = "web:<page>:<block>") and
  // substituted into the HTML at render time. Defaults remain in the templates.
  app.get("/api/staff/web-content", staffAuth, ownerAuth, async (_req, res) => {
    try {
      const { getEditorPayload } = await import("./web-content");
      res.json(await getEditorPayload());
    } catch (err) {
      console.error("Failed to load web content:", err);
      res.status(500).json({ message: "Failed to load website content" });
    }
  });

  app.put("/api/staff/web-content", staffAuth, ownerAuth, async (req, res) => {
    try {
      const { saveOverride } = await import("./web-content");
      const { page, block, value } = req.body || {};
      if (typeof page !== "string" || typeof block !== "string") {
        return res.status(400).json({ message: "page and block are required" });
      }
      await saveOverride(page, block, typeof value === "string" ? value : "");
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Failed to save web content:", err);
      res.status(400).json({ message: err?.message || "Failed to save" });
    }
  });

  // Owner-only image upload for website editor image blocks. Returns a
  // base64 data URL that the caller saves into the relevant block via the
  // PUT /api/staff/web-content endpoint above. Same pattern used elsewhere
  // for category/banner image uploads — keeps everything in the DB so there
  // are no filesystem assets to manage in production.
  app.post(
    "/api/staff/web-content/image",
    staffAuth,
    ownerAuth,
    upload.single("image"),
    async (req: any, res) => {
      try {
        if (!req.file) return res.status(400).json({ message: "No image file uploaded" });
        const compressed = await sharp(req.file.buffer)
          .rotate()
          .resize({ width: 2000, withoutEnlargement: true })
          .jpeg({ quality: 78, mozjpeg: true })
          .toBuffer();
        const url = `data:image/jpeg;base64,${compressed.toString("base64")}`;
        return res.json({ url });
      } catch (err: any) {
        console.error("Web image upload failed:", err);
        return res.status(400).json({ message: err?.message || "Image upload failed" });
      }
    },
  );

  // ── Owner-only marketing-page builder ─────────────────────────────────────
  // Owners can add new pages to the public /test-site marketing site without a
  // developer. Pages persist in `marketing_pages` and render with the standard
  // shell (logo / nav / footer / colours) so they inherit every site-wide
  // override automatically. Slugs are validated against built-in pages and
  // /test-site/* asset routes to avoid collisions.
  const RESERVED_PAGE_SLUGS = new Set([
    "", "home", "snooker", "dining", "events", "function-rooms", "gift-cards",
    "contact", "membership", "order", "book", "join", "menu",
    "styles.css", "embed.js",
  ]);
  const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

  function validateSlug(slug: string): string {
    const s = String(slug || "").toLowerCase().trim();
    if (!SLUG_RE.test(s)) {
      throw new Error("Slug must be lowercase letters, numbers and hyphens (max 50 chars)");
    }
    if (RESERVED_PAGE_SLUGS.has(s)) {
      throw new Error(`'${s}' is a built-in page — pick a different slug`);
    }
    return s;
  }

  app.get("/api/staff/marketing-pages", staffAuth, ownerAuth, async (_req, res) => {
    try {
      const pages = await storage.listMarketingPages();
      res.json(pages);
    } catch (err: any) {
      console.error("[marketing-pages/list]", err);
      res.status(500).json({ message: "Failed to load pages" });
    }
  });

  app.post("/api/staff/marketing-pages", staffAuth, ownerAuth, async (req, res) => {
    try {
      const { slug, title, heroEyebrow, heroTitle, heroSub, heroBg, bodyHtml, metaTitle, metaDescription, sortOrder, hidden } = req.body || {};
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ message: "Title is required" });
      }
      const safeSlug = validateSlug(slug);
      const existing = await storage.getMarketingPage(safeSlug);
      if (existing) return res.status(400).json({ message: "A page with that slug already exists" });
      const { isSafeImageUrl } = await import("./web-content");
      if (heroBg && !isSafeImageUrl(heroBg)) {
        return res.status(400).json({ message: "Unsafe hero background URL" });
      }
      const page = await storage.createMarketingPage({
        slug: safeSlug,
        title: String(title).trim(),
        heroEyebrow: typeof heroEyebrow === "string" ? heroEyebrow : "",
        heroTitle: typeof heroTitle === "string" ? heroTitle : "",
        heroSub: typeof heroSub === "string" ? heroSub : "",
        heroBg: typeof heroBg === "string" ? heroBg : "",
        bodyHtml: typeof bodyHtml === "string" ? bodyHtml : "",
        metaTitle: typeof metaTitle === "string" ? metaTitle : "",
        metaDescription: typeof metaDescription === "string" ? metaDescription : "",
        sortOrder: Number.isFinite(sortOrder) ? Number(sortOrder) : 0,
        hidden: !!hidden,
      });
      res.json(page);
    } catch (err: any) {
      console.error("[marketing-pages/create]", err);
      res.status(400).json({ message: err?.message || "Failed to create page" });
    }
  });

  app.put("/api/staff/marketing-pages/:slug", staffAuth, ownerAuth, async (req, res) => {
    try {
      const slug = String(req.params.slug || "").toLowerCase();
      const existing = await storage.getMarketingPage(slug);
      if (!existing) return res.status(404).json({ message: "Page not found" });
      const { title, heroEyebrow, heroTitle, heroSub, heroBg, bodyHtml, metaTitle, metaDescription, sortOrder, hidden } = req.body || {};
      const { isSafeImageUrl } = await import("./web-content");
      if (typeof heroBg === "string" && heroBg && !isSafeImageUrl(heroBg)) {
        return res.status(400).json({ message: "Unsafe hero background URL" });
      }
      const patch: any = {};
      if (typeof title === "string" && title.trim()) patch.title = title.trim();
      if (typeof heroEyebrow === "string") patch.heroEyebrow = heroEyebrow;
      if (typeof heroTitle === "string") patch.heroTitle = heroTitle;
      if (typeof heroSub === "string") patch.heroSub = heroSub;
      if (typeof heroBg === "string") patch.heroBg = heroBg;
      if (typeof bodyHtml === "string") patch.bodyHtml = bodyHtml;
      if (typeof metaTitle === "string") patch.metaTitle = metaTitle;
      if (typeof metaDescription === "string") patch.metaDescription = metaDescription;
      if (Number.isFinite(sortOrder)) patch.sortOrder = Number(sortOrder);
      if (typeof hidden === "boolean") patch.hidden = hidden;
      const updated = await storage.updateMarketingPage(slug, patch);
      res.json(updated);
    } catch (err: any) {
      console.error("[marketing-pages/update]", err);
      res.status(400).json({ message: err?.message || "Failed to save page" });
    }
  });

  app.delete("/api/staff/marketing-pages/:slug", staffAuth, ownerAuth, async (req, res) => {
    try {
      const slug = String(req.params.slug || "").toLowerCase();
      const ok = await storage.deleteMarketingPage(slug);
      if (!ok) return res.status(404).json({ message: "Page not found" });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[marketing-pages/delete]", err);
      res.status(500).json({ message: "Failed to delete page" });
    }
  });

  // ── Owner-only Wix membership migration ───────────────────────────────────
  // Imports paying members from Wix as already-active records, then sends them
  // a one-tap "save your card" link so they can re-enter card details on Square.
  app.post("/api/staff/wix-migration/preview", staffAuth, ownerAuth, async (req, res) => {
    try {
      const { parseCsv } = await import("./wix-migration");
      const { csv } = req.body || {};
      if (typeof csv !== "string" || !csv.trim()) return res.status(400).json({ message: "Paste your CSV first" });
      const rows = parseCsv(csv);
      const plans = await storage.getMembershipPlans();
      res.json({ rows, plans });
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Couldn't parse CSV" });
    }
  });

  app.post("/api/staff/wix-migration/import", staffAuth, ownerAuth, async (req, res) => {
    try {
      const { parseCsv, importWixMembers } = await import("./wix-migration");
      const { csv, defaultPlanId, planMap } = req.body || {};
      if (typeof csv !== "string" || !csv.trim()) return res.status(400).json({ message: "CSV is required" });
      if (!defaultPlanId) return res.status(400).json({ message: "Pick a default plan" });
      const rows = parseCsv(csv);
      const result = await importWixMembers({
        rows,
        defaultPlanId: parseInt(defaultPlanId),
        planMap: planMap && typeof planMap === "object" ? planMap : {},
      });
      res.json(result);
    } catch (err: any) {
      console.error("[wix-migration/import]", err);
      res.status(500).json({ message: err?.message || "Import failed" });
    }
  });

  app.get("/api/staff/wix-migration/status", staffAuth, ownerAuth, async (_req, res) => {
    try {
      const subs = await storage.getMembershipSubscriptions();
      const imported = subs.filter(s => s.source === "wix_import");
      const stats = {
        total: imported.length,
        emailed: imported.filter(s => s.migrationEmailedAt).length,
        completed: imported.filter(s => s.migrationCompletedAt).length,
        pending: imported.filter(s => !s.migrationCompletedAt).length,
      };
      const list = imported.map(s => ({
        id: s.id,
        customerName: s.customer?.name || "",
        customerEmail: s.customer?.email || "",
        planName: s.plan?.name || "",
        priceMonthly: s.plan?.priceMonthly || 0,
        currentPeriodEnd: s.currentPeriodEnd,
        emailedAt: s.migrationEmailedAt,
        completedAt: s.migrationCompletedAt,
        hasToken: !!s.migrationToken,
      })).sort((a, b) => {
        // Pending first, then completed
        if (!a.completedAt && b.completedAt) return -1;
        if (a.completedAt && !b.completedAt) return 1;
        return (a.customerName || "").localeCompare(b.customerName || "");
      });
      res.json({ stats, list });
    } catch (err: any) {
      console.error("[wix-migration/status]", err);
      res.status(500).json({ message: "Failed to load status" });
    }
  });

  app.post("/api/staff/wix-migration/send-email/:id", staffAuth, ownerAuth, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const ok = await sendMigrationEmail(id, req);
      if (!ok.success) return res.status(400).json({ message: ok.message });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[wix-migration/send-email]", err);
      res.status(500).json({ message: "Failed to send" });
    }
  });

  app.post("/api/staff/wix-migration/send-all-emails", staffAuth, ownerAuth, async (req, res) => {
    try {
      const { onlyUnsent } = req.body || {};
      const subs = await storage.getMembershipSubscriptions();
      const targets = subs.filter(s => s.source === "wix_import" && !s.migrationCompletedAt && (!onlyUnsent || !s.migrationEmailedAt));
      let sent = 0, failed = 0;
      for (const s of targets) {
        const result = await sendMigrationEmail(s.id, req);
        if (result.success) sent++; else failed++;
      }
      res.json({ sent, failed, total: targets.length });
    } catch (err: any) {
      console.error("[wix-migration/send-all-emails]", err);
      res.status(500).json({ message: "Bulk send failed" });
    }
  });

  // Public — start Square checkout from a migration link
  app.post("/api/migrate/:token/checkout", async (req, res) => {
    try {
      const token = req.params.token;
      if (!token || token.length < 16) return res.status(400).json({ message: "Invalid link" });
      const subs = await storage.getMembershipSubscriptions();
      const sub = subs.find(s => s.migrationToken === token);
      if (!sub) return res.status(404).json({ message: "This link isn't valid anymore." });
      if (sub.migrationCompletedAt) return res.status(400).json({ message: "This membership has already been activated." });
      if (sub.squareSubscriptionId) return res.status(400).json({ message: "Your card is already set up — refresh this page to confirm." });
      if (!sub.customer || !sub.plan) return res.status(404).json({ message: "Membership not found" });
      if (!square.isConfigured()) return res.status(503).json({ message: "Payment system unavailable" });
      const variationId = sub.plan.squarePlanVariationId;
      if (!variationId) return res.status(503).json({ message: "Plan isn't set up for online payments yet — please contact us." });

      // Ensure a Square customer exists and is linked
      let sqCustomerId = sub.squareCustomerId;
      if (!sqCustomerId) {
        const sqCustomer = await square.findSquareCustomerByEmail(sub.customer.email).catch(() => null)
          || await square.createSquareCustomer(sub.customer.name, sub.customer.email, sub.customer.phone || undefined).catch(() => null);
        if (sqCustomer) {
          sqCustomerId = sqCustomer.id;
          await storage.updateMembershipSubscription(sub.id, { squareCustomerId: sqCustomerId });
        }
      }

      // Use the trusted configured origin for the Square checkout return URL
      // — Host / X-Forwarded-Proto are attacker-controllable. A poisoned
      // header would otherwise let an attacker mint a real Square checkout
      // link that redirects to their domain after payment, leaking the
      // bearer migration token in the URL path.
      const redirectUrl = `${getPublicAppOrigin()}/migrate/${token}/done`;

      const checkout = await square.createSubscriptionCheckoutLink({
        planVariationId: variationId,
        subscriptionId: sub.id,
        buyerEmail: sub.customer.email,
        redirectUrl,
      });
      res.json({ checkoutUrl: checkout.url });
    } catch (err: any) {
      console.error("[migrate/checkout]", err);
      res.status(500).json({ message: "Couldn't start checkout — please try again." });
    }
  });

  // Public — Square redirect after successful migration checkout.
  //
  // SECURITY: This URL is just where Square parks the user's browser after
  // checkout, so we must NOT trust the visit itself as proof of payment.
  // Anyone holding the migration token (it's emailed to the customer) could
  // otherwise hit this URL directly and have us mark them as fully migrated
  // without ever providing a card.
  //
  // Migration is only marked complete by the Square webhook handler in
  // /api/membership/webhook (see ~6605), which fires `subscription.created`
  // once Square has actually accepted recurring billing. That handler sets
  // `squareSubscriptionId` AND, when the local row carries a migrationToken,
  // also sets `migrationCompletedAt` + `source = wix_migrated` itself.
  //
  // Here we just redirect back to the landing page. If the webhook has
  // already fired, the landing page will correctly show "alreadyDone". If
  // the user happens to be redirected before the webhook arrives, the page
  // will show in-progress until the next visit / refresh — that's the
  // correct behaviour.
  app.get("/migrate/:token/done", async (req, res) => {
    res.redirect(`/migrate/${req.params.token}`);
  });

  app.post("/api/staff/migrate-encryption", staffAuth, managerAuth, async (_req, res) => {
    try {
      const count = await storage.migrateEncryptExistingBookings();
      res.json({ message: "Encryption migration complete", recordsMigrated: count });
    } catch (err) {
      console.error("Encryption migration error:", err);
      res.status(500).json({ message: "Migration failed" });
    }
  });

  // Public: only active offers
  app.get("/api/offers", async (_req, res) => {
    const offers = await storage.getOffers();
    res.json(offers);
  });

  // Staff: all offers including inactive (for management)
  app.get("/api/staff/offers", staffAuth, async (_req, res) => {
    const offers = await storage.getAllOffers();
    res.json(offers);
  });

  // ── Staff Payments (Stripe phone payments + TicketSource Box Office) ─────────
  // All payment endpoints are manager-only (staff role cannot take card payments).
  const trim = (v: unknown, max: number) => {
    const s = String(v ?? "").trim();
    return s.length > max ? s.slice(0, max) : s;
  };
  const isEmail = (s: string) => /^[^\s@]{1,80}@[^\s@]{1,80}\.[^\s@]{1,40}$/.test(s);

  app.get("/api/staff/payments/config", staffAuth, async (_req, res) => {
    res.json({
      stripeConfigured: isStripeConfigured(),
      publishableKey: getPublishableKey(),
      boxOfficeUrl: process.env.TICKETSOURCE_BOX_OFFICE_URL || "",
      square: {
        configured: square.isWebPaymentsConfigured(),
        applicationId: square.getApplicationId(),
        locationId: square.getPublicLocationId(),
        environment: square.getEnvironment(),
      },
    });
  });

  // Square: take a card payment using a tokenised source from the Web Payments SDK
  // Manager-only: ordinary staff must not be able to charge cards (broken access
  // control if `staffAuth` alone is used — the comment above promises manager-only).
  app.post("/api/staff/payments/square/charge", staffAuth, managerAuth, async (req, res) => {
    if (!square.isWebPaymentsConfigured()) {
      return res.status(503).json({ message: "Square Web Payments is not configured. Add SQUARE_APPLICATION_ID, SQUARE_ACCESS_TOKEN, and SQUARE_LOC_ID." });
    }
    const { sourceId, amountPence, description, customerName, customerEmail, customerPhone, verificationToken } = req.body || {};
    const sid = trim(sourceId, 200);
    if (!sid) return res.status(400).json({ message: "Missing card token" });
    const amt = Number(amountPence);
    if (!Number.isFinite(amt) || amt < 50 || amt > 100000_00) {
      return res.status(400).json({ message: "Amount must be between £0.50 and £100,000.00" });
    }
    const desc = trim(description, 200);
    if (!desc) return res.status(400).json({ message: "Description is required" });
    const name = trim(customerName, 120) || null;
    const email = trim(customerEmail, 160) || null;
    if (email && !isEmail(email)) return res.status(400).json({ message: "Invalid customer email" });
    const phone = trim(customerPhone, 40) || null;

    const staffUser = (req as any).staffUser;
    const staffUsername = (req as any).staffUsername || null;

    // Pre-create a pending log row so we have an ID for receipt numbering
    const log = await storage.createPaymentLog({
      amountPence: Math.round(amt),
      currency: "gbp",
      description: desc,
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      stripePaymentIntentId: `sq_pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: "pending",
      staffUsername: staffUsername,
      staffDisplayName: staffUser?.displayName || staffUser?.username || null,
      failureMessage: null,
    });

    try {
      // Idempotency: avoid duplicate charges on network retry. Square requires a UUID-like
      // string up to 45 chars. We use a hash of the log id + source id which is unique.
      const idemRaw = `${log.id}|${sid}`;
      const idempotencyKey = createHash("sha256").update(idemRaw).digest("hex").slice(0, 45);
      const payment = await square.createCardPayment({
        sourceId: sid,
        amountPence: Math.round(amt),
        idempotencyKey,
        note: desc,
        referenceId: `staff-${log.id}`,
        buyerEmail: email || undefined,
        verificationToken: verificationToken || null,
      });

      const succeeded = payment.status === "COMPLETED" || payment.status === "APPROVED";
      const status: "succeeded" | "failed" | "pending" = succeeded ? "succeeded" : payment.status === "FAILED" || payment.status === "CANCELED" ? "failed" : "pending";

      await storage.updatePaymentLog(log.id, {
        status,
        stripePaymentIntentId: payment.id,
        failureMessage: succeeded ? null : `Square status: ${payment.status}`,
      });

      // Send branded receipt email on success
      if (succeeded && email) {
        const last4 = payment.card_details?.card?.last_4 || "----";
        const brand = payment.card_details?.card?.card_brand || "card";
        try {
          const html = PAYMENT_RECEIPT_HTML({
            amountPence: Math.round(amt),
            description: desc,
            customerName: name || "Customer",
            last4,
            brand: String(brand).toLowerCase(),
            receiptNumber: `147-${log.id}`,
            dateStr: new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }),
          });
          await sendEmailViaSMTP(email, `Your receipt from The 147 Bradford — ${desc}`, html);
        } catch (mailErr) {
          console.error("Square receipt email failed:", { message: (mailErr as any)?.message });
        }
      }

      res.json({ ok: succeeded, status: payment.status, paymentId: payment.id, logId: log.id });
    } catch (err: any) {
      // Square SDK errors expose `errors: [{ code, category, detail, field }]`
      const squareErrors = Array.isArray(err?.errors) ? err.errors : (Array.isArray(err?.result?.errors) ? err.result.errors : []);
      const first = squareErrors[0] || {};
      const errorCode: string | undefined = first.code;
      const errorDetail: string | undefined = first.detail || err?.message;
      // Mark the log as failed and return a structured error so the client can
      // map the code to a customer-friendly message
      await storage.updatePaymentLog(log.id, {
        status: "failed",
        failureMessage: (errorCode ? `[${errorCode}] ` : "") + (errorDetail || "Square charge failed").slice(0, 500),
      }).catch(() => {});
      console.error("Square charge error:", { code: err?.code, statusCode: err?.statusCode, errorCode });
      res.status(400).json({
        message: errorDetail || "Card charge failed",
        errorCode: errorCode || null,
        provider: "square",
      });
    }
  });

  // Manager-only — see comment above /square/charge.
  app.post("/api/staff/payments/create-intent", staffAuth, managerAuth, async (req, res) => {
    if (!isStripeConfigured()) {
      return res.status(503).json({ message: "Stripe is not configured. Please add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY." });
    }
    const { amountPence, description, customerName, customerEmail, customerPhone, moto } = req.body || {};
    const amt = Number(amountPence);
    if (!Number.isFinite(amt) || amt < 50 || amt > 100000_00) {
      return res.status(400).json({ message: "Amount must be between £0.50 and £100,000.00" });
    }
    const desc = trim(description, 200);
    if (!desc) return res.status(400).json({ message: "Description is required" });
    const name = trim(customerName, 120) || null;
    const email = trim(customerEmail, 160) || null;
    if (email && !isEmail(email)) return res.status(400).json({ message: "Invalid customer email" });
    const phone = trim(customerPhone, 40) || null;

    const staffUser = (req as any).staffUser;
    const staffUsername = (req as any).staffUsername || null;

    try {
      const stripe = getStripeClient();
      // Idempotency key: bucket by staff + amount + description in 60-second windows so
      // a network retry of the same intent doesn't create a duplicate PaymentIntent.
      const idemBucket = Math.floor(Date.now() / 60000);
      const idemRaw = `${staffUsername || "system"}|${Math.round(amt)}|${desc}|${idemBucket}`;
      const idempotencyKey = createHash("sha256").update(idemRaw).digest("hex");
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(amt),
        currency: "gbp",
        description: desc,
        // Branded receipt is sent ourselves on finalize — don't ask Stripe to send a duplicate
        payment_method_types: ["card"],
        // MOTO requires Stripe to enable the capability on the account first.
        // Until then, the moto flag is informational only — sending it would cause
        // "Received unknown parameter" errors. Set STRIPE_MOTO_ENABLED=true once
        // Stripe support has activated MOTO on your account.
        ...(moto && process.env.STRIPE_MOTO_ENABLED === "true"
          ? { payment_method_options: { card: { moto: true } } }
          : {}),
        metadata: {
          source: "staff_dashboard",
          staffUsername: staffUsername || "system",
          customerName: name || "",
          customerPhone: phone || "",
        },
      }, { idempotencyKey });

      const log = await storage.createPaymentLog({
        amountPence: Math.round(amt),
        currency: "gbp",
        description: desc,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        stripePaymentIntentId: intent.id,
        status: "pending",
        staffUsername: staffUsername,
        staffDisplayName: staffUser?.displayName || staffUser?.username || null,
        failureMessage: null,
      });

      res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, logId: log.id });
    } catch (err: any) {
      // Log only Stripe error metadata — never the full object, which can include PII
      console.error("Stripe create-intent error:", {
        type: err?.type,
        code: err?.code,
        statusCode: err?.statusCode,
        requestId: err?.requestId,
      });
      res.status(500).json({ message: err?.message || "Failed to create payment intent" });
    }
  });

  // Server-verified finalize — fetches the real PaymentIntent from Stripe.
  // Client-supplied status is ignored; truth comes from Stripe.
  // Manager-only — see comment above /square/charge.
  app.post("/api/staff/payments/finalize", staffAuth, managerAuth, async (req, res) => {
    if (!isStripeConfigured()) return res.status(503).json({ message: "Stripe not configured" });
    const piId = trim(req.body?.paymentIntentId, 120);
    if (!piId || !/^pi_[A-Za-z0-9_]+$/.test(piId)) return res.status(400).json({ message: "Invalid paymentIntentId" });
    const existing = await storage.getPaymentLogByIntent(piId);
    if (!existing) return res.status(404).json({ message: "Payment record not found" });
    try {
      const stripe = getStripeClient();
      const intent = await stripe.paymentIntents.retrieve(piId);
      let status: "succeeded" | "failed" | "pending" = "pending";
      if (intent.status === "succeeded") status = "succeeded";
      else if (intent.status === "canceled" || intent.status === "requires_payment_method") status = "failed";
      const failureMessage = intent.last_payment_error?.message || null;
      const updated = await storage.updatePaymentLog(existing.id, { status, failureMessage });

      // Send branded receipt email on success (only once — guarded by status change)
      if (status === "succeeded" && existing.status !== "succeeded" && existing.customerEmail) {
        const charge = intent.latest_charge && typeof intent.latest_charge !== "string"
          ? intent.latest_charge
          : null;
        const last4 = charge?.payment_method_details?.card?.last4 || "----";
        const brand = charge?.payment_method_details?.card?.brand || "card";
        const html = PAYMENT_RECEIPT_HTML({
          amountPence: existing.amountPence,
          description: existing.description,
          customerName: existing.customerName || "Customer",
          last4,
          brand,
          receiptNumber: charge?.receipt_number || `147-${existing.id}`,
          dateStr: new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }),
        });
        sendEmailViaSMTP(
          existing.customerEmail,
          `Receipt for your payment — The 147 Bradford`,
          html,
        ).catch((err) => console.error("[RECEIPT] send failed:", err));
      }

      res.json(updated);
    } catch (err: any) {
      console.error("Stripe finalize error:", err);
      res.status(500).json({ message: err?.message || "Failed to verify payment" });
    }
  });

  app.get("/api/staff/payments/log", staffAuth, managerAuth, async (_req, res) => {
    const logs = await storage.listPaymentLogs(100);
    res.json(logs);
  });

  // Staff: quick toggle active status
  app.patch("/api/staff/offers/:id/toggle", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const offer = await storage.getOffer(id);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    const updated = await storage.updateOffer(id, { active: !offer.active });
    res.json(updated);
  });

  app.get("/api/offers/:id", async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const offer = await storage.getOffer(id);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    res.json(offer);
  });

  app.post("/api/offers", staffAuth, managerAuth, async (req, res) => {
    const parsed = insertOfferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid offer data", errors: parsed.error.flatten() });
    }
    const offer = await storage.createOffer(parsed.data);
    res.status(201).json(offer);
  });

  app.put("/api/offers/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const parsed = insertOfferSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid offer data", errors: parsed.error.flatten() });
    }
    const offer = await storage.updateOffer(id, parsed.data);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    res.json(offer);
  });

  app.delete("/api/offers/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const deleted = await storage.deleteOffer(id);
    if (!deleted) return res.status(404).json({ message: "Offer not found" });
    res.status(204).send();
  });

  app.post("/api/crash-report", (req, res) => {
    const { message, stack, platform, timestamp } = req.body || {};
    console.error(`[CRASH REPORT] platform=${platform} time=${timestamp} message=${message}`);
    if (stack) console.error(`[CRASH STACK] ${stack}`);
    res.status(200).json({ received: true });
  });

  app.post("/api/push-tokens", async (req, res) => {
    const parsed = insertPushTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid token data" });
    }
    // Strip customerEmail — email binding requires an authenticated session.
    // Unauthenticated callers must not be able to tie a token to an arbitrary email.
    const { customerEmail: _email, customerEmailHash: _hash, ...tokenData } = parsed.data;
    const token = await storage.registerPushToken(tokenData);
    res.status(201).json(token);
  });

  app.delete("/api/push-tokens/:token", staffAuth, managerAuth, async (req, res) => {
    const deleted = await storage.removePushToken(req.params.token as string);
    if (!deleted) return res.status(404).json({ message: "Token not found" });
    res.status(204).send();
  });

  app.get("/api/push-tokens", staffAuth, managerAuth, async (_req, res) => {
    const tokens = await storage.getAllPushTokens();
    res.json(tokens);
  });

  // Both legacy ("ExponentPushToken[…]") and current ("ExpoPushToken[…]")
  // formats are emitted by Expo depending on SDK version. Accept either so
  // we don't silently drop notifications for some installs.
  function isValidExpoPushToken(token: unknown): token is string {
    return typeof token === "string"
      && (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));
  }

  async function sendTargetedPush(tokens: string[], title: string, body: string, data?: Record<string, unknown>) {
    if (!tokens.length) return { successCount: 0, failureCount: 0 };
    const messages = tokens.map(to => ({
      to,
      sound: "default" as const,
      title,
      body,
      ...(data ? { data } : {}),
    }));
    let successCount = 0, failureCount = 0;
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(messages),
      });
      const data = await response.json() as { data?: Array<{ status: string; details?: { error?: string } }>; errors?: unknown[] };
      if (data.data) {
        for (const r of data.data) {
          if (r.status === "ok") successCount++;
          else { failureCount++; if (r.details?.error === "DeviceNotRegistered") { /* handled by broadcast cleanup */ } }
        }
      } else failureCount += tokens.length;
    } catch { failureCount += tokens.length; }
    return { successCount, failureCount };
  }

  async function sendPushNotifications(title: string, body: string, sentBy?: string) {
    const tokens = await storage.getAllPushTokens();
    if (tokens.length === 0) return { tokens, successCount: 0, failureCount: 0 };

    type PushMessage = { to: string; sound: "default"; title: string; body: string };

    const allMessages: PushMessage[] = tokens.map((t) => ({
      to: t.token,
      sound: "default" as const,
      title,
      body,
    }));

    let successCount = 0;
    let failureCount = 0;
    const deadTokens: string[] = [];

    // Sends a batch where all tokens belong to the same Expo project.
    // If Expo rejects due to mixed experience IDs, it splits and retries per group.
    async function sendSingleProjectBatch(batch: PushMessage[]): Promise<void> {
      let responseData: {
        data?: Array<{ status: string; message?: string; details?: { error?: string } }>;
        errors?: Array<{ code: string; message: string; details?: Record<string, string[]> }>;
      };
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
          },
          body: JSON.stringify(batch),
        });
        responseData = await response.json();
      } catch (err) {
        console.error("[Push] Network error sending to Expo:", err);
        failureCount += batch.length;
        return;
      }

      // Expo rejects batches mixing tokens from different projects — split and retry each group
      if (responseData.errors?.some(e => e.code === "PUSH_TOO_MANY_EXPERIENCE_IDS")) {
        const details = responseData.errors.find(e => e.code === "PUSH_TOO_MANY_EXPERIENCE_IDS")?.details ?? {};
        console.log(`[Push] Mixed experience IDs — splitting into ${Object.keys(details).length} groups`);
        for (const [experienceId, groupTokens] of Object.entries(details)) {
          const groupBatch = batch.filter(m => groupTokens.includes(m.to));
          if (!groupBatch.length) continue;
          console.log(`[Push] Retrying ${groupBatch.length} tokens for ${experienceId}`);
          await sendSingleProjectBatch(groupBatch);
        }
        return;
      }

      if (responseData.errors) {
        console.error("[Push] Expo API error:", JSON.stringify(responseData));
        failureCount += batch.length;
        return;
      }

      if (responseData.data) {
        responseData.data.forEach((result, index) => {
          const token = batch[index]?.to;
          if (result.status === "ok") {
            successCount++;
          } else {
            failureCount++;
            console.error(`[Push] Failed for token ${token}: ${result.message} (${result.details?.error})`);
            if (result.details?.error === "DeviceNotRegistered" && token) {
              deadTokens.push(token);
            }
          }
        });
      } else {
        console.error("[Push] Unexpected Expo response:", JSON.stringify(responseData));
        failureCount += batch.length;
      }
    }

    // Expo accepts up to 100 messages per request
    for (let i = 0; i < allMessages.length; i += 100) {
      await sendSingleProjectBatch(allMessages.slice(i, i + 100));
    }

    // Remove tokens for devices that have uninstalled the app
    for (const deadToken of deadTokens) {
      try {
        await storage.removePushToken(deadToken);
        console.log(`[Push] Removed unregistered token: ${deadToken}`);
      } catch (err) {
        console.error(`[Push] Failed to remove dead token ${deadToken}:`, err);
      }
    }

    if (failureCount > 0) {
      console.error(`[Push] Summary: ${successCount} delivered, ${failureCount} failed, ${deadTokens.length} dead tokens removed`);
    } else {
      console.log(`[Push] Summary: ${successCount} delivered successfully`);
    }

    return { tokens, successCount, failureCount };
  }

  app.post("/api/notifications/send", staffAuth, managerAuth, async (req: any, res) => {
    const { title, body } = req.body;
    if (!title || !body) return res.status(400).json({ message: "Title and body are required" });
    const tokens = await storage.getAllPushTokens();
    if (tokens.length === 0) return res.status(400).json({ message: "No registered devices" });
    const sentBy = (req as any).staffUsername;
    const { successCount, failureCount } = await sendPushNotifications(title, body, sentBy);
    const notification = await storage.saveNotification(title, body, successCount, sentBy);
    res.json({ sent: successCount, failed: failureCount, total: tokens.length, notification });
  });

  app.get("/api/notifications/history", staffAuth, managerAuth, async (_req, res) => {
    const history = await storage.getNotificationHistory();
    res.json(history);
  });

  // Staff portal push routes (used by web dashboard)
  app.get("/api/push/device-count", staffAuth, managerAuth, async (_req, res) => {
    const tokens = await storage.getAllPushTokens();
    res.json({ count: tokens.length });
  });

  app.get("/api/push/history", staffAuth, managerAuth, async (_req, res) => {
    const history = await storage.getNotificationHistory();
    res.json(history);
  });

  app.post("/api/push/send", staffAuth, managerAuth, async (req: any, res) => {
    const { title, body } = req.body;
    if (!title || !body) return res.status(400).json({ message: "Title and body are required" });
    const sentBy = (req as any).staffUsername;
    const tokens = await storage.getAllPushTokens();
    if (tokens.length === 0) {
      const notification = await storage.saveNotification(title, body, 0, sentBy);
      return res.json({ count: 0, failed: 0, notification });
    }
    const { successCount, failureCount } = await sendPushNotifications(title, body, sentBy);
    const notification = await storage.saveNotification(title, body, successCount, sentBy);
    res.json({ count: successCount, failed: failureCount, total: tokens.length, notification });
  });

  app.post("/api/bookings", async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const rl = checkRateLimit(`booking:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({ message: "Too many booking requests. Please wait before trying again." });
    }
    // Strip null optional fields so Zod treats them as absent
    const raw = { ...req.body };
    for (const key of ["tableNumber", "guestCount", "notes", "emailHash"] as const) {
      if (raw[key] === null || raw[key] === undefined) delete raw[key];
    }
    // Coerce tableNumber to string (may arrive as number from some clients)
    if (raw.tableNumber !== undefined) raw.tableNumber = String(raw.tableNumber);
    // Coerce duration to number
    if (raw.duration !== undefined) raw.duration = Number(raw.duration);
    console.log("[booking] raw body keys:", Object.keys(req.body), "tableNumber type:", typeof raw.tableNumber, "value:", raw.tableNumber);
    const parsed = insertBookingSchema.safeParse(raw);
    if (!parsed.success) {
      console.log("[booking] validation failed:", JSON.stringify(parsed.error.flatten()));
      return res.status(400).json({ message: "Invalid booking data", errors: parsed.error.flatten() });
    }
    if (!parsed.data.gdprConsent) {
      return res.status(400).json({ message: "GDPR consent is required to process your booking" });
    }

    const toSlotMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
    const POOL_TABLE_COUNT = 6;
    const DINING_TABLE_COUNT = 25;
    const DINING_TABLE_START = 18;
    let finalTableNumber = parsed.data.tableNumber ?? null;

    // Dining restrictions: Wednesday–Sunday only, 12:00–20:00
    if (parsed.data.tableType === "dining") {
      const bookingDate = new Date(parsed.data.date + "T00:00:00");
      const dow = bookingDate.getDay(); // 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
      if (![0, 3, 4, 5, 6].includes(dow)) {
        return res.status(400).json({ message: "Dining is only available Wednesday to Sunday" });
      }
      const startMins = toSlotMins(parsed.data.startTime);
      const endMins = startMins + (parsed.data.duration ?? 1) * 60;
      if (startMins < 12 * 60 || endMins > 20 * 60) {
        return res.status(400).json({ message: "Dining bookings must be between 12:00 and 20:00" });
      }
    }

    if (parsed.data.tableType === "dining") {
      // Auto-assign the lowest available dining table (18–42)
      const allDiningBookings = await storage.getBookingsByDate(parsed.data.date);
      const confirmedDining = allDiningBookings.filter(b => b.tableType === "dining" && b.status === "confirmed" && b.tableNumber);
      const reqStart = toSlotMins(parsed.data.startTime);
      const reqEnd = reqStart + (parsed.data.duration ?? 1) * 60;
      const occupiedTables = new Set<string>();
      for (const b of confirmedDining) {
        const bStart = toSlotMins(b.startTime);
        const bEnd = bStart + (b.duration ?? 1) * 60;
        if (reqStart < bEnd && reqEnd > bStart && b.tableNumber) {
          occupiedTables.add(b.tableNumber);
        }
      }
      let assigned: string | null = null;
      for (let i = DINING_TABLE_START; i < DINING_TABLE_START + DINING_TABLE_COUNT; i++) {
        if (!occupiedTables.has(String(i))) { assigned = String(i); break; }
      }
      if (!assigned) {
        return res.status(409).json({ message: "All dining tables are fully booked for this time slot" });
      }
      finalTableNumber = assigned;
    } else if (parsed.data.tableType === "pool") {
      // Pool: customer selects table number (1–6), require it
      if (!parsed.data.tableNumber) {
        return res.status(400).json({ message: "Please select a pool table number (1–6)" });
      }
      const poolNum = parseInt(parsed.data.tableNumber);
      if (poolNum < 1 || poolNum > POOL_TABLE_COUNT) {
        return res.status(400).json({ message: "Invalid pool table number. Choose between 1 and 6." });
      }
      // Per-table conflict check
      const bookedSlots = await storage.getBookedSlots(parsed.data.date, "pool", parsed.data.tableNumber);
      const requestedStart = parseInt(parsed.data.startTime.replace(":", ""));
      const requestedEnd = requestedStart + (parsed.data.duration ?? 1) * 100;
      for (const slot of bookedSlots) {
        const slotStart = parseInt(slot.startTime.replace(":", ""));
        const slotEnd = slotStart + slot.duration * 100;
        if (requestedStart < slotEnd && requestedEnd > slotStart) {
          return res.status(409).json({ message: `Pool table ${parsed.data.tableNumber} is already booked for this time slot` });
        }
      }
    } else if (parsed.data.tableType === "snooker") {
      // Snooker: customer must select a specific table (1–10)
      if (!parsed.data.tableNumber) {
        return res.status(400).json({ message: "Please select a snooker table number (1–10)" });
      }
      const snookerNum = parseInt(parsed.data.tableNumber);
      if (snookerNum < 1 || snookerNum > 10) {
        return res.status(400).json({ message: "Invalid snooker table number. Choose between 1 and 10." });
      }
      finalTableNumber = parsed.data.tableNumber;
      // Per-table conflict check
      const bookedSlots = await storage.getBookedSlots(parsed.data.date, "snooker", parsed.data.tableNumber);
      const requestedStart = parseInt(parsed.data.startTime.replace(":", ""));
      const requestedEnd = requestedStart + (parsed.data.duration ?? 1) * 100;
      for (const slot of bookedSlots) {
        const slotStart = parseInt(slot.startTime.replace(":", ""));
        const slotEnd = slotStart + slot.duration * 100;
        if (requestedStart < slotEnd && requestedEnd > slotStart) {
          return res.status(409).json({ message: `Snooker table ${parsed.data.tableNumber} is already booked for this time slot` });
        }
      }
    } else {
      // Standard per-table conflict check for darts and any other table type
      const bookedSlots = await storage.getBookedSlots(parsed.data.date, parsed.data.tableType, finalTableNumber ?? undefined);
      const requestedStart = parseInt(parsed.data.startTime.replace(":", ""));
      const requestedEnd = requestedStart + (parsed.data.duration ?? 1) * 100;
      for (const slot of bookedSlots) {
        const slotStart = parseInt(slot.startTime.replace(":", ""));
        const slotEnd = slotStart + slot.duration * 100;
        if (requestedStart < slotEnd && requestedEnd > slotStart) {
          return res.status(409).json({ message: "This time slot is already booked" });
        }
      }
    }

    const DEPOSIT_GUEST_THRESHOLD = 7;
    const DEPOSIT_AMOUNT_PENCE = 500; // £5
    // depositHandling (staff-only): 'mark_paid' | 'send_link' | undefined (widget default)
    // SECURITY: this route is intentionally public (the booking widget is
    // unauthenticated), but `depositHandling` is a staff-only field. Without
    // the check below, any unauthenticated caller could send
    // `"depositHandling":"mark_paid"` for a 7+ guest dining booking and the
    // server would create a confirmed booking with depositPaid=true,
    // bypassing the Square deposit step and reserving venue capacity for
    // free. We therefore validate the bearer staff session inline and
    // ignore `depositHandling` entirely unless a real staff user is
    // attached to the request. We deliberately do not 401 here — public
    // widget requests must continue to work — we just silently downgrade
    // to the normal deposit flow.
    const requestedDepositHandling = (req.body as { depositHandling?: string }).depositHandling;
    let staffUserForDeposit: any = null;
    if (requestedDepositHandling === "mark_paid" || requestedDepositHandling === "send_link") {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        if (token.length >= 32 && token.length <= 128) {
          try {
            const session = await storage.validateStaffSession(token);
            if (session?.staffUsername) {
              const user = await storage.getStaffUserByUsername(session.staffUsername);
              if (
                user &&
                user.active !== false &&
                user.approvalStatus !== "rejected" &&
                user.approvalStatus !== "pending"
              ) {
                staffUserForDeposit = user;
                (req as any).staffUser = user;
                (req as any).staffUsername = session.staffUsername;
                (req as any).staffRole = user.role || "staff";
              }
            }
          } catch {
            // Treat any session-validation error as no-staff and fall through.
          }
        }
      }
    }
    const depositHandling = staffUserForDeposit ? requestedDepositHandling : undefined;
    if (requestedDepositHandling && !staffUserForDeposit) {
      console.warn(
        `[BOOKING] Ignoring depositHandling=${requestedDepositHandling} from non-staff request (ip=${ip})`,
      );
    }
    const guestCount = parsed.data.guestCount ?? 0;
    const isLargeParty = parsed.data.tableType === "dining" && guestCount >= DEPOSIT_GUEST_THRESHOLD;

    // Staff marking deposit as taken in person — confirm immediately
    if (isLargeParty && depositHandling === "mark_paid") {
      const booking = await storage.createBooking({
        ...parsed.data,
        tableNumber: finalTableNumber ?? undefined,
        status: "confirmed",
        depositRequired: true,
        depositPaid: true,
      });
      {
        const u = (req as any).staffUser;
        if (u) {
          void storage.logBookingAction({
            bookingId: booking.id,
            action: "created",
            staffUsername: u.username,
            staffId: u.id ?? null,
            toValue: { customerName: booking.customerName, date: booking.date, startTime: booking.startTime, tableType: booking.tableType, tableNumber: booking.tableNumber, status: booking.status, depositPaid: true },
            note: "Created by staff (deposit marked as paid in person)",
          });
        }
      }
      sendBookingConfirmationEmail({
        customerName: parsed.data.customerName,
        customerEmail: parsed.data.customerEmail,
        tableType: parsed.data.tableType,
        tableNumber: parsed.data.tableNumber,
        date: parsed.data.date,
        startTime: parsed.data.startTime,
        duration: parsed.data.duration ?? 1,
        id: booking.id,
      }).catch((err) => console.error("[BOOKING] Email send error:", err));
      return res.status(201).json({ ...booking, depositHandled: "mark_paid" });
    }

    const requiresDeposit = isLargeParty && (!!process.env.SQUARE_DEPOSIT_LINK_URL || square.isConfigured());

    const booking = await storage.createBooking({
      ...parsed.data,
      tableNumber: finalTableNumber ?? undefined,
      status: requiresDeposit ? "pending_deposit" : "confirmed",
      depositRequired: requiresDeposit,
      depositPaid: false,
    });
    {
      const u = (req as any).staffUser;
      if (u) {
        void storage.logBookingAction({
          bookingId: booking.id,
          action: "created",
          staffUsername: u.username,
          staffId: u.id ?? null,
          toValue: { customerName: booking.customerName, date: booking.date, startTime: booking.startTime, tableType: booking.tableType, tableNumber: booking.tableNumber, status: booking.status, depositRequired: requiresDeposit },
          note: requiresDeposit ? "Created by staff (deposit pending)" : "Created by staff",
        });
      }
    }

    if (requiresDeposit) {
      const staticDepositUrl = process.env.SQUARE_DEPOSIT_LINK_URL;
      const bookingRef = `147-${booking.id.toString().padStart(5, "0")}`;

      // Use pre-created static Square link when available (avoids API link-creation issues)
      if (staticDepositUrl) {
        if (depositHandling === "send_link") {
          const emailSent = await sendDepositLinkEmail({
            customerName: parsed.data.customerName,
            customerEmail: parsed.data.customerEmail,
            guestCount,
            date: parsed.data.date,
            startTime: parsed.data.startTime,
            id: booking.id,
            depositPaymentUrl: staticDepositUrl,
          }).catch((err) => { console.error("[BOOKING] Deposit email error:", err); return false; });
          if (!emailSent) console.warn(`[BOOKING] Deposit link email FAILED for booking #${booking.id} — SMTP credentials may be invalid`);
          return res.status(201).json({ ...booking, depositRequired: true, depositHandled: "send_link", emailSent: emailSent === true, depositPaymentUrl: staticDepositUrl });
        }
        // Widget default
        return res.status(201).json({ ...booking, depositRequired: true, depositPaymentUrl: staticDepositUrl });
      }

      // Fallback: attempt dynamic Square payment link creation
      try {
        // Build the Square deposit return URL from the trusted configured
        // origin — POST /api/bookings is unauthenticated and the previous
        // header-based construction let anyone with a spoofed Host header
        // mint a real Square checkout link that redirects to an attacker
        // domain after payment.
        const redirectUrl = `${getPublicAppOrigin()}/api/bookings/${booking.id}/deposit-return`;
        const paymentLink = await square.createDepositPaymentLink({
          amountPence: DEPOSIT_AMOUNT_PENCE,
          description: `Dining Deposit – Booking ${bookingRef} (${guestCount} guests)`,
          referenceId: bookingRef,
          redirectUrl,
          buyerEmail: parsed.data.customerEmail,
        });
        // Store the Square order ID (not the link ID) so the webhook can
        // perform an exact server-side match via payment.order_id.
        const depositKey = paymentLink.orderId ?? paymentLink.paymentLinkId;
        await storage.updateBooking(booking.id, { depositPaymentId: depositKey });

        if (depositHandling === "send_link") {
          const emailSent = await sendDepositLinkEmail({
            customerName: parsed.data.customerName,
            customerEmail: parsed.data.customerEmail,
            guestCount,
            date: parsed.data.date,
            startTime: parsed.data.startTime,
            id: booking.id,
            depositPaymentUrl: paymentLink.url,
          }).catch((err) => { console.error("[BOOKING] Deposit email error:", err); return false; });
          if (!emailSent) console.warn(`[BOOKING] Deposit link email FAILED for booking #${booking.id}`);
          return res.status(201).json({ ...booking, depositRequired: true, depositHandled: "send_link", emailSent: emailSent === true });
        }

        return res.status(201).json({ ...booking, depositRequired: true, depositPaymentUrl: paymentLink.url });
      } catch (err: any) {
        console.error("[BOOKING] Deposit link error — Square code:", err?.code, "| message:", err?.message, "| status:", err?.statusCode);
        // Keep booking as pending_deposit — do NOT silently confirm.
        return res.status(503).json({
          message: "payment_link_failed",
          bookingRef,
          bookingId: booking.id,
        });
      }
    }

    sendBookingConfirmationEmail({
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
      tableType: parsed.data.tableType,
      tableNumber: parsed.data.tableNumber,
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      duration: parsed.data.duration ?? 1,
      id: booking.id,
    }).catch((err) => console.error("[BOOKING] Email send error:", err));

    res.status(201).json(booking);
  });

  // Staff-only: create repeat bookings (daily or weekly) — NOT available to customers or widget
  app.post("/api/staff/bookings/repeat", staffAuth, async (req, res) => {
    const { repeatType, repeatCount, ...bookingData } = req.body ?? {};
    if (!repeatType || !["daily", "weekly"].includes(repeatType)) {
      return res.status(400).json({ message: "repeatType must be 'daily' or 'weekly'" });
    }
    const count = Number(repeatCount);
    const maxCount = repeatType === "weekly" ? 6 : 42;
    if (!count || count < 2 || count > maxCount) {
      return res.status(400).json({ message: `repeatCount must be between 2 and ${maxCount} for ${repeatType} repeats` });
    }
    const raw = { ...bookingData };
    for (const key of ["tableNumber", "guestCount", "notes", "emailHash"] as const) {
      if (raw[key] === null || raw[key] === undefined) delete raw[key];
    }
    if (raw.tableNumber !== undefined) raw.tableNumber = String(raw.tableNumber);
    if (raw.duration !== undefined) raw.duration = Number(raw.duration);
    const parsed = insertBookingSchema.safeParse({ ...raw, gdprConsent: true });
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid booking data", errors: parsed.error.flatten() });
    }
    const intervalDays = repeatType === "daily" ? 1 : 7;
    const toSlotMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
    const DINING_TABLE_COUNT = 25;
    const DINING_TABLE_START = 18;
    const createdBookings: any[] = [];
    const skippedDates: string[] = [];
    const startDate = new Date(parsed.data.date + "T12:00:00Z");

    for (let i = 0; i < count; i++) {
      const d = new Date(startDate);
      d.setUTCDate(startDate.getUTCDate() + i * intervalDays);
      const dateStr = d.toISOString().split("T")[0];
      try {
        let finalTableNumber = parsed.data.tableNumber ?? null;
        if (parsed.data.tableType === "dining") {
          const allBookings = await storage.getBookingsByDate(dateStr);
          const confirmedDining = allBookings.filter(b => b.tableType === "dining" && b.status === "confirmed" && b.tableNumber);
          const reqStart = toSlotMins(parsed.data.startTime);
          const reqEnd = reqStart + (parsed.data.duration ?? 1) * 60;
          const occupied = new Set<string>();
          for (const b of confirmedDining) {
            const bStart = toSlotMins(b.startTime);
            const bEnd = bStart + (b.duration ?? 1) * 60;
            if (reqStart < bEnd && reqEnd > bStart && b.tableNumber) occupied.add(b.tableNumber);
          }
          let assigned: string | null = null;
          for (let t = DINING_TABLE_START; t < DINING_TABLE_START + DINING_TABLE_COUNT; t++) {
            if (!occupied.has(String(t))) { assigned = String(t); break; }
          }
          if (!assigned) { skippedDates.push(dateStr); continue; }
          finalTableNumber = assigned;
        } else {
          const bookedSlots = await storage.getBookedSlots(dateStr, parsed.data.tableType, finalTableNumber ?? undefined);
          const reqStart = parseInt(parsed.data.startTime.replace(":", ""));
          const reqEnd = reqStart + (parsed.data.duration ?? 1) * 100;
          let conflict = false;
          for (const slot of bookedSlots) {
            const sStart = parseInt(slot.startTime.replace(":", ""));
            const sEnd = sStart + slot.duration * 100;
            if (reqStart < sEnd && reqEnd > sStart) { conflict = true; break; }
          }
          if (conflict) { skippedDates.push(dateStr); continue; }
        }
        const booking = await storage.createBooking({ ...parsed.data, date: dateStr, tableNumber: finalTableNumber ?? undefined });
        createdBookings.push(booking);
        {
          const u = (req as any).staffUser;
          void storage.logBookingAction({
            bookingId: booking.id,
            action: "created",
            staffUsername: u?.username || (req as any).staffUsername || "unknown",
            staffId: u?.id ?? null,
            toValue: { customerName: booking.customerName, date: booking.date, startTime: booking.startTime, tableType: booking.tableType, tableNumber: booking.tableNumber },
            note: `Created via repeat (${repeatType}, ${i + 1} of ${count})`,
          });
        }
      } catch (err) {
        console.error(`[repeat-booking] Error for date ${dateStr}:`, err);
        skippedDates.push(dateStr);
      }
    }
    res.status(201).json({ created: createdBookings.length, skipped: skippedDates.length, skippedDates, bookings: createdBookings });
  });

  app.get("/api/bookings/availability", async (req, res) => {
    const { date, tableType, tableNumber, excludeId } = req.query;
    if (!date || !tableType) {
      return res.status(400).json({ message: "date and tableType are required" });
    }
    const POOL_TABLE_COUNT = 6;
    const DINING_TABLE_COUNT = 25;
    const excludeBookingId = excludeId ? parseInt(String(excludeId)) : undefined;
    // For dining: return all dining bookings so the frontend can count concurrent usage
    if (String(tableType) === "dining") {
      const bookedSlots = await storage.getBookedSlots(String(date), "dining", undefined, excludeBookingId);
      return res.json({ slots: bookedSlots, totalTables: DINING_TABLE_COUNT });
    }
    // For pool/snooker: per-table availability check requires a table number
    const bookedSlots = await storage.getBookedSlots(String(date), String(tableType), tableNumber ? String(tableNumber) : undefined, excludeBookingId);
    res.json({ slots: bookedSlots, totalTables: tableNumber ? 1 : POOL_TABLE_COUNT });
  });

  // Staff notices
  app.get("/api/staff-notices", staffAuth, async (_req, res) => {
    const notices = await storage.getStaffNotices();
    res.json(notices);
  });

  app.post("/api/staff-notices", staffAuth, managerAuth, async (req: any, res) => {
    const { message, colour } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "Notice message is required" });
    }
    const validColour = ["amber", "red", "green"].includes(colour) ? colour : "amber";
    const createdBy = (req as any).staffUsername || "Manager";
    const notice = await storage.createStaffNotice(message.trim(), createdBy, validColour);
    res.status(201).json(notice);
  });

  app.get("/api/staff-notices/history", staffAuth, managerAuth, async (_req, res) => {
    const notices = await storage.getDeletedStaffNotices();
    res.json(notices);
  });

  app.delete("/api/staff-notices/:id", staffAuth, managerAuth, async (req: any, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid notice ID" });
    const deletedBy = (req as any).staffUsername || "Manager";
    const deleted = await storage.deleteStaffNotice(id, deletedBy);
    if (!deleted) return res.status(404).json({ message: "Notice not found" });
    res.status(204).send();
  });

  // Staff login pop-up notifications
  app.get("/api/staff-popups", staffAuth, async (_req, res) => {
    const popups = await storage.getStaffPopups();
    res.json(popups);
  });

  app.post("/api/staff-popups", staffAuth, managerAuth, async (req: any, res) => {
    const { title, message, colour } = req.body;
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "Popup title is required" });
    }
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "Popup message is required" });
    }
    const validColour = ["amber", "red", "green"].includes(colour) ? colour : "amber";
    const createdBy = (req as any).staffUsername || "Manager";
    const popup = await storage.createStaffPopup(title.trim(), message.trim(), validColour, createdBy);
    res.status(201).json(popup);
  });

  app.delete("/api/staff-popups/:id", staffAuth, managerAuth, async (req: any, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid popup ID" });
    const deletedBy = (req as any).staffUsername || "Manager";
    const deleted = await storage.deleteStaffPopup(id, deletedBy);
    if (!deleted) return res.status(404).json({ message: "Popup not found" });
    res.status(204).send();
  });

  app.get("/api/bookings", staffAuth, async (req, res) => {
    const { date } = req.query;
    if (date) {
      const bookingsList = await storage.getBookingsByDate(String(date));
      return res.json(bookingsList);
    }
    const allBookings = await storage.getBookings();
    res.json(allBookings);
  });

  app.get("/api/bookings/:id", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const booking = await storage.getBooking(id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    res.json(booking);
  });

  // ── Square Webhook — auto-confirm deposit bookings on payment ────────────────
  app.post("/api/webhooks/square", async (req, res) => {
    // Square webhook signature verification is MANDATORY. If the signing key
    // is not configured we fail closed (503) rather than processing untrusted
    // events — this endpoint mutates payment-sensitive state (confirms
    // deposit bookings, activates / freezes memberships) so accepting
    // unauthenticated POSTs would let anyone forge confirmations.
    const sigKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    if (!sigKey) {
      console.error("[WEBHOOK] SQUARE_WEBHOOK_SIGNATURE_KEY is not set — rejecting webhook");
      return res.status(503).json({ message: "Webhook verification not configured" });
    }
    const signature = req.headers["x-square-hmacsha256-signature"] as string | undefined;
    if (!signature) {
      console.warn("[WEBHOOK] Missing Square signature header");
      return res.status(401).json({ message: "Missing signature" });
    }
    try {
      const { createHmac, timingSafeEqual } = await import("node:crypto");
      const notificationUrl = process.env.SQUARE_WEBHOOK_URL ||
        `https://${process.env.EXPO_PUBLIC_DOMAIN || req.get("host")}/api/webhooks/square`;
      const rawBody = (req as any).rawBody?.toString("utf8") ?? JSON.stringify(req.body);
      const hmac = createHmac("sha256", sigKey);
      hmac.update(notificationUrl + rawBody);
      const expected = hmac.digest("base64");
      const sigBuf = Buffer.from(signature, "base64");
      const expBuf = Buffer.from(expected, "base64");
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        console.warn("[WEBHOOK] Square signature mismatch");
        return res.status(403).json({ message: "Invalid signature" });
      }
    } catch (sigErr) {
      console.error("[WEBHOOK] Signature check error:", sigErr);
      return res.status(500).json({ message: "Signature check failed" });
    }

    const event = req.body;
    const eventType: string = event?.type ?? "";
    console.log("[WEBHOOK] Square event received:", eventType);

    // ── subscription.updated / subscription.activated ───────────────────────
    // NOTE: We intentionally do NOT promote local status to "active" here.
    // Activation is handled exclusively by the invoice.payment_made event once
    // Square confirms the first (or any subsequent) payment has succeeded.
    // This handler only syncs non-entitlement lifecycle changes (pause/cancel/pending)
    // and period metadata, so period dates stay current without granting paid access.
    if (eventType === "subscription.updated" || eventType === "subscription.activated") {
      try {
        const sqSub = event?.data?.object?.subscription;
        if (sqSub?.id) {
          const allSubs = await storage.getMembershipSubscriptions();
          const local = allSubs.find(s => s.squareSubscriptionId === sqSub.id);
          if (local) {
            // Only sync non-entitlement status changes. Never promote to "active"
            // from subscription lifecycle alone — invoice.payment_made handles that.
            const nonActiveStatus =
              sqSub.status === "PAUSED" ? "paused" :
              sqSub.status === "CANCELED" ? "cancelled" :
              sqSub.status === "PENDING" ? "pending" : null;
            // sqSub.status === "ACTIVE": do not change local status here.
            await storage.updateMembershipSubscription(local.id, {
              currentPeriodStart: sqSub.start_date ?? local.currentPeriodStart ?? undefined,
              currentPeriodEnd: sqSub.charged_through_date ?? local.currentPeriodEnd ?? undefined,
              ...(nonActiveStatus ? { status: nonActiveStatus } : {}),
            });
            console.log(`[WEBHOOK] Local membership #${local.id} synced from Square subscription (sqStatus=${sqSub.status}, localStatus unchanged for ACTIVE)`);
          }
        }
      } catch (err) { console.error("[WEBHOOK] subscription.updated error:", err); }
      return res.sendStatus(200);
    }

    // ── invoice.payment_failed (recurring subscription renewal failure) ──────
    if (eventType === "invoice.payment_failed") {
      try {
        const invoice = event?.data?.object?.invoice;
        const sqSubId: string | undefined = invoice?.subscription_id;
        if (sqSubId) {
          const allSubs = await storage.getMembershipSubscriptions();
          const local = allSubs.find(s => s.squareSubscriptionId === sqSubId);
          if (local) {
            const newAttempts = (local.failedPaymentAttempts ?? 0) + 1;
            const shouldFreeze = newAttempts >= 3;
            await storage.updateMembershipSubscription(local.id, {
              failedPaymentAttempts: newAttempts,
              ...(shouldFreeze ? { status: "frozen" } : {}),
            });
            console.log(`[WEBHOOK] Membership #${local.id} renewal failed (attempt ${newAttempts})${shouldFreeze ? " — FROZEN" : ""}`);

            const customer = await storage.getCustomerById(local.customerId).catch(() => null);
            if (customer?.email) {
              const tokens = await storage.getPushTokensByEmail(customer.email).catch(() => [] as { token: string }[]);
              if (tokens.length > 0) {
                const title = shouldFreeze ? "Membership Suspended" : newAttempts === 2 ? "Renewal Failed Again" : "Renewal Payment Failed";
                const body = shouldFreeze
                  ? "Your membership has been suspended after 3 failed renewal payments. Please update your payment details."
                  : newAttempts === 2
                  ? `Renewal failed (${newAttempts}/3). One more failure will suspend your membership.`
                  : "Your monthly membership renewal payment failed. Please ensure your card is up to date.";
                await sendTargetedPush(tokens.map((t: { token: string }) => t.token), title, body).catch(() => {});
              }
            }
          }
        }
      } catch (err) { console.error("[WEBHOOK] invoice.payment_failed error:", err); }
      return res.sendStatus(200);
    }

    // ── subscription.created — link Square subscription ID to local record ────
    if (eventType === "subscription.created") {
      try {
        const sqSub = event?.data?.object?.subscription;
        if (sqSub?.id && sqSub?.customer_id) {
          const allSubs = await storage.getMembershipSubscriptions();
          const local = allSubs.find(s =>
            s.squareCustomerId === sqSub.customer_id &&
            (s.status === "pending" || s.status === "pending_payment") &&
            !s.squareSubscriptionId
          );
          if (local) {
            await storage.updateMembershipSubscription(local.id, { squareSubscriptionId: sqSub.id });
            console.log(`[WEBHOOK] Linked Square subscription ${sqSub.id} → local #${local.id}`);
          }
        }
      } catch (err) { console.error("[WEBHOOK] subscription.created error:", err); }
      return res.sendStatus(200);
    }

    // ── invoice.payment_made — activate on first payment, renew monthly ──────
    if (eventType === "invoice.payment_made") {
      try {
        const invoice = event?.data?.object?.invoice;
        const sqSubId: string | undefined = invoice?.subscription_id;
        if (sqSubId) {
          const allSubs = await storage.getMembershipSubscriptions();
          const local = allSubs.find(s => s.squareSubscriptionId === sqSubId);
          if (local) {
            const next = new Date();
            next.setMonth(next.getMonth() + 1);
            const nextPeriodEnd = invoice.next_payment_due_date ?? next.toISOString().slice(0, 10);
            const wasAlreadyActive = local.status === "active";
            await storage.updateMembershipSubscription(local.id, {
              status: "active",
              failedPaymentAttempts: 0,
              currentPeriodStart: new Date().toISOString().slice(0, 10),
              currentPeriodEnd: nextPeriodEnd,
            });
            console.log(`[WEBHOOK] Membership #${local.id} payment received — active until ${nextPeriodEnd}`);
            if (wasAlreadyActive) {
              const customer = await storage.getCustomerById(local.customerId).catch(() => null);
              if (customer?.email) {
                const tokens = await storage.getPushTokensByEmail(customer.email).catch(() => [] as { token: string }[]);
                if (tokens.length > 0) {
                  await sendTargetedPush(
                    tokens.map((t: { token: string }) => t.token),
                    "Membership Renewed",
                    `Your membership has been renewed and is active until ${nextPeriodEnd}.`
                  ).catch(() => {});
                }
              }
            }
          }
        }
      } catch (err) { console.error("[WEBHOOK] invoice.payment_made error:", err); }
      return res.sendStatus(200);
    }

    // ── Square Loyalty events ──────────────────────────────────────────────
    // Fire a push to the linked customer whenever their balance changes
    // (earn/redeem/adjust at the till, manual staff adjustment, etc.). We
    // only act on accumulate/redeem/adjust events that actually move points.
    // Other event types (CREATE_REWARD, DELETE_REWARD, etc.) are ignored.
    if (eventType === "loyalty.event.created") {
      try {
        const loyaltyEvent = event?.data?.object?.loyalty_event ?? event?.data?.object?.event;
        if (!loyaltyEvent) return res.sendStatus(200);

        const accountId: string | undefined = loyaltyEvent.loyalty_account_id;
        const evtType: string = loyaltyEvent.type ?? "";
        if (!accountId) return res.sendStatus(200);

        // The birthday-bonus credit is granted from inside /api/loyalty/me
        // and is followed by an immediate UI refresh in the same response,
        // so the user sees the new points without needing a push. We detect
        // those by the `reason` we pass to adjustLoyaltyPoints.
        const adjustReason: string = loyaltyEvent.adjust_points?.reason ?? "";
        const isOurOwnBirthdayBonus = adjustReason.startsWith("Birthday bonus");

        const customer = await storage.getCustomerBySquareLoyaltyAccountId(accountId);
        if (!customer) {
          console.log(`[WEBHOOK] loyalty.event.created for unknown account ${accountId} — ignored`);
          return res.sendStatus(200);
        }

        // Build the push copy based on the specific event. We only send a
        // push when the event represents a real, non-zero change the
        // customer should know about — otherwise we ack and drop. This
        // keeps "0-point" events (which Square does emit for some flows)
        // from generating a useless "Points updated" buzz.
        let title: string | null = null;
        let body: string | null = null;
        if (evtType === "ACCUMULATE_POINTS") {
          const earned = loyaltyEvent.accumulate_points?.points ?? 0;
          if (earned > 0) {
            title = "You earned points 🎱";
            body = `You just earned ${earned} point${earned === 1 ? "" : "s"} at The 147. Open the app to see your new balance.`;
          }
        } else if (evtType === "REDEEM_REWARD") {
          title = "Reward redeemed 🎉";
          body = "Your reward has been applied. Enjoy!";
        } else if (evtType === "ADJUST_POINTS" && !isOurOwnBirthdayBonus) {
          const adj = loyaltyEvent.adjust_points?.points ?? 0;
          if (adj > 0) {
            title = "Bonus points added";
            body = `${adj} bonus point${adj === 1 ? "" : "s"} added to your balance.`;
          } else if (adj < 0) {
            title = "Points adjusted";
            body = `${Math.abs(adj)} point${Math.abs(adj) === 1 ? "" : "s"} were removed from your balance.`;
          }
        }
        if (!title || !body) {
          // Not an event we want to push for — ack and move on.
          return res.sendStatus(200);
        }

        const { sendPushToCustomerEmail } = await import("./push");
        await sendPushToCustomerEmail(customer.email, title, body, {
          type: "loyalty_balance_changed",
          accountId,
        });
        console.log(`[WEBHOOK] Loyalty push sent to customer ${customer.id} for ${evtType}`);
      } catch (err) {
        console.error("[WEBHOOK] loyalty.event.created error:", err);
      }
      return res.sendStatus(200);
    }

    // We could also subscribe to loyalty.account.balance_changed in Square, but
    // every balance change is already paired with a loyalty.event.created so
    // handling both would just duplicate pushes. Acknowledge and ignore.
    if (eventType === "loyalty.account.balance_changed") {
      return res.sendStatus(200);
    }

    // ── Square KDS fulfillment sync (FEATURE_KDS_SYNC) ──────────────────────
    // When kitchen staff hit "Complete" on Square KDS, Square emits this
    // event. We mirror the COMPLETED transition into our app_orders table so
    // the customer's receipt screen and the staff portal both flip to
    // "Order complete" without anyone having to tap a second time in our
    // dashboard. Intermediate fulfillment states (RESERVED/PREPARED) are
    // intentionally NOT mapped — they would race with the staff portal's
    // manual "Start preparing" / "Mark ready" workflow and cause the order
    // to flicker between states. Gated behind the kdsSync flag so the
    // dashboard "Complete" buttons keep being the source of truth until
    // the venue is happy with the KDS workflow.
    if (eventType === "order.fulfillment.updated") {
      if (!getServerFeatureFlags().kdsSync) return res.sendStatus(200);
      try {
        const update = event?.data?.object?.order_fulfillment_updated;
        const sqOrderId: string | undefined = update?.order_id;
        const transitions: any[] = Array.isArray(update?.fulfillment_update)
          ? update.fulfillment_update : [];
        const becameCompleted = transitions.some((t: any) => t?.new_state === "COMPLETED");
        if (!sqOrderId || !becameCompleted) return res.sendStatus(200);

        const appOrder = await storage.getOrderBySquareOrderId(sqOrderId);
        if (!appOrder) {
          // Not one of our app orders — could be a POS-originated order
          // sharing the same KDS. Silently ack.
          return res.sendStatus(200);
        }
        // Don't move backwards out of a terminal state, and don't fire if
        // the staff portal already advanced this order to delivered/collected.
        const ALREADY_DONE = new Set([
          "completed", "delivered", "collected", "cancelled", "refunded",
        ]);
        if (ALREADY_DONE.has(appOrder.status)) {
          console.log(`[WEBHOOK] KDS sync: order #${appOrder.id} already ${appOrder.status} — skipping`);
          return res.sendStatus(200);
        }
        // Only sync from kitchen-lifecycle states. If the order isn't paid
        // yet (e.g. webhooks arrived out of order, or it was cancelled
        // before the kitchen got to it) we skip rather than guess.
        const SYNCABLE = new Set(["paid", "preparing", "ready"]);
        if (!SYNCABLE.has(appOrder.status)) {
          return res.sendStatus(200);
        }

        const fromStatus = appOrder.status;
        await storage.updateAppOrderStatus(appOrder.id, "completed");
        await storage.logOrderAction({
          orderId: appOrder.id,
          staffUsername: "system:square-kds",
          action: "advance:completed",
        });
        console.log(`[WEBHOOK] KDS sync: order #${appOrder.id} ${fromStatus}→completed`);

        // Notify the originating device. Same data shape as the staff
        // advance route so the existing deep-link handler (type:
        // "order-status") routes the tap back into the receipt screen.
        if (appOrder.pushToken) {
          const ref = appOrder.id.toString().padStart(5, "0");
          const data = {
            type: "order-status" as const,
            appOrderId: appOrder.id,
            token: appOrder.confirmationToken ?? "",
            status: "completed",
          };
          sendTargetedPush(
            [appOrder.pushToken],
            "Order complete 🎉",
            `Order #${ref} is complete — enjoy!`,
            data,
          ).catch((err: any) => {
            console.error("[Push] KDS-sync notification failed:", err?.message ?? err);
          });
        }
      } catch (err) {
        console.error("[WEBHOOK] order.fulfillment.updated error:", err);
      }
      return res.sendStatus(200);
    }

    // ── Live Tables / POS sync ─────────────────────────────────────────────
    // When a check is opened in Square POS for a table, Square fires
    // order.created; every item add/edit fires order.updated. We mirror these
    // into the table_sessions table so the Live Tables screen can show "in
    // use" with the running total. The ticket_name (the label staff type into
    // Square POS — e.g. "Snooker 4") is parsed for the table type + number.
    if (eventType === "order.created" || eventType === "order.updated") {
      try {
        const order = event?.data?.object?.order_created || event?.data?.object?.order_updated || event?.data?.object?.order;
        const orderId: string | undefined = order?.order_id || order?.id || event?.data?.id;
        if (orderId) {
          const full = await square.getOrder(orderId).catch(() => null);
          if (full) await syncSquareOrderToSession(full);
        }
      } catch (err) {
        console.error("[WEBHOOK] table-session sync error:", err);
      }
      // Don't return — fall through so KDS / other order.updated handlers
      // above still ran (they returned earlier if they matched).
      return res.sendStatus(200);
    }

    if (eventType !== "payment.updated") return res.sendStatus(200);
    const payment = event?.data?.object?.payment;
    if (!payment) return res.sendStatus(200);

    const paymentStatus: string = payment.status ?? "";
    const amountPence = payment.amount_money?.amount;
    const currency = payment.amount_money?.currency;
    const paymentNote: string = payment.note || payment.payment_note || "";

    // ── Live Tables / POS sync — payment side ──────────────────────────────
    // When a Square payment completes, look up the table session by the
    // associated order id and stamp the payment method (CARD / CASH / etc.)
    // so the staff portal can show "Paid by card" instead of just "Paid".
    if (paymentStatus === "COMPLETED" && payment.order_id) {
      try {
        const fresh = await square.getOrder(payment.order_id).catch(() => null);
        if (fresh) await syncSquareOrderToSession(fresh);
        const sourceType: string = payment.source_type || "";
        const cardBrand: string = payment.card_details?.card?.card_brand || "";
        const method = sourceType === "CARD" ? (cardBrand ? `CARD (${cardBrand})` : "CARD") : sourceType || "PAID";
        await db.update(tableSessions)
          .set({ paymentMethod: method, lastSyncedAt: new Date() })
          .where(dEq(tableSessions.squareOrderId, payment.order_id));
      } catch (err) {
        console.error("[WEBHOOK] table-session payment sync error:", err);
      }
    }

    // ── Membership payment (completed or failed) ────────────────────────────
    if (paymentNote.startsWith("MEMBERSHIP:")) {
      const subId = parseInt(paymentNote.split(":")[1] ?? "");
      if (!isNaN(subId)) {
        try {
          const sub = await storage.getMembershipSubscription(subId);
          if (!sub) return res.sendStatus(200);

          if (paymentStatus === "COMPLETED") {
            await storage.updateMembershipSubscription(subId, {
              status: "active",
              failedPaymentAttempts: 0,
            });
            console.log(`[WEBHOOK] Membership #${subId} activated`);

            // Sync Square customer group
            if (sub.squareCustomerId) {
              const plan = await storage.getMembershipPlan(sub.planId).catch(() => null);
              if (plan) {
                const allPlans = await storage.getMembershipPlans();
                const allGroupNames = allPlans.map(p => square.membershipGroupName(p.name));
                const currentGroupIds = await square.getCustomerGroupIds(sub.squareCustomerId).catch(() => [] as string[]);
                const allGroups = await square.listCustomerGroups().catch(() => [] as { id: string; name: string }[]);
                for (const group of allGroups) {
                  if (allGroupNames.includes(group.name) && currentGroupIds.includes(group.id)) {
                    await square.removeCustomerFromGroup(sub.squareCustomerId, group.id).catch(() => {});
                  }
                }
                const groupId = await square.getOrCreateCustomerGroup(square.membershipGroupName(plan.name)).catch(() => null);
                if (groupId) await square.addCustomerToGroup(sub.squareCustomerId, groupId).catch(() => {});

                // ── Set up recurring Square subscription ────────────────────
                const sqLocId = process.env.SQUARE_LOC_ID || process.env.SQUARE_LOCATION_ID;
                if (plan.squarePlanVariationId && !sub.squareSubscriptionId && sqLocId) {
                  const sqSub = await square.createSquareSubscription(
                    sub.squareCustomerId,
                    plan.squarePlanVariationId,
                    sqLocId
                  ).catch((e) => { console.warn("[WEBHOOK] Recurring subscription setup failed:", e.message); return null; });
                  if (sqSub) {
                    await storage.updateMembershipSubscription(subId, {
                      squareSubscriptionId: sqSub.id,
                      currentPeriodEnd: sqSub.charged_through_date ?? undefined,
                    });
                    console.log(`[WEBHOOK] Recurring Square subscription ${sqSub.id} created for membership #${subId}`);
                  }
                }
              }
            }
          } else if (paymentStatus === "FAILED") {
            const newAttempts = (sub.failedPaymentAttempts ?? 0) + 1;
            const shouldFreeze = newAttempts >= 3;
            await storage.updateMembershipSubscription(subId, {
              failedPaymentAttempts: newAttempts,
              ...(shouldFreeze ? { status: "frozen" } : {}),
            });
            console.log(`[WEBHOOK] Membership #${subId} payment failed (attempt ${newAttempts})${shouldFreeze ? " — FROZEN" : ""}`);

            const customer = await storage.getCustomerById(sub.customerId).catch(() => null);
            if (customer?.email) {
              const tokens = await storage.getPushTokensByEmail(customer.email).catch(() => [] as { token: string }[]);
              if (tokens.length > 0) {
                const title = shouldFreeze ? "Membership Suspended" : newAttempts === 2 ? "Payment Failed Again" : "Membership Payment Failed";
                const body = shouldFreeze
                  ? "Your membership benefits have been suspended after 3 failed payments. Please retry payment to restore access."
                  : newAttempts === 2
                  ? `Your membership payment failed (attempt ${newAttempts}/3). One more failure will suspend your benefits. Please retry.`
                  : "Your membership payment failed. Please retry to keep your benefits active.";
                await sendTargetedPush(tokens.map((t: { token: string }) => t.token), title, body).catch(() => {});
              }
            }
          }
        } catch (mErr) {
          console.error("[WEBHOOK] Membership payment error:", mErr);
        }
      }
      return res.sendStatus(200);
    }

    // ── App order payment tracking ──────────────────────────────────────────
    if (paymentStatus === "COMPLETED") {
      const paymentOrderId = payment.order_id as string | undefined;
      if (paymentOrderId) {
        try {
          const appOrder = await storage.getOrderBySquareOrderId(paymentOrderId);
          if (appOrder && appOrder.status === "pending") {
            // updateAppOrderPaid is now atomic (status='pending' guard),
            // so we only run side-effects when the row was actually
            // transitioned. This deduplicates audit/push when two webhooks
            // race for the same payment.
            const transitioned = await storage.updateAppOrderPaid(paymentOrderId, payment.id);
            if (transitioned) {
              console.log(`[WEBHOOK] App order #${appOrder.id} marked paid (Square order: ${paymentOrderId})`);
              await storage.logOrderAction({
                orderId: appOrder.id,
                staffUsername: "system",
                action: "paid",
                reason: `Square payment ${payment.id}`,
              }).catch((e: any) => console.error("[WEBHOOK] Audit log failed:", e.message));
            }
            return res.sendStatus(200);
          }
        } catch (err: any) {
          console.error("[WEBHOOK] App order status update failed:", err.message);
        }
      }
    }

    // ── Deposit payment (£5 completed only) ────────────────────────────────
    if (paymentStatus !== "COMPLETED") return res.sendStatus(200);
    if (amountPence !== 500 || currency !== "GBP") return res.sendStatus(200);
    console.log(`[WEBHOOK] £5 deposit payment completed — payment ID: ${payment.id}`);

    try {
      let booking: Awaited<ReturnType<typeof storage.getBooking>> | undefined;

      // Strategy 0: exact match via payment_note booking reference
      // (dynamic-link path sets payment_note to the '147-XXXXX' ref)
      if (paymentNote && paymentNote.startsWith("147-")) {
        const bookingId = parseInt(paymentNote.replace("147-", "").replace(/^0+/, "") || "0");
        if (!isNaN(bookingId) && bookingId > 0) {
          const byRef = await storage.getBooking(bookingId).catch(() => undefined);
          if (byRef && byRef.status === "pending_deposit") {
            booking = byRef;
            console.log(`[WEBHOOK] Matched booking #${booking.id} by reference: ${paymentNote}`);
          }
        }
      }

      // Strategy 0.5: exact server-side match via Square order ID stored at
      // payment-link creation time. This is the most tamper-proof binding for
      // dynamic links because the key is generated server-side and never
      // exposed to the customer.
      if (!booking) {
        const paymentOrderId = payment.order_id as string | undefined;
        if (paymentOrderId) {
          const byOrderId = await storage.getBookingByDepositPaymentId(paymentOrderId).catch(() => undefined);
          if (byOrderId && byOrderId.status === "pending_deposit") {
            booking = byOrderId;
            console.log(`[WEBHOOK] Matched booking #${booking.id} by Square order ID: ${paymentOrderId}`);
          }
        }
      }

      // No further fallbacks. Email-based matching is intentionally omitted:
      // it cannot distinguish which booking the payer intended and allows
      // wrong-booking confirmation (especially in static-link mode where all
      // bookings share one Square URL). If neither Strategy 0 nor 0.5 matched,
      // the payment is left unreconciled for manual staff review.
      if (!booking) {
        console.warn("[WEBHOOK] No server-bound pending_deposit booking found for this payment — leaving unconfirmed for manual review");
        return res.sendStatus(200);
      }

      // Confirm the booking and store the Square payment ID for future refunds
      await storage.updateBooking(booking.id, {
        depositPaid: true,
        status: "confirmed",
        squarePaymentId: payment.id ?? null,
      });
      console.log(`[WEBHOOK] Booking #${booking.id} confirmed automatically after deposit payment`);
      void storage.logBookingAction({
        bookingId: booking.id,
        action: "status_changed",
        staffUsername: "system:square-webhook",
        staffId: null,
        fromValue: { status: booking.status, depositPaid: booking.depositPaid },
        toValue: { status: "confirmed", depositPaid: true, squarePaymentId: payment.id ?? null },
        note: `Auto-confirmed after Square deposit payment ${payment.id ?? "(unknown id)"}`,
      });

      // Send confirmation email
      sendBookingConfirmationEmail({
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        tableType: booking.tableType,
        tableNumber: booking.tableNumber,
        date: booking.date,
        startTime: booking.startTime,
        duration: booking.duration,
        id: booking.id,
      }).catch(() => {});

    } catch (err) {
      console.error("[WEBHOOK] Error processing Square webhook:", err);
    }

    res.sendStatus(200);
  });

  // Deposit return — Square redirects here after payment
  app.get("/api/bookings/:id/deposit-return", async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).send("Invalid booking ID");

    // Do NOT mutate booking state here. Payment confirmation is handled exclusively
    // by the Square webhook (POST /api/square/webhook), which verifies the payment
    // was actually completed before marking depositPaid and status as confirmed.
    // Trusting this browser redirect alone would allow anyone with a booking ID to
    // bypass the deposit requirement without sending money.

    const bookingRef = `147-${id.toString().padStart(5, "0")}`;
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment Received</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb}div{text-align:center;padding:32px}</style></head><body><div><div style="font-size:48px">&#10003;</div><h2 style="color:#16A34A">Payment Received</h2><p>Your deposit for booking <strong>${bookingRef}</strong> has been submitted.</p><p style="color:#6b7280;font-size:14px">Your booking will be confirmed shortly. You can close this window and return to The 147 app.</p></div></body></html>`);
  });

  // Staff: mark a booking as completed and auto-refund any paid deposit
  app.patch("/api/bookings/:id/complete", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const booking = await storage.getBooking(id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    let depositRefunded = false;
    let refundId: string | undefined;
    let refundError: string | undefined;

    if (booking.depositPaid && booking.squarePaymentId && !booking.depositRefunded) {
      try {
        const DEPOSIT_AMOUNT_PENCE = parseInt(process.env.DEPOSIT_AMOUNT_PENCE ?? "500", 10);
        const refund = await square.createRefund({
          paymentId: booking.squarePaymentId,
          amountPence: DEPOSIT_AMOUNT_PENCE,
          reason: `Booking ${"147-" + id.toString().padStart(5, "0")} completed — deposit returned`,
          idempotencyKey: `deposit-refund-${id}-${Date.now()}`,
        });
        depositRefunded = true;
        refundId = refund.id;
        console.log(`[COMPLETE] Deposit refund ${refund.id} issued for booking #${id}`);
      } catch (refErr: unknown) {
        const msg = refErr instanceof Error ? refErr.message : String(refErr);
        refundError = msg;
        console.error(`[COMPLETE] Deposit refund FAILED for booking #${id}:`, msg);
      }
    }

    await storage.updateBooking(id, {
      status: "completed",
      ...(depositRefunded ? { depositRefunded: true } : {}),
    } as Parameters<typeof storage.updateBooking>[1]);
    {
      const u = (req as any).staffUser;
      const note = depositRefunded
        ? `Deposit refund issued (${refundId})`
        : refundError
          ? `Refund attempted but failed: ${refundError}`
          : (booking.depositPaid ? "No refund (already refunded earlier)" : "No deposit on file");
      void storage.logBookingAction({
        bookingId: id,
        action: "completed",
        staffUsername: u?.username || (req as any).staffUsername || "unknown",
        staffId: u?.id ?? null,
        fromValue: { status: booking.status, depositRefunded: booking.depositRefunded },
        toValue: { status: "completed", depositRefunded: depositRefunded || booking.depositRefunded, refundId: refundId ?? null },
        note,
      });
    }

    // ── Phase 3: award visit-based loyalty points ──
    // Only run when transitioning *into* completed (so re-completing a
    // booking can't double-credit), and only when the booker has a
    // matching customer record with a linked Square loyalty account.
    // Square's accumulate API uses our idempotency key (`visit-{id}`),
    // which provides a second layer of double-award protection.
    let pointsAwarded = 0;
    let pointsDoubled = false;
    if (booking.status !== "completed") {
      try {
        const cust = await storage.getCustomerByEmail(booking.customerEmail);
        if (cust?.squareLoyaltyAccountId && square.isConfigured()) {
          const cfg = await loadLoyaltyConfig();
          const base = cfg.visitPoints;
          const multiplier = cfg.doublePointsToday ? 2 : 1;
          const amount = base * multiplier;
          if (amount > 0) {
            await square.accumulateLoyaltyPoints(
              cust.squareLoyaltyAccountId,
              amount,
              `visit-${id}`,
            );
            pointsAwarded = amount;
            pointsDoubled = multiplier > 1;
            console.log(`[LOYALTY] Awarded ${amount} visit pts (x${multiplier}) to customer ${cust.id} for booking #${id}`);
          }
        }
      } catch (lpErr: any) {
        console.error(`[LOYALTY] Visit-points award failed for booking #${id}:`, lpErr.message);
      }
    }

    res.json({
      message: "Booking marked as completed",
      depositRefunded,
      refundId,
      refundError,
      loyalty: { pointsAwarded, doublePoints: pointsDoubled },
    });
  });

  // Staff: mark a booking as no-show — deposit is kept, no refund issued
  app.patch("/api/bookings/:id/noshow", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const booking = await storage.getBooking(id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    await storage.updateBooking(id, { status: "no_show" } as Parameters<typeof storage.updateBooking>[1]);
    console.log(`[NO-SHOW] Booking #${id} marked as no-show — deposit retained`);
    {
      const u = (req as any).staffUser;
      void storage.logBookingAction({
        bookingId: id,
        action: "noshow",
        staffUsername: u?.username || (req as any).staffUsername || "unknown",
        staffId: u?.id ?? null,
        fromValue: { status: booking.status },
        toValue: { status: "no_show" },
        note: booking.depositPaid ? "Deposit retained" : null,
      });
    }
    res.json({ message: "Booking marked as no-show" });
  });

  app.patch("/api/bookings/:id/status", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { status } = req.body;
    if (!status || !["confirmed", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const previous = await storage.getBooking(id);
    const booking = await storage.updateBookingStatus(id, status);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    {
      const u = (req as any).staffUser;
      void storage.logBookingAction({
        bookingId: id,
        action: "status_changed",
        staffUsername: u?.username || (req as any).staffUsername || "unknown",
        staffId: u?.id ?? null,
        fromValue: { status: previous?.status ?? null },
        toValue: { status },
        note: status === "cancelled" ? "Booking cancelled" : "Booking confirmed",
      });
    }

    // Send targeted push notification to the customer
    try {
      const customerTokens = await storage.getPushTokensByEmail(booking.customerEmail);
      if (customerTokens.length) {
        const tableLabel = booking.tableType.charAt(0).toUpperCase() + booking.tableType.slice(1);
        const dateLabel = booking.date ? `on ${booking.date}` : "";
        const title = status === "confirmed" ? "Booking Confirmed ✅" : "Booking Cancelled";
        const body = status === "confirmed"
          ? `Your ${tableLabel} table booking at ${booking.startTime} ${dateLabel} has been confirmed. See you soon!`
          : `Your ${tableLabel} table booking at ${booking.startTime} ${dateLabel} has been cancelled. Contact us if this is a mistake.`;
        await sendTargetedPush(customerTokens.map(t => t.token), title, body);
      }
    } catch (err) {
      console.error("[Push] Booking status notification error:", err);
    }

    res.json(booking);
  });

  app.put("/api/bookings/:id", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const existing = await storage.getBooking(id);
    if (!existing) return res.status(404).json({ message: "Booking not found" });
    const { customerName, customerEmail, customerPhone, tableType, tableNumber, guestCount, date, startTime, duration, notes, status } = req.body;
    const updateData: any = {};
    if (customerName !== undefined) updateData.customerName = customerName;
    if (customerEmail !== undefined) updateData.customerEmail = customerEmail;
    if (customerPhone !== undefined) updateData.customerPhone = customerPhone;
    if (tableType !== undefined) updateData.tableType = tableType;
    // Only update tableNumber when explicitly provided (non-null).
    // For dining, the server assigns table numbers internally — a null from the
    // client means "no change", not "clear it".
    if (tableNumber != null) updateData.tableNumber = tableNumber;
    if (guestCount !== undefined) updateData.guestCount = guestCount;
    if (date !== undefined) updateData.date = date;
    if (startTime !== undefined) updateData.startTime = startTime;
    if (duration !== undefined) updateData.duration = duration;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;
    const finalDate = updateData.date ?? existing.date;
    const finalTableType = updateData.tableType ?? existing.tableType;
    const finalTableNumber = updateData.tableNumber ?? existing.tableNumber;
    const finalStartTime = updateData.startTime ?? existing.startTime;
    const finalDuration = updateData.duration ?? existing.duration;
    if (updateData.date || updateData.startTime || updateData.duration || updateData.tableType || updateData.tableNumber) {
      const bookedSlots = await storage.getBookedSlots(finalDate, finalTableType, finalTableNumber ?? undefined);
      const requestedStart = parseInt(finalStartTime.replace(":", ""));
      const requestedEnd = requestedStart + finalDuration * 100;
      for (const slot of bookedSlots) {
        const slotStart = parseInt(slot.startTime.replace(":", ""));
        const slotEnd = slotStart + slot.duration * 100;
        if (requestedStart < slotEnd && requestedEnd > slotStart) {
          const slotBookings = await storage.getBookingsByDate(finalDate);
          const conflicting = slotBookings.find(b => b.startTime === slot.startTime && b.tableType === finalTableType && (finalTableNumber ? b.tableNumber === finalTableNumber : true) && b.status === "confirmed");
          if (conflicting && conflicting.id !== id) {
            return res.status(409).json({ message: "This time slot is already booked" });
          }
        }
      }
    }
    const updated = await storage.updateBooking(id, updateData);
    if (!updated) return res.status(404).json({ message: "Booking not found" });
    {
      const u = (req as any).staffUser;
      const trackedFields = ["customerName", "customerEmail", "customerPhone", "tableType", "tableNumber", "guestCount", "date", "startTime", "duration", "notes", "status"] as const;
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const changes: string[] = [];
      for (const f of trackedFields) {
        const oldV = (existing as any)[f];
        const newV = (updated as any)[f];
        if (oldV !== newV) {
          before[f] = oldV;
          after[f] = newV;
          changes.push(f);
        }
      }
      if (changes.length > 0) {
        void storage.logBookingAction({
          bookingId: id,
          action: "edited",
          staffUsername: u?.username || (req as any).staffUsername || "unknown",
          staffId: u?.id ?? null,
          fromValue: before,
          toValue: after,
          note: `Changed: ${changes.join(", ")}`,
        });
      }
    }
    res.json(updated);
  });

  app.delete("/api/bookings/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    // Capture a snapshot BEFORE deleting so the audit log records what was lost.
    const snapshot = await storage.getBooking(id);
    const deleted = await storage.deleteBooking(id);
    if (!deleted) return res.status(404).json({ message: "Booking not found" });
    if (snapshot) {
      const u = (req as any).staffUser;
      void storage.logBookingAction({
        bookingId: id,
        action: "deleted",
        staffUsername: u?.username || (req as any).staffUsername || "unknown",
        staffId: u?.id ?? null,
        fromValue: {
          customerName: snapshot.customerName,
          customerEmail: snapshot.customerEmail,
          customerPhone: snapshot.customerPhone,
          date: snapshot.date,
          startTime: snapshot.startTime,
          duration: snapshot.duration,
          tableType: snapshot.tableType,
          tableNumber: snapshot.tableNumber,
          status: snapshot.status,
          depositPaid: snapshot.depositPaid,
        },
        note: `Booking permanently deleted (${snapshot.customerName} · ${snapshot.date} ${snapshot.startTime})`,
      });
    }
    res.status(204).send();
  });

  // Per-booking audit history — manager-only because the entries include
  // customer names, staff names, and the full before/after request bodies
  // for every edit, cancel, complete, or no-show action.
  app.get("/api/bookings/:id/audit-log", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const entries = await storage.listBookingAuditLogForBooking(id, 200);
    res.json(entries);
  });

  // Recent audit activity across all bookings — manager-only overview.
  app.get("/api/bookings-audit-log/recent", staffAuth, managerAuth, async (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit || "100")) || 100, 500);
    const entries = await storage.listRecentBookingAuditLog(limit);
    res.json(entries);
  });

  // Generic staff action log — every state-changing API call attributable to a
  // staff/manager session. Manager-only because it can include other people's
  // edits and request bodies (already sanitised of secrets).
  app.get("/api/staff-action-log/recent", staffAuth, managerAuth, async (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit || "200")) || 200, 1000);
    const entries = await storage.listRecentStaffActions(limit);
    res.json(entries);
  });

  app.get("/api/staff-action-log/by-staff/:username", staffAuth, managerAuth, async (req, res) => {
    const username = String(req.params.username || "").trim();
    if (!username) return res.status(400).json({ message: "Username required" });
    const limit = Math.min(parseInt(String(req.query.limit || "200")) || 200, 1000);
    const entries = await storage.listStaffActionsByUsername(username, limit);
    res.json(entries);
  });

  // GDPR export — requires staff manager+ authentication (not public)
  app.get("/api/gdpr/export", staffAuth, managerAuth, async (req, res) => {
    const clientIp = getClientIp(req);
    if (!checkSensitiveRateLimit(clientIp)) {
      return res.status(429).json({ message: "Too many requests. Please try again later." });
    }
    const { email } = req.query;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Email address is required" });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    const userBookings = await storage.getBookingsByEmail(email);
    const exportData = {
      dataSubject: email,
      exportDate: new Date().toISOString(),
      dataController: "The 147",
      legalBasis: "UK GDPR Article 15 - Right of Access",
      bookings: userBookings.map((b) => ({
        id: b.id,
        customerName: b.customerName,
        customerEmail: b.customerEmail,
        customerPhone: b.customerPhone,
        tableType: b.tableType,
        tableNumber: b.tableNumber,
        date: b.date,
        startTime: b.startTime,
        duration: b.duration,
        status: b.status,
        notes: b.notes,
        gdprConsent: b.gdprConsent,
        createdAt: b.createdAt,
      })),
      totalRecords: userBookings.length,
    };
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="gdpr-export-${Date.now()}.json"`);
    res.json(exportData);
  });

  // Customer self-service data export (UK GDPR Article 15 - Right of Access)
  app.get("/api/customers/me/export", customerAuth, async (req, res) => {
    const clientIp = getClientIp(req);
    if (!checkSensitiveRateLimit(clientIp)) {
      return res.status(429).json({ message: "Too many requests. Please try again later." });
    }
    const customer = await storage.getCustomerById((req as any).customerId);
    if (!customer) return res.status(404).json({ message: "Account not found" });
    const bookings = await storage.getBookingsByEmail(customer.email);
    const exportData = {
      dataSubject: customer.email,
      exportDate: new Date().toISOString(),
      dataController: "The 147",
      legalBasis: "UK GDPR Article 15 - Right of Access",
      account: { name: customer.name, email: customer.email, phone: customer.phone, createdAt: customer.createdAt },
      bookings: bookings.map((b) => ({
        id: b.id, tableType: b.tableType, tableNumber: b.tableNumber,
        date: b.date, startTime: b.startTime, duration: b.duration,
        status: b.status, notes: b.notes, createdAt: b.createdAt,
      })),
      totalBookings: bookings.length,
    };
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="my-data-export-${Date.now()}.json"`);
    res.json(exportData);
  });

  app.delete("/api/gdpr/erase", staffAuth, managerAuth, async (req, res) => {
    const clientIp = getClientIp(req);
    if (!checkSensitiveRateLimit(clientIp)) {
      return res.status(429).json({ message: "Too many requests. Please try again later." });
    }
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Email address is required" });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    const [bookingsDeleted, pushTokensDeleted, ordersDeleted, messagesDeleted] = await Promise.all([
      storage.deleteBookingsByEmail(email),
      storage.deletePushTokensByEmail(email),
      storage.deleteOrdersByEmail(email),
      storage.deleteContactMessagesByEmail(email),
    ]);
    const customer = await storage.getCustomerByEmail(email);
    if (customer) await storage.deleteCustomer(customer.id);
    res.json({
      message: `Erasure complete under UK GDPR Article 17`,
      recordsDeleted: bookingsDeleted + pushTokensDeleted + ordersDeleted + messagesDeleted,
      customerAccountDeleted: !!customer,
      erasureDate: new Date().toISOString(),
    });
  });

  app.post("/api/gdpr/retention-cleanup", staffAuth, managerAuth, async (_req, res) => {
    const anonymized = await storage.anonymizeOldBookings(365);
    const sessionsCleared = await storage.cleanupExpiredSessions();
    res.json({
      message: "Data retention policy applied",
      bookingsAnonymized: anonymized,
      expiredSessionsCleared: sessionsCleared,
      retentionPeriodDays: 365,
    });
  });

  // ── Menu ──────────────────────────────────────────────────────────────────
  // ── Availability helper ────────────────────────────────────────────────────
  function isAvailableNow(rules: import("@shared/schema").AvailabilityRule[], targetId: string): boolean {
    const activeRules = rules.filter(r => r.targetId === targetId && r.enabled);
    if (activeRules.length === 0) return true; // no restriction = always available
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun … 6=Sat
    const hhmm = now.toTimeString().slice(0, 5); // "HH:MM"
    const dateStr = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
    return activeRules.some(rule => {
      if (rule.startDate && dateStr < rule.startDate) return false;
      if (rule.endDate && dateStr > rule.endDate) return false;
      if (rule.daysOfWeek) {
        const days: number[] = JSON.parse(rule.daysOfWeek);
        if (!days.includes(dayOfWeek)) return false;
      }
      if (rule.startTime && hhmm < rule.startTime) return false;
      if (rule.endTime && hhmm > rule.endTime) return false;
      return true;
    });
  }

  app.get("/api/deals", async (_req, res) => {
    try {
      const [deals, prefs] = await Promise.all([
        square.getSquareDeals(),
        storage.getDealPreferences().catch(() => []),
      ]);
      const prefById = new Map(prefs.map((p) => [p.squareDiscountId, p] as const));
      // Hidden filter first, then sort by manager-curated order. Deals without
      // a preference row sort as 0 (top), tie-broken by name so the order is
      // stable for new deals before a manager curates them.
      const visible = deals.filter((d) => !prefById.get(d.id)?.hidden);
      visible.sort((a, b) => {
        const sa = prefById.get(a.id)?.sortOrder ?? 0;
        const sb = prefById.get(b.id)?.sortOrder ?? 0;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name);
      });
      res.json(visible);
    } catch {
      res.json([]);
    }
  });

  // Manager-only: returns every Square deal with its current display
  // preference merged in, so the dashboard can show hidden ones too. Sorted
  // identically to /api/deals so reorder math on the client matches what
  // customers see.
  app.get("/api/staff/deals", staffAuth, managerAuth, async (_req, res) => {
    try {
      const [deals, prefs] = await Promise.all([
        square.getSquareDeals(),
        storage.getDealPreferences().catch(() => []),
      ]);
      const prefById = new Map(prefs.map((p) => [p.squareDiscountId, p] as const));
      const merged = deals.map((d) => {
        const p = prefById.get(d.id);
        return { ...d, hidden: !!p?.hidden, sortOrder: p?.sortOrder ?? 0 };
      });
      merged.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name);
      });
      res.json(merged);
    } catch (err) {
      console.error("Staff deals fetch failed:", err);
      res.status(500).json({ error: "Failed to load deals" });
    }
  });

  app.put("/api/staff/deals/:squareDiscountId", staffAuth, managerAuth, async (req, res) => {
    const sid = String(req.params.squareDiscountId || "").trim();
    if (!sid) return res.status(400).json({ error: "Missing discount id" });
    const patch: { hidden?: boolean } = {};
    if (typeof req.body?.hidden === "boolean") patch.hidden = req.body.hidden;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }
    try {
      const row = await storage.upsertDealPreference(sid, patch);
      res.json(row);
    } catch (err) {
      console.error("Deal preference update failed:", err);
      res.status(500).json({ error: "Failed to update deal" });
    }
  });

  app.post("/api/staff/deals/reorder", staffAuth, managerAuth, async (req, res) => {
    const orderedIds = req.body?.orderedIds;
    if (!Array.isArray(orderedIds) || !orderedIds.every((x) => typeof x === "string" && x)) {
      return res.status(400).json({ error: "orderedIds must be an array of Square discount IDs" });
    }
    try {
      await storage.reorderDealPreferences(orderedIds);
      res.json({ ok: true });
    } catch (err) {
      console.error("Deal reorder failed:", err);
      res.status(500).json({ error: "Failed to reorder deals" });
    }
  });

  // ── Public: feature-flag snapshot ─────────────────────────────────────────
  // Tells the client which experiments are turned on for THIS environment.
  // Default OFF so a client built against this server never accidentally
  // surfaces a gated feature when the env var is unset. Cached at the
  // client for the session — see hooks/useFeatureFlags.ts. The shape is
  // typed at shared/featureFlags.ts so client + server can never drift.
  app.get("/api/feature-flags", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(getServerFeatureFlags());
  });

  app.get("/api/menu", async (_req, res) => {
    try {
      const [categories, categoryOverrides, itemOverrides, catSettingsArr, availRules] = await Promise.all([
        square.getMenuFromSquare(),
        storage.getMenuCategoryOverrides(),
        storage.getMenuItemOverrides(),
        storage.getCategorySettings(),
        storage.getAvailabilityRules(),
      ]);

      const hiddenCategoryIds = new Set(categoryOverrides.filter(c => c.hidden).map(c => c.categoryId));
      const itemOverrideMap = new Map(itemOverrides.map(o => [o.variationId, o]));
      const catSettingsMap = new Map(catSettingsArr.map(s => [s.categoryId, s]));

      // Expand categories and apply merging + display overrides
      const mergedMap: Map<string, { id: string; name: string; imageUrl?: string; order: number; items: any[] }> = new Map();

      for (const cat of categories) {
        if (hiddenCategoryIds.has(cat.id)) continue;
        if (!isAvailableNow(availRules.filter(r => r.targetType === 'category'), cat.id)) continue;

        const settings = catSettingsMap.get(cat.id);
        const targetId = settings?.mergedIntoId ?? cat.id; // if merged, group under parent
        const displayName = settings?.displayName ?? cat.name;
        const displayOrder = settings?.displayOrder ?? 99;

        if (!mergedMap.has(targetId)) {
          // Get display name for the target (the category we're merging into)
          const targetSettings = catSettingsMap.get(targetId);
          const targetCat = categories.find(c => c.id === targetId);
          // Custom imageUrl from settings takes priority over Square's imageUrl
          const customImg = targetSettings?.imageUrl ?? catSettingsMap.get(cat.id)?.imageUrl ?? null;
          mergedMap.set(targetId, {
            id: targetId,
            name: targetSettings?.displayName ?? targetCat?.name ?? displayName,
            imageUrl: customImg ?? targetCat?.imageUrl ?? cat.imageUrl,
            order: targetSettings?.displayOrder ?? targetCat ? (catSettingsMap.get(targetId)?.displayOrder ?? 99) : displayOrder,
            items: [],
          });
        }

        const availableItems = cat.items
          .filter(item => {
            const override = itemOverrideMap.get(item.variationId);
            if (override?.hidden) return false;
            if (!isAvailableNow(availRules.filter(r => r.targetType === 'item'), item.id)) return false;
            return true;
          })
          .map(item => {
            const override = itemOverrideMap.get(item.variationId);
            // FEATURE_DIETARY_FILTERS: surface comma-separated tag codes
            // (e.g. "V,VG,GF") on every menu item that has them. The codes
            // are unconditional in the response — the client decides
            // whether to render the badges based on its own flag check, so
            // toggling the flag never requires a server restart to clear
            // browser caches. Empty / null tags are simply omitted.
            const tagsRaw = override?.dietaryTags ?? null;
            const dietaryTags = tagsRaw
              ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean)
              : [];
            const base: any = {
              id: item.id,
              variationId: item.variationId,
              name: item.name,
              variationName: item.variationName,
              description: item.description,
              price: item.price,
              imageUrl: item.imageUrl,
              ...(item.modifiers && item.modifiers.length > 0 ? { modifiers: item.modifiers } : {}),
              ...(dietaryTags.length > 0 ? { dietaryTags } : {}),
            };
            return override?.soldOut ? { ...base, soldOut: true } : base;
          });

        mergedMap.get(targetId)!.items.push(...availableItems);
      }

      // Apply parent/child grouping (sub-categories)
      type Node = { id: string; name: string; imageUrl?: string; order: number; items: any[]; subcategories?: any[] };
      const nodes: Map<string, Node> = mergedMap as any;
      const childrenByParent: Map<string, Node[]> = new Map();
      const isChild: Set<string> = new Set();
      for (const node of nodes.values()) {
        const parentId = catSettingsMap.get(node.id)?.parentCategoryId ?? null;
        if (parentId && nodes.has(parentId) && parentId !== node.id) {
          if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
          childrenByParent.get(parentId)!.push(node);
          isChild.add(node.id);
        }
      }

      const topLevel: Node[] = [];
      for (const node of nodes.values()) {
        if (isChild.has(node.id)) continue;
        const kids = childrenByParent.get(node.id) ?? [];
        if (kids.length > 0) {
          kids.sort((a, b) => a.order !== b.order ? a.order - b.order : a.name.localeCompare(b.name));
          node.subcategories = kids
            .filter(k => k.items.length > 0)
            .map(({ order, subcategories, ...rest }) => rest);
        }
        // Keep parent if it has items OR has at least one non-empty sub
        if (node.items.length > 0 || (node.subcategories && node.subcategories.length > 0)) {
          topLevel.push(node);
        }
      }

      const filtered = topLevel
        .sort((a, b) => a.order !== b.order ? a.order - b.order : a.name.localeCompare(b.name))
        .map(({ order, ...rest }) => rest);

      res.json(filtered);
    } catch (err: any) {
      console.error("[MENU] Failed to fetch menu:", err.message);
      res.status(500).json({ message: "Failed to load menu" });
    }
  });

  // ── Staff Menu Management ──────────────────────────────────────────────────

  // GET all categories with their current visibility states (staff view)
  app.get("/api/staff/menu", staffAuth, async (req: any, res) => {
    try {
      if (req.query.nocache === "1") square.invalidateMenuCache();
      const [categories, categoryOverrides, itemOverrides] = await Promise.all([
        square.getMenuFromSquare(),
        storage.getMenuCategoryOverrides(),
        storage.getMenuItemOverrides(),
      ]);

      const categoryOverrideMap = new Map(categoryOverrides.map(o => [o.categoryId, o]));
      const itemOverrideMap = new Map(itemOverrides.map(o => [o.variationId, o]));

      const result = categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        hidden: categoryOverrideMap.get(cat.id)?.hidden ?? false,
        items: cat.items.map(item => ({
          variationId: item.variationId,
          itemId: item.id,
          name: item.name,
          variationName: item.variationName,
          price: item.price,
          soldOut: itemOverrideMap.get(item.variationId)?.soldOut ?? false,
          hidden: itemOverrideMap.get(item.variationId)?.hidden ?? false,
        })),
      }));

      res.json(result);
    } catch (err: any) {
      console.error("[STAFF MENU] Failed to fetch menu:", err.message);
      res.status(500).json({ message: "Failed to load menu" });
    }
  });

  // Toggle category hidden (manager/owner only)
  app.put("/api/staff/menu/categories/:categoryId", staffAuth, managerAuth, async (req: any, res) => {
    const { categoryId } = req.params;
    const { hidden } = req.body;
    if (typeof hidden !== "boolean") return res.status(400).json({ message: "hidden must be boolean" });
    try {
      const updatedBy = req.staffUser?.username ?? "staff";
      await storage.setMenuCategoryHidden(categoryId, hidden, updatedBy);
      square.invalidateMenuCache();
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[STAFF MENU] Category hide error:", err.message);
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  // Toggle item sold-out (all staff)
  app.put("/api/staff/menu/items/:variationId/sold-out", staffAuth, async (req: any, res) => {
    const { variationId } = req.params;
    const { soldOut, itemId, name } = req.body;
    if (typeof soldOut !== "boolean") return res.status(400).json({ message: "soldOut must be boolean" });
    if (!itemId || !name) return res.status(400).json({ message: "itemId and name required" });
    try {
      const updatedBy = req.staffUser?.username ?? "staff";
      await storage.setMenuItemSoldOut(variationId, itemId, name, soldOut, updatedBy);
      square.invalidateMenuCache();
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[STAFF MENU] Item sold-out error:", err.message);
      res.status(500).json({ message: "Failed to update item" });
    }
  });

  // FEATURE_DIETARY_FILTERS: set/replace the dietary tag string for a
  // menu variation (manager/owner only — same trust level as hide). Body
  // takes a comma-separated tag string ("V,VG,GF,DF,NF") or null/empty
  // to clear. Tag codes are normalised to uppercase, deduped, and capped
  // at the supported set so a typo doesn't leak through to the client.
  // No-op when the feature flag is OFF, returning 404 — keeps the staff
  // dashboard from appearing to "work" against a venue that hasn't
  // enabled the feature.
  app.put("/api/staff/menu/items/:variationId/dietary-tags", staffAuth, managerAuth, async (req: any, res) => {
    if (!getServerFeatureFlags().dietaryFilters) {
      return res.status(404).json({ message: "Dietary tags are not enabled" });
    }
    const { variationId } = req.params;
    const { dietaryTags, itemId, name } = req.body;
    if (!itemId || !name) return res.status(400).json({ message: "itemId and name required" });
    const VALID = new Set(["V", "VG", "GF", "DF", "NF"]);
    let cleaned: string | null = null;
    if (typeof dietaryTags === "string" && dietaryTags.trim()) {
      const parts = Array.from(new Set(
        dietaryTags
          .split(",")
          .map(t => t.trim().toUpperCase())
          .filter(t => VALID.has(t))
      ));
      cleaned = parts.length > 0 ? parts.join(",") : null;
    }
    try {
      const updatedBy = req.staffUser?.username ?? "staff";
      await storage.setMenuItemDietaryTags(variationId, itemId, name, cleaned, updatedBy);
      square.invalidateMenuCache();
      res.json({ ok: true, dietaryTags: cleaned });
    } catch (err: any) {
      console.error("[STAFF MENU] Item dietary-tags error:", err.message);
      res.status(500).json({ message: "Failed to update dietary tags" });
    }
  });

  // Toggle item hidden (manager/owner only)
  app.put("/api/staff/menu/items/:variationId/hidden", staffAuth, managerAuth, async (req: any, res) => {
    const { variationId } = req.params;
    const { hidden, itemId, name } = req.body;
    if (typeof hidden !== "boolean") return res.status(400).json({ message: "hidden must be boolean" });
    if (!itemId || !name) return res.status(400).json({ message: "itemId and name required" });
    try {
      const updatedBy = req.staffUser?.username ?? "staff";
      await storage.setMenuItemHidden(variationId, itemId, name, hidden, updatedBy);
      square.invalidateMenuCache();
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[STAFF MENU] Item hide error:", err.message);
      res.status(500).json({ message: "Failed to update item" });
    }
  });

  // ── Category Settings (order, merge, rename) ──────────────────────────────

  app.get("/api/staff/menu/category-settings", staffAuth, managerAuth, async (req: any, res) => {
    try {
      const [categories, settings] = await Promise.all([
        square.getMenuFromSquare(),
        storage.getCategorySettings(),
      ]);
      const settingsMap = new Map(settings.map(s => [s.categoryId, s]));
      const result = categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        imageUrl: settingsMap.get(cat.id)?.imageUrl ?? cat.imageUrl ?? null,
        customImageUrl: settingsMap.get(cat.id)?.imageUrl ?? null,
        displayName: settingsMap.get(cat.id)?.displayName ?? null,
        displayOrder: settingsMap.get(cat.id)?.displayOrder ?? 99,
        mergedIntoId: settingsMap.get(cat.id)?.mergedIntoId ?? null,
        parentCategoryId: settingsMap.get(cat.id)?.parentCategoryId ?? null,
      }));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to load category settings" });
    }
  });

  app.put("/api/staff/menu/category-settings", staffAuth, managerAuth, async (req: any, res) => {
    try {
      const { settings } = req.body; // array of { categoryId, displayOrder?, mergedIntoId?, parentCategoryId?, displayName? }
      if (!Array.isArray(settings)) return res.status(400).json({ message: "settings must be an array" });
      const updatedBy = req.staffUser?.username ?? "staff";
      await storage.upsertCategorySettings(settings.map((s: any) => ({ ...s, updatedBy })));
      square.invalidateMenuCache();
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[STAFF MENU] Category settings error:", err.message);
      res.status(500).json({ message: "Failed to save category settings" });
    }
  });

  // ── Category Image Upload ──────────────────────────────────────────────────

  app.patch("/api/staff/menu/category-image/:categoryId", staffAuth, managerAuth, upload.single("image"), async (req: any, res) => {
    const { categoryId } = req.params;
    const updatedBy = req.staffUser?.username ?? "staff";
    try {
      if (req.file) {
        const compressed = await sharp(req.file.buffer)
          .resize({ width: 800, withoutEnlargement: true })
          .jpeg({ quality: 75, mozjpeg: true })
          .toBuffer();
        const imageUrl = `data:image/jpeg;base64,${compressed.toString("base64")}`;
        await storage.updateCategoryImage(categoryId, imageUrl, updatedBy);
        square.invalidateMenuCache();
        return res.json({ ok: true, imageUrl });
      } else if (req.body.remove === "true") {
        await storage.updateCategoryImage(categoryId, null, updatedBy);
        square.invalidateMenuCache();
        return res.json({ ok: true, imageUrl: null });
      }
      return res.status(400).json({ message: "No image provided" });
    } catch (err: any) {
      console.error("[CATEGORY IMAGE] Error:", err.message);
      return res.status(500).json({ message: "Failed to update category image" });
    }
  });

  // ── Availability Rules ─────────────────────────────────────────────────────

  app.get("/api/staff/menu/availability", staffAuth, managerAuth, async (_req, res) => {
    try {
      const rules = await storage.getAvailabilityRules();
      res.json(rules);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to load availability rules" });
    }
  });

  app.post("/api/staff/menu/availability", staffAuth, managerAuth, async (req: any, res) => {
    try {
      const { targetType, targetId, targetName, daysOfWeek, startTime, endTime, startDate, endDate, note } = req.body;
      if (!targetType || !targetId || !targetName) return res.status(400).json({ message: "targetType, targetId, and targetName required" });
      const createdBy = req.staffUser?.username ?? "staff";
      const rule = await storage.createAvailabilityRule({
        targetType, targetId, targetName,
        daysOfWeek: daysOfWeek ? JSON.stringify(daysOfWeek) : null,
        startTime: startTime || null,
        endTime: endTime || null,
        startDate: startDate || null,
        endDate: endDate || null,
        note: note || null,
        enabled: true,
        createdBy,
      });
      square.invalidateMenuCache();
      res.json(rule);
    } catch (err: any) {
      console.error("[AVAILABILITY] Create error:", err.message);
      res.status(500).json({ message: "Failed to create rule" });
    }
  });

  app.put("/api/staff/menu/availability/:id", staffAuth, managerAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { daysOfWeek, startTime, endTime, startDate, endDate, note, enabled } = req.body;
      const updated = await storage.updateAvailabilityRule(id, {
        ...(daysOfWeek !== undefined ? { daysOfWeek: daysOfWeek ? JSON.stringify(daysOfWeek) : null } : {}),
        ...(startTime !== undefined ? { startTime: startTime || null } : {}),
        ...(endTime !== undefined ? { endTime: endTime || null } : {}),
        ...(startDate !== undefined ? { startDate: startDate || null } : {}),
        ...(endDate !== undefined ? { endDate: endDate || null } : {}),
        ...(note !== undefined ? { note: note || null } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
      });
      if (!updated) return res.status(404).json({ message: "Rule not found" });
      square.invalidateMenuCache();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update rule" });
    }
  });

  app.delete("/api/staff/menu/availability/:id", staffAuth, managerAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const ok = await storage.deleteAvailabilityRule(id);
      if (!ok) return res.status(404).json({ message: "Rule not found" });
      square.invalidateMenuCache();
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete rule" });
    }
  });

  // ── Online Ordering Toggle ──────────────────────────────────────────────────
  // The venue is in Bradford (Europe/London). Schedules and overrides are
  // configured by staff in UK local time. The Replit container, however, runs
  // in UTC, so any use of `new Date().getDay()` or `toTimeString()` would be
  // off by one hour during BST and could even shift the day-of-week around
  // midnight. All ordering time/date checks must therefore go through
  // `getLondonNow()` so the comparison happens in venue-local time.
  const VENUE_TZ = "Europe/London";
  const LONDON_DOW: Record<string, number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  function getLondonNow(): { dateStr: string; hhmm: string; dow: number } {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: VENUE_TZ,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short",
      hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
    let hh = get("hour");
    // Intl with hour12:false can emit "24" at midnight on some runtimes — normalise.
    if (hh === "24") hh = "00";
    return {
      dateStr: `${get("year")}-${get("month")}-${get("day")}`,
      hhmm: `${hh}:${get("minute")}`,
      dow: LONDON_DOW[get("weekday")] ?? new Date().getUTCDay(),
    };
  }
  function getTodayStr() {
    return getLondonNow().dateStr;
  }

  interface OrderingSchedule { days: number[]; startTime: string; endTime: string; }
  interface OrderingOverride { date: string; closed: boolean; startTime?: string; endTime?: string; note?: string; }
  interface OrderingStatusResult { enabled: boolean; reason: string; nextOpen?: string; closesAt?: string; manualOverride?: boolean; }

  // Wednesday (3), Thursday (4), Friday (5), Saturday (6), Sunday (0).
  // Day-of-week ints follow JS Date.getDay() — Sunday is 0, not 7.
  const DEFAULT_SCHEDULE: OrderingSchedule = { days: [3, 4, 5, 6, 0], startTime: "12:00", endTime: "20:00" };
  const DAY_NAMES_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const DAY_NAMES_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  async function getOrderingSchedule(): Promise<OrderingSchedule> {
    try {
      const raw = await storage.getSetting("ordering_schedule");
      if (raw) return { ...DEFAULT_SCHEDULE, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_SCHEDULE;
  }

  async function getOrderingOverrides(): Promise<OrderingOverride[]> {
    try {
      const raw = await storage.getSetting("ordering_overrides");
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  }

  function scheduleOpenMessage(schedule: OrderingSchedule): string {
    const dayNames = schedule.days.sort((a,b)=>a-b).map(d => DAY_NAMES_SHORT[d]);
    const start = schedule.startTime.replace(":","").length===4 ? schedule.startTime : schedule.startTime;
    const fmt = (t: string) => {
      const [h,m] = t.split(":").map(Number);
      if (m === 0) return h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h-12}pm`;
      return h < 12 ? `${h}:${String(m).padStart(2,"0")}am` : `${h === 12 ? 12 : h-12}:${String(m).padStart(2,"0")}pm`;
    };
    return `${dayNames.join(", ")} ${fmt(schedule.startTime)}–${fmt(schedule.endTime)}`;
  }

  async function getOrderingStatus(): Promise<OrderingStatusResult> {
    // All schedule/override comparisons run in Europe/London so a UTC server
    // doesn't bounce customers an hour either side of opening time.
    const london = getLondonNow();
    const today = london.dateStr;
    const hhmm = london.hhmm;
    const dow = london.dow;

    // 1. Check manual disable override (auto-resets next day)
    const manualEnabled = await storage.getSetting("ordering_enabled");
    if (manualEnabled === "false") {
      const disabledDate = await storage.getSetting("ordering_disabled_date");
      if (!disabledDate || disabledDate === today) {
        return { enabled: false, reason: "Online ordering has been temporarily closed by staff.", manualOverride: true };
      }
      // Auto-reset: disabled on a previous day
      await storage.setSetting("ordering_enabled", "true");
    }

    const schedule = await getOrderingSchedule();
    const overrides = await getOrderingOverrides();

    // 2. Check today's override
    const todayOverride = overrides.find(o => o.date === today);
    if (todayOverride) {
      if (todayOverride.closed) {
        // Explicitly closed today
        return { enabled: false, reason: `Ordering is closed today${todayOverride.note ? ` (${todayOverride.note})` : ""}.`, nextOpen: scheduleOpenMessage(schedule) };
      }
      // Extra opening today — check hours
      const oStart = todayOverride.startTime ?? schedule.startTime;
      const oEnd = todayOverride.endTime ?? schedule.endTime;
      if (hhmm >= oStart && hhmm < oEnd) {
        return { enabled: true, reason: `Ordering open until ${oEnd}`, closesAt: oEnd };
      }
      if (hhmm < oStart) {
        return { enabled: false, reason: `Ordering opens today at ${oStart}${todayOverride.note ? ` (${todayOverride.note})` : ""}`, nextOpen: `Today from ${oStart}` };
      }
      // Past today's override window — fall through to normal schedule check
    }

    // 3. Check normal weekly schedule
    const isScheduledDay = schedule.days.includes(dow);
    if (!isScheduledDay) {
      // Find next scheduled day
      let daysAhead = 1;
      let nextDow = (dow + daysAhead) % 7;
      while (!schedule.days.includes(nextDow) && daysAhead < 8) { daysAhead++; nextDow = (dow + daysAhead) % 7; }
      const nextName = daysAhead === 1 ? "Tomorrow" : DAY_NAMES_FULL[nextDow];
      return { enabled: false, reason: `Food ordering is available ${scheduleOpenMessage(schedule)}.`, nextOpen: `${nextName} from ${schedule.startTime}` };
    }

    // It's a scheduled day — check the time window
    if (hhmm < schedule.startTime) {
      return { enabled: false, reason: `Food ordering opens at ${schedule.startTime} today.`, nextOpen: `Today from ${schedule.startTime}` };
    }
    if (hhmm >= schedule.endTime) {
      // After closing — find next open slot
      let daysAhead = 1;
      let nextDow = (dow + daysAhead) % 7;
      while (!schedule.days.includes(nextDow) && daysAhead < 8) { daysAhead++; nextDow = (dow + daysAhead) % 7; }
      const nextName = daysAhead === 1 ? "Tomorrow" : DAY_NAMES_FULL[nextDow];
      return { enabled: false, reason: `Food ordering closes at ${schedule.endTime}. See you ${nextName.toLowerCase()}!`, nextOpen: `${nextName} from ${schedule.startTime}` };
    }

    return { enabled: true, reason: `Ordering open until ${schedule.endTime}`, closesAt: schedule.endTime };
  }

  async function getOrderingEnabled(): Promise<boolean> {
    const status = await getOrderingStatus();
    return status.enabled;
  }

  app.get("/api/ordering-status", async (_req, res) => {
    try {
      const status = await getOrderingStatus();
      res.json(status);
    } catch {
      res.json({ enabled: true, reason: "Ordering available" });
    }
  });

  app.put("/api/staff/ordering-status", staffAuth, async (req: any, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled must be boolean" });
    }
    await storage.setSetting("ordering_enabled", String(enabled));
    if (!enabled) {
      await storage.setSetting("ordering_disabled_date", getTodayStr());
    } else {
      await storage.setSetting("ordering_disabled_date", "");
    }
    const who = req.staff?.username || req.staff?.name || "staff";
    console.log(`[ORDERING] Online ordering ${enabled ? "enabled" : "disabled"} by ${who}`);
    const status = await getOrderingStatus();
    res.json(status);
  });

  // ── Ordering Schedule ───────────────────────────────────────────────────────
  app.get("/api/staff/ordering-schedule", staffAuth, async (_req, res) => {
    const schedule = await getOrderingSchedule();
    res.json(schedule);
  });

  app.put("/api/staff/ordering-schedule", staffAuth, async (req: any, res) => {
    const { days, startTime, endTime } = req.body;
    if (!Array.isArray(days) || !startTime || !endTime) {
      return res.status(400).json({ message: "days, startTime and endTime required" });
    }
    const schedule: OrderingSchedule = { days, startTime, endTime };
    await storage.setSetting("ordering_schedule", JSON.stringify(schedule));
    const who = req.staff?.username || req.staff?.name || "staff";
    console.log(`[ORDERING] Schedule updated by ${who}: ${JSON.stringify(schedule)}`);
    res.json(schedule);
  });

  // ── Ordering Overrides ──────────────────────────────────────────────────────
  app.get("/api/staff/ordering-overrides", staffAuth, async (_req, res) => {
    const overrides = await getOrderingOverrides();
    res.json(overrides);
  });

  app.post("/api/staff/ordering-overrides", staffAuth, async (req: any, res) => {
    const { date, closed, startTime, endTime, note } = req.body;
    if (!date) return res.status(400).json({ message: "date required" });
    const overrides = await getOrderingOverrides();
    const idx = overrides.findIndex(o => o.date === date);
    const entry: OrderingOverride = { date, closed: !!closed, startTime, endTime, note };
    if (idx >= 0) overrides[idx] = entry; else overrides.push(entry);
    overrides.sort((a, b) => a.date.localeCompare(b.date));
    await storage.setSetting("ordering_overrides", JSON.stringify(overrides));
    res.json(entry);
  });

  app.delete("/api/staff/ordering-overrides/:date", staffAuth, async (req, res) => {
    const { date } = req.params;
    const overrides = await getOrderingOverrides();
    const filtered = overrides.filter(o => o.date !== date);
    await storage.setSetting("ordering_overrides", JSON.stringify(filtered));
    res.json({ success: true });
  });

  // ── Order Checkout ─────────────────────────────────────────────────────────
  app.post("/api/orders/checkout", async (req, res) => {
    const { items, tableNote, orderNote, customer, pushToken } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }
    try {
      const orderingEnabled = await getOrderingEnabled();
      if (!orderingEnabled) {
        return res.status(503).json({ message: "Online ordering is currently unavailable. Please order at the bar." });
      }

      const { discountPercent, discountLabel, excludeWithDeals } =
        await resolveMemberDiscountImpl(req, customer, syncSquareMembershipForCustomer);
      // Reserve the next app_orders id BEFORE talking to Square so the KDS
      // ticket can show "Collection #N" when there's no customer name and no
      // table — kitchen still has something to call out.
      const reservedOrderId = await storage.reserveAppOrderId();
      const { url, linkId, squareOrderId, pricedItems, rawTotalPence } = await square.createOrderCheckoutLink(
        items, tableNote, customer, discountPercent, discountLabel, excludeWithDeals, orderNote, reservedOrderId,
      );
      const discountedTotal = discountPercent
        ? Math.round(rawTotalPence * (1 - discountPercent / 100))
        : rawTotalPence;

      // Store order record (non-blocking — don't fail checkout if DB write fails)
      storage.createAppOrder({
        id: reservedOrderId,
        squareLinkId: linkId || undefined,
        squareOrderId: squareOrderId || undefined,
        tableNote: tableNote || undefined,
        customerName: customer?.name || undefined,
        customerEmail: customer?.email || undefined,
        itemsJson: JSON.stringify(
          pricedItems.map((p) => ({
            name: p.name,
            quantity: p.quantity,
            price: p.pricePence,
            variationId: p.variationId,
            ...(p.itemId ? { itemId: p.itemId } : {}),
            ...(p.modifiers.length
              ? {
                  modifiers: p.modifiers.map((m) => m.name),
                  modifierIds: p.modifiers.map((m) => m.catalogObjectId),
                }
              : {}),
          }))
        ),
        totalPence: discountedTotal,
        discountPercent: discountPercent ?? undefined,
        discountLabel: discountLabel ?? undefined,
        pushToken: isValidExpoPushToken(pushToken) ? pushToken : undefined,
      }).catch((err: any) => console.error("[ORDER] Failed to save order record:", err.message));

      res.json({ url, discountPercent: discountPercent ?? null, discountLabel: discountLabel ?? null });
    } catch (err: any) {
      console.error("[ORDER] Checkout failed:", err.message);
      const status = err instanceof square.SquareError && err.statusCode >= 400 && err.statusCode < 500
        ? err.statusCode
        : 500;
      res.status(status).json({ message: err.message });
    }
  });

  // ── Kiosk Checkout (creates Square Open Ticket, pays at counter) ──────────
  // Public endpoint used by the in-app kiosk mode. Creates a real Square
  // Order via the Orders API which lands in the Square POS Open Tickets
  // screen — staff just open the ticket and tap Charge to take payment.
  // The order also lives in our app_orders table with paymentMethod='counter'
  // so the dashboard can show it on the KDS once Square fires the
  // payment.updated webhook (which atomically flips status pending→paid via
  // the existing handler around line 4030). Manager Mark Paid action
  // remains as a manual fallback for cases where the webhook is missed.
  app.post("/api/orders/kiosk-checkout", async (req, res) => {
    const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
    const rl = checkRateLimit(`kiosk-checkout:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({ message: "Too many orders, please slow down." });
    }
    const { items, customerName, tableNumber, customerPhone } = req.body ?? {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }
    const name = typeof customerName === "string" ? customerName.trim() : "";
    const table = typeof tableNumber === "string" ? tableNumber.trim() : "";
    const phoneRaw = typeof customerPhone === "string" ? customerPhone.trim() : "";
    if (name.length < 2) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!/^\d{1,3}$/.test(table)) {
      return res.status(400).json({ message: "Table number is required" });
    }
    try {
      // Kiosk-specific kill switch (independent of the global ordering toggle).
      // Lets staff disable the customer-facing kiosk without taking down regular
      // online ordering — useful when the tablet is being moved, the kitchen is
      // short-staffed, or kiosk orders need to be paused during a rush.
      // Default is enabled; only an explicit "false" disables it.
      const kioskEnabled = await storage.getSetting("kiosk_ordering_enabled");
      if (kioskEnabled === "false") {
        return res.status(503).json({ message: "Kiosk ordering is currently paused. Please order at the counter." });
      }

      // Validate ordering window — same gate as the online flow.
      const orderingEnabled = await getOrderingEnabled();
      if (!orderingEnabled) {
        return res.status(503).json({ message: "Ordering is currently unavailable." });
      }

      // Build the Square line-items (full modifier objects with prices) AND
      // a sanitised copy for our local app_orders row in one pass.
      const squareItems: square.OrderLineItem[] = [];
      const sanitisedItems: any[] = [];
      for (const raw of items) {
        const qty = Math.max(1, Math.min(99, Number(raw?.quantity ?? 1) | 0));
        const price = Math.max(0, Number(raw?.price ?? 0) | 0);
        const itemName = String(raw?.name ?? "Item").slice(0, 120);
        const variationId = String(raw?.variationId ?? "");
        const itemId = raw?.itemId ? String(raw.itemId) : undefined;
        const modifiersRaw = Array.isArray(raw?.modifiers) ? raw.modifiers : [];
        const fullModifiers = modifiersRaw
          .map((m: any) => ({
            catalogObjectId: String(m?.catalogObjectId ?? ""),
            name: String(m?.name ?? ""),
            price: Math.max(0, Number(m?.price ?? 0) | 0),
          }))
          .filter((m: any) => m.catalogObjectId);
        if (!variationId) {
          return res.status(400).json({ message: `Item "${itemName}" is missing its catalog id` });
        }
        squareItems.push({
          variationId,
          itemId,
          name: itemName,
          price,
          quantity: qty,
          modifiers: fullModifiers,
        });
        sanitisedItems.push({
          name: itemName,
          quantity: qty,
          price,
          variationId,
          ...(itemId ? { itemId } : {}),
          ...(fullModifiers.length
            ? {
                modifiers: fullModifiers.map((m: any) => m.name),
                modifierIds: fullModifiers.map((m: any) => m.catalogObjectId),
              }
            : {}),
        });
      }

      // Optional phone number — passed straight to Square so its loyalty
      // engine matches the customer and awards points when payment is taken
      // at the till. Member discounts still flow through the normal logged-in
      // app checkout (the kiosk is a guest device with no app session).
      const customer: { name: string; phone?: string } = { name };
      if (phoneRaw) customer.phone = phoneRaw;

      const ticketNumber = await storage.allocateKioskTicketNumber();
      const tableNote = `Table ${table}`;

      // Create the Square Order — this is what makes it appear in the
      // Square POS Open Tickets screen for staff to charge. Square computes
      // the authoritative total from its catalog (variation/modifier prices
      // + any member discount), so we trust its returned totalPence over
      // any client-supplied number.
      const { orderId: squareOrderId, totalPence: squareTotalPence } =
        await square.createSquareOrderForCheckout(
          squareItems,
          tableNote,
          customer,
          undefined,
          undefined,
          false,
          undefined,
          ticketNumber,
        );

      const created = await storage.createAppOrder({
        squareOrderId,
        tableNote,
        customerName: name,
        itemsJson: JSON.stringify(sanitisedItems),
        totalPence: squareTotalPence,
        paymentMethod: "counter",
        ticketNumber,
      });

      console.log(`[KIOSK] Order #${created.id} ticket #${ticketNumber} (${name}, ${tableNote}, £${(squareTotalPence / 100).toFixed(2)}) → Square ${squareOrderId}`);
      res.json({ appOrderId: created.id, ticketNumber });
    } catch (err: any) {
      console.error("[KIOSK] Checkout failed:", err.message);
      const status = err instanceof square.SquareError && err.statusCode >= 400 && err.statusCode < 500
        ? err.statusCode
        : 500;
      res.status(status).json({ message: err.message || "Could not create order" });
    }
  });

  // ── Staff: mark a kiosk (counter-pay) order as paid ───────────────────────
  app.post("/api/staff/orders/:id/mark-paid", staffAuth, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ message: "Invalid order ID" });
    try {
      const order = await storage.getAppOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.paymentMethod !== "counter") {
        return res.status(400).json({ message: "Only counter-pay orders can be marked paid here" });
      }
      if (order.status !== "pending") {
        return res.status(400).json({ message: `Order is already ${order.status}` });
      }
      const ok = await storage.markAppOrderPaidAtCounter(id);
      if (!ok) return res.status(409).json({ message: "Order could not be updated (was it already paid?)" });
      const actor = ((req as any).staffUsername as string | null) || "admin";
      try {
        await storage.logOrderAction({ orderId: id, staffUsername: actor, action: "mark-paid-counter" });
      } catch {}
      console.log(`[KIOSK] Order #${id} marked paid at counter by ${actor}`);
      res.json({ status: "paid" });
    } catch (err: any) {
      console.error("[KIOSK] Mark-paid failed:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Public Square Web Payments SDK config ──────────────────────────────────
  // Safe to expose: applicationId, locationId, environment are public values.
  app.get("/api/public/square-config", (_req, res) => {
    const applicationId = square.getApplicationId();
    const locationId = square.getPublicLocationId();
    const environment = square.getEnvironment();
    res.json({
      applicationId,
      locationId,
      environment,
      configured: square.isWebPaymentsConfigured(),
    });
  });

  // ── In-app payment sheet diagnostics ───────────────────────────────────────
  // Lightweight, fire-and-forget reporting endpoint the in-app SquarePaymentSheet
  // POSTs to from React Native whenever its WebView emits a phase marker or a
  // fatal error. No auth (the WebView is unauthenticated), no DB writes — we
  // only console.log so the events show up in production logs and can be
  // diff'd to find the dominant root cause of the "sheet hangs" reports.
  //
  // Rate-limited per IP to stop a misbehaving client from spamming us. We
  // never trust the body — every field is treated as untrusted user input.
  app.post("/api/public/payment-sheet-diagnostics", (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const limit = checkRateLimit(`pmt-diag:${ip}`, 60, 60_000);
    if (!limit.allowed) {
      res.set("Retry-After", String(limit.retryAfter));
      return res.status(429).json({ ok: false });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    function s(v: unknown, max = 200): string {
      if (v == null) return "";
      const str = typeof v === "string" ? v : JSON.stringify(v);
      return str.length > max ? str.slice(0, max) + "…" : str;
    }
    const event = {
      phase: s(body.phase, 40) || "unknown",
      reason: s(body.reason, 240),
      sessionId: s(body.sessionId, 40),
      platform: s(body.platform, 16),
      environment: s(body.environment, 16),
      userAgent: s(body.userAgent, 240),
      online: body.online === true || body.online === false ? body.online : null,
      sdkSrc: s(body.sdkSrc, 120),
      baseUrl: s(body.baseUrl, 120),
      elapsedMs: typeof body.elapsedMs === "number" && Number.isFinite(body.elapsedMs)
        ? Math.max(0, Math.round(body.elapsedMs))
        : null,
      retryCount: typeof body.retryCount === "number" && Number.isFinite(body.retryCount)
        ? Math.max(0, Math.round(body.retryCount))
        : null,
      ip,
    };
    // Single-line, grep-friendly. Severity: fatal = full error, anything else = info.
    const severity = event.phase === "fatal" || event.phase.startsWith("fatal_") ? "error" : "log";
    const tag = `[payment-sheet-diag] ${event.phase}`;
    if (severity === "error") {
      console.error(tag, event);
    } else {
      console.log(tag, event);
    }
    res.json({ ok: true });
  });

  // ── In-app order: create the Square Order (no hosted checkout) ─────────────
  // Returns the orderId + computed total so the client can charge it via the
  // Web Payments SDK and POST the resulting card token to /api/orders/:id/pay.
  app.post("/api/orders/create", async (req, res) => {
    const { items, tableNote, orderNote, customer, pushToken } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }
    if (!square.isWebPaymentsConfigured()) {
      return res.status(503).json({ message: "In-app payments are not configured." });
    }
    try {
      const orderingEnabled = await getOrderingEnabled();
      if (!orderingEnabled) {
        return res.status(503).json({ message: "Online ordering is currently unavailable. Please order at the bar." });
      }

      const { discountPercent, discountLabel, excludeWithDeals } =
        await resolveMemberDiscountImpl(req, customer, syncSquareMembershipForCustomer);

      // Reserve the app order id up-front so we can include "Collection #N"
      // on the Square KDS ticket when the customer hasn't given a name or
      // table. Same id is then used for the app_orders row below.
      const reservedOrderId = await storage.reserveAppOrderId();
      const { orderId, totalPence, pricedItems } = await square.createSquareOrderForCheckout(
        items, tableNote, customer, discountPercent, discountLabel, excludeWithDeals, orderNote, reservedOrderId,
      );

      // Generate a per-order confirmation token. The client stores this
      // alongside the appOrderId on the device and presents it later to the
      // /confirmation endpoint so we don't expose paid orders by ID alone.
      const confirmationToken = randomBytes(24).toString("hex");

      // Save app_orders row (pending) so the webhook + staff dashboard see it
      const appOrder = await storage.createAppOrder({
        id: reservedOrderId,
        squareOrderId: orderId,
        tableNote: tableNote || undefined,
        customerName: customer?.name || undefined,
        customerEmail: customer?.email || undefined,
        itemsJson: JSON.stringify(
          pricedItems.map((p) => ({
            name: p.name,
            quantity: p.quantity,
            price: p.pricePence,
            variationId: p.variationId,
            ...(p.itemId ? { itemId: p.itemId } : {}),
            ...(p.modifiers.length
              ? {
                  modifiers: p.modifiers.map((m) => m.name),
                  modifierIds: p.modifiers.map((m) => m.catalogObjectId),
                }
              : {}),
          }))
        ),
        totalPence,
        discountPercent: discountPercent ?? undefined,
        discountLabel: discountLabel ?? undefined,
        confirmationToken,
        pushToken: isValidExpoPushToken(pushToken) ? pushToken : undefined,
      });

      res.json({
        appOrderId: appOrder.id,
        squareOrderId: orderId,
        amountPence: totalPence,
        confirmationToken,
        discountPercent: discountPercent ?? null,
        discountLabel: discountLabel ?? null,
      });
    } catch (err: any) {
      console.error("[ORDER] Create order failed:", err.message);
      const status = err instanceof square.SquareError && err.statusCode >= 400 && err.statusCode < 500
        ? err.statusCode
        : 500;
      res.status(status).json({ message: err.message });
    }
  });

  // ── In-app order: pay with a Web Payments SDK card token ───────────────────
  app.post("/api/orders/:appOrderId/pay", async (req, res) => {
    const appOrderId = parseInt(String(req.params.appOrderId));
    if (isNaN(appOrderId)) return res.status(400).json({ message: "Invalid order id" });
    const { sourceId, verificationToken, buyerEmail, saveCard } = req.body || {};
    if (typeof sourceId !== "string" || !sourceId.trim()) {
      return res.status(400).json({ message: "Missing payment token" });
    }
    if (!square.isWebPaymentsConfigured()) {
      return res.status(503).json({ message: "In-app payments are not configured." });
    }
    try {
      const order = await storage.getAppOrder(appOrderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.status !== "pending") {
        return res.status(409).json({ message: `Order is already ${order.status}` });
      }
      if (!order.squareOrderId) {
        return res.status(400).json({ message: "Order is missing Square reference" });
      }
      const idemRaw = `app-order-${appOrderId}|${sourceId}`;
      const idempotencyKey = createHash("sha256").update(idemRaw).digest("hex").slice(0, 45);
      const payment = await square.createCardPayment({
        sourceId: sourceId.trim(),
        amountPence: order.totalPence,
        idempotencyKey,
        note: order.tableNote ? `Order ${appOrderId} — ${order.tableNote}` : `Order ${appOrderId}`,
        referenceId: `app-order-${appOrderId}`,
        buyerEmail: (buyerEmail || order.customerEmail || null) as string | null,
        verificationToken: verificationToken || null,
        orderId: order.squareOrderId,
      });
      const succeeded = payment.status === "COMPLETED" || payment.status === "APPROVED";
      if (succeeded) {
        // Atomic pending → paid; only log audit if this call actually
        // performed the transition (the webhook may have beaten us to it).
        const transitioned = await storage.updateAppOrderPaid(order.squareOrderId, payment.id).catch((e: any) => {
          console.error("[ORDER] Failed to mark paid:", e.message);
          return false;
        });
        if (transitioned) {
          await storage.logOrderAction({
            orderId: order.id,
            staffUsername: "system",
            action: "paid",
            reason: `Square payment ${payment.id} (in-app)`,
          }).catch((e: any) => console.error("[ORDER] Audit log failed:", e.message));
        }
      }
      // FEATURE_SAVED_CARDS: opt-in card-on-file save AFTER a successful
      // charge. We only attempt this when:
      //   1. The flag is on for this environment.
      //   2. The customer ticked the in-sheet "Save card" checkbox
      //      (sourceId still represents a one-shot tokenised nonce, but
      //      Square's /v2/cards endpoint accepts the same source_id used
      //      by /v2/payments within the lifetime of the nonce — so we
      //      reuse it instead of asking the customer to re-tokenise).
      //   3. The request has a valid customer session — anonymous orders
      //      have no account to attach the card to.
      // Failures here are logged but never fail the customer's payment —
      // the cart already moved to "paid" above and the receipt is the
      // source of truth.
      if (
        succeeded &&
        saveCard === true &&
        getServerFeatureFlags().savedCards
      ) {
        const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
        if (auth && auth.length >= 32 && auth.length <= 128) {
          const session = await storage.validateCustomerSession(auth).catch(() => null);
          const customer = session ? await storage.getCustomerById(session.customerId).catch(() => null) : null;
          if (customer) {
            try {
              // Look up (or create) the Square Customer record we'll
              // attach the card to. We DON'T reuse the membership's
              // squareCustomerId — keeping payments and memberships
              // isolated means cancelling membership doesn't drop the
              // saved card and vice versa.
              let squareCustomerId = customer.squareCustomerId ?? null;
              if (!squareCustomerId) {
                const found = await square.findSquareCustomerByEmail(customer.email);
                squareCustomerId = found?.id ?? null;
              }
              if (!squareCustomerId) {
                const created = await square.createSquareCustomer(
                  customer.name,
                  customer.email,
                  customer.phone || undefined,
                );
                squareCustomerId = created?.id ?? null;
              }
              if (squareCustomerId) {
                const card = await square.saveCardOnFile({
                  customerId: squareCustomerId,
                  sourceId: sourceId.trim(),
                  verificationToken: verificationToken || null,
                  cardholderName: customer.name,
                });
                if (card?.id) {
                  await storage.setCustomerSavedCard(customer.id, {
                    squareCustomerId,
                    squareCardId: card.id,
                    brand: card.card_brand ?? null,
                    last4: card.last_4 ?? null,
                    expMonth: typeof card.exp_month === "number" ? card.exp_month : null,
                    expYear: typeof card.exp_year === "number" ? card.exp_year : null,
                  });
                  console.log(`[SAVED CARD] Saved card ${card.id} for customer ${customer.id}`);
                }
              }
            } catch (saveErr: any) {
              console.error("[SAVED CARD] Save failed (payment unaffected):", saveErr?.message ?? saveErr);
            }
          }
        }
      }
      res.json({
        ok: succeeded,
        status: payment.status,
        paymentId: payment.id,
        appOrderId: order.id,
      });
    } catch (err: any) {
      const squareErrors = Array.isArray(err?.errors) ? err.errors : (Array.isArray(err?.result?.errors) ? err.result.errors : []);
      const first = squareErrors[0] || {};
      const errorCode: string | undefined = first.code;
      const errorDetail: string | undefined = first.detail || err?.message;
      console.error("[ORDER] Pay failed:", { code: err?.code, errorCode, detail: errorDetail });
      res.status(400).json({
        message: errorDetail || "Card charge failed",
        errorCode: errorCode || null,
      });
    }
  });

  // ── Public: fetch a confirmation payload for an order, only when paid ──────
  // The client persists the appOrderId locally when an order is created. On
  // launch (or focus), the Order tab calls this to detect a payment that
  // completed while the app was backgrounded (or the webhook beat the in-app
  // response). Returns 404 until the order is paid; never leaks customer info.
  app.get("/api/orders/:appOrderId/confirmation", async (req, res) => {
    const appOrderId = parseInt(String(req.params.appOrderId));
    if (isNaN(appOrderId)) return res.status(400).json({ message: "Invalid order id" });
    const providedToken = typeof req.query.token === "string" ? req.query.token : "";
    if (!providedToken) {
      return res.status(401).json({ message: "Missing confirmation token" });
    }
    try {
      const order = await storage.getAppOrder(appOrderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      // Constant-time token check — prevents IDOR enumeration of orders.
      const expected = order.confirmationToken ?? "";
      const a = Buffer.from(providedToken);
      const b = Buffer.from(expected);
      const tokenOk = !!expected && a.length === b.length && timingSafeEqual(a, b);
      if (!tokenOk) {
        return res.status(404).json({ message: "Order not found" });
      }
      // Statuses visible on the receipt: anything from "paid" onwards, plus
      // terminal failure states. "pending" is hidden so we don't leak unpaid
      // orders.
      const VISIBLE_STATUSES = new Set([
        "paid", "preparing", "ready", "delivered", "collected", "completed",
        "cancelled", "refunded",
      ]);
      if (!VISIBLE_STATUSES.has(order.status)) {
        return res.status(404).json({ message: "Order not paid" });
      }
      // Don't surface ancient receipts.
      const ageMs = Date.now() - new Date(order.createdAt).getTime();
      if (ageMs > 24 * 60 * 60 * 1000) {
        return res.status(404).json({ message: "Order too old" });
      }
      let items: Array<{ name: string; quantity: number; price: number; modifiers?: string[] }> = [];
      try { items = JSON.parse(order.itemsJson); } catch {}
      const tableNote = order.tableNote ?? "";
      const hasTable = tableNote.trim().length > 0;
      // Customer-friendly labels for the receipt's live status banner.
      const STATUS_META: Record<string, { label: string; detail: string; isTerminal: boolean }> = {
        paid:      { label: "Order received",   detail: "We've sent your order to the bar and kitchen.", isTerminal: false },
        preparing: { label: "Being prepared",   detail: "The kitchen is working on your order now.",      isTerminal: false },
        ready:     { label: hasTable ? "Ready — on its way" : "Ready to collect", detail: hasTable ? `A team member is bringing it to ${tableNote}.` : "Please come to the bar to collect your order.", isTerminal: false },
        delivered: { label: "Enjoy!",           detail: hasTable ? `Your order has been delivered to ${tableNote}.` : "Your order has been served.", isTerminal: true },
        collected: { label: "Enjoy!",           detail: "Thanks — your order has been collected.",        isTerminal: true },
        completed: { label: "Order complete!",  detail: hasTable ? `Your order is on its way to ${tableNote}. Enjoy!` : "Your order is ready at the bar. Enjoy!", isTerminal: true },
        cancelled: { label: "Cancelled",        detail: "This order was cancelled by staff.",             isTerminal: true },
        refunded:  { label: "Refunded",         detail: "This order has been refunded.",                  isTerminal: true },
      };
      const meta = STATUS_META[order.status] ?? STATUS_META.paid;
      res.json({
        appOrderId: order.id,
        status: order.status,
        statusLabel: meta.label,
        statusDetail: meta.detail,
        isTerminal: meta.isTerminal,
        totalPence: order.totalPence,
        tableNote,
        items,
      });
    } catch (err: any) {
      console.error("[ORDER] confirmation lookup failed:", err.message);
      res.status(500).json({ message: "Lookup failed" });
    }
  });

  // ── Public: build a "reorder" payload from a past order ───────────────────
  // Looks up each line on the live menu by name (and variation name) so the
  // client can drop the items straight into the cart. Items that no longer
  // exist on the menu (or are hidden / sold out) are returned in `skipped`
  // so the customer sees a small notice. Same token check as the receipt
  // endpoint so we never leak orders by ID alone.
  app.get("/api/orders/:appOrderId/reorder", async (req, res) => {
    const appOrderId = parseInt(String(req.params.appOrderId));
    if (isNaN(appOrderId)) return res.status(400).json({ message: "Invalid order id" });
    const providedToken = typeof req.query.token === "string" ? req.query.token : "";
    if (!providedToken) return res.status(401).json({ message: "Missing confirmation token" });
    try {
      const order = await storage.getAppOrder(appOrderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      const expected = order.confirmationToken ?? "";
      const a = Buffer.from(providedToken);
      const b = Buffer.from(expected);
      const tokenOk = !!expected && a.length === b.length && timingSafeEqual(a, b);
      if (!tokenOk) return res.status(404).json({ message: "Order not found" });
      // Don't allow reordering a cancelled / refunded receipt — the items may
      // never have been served, and surfacing a "Reorder" CTA would be jarring.
      if (order.status === "cancelled" || order.status === "refunded") {
        return res.status(409).json({ message: "Order cannot be reordered" });
      }

      let rawItems: ReorderRawItem[] = [];
      try { rawItems = JSON.parse(order.itemsJson); } catch {}
      if (rawItems.length === 0) {
        return res.json({ items: [], skipped: [] });
      }

      const [menu, itemOverrides] = await Promise.all([
        square.getMenuFromSquare(),
        storage.getMenuItemOverrides(),
      ]);
      const overrideByVariation = new Map(itemOverrides.map((o) => [o.variationId, o]));

      // Flatten every variation across categories and subcategories. The same
      // item id can appear in multiple categories — that's fine, we just need
      // any matching live variation.
      const flat: ReorderMenuItem[] = [];
      const seen = new Set<string>();
      const walk = (cats: any[]) => {
        for (const cat of cats) {
          for (const it of cat.items ?? []) {
            const key = `${it.id}::${it.variationId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            flat.push(it as ReorderMenuItem);
          }
          if (cat.subcategories?.length) walk(cat.subcategories);
        }
      };
      walk(menu);

      const result = buildReorderPayload(flat, rawItems, (variationId) => {
        const ovr = overrideByVariation.get(variationId);
        return !!(ovr?.hidden || ovr?.soldOut);
      });

      res.json(result);
    } catch (err: any) {
      console.error("[ORDER] Reorder lookup failed:", err.message);
      res.status(500).json({ message: "Lookup failed" });
    }
  });

  // ── Staff: recent app orders ─────────────────────────────────────────────────
  app.get("/api/staff/orders", staffAuth, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 200);
      const orders = await storage.getRecentAppOrders(limit);
      // Attach latest audit entry per order in one batch query
      const orderIds = orders.map((o) => o.id);
      const auditEntries = await storage.getAuditLogsForOrders(orderIds);
      // Build map: orderId → most recent audit entry (already desc-ordered)
      const auditMap: Record<number, { staffUsername: string; action: string; reason: string | null; createdAt: Date }> = {};
      for (const entry of auditEntries) {
        if (!auditMap[entry.orderId]) auditMap[entry.orderId] = entry;
      }
      const enriched = orders.map((o) => ({ ...o, audit: auditMap[o.id] ?? null }));
      res.json(enriched);
    } catch (err: any) {
      console.error("[ORDERS] Failed to load orders:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Staff: cancel an app order (PIN-authorised) ──────────────────────────────
  app.post("/api/staff/orders/:id/cancel", staffAuth, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ message: "Invalid order ID" });
    const { pin, reason } = req.body;
    const staffUsername = (req as any).staffUsername as string | null;
    // Verify staff credential for named staff accounts; master-PIN sessions are pre-authenticated.
    // Accepts either the user's password or, for legacy accounts that still have one, their PIN.
    if (staffUsername) {
      if (!pin) return res.status(400).json({ message: "Password required to authorise this action" });
      const staffUser = await storage.getStaffUserByUsername(staffUsername);
      if (!staffUser || !verifyStaffCredential(String(pin), staffUser)) {
        return res.status(401).json({ message: "Incorrect password" });
      }
    }
    try {
      const order = await storage.getAppOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.status === "cancelled" || order.status === "refunded") {
        return res.status(400).json({ message: `Order is already ${order.status}` });
      }
      const actor = staffUsername || "admin";
      // If paid, issue a refund automatically
      if (order.status === "paid" && order.squarePaymentId) {
        const idKey = `refund-cancel-${id}-${Date.now()}`;
        await square.createRefund({ paymentId: order.squarePaymentId, amountPence: order.totalPence, reason: reason || "Order cancelled by staff", idempotencyKey: idKey });
        await storage.updateAppOrderStatus(id, "refunded");
        await storage.logOrderAction({ orderId: id, staffUsername: actor, action: "cancel+refund", reason: reason || undefined });
        console.log(`[ORDERS] Order #${id} cancelled+refunded by ${actor}`);
        return res.json({ status: "refunded", message: "Payment refunded and order cancelled" });
      }
      await storage.updateAppOrderStatus(id, "cancelled");
      await storage.logOrderAction({ orderId: id, staffUsername: actor, action: "cancel", reason: reason || undefined });
      // Kiosk (counter-pay) orders have a real Square Open Ticket waiting in
      // the POS. If we don't void it on Square's side, it sits in staff's
      // Open Tickets list forever. Best-effort — failures are logged but
      // don't block the local cancel.
      if (order.paymentMethod === "counter" && order.squareOrderId) {
        const voided = await square.cancelSquareOrder(order.squareOrderId);
        if (!voided) console.warn(`[ORDERS] Could not void Square ticket for #${id} (${order.squareOrderId}) — clear it manually in Square POS`);
      }
      console.log(`[ORDERS] Order #${id} cancelled by ${actor}`);
      res.json({ status: "cancelled" });
    } catch (err: any) {
      console.error("[ORDERS] Cancel failed:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Staff: advance an app order through its kitchen lifecycle ───────────────
  // Forward-only transitions used by the kitchen view to keep the customer's
  // receipt status banner in sync. Cancel/refund remain on their own routes
  // because they require PIN authorisation and may issue a refund. This route
  // intentionally does not require a PIN — it is a routine, low-risk action
  // performed many times per shift.
  app.post("/api/staff/orders/:id/advance", staffAuth, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ message: "Invalid order ID" });
    const target = String((req.body || {}).status || "").trim();
    // Allowed forward transitions. "delivered" is for table service, "collected"
    // for bar pickup — staff pick whichever applies.
    const ALLOWED: Record<string, string[]> = {
      paid:      ["preparing", "ready", "delivered", "collected", "completed"],
      preparing: ["ready", "delivered", "collected", "completed"],
      ready:     ["delivered", "collected", "completed"],
    };
    const TERMINAL = new Set(["delivered", "collected", "completed"]);
    const staffUsername = (req as any).staffUsername as string | null;
    try {
      const order = await storage.getAppOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      const next = ALLOWED[order.status];
      if (!next) {
        return res.status(400).json({ message: `Cannot advance an order that is ${order.status}` });
      }
      if (!next.includes(target)) {
        return res.status(400).json({ message: `Invalid transition from ${order.status} to ${target || "(none)"}` });
      }
      const actor = staffUsername || "admin";
      await storage.updateAppOrderStatus(id, target);
      await storage.logOrderAction({ orderId: id, staffUsername: actor, action: `advance:${target}` });
      console.log(`[ORDERS] Order #${id} advanced ${order.status}→${target} by ${actor}`);

      // Notify the device that placed the order. Live receipt polling only
      // works while the screen is open in the foreground — a push closes
      // that gap so customers know the moment their order is ready (or has
      // been delivered/collected) even if they've closed the app. We send
      // ONLY to the originating device's token, not every device on the
      // account, so other phones the customer is signed into stay quiet.
      const NOTIFY: Record<string, { title: string; body: string }> = {
        ready: {
          title: "Your order is ready 🎉",
          body: order.tableNote
            ? `Order #${id.toString().padStart(5, "0")} is on its way to ${order.tableNote}.`
            : `Order #${id.toString().padStart(5, "0")} is ready to collect from the bar.`,
        },
        delivered: {
          title: "Enjoy your order!",
          body: order.tableNote
            ? `Order #${id.toString().padStart(5, "0")} has been delivered to ${order.tableNote}.`
            : `Order #${id.toString().padStart(5, "0")} has been served. Enjoy!`,
        },
        collected: {
          title: "Thanks!",
          body: `Order #${id.toString().padStart(5, "0")} collected — enjoy!`,
        },
        completed: {
          title: "Order complete 🎉",
          body: `Order #${id.toString().padStart(5, "0")} is complete — enjoy!`,
        },
      };
      // FEATURE_ORDER_PREPARING_PUSH: opt-in "Your order is being prepared"
      // notification when the kitchen advances paid → preparing. Gated
      // because some venues prefer staying quiet between "received" and
      // "ready" — flipping the env var enables the extra ping per env.
      // The "ready" / "delivered" / "collected" pushes below are
      // unconditional and always sent.
      if (target === "preparing" && getServerFeatureFlags().orderPreparingPush) {
        NOTIFY.preparing = {
          title: "Your order is being prepared 👨‍🍳",
          body: `The kitchen has started on order #${id.toString().padStart(5, "0")}.`,
        };
      }
      const message = NOTIFY[target];
      if (message && order.pushToken) {
        // Tapping the notification deep-links back into the receipt screen
        // for THIS order. The confirmationToken is required by the
        // /confirmation endpoint so the deep link stays scoped to the
        // device that originally placed the order.
        const data = {
          type: "order-status" as const,
          appOrderId: id,
          token: order.confirmationToken ?? "",
          status: target,
        };
        sendTargetedPush([order.pushToken], message.title, message.body, data).catch((err: any) => {
          console.error("[Push] Order status notification failed:", err?.message ?? err);
        });
      }

      res.json({ status: target, isTerminal: TERMINAL.has(target) });
    } catch (err: any) {
      console.error("[ORDERS] Advance failed:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Staff: revert an accidental kitchen status change ─────────────────────
  // The advance route is forward-only, so a mistap (e.g. "Delivered" instead
  // of "Mark ready") would lock the order in a terminal state and jump the
  // customer's receipt ahead. This route undoes the most recent forward
  // transition. To keep blast radius small:
  //   • Within a 60-second window after the mistake, ANY signed-in staff can
  //     revert without a manager's approval — this covers the common
  //     "oops, undo that" case.
  //   • After the window, only managers/owners may revert, and they must
  //     supply a reason which is recorded in `order_audit_log`.
  // The previous status is reconstructed by walking the order's audit log so
  // it correctly handles skipped statuses (e.g. paid → delivered reverts
  // back to paid, not ready).
  app.post("/api/staff/orders/:id/revert", staffAuth, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ message: "Invalid order ID" });
    const reason = String((req.body || {}).reason || "").trim();
    const staffUsername = (req as any).staffUsername as string | null;
    const staffRole = ((req as any).staffRole as string | null) || "staff";
    const isManager = staffRole === "manager" || staffRole === "owner";
    const UNDO_WINDOW_MS = 60_000;
    try {
      const order = await storage.getAppOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      // Only kitchen-lifecycle statuses can be reverted. Cancel/refund/expire
      // have their own dedicated routes and require different handling.
      const REVERTABLE = new Set(["preparing", "ready", "delivered", "collected", "completed"]);
      if (!REVERTABLE.has(order.status)) {
        return res.status(400).json({ message: `Cannot revert an order that is ${order.status}` });
      }
      // Walk the audit log forward to reconstruct the status history.
      // Stack semantics: each "advance:X" pushes a state, each "revert:X→Y"
      // pops back. The current state is the top of the stack; the previous
      // state (what we revert to) is one below.
      const auditAsc = (await storage.getOrderAuditLog(id)).slice().reverse();
      const history: Array<{ state: string; at: Date }> = [
        { state: "paid", at: order.createdAt },
      ];
      for (const entry of auditAsc) {
        if (entry.action.startsWith("advance:")) {
          const target = entry.action.slice("advance:".length);
          history.push({ state: target, at: entry.createdAt });
        } else if (entry.action.startsWith("revert:")) {
          if (history.length > 1) history.pop();
        }
      }
      const top = history[history.length - 1];
      if (history.length < 2 || top.state !== order.status) {
        // Either no forward step to undo, or the audit log is out of sync
        // with the order row — bail out rather than guess.
        return res.status(400).json({ message: "Nothing to undo for this order" });
      }
      const previous = history[history.length - 2].state;
      const ageMs = Date.now() - new Date(top.at).getTime();
      const withinWindow = ageMs <= UNDO_WINDOW_MS;
      if (!withinWindow && !isManager) {
        return res.status(403).json({
          message: `Only a manager can undo this — the change was ${Math.round(ageMs / 1000)}s ago (limit 60s).`,
        });
      }
      if (!withinWindow && !reason) {
        return res.status(400).json({ message: "A reason is required for manager reverts." });
      }
      const actor = staffUsername || "admin";
      await storage.updateAppOrderStatus(id, previous);
      await storage.logOrderAction({
        orderId: id,
        staffUsername: actor,
        action: `revert:${order.status}->${previous}`,
        reason: reason || undefined,
      });
      console.log(`[ORDERS] Order #${id} reverted ${order.status}→${previous} by ${actor}${reason ? ` (${reason})` : ""}`);
      res.json({ status: previous, from: order.status });
    } catch (err: any) {
      console.error("[ORDERS] Revert failed:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Staff: refund a paid app order (PIN-authorised) ───────────────────────────
  app.post("/api/staff/orders/:id/refund", staffAuth, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ message: "Invalid order ID" });
    const { pin, reason } = req.body;
    const staffUsername = (req as any).staffUsername as string | null;
    // Verify staff credential for named staff accounts.
    // Accepts either the user's password or, for legacy accounts that still have one, their PIN.
    if (staffUsername) {
      if (!pin) return res.status(400).json({ message: "Password required to authorise this action" });
      const staffUser = await storage.getStaffUserByUsername(staffUsername);
      if (!staffUser || !verifyStaffCredential(String(pin), staffUser)) {
        return res.status(401).json({ message: "Incorrect password" });
      }
    }
    try {
      const order = await storage.getAppOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.status !== "paid") return res.status(400).json({ message: "Only paid orders can be refunded" });
      if (!order.squarePaymentId) return res.status(400).json({ message: "No payment ID on record — contact Square support" });
      const actor = staffUsername || "admin";
      const idKey = `refund-${id}-${Date.now()}`;
      await square.createRefund({
        paymentId: order.squarePaymentId,
        amountPence: order.totalPence,
        reason: reason || "Refund issued by staff",
        idempotencyKey: idKey,
      });
      await storage.updateAppOrderStatus(id, "refunded");
      await storage.logOrderAction({ orderId: id, staffUsername: actor, action: "refund", reason: reason || undefined });
      console.log(`[ORDERS] Order #${id} refunded by ${actor}`);
      res.json({ status: "refunded" });
    } catch (err: any) {
      console.error("[ORDERS] Refund failed:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Customer: order history ───────────────────────────────────────────────────
  // Two paths point at the same handler: `/api/customers/orders` is the
  // legacy path the account screen has always used; `/api/orders/mine` is
  // the canonical name used by newer surfaces ("My orders").
  const customerOrdersHandler: import("express").RequestHandler = async (req, res) => {
    try {
      const email = (req as any).customerEmail as string | undefined;
      if (!email) return res.status(400).json({ message: "No customer email" });
      const orders = await storage.getCustomerOrders(email);
      res.json(orders);
    } catch (err: any) {
      console.error("[ORDERS] Customer orders failed:", err.message);
      res.status(500).json({ message: err.message });
    }
  };
  app.get("/api/customers/orders", customerAuth, customerOrdersHandler);
  app.get("/api/orders/mine", customerAuth, customerOrdersHandler);

  app.get("/api/events", async (req, res) => {
    try {
      const eventType = req.query.type as string | undefined;

      // Weekly events always come from the DB (manually managed)
      if (eventType === "weekly") {
        const weeklyEvents = await storage.getActiveEvents("weekly");
        return res.json(weeklyEvents);
      }

      // One-off events: merge Ticket Source events with DB events
      if (!eventType || eventType === "event") {
        const [tsEvents, dbEvents] = await Promise.all([
          fetchTicketSourceEvents().catch(() => [] as AppEvent[]),
          storage.getActiveEvents("event"),
        ]);
        const mapped = tsEvents.map(mapTsEvent);
        const combined = [...dbEvents, ...mapped];
        // Sort by date ascending, undated events last
        combined.sort((a, b) => {
          if (!a.date) return 1;
          if (!b.date) return -1;
          return a.date.localeCompare(b.date) || ((a.time || "").localeCompare(b.time || ""));
        });
        return res.json(combined);
      }

      const allEvents = await storage.getActiveEvents(eventType);
      res.json(allEvents);
    } catch (err) {
      console.error("Events fetch error:", err);
      res.json([]);
    }
  });

  app.get("/api/events/all", staffAuth, managerAuth, async (req, res) => {
    const { type } = req.query as { type?: string };
    const dbEvents = await storage.getEvents();

    if (type === "weekly") {
      return res.json(dbEvents.filter((e) => e.eventType === "weekly"));
    }

    // For "event" type (or no filter): merge DB events with TicketSource events
    const dbFiltered = type === "event" ? dbEvents.filter((e) => e.eventType === "event") : dbEvents;
    try {
      const tsEvents = await fetchTicketSourceEvents().catch(() => [] as AppEvent[]);
      const mapped = tsEvents.map(mapTsEvent);
      const combined = [...dbFiltered, ...mapped];
      combined.sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.localeCompare(b.date) || ((a.time || "").localeCompare(b.time || ""));
      });
      return res.json(combined);
    } catch {
      return res.json(dbFiltered);
    }
  });

  app.post("/api/events", staffAuth, managerAuth, async (req, res) => {
    const parsed = insertEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid event data", details: parsed.error.issues });
    }
    const event = await storage.createEvent(parsed.data);
    res.status(201).json(event);
  });

  app.put("/api/events/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid event ID" });
    const event = await storage.updateEvent(id, req.body);
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  });

  app.delete("/api/events/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid event ID" });
    const deleted = await storage.deleteEvent(id);
    if (!deleted) return res.status(404).json({ error: "Event not found" });
    res.json({ message: "Event deleted" });
  });

  app.get("/api/settings", async (_req, res) => {
    const settings = await storage.getAllSettings();
    res.json(settings);
  });

  app.get("/api/settings/:key", async (req, res) => {
    const value = await storage.getSetting(req.params.key as string);
    res.json({ key: req.params.key, value });
  });

  app.put("/api/settings/:key", staffAuth, managerAuth, async (req, res) => {
    const { value } = req.body;
    if (value === undefined || value === null) {
      return res.status(400).json({ message: "Value is required" });
    }
    await storage.setSetting(req.params.key as string, String(value));
    res.json({ key: req.params.key, value: String(value) });
  });

  app.get("/api/banner-images", async (req, res) => {
    const page = typeof req.query.page === "string" ? req.query.page : undefined;
    const images = await storage.getBannerImages(page);
    res.json(images);
  });

  app.get("/api/banner-images/all", staffAuth, async (_req, res) => {
    const images = await storage.getAllBannerImages();
    res.json(images);
  });

  app.post("/api/upload/banner", staffAuth, managerAuth, upload.single("image"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }
    try {
      const compressed = await sharp(req.file.buffer)
        .resize({ width: 1000, withoutEnlargement: true })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer();
      const imageUrl = `data:image/jpeg;base64,${compressed.toString("base64")}`;
      res.json({ imageUrl });
    } catch {
      const base64 = req.file.buffer.toString("base64");
      res.json({ imageUrl: `data:${req.file.mimetype};base64,${base64}` });
    }
  });

  app.post("/api/banner-images", staffAuth, managerAuth, upload.single("image"), async (req, res) => {
    if (req.file) {
      try {
        const compressed = await sharp(req.file.buffer)
          .resize({ width: 1000, withoutEnlargement: true })
          .jpeg({ quality: 72, mozjpeg: true })
          .toBuffer();
        const imageUrl = `data:image/jpeg;base64,${compressed.toString("base64")}`;
        const sortOrder = parseInt(req.body.sortOrder ?? "0");
        const active = req.body.active !== "false";
        const linkType = req.body.linkType?.trim() || null;
        // Force linkValue to null for non-url link types so a "park unsafe
        // value under linkType=event, then flip linkType to url later"
        // bypass is impossible at the storage layer. Banners with
        // linkType="event"|"order" navigate to fixed routes and never
        // dereference linkValue.
        const rawLinkValue = req.body.linkValue?.trim() || null;
        const linkValue = linkType === "url" ? rawLinkValue : null;
        // Block javascript:, data:, and other non-navigation schemes from
        // being persisted. The banner is rendered as a tappable link on
        // public pages, so an unsafe scheme here is a stored-XSS sink on web.
        if (linkType === "url" && linkValue != null && !isSafePublicUrl(linkValue)) {
          return res.status(400).json({ message: "Banner URL must start with https:// or http://" });
        }
        const image = await storage.createBannerImage({
          imageUrl,
          title: req.body.title?.trim() || null,
          sortOrder: isNaN(sortOrder) ? 0 : sortOrder,
          active,
          linkType,
          linkValue,
        });
        return res.status(201).json(image);
      } catch (err) {
        return res.status(500).json({ message: "Image processing failed" });
      }
    }
    const parsed = insertBannerImageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid banner image data", errors: parsed.error.flatten() });
    }
    // Mirror the multipart branch: drop linkValue if linkType isn't "url".
    const safeData = parsed.data.linkType === "url"
      ? parsed.data
      : { ...parsed.data, linkValue: null };
    const image = await storage.createBannerImage(safeData);
    res.status(201).json(image);
  });

  app.put("/api/banner-images/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    // Validate the *effective final row* after merging the patch, not just
    // the submitted fields. This closes a state-transition bypass where an
    // attacker could (a) save linkValue="javascript:…" while linkType=null,
    // then (b) flip linkType="url" in a separate PUT without resubmitting
    // linkValue. Loading the existing row and merging closes that gap.
    const existing = await storage.getBannerImageById(id);
    if (!existing) return res.status(404).json({ error: "Banner image not found" });
    const body = (req.body ?? {}) as Partial<InsertBannerImage>;
    const finalLinkType = body.linkType !== undefined ? body.linkType : existing.linkType;
    const submittedValue = typeof body.linkValue === "string" ? body.linkValue.trim() : body.linkValue;
    const finalLinkValue = body.linkValue !== undefined ? submittedValue : existing.linkValue;
    if (finalLinkType === "url") {
      if (!finalLinkValue || !isSafePublicUrl(finalLinkValue)) {
        return res.status(400).json({ message: "Banner URL must start with https:// or http://" });
      }
    } else {
      // Whenever the effective final linkType is anything other than "url"
      // (existing or submitted), never persist a linkValue. This both
      // clears existing unsafe stored values when the manager changes
      // link type and rejects any new linkValue submitted alongside a
      // non-url link type, closing the data-hygiene gap where a dormant
      // unsafe value could be parked under a non-url linkType.
      (body as { linkValue?: string | null }).linkValue = null;
    }
    const updated = await storage.updateBannerImage(id, body);
    if (!updated) return res.status(404).json({ error: "Banner image not found" });
    res.json(updated);
  });

  // Atomic bulk reorder of banner images. Body: { orderedIds: number[] } where
  // position 0 is shown first. The whole thing runs in one transaction so the
  // home strip is never observed mid-shuffle.
  app.post("/api/banner-images/reorder", staffAuth, managerAuth, async (req, res) => {
    const orderedIds = req.body?.orderedIds;
    if (!Array.isArray(orderedIds) || !orderedIds.every((x) => Number.isInteger(x))) {
      return res.status(400).json({ error: "orderedIds must be an array of integers" });
    }
    try {
      const banners = await storage.reorderBannerImages(orderedIds);
      res.json(banners);
    } catch (err) {
      console.error("Banner reorder failed:", err);
      res.status(500).json({ error: "Failed to reorder banners" });
    }
  });

  app.delete("/api/banner-images/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const deleted = await storage.deleteBannerImage(id);
    if (!deleted) return res.status(404).json({ error: "Banner image not found" });
    res.json({ message: "Banner image deleted" });
  });

  app.post("/api/contact", async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const rl = checkRateLimit(`contact:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({ message: "Too many contact requests. Please wait before trying again." });
    }
    const { pushToken: incomingPushToken, ...bodyRest } = req.body;
    const parsed = insertContactMessageSchema.safeParse(bodyRest);
    if (!parsed.success) {
      return res.status(400).json({ message: "Please fill in all required fields", errors: parsed.error.flatten() });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(parsed.data.email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    if (!parsed.data.gdprConsent) {
      return res.status(400).json({ message: "You must consent to data processing to send a message" });
    }

    // Push token is stored directly on the contact message for the reply notification.
    // We intentionally do NOT bind the token to the email here: the contact form is
    // unauthenticated, so accepting an arbitrary (email, pushToken) pairing from the
    // request body would let an attacker redirect notifications for any email address.

    const contact = await storage.createContactMessage({
      ...parsed.data,
      pushToken: incomingPushToken ?? null,
    } as any);

    try {
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: "The 147 App <onboarding@resend.dev>",
            to: "info@the147.co.uk",
            subject: `Contact Form: ${parsed.data.subject}`,
            html: `<h2>New Contact Form Submission</h2>
<p><strong>Name:</strong> ${escHtml(parsed.data.name)}</p>
<p><strong>Email:</strong> ${escHtml(parsed.data.email)}</p>
<p><strong>Phone:</strong> ${escHtml(parsed.data.phone || "Not provided")}</p>
<p><strong>Subject:</strong> ${escHtml(parsed.data.subject)}</p>
<p><strong>Message:</strong></p>
<p>${escHtml(parsed.data.message).replace(/\n/g, "<br>")}</p>
<hr>
<p><small>Sent via The 147 App contact form</small></p>`,
          }),
        });
      }
    } catch (err) {
      console.error("Email send error (non-critical):", err);
    }

    res.status(201).json({ message: "Your message has been sent. We'll get back to you soon!", id: contact.id });
  });

  app.get("/api/contact", staffAuth, async (_req, res) => {
    const messages = await storage.getContactMessages();
    res.json(messages);
  });

  app.patch("/api/contact/:id/status", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { status } = req.body;
    if (!status || !["new", "read", "replied"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const updated = await storage.updateContactMessageStatus(id, status);
    if (!updated) return res.status(404).json({ message: "Message not found" });
    res.json(updated);
  });

  app.post("/api/contact/:id/reply", staffAuth, async (req: any, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { replyText } = req.body;
    if (!replyText?.trim()) return res.status(400).json({ message: "Reply text is required" });

    const msg = await storage.getContactMessage(id);
    if (!msg) return res.status(404).json({ message: "Message not found" });

    const updated = await storage.replyToContactMessage(id, replyText.trim());

    // Send push notification to the customer's device(s)
    let pushed = false;
    const tokenSources: string[] = [];
    if (msg.pushToken) tokenSources.push(msg.pushToken);
    const emailTokens = await storage.getPushTokensByEmail(msg.email);
    emailTokens.forEach(t => { if (!tokenSources.includes(t.token)) tokenSources.push(t.token); });
    if (tokenSources.length) {
      await sendTargetedPush(tokenSources, "The 147 – Reply to your message", replyText.trim().slice(0, 200));
      pushed = true;
    }

    res.json({ updated, pushed });
  });

  app.post("/api/loyalty/phone-auth", async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const rl = checkRateLimit(`phone-auth:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({ message: "Too many requests. Please wait before trying again." });
    }
    if (!square.isConfigured()) {
      return res.status(503).json({ message: "Loyalty program not configured" });
    }
    const { phone } = req.body;
    if (!phone || typeof phone !== "string") {
      return res.status(400).json({ message: "Phone number is required" });
    }
    const phoneCleaned = phone.replace(/\s/g, "");
    if (phoneCleaned.length < 10) {
      return res.status(400).json({ message: "Please enter a valid UK phone number" });
    }
    // NOTE: This endpoint intentionally does NOT create a loyalty session token and
    // does NOT reveal whether an account exists for the submitted phone number.
    // A session is only granted after the caller completes OTP verification via
    // /api/loyalty/send-code → /api/loyalty/verify-code.
    // Always return the same generic response to prevent account-existence probing.
    res.json({ received: true });
  });

  app.post("/api/loyalty/send-code", async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const rl = checkRateLimit(`otp:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({ message: "Too many requests. Please wait before trying again." });
    }
    if (!square.isConfigured()) {
      return res.status(503).json({ message: "Loyalty program not configured" });
    }
    const { email, phone } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Email address is required" });
    }
    if (!phone || typeof phone !== "string") {
      return res.status(400).json({ message: "Phone number is required" });
    }
    const emailClean = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailClean)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }
    const phoneCleaned = phone.replace(/\s/g, "");
    if (phoneCleaned.length < 10) {
      return res.status(400).json({ message: "Please enter a valid phone number" });
    }
    // Security: verify the submitted email and phone are both registered to the
    // same customer account before issuing an OTP.  This prevents an attacker
    // from supplying a victim's phone number alongside their own email address
    // to receive the OTP themselves and then claim a loyalty session for the
    // victim's phone.  We use a generic response on mismatch to avoid leaking
    // whether a phone/email exists in the system (account enumeration).
    //
    // Normalise phone to local UK format for comparison so that numbers stored
    // as "+447xxxxxxxxx" or "447xxxxxxxxx" match "07xxxxxxxxx" and vice-versa.
    function normaliseUkPhone(p: string): string {
      const s = p.replace(/\s/g, "");
      if (s.startsWith("+44")) return "0" + s.slice(3);
      if (s.startsWith("44") && s.length >= 11) return "0" + s.slice(2);
      return s;
    }
    const customer = await storage.getCustomerByEmail(emailClean);
    const customerPhone = normaliseUkPhone(customer?.phone ?? "");
    const submittedPhone = normaliseUkPhone(phoneCleaned);
    if (!customer || customerPhone !== submittedPhone) {
      // Simulate the same delay as a real code-send to prevent timing attacks
      await new Promise((r) => setTimeout(r, 400));
      return res.json({ sent: true, expiresIn: OTP_EXPIRY / 1000 });
    }

    const otpKey = `${emailClean}:${phoneCleaned}`;
    cleanupExpiredOtps();
    const existing = loyaltyOtps.get(otpKey);
    if (existing && existing.expiresAt > Date.now()) {
      const waitSeconds = Math.ceil((existing.expiresAt - Date.now() - (OTP_EXPIRY - 60000)) / 1000);
      if (waitSeconds > 0) {
        return res.status(429).json({ message: `Please wait before requesting a new code`, retryAfter: waitSeconds });
      }
    }
    const code = generateOtp();
    loyaltyOtps.set(otpKey, { code, phone: phoneCleaned, expiresAt: Date.now() + OTP_EXPIRY, attempts: 0 });
    const emailSent = await sendOtpEmail(emailClean, code);
    if (!emailSent) {
      // Keep the OTP stored so staff can manually provide the code from server logs
      return res.status(503).json({
        message: "We couldn't send the verification email right now. Please ask a staff member for your code, or try again later.",
        manualCode: true,
      });
    }
    res.json({ sent: true, expiresIn: OTP_EXPIRY / 1000 });
  });

  app.post("/api/loyalty/verify-code", async (req, res) => {
    const { email, phone, code } = req.body;
    if (!email || !phone || !code) {
      return res.status(400).json({ message: "Email, phone number, and code are required" });
    }
    const emailClean = email.trim().toLowerCase();
    const phoneCleaned = phone.replace(/\s/g, "");
    const otpKey = `${emailClean}:${phoneCleaned}`;
    cleanupExpiredOtps();
    const otpEntry = loyaltyOtps.get(otpKey);
    if (!otpEntry) {
      return res.status(400).json({ message: "No verification code found. Please request a new code." });
    }
    if (otpEntry.attempts >= OTP_MAX_ATTEMPTS) {
      loyaltyOtps.delete(otpKey);
      return res.status(429).json({ message: "Too many incorrect attempts. Please request a new code." });
    }
    if (!timingSafeCompare(code, otpEntry.code)) {
      otpEntry.attempts += 1;
      const remaining = OTP_MAX_ATTEMPTS - otpEntry.attempts;
      return res.status(401).json({ message: `Incorrect code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` });
    }
    loyaltyOtps.delete(otpKey);
    cleanupExpiredLoyaltySessions();
    const sessionToken = randomBytes(32).toString("hex");
    loyaltySessions.set(sessionToken, { phone: phoneCleaned, expiresAt: Date.now() + LOYALTY_SESSION_EXPIRY });
    res.json({ verified: true, sessionToken, expiresIn: LOYALTY_SESSION_EXPIRY / 1000 });
  });

  app.get("/api/loyalty/session", async (req, res) => {
    const token = req.headers["x-loyalty-session"] as string;
    if (!token) {
      return res.json({ valid: false });
    }
    const phone = validateLoyaltySession(token);
    if (!phone) {
      return res.json({ valid: false });
    }
    res.json({ valid: true, phone });
  });

  app.post("/api/loyalty/logout", async (req, res) => {
    const token = req.headers["x-loyalty-session"] as string;
    if (token) {
      loyaltySessions.delete(token);
    }
    res.json({ loggedOut: true });
  });

  app.get("/api/loyalty/program", async (_req, res) => {
    if (!square.isConfigured()) {
      return res.status(503).json({ message: "Loyalty program not configured" });
    }
    try {
      const program = await square.getLoyaltyProgram();
      if (!program) {
        return res.json({ configured: true, active: false, program: null });
      }
      res.json({
        configured: true,
        active: program.status === "ACTIVE",
        program: {
          id: program.id,
          terminology: program.terminology,
          reward_tiers: program.reward_tiers?.map((t: any) => ({
            id: t.id,
            name: t.name,
            points: t.points,
            definition: t.definition,
          })),
          accrual_rules: program.accrual_rules?.map((r: any) => ({
            accrual_type: r.accrual_type,
            points: r.points,
            spend_data: r.spend_amount_money ? {
              amount: r.spend_amount_money.amount,
              currency: r.spend_amount_money.currency,
            } : undefined,
          })),
        },
      });
    } catch (err: any) {
      console.error("Square loyalty program error:", err.message);
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  app.get("/api/loyalty/history", async (req, res) => {
    if (!square.isConfigured()) return res.status(503).json({ message: "Not configured" });
    const sessionToken = req.headers["x-loyalty-session"] as string;
    const sessionPhone = sessionToken ? validateLoyaltySession(sessionToken) : null;
    if (!sessionPhone) return res.status(401).json({ message: "Unauthorised" });
    try {
      const account = await square.searchLoyaltyAccount(sessionPhone);
      if (!account) return res.json({ events: [], rewards: [] });
      const [events, rewards] = await Promise.all([
        square.searchLoyaltyEvents(account.id, 15),
        square.searchIssuedRewards(account.id),
      ]);
      res.json({ events, rewards });
    } catch (err: any) {
      console.error("Square loyalty history error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/loyalty/lookup", async (req, res) => {
    if (!square.isConfigured()) {
      return res.status(503).json({ message: "Loyalty program not configured" });
    }
    const sessionToken = req.headers["x-loyalty-session"] as string;
    const sessionPhone = sessionToken ? validateLoyaltySession(sessionToken) : null;
    if (!sessionPhone) {
      return res.status(401).json({ message: "Please verify your phone number first" });
    }
    try {
      const account = await square.searchLoyaltyAccount(sessionPhone);
      if (!account) {
        return res.json({ found: false, account: null });
      }
      res.json({
        found: true,
        account: {
          id: account.id,
          balance: account.balance,
          lifetime_points: account.lifetime_points,
          enrolled_at: account.enrolled_at,
          phone: account.mapping?.phone_number,
        },
      });
    } catch (err: any) {
      console.error("Square loyalty lookup error:", err.message);
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  app.post("/api/loyalty/enroll", async (req, res) => {
    if (!square.isConfigured()) {
      return res.status(503).json({ message: "Loyalty program not configured" });
    }
    const sessionToken = req.headers["x-loyalty-session"] as string;
    const sessionPhone = sessionToken ? validateLoyaltySession(sessionToken) : null;
    if (!sessionPhone) {
      return res.status(401).json({ message: "Please verify your phone number first" });
    }
    const phone = sessionPhone;
    try {
      const program = await square.getLoyaltyProgram();
      if (!program) {
        return res.status(400).json({ message: "No active loyalty program" });
      }
      const existing = await square.searchLoyaltyAccount(phone);
      if (existing) {
        return res.json({
          enrolled: false,
          existing: true,
          account: {
            id: existing.id,
            balance: existing.balance,
            lifetime_points: existing.lifetime_points,
            enrolled_at: existing.enrolled_at,
            phone: existing.mapping?.phone_number,
          },
        });
      }
      const account = await square.createLoyaltyAccount(phone, program.id);
      res.status(201).json({
        enrolled: true,
        existing: false,
        account: {
          id: account.id,
          balance: account.balance,
          lifetime_points: account.lifetime_points,
          enrolled_at: account.enrolled_at,
          phone: account.mapping?.phone_number,
        },
      });
    } catch (err: any) {
      console.error("Square loyalty enroll error:", err.message);
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  app.post("/api/loyalty/points/add", staffAuth, async (req, res) => {
    if (!square.isConfigured()) {
      return res.status(503).json({ message: "Loyalty program not configured" });
    }
    const { accountId, points } = req.body;
    if (!accountId || typeof points !== "number" || points <= 0) {
      return res.status(400).json({ message: "Account ID and positive points value required" });
    }
    try {
      const idempotencyKey = `add-${accountId}-${points}-${Date.now()}`;
      const event = await square.accumulateLoyaltyPoints(accountId, points, idempotencyKey);
      const updated = await square.getLoyaltyAccount(accountId);
      res.json({
        success: true,
        event,
        account: {
          id: updated.id,
          balance: updated.balance,
          lifetime_points: updated.lifetime_points,
        },
      });
    } catch (err: any) {
      console.error("Square loyalty add points error:", err.message);
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  app.post("/api/loyalty/points/adjust", staffAuth, async (req, res) => {
    if (!square.isConfigured()) {
      return res.status(503).json({ message: "Loyalty program not configured" });
    }
    const { accountId, points, reason } = req.body;
    if (!accountId || typeof points !== "number" || !reason) {
      return res.status(400).json({ message: "Account ID, points value, and reason required" });
    }
    try {
      const idempotencyKey = `adjust-${accountId}-${points}-${Date.now()}`;
      const event = await square.adjustLoyaltyPoints(accountId, points, reason, idempotencyKey);
      const updated = await square.getLoyaltyAccount(accountId);
      res.json({
        success: true,
        event,
        account: {
          id: updated.id,
          balance: updated.balance,
          lifetime_points: updated.lifetime_points,
        },
      });
    } catch (err: any) {
      console.error("Square loyalty adjust points error:", err.message);
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  app.post("/api/loyalty/redeem", staffAuth, async (req, res) => {
    if (!square.isConfigured()) {
      return res.status(503).json({ message: "Loyalty program not configured" });
    }
    const { accountId, rewardTierId } = req.body;
    if (!accountId || !rewardTierId) {
      return res.status(400).json({ message: "Account ID and reward tier ID required" });
    }
    try {
      const idempotencyKey = `redeem-${accountId}-${rewardTierId}-${Date.now()}`;
      const reward = await square.redeemLoyaltyReward(accountId, rewardTierId, idempotencyKey);
      const updated = await square.getLoyaltyAccount(accountId);
      res.json({
        success: true,
        reward,
        account: {
          id: updated.id,
          balance: updated.balance,
          lifetime_points: updated.lifetime_points,
        },
      });
    } catch (err: any) {
      console.error("Square loyalty redeem error:", err.message);
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  // ── Authenticated loyalty (no phone+OTP) ────────────────────────────────────
  // ── Phase 3 helpers: loyalty configuration + birthday bonus + visit points ──
  // Settings live in the existing `siteSettings` key/value table so staff can
  // edit them without a deploy. Defaults are sane for a UK snooker hall.
  const LOYALTY_VISIT_POINTS_KEY = "loyalty.visitPoints";
  const LOYALTY_BIRTHDAY_BONUS_KEY = "loyalty.birthdayBonus";
  const LOYALTY_DOUBLE_POINTS_KEY = "loyalty.doublePointsToday";
  const LOYALTY_VISIT_POINTS_DEFAULT = 5;
  const LOYALTY_BIRTHDAY_BONUS_DEFAULT = 50;

  type LoyaltyConfig = {
    visitPoints: number;
    birthdayBonus: number;
    doublePointsToday: boolean;
  };
  async function loadLoyaltyConfig(): Promise<LoyaltyConfig> {
    const [vpRaw, bbRaw, dpRaw] = await Promise.all([
      storage.getSetting(LOYALTY_VISIT_POINTS_KEY),
      storage.getSetting(LOYALTY_BIRTHDAY_BONUS_KEY),
      storage.getSetting(LOYALTY_DOUBLE_POINTS_KEY),
    ]);
    const vp = vpRaw ? parseInt(vpRaw, 10) : NaN;
    const bb = bbRaw ? parseInt(bbRaw, 10) : NaN;
    return {
      visitPoints: Number.isFinite(vp) && vp >= 0 ? vp : LOYALTY_VISIT_POINTS_DEFAULT,
      birthdayBonus: Number.isFinite(bb) && bb >= 0 ? bb : LOYALTY_BIRTHDAY_BONUS_DEFAULT,
      doublePointsToday: dpRaw === "true",
    };
  }

  // Birthday-week window: the seven calendar days starting on the customer's
  // birthday in the *current* year. Returns null if DOB isn't set or parsable.
  // Feb 29 birthdays fall back to Feb 28 in non-leap years.
  function birthdayWindowForYear(dobIso: string | null | undefined, year: number): { start: Date; end: Date; thisYearBirthday: Date } | null {
    if (!dobIso || !/^\d{4}-\d{2}-\d{2}$/.test(dobIso)) return null;
    const [, monthStr, dayStr] = dobIso.split("-");
    let month = parseInt(monthStr, 10);
    let day = parseInt(dayStr, 10);
    if (!month || !day) return null;
    // Feb 29 in non-leap year → use Feb 28
    if (month === 2 && day === 29) {
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      if (!isLeap) day = 28;
    }
    const thisYearBirthday = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (isNaN(thisYearBirthday.getTime())) return null;
    const end = new Date(thisYearBirthday);
    end.setDate(end.getDate() + 7);
    return { start: thisYearBirthday, end, thisYearBirthday };
  }

  // Phase 2 of the loyalty UX rebuild: once a customer is signed into their main
  // 147 account we can use the phone number on their profile to find/create their
  // Square loyalty account directly, cache the link on the customer row, and skip
  // the legacy phone+OTP flow entirely. The legacy /api/loyalty/* endpoints stay
  // intact so signed-out users (or those whose loyalty phone differs from their
  // account) still have a path in.
  app.get("/api/loyalty/me", customerAuth, async (req, res) => {
    if (!square.isConfigured()) {
      return res.json({ configured: false, active: false, linked: false, hasPhone: false });
    }
    const customerId = (req as any).customerId as number;
    const customer = await storage.getCustomerById(customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    const phoneCleaned = customer.phone ? customer.phone.replace(/\s/g, "") : null;
    const hasPhone = !!phoneCleaned && phoneCleaned.length >= 10;

    try {
      const program = await square.getLoyaltyProgram();
      if (!program) {
        return res.json({ configured: true, active: false, linked: false, hasPhone, account: null });
      }
      const programActive = program.status === "ACTIVE";
      const baseProgram = {
        id: program.id,
        terminology: program.terminology,
        reward_tiers: program.reward_tiers?.map((t: any) => ({
          id: t.id, name: t.name, points: t.points, definition: t.definition,
        })) ?? [],
        accrual_rules: program.accrual_rules?.map((r: any) => ({
          accrual_type: r.accrual_type,
          points: r.points,
          spend_data: r.spend_amount_money ? {
            amount: r.spend_amount_money.amount,
            currency: r.spend_amount_money.currency,
          } : undefined,
        })) ?? [],
      };

      if (!programActive) {
        return res.json({ configured: true, active: false, linked: false, hasPhone, program: baseProgram, account: null });
      }
      if (!hasPhone) {
        return res.json({ configured: true, active: true, linked: false, hasPhone: false, program: baseProgram, account: null });
      }

      // Try cached account ID first; if Square 404s OR the cached account's
      // phone no longer matches the customer's profile (e.g. they changed
      // numbers, or staff re-mapped the loyalty account), discard the cache
      // and re-search by current profile phone. This prevents a stale link
      // from showing the wrong account's points after a phone change.
      const expectedE164 = square.toE164(phoneCleaned!);
      let account: any = null;
      if (customer.squareLoyaltyAccountId) {
        try {
          const cached = await square.getLoyaltyAccount(customer.squareLoyaltyAccountId);
          const cachedPhone = cached?.mapping?.phone_number ?? null;
          // Trust the cache when (a) the account has no phone mapping (then
          // ID is the only link we have) or (b) the mapped phone matches
          // current profile phone. Otherwise discard.
          if (cached && (!cachedPhone || cachedPhone === expectedE164)) {
            account = cached;
          }
        } catch {
          account = null;
        }
      }
      if (!account) {
        account = await square.searchLoyaltyAccount(phoneCleaned!);
        if (account?.id) {
          if (account.id !== customer.squareLoyaltyAccountId) {
            await storage.setSquareLoyaltyAccountId(customerId, account.id);
          }
        } else if (customer.squareLoyaltyAccountId) {
          // Stored link no longer resolves to anything — clear it so we
          // don't keep retrying the same dead ID.
          await storage.setSquareLoyaltyAccountId(customerId, null);
        }
      }

      if (!account) {
        return res.json({
          configured: true, active: true, linked: false, hasPhone: true, canEnroll: true,
          program: baseProgram, account: null,
        });
      }

      // ── Birthday bonus: award once per calendar year if the customer is in
      // their seven-day birthday window.
      //
      // Order matters: we call Square FIRST (it dedupes via idempotency key
      // `birthday-{customerId}-{year}`), then persist the marker only on
      // success. This avoids the failure mode where a transient Square error
      // marks the customer "awarded" without actually crediting points.
      // Concurrent /me calls are safe — Square's idempotency guarantees a
      // single credit even if two requests slip past the cached marker check.
      const config = await loadLoyaltyConfig();
      const now = new Date();
      const year = now.getFullYear();
      const window = birthdayWindowForYear(customer.dateOfBirth, year);
      let birthdayActive = false;
      let birthdayAwarded = (customer.lastBirthdayBonusYear ?? 0) >= year;
      if (window) {
        const inWindow = now >= window.start && now < window.end;
        birthdayActive = inWindow;
        if (
          inWindow &&
          config.birthdayBonus > 0 &&
          (customer.lastBirthdayBonusYear ?? 0) < year
        ) {
          try {
            await square.adjustLoyaltyPoints(
              account.id,
              config.birthdayBonus,
              `Birthday bonus ${year}`,
              `birthday-${customerId}-${year}`,
            );
            // Square confirmed (or deduped). Persist the marker so next call
            // can short-circuit. If this DB write fails the next /me request
            // will simply call Square again with the same idempotency key —
            // no double-credit, just an extra Square round-trip.
            await storage.setLastBirthdayBonusYear(customerId, year);
            birthdayAwarded = true;
            // Reflect the new balance immediately.
            try {
              const refreshed = await square.getLoyaltyAccount(account.id);
              if (refreshed) account = refreshed;
            } catch {
              account.balance = (account.balance ?? 0) + config.birthdayBonus;
            }
          } catch (bErr: any) {
            console.error(`[LOYALTY] Birthday bonus failed for customer ${customerId}:`, bErr.message);
          }
        }
      }

      const [events, rewards] = await Promise.all([
        square.searchLoyaltyEvents(account.id, 15).catch(() => []),
        square.searchIssuedRewards(account.id).catch(() => []),
      ]);

      res.json({
        configured: true,
        active: true,
        linked: true,
        hasPhone: true,
        program: baseProgram,
        account: {
          id: account.id,
          balance: account.balance,
          lifetime_points: account.lifetime_points,
          enrolled_at: account.enrolled_at,
          phone: account.mapping?.phone_number,
        },
        events,
        rewards,
        birthday: {
          hasDob: !!customer.dateOfBirth,
          active: birthdayActive,
          bonusAwardedThisYear: birthdayAwarded || (customer.lastBirthdayBonusYear ?? 0) >= year,
          bonusPoints: config.birthdayBonus,
          dayOfYear: window ? `${String(window.thisYearBirthday.getMonth() + 1).padStart(2, "0")}-${String(window.thisYearBirthday.getDate()).padStart(2, "0")}` : null,
        },
        promo: {
          doublePointsToday: config.doublePointsToday,
          visitPoints: config.visitPoints,
        },
      });
    } catch (err: any) {
      console.error("/api/loyalty/me error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Staff: read/update loyalty programme settings ──
  // Manager+ only. Settings are stored as plain key/value rows in
  // siteSettings so they take effect immediately and survive restarts.
  app.get("/api/staff/loyalty/settings", staffAuth, managerAuth, async (_req, res) => {
    const cfg = await loadLoyaltyConfig();
    res.json(cfg);
  });

  app.patch("/api/staff/loyalty/settings", staffAuth, managerAuth, async (req, res) => {
    const { visitPoints, birthdayBonus, doublePointsToday } = req.body ?? {};
    const tasks: Promise<void>[] = [];
    if (visitPoints !== undefined) {
      const n = Number(visitPoints);
      if (!Number.isInteger(n) || n < 0 || n > 1000) {
        return res.status(400).json({ message: "visitPoints must be an integer between 0 and 1000" });
      }
      tasks.push(storage.setSetting(LOYALTY_VISIT_POINTS_KEY, String(n)));
    }
    if (birthdayBonus !== undefined) {
      const n = Number(birthdayBonus);
      if (!Number.isInteger(n) || n < 0 || n > 10000) {
        return res.status(400).json({ message: "birthdayBonus must be an integer between 0 and 10000" });
      }
      tasks.push(storage.setSetting(LOYALTY_BIRTHDAY_BONUS_KEY, String(n)));
    }
    // Capture the previous double-points state BEFORE we write — we use it
    // below to decide whether the staff are turning the day ON (and we should
    // broadcast a push) or simply re-saving an already-on day.
    let prevDoublePoints = false;
    if (doublePointsToday !== undefined) {
      if (typeof doublePointsToday !== "boolean") {
        return res.status(400).json({ message: "doublePointsToday must be a boolean" });
      }
      const prevRaw = await storage.getSetting(LOYALTY_DOUBLE_POINTS_KEY);
      prevDoublePoints = prevRaw === "true";
      tasks.push(storage.setSetting(LOYALTY_DOUBLE_POINTS_KEY, doublePointsToday ? "true" : "false"));
    }
    if (tasks.length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }
    await Promise.all(tasks);

    // Fire-and-forget: when staff flip double-points ON, broadcast a single
    // push to every enrolled loyalty customer — but only once per calendar
    // day, so toggling off-then-on doesn't spam everyone twice. The per-day
    // marker is stored in settings as the YYYY-MM-DD we last broadcast.
    if (doublePointsToday === true && !prevDoublePoints) {
      // Use Europe/London local date (the venue's timezone) so a flag flipped
      // at 23:30 UTC on a Friday in summer (00:30 BST Saturday) doesn't get
      // accidentally broadcast twice — once "tonight" and once "tomorrow".
      const todayParts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(new Date());
      const tp = (t: string) => todayParts.find((p) => p.type === t)?.value ?? "";
      const today = `${tp("year")}-${tp("month")}-${tp("day")}`;
      const lastBroadcast = await storage.getSetting("loyalty.doublePointsLastBroadcastDate");
      if (lastBroadcast !== today) {
        await storage.setSetting("loyalty.doublePointsLastBroadcastDate", today);
        (async () => {
          try {
            const { sendPushToTokens } = await import("./push");
            const enrolled = await storage.getCustomersWithLoyaltyAccount();
            const tokenLists = await Promise.all(
              enrolled.map((c) => storage.getPushTokensByEmail(c.email).catch(() => [])),
            );
            const tokens = tokenLists.flat().map((t) => t.token);
            if (tokens.length) {
              await sendPushToTokens(
                tokens,
                "Double points today! 🎯",
                "All visits earn 2× loyalty points at The 147 today. Pop in and play!",
                { type: "double_points_day" },
              );
              console.log(`[LOYALTY] Broadcast double-points push to ${tokens.length} device(s)`);
            }
          } catch (err) {
            console.error("[LOYALTY] Failed to broadcast double-points push:", err);
          }
        })();
      }
    }

    res.json(await loadLoyaltyConfig());
  });

  app.post("/api/loyalty/me/enroll", customerAuth, async (req, res) => {
    if (!square.isConfigured()) {
      return res.status(503).json({ message: "Loyalty program not configured" });
    }
    const customerId = (req as any).customerId as number;
    const customer = await storage.getCustomerById(customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    const phoneCleaned = customer.phone ? customer.phone.replace(/\s/g, "") : null;
    if (!phoneCleaned || phoneCleaned.length < 10) {
      return res.status(400).json({ message: "Please add a valid phone number to your profile to join the rewards programme." });
    }

    try {
      const program = await square.getLoyaltyProgram();
      if (!program || program.status !== "ACTIVE") {
        return res.status(400).json({ message: "No active loyalty program" });
      }
      // Re-check before creating to handle the race where the customer already
      // has an account from a previous in-store visit.
      const existing = await square.searchLoyaltyAccount(phoneCleaned);
      const account = existing ?? await square.createLoyaltyAccount(phoneCleaned, program.id);
      await storage.setSquareLoyaltyAccountId(customerId, account.id);
      res.json({
        account: {
          id: account.id,
          balance: account.balance,
          lifetime_points: account.lifetime_points,
          enrolled_at: account.enrolled_at,
          phone: account.mapping?.phone_number,
        },
      });
    } catch (err: any) {
      console.error("/api/loyalty/me/enroll error:", err.message);
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  app.get("/staff", (_req, res) => {
    const templatePath = path.resolve(process.cwd(), "server", "templates", "staff-dashboard.html");
    const html = fs.readFileSync(templatePath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.status(200).send(html);
  });

  // ── Square membership auto-sync ─────────────────────────────────────────────
  // Called after register/login. Looks up the customer's email in Square, finds
  // any active subscription matching one of our plans, and creates a local record
  // so the discount is applied automatically — even for members added via Square POS.
  async function syncSquareMembershipForCustomer(customerId: number, email: string) {
    try {
      if (!square.isConfigured()) return;

      const existing = await storage.getMembershipSubscriptionByCustomer(customerId);
      const allPlans = await storage.getMembershipPlans();
      const today = new Date().toISOString().slice(0, 10);

      // ── If customer already has a group-synced subscription, re-check membership ──
      // This handles removal: if they've been taken out of the Square group, cancel locally
      if (existing && (existing as any).source === "square_group_sync") {
        const sqCustomerForCheck = await square.findSquareCustomerByEmail(email).catch(() => null);
        if (sqCustomerForCheck) {
          const groupPlansForCheck = allPlans.filter(p => p.active && (p as any).squareCustomerGroupId);
          const currentGroupIds = await square.getCustomerGroupIds(sqCustomerForCheck.id).catch(() => [] as string[]);
          const stillInGroup = groupPlansForCheck.some(p => currentGroupIds.includes((p as any).squareCustomerGroupId) && p.id === existing.planId);
          if (!stillInGroup) {
            // Removed from group — cancel the local subscription immediately
            await storage.updateMembershipSubscription(existing.id, {
              status: "cancelled",
              cancelledAt: new Date(),
              staffNotes: "Auto-cancelled: customer removed from Square customer group",
            } as any);
            console.log(`[MEMBERSHIP] Group membership cancelled for #${customerId} (${email}) — no longer in Square group`);
            // Fall through to check if they're now in a different group
          } else {
            // Still in group — refresh the period end date to keep it rolling
            const refreshedEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            await storage.updateMembershipSubscription(existing.id, { currentPeriodEnd: refreshedEnd } as any);
            return; // Membership valid, nothing else to do
          }
        } else {
          return; // Can't reach Square — leave as-is
        }
      } else if (existing) {
        return; // Non-group subscription exists — don't touch it
      }

      // ── No existing subscription — find the Square customer and check ──────
      const sqCustomer = await square.findSquareCustomerByEmail(email).catch(() => null);
      if (!sqCustomer) return;

      // ── 1. Check Square subscriptions ──────────────────────────────────────
      const sqSubs: any[] = await square.listSquareSubscriptionsForCustomer(sqCustomer.id).catch(() => []);
      // hideFromSignup plans (VIP, complimentary tiers, etc.) are
      // staff-assigned only — never auto-grant them via Square sync, even
      // if the customer is found in the corresponding Square subscription.
      // Without this guard, anyone added directly to the VIP plan in
      // Square (intentionally or by mistake) would be auto-elevated on
      // their next app sign-in.
      const subPlans = allPlans.filter(p => p.active && !p.hideFromSignup && (p.squarePlanVariationId || (p as any).squarePlanVariationIdAlt));
      const planMatchesVariation = (p: any, variationId: string) =>
        p.squarePlanVariationId === variationId || p.squarePlanVariationIdAlt === variationId;
      const matchedSub = sqSubs.find((s: any) =>
        (s.status === "ACTIVE" || s.status === "PENDING") &&
        subPlans.some(p => planMatchesVariation(p, s.plan_variation_id))
      );
      if (matchedSub) {
        const plan = subPlans.find(p => planMatchesVariation(p, matchedSub.plan_variation_id))!;
        const periodEnd = matchedSub.charged_through_date ??
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        await storage.createMembershipSubscription({
          customerId, planId: plan.id, status: "active",
          currentPeriodStart: matchedSub.start_date ?? today, currentPeriodEnd: periodEnd,
          hoursUsedThisPeriod: 0, guestPassesUsed: 0,
          squareSubscriptionId: matchedSub.id, squareCustomerId: sqCustomer.id,
          source: "square_sync", staffNotes: "Auto-synced from Square on app sign-in",
        });
        console.log(`[MEMBERSHIP] Auto-synced Square subscription ${matchedSub.id} → customer #${customerId} (${email})`);
        return;
      }

      // ── 2. Check Square customer groups ────────────────────────────────────
      // Same staff-only guard as subPlans above. The VIP plan is gated
      // behind a Square customer group, so this is the primary attack
      // vector if the guard is missing — anyone added to that group in
      // Square would be auto-elevated on next app sign-in.
      const groupPlans = allPlans.filter(p => p.active && !p.hideFromSignup && (p as any).squareCustomerGroupId);
      if (groupPlans.length) {
        const customerGroupIds = await square.getCustomerGroupIds(sqCustomer.id).catch(() => [] as string[]);
        const groupMatch = groupPlans.find(p => customerGroupIds.includes((p as any).squareCustomerGroupId));
        if (groupMatch) {
          const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          await storage.createMembershipSubscription({
            customerId, planId: groupMatch.id, status: "active",
            currentPeriodStart: today, currentPeriodEnd: periodEnd,
            hoursUsedThisPeriod: 0, guestPassesUsed: 0,
            squareCustomerId: sqCustomer.id,
            source: "square_group_sync",
            staffNotes: `Auto-synced from Square customer group "${groupMatch.name}" on app sign-in`,
          });
          console.log(`[MEMBERSHIP] Auto-synced Square group "${groupMatch.name}" → customer #${customerId} (${email})`);
        }
      }
    } catch (err: any) {
      console.warn("[MEMBERSHIP] Square sync failed (non-fatal):", err.message);
    }
  }

  // ── One-shot backfill: VIP plan was un-mapped in production until task #92.
  // Now that the startup migration sets the VIP Square customer-group ID,
  // walk every app customer once and let the existing helper auto-link any
  // who are already in the VIP (or other group-mapped) Square groups. This
  // is gated by a site_settings flag so it only runs on the first boot
  // after deploy. Runs in the background after server start so it does not
  // delay readiness.
  const VIP_GROUP_ID = "575ce1a2-a598-4f09-82ba-90a7b88e9da1";
  const VIP_BACKFILL_FLAG = "vip_group_backfill_v1_done";
  setTimeout(() => {
    (async () => {
      try {
        if ((await storage.getSetting(VIP_BACKFILL_FLAG)) === "yes") return;
        if (!square.isConfigured()) return;
        const vipPlan = (await storage.getMembershipPlans())
          .find(p => (p as any).tier === "vip" && p.active && (p as any).squareCustomerGroupId === VIP_GROUP_ID);
        if (!vipPlan) {
          console.warn("[VIP BACKFILL] VIP plan not active or not mapped to expected group — skipping");
          return;
        }
        const sqMembers = await square.listCustomersInGroup(VIP_GROUP_ID);
        if (!sqMembers.length) {
          console.log("[VIP BACKFILL] Square reports no members in the VIP group — nothing to sync");
          await storage.setSetting(VIP_BACKFILL_FLAG, "yes");
          return;
        }
        let linked = 0, skipped = 0, failed = 0;
        for (const sqCust of sqMembers) {
          const email = sqCust.email_address?.trim().toLowerCase();
          if (!email) { skipped++; continue; }
          try {
            const appCustomer = await storage.getCustomerByEmail(email);
            if (!appCustomer) { skipped++; continue; }
            const before = await storage.getMembershipSubscriptionByCustomer(appCustomer.id);
            await syncSquareMembershipForCustomer(appCustomer.id, email);
            const after = await storage.getMembershipSubscriptionByCustomer(appCustomer.id);
            if (!before && after) linked++;
          } catch (innerErr: any) {
            failed++;
            console.warn(`[VIP BACKFILL] sync failed for ${email}:`, innerErr?.message);
          }
        }
        if (failed === 0) {
          await storage.setSetting(VIP_BACKFILL_FLAG, "yes");
          console.log(`[VIP BACKFILL] Complete — linked ${linked}, skipped ${skipped} (no app account / no email) of ${sqMembers.length} VIP group members`);
        } else {
          console.warn(`[VIP BACKFILL] Partial — linked ${linked}, failed ${failed} of ${sqMembers.length}; flag NOT set, will retry next boot`);
        }
      } catch (err: any) {
        console.warn("[VIP BACKFILL] Skipped (non-fatal):", err?.message);
      }
    })();
  }, 5000);

  app.post("/api/customers/register", async (req, res) => {
    const clientIp = getClientIp(req);
    const rateCheck = checkCustomerRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.setHeader("Retry-After", String(rateCheck.retryAfter));
      return res.status(429).json({ message: "Too many attempts. Please try again later." });
    }
    const { name, email, phone, password, privacyConsent, dateOfBirth } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }
    if (!privacyConsent) {
      return res.status(400).json({ message: "You must agree to the Privacy Policy to create an account" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }
    // Date of birth is optional at sign-up. If provided, validate it the same
    // way as PATCH /api/customers/me so we can't accept malformed values that
    // would later break the birthday-bonus window logic.
    let dobToStore: string | null = null;
    if (dateOfBirth !== undefined && dateOfBirth !== null && dateOfBirth !== "") {
      const dob = String(dateOfBirth).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        return res.status(400).json({ message: "Date of birth must be in YYYY-MM-DD format" });
      }
      const [yStr, mStr, dStr] = dob.split("-");
      const y = Number(yStr), m = Number(mStr), d = Number(dStr);
      const parsed = new Date(Date.UTC(y, m - 1, d));
      if (
        isNaN(parsed.getTime()) ||
        parsed.getUTCFullYear() !== y ||
        parsed.getUTCMonth() !== m - 1 ||
        parsed.getUTCDate() !== d
      ) {
        return res.status(400).json({ message: "Invalid date of birth" });
      }
      const ageYears = (Date.now() - parsed.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (ageYears < 0) return res.status(400).json({ message: "Date of birth cannot be in the future" });
      if (ageYears > 120) return res.status(400).json({ message: "Invalid date of birth" });
      dobToStore = dob;
    }
    // Per-IP registration rate limit — independent of login-failure tracking.
    const regRl = checkRateLimit(`reg:${clientIp}`, 5, 15 * 60 * 1000);
    if (!regRl.allowed) {
      res.setHeader("Retry-After", String(regRl.retryAfter));
      return res.status(429).json({ message: "Too many attempts. Please try again later." });
    }
    try {
      const existing = await storage.getCustomerByEmail(email);
      if (existing) {
        // Don't reveal whether the email is already registered. Return the
        // same generic success response that a successful registration returns,
        // so unauthenticated callers cannot determine account existence.
        // A one-per-hour notification email is sent to the existing owner as a
        // security heads-up. We use a rate-limit key keyed to the email address
        // (not a DB timestamp) so the throttle is reliably enforced and updated
        // atomically without an extra DB write.
        const notifyRl = checkRateLimit(`reg-notify:${email.toLowerCase()}`, 1, 60 * 60 * 1000);
        if (notifyRl.allowed) {
          const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "";
          const origin = domain ? `https://${domain}` : "";
          sendEmailViaSMTP(
            existing.email,
            "Someone tried to register with your email",
            `<p>Hi ${existing.name},</p><p>Someone attempted to create a new account at The 147 Club using your email address. If this was you, you already have an account — simply <a href="${origin}/account">sign in</a>. If it was not you, no action is needed.</p>`
          ).catch(() => {});
        }
        return res.status(200).json({ success: true });
      }
      const { hash, salt } = hashPin(password);
      const passwordHash = `${salt}:${hash}`;
      // Generate an email verification token (raw token sent in link, only its hash stored)
      const verifyTokenRaw = randomBytes(32).toString("hex");
      const verifyTokenHash = createHash("sha256").update(verifyTokenRaw).digest("hex");
      const verifyExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const customer = await storage.createCustomer(email, name.trim(), phone?.trim() || null, passwordHash, {
        emailVerifyTokenHash: verifyTokenHash,
        emailVerifyTokenExpiresAt: verifyExpiresAt,
        dateOfBirth: dobToStore,
      });
      // No session token is returned in the registration response — the client
      // must log in after verifying their email. This ensures the response is
      // identical in shape to the existing-account path and prevents enumeration
      // via response content or status code differences.
      res.status(200).json({ success: true });
      // Non-blocking: send verification email
      sendVerificationEmail({ name: customer.name, email: customer.email, tokenRaw: verifyTokenRaw });
      // Non-blocking: auto-link any existing Square membership for this email
      syncSquareMembershipForCustomer(customer.id, customer.email);
    } catch (err: any) {
      console.error("Customer register error:", err.message);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/customers/login", async (req, res) => {
    const clientIp = getClientIp(req);
    const rateCheck = checkCustomerRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.setHeader("Retry-After", String(rateCheck.retryAfter));
      return res.status(429).json({ message: "Too many attempts. Please try again later." });
    }
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    try {
      const customer = await storage.getCustomerByEmail(email);
      if (!customer) {
        recordCustomerLoginFailure(clientIp);
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const [salt, storedHash] = customer.passwordHash.split(":");
      if (!salt || !storedHash || !verifyPin(password, storedHash, salt)) {
        recordCustomerLoginFailure(clientIp);
        return res.status(401).json({ message: "Invalid email or password" });
      }
      if (customer.expiresAt && customer.expiresAt.getTime() < Date.now()) {
        return res.status(401).json({ message: "This account has expired." });
      }
      const token = randomBytes(48).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await storage.createCustomerSession(token, customer.id, expiresAt);
      res.json({
        token,
        customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, emailVerified: customer.emailVerified },
      });
      // Non-blocking: auto-link any existing Square membership for this email
      syncSquareMembershipForCustomer(customer.id, customer.email);
    } catch (err: any) {
      console.error("Customer login error:", err.message);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/customers/logout", customerAuth, async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader!.slice(7);
    await storage.invalidateCustomerSession(token);
    res.json({ success: true });
  });

  app.get("/api/customers/me", customerAuth, async (req, res) => {
    const customer = await storage.getCustomerById((req as any).customerId);
    if (!customer) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      emailVerified: customer.emailVerified,
      dateOfBirth: customer.dateOfBirth ?? null,
    });
  });

  // Resend the email verification link (rate-limited per customer to one every 60s)
  app.post("/api/customers/me/resend-verification", customerAuth, async (req: Request & { customerId?: number }, res) => {
    const customerId = req.customerId;
    if (!customerId) return res.status(401).json({ message: "Not signed in" });
    const customer = await storage.getCustomerById(customerId);
    if (!customer) return res.status(404).json({ message: "Account not found" });
    if (customer.emailVerified) {
      return res.json({ success: true, alreadyVerified: true });
    }
    const lastSent = customer.emailVerifyLastSentAt;
    if (lastSent && Date.now() - lastSent.getTime() < 60_000) {
      const retryAfter = Math.ceil((60_000 - (Date.now() - lastSent.getTime())) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ message: `Please wait ${retryAfter}s before requesting another email.` });
    }
    const verifyTokenRaw = randomBytes(32).toString("hex");
    const verifyTokenHash = createHash("sha256").update(verifyTokenRaw).digest("hex");
    const verifyExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await storage.setEmailVerificationToken(customerId, verifyTokenHash, verifyExpiresAt);
    sendVerificationEmail({ name: customer.name, email: customer.email, tokenRaw: verifyTokenRaw });
    res.json({ success: true });
  });

  // Confirmation landing page — clicked from the verification email
  app.get("/verify-email", async (req, res) => {
    const tokenRaw = String(req.query.token || "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!tokenRaw) {
      return res.status(400).send(renderVerifyResultPage("error", "Missing verification token. Please use the link from your email."));
    }
    const tokenHash = createHash("sha256").update(tokenRaw).digest("hex");
    const customer = await storage.getCustomerByVerifyTokenHash(tokenHash);
    if (!customer) {
      return res.status(400).send(renderVerifyResultPage("error", "This link is invalid or has already been used. If you've already verified, you're all set."));
    }
    const expiresAt = customer.emailVerifyTokenExpiresAt;
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      return res.status(400).send(renderVerifyResultPage("error", "This verification link has expired. Sign in to your account and request a new one."));
    }
    await storage.markEmailVerified(customer.id);
    res.send(renderVerifyResultPage("success", "Your email is verified. You can now use account recovery if you ever lose access."));
  });

  // Public resend-verification — used by the password recovery flow when the account
  // exists but the email isn't verified yet. Always returns 200 (don't leak existence).
  app.post("/api/customers/resend-verification-public", async (req, res) => {
    const clientIp = getClientIp(req);
    if (!checkSensitiveRateLimit(clientIp)) {
      return res.status(429).json({ message: "Too many requests. Please try again later." });
    }
    const email = String(req.body?.email || "").trim();
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    try {
      const customer = await storage.getCustomerByEmail(email);
      if (customer && !customer.emailVerified) {
        const lastSent = customer.emailVerifyLastSentAt;
        if (!lastSent || Date.now() - lastSent.getTime() >= 60_000) {
          const verifyTokenRaw = randomBytes(32).toString("hex");
          const verifyTokenHash = createHash("sha256").update(verifyTokenRaw).digest("hex");
          const verifyExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          await storage.setEmailVerificationToken(customer.id, verifyTokenHash, verifyExpiresAt);
          sendVerificationEmail({ name: customer.name, email: customer.email, tokenRaw: verifyTokenRaw });
        }
      }
    } catch (err: any) {
      console.error("Public resend verification error:", err.message);
    }
    res.json({ success: true });
  });

  // Forgot password — request a reset link.
  // Privacy: always return 200 regardless of whether the email is registered or
  // verified, so that unauthenticated callers cannot determine account existence
  // or verification state. When the account exists but is unverified we silently
  // resend the verification email instead so the user can complete that step.
  app.post("/api/customers/forgot-password", async (req, res) => {
    const clientIp = getClientIp(req);
    if (!checkSensitiveRateLimit(clientIp)) {
      return res.status(429).json({ message: "Too many requests. Please try again later." });
    }
    const email = String(req.body?.email || "").trim();
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }
    try {
      const customer = await storage.getCustomerByEmail(email);
      if (!customer) {
        // Don't disclose whether the email is registered.
        return res.json({ success: true });
      }
      if (!customer.emailVerified) {
        // Account exists but email is unverified. Don't reveal this state via
        // a distinct error code — instead silently resend the verification email
        // so the user can complete verification, then return generic success.
        const lastSent = customer.emailVerifyLastSentAt;
        if (!lastSent || Date.now() - lastSent.getTime() >= 60_000) {
          const verifyTokenRaw = randomBytes(32).toString("hex");
          const verifyTokenHash = createHash("sha256").update(verifyTokenRaw).digest("hex");
          const verifyExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          await storage.setEmailVerificationToken(customer.id, verifyTokenHash, verifyExpiresAt);
          sendVerificationEmail({ name: customer.name, email: customer.email, tokenRaw: verifyTokenRaw });
        }
        return res.json({ success: true });
      }
      // Per-account cooldown — one reset email per 60s
      const lastSent = customer.passwordResetLastSentAt;
      if (lastSent && Date.now() - lastSent.getTime() < 60_000) {
        // Still report success to avoid enumeration / spamming feedback
        return res.json({ success: true });
      }
      const tokenRaw = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(tokenRaw).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await storage.setPasswordResetToken(customer.id, tokenHash, expiresAt);
      sendPasswordResetEmail({ name: customer.name, email: customer.email, tokenRaw });
      res.json({ success: true });
    } catch (err: any) {
      console.error("Forgot password error:", err.message);
      res.status(500).json({ message: "Could not process the request" });
    }
  });

  // Reset password using the emailed token
  app.post("/api/customers/reset-password", async (req, res) => {
    const clientIp = getClientIp(req);
    if (!checkSensitiveRateLimit(clientIp)) {
      return res.status(429).json({ message: "Too many requests. Please try again later." });
    }
    const token = String(req.body?.token || "");
    const password = String(req.body?.password || "");
    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    try {
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const customer = await storage.getCustomerByPasswordResetTokenHash(tokenHash);
      if (!customer) {
        return res.status(400).json({ message: "This reset link is invalid or has already been used." });
      }
      const expiresAt = customer.passwordResetTokenExpiresAt;
      if (!expiresAt || expiresAt.getTime() < Date.now()) {
        return res.status(400).json({ message: "This reset link has expired. Please request a new one." });
      }
      // Defensive: only verified accounts can hit this point because tokens are only issued to verified emails.
      if (!customer.emailVerified) {
        return res.status(403).json({ code: "EMAIL_NOT_VERIFIED", message: "Please verify your email address before resetting your password." });
      }
      const { hash, salt } = hashPin(password);
      const passwordHash = `${salt}:${hash}`;
      await storage.setCustomerPassword(customer.id, passwordHash);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Reset password error:", err.message);
      res.status(500).json({ message: "Could not reset password" });
    }
  });

  // Landing page rendered when the user clicks the email link
  app.get("/reset-password", async (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (req.query.done === "1") {
      return res.send(renderResetPasswordPage({ token: "", success: true }));
    }
    const tokenRaw = String(req.query.token || "");
    if (!tokenRaw) {
      return res.status(400).send(renderResetPasswordPage({ token: "", error: "Missing reset token. Please use the link from your email." }));
    }
    const tokenHash = createHash("sha256").update(tokenRaw).digest("hex");
    const customer = await storage.getCustomerByPasswordResetTokenHash(tokenHash);
    if (!customer) {
      return res.status(400).send(renderResetPasswordPage({ token: "", error: "This reset link is invalid or has already been used." }));
    }
    const expiresAt = customer.passwordResetTokenExpiresAt;
    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      return res.status(400).send(renderResetPasswordPage({ token: "", error: "This reset link has expired. Please request a new one." }));
    }
    res.send(renderResetPasswordPage({ token: tokenRaw }));
  });

  app.patch("/api/customers/me", customerAuth, async (req, res) => {
    const { name, phone, dateOfBirth } = req.body;
    const updates: Partial<{ name: string; phone: string; dateOfBirth: string | null }> = {};
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed || trimmed.length < 2 || trimmed.length > 100) {
        return res.status(400).json({ message: "Name must be 2–100 characters" });
      }
      updates.name = trimmed;
    }
    if (phone !== undefined) {
      const trimmed = String(phone).trim();
      if (trimmed && (trimmed.length < 7 || trimmed.length > 20 || !/^[+\d\s\-().]+$/.test(trimmed))) {
        return res.status(400).json({ message: "Invalid phone number format" });
      }
      updates.phone = trimmed;
    }
    if (dateOfBirth !== undefined) {
      // Allow explicit clear via null or empty string. Otherwise require an
      // ISO YYYY-MM-DD that parses to a real, past date and isn't ridiculous
      // (>120 years old or in the future). We keep the year so birthdays in
      // leap years (Feb 29) can be surfaced predictably each year.
      if (dateOfBirth === null || dateOfBirth === "") {
        updates.dateOfBirth = null;
      } else {
        const dob = String(dateOfBirth).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
          return res.status(400).json({ message: "Date of birth must be in YYYY-MM-DD format" });
        }
        // Strictly validate the calendar date — JS Date silently normalizes
        // invalid inputs (e.g. 2024-02-31 → Mar 2). We must reject those so
        // bad birthdays can't leak into the bonus-window logic downstream.
        const [yStr, mStr, dStr] = dob.split("-");
        const y = Number(yStr), m = Number(mStr), d = Number(dStr);
        const parsed = new Date(Date.UTC(y, m - 1, d));
        if (
          isNaN(parsed.getTime()) ||
          parsed.getUTCFullYear() !== y ||
          parsed.getUTCMonth() !== m - 1 ||
          parsed.getUTCDate() !== d
        ) {
          return res.status(400).json({ message: "Invalid date of birth" });
        }
        const now = new Date();
        const ageYears = (now.getTime() - parsed.getTime()) / (365.25 * 24 * 3600 * 1000);
        if (ageYears < 0) return res.status(400).json({ message: "Date of birth cannot be in the future" });
        if (ageYears > 120) return res.status(400).json({ message: "Invalid date of birth" });
        updates.dateOfBirth = dob;
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }
    const customerId = (req as any).customerId as number;
    // If the phone number is being changed, drop any cached Square loyalty
    // link first — otherwise /api/loyalty/me will keep returning the old
    // account until the cached ID expires.
    if (updates.phone !== undefined) {
      const prev = await storage.getCustomerById(customerId);
      if (prev && prev.squareLoyaltyAccountId && prev.phone !== updates.phone) {
        await storage.setSquareLoyaltyAccountId(customerId, null);
      }
    }
    // If DOB is being changed (or cleared), reset the birthday-bonus year
    // marker. Otherwise a customer who fixed a typo on their DOB this year
    // would never get the bonus on the corrected birthday.
    if (updates.dateOfBirth !== undefined) {
      const prev = await storage.getCustomerById(customerId);
      if (prev && prev.dateOfBirth !== updates.dateOfBirth && prev.lastBirthdayBonusYear != null) {
        await storage.setLastBirthdayBonusYear(customerId, 0);
      }
    }
    const updated = await storage.updateCustomer(customerId, updates);
    if (!updated) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      dateOfBirth: updated.dateOfBirth ?? null,
    });
  });

  // Bind a push token to the authenticated customer's email.
  // Only the session owner's email (from the DB) is used — caller cannot choose.
  // ── FEATURE_SAVED_CARDS: Read-only summary of the customer's stored card.
  // Returns 404 (not 200 with null) when no card is saved so the React Query
  // cache can use the simpler "this 404 means no card" pattern. Returns 404
  // when the feature flag is OFF for the same reason — surfaces gated by
  // flags should treat the absence of the endpoint as "feature disabled".
  app.get("/api/customers/me/saved-card", customerAuth, async (req, res) => {
    if (!getServerFeatureFlags().savedCards) {
      return res.status(404).json({ message: "Saved cards are not enabled" });
    }
    try {
      const customerId = (req as any).customerId as number;
      const customer = await storage.getCustomerById(customerId);
      if (!customer || !customer.squareCardId) {
        return res.status(404).json({ message: "No saved card" });
      }
      res.json({
        brand: customer.squareCardBrand ?? "Card",
        last4: customer.squareCardLast4 ?? "••••",
        expMonth: customer.squareCardExpMonth ?? null,
        expYear: customer.squareCardExpYear ?? null,
      });
    } catch (err: any) {
      console.error("[SAVED CARD] GET failed:", err.message);
      res.status(500).json({ message: "Could not load saved card" });
    }
  });

  // FEATURE_SAVED_CARDS: forget the saved card. Disables on Square's side
  // (best-effort — Square outages don't block the local clear) and then
  // clears the columns on the customer row. Always 204 even when no card
  // existed, so the UI never has to special-case "already gone".
  app.delete("/api/customers/me/saved-card", customerAuth, async (req, res) => {
    if (!getServerFeatureFlags().savedCards) {
      return res.status(404).json({ message: "Saved cards are not enabled" });
    }
    try {
      const customerId = (req as any).customerId as number;
      const customer = await storage.getCustomerById(customerId);
      if (customer?.squareCardId) {
        try {
          await square.disableSquareCard(customer.squareCardId);
        } catch (sqErr: any) {
          console.error("[SAVED CARD] Square disable failed (continuing):", sqErr?.message ?? sqErr);
        }
      }
      await storage.clearCustomerSavedCard(customerId);
      res.status(204).send();
    } catch (err: any) {
      console.error("[SAVED CARD] DELETE failed:", err.message);
      res.status(500).json({ message: "Could not remove saved card" });
    }
  });

  // FEATURE_SAVED_CARDS: one-tap "Pay with saved card" for an existing
  // pending order. The order itself was created by the same /api/orders
  // POST flow used by the regular checkout — only the payment step is
  // different. Mirrors the success / saved-card-attach side of the
  // /api/orders/:id/pay handler above so the eventual rollout can reuse
  // the same audit log + push-token plumbing on the kitchen side.
  app.post("/api/orders/:appOrderId/pay-with-saved-card", customerAuth, async (req, res) => {
    if (!getServerFeatureFlags().savedCards) {
      return res.status(404).json({ message: "Saved cards are not enabled" });
    }
    if (!square.isWebPaymentsConfigured()) {
      return res.status(503).json({ message: "In-app payments are not configured." });
    }
    const appOrderId = parseInt(String(req.params.appOrderId));
    if (isNaN(appOrderId)) return res.status(400).json({ message: "Invalid order id" });
    try {
      const customerId = (req as any).customerId as number;
      const customer = await storage.getCustomerById(customerId);
      if (!customer?.squareCustomerId || !customer?.squareCardId) {
        return res.status(412).json({ message: "No saved card on file" });
      }
      const order = await storage.getAppOrder(appOrderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      // SECURITY (IDOR fix): app order ids are enumerable serial integers,
      // so before we charge the caller's saved card we must verify the
      // caller actually placed this order. Compare by emailHash (kept on
      // app_orders alongside the encrypted email for fast lookups). We
      // intentionally return 404 — not 403 — so a probing attacker can't
      // distinguish "exists but not yours" from "doesn't exist".
      const callerEmailHash = customer.email ? hashEmail(customer.email) : null;
      if (!order.customerEmailHash || !callerEmailHash || order.customerEmailHash !== callerEmailHash) {
        return res.status(404).json({ message: "Order not found" });
      }
      if (order.status !== "pending") {
        return res.status(409).json({ message: `Order is already ${order.status}` });
      }
      if (!order.squareOrderId) {
        return res.status(400).json({ message: "Order is missing Square reference" });
      }
      // The saved-card id is reused as the source — Square debounces by
      // idempotency key over a 24h window, so include the order id (not
      // the source) in the seed.
      const idemRaw = `app-order-${appOrderId}|saved-${customer.squareCardId}`;
      const idempotencyKey = createHash("sha256").update(idemRaw).digest("hex").slice(0, 45);
      const payment = await square.chargeSavedCard({
        squareCustomerId: customer.squareCustomerId,
        squareCardId: customer.squareCardId,
        amountPence: order.totalPence,
        idempotencyKey,
        note: order.tableNote ? `Order ${appOrderId} — ${order.tableNote}` : `Order ${appOrderId}`,
        referenceId: `app-order-${appOrderId}`,
        buyerEmail: customer.email,
        orderId: order.squareOrderId,
      });
      const succeeded = payment.status === "COMPLETED" || payment.status === "APPROVED";
      if (succeeded) {
        const transitioned = await storage.updateAppOrderPaid(order.squareOrderId, payment.id).catch((e: any) => {
          console.error("[ORDER] Failed to mark paid:", e.message);
          return false;
        });
        if (transitioned) {
          await storage.logOrderAction({
            orderId: order.id,
            staffUsername: "system",
            action: "paid",
            reason: `Square payment ${payment.id} (saved card)`,
          }).catch((e: any) => console.error("[ORDER] Audit log failed:", e.message));
        }
      }
      res.json({
        ok: succeeded,
        status: payment.status,
        paymentId: payment.id,
        appOrderId: order.id,
      });
    } catch (err: any) {
      const squareErrors = Array.isArray(err?.errors) ? err.errors : (Array.isArray(err?.result?.errors) ? err.result.errors : []);
      const first = squareErrors[0] || {};
      const errorCode: string | undefined = first.code;
      const errorDetail: string | undefined = first.detail || err?.message;
      console.error("[SAVED CARD] Pay failed:", { code: err?.code, errorCode, detail: errorDetail });
      res.status(400).json({
        message: errorDetail || "Card charge failed",
        errorCode: errorCode || null,
      });
    }
  });

  // ── FEATURE_DIETARY_FILTERS: customer's persisted dietary filter set.
  // The set is stored as a comma-separated string of tag codes ("V,GF" etc).
  // Empty / null means "no preference — show everything". PATCH validates
  // against the same canonical set used by the staff endpoint.
  app.patch("/api/customers/me/dietary-filters", customerAuth, async (req, res) => {
    if (!getServerFeatureFlags().dietaryFilters) {
      return res.status(404).json({ message: "Dietary filters are not enabled" });
    }
    const VALID = new Set(["V", "VG", "GF", "DF", "NF"]);
    const { filters } = req.body || {};
    let cleaned: string | null = null;
    if (Array.isArray(filters)) {
      const parts = Array.from(new Set(
        filters
          .map(t => typeof t === "string" ? t.trim().toUpperCase() : "")
          .filter(t => VALID.has(t))
      ));
      cleaned = parts.length > 0 ? parts.join(",") : null;
    } else if (typeof filters === "string" && filters.trim()) {
      const parts = Array.from(new Set(
        filters.split(",").map(t => t.trim().toUpperCase()).filter(t => VALID.has(t))
      ));
      cleaned = parts.length > 0 ? parts.join(",") : null;
    }
    try {
      const customerId = (req as any).customerId as number;
      await storage.setCustomerDietaryFilters(customerId, cleaned);
      res.json({ ok: true, filters: cleaned ? cleaned.split(",") : [] });
    } catch (err: any) {
      console.error("[DIETARY] PATCH failed:", err.message);
      res.status(500).json({ message: "Could not save dietary filters" });
    }
  });

  // ── FEATURE_PERSONALISED_HOME: cards to display on the home tab.
  // The shape is intentionally a flat array of typed cards so the home
  // screen can render them in order without knowing about each feature.
  // Cards are derived purely from existing data (last paid order,
  // dietary filters) — no new state to track. Returns an empty array
  // when nothing is personalisable for this customer (the home screen
  // then falls back to the static welcome card).
  app.get("/api/customers/me/home-cards", customerAuth, async (req, res) => {
    if (!getServerFeatureFlags().personalisedHome) {
      return res.json({ cards: [] });
    }
    try {
      const customerId = (req as any).customerId as number;
      const email = (req as any).customerEmail as string;
      const customer = await storage.getCustomerById(customerId);
      const cards: Array<Record<string, unknown>> = [];

      // Card 1: "Reorder your last round" — only when there's a paid
      // order in history. We surface the items as a compact label
      // ("Pint of Carling × 2 + 1 more") so the card is readable at a
      // glance without expanding into a full receipt.
      const lastOrder = await storage.getLastPaidAppOrderForCustomer(email).catch(() => null);
      if (lastOrder) {
        let summary = "your last round";
        try {
          const parsed = JSON.parse(lastOrder.itemsJson || "[]");
          if (Array.isArray(parsed) && parsed.length > 0) {
            const first = parsed[0];
            const firstLabel = `${first.name || "Item"}${first.quantity > 1 ? ` × ${first.quantity}` : ""}`;
            summary = parsed.length > 1
              ? `${firstLabel} + ${parsed.length - 1} more`
              : firstLabel;
          }
        } catch {}
        cards.push({
          type: "reorder",
          appOrderId: lastOrder.id,
          summary,
          totalPence: lastOrder.totalPence,
          placedAt: lastOrder.createdAt,
        });
      }

      // Card 2: "Your filters are on" reminder — only shown when the
      // customer has saved dietary filters AND the dietary filters
      // feature is also enabled. Helps explain why the menu may look
      // shorter than they remember.
      if (
        customer?.dietaryFilters &&
        getServerFeatureFlags().dietaryFilters
      ) {
        const filterCodes = customer.dietaryFilters.split(",").filter(Boolean);
        if (filterCodes.length > 0) {
          cards.push({
            type: "dietary_reminder",
            filters: filterCodes,
          });
        }
      }

      res.json({ cards });
    } catch (err: any) {
      console.error("[HOME CARDS] failed:", err.message);
      res.json({ cards: [] }); // Never block the home screen
    }
  });

  app.post("/api/customers/me/push-token", customerAuth, async (req, res) => {
    const { token } = req.body;
    if (!token || typeof token !== "string" || token.length < 10 || token.length > 300) {
      return res.status(400).json({ message: "Invalid token" });
    }
    const email = (req as any).customerEmail as string;
    await storage.registerPushToken({ token, customerEmail: email });
    res.status(204).send();
  });

  app.delete("/api/customers/me", customerAuth, async (req, res) => {
    const customerId = (req as any).customerId;
    const email = (req as any).customerEmail;
    const [bookingsDeleted, pushTokensDeleted, ordersDeleted, messagesDeleted] = await Promise.all([
      storage.deleteBookingsByEmail(email),
      storage.deletePushTokensByEmail(email),
      storage.deleteOrdersByEmail(email),
      storage.deleteContactMessagesByEmail(email),
    ]);
    const deleted = await storage.deleteCustomer(customerId);
    if (!deleted) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json({
      success: true,
      message: "Account and all associated data permanently deleted under UK GDPR Article 17",
      bookingsDeleted,
      pushTokensDeleted,
      ordersDeleted,
      messagesDeleted,
    });
  });

  app.get("/api/customers/bookings", customerAuth, async (req, res) => {
    const email = (req as any).customerEmail;
    const customerBookings = await storage.getBookingsByEmail(email);
    const safeBookings = customerBookings.map((b) => ({
      id: b.id,
      tableType: b.tableType,
      tableNumber: b.tableNumber,
      date: b.date,
      startTime: b.startTime,
      duration: b.duration,
      status: b.status,
      notes: b.notes,
      createdAt: b.createdAt,
    }));
    res.json(safeBookings);
  });

  app.patch("/api/customers/bookings/:id/cancel", customerAuth, async (req, res) => {
    const bookingId = parseInt(req.params.id as string);
    if (isNaN(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }
    const booking = await storage.getBooking(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    const customerEmail = (req as any).customerEmail;
    if (booking.customerEmail.toLowerCase() !== customerEmail.toLowerCase()) {
      return res.status(403).json({ message: "Not your booking" });
    }
    if (booking.status === "cancelled") {
      return res.status(400).json({ message: "Booking is already cancelled" });
    }
    const today = new Date().toISOString().split("T")[0];
    if (booking.date < today) {
      return res.status(400).json({ message: "Cannot cancel past bookings" });
    }
    const updated = await storage.updateBookingStatus(bookingId, "cancelled");
    void storage.logBookingAction({
      bookingId,
      action: "status_changed",
      staffUsername: `customer:${booking.customerEmail}`,
      staffId: null,
      fromValue: { status: booking.status },
      toValue: { status: "cancelled" },
      note: "Cancelled by customer via app",
    });
    sendBookingCancellationEmail({
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      date: booking.date,
      startTime: booking.startTime,
      duration: booking.duration,
      tableType: booking.tableType,
      tableNumber: booking.tableNumber || undefined,
      id: bookingId,
    }).catch(() => {});
    res.json({ success: true, booking: updated });
  });

  app.patch("/api/customers/bookings/:id/reschedule", customerAuth, async (req, res) => {
    const bookingId = parseInt(req.params.id as string);
    if (isNaN(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }
    const booking = await storage.getBooking(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    const customerEmail = (req as any).customerEmail;
    if (booking.customerEmail.toLowerCase() !== customerEmail.toLowerCase()) {
      return res.status(403).json({ message: "Not your booking" });
    }
    if (booking.status === "cancelled") {
      return res.status(400).json({ message: "Cannot reschedule a cancelled booking" });
    }
    const today = new Date().toISOString().split("T")[0];
    if (booking.date < today) {
      return res.status(400).json({ message: "Cannot reschedule past bookings" });
    }
    const { date, startTime, duration } = req.body;
    if (!date || !startTime || !duration) {
      return res.status(400).json({ message: "date, startTime, and duration are required" });
    }
    const dur = parseInt(String(duration));
    if (isNaN(dur) || dur < 1) {
      return res.status(400).json({ message: "Invalid duration" });
    }

    // Check availability for new slot (excluding current booking so same-day reschedules work correctly)
    const DINING_TABLE_COUNT = 25;
    const reqStart = parseInt(startTime.toString().replace(":", ""));
    const reqEnd = reqStart + dur * 100;
    const slots = await storage.getBookedSlots(date, booking.tableType, booking.tableNumber || undefined, bookingId);
    if (booking.tableType === "dining") {
      let count = 0;
      for (const slot of slots) {
        const slotStart = parseInt(slot.startTime.replace(":", ""));
        const slotEnd = slotStart + slot.duration * 100;
        if (reqStart < slotEnd && reqEnd > slotStart) count++;
      }
      if (count >= DINING_TABLE_COUNT) {
        return res.status(409).json({ message: "That time slot is fully booked" });
      }
    } else {
      for (const slot of slots) {
        const slotStart = parseInt(slot.startTime.replace(":", ""));
        const slotEnd = slotStart + slot.duration * 100;
        if (reqStart < slotEnd && reqEnd > slotStart) {
          return res.status(409).json({ message: "That time slot is no longer available" });
        }
      }
    }

    const updated = await storage.updateBooking(bookingId, { date, startTime, duration: dur });
    void storage.logBookingAction({
      bookingId,
      action: "edited",
      staffUsername: `customer:${booking.customerEmail}`,
      staffId: null,
      fromValue: { date: booking.date, startTime: booking.startTime, duration: booking.duration },
      toValue: { date, startTime, duration: dur },
      note: "Rescheduled by customer via app",
    });
    sendBookingRescheduleEmail({
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      date,
      startTime,
      duration: dur,
      tableType: booking.tableType,
      tableNumber: booking.tableNumber || undefined,
      id: bookingId,
    }).catch(() => {});
    res.json({ success: true, booking: updated });
  });

  // Membership landing page — standalone + embeddable in Wix / other sites
  const membershipPageHeaders = (res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  };
  const serveMembershipPage = (_req: Request, res: Response) => {
    const pagePath = path.resolve(process.cwd(), "server", "templates", "membership-page.html");
    membershipPageHeaders(res);
    try {
      const html = fs.readFileSync(pagePath, "utf-8");
      res.send(html);
    } catch {
      res.status(500).send("Page unavailable");
    }
  };
  app.get("/membership", serveMembershipPage);
  app.get("/widget/membership", serveMembershipPage);

  // Membership interest form — stores interest from the public landing page
  app.post("/api/membership/interest", async (req, res) => {
    const { name, email, phone, plan, planName } = req.body ?? {};
    if (!name || !email) return res.status(400).json({ message: "Name and email are required" });
    // Store as a contact message so staff see it in the Messages tab
    try {
      await storage.createContactMessage({
        name: String(name),
        email: String(email),
        phone: phone ? String(phone) : undefined,
        subject: `Membership Interest — ${planName || plan || "General"}`,
        message: `This person registered interest in the ${planName || plan || ""} membership plan via the membership landing page.${phone ? `\n\nPhone: ${phone}` : ""}`,
        gdprConsent: true,
      });
    } catch {
      // If message storage fails, still return success (interest received)
    }
    res.json({ ok: true });
  });

  // Booking widget — embeddable iframe for Wix and other websites
  app.get("/widget/booking", (_req, res) => {
    const widgetPath = path.resolve(process.cwd(), "server", "templates", "booking-widget.html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    // Read file dynamically (no ETag generation) so cached versions are always invalidated
    try {
      const html = fs.readFileSync(widgetPath, "utf-8");
      res.send(html);
    } catch (err) {
      res.status(500).send("Widget unavailable");
    }
  });

  // CORS preflight for API routes used by the booking widget embedded on external sites
  app.options("/api/bookings", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.sendStatus(204);
  });
  app.options("/api/bookings/availability", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.sendStatus(204);
  });

  // Blocked periods — public GET (widget uses it), protected POST/DELETE
  app.get("/api/blocked-periods", async (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const periods = await storage.getBlockedPeriods();
    res.json(periods);
  });
  app.options("/api/blocked-periods", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.sendStatus(204);
  });
  app.post("/api/blocked-periods", staffAuth, managerAuth, async (req: any, res) => {
    const { label, tableType, date, dayOfWeek, startTime, endTime } = req.body;
    if (!date && dayOfWeek == null) {
      return res.status(400).json({ message: "Either date or dayOfWeek is required" });
    }
    const created = await storage.createBlockedPeriod({
      label: label || null,
      tableType: tableType || null,
      date: date || null,
      dayOfWeek: dayOfWeek != null ? Number(dayOfWeek) : null,
      startTime: startTime || null,
      endTime: endTime || null,
      createdBy: req.staffSession?.staffUsername ?? "manager",
    });
    res.status(201).json(created);
  });
  app.delete("/api/blocked-periods/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const ok = await storage.deleteBlockedPeriod(id);
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.status(204).send();
  });

  // ── Membership — public plan listing ────────────────────────────────────────
  app.get("/api/membership/plans", async (_req, res) => {
    const { getPlanBenefits, getPlanBenefitTexts } = await import("@shared/membership-benefits");
    const plans = await storage.getMembershipPlans(true);
    // Internal-only plans (Staff, VIP, comped tiers) stay active so the
    // discount logic still recognises them, but must not appear on the
    // customer-facing signup screen.
    const visible = plans.filter((p: any) => !p.hideFromSignup);
    // Attach the canonical benefits list so HTML templates (marketing page,
    // staff dashboard) render the same wording as the customer app without
    // each duplicating the formatting rules. `benefits` is the simple text
    // list used by the staff dashboard chips; `benefitsDetailed` carries
    // both key+text so the marketing page can map icons by stable key
    // instead of brittle text matching.
    const enriched = visible.map((p: any) => ({
      ...p,
      benefits: getPlanBenefitTexts(p),
      benefitsDetailed: getPlanBenefits(p),
    }));
    res.set("Cache-Control", "no-store");
    res.json(enriched);
  });

  // ── Membership — customer: get own subscription ──────────────────────────────
  // In-memory throttle for the auto-sync below. Each app account can trigger
  // at most one Square round-trip every 15 s — enough to make staff-granted
  // memberships (e.g. adding a customer to the VIP group in Square, or signing
  // them up via Square POS) visible the next time the customer opens the
  // membership page, without hammering Square if the customer keeps tapping
  // refresh. Map size is bounded by a periodic prune so it can't grow
  // unbounded over a long-running process.
  const mySubscriptionSyncThrottle = new Map<number, number>();
  const MY_SUB_SYNC_THROTTLE_MS = 15_000;
  const MY_SUB_SYNC_PRUNE_AFTER_MS = 60_000;
  function pruneMySubSyncThrottle() {
    const cutoff = Date.now() - MY_SUB_SYNC_PRUNE_AFTER_MS;
    for (const [id, ts] of mySubscriptionSyncThrottle) {
      if (ts < cutoff) mySubscriptionSyncThrottle.delete(id);
    }
  }
  app.get("/api/membership/my-subscription", customerAuth, async (req, res) => {
    const customerId = (req as any).customerId as number;
    const customerEmail = (req as any).customerEmail as string;
    // Pull a fresh snapshot from Square. Without this, the page just mirrors
    // whatever was synced at last login — so a customer added to a Square
    // customer group (VIP / Staff / etc.) or signed up via Square POS
    // wouldn't see their membership in the app until they logged out and
    // back in, and wouldn't get their discount on in-app orders either.
    //
    // Throttled per-customer (set BEFORE await so concurrent requests for the
    // same customer don't both fire the sync — important because the client
    // refetches on mount and on app-foreground).
    const lastSync = mySubscriptionSyncThrottle.get(customerId) ?? 0;
    const shouldSync = Date.now() - lastSync >= MY_SUB_SYNC_THROTTLE_MS;
    if (shouldSync) {
      mySubscriptionSyncThrottle.set(customerId, Date.now());
      if (mySubscriptionSyncThrottle.size > 200) pruneMySubSyncThrottle();
    }
    // Snappy-load trade-off: if the customer already has a subscription
    // locally, fire-and-forget the sync so the page renders immediately
    // (next refetch will pick up any remote change). Only AWAIT the sync
    // when there's no local subscription yet — that's the case where the
    // customer might be a Square-group member we haven't recorded yet,
    // and we want the very first render to show their card, not the
    // join flow.
    if (shouldSync) {
      const existingSub = await storage.getMembershipSubscriptionByCustomer(customerId);
      const syncPromise = syncSquareMembershipForCustomer(customerId, customerEmail).catch((e: any) =>
        console.warn("[MEMBERSHIP] my-subscription auto-sync failed (non-fatal):", e?.message),
      );
      if (!existingSub) {
        await syncPromise;
      }
    }
    const sub = await storage.getMembershipSubscriptionByCustomer(customerId);
    res.json(sub ?? null);
  });

  // ── Membership — customer: join a plan ──────────────────────────────────────
  app.post("/api/membership/join", customerAuth, async (req, res) => {
    try {
      const customerId = (req as any).customerId as number;
      const { planId, billingFrequency = "monthly", startDate, termsAccepted } = req.body ?? {};
      if (!planId) return res.status(400).json({ message: "planId is required" });
      if (termsAccepted !== true) return res.status(400).json({ message: "You must accept the Terms & Conditions to join" });
      const isAnnual = billingFrequency === "annual";

      // Check if already an active member on this same plan
      const existing = await storage.getMembershipSubscriptionByCustomer(customerId);
      if (existing && existing.planId === parseInt(planId) && existing.status === "active") {
        return res.status(409).json({ message: "You already have an active membership on this plan" });
      }

      const plan = await storage.getMembershipPlan(parseInt(planId));
      if (!plan || !plan.active) return res.status(404).json({ message: "Plan not found" });
      // Hidden plans (e.g. VIP, Blue Light, comps) can only be assigned by
      // staff via the dashboard. Reject any direct sign-up attempt — even if
      // the customer somehow has the plan id, they must be added manually.
      if ((plan as any).hideFromSignup) {
        return res.status(403).json({
          message: "This membership is by invitation only. Please contact the club to be added.",
          code: "PLAN_STAFF_ONLY",
        });
      }

      const today = new Date().toISOString().slice(0, 10);
      // Honour startDate if it is a valid future date (staff-only feature sent from app)
      const periodStart = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && startDate > today ? startDate : today;
      const periodEndDate = new Date(periodStart + "T12:00:00Z");
      if (isAnnual) {
        periodEndDate.setFullYear(periodEndDate.getFullYear() + 1);
      } else {
        periodEndDate.setMonth(periodEndDate.getMonth() + 1);
      }
      const periodEnd = periodEndDate.toISOString().slice(0, 10);

      // If upgrading (existing sub on a different plan), cancel the old one
      if (existing && existing.id) {
        await storage.updateMembershipSubscription(existing.id, {
          status: "cancelled",
          cancelledAt: new Date(),
        });
      }

      // Deferred start: create as pending_start so benefits don't activate early
      const initialStatus = periodStart > today ? "pending_start" : "pending";

      const sub = await storage.createMembershipSubscription({
        customerId,
        planId: plan.id,
        status: initialStatus,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        hoursUsedThisPeriod: 0,
        guestPassesUsed: 0,
        staffNotes: periodStart > today ? `[Deferred start: ${periodStart}]` : null,
        source: isAnnual ? "app_annual" : "app",
        termsAcceptedAt: new Date(),
      });

      let checkoutUrl: string | null = null;
      // We must NEVER silently fall back from a recurring subscription
      // checkout to a one-time payment link for a membership signup. If we
      // can't produce a real subscription checkout we stop and return an
      // error so the customer doesn't end up paying once and never being
      // billed again. These two flags carry the reason out of the Square
      // try/catch below.
      let checkoutFailureMessage: string | null = null;
      let checkoutFailureCode: string | null = null;

      // Wire up Square: create/find customer, manage groups, generate checkout link
      if (square.isConfigured()) {
        try {
          const customer = await storage.getCustomerById(customerId);
          if (!customer) {
            checkoutFailureMessage = "Customer record not found.";
            checkoutFailureCode = "CUSTOMER_NOT_FOUND";
          } else {
            // Create or find Square customer
            let sqCustomer = await square.findSquareCustomerByEmail(customer.email).catch(() => null);
            if (!sqCustomer) {
              sqCustomer = await square.createSquareCustomer(customer.name, customer.email, customer.phone || undefined).catch(() => null);
            }

            if (!sqCustomer) {
              checkoutFailureMessage = "Could not set up your payment customer profile. Please try again.";
              checkoutFailureCode = "SQUARE_CUSTOMER_FAILED";
            } else {
              await storage.updateMembershipSubscription(sub.id, { squareCustomerId: sqCustomer.id });

              // ── Manage customer groups ──────────────────────────────────────
              // All known membership tier group names
              const allPlans = await storage.getMembershipPlans();
              const allGroupNames = allPlans.map(p => square.membershipGroupName(p.name));

              // Get the groups this customer currently belongs to
              const currentGroupIds = await square.getCustomerGroupIds(sqCustomer.id).catch(() => [] as string[]);
              const allGroups = await square.listCustomerGroups().catch(() => [] as { id: string; name: string }[]);

              // Remove from any existing membership tier groups
              for (const group of allGroups) {
                if (allGroupNames.includes(group.name) && currentGroupIds.includes(group.id)) {
                  await square.removeCustomerFromGroup(sqCustomer.id, group.id).catch(() => {});
                }
              }

              // Add to the new plan's group
              const newGroupId = await square.getOrCreateCustomerGroup(square.membershipGroupName(plan.name)).catch(() => null);
              if (newGroupId) {
                await square.addCustomerToGroup(sqCustomer.id, newGroupId).catch(() => {});
              }

              // ── Generate RECURRING subscription checkout payment link ───────
              const redirectUrl = `https://the147bradford.replit.app/api/membership/${sub.id}/payment-return`;

              // Pick variation ID based on billing frequency. A variation ID
              // is REQUIRED — without it Square won't produce a recurring
              // checkout, and we refuse to send the customer to a one-time
              // payment page for a membership.
              const variationId = isAnnual
                ? ((plan as any).squarePlanVariationIdAlt || plan.squarePlanVariationId)
                : plan.squarePlanVariationId;

              if (!variationId) {
                checkoutFailureMessage = `This membership plan isn't set up for ${isAnnual ? "annual" : "monthly"} recurring billing yet. Please contact the club to finish signing up.`;
                checkoutFailureCode = "PLAN_NOT_BILLABLE";
                console.error(`[membership/join] sub #${sub.id} aborted: plan ${plan.id} has no Square ${isAnnual ? "annual" : "monthly"} variation ID — recurring checkout cannot be created.`);
              } else {
                const checkout = await square.createSubscriptionCheckoutLink({
                  planVariationId: variationId,
                  subscriptionId: sub.id,
                  buyerEmail: customer?.email,
                  redirectUrl,
                }).catch((err) => {
                  console.error("[membership/join] subscription checkout error:", err?.message ?? err);
                  return null;
                });

                if (!checkout) {
                  checkoutFailureMessage = "We couldn't start your recurring membership payment with Square. Please try again or contact the club.";
                  checkoutFailureCode = "SUBSCRIPTION_CHECKOUT_FAILED";
                  console.error(`[membership/join] sub #${sub.id} aborted: subscription checkout link could not be created — refusing to fall back to a one-time payment link.`);
                } else {
                  checkoutUrl = checkout.url;
                  console.log(`[membership/join] subscription ${isAnnual ? "annual" : "monthly"} checkout created for sub #${sub.id}`);
                }
              }
            }
          }
        } catch (sqErr: any) {
          console.error("[membership/join] Square error:", sqErr);
          checkoutFailureMessage = "Payment system error. Please try again shortly.";
          checkoutFailureCode = "SQUARE_ERROR";
        }
      }

      // If Square is configured but no recurring checkout URL was produced,
      // we must NOT silently keep a half-created subscription around or fall
      // back to a one-time payment link. Roll the local sub back so the
      // customer isn't stuck in a half-created state, and return an error so
      // the app keeps them in the in-app sheet.
      if (square.isConfigured() && !checkoutUrl) {
        await storage.updateMembershipSubscription(sub.id, {
          status: "cancelled",
          cancelledAt: new Date(),
          staffNotes: `[Auto-cancelled at signup: ${checkoutFailureCode || "RECURRING_CHECKOUT_UNAVAILABLE"}]`,
        }).catch(() => {});
        return res.status(503).json({
          message: checkoutFailureMessage || "Could not start your membership signup. Please try again.",
          code: checkoutFailureCode || "RECURRING_CHECKOUT_UNAVAILABLE",
        });
      }

      // Only auto-activate if Square is not configured at all (free/staff-managed plans)
      if (!checkoutUrl && !square.isConfigured()) {
        await storage.updateMembershipSubscription(sub.id, { status: "active" });
      }

      const updated = await storage.getMembershipSubscriptionByCustomer(customerId);
      res.status(201).json({ ...(updated ?? sub), checkoutUrl });
    } catch (err: any) {
      console.error("[membership/join]", err);
      res.status(500).json({ message: "Failed to create membership" });
    }
  });

  // ── Native in-app membership join (Square Web Payments SDK) ────────────────
  // Customer tokenises a card in-app via SquarePaymentSheet, then POSTs the
  // resulting source_id (and optional 3DS verification_token) here. We save the
  // card on file against the Square customer and create a Square subscription
  // so future charges happen automatically without bouncing to a browser.
  app.post("/api/membership/join-native", customerAuth, async (req, res) => {
    try {
      const customerId = (req as any).customerId as number;
      const { planId, billingFrequency = "monthly", startDate, termsAccepted, sourceId, verificationToken } = req.body ?? {};
      if (!planId) return res.status(400).json({ message: "planId is required" });
      if (!sourceId) return res.status(400).json({ message: "Payment token missing" });
      if (termsAccepted !== true) return res.status(400).json({ message: "You must accept the Terms & Conditions to join" });
      if (!square.isConfigured()) return res.status(503).json({ message: "Payment system not configured" });

      const isAnnual = billingFrequency === "annual";

      const existing = await storage.getMembershipSubscriptionByCustomer(customerId);
      if (existing && existing.planId === parseInt(planId) && existing.status === "active") {
        return res.status(409).json({ message: "You already have an active membership on this plan" });
      }

      const plan = await storage.getMembershipPlan(parseInt(planId));
      if (!plan || !plan.active) return res.status(404).json({ message: "Plan not found" });
      // Hidden plans (e.g. VIP, Blue Light, comps) can only be assigned by
      // staff via the dashboard. Reject any direct sign-up attempt — even if
      // the customer somehow has the plan id, they must be added manually.
      if ((plan as any).hideFromSignup) {
        return res.status(403).json({
          message: "This membership is by invitation only. Please contact the club to be added.",
          code: "PLAN_STAFF_ONLY",
        });
      }

      const customer = await storage.getCustomerById(customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });

      const today = new Date().toISOString().slice(0, 10);
      const periodStart = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && startDate > today ? startDate : today;
      const periodEndDate = new Date(periodStart + "T12:00:00Z");
      if (isAnnual) periodEndDate.setFullYear(periodEndDate.getFullYear() + 1);
      else periodEndDate.setMonth(periodEndDate.getMonth() + 1);
      const periodEnd = periodEndDate.toISOString().slice(0, 10);

      // NOTE: We deliberately do NOT cancel the existing subscription here.
      // We only do that AFTER the new card + Square subscription are
      // successfully created, so a failure mid-flow does not leave the
      // customer without active access.

      // 1) Find or create the Square customer record
      let sqCustomer = await square.findSquareCustomerByEmail(customer.email).catch(() => null);
      if (!sqCustomer) {
        sqCustomer = await square.createSquareCustomer(customer.name, customer.email, customer.phone || undefined).catch(() => null);
      }
      if (!sqCustomer) return res.status(502).json({ message: "Could not create payment customer profile" });

      // 2) Save the tokenised card on file (carries verification_token if SCA was performed)
      let savedCard: any;
      try {
        savedCard = await square.saveCardOnFile({
          customerId: sqCustomer.id,
          sourceId,
          verificationToken,
          cardholderName: customer.name,
        });
      } catch (cardErr: any) {
        const msg = cardErr?.message || "Card could not be saved";
        console.error("[membership/join-native] saveCardOnFile failed:", msg);
        return res.status(402).json({ message: msg, code: "CARD_SAVE_FAILED" });
      }
      if (!savedCard?.id) {
        return res.status(402).json({ message: "Card could not be saved", code: "CARD_SAVE_FAILED" });
      }

      // 3) Pick variation ID for billing frequency
      const variationId = isAnnual
        ? ((plan as any).squarePlanVariationIdAlt || plan.squarePlanVariationId)
        : plan.squarePlanVariationId;
      if (!variationId) {
        return res.status(503).json({ message: "Membership plan is not configured for in-app billing yet" });
      }

      // 4) Create the local subscription record (pending until Square confirms)
      const initialStatus = periodStart > today ? "pending_start" : "pending";
      const sub = await storage.createMembershipSubscription({
        customerId,
        planId: plan.id,
        status: initialStatus,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        hoursUsedThisPeriod: 0,
        guestPassesUsed: 0,
        staffNotes: periodStart > today ? `[Deferred start: ${periodStart}]` : null,
        source: isAnnual ? "app_annual_native" : "app_native",
        termsAcceptedAt: new Date(),
        squareCustomerId: sqCustomer.id,
      });

      // 5) Create the Square subscription against the saved card
      const locationId = square.getPublicLocationId();
      if (!locationId) {
        return res.status(503).json({ message: "Payment system location not configured" });
      }
      let squareSub: any = null;
      try {
        squareSub = await square.createSquareSubscription(
          sqCustomer.id,
          variationId,
          locationId,
          savedCard.id,
          periodStart,
        );
      } catch (subErr: any) {
        console.error("[membership/join-native] createSquareSubscription failed:", subErr?.message ?? subErr);
        await storage.updateMembershipSubscription(sub.id, {
          status: "pending",
          staffNotes: `[Native sign-up: card saved (${savedCard.id}) but subscription create failed: ${subErr?.message || "unknown"}]`,
        }).catch(() => {});
        return res.status(502).json({
          message: "Card was saved but the subscription could not be created. Please contact us.",
          code: "SUBSCRIPTION_CREATE_FAILED",
        });
      }

      // 6) Manage customer groups (mirror /join behaviour)
      try {
        const allPlans = await storage.getMembershipPlans();
        const allGroupNames = allPlans.map((p) => square.membershipGroupName(p.name));
        const currentGroupIds = await square.getCustomerGroupIds(sqCustomer.id).catch(() => [] as string[]);
        const allGroups = await square.listCustomerGroups().catch(() => [] as { id: string; name: string }[]);
        for (const group of allGroups) {
          if (allGroupNames.includes(group.name) && currentGroupIds.includes(group.id)) {
            await square.removeCustomerFromGroup(sqCustomer.id, group.id).catch(() => {});
          }
        }
        const newGroupId = await square.getOrCreateCustomerGroup(square.membershipGroupName(plan.name)).catch(() => null);
        if (newGroupId) {
          await square.addCustomerToGroup(sqCustomer.id, newGroupId).catch(() => {});
        }
      } catch (grpErr) {
        console.warn("[membership/join-native] group management non-fatal error:", grpErr);
      }

      // 7) Record the Square subscription ID but do NOT activate yet.
      // Activation happens exclusively via the invoice.payment_made webhook once Square
      // confirms the first billing attempt succeeded. Deferred starts remain
      // pending_start; same-day starts remain pending. This mirrors the hosted
      // checkout flow which also refuses to trust the browser return URL.
      await storage.updateMembershipSubscription(sub.id, {
        squareSubscriptionId: squareSub?.id ?? null,
      } as any);

      // 8) NOW it's safe to retire the previous subscription (plan switch).
      if (existing && existing.id) {
        if ((existing as any).squareSubscriptionId) {
          await square.cancelSquareSubscription((existing as any).squareSubscriptionId).catch((e) => {
            console.warn(`[membership/join-native] failed to cancel old Square sub ${(existing as any).squareSubscriptionId}:`, e?.message ?? e);
          });
        }
        await storage.updateMembershipSubscription(existing.id, {
          status: "cancelled",
          cancelledAt: new Date(),
        }).catch(() => {});
      }

      const updated = await storage.getMembershipSubscriptionByCustomer(customerId);
      console.log(`[membership/join-native] sub #${sub.id} created (square sub ${squareSub?.id}) for customer ${customerId}`);
      res.status(201).json({ ...(updated ?? sub), squareSubscriptionId: squareSub?.id ?? null });
    } catch (err: any) {
      console.error("[membership/join-native]", err);
      res.status(500).json({ message: err?.message || "Failed to create membership" });
    }
  });

  // Membership payment return — Square redirects here after checkout
  app.get("/api/membership/:id/payment-return", async (req, res) => {
    // Do NOT mutate subscription state here. Membership activation is handled
    // exclusively by the Square webhook (POST /api/membership/webhook or the shared
    // payment.updated handler), which verifies the payment was actually completed
    // before setting status to "active". Trusting this browser redirect alone would
    // allow anyone with a subscription ID (predictable numeric IDs returned from
    // the join API) to activate a membership without making a payment.
    res.redirect("https://the147bradford.replit.app/membership?payment=complete");
  });

  // Membership — retry payment (generates a fresh Square checkout link)
  app.post("/api/membership/retry-payment", customerAuth, async (req, res) => {
    try {
      const customerId = (req as any).customerId as number;
      const sub = await storage.getMembershipSubscriptionByCustomer(customerId);
      if (!sub) return res.status(404).json({ message: "No membership found" });
      if (!["pending", "frozen"].includes(sub.status)) {
        return res.status(400).json({ message: "Membership does not require payment" });
      }
      if (!square.isConfigured()) {
        return res.status(503).json({ message: "Payment system not configured" });
      }

      const plan = sub.plan ?? await storage.getMembershipPlan(sub.planId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });

      // Memberships must always be billed via a RECURRING subscription
      // checkout. We deliberately do NOT fall back to a one-time payment
      // link here, otherwise the customer would be charged once and never
      // billed again — they'd think they were a member but their card would
      // never be re-charged.
      const variationId = plan.squarePlanVariationId;
      if (!variationId) {
        return res.status(503).json({
          message: "This membership plan isn't set up for recurring billing yet. Please contact the club.",
          code: "PLAN_NOT_BILLABLE",
        });
      }
      const customer = await storage.getCustomerById(customerId).catch(() => null);
      const redirectUrl = `https://the147bradford.replit.app/api/membership/${sub.id}/payment-return`;
      const checkout = await square.createSubscriptionCheckoutLink({
        planVariationId: variationId,
        subscriptionId: sub.id,
        buyerEmail: customer?.email,
        redirectUrl,
      });

      res.json({ checkoutUrl: checkout.url });
    } catch (err: any) {
      console.error("[membership/retry-payment]", err);
      res.status(500).json({ message: "Failed to generate payment link" });
    }
  });

  // ── Membership — Square webhook ──────────────────────────────────────────
  app.post("/api/membership/webhook", async (req, res) => {
    try {
      // Square webhook signature verification is MANDATORY. If the signing
      // key isn't set we fail closed — this endpoint links/activates Square
      // subscriptions, so accepting unauthenticated POSTs would let anyone
      // forge a paid membership.
      const sigKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
      if (!sigKey) {
        console.error("[Square webhook] SQUARE_WEBHOOK_SIGNATURE_KEY is not set — rejecting webhook");
        return res.status(503).send("Webhook verification not configured");
      }
      // Use the raw request body buffered by the global express.json `verify`
      // callback (server/index.ts setupBodyParsing). The body stream has
      // already been consumed by the JSON parser by the time we get here, so
      // we MUST use that captured buffer — re-stringifying req.body would
      // change byte ordering / whitespace and break Square's HMAC.
      const rawBuf = (req as any).rawBody as Buffer | undefined;
      if (!rawBuf || rawBuf.length === 0) {
        console.warn("[Square webhook] Missing raw body buffer — cannot verify signature");
        return res.status(400).send("Missing request body");
      }
      const bodyStr = rawBuf.toString("utf8");

      const sig = req.headers["x-square-hmacsha256-signature"] as string | undefined;
      if (!sig) return res.status(401).send("Missing signature");
      const notificationUrl = `https://${req.headers.host}${req.originalUrl}`;
      const { createHmac, timingSafeEqual } = await import("node:crypto");
      const expected = createHmac("sha256", sigKey).update(notificationUrl + bodyStr).digest("base64");
      const sigBuf = Buffer.from(sig, "base64");
      const expBuf = Buffer.from(expected, "base64");
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        console.warn("[Square webhook] Invalid signature — rejected");
        return res.status(401).send("Invalid signature");
      }
      const event = JSON.parse(bodyStr);
      const type: string = event?.type ?? "";

      // subscription.updated / subscription.activated
      // NOTE: We intentionally do NOT promote local status to "active" here.
      // Activation is handled exclusively by the invoice.payment_made event once
      // Square confirms the first (or any subsequent) payment has succeeded.
      // This handler only syncs non-entitlement lifecycle changes (pause/cancel/pending)
      // and period metadata, so period dates stay current without granting paid access.
      if (type === "subscription.updated" || type === "subscription.activated") {
        const sqSub = event?.data?.object?.subscription;
        if (sqSub?.id) {
          const existingSubs = await storage.getMembershipSubscriptions();
          const local = existingSubs.find(s => s.squareSubscriptionId === sqSub.id);
          if (local) {
            // Only sync non-entitlement status changes. Never promote to "active"
            // from subscription lifecycle alone — invoice.payment_made handles that.
            const nonActiveStatus =
              sqSub.status === "PAUSED" ? "paused" :
              sqSub.status === "CANCELED" ? "cancelled" :
              sqSub.status === "PENDING" ? "pending" : null;
            // sqSub.status === "ACTIVE": do not change local status here.
            await storage.updateMembershipSubscription(local.id, {
              currentPeriodStart: sqSub.start_date ?? local.currentPeriodStart ?? undefined,
              currentPeriodEnd: sqSub.charged_through_date ?? local.currentPeriodEnd ?? undefined,
              ...(nonActiveStatus ? { status: nonActiveStatus } : {}),
            });
            console.log(`[MEMBERSHIP WEBHOOK] Synced local #${local.id} (sqStatus=${sqSub.status}, localStatus unchanged for ACTIVE)`);
          }
        }
      }

      // subscription.created — link squareSubscriptionId to local record via squareCustomerId
      if (type === "subscription.created") {
        const sqSub = event?.data?.object?.subscription;
        if (sqSub?.id && sqSub?.customer_id) {
          const existingSubs = await storage.getMembershipSubscriptions();
          // Find the local pending sub for this Square customer
          let local = existingSubs.find(s =>
            s.squareCustomerId === sqSub.customer_id &&
            (s.status === "pending" || s.status === "pending_payment") &&
            !s.squareSubscriptionId
          );
          // Wix migration: also match imported records (whether or not migrationCompletedAt
          // was already set by the redirect handler — we still need to link the Square sub ID).
          if (!local) {
            local = existingSubs.find(s =>
              s.squareCustomerId === sqSub.customer_id &&
              !s.squareSubscriptionId &&
              !!s.migrationToken
            );
          }
          if (local) {
            await storage.updateMembershipSubscription(local.id, {
              squareSubscriptionId: sqSub.id,
              ...(local.migrationToken && !local.migrationCompletedAt
                ? { migrationCompletedAt: new Date(), source: "wix_migrated" }
                : {}),
            } as any);
            console.log(`[MEMBERSHIP WEBHOOK] Linked Square subscription ${sqSub.id} → local #${local.id}${local.migrationToken ? " (Wix migration complete)" : ""}`);
          }
        }
      }

      // invoice.payment_made — activate on first payment, renew on subsequent ones
      if (type === "invoice.payment_made") {
        const invoice = event?.data?.object?.invoice;
        const sqSubId: string | undefined = invoice?.subscription_id;
        if (sqSubId) {
          const existingSubs = await storage.getMembershipSubscriptions();
          const local = existingSubs.find(s => s.squareSubscriptionId === sqSubId);
          if (local) {
            // Calculate next period end from invoice scheduled_at or add one month
            let nextPeriodEnd: string | undefined;
            if (invoice.next_payment_amount_money || invoice.next_payment_due_date) {
              nextPeriodEnd = invoice.next_payment_due_date ?? undefined;
            }
            if (!nextPeriodEnd) {
              const next = new Date();
              next.setMonth(next.getMonth() + 1);
              nextPeriodEnd = next.toISOString().slice(0, 10);
            }
            await storage.updateMembershipSubscription(local.id, {
              status: "active",
              failedPaymentAttempts: 0,
              currentPeriodStart: new Date().toISOString().slice(0, 10),
              currentPeriodEnd: nextPeriodEnd,
            });
            console.log(`[MEMBERSHIP WEBHOOK] Payment received for #${local.id} — activated, renews ${nextPeriodEnd}`);
            // Push notification on successful renewal (not first activation)
            if (local.status === "active") {
              const customer = await storage.getCustomerById(local.customerId).catch(() => null);
              if (customer?.email) {
                const tokens = await storage.getPushTokensByEmail(customer.email).catch(() => [] as { token: string }[]);
                if (tokens.length > 0) {
                  await sendTargetedPush(tokens.map((t: { token: string }) => t.token),
                    "Membership Renewed",
                    `Your membership has been renewed and is active until ${nextPeriodEnd}.`
                  ).catch(() => {});
                }
              }
            }
          }
        }
      }

      // invoice.payment_failed — recurring renewal failures
      if (type === "invoice.payment_failed") {
        const invoice = event?.data?.object?.invoice;
        const sqSubId: string | undefined = invoice?.subscription_id;
        if (sqSubId) {
          const existingSubs = await storage.getMembershipSubscriptions();
          const local = existingSubs.find(s => s.squareSubscriptionId === sqSubId);
          if (local) {
            const newAttempts = (local.failedPaymentAttempts ?? 0) + 1;
            const shouldFreeze = newAttempts >= 3;
            await storage.updateMembershipSubscription(local.id, {
              failedPaymentAttempts: newAttempts,
              ...(shouldFreeze ? { status: "frozen" } : {}),
            });
            console.log(`[MEMBERSHIP WEBHOOK] Renewal failed for #${local.id} (attempt ${newAttempts})`);
            const customer = await storage.getCustomerById(local.customerId).catch(() => null);
            if (customer?.email) {
              const tokens = await storage.getPushTokensByEmail(customer.email).catch(() => [] as { token: string }[]);
              if (tokens.length > 0) {
                const title = shouldFreeze ? "Membership Suspended" : newAttempts === 2 ? "Renewal Failed Again" : "Renewal Payment Failed";
                const body = shouldFreeze
                  ? "Your membership has been suspended after 3 failed renewal payments. Please update your payment details."
                  : newAttempts === 2
                  ? `Renewal failed (${newAttempts}/3). One more failure will suspend your membership.`
                  : "Your monthly membership renewal payment failed. Please ensure your card is up to date.";
                await sendTargetedPush(tokens.map((t: { token: string }) => t.token), title, body).catch(() => {});
              }
            }
          }
        }
      }

      res.status(200).send("ok");
    } catch {
      res.status(200).send("ok");
    }
  });

  // ── Membership — staff management ───────────────────────────────────────
  app.get("/api/staff/membership/stats", staffAuth, managerAuth, async (_req, res) => {
    const stats = await storage.getMembershipStats();
    res.json(stats);
  });

  app.get("/api/staff/membership/plans", staffAuth, async (_req, res) => {
    const { getPlanBenefitTexts } = await import("@shared/membership-benefits");
    const plans = await storage.getMembershipPlans();
    // Attach the canonical benefits list so the staff dashboard renders the
    // same wording as the customer app and marketing page.
    const enriched = plans.map((p: any) => ({ ...p, benefits: getPlanBenefitTexts(p) }));
    res.json(enriched);
  });

  app.get("/api/staff/square/customer-groups", staffAuth, async (_req, res) => {
    try {
      if (!square.isConfigured()) return res.status(503).json({ message: "Square is not configured" });
      const groups = await square.listCustomerGroups();
      res.json(groups);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/staff/membership/plans", staffAuth, managerAuth, async (req, res) => {
    const { name, tier, priceMonthly, priceAnnual, hoursIncluded, hoursUnit, snookerUnlimited, foodDrinkDiscount, priorityBooking, loyaltyMultiplier, guestPassesMonthly, squarePlanVariationId, squarePlanVariationIdAlt, squareCustomerGroupId, excludeWithDeals, active, hideFromSignup, sortOrder, color, description } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ message: "Plan name is required" });
    if (priceMonthly == null || isNaN(Number(priceMonthly))) return res.status(400).json({ message: "Monthly price is required" });
    // Auto-generate a tier slug from the name if not provided
    const resolvedTier = (tier?.trim() || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")) + "_" + Date.now();
    try {
      const plan = await storage.createMembershipPlan({
        name: name.trim(),
        tier: resolvedTier,
        priceMonthly: Number(priceMonthly),
        hoursIncluded: hoursIncluded != null && hoursIncluded !== "" ? Number(hoursIncluded) : null,
        hoursUnit: hoursUnit || "month",
        snookerUnlimited: !!snookerUnlimited,
        foodDrinkDiscount: Number(foodDrinkDiscount) || 0,
        priorityBooking: !!priorityBooking,
        loyaltyMultiplier: Number(loyaltyMultiplier) || 1,
        guestPassesMonthly: Number(guestPassesMonthly) || 0,
        priceAnnual: priceAnnual != null && priceAnnual !== "" ? Number(priceAnnual) : null,
        squarePlanVariationId: squarePlanVariationId?.trim() || null,
        squarePlanVariationIdAlt: squarePlanVariationIdAlt?.trim() || null,
        squareCustomerGroupId: squareCustomerGroupId?.trim() || null,
        excludeWithDeals: !!excludeWithDeals,
        active: active !== false,
        hideFromSignup: !!hideFromSignup,
        sortOrder: Number(sortOrder) || 0,
        color: isValidCssColor(color) ? color : "#0047AB",
        description: description?.trim() || null,
      } as any);
      res.json(plan);
    } catch (err: any) {
      console.error("[PLAN CREATE]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/staff/membership/plans/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);

    // Capture old values before updating so we can detect changes
    const oldPlan = await storage.getMembershipPlan(id);

    const updateBody = { ...req.body };
    if ("color" in updateBody) {
      updateBody.color = isValidCssColor(updateBody.color) ? updateBody.color : "#0047AB";
    }
    let plan = await storage.updateMembershipPlan(id, updateBody);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    // Sync price or name changes to Square Catalog automatically
    let squareSynced = false;
    let squareSyncError: string | null = null;
    if (plan.squarePlanVariationId && square.isConfigured() && oldPlan) {
      const priceChanged = req.body.priceMonthly !== undefined && req.body.priceMonthly !== oldPlan.priceMonthly;
      const nameChanged = req.body.name !== undefined && req.body.name !== oldPlan.name;
      if (priceChanged || nameChanged) {
        try {
          const { newVariationId } = await square.syncPlanToSquareCatalog({
            localPlanId: id,
            planVariationId: plan.squarePlanVariationId,
            planName: plan.name,
            newAmountPence: plan.priceMonthly,
            priceChanged,
            nameChanged,
          });
          // Price change creates a new Square plan — save the new variation ID
          if (newVariationId) {
            await storage.updateMembershipPlan(id, { squarePlanVariationId: newVariationId });
            plan = { ...plan, squarePlanVariationId: newVariationId };
            console.log(`[PLAN EDIT] New Square plan created for price change: ${newVariationId}`);
          }
          squareSynced = true;
          console.log(`[PLAN EDIT] Square synced — ${plan.name} price=£${(plan.priceMonthly / 100).toFixed(2)}`);
        } catch (sqErr: any) {
          squareSyncError = sqErr?.message ?? "Square sync failed";
          console.error("[PLAN EDIT] Square sync error:", sqErr?.message);
        }
      }
    }

    res.json({ ...plan, squareSynced, squareSyncError });
  });

  app.post("/api/staff/membership/plans/seed", staffAuth, managerAuth, async (_req, res) => {
    const defaults = [
      { name: "Rack", tier: "rack", priceMonthly: 1999, hoursIncluded: 4, hoursUnit: "month", foodDrinkDiscount: 5, priorityBooking: false, loyaltyMultiplier: 1, guestPassesMonthly: 0, color: "#0047AB", sortOrder: 0, description: "4 hrs snooker per month, 5% food & drink discount", active: false },
      { name: "Century", tier: "century", priceMonthly: 3499, hoursIncluded: 8, hoursUnit: "month", foodDrinkDiscount: 10, priorityBooking: true, loyaltyMultiplier: 1, guestPassesMonthly: 0, color: "#D4A843", sortOrder: 1, description: "8 hrs snooker per month, 10% food & drink, priority booking", active: false },
      { name: "Maximum", tier: "maximum", priceMonthly: 5499, hoursIncluded: null, hoursUnit: "month", foodDrinkDiscount: 15, priorityBooking: true, loyaltyMultiplier: 2, guestPassesMonthly: 1, color: "#10B981", sortOrder: 2, description: "Unlimited snooker, 15% food & drink, 2× loyalty points, 1 guest pass/month", active: true },
    ];
    const created = await Promise.all(defaults.map(d => storage.upsertMembershipPlan(d)));
    res.json(created);
  });

  // ── Setup Square recurring billing plans (one-time, manager only) ──────────
  app.post("/api/staff/membership/setup-square-billing", staffAuth, managerAuth, async (_req, res) => {
    if (!square.isConfigured()) {
      return res.status(503).json({ message: "Square is not configured" });
    }
    try {
      const plans = await storage.getMembershipPlans();
      const results: Array<{ planId: number; name: string; squarePlanVariationId: string; skipped?: boolean }> = [];

      for (const plan of plans) {
        // Skip if already set up
        if (plan.squarePlanVariationId) {
          results.push({ planId: plan.id, name: plan.name, squarePlanVariationId: plan.squarePlanVariationId, skipped: true });
          continue;
        }
        const result = await square.createCatalogSubscriptionPlan({
          localPlanId: plan.id,
          name: plan.name,
          amountPence: plan.priceMonthly,
        });
        await storage.updateMembershipPlan(plan.id, { squarePlanVariationId: result.squarePlanVariationId });
        results.push({ planId: plan.id, name: plan.name, squarePlanVariationId: result.squarePlanVariationId });
        console.log(`[SQUARE SETUP] Created plan variation for ${plan.name}: ${result.squarePlanVariationId}`);
      }

      res.json({ success: true, results });
    } catch (err: any) {
      console.error("[SQUARE SETUP] Error:", err?.message);
      res.status(500).json({ message: err?.message || "Setup failed" });
    }
  });

  app.get("/api/staff/membership/subscriptions", staffAuth, managerAuth, async (_req, res) => {
    const subs = await storage.getMembershipSubscriptions();
    res.json(subs);
  });

  // Manual Square membership sync — manager-only because it exposes / mutates
  // membership records across the entire customer base.
  app.post("/api/staff/membership/square-sync", staffAuth, managerAuth, async (req, res) => {
    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ message: "Email is required" });
    try {
      if (!square.isConfigured()) return res.status(503).json({ message: "Square is not configured" });
      const customer = await storage.getCustomerByEmail(email.trim().toLowerCase());
      if (!customer) return res.status(404).json({ message: "No app account found with that email. The customer needs to register in the app first." });

      // If they already have a non-group subscription (paid / manual), don't
      // touch it — surface that fact so staff know to manage it elsewhere.
      const before = await storage.getMembershipSubscriptionByCustomer(customer.id);
      if (before && (before as any).source !== "square_group_sync") {
        return res.json({
          status: "already_linked",
          message: `${customer.name} already has a membership linked (${before.status} on ${(before as any).plan?.name ?? "plan #" + before.planId}). Use the Subscriptions tab to manage it.`,
        });
      }

      // Delegate to the same helper used on customer sign-in and bulk sync.
      // It handles re-checking group-synced subs (cancelling on removal,
      // refreshing period end, switching plan if the customer moved groups)
      // without creating duplicates.
      await syncSquareMembershipForCustomer(customer.id, email.trim().toLowerCase());

      const after = await storage.getMembershipSubscriptionByCustomer(customer.id);

      // No active sub after sync — explain why.
      if (!after) {
        const sqCustomer = await square.findSquareCustomerByEmail(email.trim()).catch(() => null);
        if (!sqCustomer) {
          return res.json({ status: "no_square_customer", message: `No Square customer found for ${email}. They may need to be added to Square first, or the email on their Square profile must match exactly.` });
        }
        const allPlans = await storage.getMembershipPlans();
        const groupPlans = allPlans.filter(p => p.active && (p as any).squareCustomerGroupId);
        const customerGroupIds = await square.getCustomerGroupIds(sqCustomer.id).catch(() => [] as string[]);
        const sqSubs: any[] = await square.listSquareSubscriptionsForCustomer(sqCustomer.id).catch(() => []);
        const groupInfo = customerGroupIds.length
          ? `Their Square groups: ${customerGroupIds.join(", ")}`
          : "They are not in any Square customer groups.";
        const subInfo = sqSubs.length
          ? `Subscriptions: ${sqSubs.map((s: any) => `${s.status} (plan: ${s.plan_variation_id || "unknown"})`).join(", ")}.`
          : "No subscriptions found.";
        if (before && !after) {
          return res.json({ status: "unlinked", message: `${customer.name} was removed from their Square group — local membership has been cancelled. ${groupInfo}` });
        }
        if (!groupPlans.length && !sqSubs.length) {
          return res.json({ status: "no_subscriptions", message: `${customer.name} found in Square but has no subscriptions and no customer groups are mapped to plans.` });
        }
        return res.json({ status: "no_matching_plan", message: `${customer.name} found in Square but has no matching subscription or customer group. ${subInfo} ${groupInfo}` });
      }

      // Active sub now exists. Distinguish "newly linked" vs "still linked" vs "switched plan".
      const planName = (after as any).plan?.name ?? `plan #${after.planId}`;
      const source = (after as any).source ?? "manual";
      const via = source === "square_group_sync" ? "Square customer group" : source === "square_sync" ? "Square subscription" : "manual link";
      if (!before) {
        console.log(`[MEMBERSHIP] Manual sync: customer #${customer.id} (${email}) → ${planName} via ${via}`);
        return res.json({ status: "linked", message: `✓ ${customer.name} linked to ${planName} via ${via}` });
      }
      if (before.planId !== after.planId) {
        return res.json({ status: "switched", message: `✓ ${customer.name} switched from ${(before as any).plan?.name ?? `plan #${before.planId}`} to ${planName} (${via})` });
      }
      return res.json({ status: "already_linked", message: `${customer.name} is still linked to ${planName} via ${via} — refreshed.` });
    } catch (err: any) {
      console.error("[MEMBERSHIP] Manual Square sync error:", err.message);
      return res.status(500).json({ message: "Sync failed: " + err.message });
    }
  });

  // Bulk sync — runs syncSquareMembershipForCustomer for every app customer
  app.post("/api/staff/membership/sync-all", staffAuth, managerAuth, async (req, res) => {
    if (!square.isConfigured()) return res.status(503).json({ message: "Square is not configured" });
    try {
      const allCustomers = await storage.getAllCustomers();
      const results: { email: string; status: string }[] = [];
      for (const c of allCustomers) {
        try {
          await syncSquareMembershipForCustomer(c.id, c.email);
          const sub = await storage.getMembershipSubscriptionByCustomer(c.id);
          results.push({ email: c.email, status: sub ? `linked: ${sub.status} (${(sub as any).plan?.name ?? "unknown plan"})` : "no membership found" });
        } catch (e: any) {
          results.push({ email: c.email, status: `error: ${e.message}` });
        }
      }
      const linked = results.filter(r => r.status.startsWith("linked")).length;
      console.log(`[MEMBERSHIP] Bulk sync complete: ${linked}/${allCustomers.length} customers linked`);
      res.json({ total: allCustomers.length, linked, results });
    } catch (err: any) {
      res.status(500).json({ message: "Bulk sync failed: " + err.message });
    }
  });

  // ── Leftover one-time membership charges audit ─────────────────────────────
  // Until the recurring-only fix (task #66), the membership browser fallback
  // could quietly send a customer to a one-time Square payment link instead
  // of a recurring subscription. Some customers may have paid once and now
  // sit in our DB as "pending" or "active" with no `squareSubscriptionId` —
  // they think they're members but their card will never be re-charged.
  //
  // This sweep scans those rows, queries Square to confirm there is a
  // completed one-time payment AND no active/pending recurring subscription,
  // and flags them for the staff to either refund-and-cancel (default) or
  // re-issue a fresh recurring payment link.
  // Window around the local subscription's createdAt where we'll accept a
  // Square payment as the "membership signup payment". Generous on the
  // forward edge because some customers paid days after signing up via the
  // emailed link, but tight on the back edge to avoid grabbing an unrelated
  // earlier order.
  const LEFTOVER_PAYMENT_WINDOW_BEFORE_MS = 24 * 60 * 60 * 1000; // 1 day before
  const LEFTOVER_PAYMENT_WINDOW_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days after

  // Returns the expected one-off charge (in pence) the old fallback would
  // have collected for a given local sub, or null if we cannot determine it
  // (in which case we refuse to auto-match a payment).
  function expectedFallbackAmountPence(
    sub: { source: string },
    plan: { priceMonthly: number; priceAnnual: number | null } | null,
  ): number | null {
    if (!plan) return null;
    if (sub.source === "app_annual") {
      return plan.priceAnnual ?? null;
    }
    if (sub.source === "app") {
      return plan.priceMonthly ?? null;
    }
    return null;
  }

  // Decide whether a Square payment plausibly is the one-off membership
  // fallback charge for this local sub: COMPLETED, exactly the expected
  // plan amount, and created within a tight window around sub.createdAt.
  function paymentMatchesFallback(
    payment: any,
    sub: { createdAt: Date },
    expectedAmountPence: number,
  ): boolean {
    if (!payment || payment.status !== "COMPLETED") return false;
    const amt = payment.amount_money?.amount;
    if (typeof amt !== "number" || amt !== expectedAmountPence) return false;
    const createdAtMs = payment.created_at ? new Date(payment.created_at).getTime() : NaN;
    if (!Number.isFinite(createdAtMs)) return false;
    const subMs = new Date(sub.createdAt).getTime();
    if (createdAtMs < subMs - LEFTOVER_PAYMENT_WINDOW_BEFORE_MS) return false;
    if (createdAtMs > subMs + LEFTOVER_PAYMENT_WINDOW_AFTER_MS) return false;
    return true;
  }

  async function sweepLeftoverOneTimeMemberships() {
    const all = await storage.getMembershipSubscriptions();
    const SUSPECT_STATUSES = new Set(["pending", "active", "pending_payment", "past_due"]);
    const SUSPECT_SOURCES = new Set(["app", "app_annual"]);
    const candidates = all.filter((s) =>
      !s.squareSubscriptionId &&
      SUSPECT_STATUSES.has(s.status) &&
      SUSPECT_SOURCES.has(s.source) &&
      !!s.squareCustomerId,
    );

    const out: Array<{
      subscriptionId: number;
      customerId: number;
      customerName: string | null;
      customerEmail: string | null;
      planId: number;
      planName: string | null;
      status: string;
      source: string;
      createdAt: Date;
      staffNotes: string | null;
      squareCustomerId: string;
      expectedAmountPence: number;
      oneTimePaymentId: string;
      oneTimePaymentAmountPence: number;
      oneTimePaymentCreatedAt: string;
      hasRecurringSubscription: boolean;
    }> = [];

    for (const sub of candidates) {
      const sqCustomerId = sub.squareCustomerId as string;
      const expectedAmount = expectedFallbackAmountPence(sub, sub.plan);
      // Without a known expected amount we refuse to match anything — staff
      // would have to investigate manually rather than risk a wrong refund.
      if (expectedAmount == null) continue;

      const [payments, subscriptions] = await Promise.all([
        square.listSquarePaymentsForCustomer(sqCustomerId).catch(() => []),
        square.listSquareSubscriptionsForCustomer(sqCustomerId).catch(() => []),
      ]);

      const hasRecurringSubscription = subscriptions.some((s: any) =>
        s && (s.status === "ACTIVE" || s.status === "PENDING")
      );
      if (hasRecurringSubscription) continue;

      // Filter strictly: COMPLETED + exact expected amount + within window.
      const matches = payments.filter((p) => paymentMatchesFallback(p, sub, expectedAmount));
      // Skip if no plausible match OR if multiple plausible matches (we
      // don't know which is the membership one — flag for manual review by
      // logging, and skip rather than risk picking the wrong one).
      if (matches.length !== 1) {
        if (matches.length > 1) {
          console.warn(`[MEMBERSHIP] Leftover audit: sub #${sub.id} has ${matches.length} candidate Square payments matching the membership amount/window — skipping, needs manual review.`);
        }
        continue;
      }
      const target = matches[0];

      out.push({
        subscriptionId: sub.id,
        customerId: sub.customerId,
        customerName: sub.customer?.name ?? null,
        customerEmail: sub.customer?.email ?? null,
        planId: sub.planId,
        planName: sub.plan?.name ?? null,
        status: sub.status,
        source: sub.source,
        createdAt: sub.createdAt,
        staffNotes: sub.staffNotes,
        squareCustomerId: sqCustomerId,
        expectedAmountPence: expectedAmount,
        oneTimePaymentId: target.id,
        oneTimePaymentAmountPence: target.amount_money.amount,
        oneTimePaymentCreatedAt: target.created_at,
        hasRecurringSubscription,
      });
    }

    return out;
  }

  async function sendMembershipFallbackResolvedEmail(opts: {
    customerName: string;
    customerEmail: string;
    planName: string;
    refundedAmountPence: number;
  }): Promise<boolean> {
    const amt = `£${(opts.refundedAmountPence / 100).toFixed(2)}`;
    const subject = `Your ${opts.planName} Membership — refunded and cancelled`;
    const html = `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #0A1628; font-size: 24px; margin: 0;">The 147</h1>
        <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0;">Snooker, Bar &amp; Restaurant</p>
      </div>
      <p style="color: #374151; font-size: 15px;">Hi ${escHtml(opts.customerName)},</p>
      <p style="color: #374151; font-size: 15px;">We're writing to let you know about an issue we found with your recent <strong>${escHtml(opts.planName)} Membership</strong> sign-up.</p>
      <p style="color: #374151; font-size: 15px;">The payment page you used charged you <strong>${amt}</strong> as a one-off, but it never set up the monthly recurring billing. That means your card would not have been charged again and your membership was never properly active.</p>
      <p style="color: #374151; font-size: 15px;">To put this right we have:</p>
      <ul style="color: #374151; font-size: 15px; line-height: 1.7;">
        <li>Refunded the <strong>${amt}</strong> back to the card you used (please allow 5–10 working days).</li>
        <li>Cancelled the affected membership record on our side, so you are not left in limbo.</li>
      </ul>
      <p style="color: #374151; font-size: 15px;">If you would still like to join, please open the latest version of The 147 app and sign up again — the new in-app payment flow sets up proper monthly billing in one go. We're really sorry for the inconvenience.</p>
      <p style="color: #374151; font-size: 15px;">If you have any questions please reply to this email and we'll get back to you.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #9ca3af; font-size: 12px; text-align: center;">The 147 &mdash; Snooker, Bar &amp; Restaurant<br/>www.the147.co.uk</p>
    </div>`;

    const smtpSent = await sendEmailViaSMTP(opts.customerEmail, subject, html);
    if (smtpSent) {
      console.log(`[MEMBERSHIP] Fallback resolution email sent via SMTP to ${maskEmail(opts.customerEmail)}`);
      return true;
    }
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
      const fromName = process.env.RESEND_FROM_NAME || "The 147";
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: opts.customerEmail, subject, html }),
        });
        if (response.ok) {
          console.log(`[MEMBERSHIP] Fallback resolution email sent via Resend to ${maskEmail(opts.customerEmail)}`);
          return true;
        }
      } catch (_) {}
    }
    console.warn(`[MEMBERSHIP] Fallback resolution email failed for ${maskEmail(opts.customerEmail)}`);
    return false;
  }

  // GET — manager-only audit report of leftover one-time membership charges
  app.get("/api/staff/membership/leftover-onetime", staffAuth, managerAuth, async (_req, res) => {
    if (!square.isConfigured()) {
      return res.status(503).json({ message: "Square is not configured" });
    }
    try {
      const items = await sweepLeftoverOneTimeMemberships();
      res.json({ count: items.length, items });
    } catch (err: any) {
      console.error("[MEMBERSHIP] Leftover audit failed:", err?.message ?? err);
      res.status(500).json({ message: err?.message || "Audit failed" });
    }
  });

  // POST — refund the one-time payment + cancel the local sub + email customer.
  // Requires the exact `paymentId` shown by the audit so we can never pick a
  // different completed Square payment for the same customer.
  app.post("/api/staff/membership/leftover-onetime/:id/refund-cancel", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (!id) return res.status(400).json({ message: "Invalid subscription id" });
    const paymentId = (req.body?.paymentId ?? "").toString().trim();
    if (!paymentId) {
      return res.status(400).json({ message: "paymentId from the audit is required to refund." });
    }
    if (!square.isConfigured()) {
      return res.status(503).json({ message: "Square is not configured" });
    }
    try {
      const sub = await storage.getMembershipSubscription(id);
      if (!sub) return res.status(404).json({ message: "Subscription not found" });
      if (sub.squareSubscriptionId) {
        return res.status(400).json({ message: "This subscription is already linked to a recurring Square subscription — nothing to refund." });
      }
      if (!sub.squareCustomerId) {
        return res.status(400).json({ message: "This subscription has no Square customer link — cannot locate one-time payment." });
      }

      const plan = await storage.getMembershipPlan(sub.planId);
      const expectedAmount = expectedFallbackAmountPence(sub, plan ?? null);
      if (expectedAmount == null) {
        return res.status(400).json({
          message: "Cannot determine the expected membership charge amount for this plan — refusing to refund automatically.",
        });
      }

      // Re-verify with Square at action time so we don't refund the wrong payment.
      const [payments, sqSubs] = await Promise.all([
        square.listSquarePaymentsForCustomer(sub.squareCustomerId).catch(() => []),
        square.listSquareSubscriptionsForCustomer(sub.squareCustomerId).catch(() => []),
      ]);
      const hasRecurring = sqSubs.some((s: any) => s && (s.status === "ACTIVE" || s.status === "PENDING"));
      if (hasRecurring) {
        return res.status(400).json({
          message: "Square shows an active/pending recurring subscription for this customer. Refusing to refund — re-run the audit.",
        });
      }
      // The exact payment must (a) belong to this customer's recent payments,
      // (b) match the membership amount, and (c) sit in our acceptance window.
      const target = payments.find((p: any) => p && p.id === paymentId);
      if (!target) {
        return res.status(404).json({ message: "That payment was not found on this Square customer's recent payments. Re-run the audit." });
      }
      if (!paymentMatchesFallback(target, sub, expectedAmount)) {
        return res.status(400).json({
          message: "That payment no longer matches the membership signup amount/window. Re-run the audit before refunding.",
        });
      }

      const staffUser = (req as any).staffUser?.username || "staff";
      const amountPence = target.amount_money.amount as number;

      let refundId: string | null = null;
      try {
        const refund = await square.createRefund({
          paymentId: target.id,
          amountPence,
          reason: `Leftover one-time membership charge from old browser fallback (sub #${sub.id})`,
          idempotencyKey: `leftover-onetime-${sub.id}-${target.id}`,
        });
        refundId = refund?.id ?? null;
      } catch (refErr: any) {
        const msg = refErr?.message || "Refund failed";
        console.error(`[MEMBERSHIP] Refund failed for sub #${sub.id} payment ${target.id}:`, msg);
        return res.status(502).json({ message: `Refund failed: ${msg}`, code: "REFUND_FAILED" });
      }

      const auditNote = `[Leftover one-time fallback resolved by ${staffUser} on ${new Date().toISOString().slice(0, 10)}: refunded £${(amountPence / 100).toFixed(2)} (payment ${target.id}, refund ${refundId ?? "?"}) and cancelled.]`;
      const combinedNotes = sub.staffNotes ? `${sub.staffNotes}\n${auditNote}` : auditNote;
      await storage.updateMembershipSubscription(sub.id, {
        status: "cancelled",
        cancelledAt: new Date(),
        staffNotes: combinedNotes,
      });
      await storage.logMembershipAction({
        subscriptionId: sub.id,
        customerId: sub.customerId,
        action: "refund_cancel",
        staffUsername: staffUser,
        amountPence,
        refundId,
        note: `Refunded leftover one-time membership charge (payment ${target.id}) and cancelled subscription.`,
      }).catch((e) => console.warn("[MEMBERSHIP] audit log write failed:", e?.message ?? e));

      const customer = await storage.getCustomerById(sub.customerId).catch(() => null);
      let emailSent = false;
      if (customer?.email) {
        emailSent = await sendMembershipFallbackResolvedEmail({
          customerName: customer.name,
          customerEmail: customer.email,
          planName: plan?.name ?? "membership",
          refundedAmountPence: amountPence,
        });
      }

      console.log(`[MEMBERSHIP] Leftover one-time refunded+cancelled for sub #${sub.id} (refund ${refundId})`);
      res.json({
        success: true,
        subscriptionId: sub.id,
        refundId,
        refundedAmountPence: amountPence,
        emailSent,
      });
    } catch (err: any) {
      console.error("[MEMBERSHIP] Leftover refund-cancel failed:", err?.message ?? err);
      res.status(500).json({ message: err?.message || "Action failed" });
    }
  });

  // POST — instead of refunding, generate a fresh recurring subscription
  // payment link and email it to the customer so they can convert their
  // one-time payment into a real recurring membership.
  app.post("/api/staff/membership/leftover-onetime/:id/send-recurring-link", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (!id) return res.status(400).json({ message: "Invalid subscription id" });
    if (!square.isConfigured()) {
      return res.status(503).json({ message: "Square is not configured" });
    }
    try {
      const sub = await storage.getMembershipSubscription(id);
      if (!sub) return res.status(404).json({ message: "Subscription not found" });
      const plan = await storage.getMembershipPlan(sub.planId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      const customer = await storage.getCustomerById(sub.customerId);
      if (!customer?.email) return res.status(400).json({ message: "Customer has no email on file" });

      if (sub.squareCustomerId) {
        const existingSubs = await square
          .listSquareSubscriptionsForCustomer(sub.squareCustomerId)
          .catch(() => [] as any[]);
        const liveStatuses = new Set(["ACTIVE", "PENDING", "PAUSED"]);
        const alreadyRecurring = existingSubs.find((s: any) => liveStatuses.has(String(s?.status || "").toUpperCase()));
        if (alreadyRecurring) {
          return res.status(409).json({
            message: `Customer already has a ${alreadyRecurring.status} recurring subscription in Square (${alreadyRecurring.id}). Re-run the audit before sending another link.`,
            code: "RECURRING_ALREADY_EXISTS",
          });
        }
      }

      const variationId = plan.squarePlanVariationId;
      if (!variationId) {
        return res.status(503).json({ message: "Plan is not set up for recurring billing — set the Square variation first.", code: "PLAN_NOT_BILLABLE" });
      }
      const redirectUrl = `https://the147bradford.replit.app/api/membership/${sub.id}/payment-return`;
      const link = await square.createSubscriptionCheckoutLink({
        planVariationId: variationId,
        subscriptionId: sub.id,
        buyerEmail: customer.email,
        redirectUrl,
      });
      const emailSent = await sendMembershipPaymentLinkEmail({
        customerName: customer.name,
        customerEmail: customer.email,
        planName: plan.name,
        priceMonthly: plan.priceMonthly,
        paymentUrl: link.url,
      });

      const staffUser = (req as any).staffUser?.username || "staff";
      const auditNote = `[Leftover one-time fallback: ${staffUser} sent a fresh recurring subscription payment link on ${new Date().toISOString().slice(0, 10)}]`;
      const combinedNotes = sub.staffNotes ? `${sub.staffNotes}\n${auditNote}` : auditNote;
      await storage.updateMembershipSubscription(sub.id, { staffNotes: combinedNotes });
      await storage.logMembershipAction({
        subscriptionId: sub.id,
        customerId: sub.customerId,
        action: "payment_link_sent",
        staffUsername: staffUser,
        note: `Sent recurring subscription payment link to customer (leftover one-time fallback resolution).`,
      }).catch((e) => console.warn("[MEMBERSHIP] audit log write failed:", e?.message ?? e));

      res.json({ success: true, url: link.url, emailSent });
    } catch (err: any) {
      console.error("[MEMBERSHIP] Leftover send-recurring-link failed:", err?.message ?? err);
      res.status(500).json({ message: err?.message || "Action failed" });
    }
  });

  // ── Weekly leftover one-time membership audit ─────────────────────────────
  // Runs the same sweep as the staff dashboard endpoint on a schedule. If the
  // sweep finds any rows, emails the configured manager address with a digest
  // and a link to the Memberships tab. Stays SILENT on a clean week — we
  // explicitly DO NOT send a "no leftover charges" email to avoid noise.
  function getLeftoverAuditRecipient(): string | null {
    const candidate =
      process.env.MEMBERSHIP_AUDIT_EMAIL ||
      process.env.MANAGER_EMAIL ||
      process.env.STAFF_NOTIFICATION_EMAIL ||
      "";
    const trimmed = candidate.trim();
    if (!trimmed) return null;
    // Very light sanity check — we don't want to call SMTP with garbage.
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) return null;
    return trimmed;
  }

  function getDashboardBaseUrl(): string {
    // Prefer an explicit override, then the Replit-injected production
    // domain, then the dev domain, then a final hardcoded fallback so the
    // email still works in environments without any of those set.
    const explicit = process.env.PUBLIC_BASE_URL?.trim();
    if (explicit) return explicit.replace(/\/$/, "");
    const prodDomains = process.env.REPLIT_DOMAINS?.split(",").map(d => d.trim()).filter(Boolean);
    if (prodDomains && prodDomains.length) return `https://${prodDomains[0]}`;
    if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
    return "https://the147bradford.replit.app";
  }

  function buildLeftoverAuditEmail(items: Awaited<ReturnType<typeof sweepLeftoverOneTimeMemberships>>) {
    const dashboardUrl = `${getDashboardBaseUrl()}/staff#memberships`;
    const total = items.reduce((sum, it) => sum + (it.oneTimePaymentAmountPence || 0), 0);
    const totalGbp = `£${(total / 100).toFixed(2)}`;
    const subject = `[The 147] ${items.length} leftover one-time membership charge${items.length === 1 ? "" : "s"} need review`;
    const rows = items.map((it) => {
      const name = escHtml(it.customerName ?? "Unknown");
      const email = it.customerEmail ? escHtml(maskEmail(it.customerEmail)) : "—";
      const plan = escHtml(it.planName ?? "—");
      const amt = `£${(it.oneTimePaymentAmountPence / 100).toFixed(2)}`;
      const created = new Date(it.createdAt).toISOString().slice(0, 10);
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">#${it.subscriptionId}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${name}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${email}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${plan}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${amt}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${created}</td>
      </tr>`;
    }).join("");
    const html = `<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:24px;color:#111827">
      <h2 style="margin:0 0 8px;color:#0A1628">Leftover one-time membership audit</h2>
      <p style="margin:0 0 16px;color:#374151">The weekly audit found <strong>${items.length}</strong> member${items.length === 1 ? "" : "s"} who paid the old one-off membership fallback (totalling <strong>${totalGbp}</strong>) but were never moved onto a recurring Square subscription. Please review and either refund &amp; cancel them or send a recurring payment link.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 16px">
        <thead>
          <tr style="background:#f3f4f6;text-align:left">
            <th style="padding:8px;border-bottom:1px solid #e5e7eb">Sub</th>
            <th style="padding:8px;border-bottom:1px solid #e5e7eb">Member</th>
            <th style="padding:8px;border-bottom:1px solid #e5e7eb">Email</th>
            <th style="padding:8px;border-bottom:1px solid #e5e7eb">Plan</th>
            <th style="padding:8px;border-bottom:1px solid #e5e7eb">Charge</th>
            <th style="padding:8px;border-bottom:1px solid #e5e7eb">Signed up</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:0 0 16px"><a href="${dashboardUrl}" style="display:inline-block;background:#0047AB;color:#fff;padding:12px 22px;border-radius:8px;font-weight:700;text-decoration:none">Open the Memberships tab</a></p>
      <p style="margin:24px 0 0;color:#6b7280;font-size:12px">This is an automated weekly digest from The 147 staff system. You'll only receive it on weeks where the audit finds something — clean weeks are silent.</p>
    </div>`;
    return { subject, html };
  }

  async function runWeeklyLeftoverAudit() {
    if (!square.isConfigured()) {
      // Skip silently — Square not configured in this environment.
      return;
    }
    let items: Awaited<ReturnType<typeof sweepLeftoverOneTimeMemberships>> = [];
    try {
      items = await sweepLeftoverOneTimeMemberships();
    } catch (err: any) {
      console.error("[MEMBERSHIP] Weekly leftover audit sweep failed:", err?.message ?? err);
      return;
    }
    if (!items.length) {
      console.log("[MEMBERSHIP] Weekly leftover audit: no leftover one-time charges (silent — no digest sent)");
      return;
    }
    const recipient = getLeftoverAuditRecipient();
    if (!recipient) {
      console.warn(`[MEMBERSHIP] Weekly leftover audit found ${items.length} item(s) but no manager email is configured (set MEMBERSHIP_AUDIT_EMAIL or MANAGER_EMAIL). Skipping email.`);
      return;
    }
    const { subject, html } = buildLeftoverAuditEmail(items);
    const sent = await sendEmailViaSMTP(recipient, subject, html).catch(() => false);
    if (sent) {
      console.log(`[MEMBERSHIP] Weekly leftover audit digest sent to ${maskEmail(recipient)} (${items.length} item(s))`);
    } else {
      console.warn(`[MEMBERSHIP] Weekly leftover audit digest FAILED to send to ${maskEmail(recipient)} (${items.length} item(s))`);
    }
  }

  function scheduleWeeklyLeftoverAudit() {
    if (process.env.NODE_ENV === "test") return;
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    // Delay first run by 10 minutes after boot so we don't hammer Square the
    // moment the server starts (and so multiple quick restarts don't re-run).
    const FIRST_RUN_DELAY_MS = 10 * 60 * 1000;
    setTimeout(() => {
      runWeeklyLeftoverAudit();
      setInterval(runWeeklyLeftoverAudit, ONE_WEEK_MS);
    }, FIRST_RUN_DELAY_MS);
    console.log("[MEMBERSHIP] Weekly leftover one-time membership audit scheduled (first run in 10 min, then every 7 days)");
  }

  scheduleWeeklyLeftoverAudit();

  app.post("/api/staff/membership/subscriptions", staffAuth, managerAuth, async (req, res) => {
    const { customerId, planId, status = "active", staffNotes, source = "staff", startDate } = req.body ?? {};
    if (!customerId || !planId) return res.status(400).json({ message: "customerId and planId are required" });
    const today = new Date().toISOString().slice(0, 10);
    // Use provided startDate if valid, else fall back to today
    const periodStart = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : today;
    const periodStartDate = new Date(periodStart + "T12:00:00Z");
    const periodEndDate = new Date(periodStartDate);
    periodEndDate.setMonth(periodEndDate.getMonth() + 1);
    const periodEnd = periodEndDate.toISOString().slice(0, 10);
    // If start date is in the future, create as pending until it starts
    const effectiveStatus = startDate && startDate > today ? "pending_start" : status;
    const sub = await storage.createMembershipSubscription({
      customerId: parseInt(customerId),
      planId: parseInt(planId),
      status: effectiveStatus,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      hoursUsedThisPeriod: 0,
      guestPassesUsed: 0,
      staffNotes: staffNotes || null,
      source,
    });
    // Optionally create Square subscription if configured and plan has a Square plan variation ID
    if (square.isConfigured()) {
      try {
        const plan = await storage.getMembershipPlan(parseInt(planId));
        const customer = await storage.getCustomerById(parseInt(customerId));
        if (plan?.squarePlanVariationId && customer) {
          let sqCustomer = await square.findSquareCustomerByEmail(customer.email).catch(() => null);
          if (!sqCustomer) sqCustomer = await square.createSquareCustomer(customer.name, customer.email, customer.phone || undefined);
          if (sqCustomer) {
            const locationId = (process.env.SQUARE_LOC_ID || process.env.SQUARE_LOCATION_ID)!;
            const sqSub = await square.createSquareSubscription(sqCustomer.id, plan.squarePlanVariationId, locationId, undefined, periodStart).catch(() => null);
            if (sqSub) {
              await storage.updateMembershipSubscription(sub.id, {
                squareSubscriptionId: sqSub.id,
                squareCustomerId: sqCustomer.id,
                currentPeriodEnd: sqSub.charged_through_date ?? sub.currentPeriodEnd,
              });
            }
          }
        }
      } catch { /* Square not set up yet — subscription saved locally */ }
    }
    const staffUser = (req as any).staffUser?.username || "staff";
    await storage.logMembershipAction({
      subscriptionId: sub.id,
      customerId: sub.customerId,
      action: "created",
      staffUsername: staffUser,
      note: `Created via staff dashboard (plan #${sub.planId}, source ${source}, status ${effectiveStatus}).`,
    }).catch((e) => console.warn("[MEMBERSHIP] audit log write failed:", e?.message ?? e));
    res.status(201).json(sub);
  });

  app.post("/api/staff/membership/payment-link", staffAuth, managerAuth, async (req, res) => {
    const { subscriptionId, planId } = req.body ?? {};
    if (!subscriptionId || !planId) return res.status(400).json({ message: "subscriptionId and planId required" });
    if (!square.isConfigured()) return res.status(503).json({ message: "Square is not configured" });
    try {
      const [plan, sub] = await Promise.all([
        storage.getMembershipPlan(parseInt(planId)),
        storage.getMembershipSubscription(parseInt(subscriptionId)),
      ]);
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      // Memberships must use a RECURRING subscription checkout. Never send
      // a customer a one-time payment link for a membership signup —
      // otherwise their card is charged once and never billed again.
      const variationId = plan.squarePlanVariationId;
      if (!variationId) {
        return res.status(503).json({
          message: "This plan isn't set up for online recurring billing yet — set the Square plan variation first.",
          code: "PLAN_NOT_BILLABLE",
        });
      }
      const customer = sub ? await storage.getCustomerById(sub.customerId).catch(() => null) : null;
      const redirectUrl = `${process.env.REPLIT_INTERNAL_APP_DOMAIN ? `https://${process.env.REPLIT_INTERNAL_APP_DOMAIN}` : "https://the147bradford.replit.app"}/staff`;
      const link = await square.createSubscriptionCheckoutLink({
        planVariationId: variationId,
        subscriptionId: parseInt(subscriptionId),
        buyerEmail: customer?.email,
        redirectUrl,
      });

      // Email the payment link to the customer
      let emailSent = false;
      if (sub) {
        const customer = await storage.getCustomerById(sub.customerId).catch(() => null);
        if (customer?.email) {
          emailSent = await sendMembershipPaymentLinkEmail({
            customerName: customer.name,
            customerEmail: customer.email,
            planName: plan.name,
            priceMonthly: plan.priceMonthly,
            paymentUrl: link.url,
          });
        }
      }

      const staffUser = (req as any).staffUser?.username || "staff";
      await storage.logMembershipAction({
        subscriptionId: sub?.id ?? null,
        customerId: sub?.customerId ?? null,
        action: "payment_link_sent",
        staffUsername: staffUser,
        note: `Generated Square recurring payment link for plan "${plan.name}"${customer?.email ? " (emailed to customer)" : ""}.`,
      }).catch((e) => console.warn("[MEMBERSHIP] audit log write failed:", e?.message ?? e));

      res.json({ url: link.url, paymentLinkId: link.paymentLinkId, emailSent });
    } catch (err: any) {
      console.error("[PAYMENT LINK]", err?.message);
      res.status(500).json({ message: err?.message || "Failed to create payment link" });
    }
  });

  // Per-subscription audit log feed for the staff dashboard history drawer.
  app.get("/api/staff/membership/subscriptions/:id/audit-log", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (!id) return res.status(400).json({ message: "Invalid subscription id" });
    try {
      const entries = await storage.listMembershipAuditLogForSubscription(id, 100);
      res.json(entries);
    } catch (err: any) {
      console.error("[MEMBERSHIP] audit log fetch failed:", err?.message ?? err);
      res.status(500).json({ message: "Could not load membership history" });
    }
  });

  app.patch("/api/staff/membership/subscriptions/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const sub = await storage.getMembershipSubscription(id);
    if (!sub) return res.status(404).json({ message: "Subscription not found" });
    const { status, staffNotes, planId, hoursUsedThisPeriod, guestPassesUsed, currentPeriodStart, currentPeriodEnd } = req.body ?? {};
    const updates: Record<string, unknown> = {};
    if (staffNotes !== undefined) updates.staffNotes = staffNotes;
    if (planId !== undefined) updates.planId = parseInt(planId);
    if (hoursUsedThisPeriod !== undefined) updates.hoursUsedThisPeriod = parseInt(hoursUsedThisPeriod);
    if (guestPassesUsed !== undefined) updates.guestPassesUsed = parseInt(guestPassesUsed);
    if (currentPeriodStart !== undefined) updates.currentPeriodStart = currentPeriodStart || null;
    if (currentPeriodEnd !== undefined) updates.currentPeriodEnd = currentPeriodEnd || null;
    if (status !== undefined) {
      updates.status = status;
      if (status === "cancelled") updates.cancelledAt = new Date();
      // Mirror to Square if possible
      if (sub.squareSubscriptionId && square.isConfigured()) {
        try {
          if (status === "cancelled") await square.cancelSquareSubscription(sub.squareSubscriptionId);
          else if (status === "paused") await square.pauseSquareSubscription(sub.squareSubscriptionId);
          else if (status === "active" && sub.status === "paused") await square.resumeSquareSubscription(sub.squareSubscriptionId);
        } catch { /* Square call failed — local update still applied */ }
      }
    }
    const updated = await storage.updateMembershipSubscription(id, updates as any);

    // Audit log: record the meaningful changes in a single combined entry so
    // the per-member history drawer reads like a human-friendly diary.
    const staffUser = (req as any).staffUser?.username || "staff";
    const changes: string[] = [];
    let action: string | null = null;
    if (status !== undefined && status !== sub.status) {
      changes.push(`status ${sub.status} → ${status}`);
      if (status === "cancelled") action = "cancelled";
      else if (status === "paused") action = "paused";
      else if (status === "active" && sub.status === "paused") action = "resumed";
      else action = "status_changed";
    }
    if (planId !== undefined && parseInt(planId) !== sub.planId) {
      changes.push(`plan ${sub.planId} → ${parseInt(planId)}`);
      if (!action) action = "plan_changed";
    }
    if (currentPeriodEnd !== undefined && (currentPeriodEnd || null) !== (sub.currentPeriodEnd || null)) {
      changes.push(`expiry ${sub.currentPeriodEnd ?? "—"} → ${currentPeriodEnd || "—"}`);
      if (!action) action = "expiry_changed";
    }
    if (changes.length) {
      await storage.logMembershipAction({
        subscriptionId: id,
        customerId: sub.customerId,
        action: action ?? "updated",
        staffUsername: staffUser,
        note: changes.join("; "),
      }).catch((e) => console.warn("[MEMBERSHIP] audit log write failed:", e?.message ?? e));
    }

    res.json(updated);
  });

  // Data deletion page — required by Apple App Store & Google Play
  app.get("/delete-account", (_req, res) => {
    const pagePath = path.resolve(process.cwd(), "server", "templates", "delete-account.html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    try {
      const html = fs.readFileSync(pagePath, "utf-8");
      res.send(html);
    } catch (err) {
      res.status(500).send("Page unavailable");
    }
  });

  // ── Subject Access Request (SAR) — Article 15 UK GDPR ───────────────────────
  app.post("/api/admin/sar", staffAuth, managerAuth, async (req, res) => {
    const { email } = req.body ?? {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ message: "A valid email address is required." });
    }
    const normalised = email.trim().toLowerCase();

    // Gather all data held for this person
    const [customer, bookings, pushTokens, orders, allMessages] = await Promise.all([
      storage.getCustomerByEmail(normalised),
      storage.getBookingsByEmail(normalised),
      storage.getPushTokensByEmail(normalised),
      storage.getCustomerOrders(normalised),
      storage.getContactMessages(),
    ]);

    // Contact messages are encrypted — filter by matching email after decryption
    const contactMessages = allMessages.filter(m => m.email.toLowerCase() === normalised);

    const report = {
      generatedAt: new Date().toISOString(),
      subjectEmail: normalised,
      customerAccount: customer ? {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone ?? null,
        createdAt: customer.createdAt,
        privacyConsentAt: customer.privacyConsentAt ?? null,
      } : null,
      bookings: bookings.map(b => ({
        id: b.id,
        date: b.date,
        startTime: b.startTime,
        tableNumber: b.tableNumber,
        status: b.status,
        createdAt: b.createdAt,
      })),
      contactMessages: contactMessages.map(m => ({
        id: m.id,
        subject: m.subject,
        message: m.message,
        createdAt: m.createdAt,
        status: m.status,
      })),
      pushTokens: pushTokens.map(t => ({
        platform: t.platform,
        deviceName: t.deviceName,
        createdAt: t.createdAt,
      })),
      orders: orders.map(o => ({
        id: o.id,
        totalPence: o.totalPence,
        status: o.status,
        createdAt: o.createdAt,
      })),
    };
    res.json(report);
  });

  // Step 1: Public deletion request — sends a confirmation email with a signed token.
  // Does NOT delete any data immediately; the caller must click the link in the email.
  app.post("/api/request-deletion", async (req, res) => {
    const clientIp = getClientIp(req);

    // Enforce per-IP rate limit to prevent abuse
    const now = Date.now();
    const attempt = deletionRequestAttempts.get(clientIp) ?? { count: 0, resetAt: now + DELETION_REQUEST_WINDOW };
    if (now > attempt.resetAt) {
      attempt.count = 0;
      attempt.resetAt = now + DELETION_REQUEST_WINDOW;
    }
    attempt.count += 1;
    deletionRequestAttempts.set(clientIp, attempt);
    if (attempt.count > DELETION_REQUEST_LIMIT) {
      return res.status(429).json({ message: "Too many deletion requests. Please try again later." });
    }

    const { email } = req.body ?? {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ message: "A valid email address is required." });
    }
    const normalised = email.trim().toLowerCase();

    // Only proceed if an account actually exists for this email — prevents harvesting confirmation
    // of whether arbitrary emails are registered. We still send a generic response either way.
    const customer = await storage.getCustomerByEmail(normalised);
    if (customer) {
      // Generate a cryptographically random one-time token valid for 1 hour
      const tokenRaw = randomBytes(32).toString("hex");

      // Expire any previous pending token for this email first
      for (const [t, v] of pendingDeletionTokens) {
        if (v.email === normalised) pendingDeletionTokens.delete(t);
      }
      pendingDeletionTokens.set(tokenRaw, { email: normalised, expiresAt: now + 60 * 60 * 1000 });

      // Build the confirmation URL from the configured canonical origin — never from request headers
      const confirmUrl = `${getPublicAppOrigin()}/api/confirm-deletion?token=${tokenRaw}`;

      const html = `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
          <h2 style="color:#0b1120;">Confirm Account Deletion — The 147</h2>
          <p style="color:#444;line-height:1.6;">We received a request to permanently delete all data associated with <strong>${normalised}</strong>.</p>
          <p style="color:#444;line-height:1.6;">To confirm and complete the deletion, click the button below. This link expires in <strong>1 hour</strong> and can only be used once.</p>
          <a href="${confirmUrl}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#8B0000;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">Confirm Deletion</a>
          <p style="color:#888;font-size:13px;">If you did not request this, you can safely ignore this email — no data will be deleted.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:28px 0;" />
          <p style="color:#bbb;font-size:12px;">The 147 Snooker Club, Bradford</p>
        </div>`;

      await sendEmailViaSMTP(normalised, "Confirm your data deletion request — The 147", html);
    }

    // Always return the same response to avoid leaking whether an account exists
    res.json({ success: true, message: "If an account exists for that email address, a confirmation link has been sent. Please check your inbox." });
  });

  // Step 2a: GET — show a confirmation page so mailbox link-scanners cannot accidentally trigger deletion.
  // The user must click the "Confirm" button which sends a POST to actually perform the erasure.
  app.get("/api/confirm-deletion", (req, res) => {
    const tokenRaw = String(req.query.token ?? "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    const renderError = (message: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Link Invalid — The 147</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f5f5f7;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#fff;border-radius:16px;padding:40px 36px;max-width:480px;width:100%;margin:24px;box-shadow:0 2px 20px rgba(0,0,0,.07);text-align:center}
.icon{font-size:3rem;margin-bottom:16px}.h{font-size:1.25rem;font-weight:700;color:#8B0000;margin-bottom:12px}
p{color:#555;font-size:.95rem;line-height:1.6}a{color:#8B0000;text-decoration:none}</style></head>
<body><div class="card"><div class="icon">❌</div><div class="h">Link Invalid or Expired</div>
<p>${message}</p><p style="margin-top:16px"><a href="/delete-account">Request a new deletion link</a></p>
</div></body></html>`;

    if (!tokenRaw) {
      return res.status(400).send(renderError("No token provided. Please use the link from your confirmation email."));
    }

    const entry = pendingDeletionTokens.get(tokenRaw);
    if (!entry || Date.now() > entry.expiresAt) {
      return res.status(400).send(renderError("This link has already been used or has expired. Please submit a new deletion request."));
    }

    // Token is valid — show a confirmation page. Deletion only happens on POST.
    const safeToken = tokenRaw.replace(/[^a-f0-9]/gi, "");
    res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Confirm Data Deletion — The 147</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f5f5f7;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#fff;border-radius:16px;padding:40px 36px;max-width:480px;width:100%;margin:24px;box-shadow:0 2px 20px rgba(0,0,0,.07);text-align:center}
.icon{font-size:3rem;margin-bottom:16px}.h{font-size:1.25rem;font-weight:700;color:#0b1120;margin-bottom:12px}
p{color:#555;font-size:.95rem;line-height:1.6;margin-bottom:20px}
.warn{background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 14px;font-size:.875rem;color:#7a5c00;margin-bottom:24px}
button{width:100%;padding:14px;background:#8B0000;color:#fff;border:none;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer}
button:hover{opacity:.85}button:disabled{opacity:.5;cursor:not-allowed}a{color:#8B0000;text-decoration:none}</style></head>
<body><div class="card"><div class="icon">⚠️</div><div class="h">Confirm Data Deletion</div>
<p>You are about to permanently delete all personal data associated with your account. This cannot be undone.</p>
<div class="warn">This will delete your account, booking history, order history, push notification preferences, and contact messages.</div>
<form method="POST" action="/api/confirm-deletion">
  <input type="hidden" name="token" value="${safeToken}" />
  <button type="submit" id="btn">Permanently Delete My Data</button>
</form>
<p style="margin-top:16px;font-size:.85rem;color:#888"><a href="/delete-account">Cancel — go back</a></p>
</div></body></html>`);
  });

  // Step 2b: POST — user explicitly confirmed on the page above; now perform the erasure.
  app.post("/api/confirm-deletion", async (req, res) => {
    const tokenRaw = String(req.body?.token ?? "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    const renderResult = (ok: boolean, message: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${ok ? "Data Deleted" : "Link Invalid"} — The 147</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f5f5f7;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#fff;border-radius:16px;padding:40px 36px;max-width:480px;width:100%;margin:24px;box-shadow:0 2px 20px rgba(0,0,0,.07);text-align:center}
.icon{font-size:3rem;margin-bottom:16px}.h{font-size:1.25rem;font-weight:700;color:${ok ? "#1a7c3e" : "#8B0000"};margin-bottom:12px}
p{color:#555;font-size:.95rem;line-height:1.6}a{color:#8B0000;text-decoration:none}</style></head>
<body><div class="card"><div class="icon">${ok ? "✅" : "❌"}</div>
<div class="h">${ok ? "Data Deleted" : "Link Invalid or Expired"}</div>
<p>${message}</p>${ok ? '<p style="margin-top:12px;font-size:.85rem;color:#888;">This complies with your rights under the UK GDPR (Article 17).</p>' : '<p style="margin-top:16px"><a href="/delete-account">Request a new deletion link</a></p>'}
</div></body></html>`;

    if (!tokenRaw) {
      return res.status(400).send(renderResult(false, "No token provided."));
    }

    const entry = pendingDeletionTokens.get(tokenRaw);
    if (!entry || Date.now() > entry.expiresAt) {
      pendingDeletionTokens.delete(tokenRaw);
      return res.status(400).send(renderResult(false, "This link has already been used or has expired. Please submit a new deletion request."));
    }

    // Consume the token immediately to prevent replay
    pendingDeletionTokens.delete(tokenRaw);
    const { email } = entry;

    // Perform full erasure of all personal data categories
    await Promise.all([
      storage.deleteBookingsByEmail(email),
      storage.deletePushTokensByEmail(email),
      storage.deleteOrdersByEmail(email),
      storage.deleteContactMessagesByEmail(email),
    ]);
    const customer = await storage.getCustomerByEmail(email);
    if (customer) await storage.deleteCustomer(customer.id);

    res.send(renderResult(true, `All personal data associated with <strong>${email}</strong> has been permanently deleted from our systems.`));
  });

  // ════════════════════════════════════════════════════════════════════════════
  // STAFF HR MODULE
  // ════════════════════════════════════════════════════════════════════════════

  // ── Geofence settings ────────────────────────────────────────────────────────
  app.get("/api/hr/geofence", staffAuth, async (_req, res) => {
    const lat = await storage.getSetting("geofence_lat");
    const lng = await storage.getSetting("geofence_lng");
    const radius = await storage.getSetting("geofence_radius");
    res.json({ lat: lat ?? null, lng: lng ?? null, radius: radius ? Number(radius) : 200 });
  });

  app.put("/api/hr/geofence", staffAuth, managerAuth, async (req, res) => {
    const { lat, lng, radius } = req.body;
    if (!lat || !lng) return res.status(400).json({ message: "lat and lng are required" });
    await storage.setSetting("geofence_lat", String(lat));
    await storage.setSetting("geofence_lng", String(lng));
    await storage.setSetting("geofence_radius", String(radius ?? 200));
    res.json({ lat: String(lat), lng: String(lng), radius: Number(radius ?? 200) });
  });

  // ── Rotating venue clock code ─────────────────────────────────────────────────
  // A TOTP-style proof-of-on-site-presence control.
  //
  // The server generates a secret once and persists it in the settings table.
  // The current clock code is derived via HMAC-SHA256(secret, time_window) and
  // changes every 10 minutes. It is ONLY surfaced to managers (via the endpoint
  // below) so it can be displayed at the physical venue (on a screen, tablet,
  // or printed rotation sheet). Staff who are physically present can read the
  // code and enter it when clocking in or out; remote attackers who do not have
  // physical access to the venue cannot know the current code.
  //
  // This makes forged clock-in/out requests infeasible: an attacker needs both
  // a valid staff session AND the current rotating venue code, which changes
  // every 10 minutes and is not available via any staff-facing API.
  const VENUE_CODE_WINDOW_SECS = 600; // 10 minutes per code

  async function getVenueClockSecret(): Promise<string | null> {
    return storage.getSetting("venue_clock_secret");
  }

  async function ensureVenueClockSecret(): Promise<string> {
    const existing = await storage.getSetting("venue_clock_secret");
    if (existing) return existing;
    const secret = randomBytes(32).toString("hex");
    await storage.setSetting("venue_clock_secret", secret);
    return secret;
  }

  function deriveVenueCode(secret: string, window: number): string {
    // 6 uppercase hex characters — short enough to type easily, long enough
    // to prevent brute-force within the 10-minute validity window (16^6 ≈ 16M).
    return createHmac("sha256", secret)
      .update(`venue-clock:${window}`)
      .digest("hex")
      .slice(0, 6)
      .toUpperCase();
  }

  async function isValidVenueCode(submitted: string): Promise<boolean> {
    const secret = await getVenueClockSecret();
    if (!secret) return false; // Secret not yet initialised — manager must view code once to bootstrap.
    const currentWindow = Math.floor(Date.now() / (VENUE_CODE_WINDOW_SECS * 1000));
    // Accept the current window and the immediately previous one (avoids
    // rejecting legitimate staff who were typing right at a boundary).
    for (const w of [currentWindow, currentWindow - 1]) {
      const expected = deriveVenueCode(secret, w);
      const a = Buffer.from(submitted.toUpperCase().padEnd(6));
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    }
    return false;
  }

  // GET /api/hr/venue-clock-code — manager only
  // Returns the current rotating venue clock code plus the seconds until it
  // changes. This endpoint is manager-gated so the code is NOT accessible to
  // regular staff via the API — it must be read from a physical venue display.
  app.get("/api/hr/venue-clock-code", staffAuth, managerAuth, async (_req, res) => {
    const secret = await ensureVenueClockSecret();
    const currentWindow = Math.floor(Date.now() / (VENUE_CODE_WINDOW_SECS * 1000));
    const code = deriveVenueCode(secret, currentWindow);
    const nextChangeMs = (VENUE_CODE_WINDOW_SECS * 1000) - (Date.now() % (VENUE_CODE_WINDOW_SECS * 1000));
    res.json({
      code,
      windowSeconds: VENUE_CODE_WINDOW_SECS,
      nextChangeInSeconds: Math.ceil(nextChangeMs / 1000),
    });
  });

  // ── Clock in / out ───────────────────────────────────────────────────────────
  app.get("/api/hr/clock-status", staffAuth, async (req: any, res) => {
    const active = await storage.getActiveClockEntry(req.staffUser.id);
    res.json({ active: active ?? null });
  });

  // Server-side geofence enforcement + fraud-flag computation for
  // clock-in / clock-out.
  //
  // The client (app/staff-hr.tsx) does its own distance check before calling
  // these endpoints, but that is purely advisory — anyone with a valid staff
  // bearer token can craft a direct HTTP request and bypass it. The server
  // therefore:
  //   1. Issues a short-lived, single-use, staff-session-bound location token
  //      via POST /api/hr/location-token. The clock-in and clock-out endpoints
  //      require this token in the request body and consume it immediately,
  //      preventing static/replayed payloads and binding each clock event to a
  //      live interaction with the authenticated session.
  //   2. Runs a sanity-filter distance check against the configured geofence.
  //      Coordinates that are clearly wrong (far outside the radius) are
  //      rejected. However, this is NOT a security verification — the server
  //      has no independent way to confirm the coordinates came from the
  //      employee's real physical location. `geofenceEnforced` is therefore
  //      always set to FALSE for client-supplied coordinates; making it TRUE
  //      would be a false security claim.
  //   3. Stamps every entry with `client_location_unverified` in the flags so
  //      manager-facing HR views can surface these entries for manual review.
  //      Managers remain the authoritative approval step for attendance records.
  //   4. Records operational fraud-detection flags (no_mobile_ua,
  //      no_geofence_configured, identical_coords, impossible_travel) so
  //      attendance records carry an additional server-side risk signal.
  //
  // Returns null when the helper has already sent an error response; the
  // route should return immediately. Otherwise returns the cleaned coords
  // plus an audit envelope to persist alongside the time entry.
  type GeofenceAudit = {
    geofenceEnforced: boolean;
    flags: string[];
    // true when location is client-supplied and cannot be independently
    // verified by the server — entry must be approved by a manager before
    // being treated as an authoritative attendance record.
    needsManagerReview: boolean;
  };

  // In-memory store for pending location tokens.
  // token hex string → { staffId, expiresAt (epoch ms) }
  // Tokens are single-use: they are deleted the moment they are validated.
  // The process-local Map is sufficient for a single-server deployment; for
  // horizontally-scaled deployments, replace with a shared cache (e.g. Redis).
  const locationTokens = new Map<string, { staffId: number; expiresAt: number }>();
  const LOCATION_TOKEN_TTL_MS = 60_000; // 60 seconds — enough for GPS + network

  // Prune tokens that have already expired to prevent unbounded Map growth.
  function pruneExpiredLocationTokens(): void {
    const now = Date.now();
    for (const [tok, data] of locationTokens) {
      if (data.expiresAt < now) locationTokens.delete(tok);
    }
  }

  // POST /api/hr/location-token
  // Issues a short-lived, single-use nonce that the mobile client must include
  // in its clock-in / clock-out request. The token is cryptographically random,
  // tied to the authenticated staff session, and expires after 60 seconds.
  // This means a scripted direct-HTTP attacker cannot replay a static payload —
  // they must obtain a fresh token from within an active, authenticated session
  // immediately before submitting coordinates.
  app.post("/api/hr/location-token", staffAuth, (req: any, res) => {
    pruneExpiredLocationTokens();
    const token = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + LOCATION_TOKEN_TTL_MS;
    locationTokens.set(token, { staffId: req.staffUser.id, expiresAt });
    res.json({ token, expiresAt: new Date(expiresAt).toISOString() });
  });

  function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  async function enforceGeofenceOrRespond(
    req: any,
    res: any,
  ): Promise<{ lat: string; lng: string; audit: GeofenceAudit } | null> {
    const cfgLat = await storage.getSetting("geofence_lat");
    const cfgLng = await storage.getSetting("geofence_lng");
    const cfgRadius = await storage.getSetting("geofence_radius");
    const flags: string[] = [];

    // ── Rotating venue clock code validation ─────────────────────────────────
    // The server generates a HMAC-SHA256-derived code that rotates every 10
    // minutes. It is surfaced ONLY to managers (GET /api/hr/venue-clock-code)
    // so that it can be displayed at the physical venue — on a screen, tablet,
    // or rotation sheet — but is NEVER available via any staff-facing API.
    //
    // Staff who are physically present can read the code and include it in
    // their clock request. A remote attacker holding a valid staff bearer token
    // cannot know the code without physical access to the venue, making forged
    // clock-in/out requests infeasible regardless of what coordinates they supply.
    //
    // If no venue clock secret exists yet (first boot before any manager has
    // viewed the code page) we reject all clock requests: fail closed rather
    // than granting unchecked access while the control is uninitialised.
    const { lat, lng, locationToken, venueCode } = req.body || {};

    const clockSecret = await getVenueClockSecret();
    if (!clockSecret) {
      // Secret has not been initialised — a manager must visit the venue clock
      // code page at least once to bootstrap it.
      res.status(503).json({
        message: "Attendance clock is not yet configured. A manager must open the venue clock code display to activate it.",
        code: "VENUE_CODE_NOT_CONFIGURED",
      });
      return null;
    }
    if (!venueCode || typeof venueCode !== "string" || venueCode.trim().length === 0) {
      res.status(400).json({
        message: "A venue clock code is required. Please enter the code displayed at the venue reception.",
        code: "VENUE_CODE_REQUIRED",
      });
      return null;
    }
    const venueCodeValid = await isValidVenueCode(venueCode.trim());
    if (!venueCodeValid) {
      flags.push("venue_code_invalid");
      res.status(403).json({
        message: "The venue code you entered is incorrect or has expired. Please check the display at the venue reception and try again.",
        code: "VENUE_CODE_INVALID",
      });
      return null;
    }
    flags.push("venue_code_verified");

    // ── Anti-replay location token validation ────────────────────────────────
    // Each clock-in / clock-out must also include a server-issued, single-use,
    // time-limited location token. This is a defence-in-depth control that
    // prevents replay of previously-captured valid payloads (which would
    // include a correct venue code for that window). Together with the rotating
    // venue code, this makes scripted replay attacks unfeasible even if an
    // attacker captures a complete valid request.
    const tokenKey = String(locationToken ?? "");
    const tokenData = locationTokens.get(tokenKey);
    if (!tokenData) {
      res.status(400).json({ message: "A valid location token is required. Please try again from the app." });
      return null;
    }
    if (tokenData.staffId !== req.staffUser.id) {
      locationTokens.delete(tokenKey);
      res.status(403).json({ message: "Location token does not match your session. Please try again." });
      return null;
    }
    if (tokenData.expiresAt < Date.now()) {
      locationTokens.delete(tokenKey);
      res.status(400).json({ message: "Your location verification has expired. Please try clocking in again." });
      return null;
    }
    // Consume the token immediately — single use only.
    locationTokens.delete(tokenKey);

    // User-agent heuristic — advisory flag only.
    const ua: string = String(req.headers?.["user-agent"] ?? "");
    const looksMobile = /(Expo|okhttp|CFNetwork|iPhone|iPad|Android|Mobile|Darwin)/i.test(ua);
    if (!looksMobile) flags.push("no_mobile_ua");

    // Geofence not configured → still allow clock-in (venue code already
    // verified physical presence) but mark entry as needing manager review
    // because location coordinates are entirely unverified.
    if (!cfgLat && !cfgLng) {
      flags.push("no_geofence_configured");
      flags.push("client_location_unverified");
      return {
        lat: lat ? String(lat) : "",
        lng: lng ? String(lng) : "",
        audit: { geofenceEnforced: false, needsManagerReview: true, flags },
      };
    }
    if (!cfgLat || !cfgLng) {
      res.status(500).json({ message: "Venue geofence is misconfigured (missing latitude or longitude). Please contact a manager." });
      return null;
    }
    const venueLat = parseFloat(cfgLat);
    const venueLng = parseFloat(cfgLng);
    const radiusM = cfgRadius ? Number(cfgRadius) : 200;
    if (!Number.isFinite(venueLat) || !Number.isFinite(venueLng) || !Number.isFinite(radiusM)) {
      res.status(500).json({ message: "Venue geofence is misconfigured. Please contact a manager." });
      return null;
    }
    const userLat = parseFloat(String(lat ?? ""));
    const userLng = parseFloat(String(lng ?? ""));
    if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) {
      res.status(400).json({ message: "Location is required to clock in or out. Please enable location services and try again." });
      return null;
    }
    if (userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) {
      res.status(400).json({ message: "Invalid GPS coordinates supplied." });
      return null;
    }
    const distM = haversineM(venueLat, venueLng, userLat, userLng);
    if (distM > radiusM) {
      res.status(403).json({
        message: `You must be within ${radiusM}m of the venue to clock in or out. You are currently ${Math.round(distM)}m away. If you believe this is an error, please speak to your manager.`,
        distanceM: Math.round(distM),
        radiusM,
      });
      return null;
    }
    // Coordinates passed the distance sanity filter. The server still cannot
    // independently verify they are real — GPS remains advisory. The venue code
    // above is the primary proof-of-presence; manager review remains mandatory.
    flags.push("client_location_unverified");
    return {
      lat: String(userLat),
      lng: String(userLng),
      audit: { geofenceEnforced: false, needsManagerReview: true, flags },
    };
  }

  // Compare new clock coords against the staff member's previous entry to
  // surface tamper signals (identical-jitter coords, impossible-travel speed).
  async function computeAnomalyFlags(
    staffId: number,
    newLat: string,
    newLng: string,
  ): Promise<string[]> {
    if (!newLat || !newLng) return [];
    const flags: string[] = [];
    const recent = await storage.getTimeEntriesForStaff(staffId, 1);
    const prev = recent[0];
    if (!prev) return flags;
    // Pick the most recent reference coords + timestamp from the prior entry.
    const prevLat = prev.clockOutLat ?? prev.clockInLat;
    const prevLng = prev.clockOutLng ?? prev.clockInLng;
    const prevAtRaw = prev.clockedOutAt ?? prev.clockedInAt;
    if (!prevLat || !prevLng || !prevAtRaw) return flags;
    if (prevLat === newLat && prevLng === newLng) {
      // Real GPS readings always have some jitter even when the device hasn't
      // physically moved; identical strings strongly suggest a scripted call.
      flags.push("identical_coords");
    }
    const a = parseFloat(prevLat);
    const b = parseFloat(prevLng);
    const c = parseFloat(newLat);
    const d = parseFloat(newLng);
    if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d)) {
      const distM = haversineM(a, b, c, d);
      const ms = Date.now() - new Date(prevAtRaw).getTime();
      if (ms > 0) {
        const speedKph = (distM / 1000) / (ms / 3_600_000);
        // 200 km/h is faster than any realistic ground transport between
        // clock events; aircraft would generally produce gaps measured in
        // hours, not minutes, and this venue is single-site.
        if (speedKph > 200) flags.push("impossible_travel");
      }
    }
    return flags;
  }

  app.post("/api/hr/clock-in", staffAuth, async (req: any, res) => {
    const existing = await storage.getActiveClockEntry(req.staffUser.id);
    if (existing) return res.status(409).json({ message: "Already clocked in" });
    const result = await enforceGeofenceOrRespond(req, res);
    if (!result) return;
    const anomaly = await computeAnomalyFlags(req.staffUser.id, result.lat, result.lng);
    const flags = [...result.audit.flags, ...anomaly];
    try {
      const entry = await storage.clockIn(
        req.staffUser.id,
        result.lat || undefined,
        result.lng || undefined,
        {
          geofenceEnforced: result.audit.geofenceEnforced,
          flags,
          clientIp: String(req.ip ?? "").slice(0, 64) || undefined,
          userAgent: String(req.headers?.["user-agent"] ?? "").slice(0, 256) || undefined,
          needsManagerReview: result.audit.needsManagerReview,
        },
      );
      res.status(201).json(entry);
    } catch (err: any) {
      // Partial unique index "staff_time_entries_active_uniq" rejects a
      // second concurrent insert — surface as the same 409 the precheck
      // would have returned, so we don't get duplicate active shifts.
      const msg = String(err?.message ?? "");
      if (err?.code === "23505" || /staff_time_entries_active_uniq|duplicate key/i.test(msg)) {
        return res.status(409).json({ message: "Already clocked in" });
      }
      throw err;
    }
  });

  app.post("/api/hr/clock-out", staffAuth, async (req: any, res) => {
    const active = await storage.getActiveClockEntry(req.staffUser.id);
    if (!active) return res.status(404).json({ message: "No active clock-in found" });
    const result = await enforceGeofenceOrRespond(req, res);
    if (!result) return;
    // For impossible-travel on clock-out, compare against THIS shift's
    // clock-in coords (the most relevant reference point).
    const flags = [...result.audit.flags];
    if (active.clockInLat && active.clockInLng && result.lat && result.lng) {
      if (active.clockInLat === result.lat && active.clockInLng === result.lng) {
        flags.push("identical_coords");
      }
      const a = parseFloat(active.clockInLat);
      const b = parseFloat(active.clockInLng);
      const c = parseFloat(result.lat);
      const d = parseFloat(result.lng);
      if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d)) {
        const distM = haversineM(a, b, c, d);
        const ms = Date.now() - new Date(active.clockedInAt).getTime();
        if (ms > 0) {
          const speedKph = (distM / 1000) / (ms / 3_600_000);
          if (speedKph > 200) flags.push("impossible_travel");
        }
      }
    }
    const entry = await storage.clockOut(
      active.id,
      result.lat || undefined,
      result.lng || undefined,
      { geofenceEnforced: result.audit.geofenceEnforced, flags, needsManagerReview: result.audit.needsManagerReview },
    );
    // clockOut's WHERE includes status='active' — if a concurrent request
    // already finalised this shift it returns null, and we surface that as
    // 409 rather than letting the second clock-out silently overwrite the
    // first one's flags.
    if (!entry) return res.status(409).json({ message: "Shift was already clocked out" });
    res.json(entry);
  });

  app.get("/api/hr/time-entries", staffAuth, async (req: any, res) => {
    const entries = await storage.getTimeEntriesForStaff(req.staffUser.id);
    res.json(entries);
  });

  app.get("/api/hr/time-entries/all", staffAuth, managerAuth, async (req: any, res) => {
    const entries = await storage.getAllTimeEntries();
    const users = await storage.getAllStaffUsers();
    const userMap = Object.fromEntries(users.map((u: any) => [u.id, u.displayName || u.username]));
    const enriched = entries.map((e: any) => ({ ...e, staffName: userMap[e.staffId] || `Staff #${e.staffId}` }));
    // By default this endpoint returns ONLY manager-approved (authoritative)
    // entries so that reporting, payroll, and rota consumers cannot accidentally
    // treat unreviewed advisory records as facts. Callers that need the full
    // audit view (e.g. the pending-review queue UI) must pass
    // ?includeUnreviewed=true — an explicit, intentional opt-in.
    const includeUnreviewed = req.query.includeUnreviewed === "true";
    const result = includeUnreviewed
      ? enriched
      : enriched.filter((e: any) => !e.needsManagerReview);
    res.json(result);
  });

  // Dedicated manager endpoint to fetch only entries awaiting review.
  // Returns completed entries where location was client-supplied and a
  // manager has not yet approved them. Use PATCH /api/hr/time-entries/:id/review
  // to approve each entry and remove it from this queue.
  app.get("/api/hr/time-entries/pending-review", staffAuth, managerAuth, async (_req, res) => {
    const entries = await storage.getAllTimeEntries();
    const users = await storage.getAllStaffUsers();
    const userMap = Object.fromEntries(users.map((u: any) => [u.id, u.displayName || u.username]));
    const pending = entries
      .filter((e: any) => e.needsManagerReview && e.status !== "active")
      .map((e: any) => ({ ...e, staffName: userMap[e.staffId] || `Staff #${e.staffId}` }));
    res.json(pending);
  });

  // Manager review — clears the needsManagerReview flag on an attendance entry,
  // recording which manager approved it and when. Entries with unverified
  // client-supplied location are flagged at clock-in/out and must be explicitly
  // approved here before they are treated as authoritative for payroll purposes.
  app.patch("/api/hr/time-entries/:id/review", staffAuth, managerAuth, async (req: any, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid entry ID" });
    const entry = await storage.reviewTimeEntry(id, req.staffUser.id);
    if (!entry) return res.status(404).json({ message: "Entry not found" });
    res.json(entry);
  });

  app.patch("/api/hr/time-entries/:id/amend", staffAuth, managerAuth, async (req: any, res) => {
    const id = parseInt(req.params.id);
    const { reason, clockedInAt, clockedOutAt } = req.body;
    if (!reason) return res.status(400).json({ message: "Amendment reason required" });
    const updates: any = {};
    if (clockedInAt) updates.clockedInAt = new Date(clockedInAt);
    if (clockedOutAt) updates.clockedOutAt = new Date(clockedOutAt);
    const entry = await storage.amendTimeEntry(id, req.staffUser.id, reason, updates);
    if (!entry) return res.status(404).json({ message: "Entry not found" });
    res.json(entry);
  });

  // ── Staff documents ───────────────────────────────────────────────────────────

  // List documents for a staff member (no file data — metadata only)
  app.get("/api/hr/staff/:id/documents", staffAuth, managerAuth, async (req, res) => {
    const staffId = parseInt(req.params.id as string);
    const docs = await storage.getDocumentsForStaff(staffId);
    res.json(docs);
  });

  // Download a specific document (returns base64 fileData)
  app.get("/api/hr/documents/:id/download", staffAuth, managerAuth, async (req, res) => {
    const doc = await storage.getDocumentById(parseInt(req.params.id as string));
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.json(doc);
  });

  // Upload a document to a staff profile
  app.post("/api/hr/staff/:id/documents", staffAuth, managerAuth, async (req: any, res) => {
    const staffId = parseInt(req.params.id);
    const { category, fileName, fileType, fileData, fileSizeBytes, notes, expiresAt } = req.body;
    if (!fileName || !fileType || !fileData || !fileSizeBytes) {
      return res.status(400).json({ message: "fileName, fileType, fileData and fileSizeBytes are required" });
    }
    if (fileSizeBytes > 10 * 1024 * 1024) {
      return res.status(400).json({ message: "File too large — maximum 10 MB" });
    }
    const doc = await storage.uploadDocument({
      staffId, uploadedBy: req.staffUser.id,
      category: category || "other",
      fileName, fileType, fileData, fileSizeBytes,
      notes: notes || undefined,
      expiresAt: expiresAt || undefined,
    });
    res.status(201).json({ id: doc.id, fileName: doc.fileName, category: doc.category, createdAt: doc.createdAt });
  });

  // Delete a document
  app.delete("/api/hr/documents/:id", staffAuth, managerAuth, async (req, res) => {
    const deleted = await storage.deleteDocument(parseInt(req.params.id as string));
    if (!deleted) return res.status(404).json({ message: "Document not found" });
    res.json({ success: true });
  });

  // All documents across all staff (manager overview)
  app.get("/api/hr/documents", staffAuth, managerAuth, async (_req, res) => {
    const docs = await storage.getAllDocuments();
    res.json(docs);
  });

  // ── Staff onboarding ──────────────────────────────────────────────────────────

  // Staff: get own onboarding record
  app.get("/api/hr/onboarding/mine", staffAuth, async (req: any, res) => {
    const record = await storage.getOnboarding(req.staffUser.id);
    res.json(record ?? null);
  });

  // Staff: save/update own onboarding record
  app.put("/api/hr/onboarding/mine", staffAuth, async (req: any, res) => {
    const {
      emergencyName, emergencyPhone, emergencyRelation,
      nationalInsurance, starterDeclaration, taxCode,
      bankAccountName, bankSortCode, bankAccountNumber,
      rightToWorkType, rightToWorkExpiry, markComplete,
    } = req.body;

    const data: any = {
      emergencyName, emergencyPhone, emergencyRelation,
      nationalInsurance, starterDeclaration, taxCode,
      bankAccountName, bankSortCode, bankAccountNumber,
      rightToWorkType, rightToWorkExpiry,
    };
    if (markComplete) data.completedAt = new Date();

    const record = await storage.upsertOnboarding(req.staffUser.id, data);
    res.json(record);
  });

  // Manager: view a staff member's onboarding record
  app.get("/api/hr/staff/:id/onboarding", staffAuth, managerAuth, async (req, res) => {
    const record = await storage.getOnboarding(parseInt(req.params.id as string));
    res.json(record ?? null);
  });

  // Manager: see completion status for all staff
  app.get("/api/hr/onboarding/status", staffAuth, managerAuth, async (_req, res) => {
    const statuses = await storage.getAllOnboardingStatus();
    res.json(statuses);
  });

  // ── Bank holidays (England & Wales) ──────────────────────────────────────────
  app.get("/api/hr/bank-holidays", staffAuth, (req, res) => {
    const year = parseInt(String(req.query.year || new Date().getFullYear()));
    const holidays = getEnglandWalesBankHolidays(year);
    res.json({ year, holidays });
  });

  // ── Leave requests ───────────────────────────────────────────────────────────
  app.post("/api/hr/leave-requests", staffAuth, async (req: any, res) => {
    const { leaveType, startDate, endDate, reason } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate are required" });

    // Server-side working day calculation — never trust client-submitted totalDays
    const calculatedDays = countWorkingDays(startDate, endDate);
    if (calculatedDays <= 0) {
      return res.status(400).json({ message: "No working days found in the selected date range (weekends and bank holidays are excluded)" });
    }

    const leaveReq = await storage.createLeaveRequest({
      staffId: req.staffUser.id,
      leaveType: leaveType || "annual",
      startDate,
      endDate,
      totalDays: String(calculatedDays),
      reason,
    });
    res.status(201).json(leaveReq);
  });

  // Preview working days for a date range (used by frontend before submitting)
  app.get("/api/hr/leave-preview", staffAuth, (req, res) => {
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const days = countWorkingDays(startDate, endDate);
    res.json({ workingDays: days });
  });

  app.get("/api/hr/leave-requests", staffAuth, async (req: any, res) => {
    const requests = await storage.getLeaveRequestsForStaff(req.staffUser.id);
    res.json(requests);
  });

  app.get("/api/hr/leave-requests/all", staffAuth, managerAuth, async (_req, res) => {
    const requests = await storage.getAllLeaveRequests();
    const users = await storage.getAllStaffUsers();
    const userMap = Object.fromEntries(users.map((u: any) => [u.id, u.displayName || u.username]));
    const enriched = requests.map((r: any) => ({ ...r, staffName: userMap[r.staffId] || `Staff #${r.staffId}` }));
    res.json(enriched);
  });

  app.patch("/api/hr/leave-requests/:id/review", staffAuth, managerAuth, async (req: any, res) => {
    const id = parseInt(req.params.id);
    const { status, reviewNotes } = req.body;
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ message: "status must be approved or rejected" });
    const updated = await storage.reviewLeaveRequest(id, req.staffUser.id, status, reviewNotes);
    if (!updated) return res.status(404).json({ message: "Leave request not found" });
    res.json(updated);
  });

  // ── Leave allowances ─────────────────────────────────────────────────────────
  app.get("/api/hr/leave-allowance", staffAuth, async (req: any, res) => {
    const staffUser = req.staffUser;
    if (!staffUser?.id) return res.status(403).json({ message: "Leave allowance not available for system sessions" });
    const contractedDaysPerWeek = parseFloat(staffUser.contractedDaysPerWeek ?? "5");
    const employmentStartDate = staffUser.employmentStartDate ?? null;

    // Get or initialise allowance record
    const today = new Date();
    // We need the leave year start to determine the leave year — use stored value if available
    let allowance = await storage.getLeaveAllowance(staffUser.id, today.getFullYear());
    const leaveYearStart = allowance?.leaveYearStart ?? "01-01";
    const maxCarryOverDays = parseFloat(allowance?.maxCarryOverDays ?? "8");

    // Determine the leave year bounds and the leave year identifier
    const { yearStart, yearEnd, leaveYear } = calculateLeaveYearBounds(leaveYearStart, today);

    // Calculate pro-rata entitlement
    const { fullEntitlement, actualEntitlement, isProRata, monthsAccrued } = calculateProRataEntitlement(
      contractedDaysPerWeek, employmentStartDate, leaveYearStart, today
    );

    if (!allowance) {
      // Auto-initialise with the pro-rata entitlement
      allowance = await storage.upsertLeaveAllowance(
        staffUser.id, leaveYear, String(actualEntitlement), "0", leaveYearStart, "8"
      );
    }

    // Apply carry-over cap (UK law: max 8 days discretionary, max 20 if sick/family)
    const rawCarryOver = parseFloat(allowance.carryOver ?? "0");
    const cappedCarryOver = applyCarryOverCap(rawCarryOver, maxCarryOverDays);

    // Total entitlement = pro-rata + capped carry-over
    const totalEntitlement = parseFloat(allowance.totalDays) + cappedCarryOver;

    // Fetch all leave requests for this staff member within the current leave year
    const allRequests = await storage.getLeaveRequestsForStaff(staffUser.id);
    const yearRequests = allRequests.filter((r: any) =>
      r.startDate >= yearStart.toISOString().slice(0, 10) &&
      r.startDate <= yearEnd.toISOString().slice(0, 10)
    );

    // CRITICAL: only annual leave deducts from entitlement (UK law — sick/unpaid are separate)
    const annualLeaveUsed = yearRequests
      .filter((r: any) => r.status === "approved" && r.leaveType === "annual")
      .reduce((sum: number, r: any) => sum + parseFloat(r.totalDays || "0"), 0);

    const sickDaysThisYear = yearRequests
      .filter((r: any) => r.status === "approved" && r.leaveType === "sick")
      .reduce((sum: number, r: any) => sum + parseFloat(r.totalDays || "0"), 0);

    const unpaidDaysThisYear = yearRequests
      .filter((r: any) => r.status === "approved" && r.leaveType === "unpaid")
      .reduce((sum: number, r: any) => sum + parseFloat(r.totalDays || "0"), 0);

    const pendingAnnualDays = yearRequests
      .filter((r: any) => r.status === "pending" && r.leaveType === "annual")
      .reduce((sum: number, r: any) => sum + parseFloat(r.totalDays || "0"), 0);

    res.json({
      allowance,
      // Entitlement breakdown
      contractedDaysPerWeek,
      fullEntitlement,
      actualEntitlement: parseFloat(allowance.totalDays), // the stored (possibly manager-overridden) value
      isProRata,
      monthsAccrued,
      carryOver: cappedCarryOver,
      carryOverCapped: cappedCarryOver < rawCarryOver,
      totalEntitlement,
      // Usage — annual only counts against balance
      annualLeaveUsed,
      sickDaysThisYear,
      unpaidDaysThisYear,
      pendingAnnualDays,
      remaining: totalEntitlement - annualLeaveUsed,
      // Leave year info
      leaveYearStart: allowance.leaveYearStart,
      leaveYearLabel: `${yearStart.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${yearEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
    });
  });

  app.put("/api/hr/leave-allowance/:staffId", staffAuth, managerAuth, async (req, res) => {
    const staffId = parseInt(String(req.params.staffId));
    const { year, totalDays, carryOver, leaveYearStart, maxCarryOverDays } = req.body;
    const allowance = await storage.upsertLeaveAllowance(
      staffId,
      year || new Date().getFullYear(),
      String(totalDays ?? "28"),
      String(carryOver ?? "0"),
      leaveYearStart,
      maxCarryOverDays !== undefined ? String(maxCarryOverDays) : undefined,
    );
    res.json(allowance);
  });

  // Update a staff member's contracted hours and employment start date (for pro-rata)
  app.put("/api/hr/staff/:staffId/employment", staffAuth, managerAuth, async (req, res) => {
    const staffId = parseInt(String(req.params.staffId));
    const { contractedDaysPerWeek, employmentStartDate } = req.body;
    if (contractedDaysPerWeek === undefined) return res.status(400).json({ message: "contractedDaysPerWeek is required" });
    const days = parseFloat(String(contractedDaysPerWeek));
    if (isNaN(days) || days <= 0 || days > 7) return res.status(400).json({ message: "contractedDaysPerWeek must be between 0.5 and 7" });
    const updated = await storage.updateStaffEmployment(staffId, String(days), employmentStartDate || null);
    if (!updated) return res.status(404).json({ message: "Staff member not found" });
    res.json(updated);
  });

  app.get("/api/hr/leave-allowances/all", staffAuth, managerAuth, async (req, res) => {
    const year = parseInt(String(req.query.year || new Date().getFullYear()));
    const allowances = await storage.getAllLeaveAllowances(year);
    const users = await storage.getAllStaffUsers();
    const userMap = Object.fromEntries(users.map((u: any) => [u.id, u.displayName || u.username]));
    const enriched = allowances.map((a: any) => ({ ...a, staffName: userMap[a.staffId] || `Staff #${a.staffId}` }));
    res.json(enriched);
  });

  // ── Incident reports ─────────────────────────────────────────────────────────
  app.post("/api/hr/incidents", staffAuth, async (req: any, res) => {
    const { incidentDate, location, description, injuryType, personsInvolved, witnessNames, actionTaken } = req.body;
    if (!incidentDate || !location || !description) return res.status(400).json({ message: "incidentDate, location, description required" });
    const incident = await storage.createIncident({
      reportedBy: req.staffUser.id,
      incidentDate, location, description,
      injuryType: injuryType ?? null,
      personsInvolved: personsInvolved ?? null,
      witnessNames: witnessNames ?? null,
      actionTaken: actionTaken ?? null,
      reportedToManager: true,
      status: "open",
    });
    res.status(201).json(incident);
  });

  app.get("/api/hr/incidents", staffAuth, async (req: any, res) => {
    const isManager = req.staffUser.role === "manager" || req.staffUser.role === "owner";
    if (isManager) {
      const incidents = await storage.getAllIncidents();
      const users = await storage.getAllStaffUsers();
      const userMap = Object.fromEntries(users.map((u: any) => [u.id, u.displayName || u.username]));
      const enriched = incidents.map((i: any) => ({ ...i, reportedByName: userMap[i.reportedBy] || `Staff #${i.reportedBy}` }));
      return res.json(enriched);
    }
    const incidents = await storage.getIncidentsForStaff(req.staffUser.id);
    res.json(incidents);
  });

  app.patch("/api/hr/incidents/:id/status", staffAuth, managerAuth, async (req: any, res) => {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!["open", "under_review", "closed"].includes(status)) return res.status(400).json({ message: "Invalid status" });
    const incident = await storage.updateIncidentStatus(id, status, req.staffUser.id);
    if (!incident) return res.status(404).json({ message: "Incident not found" });
    res.json(incident);
  });

  // ── GDPR: staff data export & deletion ───────────────────────────────────────
  app.get("/api/hr/my-data", staffAuth, async (req: any, res) => {
    const staffId = req.staffUser.id;
    const [timeEntries, leaveRequests, incidents] = await Promise.all([
      storage.getTimeEntriesForStaff(staffId),
      storage.getLeaveRequestsForStaff(staffId),
      storage.getIncidentsForStaff(staffId),
    ]);
    res.json({
      gdprNotice: "This is all personal data The 147 Bradford holds for your staff account under GDPR Article 15 (Right of Access).",
      retentionPolicy: "Employment records are retained for 6 years after the end of employment as required by UK employment law.",
      staffProfile: { id: req.staffUser.id, username: req.staffUser.username, displayName: req.staffUser.displayName, role: req.staffUser.role },
      timeEntries,
      leaveRequests,
      incidents,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // STAFF ROTA
  // ══════════════════════════════════════════════════════════════════════════════

  // Get rota for a week (with staff names and leave overlay)
  app.get("/api/hr/rota", staffAuth, managerAuth, async (req: any, res) => {
    const weekStart = String(req.query.weekStart || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return res.status(400).json({ message: "weekStart (YYYY-MM-DD) required" });
    }
    const [shifts, staffUsers, published] = await Promise.all([
      storage.getRotaShifts(weekStart),
      storage.getAllStaffUsers(),
      storage.getRotaPublished(weekStart),
    ]);
    // Get approved leave for this week
    const allLeave = await storage.getAllLeaveRequests();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const weekLeave = allLeave.filter((l: any) =>
      l.status === "approved" &&
      l.startDate <= weekEndStr &&
      l.endDate >= weekStart
    );
    const userMap = Object.fromEntries(staffUsers.map((u: any) => [u.id, { displayName: u.displayName || u.username, username: u.username, role: u.role, active: u.active }]));
    res.json({ shifts, staffUsers: staffUsers.filter((u: any) => u.active), userMap, weekLeave, published: published || null });
  });

  // Get my rota for a week (any authenticated staff)
  app.get("/api/hr/rota/my", staffAuth, async (req: any, res) => {
    const weekStart = String(req.query.weekStart || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !req.staffUser?.id) {
      return res.status(400).json({ message: "weekStart required and staff must be logged in" });
    }
    const shifts = await storage.getRotaShiftsForStaff(req.staffUser.id, weekStart);
    const published = await storage.getRotaPublished(weekStart);
    res.json({ shifts, published: published || null });
  });

  // Add or update a rota shift
  app.post("/api/hr/rota/shifts", staffAuth, managerAuth, async (req: any, res) => {
    const { staffId, weekStart, dayOfWeek, shiftStart, shiftEnd, role, notes, id } = req.body;
    if (!staffId || !weekStart || dayOfWeek === undefined || !shiftStart || !shiftEnd) {
      return res.status(400).json({ message: "staffId, weekStart, dayOfWeek, shiftStart, shiftEnd required" });
    }
    const shift = await storage.upsertRotaShift(
      { staffId: Number(staffId), weekStart, dayOfWeek: Number(dayOfWeek), shiftStart, shiftEnd, role: role || null, notes: notes || null },
      id ? Number(id) : undefined,
    );
    res.status(id ? 200 : 201).json(shift);
  });

  // Delete a rota shift
  app.delete("/api/hr/rota/shifts/:id", staffAuth, managerAuth, async (req: any, res) => {
    const id = parseInt(req.params.id);
    const deleted = await storage.deleteRotaShift(id);
    if (!deleted) return res.status(404).json({ message: "Shift not found" });
    res.status(204).send();
  });

  // Publish rota + send personalised push notifications to each staff member
  // who has shifts that week. Each person sees their own shifts on the lock screen.
  app.post("/api/hr/rota/publish", staffAuth, managerAuth, async (req: any, res) => {
    const { weekStart } = req.body;
    if (!weekStart) return res.status(400).json({ message: "weekStart required" });
    const publishedBy = req.staffUser?.username || null;
    const published = await storage.publishRota(weekStart, publishedBy);

    // Group shifts by staff member so each gets a tailored push body
    const shifts = await storage.getRotaShifts(weekStart);
    const shiftsByStaff = new Map<number, typeof shifts>();
    for (const s of shifts) {
      const list = shiftsByStaff.get(s.staffId) || [];
      list.push(s);
      shiftsByStaff.set(s.staffId, list);
    }

    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    function summariseShifts(staffShifts: typeof shifts): string {
      // Sort by day then start time
      const sorted = [...staffShifts].sort((a, b) =>
        a.dayOfWeek - b.dayOfWeek || a.shiftStart.localeCompare(b.shiftStart)
      );
      const parts = sorted.map(s => `${dayNames[s.dayOfWeek] ?? "?"} ${s.shiftStart}–${s.shiftEnd}`);
      let summary = parts.join(", ");
      // Lock-screen previews truncate around 150 chars — keep it tidy
      if (summary.length > 140) summary = summary.slice(0, 137) + "…";
      return summary;
    }

    const staffIds = [...shiftsByStaff.keys()];
    const tokens = await storage.getStaffPushTokens(staffIds);

    let notified = 0;
    if (tokens.length > 0) {
      const messages = tokens.map((t: any) => {
        const personShifts = shiftsByStaff.get(t.staffId) || [];
        const summary = summariseShifts(personShifts);
        const count = personShifts.length;
        const body = count === 1
          ? `You're working ${summary}. Tap to view.`
          : `Your ${count} shifts: ${summary}`;
        return {
          to: t.token,
          sound: "default" as const,
          title: "Your Rota Has Been Published",
          body,
        };
      });
      try {
        const r = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(messages),
        });
        const data = await r.json() as { data?: Array<{ status: string }> };
        notified = data.data?.filter(d => d.status === "ok").length ?? 0;
      } catch { /* notification failure doesn't block publish */ }
    }
    res.json({ ...published, staffNotified: notified, tokenCount: tokens.length });
  });

  // Register staff push token (called from mobile app on login)
  app.post("/api/hr/staff-push-token", staffAuth, async (req: any, res) => {
    const { token } = req.body;
    if (!token || typeof token !== "string") return res.status(400).json({ message: "token required" });
    if (!req.staffUser?.id) return res.status(403).json({ message: "Must be logged in as a named staff user" });
    const record = await storage.upsertStaffPushToken(req.staffUser.id, token);
    res.json(record);
  });

  // ── Pay rate routes ──────────────────────────────────────────────────────────

  app.get("/api/hr/staff/:id/pay", staffAuth, managerAuth, async (req: any, res) => {
    const staffId = parseInt(req.params.id as string, 10);
    if (isNaN(staffId)) return res.status(400).json({ message: "Invalid staff ID" });
    const pay = await storage.getStaffPay(staffId);
    if (!pay) return res.status(404).json({ message: "Staff member not found" });
    res.json(pay);
  });

  app.put("/api/hr/staff/:id/pay", staffAuth, managerAuth, async (req: any, res) => {
    const staffId = parseInt(req.params.id as string, 10);
    if (isNaN(staffId)) return res.status(400).json({ message: "Invalid staff ID" });
    const { payType, hourlyRate, annualSalary, weeklyHours } = req.body;
    if (!payType || !["hourly", "salary"].includes(payType)) return res.status(400).json({ message: "payType must be 'hourly' or 'salary'" });
    await storage.updateStaffPay(staffId, { payType, hourlyRate: hourlyRate || null, annualSalary: annualSalary || null, weeklyHours: weeklyHours || "37.5" });
    res.json({ success: true });
  });

  // ── SSP Calculator ───────────────────────────────────────────────────────────
  // Uses HMRC 2025/26 rules: £118.75/week, 3 waiting days, 8-week PIW linking, 28-week max

  const SSP_WEEKLY_RATE = 118.75;   // £118.75/week (April 2025–)
  const SSP_LEL_WEEKLY = 123.00;    // Lower Earnings Limit 2025/26
  const SSP_MIN_PIW_DAYS = 4;       // Minimum 4 consecutive calendar days = PIW
  const SSP_WAITING_CAL_DAYS = 3;   // First 3 calendar days = waiting days (no SSP)
  const SSP_LINK_GAP_DAYS = 56;     // Two PIWs within 56 calendar days (8 weeks) = linked
  const SSP_MAX_WEEKS = 28;         // Maximum 28 weeks SSP in a linked PIW

  function calDaysInPeriod(start: string, end: string): number {
    return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
  }
  function daysBetween(endDate: string, startDate: string): number {
    return Math.round((new Date(startDate).getTime() - new Date(endDate).getTime()) / 86400000);
  }

  app.get("/api/hr/staff/:id/ssp", staffAuth, managerAuth, async (req: any, res) => {
    const staffId = parseInt(req.params.id as string, 10);
    if (isNaN(staffId)) return res.status(400).json({ message: "Invalid staff ID" });

    const [pay, staffUser, allLeave] = await Promise.all([
      storage.getStaffPay(staffId),
      storage.getStaffUserById(staffId),
      storage.getLeaveRequestsForStaff(staffId),
    ]);

    if (!staffUser) return res.status(404).json({ message: "Staff member not found" });

    const contractedDaysPerWeek = parseFloat(staffUser.contractedDaysPerWeek ?? "5");
    const weeklyHours = parseFloat(pay?.weeklyHours ?? "37.5");
    const hourlyRate = pay?.hourlyRate ? parseFloat(pay.hourlyRate) : null;
    const annualSalary = pay?.annualSalary ? parseFloat(pay.annualSalary) : null;
    const payType = pay?.payType ?? "hourly";

    const weeklyEarnings = payType === "salary" && annualSalary
      ? annualSalary / 52
      : payType === "hourly" && hourlyRate
      ? hourlyRate * weeklyHours
      : 0;

    const qualifiesForSSP = weeklyEarnings >= SSP_LEL_WEEKLY;
    const dailySSP = SSP_WEEKLY_RATE / contractedDaysPerWeek;

    // Only look at approved sick leave periods
    const sickPeriods = allLeave
      .filter((r: any) => r.leaveType === "sick" && r.status === "approved")
      .sort((a: any, b: any) => a.startDate.localeCompare(b.startDate));

    const results: any[] = [];
    let totalPayableDays = 0;
    let prevEnd: string | null = null;
    let prevId: number | null = null;

    for (const period of sickPeriods) {
      const calDays = calDaysInPeriod(period.startDate, period.endDate);
      const workingDays = parseFloat(period.totalDays || "0");
      const isPIW = calDays >= SSP_MIN_PIW_DAYS;

      // Check PIW linking (within 8 weeks of previous PIW end)
      let isLinked = false;
      let linkedToId: number | null = null;
      if (prevEnd && isPIW) {
        const gap = daysBetween(prevEnd, period.startDate) - 1;
        if (gap >= 0 && gap <= SSP_LINK_GAP_DAYS) {
          isLinked = true;
          linkedToId = prevId;
        }
      }

      if (!isPIW) {
        results.push({ id: period.id, startDate: period.startDate, endDate: period.endDate, calendarDays: calDays, workingDays, isPIW: false, isLinked: false, waitingWorkingDays: 0, payableDays: 0, dailySSP, sspAmount: 0, notes: `${calDays} calendar days — minimum 4 required for SSP` });
        continue;
      }

      // Waiting days: first 3 calendar days proportional to working days
      const waitingWorkingDays = isLinked
        ? 0
        : Math.min(workingDays, Math.round((SSP_WAITING_CAL_DAYS / calDays) * workingDays));

      const rawPayable = Math.max(0, workingDays - waitingWorkingDays);
      // Cap at 28-week maximum
      const maxPayable = SSP_MAX_WEEKS * contractedDaysPerWeek - totalPayableDays;
      const payableDays = Math.min(rawPayable, Math.max(0, maxPayable));
      const sspAmount = qualifiesForSSP ? parseFloat((payableDays * dailySSP).toFixed(2)) : 0;

      totalPayableDays += payableDays;
      prevEnd = period.endDate;
      prevId = period.id;

      results.push({
        id: period.id,
        startDate: period.startDate,
        endDate: period.endDate,
        calendarDays: calDays,
        workingDays,
        isPIW: true,
        isLinked,
        linkedToId,
        waitingWorkingDays,
        payableDays: parseFloat(payableDays.toFixed(2)),
        dailySSP: parseFloat(dailySSP.toFixed(4)),
        sspAmount,
        notes: !qualifiesForSSP
          ? "Earnings below Lower Earnings Limit — does not qualify for SSP"
          : payableDays < rawPayable
          ? "28-week SSP limit reached"
          : isLinked
          ? "Linked PIW — waiting days not re-applied"
          : waitingWorkingDays > 0
          ? `${SSP_WAITING_CAL_DAYS} waiting days applied`
          : "",
      });
    }

    res.json({
      staffId,
      payType,
      weeklyEarnings: parseFloat(weeklyEarnings.toFixed(2)),
      lel: SSP_LEL_WEEKLY,
      qualifiesForSSP,
      dailySSP: parseFloat(dailySSP.toFixed(4)),
      sspWeeklyRate: SSP_WEEKLY_RATE,
      totalPayableDays: parseFloat(totalPayableDays.toFixed(2)),
      totalSSPWeeks: parseFloat((totalPayableDays / contractedDaysPerWeek).toFixed(2)),
      totalSSP: parseFloat(results.reduce((s, r) => s + r.sspAmount, 0).toFixed(2)),
      limitReached: totalPayableDays >= SSP_MAX_WEEKS * contractedDaysPerWeek,
      maxWeeks: SSP_MAX_WEEKS,
      periods: results,
      disclaimer: "Figures are estimates based on contracted days. Verify with your payroll provider before processing payments.",
      rateYear: "2025/26",
    });
  });

  // ── Holiday Pay Calculator ───────────────────────────────────────────────────

  app.get("/api/hr/staff/:id/holiday-pay", staffAuth, managerAuth, async (req: any, res) => {
    const staffId = parseInt(req.params.id as string, 10);
    if (isNaN(staffId)) return res.status(400).json({ message: "Invalid staff ID" });

    const [pay, staffUser, allLeave] = await Promise.all([
      storage.getStaffPay(staffId),
      storage.getStaffUserById(staffId),
      storage.getLeaveRequestsForStaff(staffId),
    ]);

    if (!staffUser) return res.status(404).json({ message: "Staff member not found" });

    const contractedDaysPerWeek = parseFloat(staffUser.contractedDaysPerWeek ?? "5");
    const weeklyHours = parseFloat(pay?.weeklyHours ?? "37.5");
    const hourlyRate = pay?.hourlyRate ? parseFloat(pay.hourlyRate) : null;
    const annualSalary = pay?.annualSalary ? parseFloat(pay.annualSalary) : null;
    const payType = pay?.payType ?? "hourly";

    // Daily rate calculation
    // Salaried: annual salary ÷ 52 weeks ÷ contracted days/week
    // Hourly: hourly rate × (weekly hours ÷ contracted days/week) = daily hours × hourly rate
    const dailyRate = payType === "salary" && annualSalary
      ? annualSalary / 52 / contractedDaysPerWeek
      : payType === "hourly" && hourlyRate
      ? hourlyRate * (weeklyHours / contractedDaysPerWeek)
      : 0;

    const annualLeave = allLeave
      .filter((r: any) => r.leaveType === "annual")
      .sort((a: any, b: any) => b.startDate.localeCompare(a.startDate));

    const results = annualLeave.map((req: any) => {
      const days = parseFloat(req.totalDays || "0");
      return {
        id: req.id,
        startDate: req.startDate,
        endDate: req.endDate,
        days,
        status: req.status,
        dailyRate: parseFloat(dailyRate.toFixed(4)),
        holidayPay: parseFloat((days * dailyRate).toFixed(2)),
      };
    });

    const totalApproved = results
      .filter((r: any) => r.status === "approved")
      .reduce((s: number, r: any) => s + r.holidayPay, 0);

    const totalPending = results
      .filter((r: any) => r.status === "pending")
      .reduce((s: number, r: any) => s + r.holidayPay, 0);

    res.json({
      staffId,
      payType,
      hourlyRate,
      annualSalary,
      weeklyHours,
      contractedDaysPerWeek,
      dailyRate: parseFloat(dailyRate.toFixed(4)),
      hasPay: dailyRate > 0,
      results,
      totalApprovedHolidayPay: parseFloat(totalApproved.toFixed(2)),
      totalPendingHolidayPay: parseFloat(totalPending.toFixed(2)),
      note: payType === "salary"
        ? "Salaried staff receive normal pay during leave — this shows the equivalent daily cost."
        : "Holiday pay is calculated at your contracted daily rate. Under UK law variable-hours workers may be entitled to a 52-week average rate — verify with your payroll provider.",
      disclaimer: "Figures are estimates. Verify with your payroll provider before processing payments.",
    });
  });

  // ─── BAR TABS ───────────────────────────────────────────────────────────
  // Staff open a tab against a table or booking, add items as the session
  // progresses, then close it (cash/card/comp/added-to-booking). Items can be
  // voided with a reason; closed tabs are read-only.

  async function recalcTabTotal(tabId: number): Promise<number> {
    const items = await db.select().from(tabItems).where(dEq(tabItems.tabId, tabId));
    const total = items
      .filter((i) => !i.voided)
      .reduce((s, i) => s + i.unitPricePence * i.quantity, 0);
    await db.update(tabs).set({ totalPence: total }).where(dEq(tabs.id, tabId));
    return total;
  }

  // List tabs (?status=open|closed|all, default open)
  app.get("/api/staff/tabs", staffAuth, async (req, res) => {
    try {
      const raw = req.query.status;
      const statusQ = typeof raw === "string" ? raw : Array.isArray(raw) && raw.length ? String(raw[0]) : "open";
      const rows = statusQ === "all"
        ? await db.select().from(tabs).orderBy(dDesc(tabs.openedAt)).limit(200)
        : await db.select().from(tabs).where(dEq(tabs.status, statusQ)).orderBy(dDesc(tabs.openedAt)).limit(200);
      res.json(rows);
    } catch (err: any) {
      console.error("[TABS] list error:", err.message);
      res.status(500).json({ message: "Could not load tabs" });
    }
  });

  // Get one tab + its items
  app.get("/api/staff/tabs/:id", staffAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const [tab] = await db.select().from(tabs).where(dEq(tabs.id, id));
      if (!tab) return res.status(404).json({ message: "Tab not found" });
      const items = await db.select().from(tabItems).where(dEq(tabItems.tabId, id)).orderBy(tabItems.addedAt);
      res.json({ tab, items });
    } catch (err: any) {
      console.error("[TABS] get error:", err.message);
      res.status(500).json({ message: "Could not load tab" });
    }
  });

  // Open a new tab. Body: { tableType, tableNumber?, customerName?, customerEmail?, bookingId?, notes? }
  app.post("/api/staff/tabs", staffAuth, async (req: any, res) => {
    try {
      const tableType = String(req.body?.tableType || "").trim();
      if (!tableType) return res.status(400).json({ message: "tableType is required" });
      const tableNumber = req.body?.tableNumber ? String(req.body.tableNumber).trim() : null;
      const customerName = req.body?.customerName ? String(req.body.customerName).trim() : null;
      const customerEmail = req.body?.customerEmail ? String(req.body.customerEmail).trim() : null;
      const bookingId = Number.isFinite(Number(req.body?.bookingId)) ? Number(req.body.bookingId) : null;
      const notes = req.body?.notes ? String(req.body.notes).trim().slice(0, 500) : null;

      // Block duplicate open tab on the same table
      if (tableNumber) {
        const existing = await db.select().from(tabs).where(
          dAnd(dEq(tabs.status, "open"), dEq(tabs.tableType, tableType), dEq(tabs.tableNumber, tableNumber)),
        );
        if (existing.length > 0) {
          return res.status(409).json({ message: "There is already an open tab on that table.", existingTabId: existing[0].id });
        }
      }

      const [created] = await db.insert(tabs).values({
        bookingId,
        tableType,
        tableNumber,
        customerName,
        customerEmail,
        status: "open",
        openedByStaffId: req.staffUser?.id ?? null,
        openedByName: req.staffUser?.displayName || req.staffUser?.username || "staff",
        totalPence: 0,
        notes,
      }).returning();
      res.status(201).json(created);
    } catch (err: any) {
      console.error("[TABS] open error:", err.message);
      res.status(500).json({ message: "Could not open tab" });
    }
  });

  // Add an item to a tab. Body: { name, unitPricePence, quantity? }
  app.post("/api/staff/tabs/:id/items", staffAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const [tab] = await db.select().from(tabs).where(dEq(tabs.id, id));
      if (!tab) return res.status(404).json({ message: "Tab not found" });
      if (tab.status !== "open") return res.status(400).json({ message: "Tab is not open" });

      const name = String(req.body?.name || "").trim();
      const unitPricePence = Math.round(Number(req.body?.unitPricePence));
      const quantity = Math.max(1, Math.min(99, Math.round(Number(req.body?.quantity ?? 1))));
      if (!name) return res.status(400).json({ message: "Item name required" });
      if (!Number.isFinite(unitPricePence) || unitPricePence < 0 || unitPricePence > 1_000_000)
        return res.status(400).json({ message: "Invalid price" });

      const [item] = await db.insert(tabItems).values({
        tabId: id,
        name: name.slice(0, 120),
        unitPricePence,
        quantity,
        addedByName: req.staffUser?.displayName || req.staffUser?.username || "staff",
      }).returning();
      const total = await recalcTabTotal(id);
      res.status(201).json({ item, totalPence: total });
    } catch (err: any) {
      console.error("[TABS] add item error:", err.message);
      res.status(500).json({ message: "Could not add item" });
    }
  });

  // Void an item (managers/owners only — staff can't reduce a bill)
  app.delete("/api/staff/tabs/:id/items/:itemId", staffAuth, managerAuth, async (req: any, res) => {
    try {
      const tabId = parseInt(req.params.id as string, 10);
      const itemId = parseInt(req.params.itemId as string, 10);
      const reason = String(req.body?.reason || "voided").trim().slice(0, 200);
      if (!Number.isFinite(tabId) || !Number.isFinite(itemId)) return res.status(400).json({ message: "Invalid id" });
      const [tab] = await db.select().from(tabs).where(dEq(tabs.id, tabId));
      if (!tab) return res.status(404).json({ message: "Tab not found" });
      if (tab.status !== "open") return res.status(400).json({ message: "Tab is not open" });

      await db.update(tabItems).set({ voided: true, voidReason: reason }).where(dEq(tabItems.id, itemId));
      const total = await recalcTabTotal(tabId);
      res.json({ success: true, totalPence: total });
    } catch (err: any) {
      console.error("[TABS] void item error:", err.message);
      res.status(500).json({ message: "Could not void item" });
    }
  });

  // Close tab. Body: { method: 'cash'|'card'|'comp'|'added-to-booking', notes? }
  app.post("/api/staff/tabs/:id/close", staffAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const method = String(req.body?.method || "").trim();
      if (!["cash", "card", "comp", "added-to-booking"].includes(method))
        return res.status(400).json({ message: "Invalid close method" });
      // "Comp" (on the house) gives the bar away — restrict to managers/owners.
      if (method === "comp") {
        const role = req.staffUser?.role;
        if (role !== "manager" && role !== "owner") {
          return res.status(403).json({ message: "Only managers can comp a tab." });
        }
      }
      const [tab] = await db.select().from(tabs).where(dEq(tabs.id, id));
      if (!tab) return res.status(404).json({ message: "Tab not found" });
      if (tab.status !== "open") return res.status(400).json({ message: "Tab is already closed" });

      const total = await recalcTabTotal(id);
      await db.update(tabs).set({
        status: "closed",
        closedAt: new Date(),
        closedByName: req.staffUser?.displayName || req.staffUser?.username || "staff",
        closeMethod: method,
        totalPence: total,
      }).where(dEq(tabs.id, id));
      res.json({ success: true, totalPence: total });
    } catch (err: any) {
      console.error("[TABS] close error:", err.message);
      res.status(500).json({ message: "Could not close tab" });
    }
  });

  // ─── LIVE TABLES VIEW ───────────────────────────────────────────────────
  // Returns today's bookings annotated with current state (upcoming, in-play,
  // ending-soon, finished) plus — crucially — whether the table currently has
  // an open check in Square POS, the running total, and the item count. The
  // Square data comes from the table_sessions table which is mirrored from
  // Square via webhooks (with a 60s poll as a safety net).
  app.get("/api/staff/tables-live", staffAuth, async (_req, res) => {
    try {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const todays = await db.select().from(bookingsTable).where(dEq(bookingsTable.date, todayStr));
      const openSessions = await db.select().from(tableSessions).where(dEq(tableSessions.state, "open"));

      // Index sessions by table for fast lookup. tableType comparison is
      // case-insensitive because bookings store "snooker"/"pool"/"dining" in
      // varying casings depending on age of the booking.
      const sessionByKey = new Map<string, typeof openSessions[number]>();
      for (const s of openSessions) {
        if (s.tableType && s.tableNumber) {
          sessionByKey.set(`${s.tableType.toLowerCase()}|${s.tableNumber}`, s);
        }
      }

      const usedSessionIds = new Set<number>();
      const result = todays
        .filter((b) => b.status !== "cancelled")
        .map((b) => {
          const [hh, mm] = String(b.startTime).split(":").map((n) => parseInt(n, 10));
          const start = new Date(now);
          start.setHours(hh || 0, mm || 0, 0, 0);
          const end = new Date(start.getTime() + (b.duration || 0) * 60_000);
          let state: "upcoming" | "in-play" | "ending-soon" | "finished";
          const minsToEnd = (end.getTime() - now.getTime()) / 60_000;
          const minsToStart = (start.getTime() - now.getTime()) / 60_000;
          if (minsToStart > 0) state = "upcoming";
          else if (minsToEnd <= 0) state = "finished";
          else if (minsToEnd <= 15) state = "ending-soon";
          else state = "in-play";

          const sess = b.tableNumber
            ? sessionByKey.get(`${String(b.tableType).toLowerCase()}|${String(b.tableNumber).replace(/\D/g, "")}`)
              || sessionByKey.get(`${String(b.tableType).toLowerCase()}|${b.tableNumber}`)
            : undefined;
          if (sess) usedSessionIds.add(sess.id);

          return {
            bookingId: b.id,
            tableType: b.tableType,
            tableNumber: b.tableNumber,
            customerName: b.customerName,
            startTime: b.startTime,
            duration: b.duration,
            endTime: `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`,
            state,
            minsToEnd: Math.max(0, Math.round(minsToEnd)),
            minsElapsed: Math.max(0, Math.round((now.getTime() - start.getTime()) / 60_000)),
            squareSession: sess ? {
              orderId: sess.squareOrderId,
              ticketName: sess.ticketName,
              totalPence: sess.totalPence,
              itemCount: sess.itemCount,
              openedAt: sess.openedAt,
            } : null,
          };
        })
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      // Walk-in / non-booked sessions: any open Square session that didn't
      // match a booking (e.g. someone sat down without a reservation).
      const orphanSessions = openSessions
        .filter((s) => !usedSessionIds.has(s.id))
        .map((s) => ({
          orderId: s.squareOrderId,
          ticketName: s.ticketName,
          tableType: s.tableType,
          tableNumber: s.tableNumber,
          totalPence: s.totalPence,
          itemCount: s.itemCount,
          openedAt: s.openedAt,
        }));

      res.json({ now: now.toISOString(), bookings: result, orphanSessions });
    } catch (err: any) {
      console.error("[TABLES-LIVE] error:", err.message);
      res.status(500).json({ message: "Could not load live tables" });
    }
  });

  // ── Square POS safety-net poll ─────────────────────────────────────────
  // Fires every 60s in case a webhook is missed. Cheap (one Orders search)
  // and Square explicitly recommends a poll alongside webhooks for critical
  // mirrored state. Skipped when Square isn't configured. Guarded against
  // HMR / repeat-init leaking intervals.
  if (square.isConfigured() && !(globalThis as any).__posPollStarted) {
    (globalThis as any).__posPollStarted = true;
    setInterval(() => { void pollSquareOrders(); }, 60_000);
    setTimeout(() => { void pollSquareOrders(); }, 3_000);
  }

  const httpServer = createServer(app);
  return httpServer;
}
