import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import multer from "multer";
import sharp from "sharp";
import nodemailer from "nodemailer";
import { storage } from "./storage";
import { insertOfferSchema, insertPushTokenSchema, insertBookingSchema, insertContactMessageSchema, insertEventSchema, insertBannerImageSchema } from "@shared/schema";
import { hashPin, verifyPin } from "./encryption";
import * as square from "./square";
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
    await transporter.sendMail({ from: `"The 147" <${user}>`, to, subject, html });
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
  const host = req.headers.host || "the147bradford.replit.app";
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const migrateUrl = `${proto}://${host}/migrate/${token}`;
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escHtml(title)} — The 147</title><style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#F2F5FA;color:#0D1526;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border-radius:24px;max-width:480px;width:100%;padding:40px 32px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.08)}
  .ring{width:80px;height:80px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
  h1{font-size:24px;font-weight:800;color:#0A1628;margin-bottom:12px}
  p{color:#4B5A72;font-size:15px;line-height:1.6;margin-bottom:24px}
  a.btn{display:inline-block;background:#0047AB;color:#fff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:12px;text-decoration:none}
  .brand{margin-top:24px;font-size:12px;color:#8EA0BB}
  </style></head><body><div class="card"><div class="ring">${icon}</div><h1>${escHtml(title)}</h1><p>${escHtml(message)}</p><a class="btn" href="/">Back to The 147</a><div class="brand">The 147 — Snooker, Bar &amp; Restaurant</div></div></body></html>`;
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
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
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
    (req as any).staffRole = user?.role || "staff";
    (req as any).staffUsername = session.staffUsername;
    (req as any).staffUser = user || null;
  } else {
    // Master PIN session — synthetic user with manager-level access but no real ID
    (req as any).staffRole = "manager";
    (req as any).staffUsername = null;
    (req as any).staffUser = { id: null, role: "manager", username: null, displayName: "System" };
  }
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
  if (record && now - record.blockedUntil > ATTEMPT_WINDOW) {
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
  (req as any).customerId = customer.id;
  (req as any).customerEmail = customer.email;
  next();
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

    const { masterPin, username, pin, displayName, role } = req.body;

    if (!masterPin || !username || !pin) {
      return res.status(400).json({ message: "Master PIN, username, and PIN are required" });
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

    if (typeof pin !== "string" || pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      return res.status(400).json({ message: "PIN must be 4-8 digits" });
    }

    const existing = await storage.getStaffUserByUsername(username.trim());
    if (existing) {
      return res.status(409).json({ message: "Username already taken" });
    }

    if (role && !["staff", "manager", "owner"].includes(role)) {
      return res.status(400).json({ message: "Role must be 'staff', 'manager', or 'owner'" });
    }

    const { hash, salt } = hashPin(pin);
    const assignedRole = role || "staff";
    const needsApproval = assignedRole === "manager" || assignedRole === "owner";
    const staffUser = await storage.createStaffUser(
      username.trim(),
      hash,
      salt,
      displayName?.trim() || undefined,
      assignedRole,
      needsApproval ? "pending" : "approved"
    );

    clearFailedLogins(clientIp);
    res.status(201).json({
      message: needsApproval
        ? "Account created and awaiting manager approval before you can sign in."
        : "Staff account created",
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

    const { username, pin } = req.body;
    if (!pin || typeof pin !== "string") {
      return res.status(400).json({ message: "PIN is required" });
    }

    if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      recordFailedLogin(clientIp);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (username && typeof username === "string" && username.trim().length > 0) {
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

      if (!verifyPin(pin, staffUser.pinHash, staffUser.pinSalt)) {
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
      });
    }

    const staffPin = process.env.STAFF_PIN;
    if (!staffPin) {
      return res.status(503).json({ message: "Staff access not configured" });
    }

    if (!timingSafeCompare(pin, staffPin)) {
      recordFailedLogin(clientIp);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    clearFailedLogins(clientIp);
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const session = await storage.createStaffSession(token, expiresAt);

    res.json({ token: session.token, expiresAt: session.expiresAt, role: "manager" });
  });

  app.post("/api/staff/logout", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      await storage.invalidateStaffSession(authHeader.slice(7));
    }
    res.status(204).send();
  });

  app.get("/api/staff/verify", staffAuth, async (req, res) => {
    res.json({
      authenticated: true,
      role: (req as any).staffRole || "staff",
      username: (req as any).staffUsername || null,
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

    if (!verifyPin(currentPin, staffUser.pinHash, staffUser.pinSalt)) {
      return res.status(401).json({ message: "Current PIN is incorrect" });
    }

    const { hash, salt } = hashPin(newPin);
    await storage.updateStaffPin(username, hash, salt);
    res.json({ message: "PIN changed successfully" });
  });

  app.post("/api/staff/reset-pin", staffAuth, managerAuth, async (req, res) => {
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

    const { hash, salt } = hashPin(newPin);
    await storage.updateStaffPin(username.trim(), hash, salt);
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
      const id = parseInt(req.params.id);
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

      const host = req.headers.host || "the147bradford.replit.app";
      const proto = (req.headers["x-forwarded-proto"] as string) || "https";
      const redirectUrl = `${proto}://${host}/migrate/${token}/done`;

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

  // Public — Square redirect after successful migration checkout
  app.get("/migrate/:token/done", async (req, res) => {
    try {
      const subs = await storage.getMembershipSubscriptions();
      const sub = subs.find(s => s.migrationToken === req.params.token);
      if (sub && !sub.migrationCompletedAt) {
        await storage.updateMembershipSubscription(sub.id, {
          migrationCompletedAt: new Date(),
          source: "wix_migrated",
        } as any);
      }
    } catch (err) { /* non-fatal */ }
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
  app.post("/api/staff/payments/square/charge", staffAuth, async (req, res) => {
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

  app.post("/api/staff/payments/create-intent", staffAuth, async (req, res) => {
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
  app.post("/api/staff/payments/finalize", staffAuth, async (req, res) => {
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
    const token = await storage.registerPushToken(parsed.data);
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

  async function sendTargetedPush(tokens: string[], title: string, body: string) {
    if (!tokens.length) return { successCount: 0, failureCount: 0 };
    const messages = tokens.map(to => ({ to, sound: "default" as const, title, body }));
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
    const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();
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

    // Dining restrictions: Thursday–Sunday only, 12:00–20:00
    if (parsed.data.tableType === "dining") {
      const bookingDate = new Date(parsed.data.date + "T00:00:00");
      const dow = bookingDate.getDay(); // 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
      if (![0, 4, 5, 6].includes(dow)) {
        return res.status(400).json({ message: "Dining is only available Thursday to Sunday" });
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
    const depositHandling = (req.body as { depositHandling?: string }).depositHandling;
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
        const appDomain = process.env.EXPO_PUBLIC_DOMAIN || req.get("host") || "localhost:5000";
        const protocol = appDomain.includes("localhost") ? "http" : "https";
        const redirectUrl = `${protocol}://${appDomain}/api/bookings/${booking.id}/deposit-return`;
        const paymentLink = await square.createDepositPaymentLink({
          amountPence: DEPOSIT_AMOUNT_PENCE,
          description: `Dining Deposit – Booking ${bookingRef} (${guestCount} guests)`,
          referenceId: bookingRef,
          redirectUrl,
        });
        await storage.updateBooking(booking.id, { depositPaymentId: paymentLink.paymentLinkId });

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
    // Verify signature if key is configured
    const sigKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    if (sigKey) {
      const signature = req.headers["x-square-hmacsha256-signature"] as string | undefined;
      if (!signature) {
        console.warn("[WEBHOOK] Missing Square signature header");
        return res.status(401).json({ message: "Missing signature" });
      }
      try {
        const { createHmac } = await import("node:crypto");
        const notificationUrl = process.env.SQUARE_WEBHOOK_URL ||
          `https://${process.env.EXPO_PUBLIC_DOMAIN || req.get("host")}/api/webhooks/square`;
        const rawBody = (req as any).rawBody?.toString("utf8") ?? JSON.stringify(req.body);
        const hmac = createHmac("sha256", sigKey);
        hmac.update(notificationUrl + rawBody);
        const expected = hmac.digest("base64");
        if (signature !== expected) {
          console.warn("[WEBHOOK] Square signature mismatch");
          return res.status(403).json({ message: "Invalid signature" });
        }
      } catch (sigErr) {
        console.error("[WEBHOOK] Signature check error:", sigErr);
        return res.status(500).json({ message: "Signature check failed" });
      }
    }

    const event = req.body;
    const eventType: string = event?.type ?? "";
    console.log("[WEBHOOK] Square event received:", eventType);

    // ── subscription.updated / subscription.activated ───────────────────────
    if (eventType === "subscription.updated" || eventType === "subscription.activated") {
      try {
        const sqSub = event?.data?.object?.subscription;
        if (sqSub?.id) {
          const allSubs = await storage.getMembershipSubscriptions();
          const local = allSubs.find(s => s.squareSubscriptionId === sqSub.id);
          if (local) {
            const status = sqSub.status === "ACTIVE" ? "active"
              : sqSub.status === "PAUSED" ? "paused"
              : sqSub.status === "CANCELED" ? "cancelled"
              : sqSub.status === "PENDING" ? "pending" : "active";
            await storage.updateMembershipSubscription(local.id, {
              status,
              currentPeriodStart: sqSub.start_date ?? local.currentPeriodStart ?? undefined,
              currentPeriodEnd: sqSub.charged_through_date ?? local.currentPeriodEnd ?? undefined,
            });
            console.log(`[WEBHOOK] Local membership #${local.id} synced from Square subscription status: ${status}`);
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

    if (eventType !== "payment.updated") return res.sendStatus(200);
    const payment = event?.data?.object?.payment;
    if (!payment) return res.sendStatus(200);

    const paymentStatus: string = payment.status ?? "";
    const amountPence = payment.amount_money?.amount;
    const currency = payment.amount_money?.currency;
    const paymentNote: string = payment.note || payment.payment_note || "";

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
            await storage.updateAppOrderPaid(paymentOrderId, payment.id);
            console.log(`[WEBHOOK] App order #${appOrder.id} marked paid (Square order: ${paymentOrderId})`);
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

      // Strategy 0: exact match via payment_note booking reference (most reliable)
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

      // Strategy 1: match by buyer email
      if (!booking) {
        const buyerEmail = payment.buyer_email_address as string | undefined;
        if (buyerEmail) {
          const byEmail = await storage.getBookingsByEmail(buyerEmail);
          const pending = byEmail.filter(b => b.status === "pending_deposit");
          if (pending.length > 0) {
            booking = pending.sort((a, b) => b.id - a.id)[0];
            console.log(`[WEBHOOK] Matched booking #${booking.id} by email: ${maskEmail(buyerEmail)}`);
          }
        }
      }

      // Strategy 2: time-proximity fallback (most recent pending deposit within 4 hours)
      if (!booking) {
        const all = await storage.getBookings();
        const cutoff = Date.now() - 4 * 60 * 60 * 1000;
        const recent = all
          .filter(b => b.status === "pending_deposit" && new Date(b.createdAt ?? 0).getTime() > cutoff)
          .sort((a, b) => b.id - a.id);
        if (recent.length > 0) {
          booking = recent[0];
          console.log(`[WEBHOOK] Matched booking #${booking.id} by time proximity (no email match)`);
        }
      }

      if (!booking) {
        console.warn("[WEBHOOK] No pending_deposit booking found for this payment");
        return res.sendStatus(200);
      }

      // Confirm the booking and store the Square payment ID for future refunds
      await storage.updateBooking(booking.id, {
        depositPaid: true,
        status: "confirmed",
        squarePaymentId: payment.id ?? null,
      });
      console.log(`[WEBHOOK] Booking #${booking.id} confirmed automatically after deposit payment`);

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
    const booking = await storage.getBooking(id);
    if (!booking) return res.status(404).send("Booking not found");

    if (booking.depositRequired && !booking.depositPaid) {
      await storage.updateBooking(id, { depositPaid: true, status: "confirmed" });
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
    }

    // Redirect to a simple success page (or deep-link back to app)
    const bookingRef = `147-${id.toString().padStart(5, "0")}`;
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Deposit Paid</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb}div{text-align:center;padding:32px}</style></head><body><div><div style="font-size:48px">&#10003;</div><h2 style="color:#16A34A">Deposit Paid</h2><p>Your booking <strong>${bookingRef}</strong> is confirmed.</p><p style="color:#6b7280;font-size:14px">You can close this window and return to The 147 app.</p></div></body></html>`);
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
    res.json({ message: "Booking marked as completed", depositRefunded, refundId, refundError });
  });

  // Staff: mark a booking as no-show — deposit is kept, no refund issued
  app.patch("/api/bookings/:id/noshow", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const booking = await storage.getBooking(id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    await storage.updateBooking(id, { status: "no_show" } as Parameters<typeof storage.updateBooking>[1]);
    console.log(`[NO-SHOW] Booking #${id} marked as no-show — deposit retained`);
    res.json({ message: "Booking marked as no-show" });
  });

  app.patch("/api/bookings/:id/status", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { status } = req.body;
    if (!status || !["confirmed", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const booking = await storage.updateBookingStatus(id, status);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

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
    res.json(updated);
  });

  app.delete("/api/bookings/:id", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const deleted = await storage.deleteBooking(id);
    if (!deleted) return res.status(404).json({ message: "Booking not found" });
    res.status(204).send();
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
    const deletedCount = await storage.deleteBookingsByEmail(email);
    // Also delete the customer account if one exists with this email
    const customer = await storage.getCustomerByEmail(email);
    if (customer) await storage.deleteCustomer(customer.id);
    res.json({
      message: `Erasure complete under UK GDPR Article 17`,
      recordsDeleted: deletedCount,
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
      const deals = await square.getSquareDeals();
      res.json(deals);
    } catch {
      res.json([]);
    }
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
            const base: any = {
              id: item.id,
              variationId: item.variationId,
              name: item.name,
              variationName: item.variationName,
              description: item.description,
              price: item.price,
              imageUrl: item.imageUrl,
              ...(item.modifiers && item.modifiers.length > 0 ? { modifiers: item.modifiers } : {}),
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
  function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  interface OrderingSchedule { days: number[]; startTime: string; endTime: string; }
  interface OrderingOverride { date: string; closed: boolean; startTime?: string; endTime?: string; note?: string; }
  interface OrderingStatusResult { enabled: boolean; reason: string; nextOpen?: string; closesAt?: string; manualOverride?: boolean; }

  const DEFAULT_SCHEDULE: OrderingSchedule = { days: [4, 5, 6, 0], startTime: "12:00", endTime: "20:00" };
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
    const today = getTodayStr();
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    const dow = now.getDay();

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
    const { items, tableNote, orderNote, customer } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }
    try {
      const orderingEnabled = await getOrderingEnabled();
      if (!orderingEnabled) {
        return res.status(503).json({ message: "Online ordering is currently unavailable. Please order at the bar." });
      }

      // Look up active membership discount for the customer
      let discountPercent: number | undefined;
      let discountLabel: string | undefined;
      let excludeWithDeals = false;
      if (customer?.email) {
        try {
          const cust = await storage.getCustomerByEmail(customer.email);
          if (cust) {
            // Sync with Square before checking — ensures group-based members (e.g. VIP)
            // get their discount even if they haven't logged in recently to trigger the
            // normal login sync. Only sync if no subscription or if it came from a group
            // sync (may be stale). Non-blocking: a sync failure never blocks the order.
            const preSub = await storage.getMembershipSubscriptionByCustomer(cust.id);
            const needsSync = !preSub || (preSub as any).source === "square_group_sync";
            if (needsSync) {
              await syncSquareMembershipForCustomer(cust.id, cust.email).catch((e: any) =>
                console.warn("[ORDER] Pre-checkout sync failed:", e.message)
              );
            }

            const sub = await storage.getMembershipSubscriptionByCustomer(cust.id);
            // Validate: subscription active + not cancelled + billing period current + plan is active in staff portal + plan has a discount
            const isActive = sub?.status === "active";
            const notCancelled = !sub?.cancelledAt;
            const periodValid = !sub?.currentPeriodEnd || new Date(sub.currentPeriodEnd) >= new Date();
            const planActive = sub?.plan !== null; // storage already filters plan by active=true; null means inactive plan
            const hasDiscount = (sub?.plan?.foodDrinkDiscount ?? 0) > 0;
            if (sub && isActive && notCancelled && periodValid && planActive && hasDiscount) {
              discountPercent = sub.plan!.foodDrinkDiscount;
              discountLabel = `${sub.plan!.name} Member Discount`;
              excludeWithDeals = !!((sub.plan as any)?.excludeWithDeals);
            } else if (sub) {
              console.log(
                `[ORDER] Discount withheld for ${customer.email}: status=${sub.status}, cancelledAt=${sub.cancelledAt}, periodEnd=${sub.currentPeriodEnd}, planActive=${planActive}, discount=${sub.plan?.foodDrinkDiscount}`
              );
            }
          }
        } catch (err: any) {
          console.warn("[ORDER] Could not look up membership discount:", err.message);
        }
      }
      const { url, linkId, squareOrderId } = await square.createOrderCheckoutLink(
        items, tableNote, customer, discountPercent, discountLabel, excludeWithDeals, orderNote
      );
      const rawTotal = items.reduce((sum: number, i: any) => sum + (Number(i.price) * Number(i.quantity)), 0);
      const discountedTotal = discountPercent
        ? Math.round(rawTotal * (1 - discountPercent / 100))
        : rawTotal;

      // Store order record (non-blocking — don't fail checkout if DB write fails)
      storage.createAppOrder({
        squareLinkId: linkId || undefined,
        squareOrderId: squareOrderId || undefined,
        tableNote: tableNote || undefined,
        customerName: customer?.name || undefined,
        customerEmail: customer?.email || undefined,
        itemsJson: JSON.stringify(
          items.map((i: any) => ({
            name: i.name ?? "Item",
            quantity: i.quantity,
            price: i.price,
            ...(i.modifiers?.length ? { modifiers: i.modifiers.map((m: any) => m.name) } : {}),
          }))
        ),
        totalPence: discountedTotal,
        discountPercent: discountPercent ?? undefined,
        discountLabel: discountLabel ?? undefined,
      }).catch((err: any) => console.error("[ORDER] Failed to save order record:", err.message));

      res.json({ url, discountPercent: discountPercent ?? null, discountLabel: discountLabel ?? null });
    } catch (err: any) {
      console.error("[ORDER] Checkout failed:", err.message);
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

  // ── In-app order: create the Square Order (no hosted checkout) ─────────────
  // Returns the orderId + computed total so the client can charge it via the
  // Web Payments SDK and POST the resulting card token to /api/orders/:id/pay.
  app.post("/api/orders/create", async (req, res) => {
    const { items, tableNote, orderNote, customer } = req.body;
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

      // Resolve membership discount (same logic as /api/orders/checkout)
      let discountPercent: number | undefined;
      let discountLabel: string | undefined;
      let excludeWithDeals = false;
      if (customer?.email) {
        try {
          const cust = await storage.getCustomerByEmail(customer.email);
          if (cust) {
            const preSub = await storage.getMembershipSubscriptionByCustomer(cust.id);
            const needsSync = !preSub || (preSub as any).source === "square_group_sync";
            if (needsSync) {
              await syncSquareMembershipForCustomer(cust.id, cust.email).catch((e: any) =>
                console.warn("[ORDER] Pre-create sync failed:", e.message)
              );
            }
            const sub = await storage.getMembershipSubscriptionByCustomer(cust.id);
            const isActive = sub?.status === "active";
            const notCancelled = !sub?.cancelledAt;
            const periodValid = !sub?.currentPeriodEnd || new Date(sub.currentPeriodEnd) >= new Date();
            const planActive = sub?.plan !== null;
            const hasDiscount = (sub?.plan?.foodDrinkDiscount ?? 0) > 0;
            if (sub && isActive && notCancelled && periodValid && planActive && hasDiscount) {
              discountPercent = sub.plan!.foodDrinkDiscount;
              discountLabel = `${sub.plan!.name} Member Discount`;
              excludeWithDeals = !!((sub.plan as any)?.excludeWithDeals);
            }
          }
        } catch (err: any) {
          console.warn("[ORDER] Could not look up membership discount:", err.message);
        }
      }

      const { orderId, totalPence } = await square.createSquareOrderForCheckout(
        items, tableNote, customer, discountPercent, discountLabel, excludeWithDeals, orderNote,
      );

      // Save app_orders row (pending) so the webhook + staff dashboard see it
      const appOrder = await storage.createAppOrder({
        squareOrderId: orderId,
        tableNote: tableNote || undefined,
        customerName: customer?.name || undefined,
        customerEmail: customer?.email || undefined,
        itemsJson: JSON.stringify(
          items.map((i: any) => ({
            name: i.name ?? "Item",
            quantity: i.quantity,
            price: i.price,
            ...(i.modifiers?.length ? { modifiers: i.modifiers.map((m: any) => m.name) } : {}),
          }))
        ),
        totalPence,
        discountPercent: discountPercent ?? undefined,
        discountLabel: discountLabel ?? undefined,
      });

      res.json({
        appOrderId: appOrder.id,
        squareOrderId: orderId,
        amountPence: totalPence,
        discountPercent: discountPercent ?? null,
        discountLabel: discountLabel ?? null,
      });
    } catch (err: any) {
      console.error("[ORDER] Create order failed:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ── In-app order: pay with a Web Payments SDK card token ───────────────────
  app.post("/api/orders/:appOrderId/pay", async (req, res) => {
    const appOrderId = parseInt(String(req.params.appOrderId));
    if (isNaN(appOrderId)) return res.status(400).json({ message: "Invalid order id" });
    const { sourceId, verificationToken, buyerEmail } = req.body || {};
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
        await storage.updateAppOrderPaid(order.squareOrderId, payment.id).catch((e: any) =>
          console.error("[ORDER] Failed to mark paid:", e.message)
        );
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
    // Verify PIN for named staff accounts; master-PIN sessions are pre-authenticated
    if (staffUsername) {
      if (!pin) return res.status(400).json({ message: "PIN required to authorise this action" });
      const staffUser = await storage.getStaffUserByUsername(staffUsername);
      if (!staffUser || !verifyPin(String(pin), staffUser.pinHash, staffUser.pinSalt)) {
        return res.status(401).json({ message: "Incorrect PIN" });
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
      console.log(`[ORDERS] Order #${id} cancelled by ${actor}`);
      res.json({ status: "cancelled" });
    } catch (err: any) {
      console.error("[ORDERS] Cancel failed:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Staff: refund a paid app order (PIN-authorised) ───────────────────────────
  app.post("/api/staff/orders/:id/refund", staffAuth, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ message: "Invalid order ID" });
    const { pin, reason } = req.body;
    const staffUsername = (req as any).staffUsername as string | null;
    // Verify PIN for named staff accounts
    if (staffUsername) {
      if (!pin) return res.status(400).json({ message: "PIN required to authorise this action" });
      const staffUser = await storage.getStaffUserByUsername(staffUsername);
      if (!staffUser || !verifyPin(String(pin), staffUser.pinHash, staffUser.pinSalt)) {
        return res.status(401).json({ message: "Incorrect PIN" });
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
  app.get("/api/customers/orders", customerAuth, async (req, res) => {
    try {
      const email = (req as any).customerEmail as string | undefined;
      if (!email) return res.status(400).json({ message: "No customer email" });
      const orders = await storage.getCustomerOrders(email);
      res.json(orders);
    } catch (err: any) {
      console.error("[ORDERS] Customer orders failed:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

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
      return res.status(400).json({ error: "Invalid event data", details: parsed.error.errors });
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
        const linkValue = req.body.linkValue?.trim() || null;
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
    const image = await storage.createBannerImage(parsed.data);
    res.status(201).json(image);
  });

  app.put("/api/banner-images/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const updated = await storage.updateBannerImage(id, req.body);
    if (!updated) return res.status(404).json({ error: "Banner image not found" });
    res.json(updated);
  });

  app.delete("/api/banner-images/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const deleted = await storage.deleteBannerImage(id);
    if (!deleted) return res.status(404).json({ error: "Banner image not found" });
    res.json({ message: "Banner image deleted" });
  });

  app.post("/api/contact", async (req, res) => {
    const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();
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

    // Link push token to the customer's email for future targeted notifications
    if (incomingPushToken && typeof incomingPushToken === "string") {
      await storage.registerPushToken({ token: incomingPushToken, customerEmail: parsed.data.email }).catch(() => {});
    }

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
    const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();
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
    try {
      cleanupExpiredLoyaltySessions();
      const sessionToken = randomBytes(32).toString("hex");
      loyaltySessions.set(sessionToken, { phone: phoneCleaned, expiresAt: Date.now() + LOYALTY_SESSION_EXPIRY });
      const account = await square.searchLoyaltyAccount(phoneCleaned);
      if (!account) {
        return res.json({ sessionToken, found: false, account: null });
      }
      res.json({
        sessionToken,
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
      console.error("Square loyalty phone-auth error:", err.message);
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  app.post("/api/loyalty/send-code", async (req, res) => {
    const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();
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
      const subPlans = allPlans.filter(p => p.active && (p.squarePlanVariationId || (p as any).squarePlanVariationIdAlt));
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
      const groupPlans = allPlans.filter(p => p.active && (p as any).squareCustomerGroupId);
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

  app.post("/api/customers/register", async (req, res) => {
    const clientIp = getClientIp(req);
    const rateCheck = checkCustomerRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.setHeader("Retry-After", String(rateCheck.retryAfter));
      return res.status(429).json({ message: "Too many attempts. Please try again later." });
    }
    const { name, email, phone, password, privacyConsent } = req.body;
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
    try {
      const existing = await storage.getCustomerByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists" });
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
      });
      const token = randomBytes(48).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await storage.createCustomerSession(token, customer.id, expiresAt);
      res.status(201).json({
        token,
        customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, emailVerified: false },
      });
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
    res.json({ id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, emailVerified: customer.emailVerified });
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
  // Privacy: when the email isn't registered we still return 200 (no enumeration).
  // BUT when the account exists and the email is NOT verified, we refuse and tell
  // the UI so it can prompt the user to finish verification first.
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
        return res.status(403).json({
          code: "EMAIL_NOT_VERIFIED",
          message: "Please verify your email address before resetting your password. We can resend the verification link.",
          email: customer.email,
        });
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
    const { name, phone } = req.body;
    const updates: Partial<{ name: string; phone: string }> = {};
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
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }
    const updated = await storage.updateCustomer((req as any).customerId, updates);
    if (!updated) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json({ id: updated.id, name: updated.name, email: updated.email, phone: updated.phone });
  });

  app.delete("/api/customers/me", customerAuth, async (req, res) => {
    const customerId = (req as any).customerId;
    const email = (req as any).customerEmail;
    const bookingsDeleted = await storage.deleteBookingsByEmail(email);
    const deleted = await storage.deleteCustomer(customerId);
    if (!deleted) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json({
      success: true,
      message: "Account and all associated data permanently deleted under UK GDPR Article 17",
      bookingsDeleted,
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
    const plans = await storage.getMembershipPlans(true);
    res.set("Cache-Control", "no-store");
    res.json(plans);
  });

  // ── Membership — customer: get own subscription ──────────────────────────────
  app.get("/api/membership/my-subscription", customerAuth, async (req, res) => {
    const customerId = (req as any).customerId as number;
    const sub = await storage.getMembershipSubscriptionByCustomer(customerId);
    res.json(sub ?? null);
  });

  // ── Membership — customer: join a plan ──────────────────────────────────────
  app.post("/api/membership/join", customerAuth, async (req, res) => {
    try {
      const customerId = (req as any).customerId as number;
      const { planId, billingFrequency = "monthly", startDate } = req.body ?? {};
      if (!planId) return res.status(400).json({ message: "planId is required" });
      const isAnnual = billingFrequency === "annual";

      // Check if already an active member on this same plan
      const existing = await storage.getMembershipSubscriptionByCustomer(customerId);
      if (existing && existing.planId === parseInt(planId) && existing.status === "active") {
        return res.status(409).json({ message: "You already have an active membership on this plan" });
      }

      const plan = await storage.getMembershipPlan(parseInt(planId));
      if (!plan || !plan.active) return res.status(404).json({ message: "Plan not found" });

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
      });

      let checkoutUrl: string | null = null;

      // Wire up Square: create/find customer, manage groups, generate checkout link
      if (square.isConfigured()) {
        try {
          const customer = await storage.getCustomerById(customerId);
          if (customer) {
            // Create or find Square customer
            let sqCustomer = await square.findSquareCustomerByEmail(customer.email).catch(() => null);
            if (!sqCustomer) {
              sqCustomer = await square.createSquareCustomer(customer.name, customer.email, customer.phone || undefined).catch(() => null);
            }

            if (sqCustomer) {
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

              // ── Generate checkout payment link ──────────────────────────────
              const redirectUrl = `https://the147bradford.replit.app/api/membership/${sub.id}/payment-return`;

              // Pick variation ID and price based on billing frequency
              const variationId = isAnnual
                ? ((plan as any).squarePlanVariationIdAlt || plan.squarePlanVariationId)
                : plan.squarePlanVariationId;
              const chargeAmount = isAnnual
                ? ((plan as any).priceAnnual || plan.priceMonthly * 12)
                : plan.priceMonthly;

              const checkout = variationId
                // Recurring subscription checkout
                ? await square.createSubscriptionCheckoutLink({
                    planVariationId: variationId,
                    subscriptionId: sub.id,
                    buyerEmail: customer?.email,
                    redirectUrl,
                  }).catch((err) => {
                    console.error("[membership/join] subscription checkout error:", err?.message ?? err);
                    return null;
                  })
                // Fallback: one-time payment link (Square plan not set up yet)
                : await square.createMembershipCheckoutLink({
                    planName: `${plan.name}${isAnnual ? " (Annual)" : ""}`,
                    amountPence: chargeAmount,
                    subscriptionId: sub.id,
                    redirectUrl,
                  }).catch((err) => {
                    console.error("[membership/join] one-time checkout error:", err?.message ?? err);
                    return null;
                  });

              if (checkout) {
                checkoutUrl = checkout.url;
                console.log(`[membership/join] ${variationId ? "Subscription" : "One-time"} ${isAnnual ? "annual" : "monthly"} checkout created for sub #${sub.id}`);
              }
            }
          }
        } catch (sqErr) {
          console.error("[membership/join] Square error (non-fatal):", sqErr);
        }
      }

      // Only auto-activate if Square is not configured at all (free/staff-managed plans)
      // If Square IS configured but checkout link failed, keep as "pending" so staff can resolve
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

  // Membership payment return — Square redirects here after checkout
  app.get("/api/membership/:id/payment-return", async (req, res) => {
    const subId = parseInt(req.params.id);
    if (!isNaN(subId)) {
      const sub = await storage.getMembershipSubscription(subId).catch(() => null);
      if (sub && sub.status === "pending") {
        await storage.updateMembershipSubscription(subId, { status: "active" }).catch(() => {});
        console.log(`[MEMBERSHIP] Subscription #${subId} activated via payment return redirect`);
      }
    }
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

      const redirectUrl = `https://the147bradford.replit.app/api/membership/${sub.id}/payment-return`;
      const checkout = await square.createMembershipCheckoutLink({
        planName: plan.name,
        amountPence: plan.priceMonthly,
        subscriptionId: sub.id,
        redirectUrl,
      });

      res.json({ checkoutUrl: checkout.url });
    } catch (err: any) {
      console.error("[membership/retry-payment]", err);
      res.status(500).json({ message: "Failed to generate payment link" });
    }
  });

  // ── Membership — Square webhook ──────────────────────────────────────────
  // Middleware to capture raw body for Square webhook signature verification
  const captureRawBody = (req: Request, res: Response, next: NextFunction) => {
    let raw = "";
    req.on("data", (chunk: Buffer | string) => { raw += chunk.toString("utf8"); });
    req.on("end", () => { (req as any)._rawBody = raw; next(); });
    req.on("error", next);
  };

  app.post("/api/membership/webhook", captureRawBody, async (req, res) => {
    try {
      // Parse raw body first (needed for both signature check and event handling)
      const bodyStr: string = (req as any)._rawBody || JSON.stringify(req.body);

      // Verify Square webhook signature when the key is configured
      const sigKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
      if (sigKey) {
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
      }
      const event = JSON.parse(bodyStr);
      const type: string = event?.type ?? "";

      // subscription.updated / subscription.activated
      if (type === "subscription.updated" || type === "subscription.activated") {
        const sqSub = event?.data?.object?.subscription;
        if (sqSub?.id) {
          const existingSubs = await storage.getMembershipSubscriptions();
          const local = existingSubs.find(s => s.squareSubscriptionId === sqSub.id);
          if (local) {
            const status = sqSub.status === "ACTIVE" ? "active"
              : sqSub.status === "PAUSED" ? "paused"
              : sqSub.status === "CANCELED" ? "cancelled"
              : sqSub.status === "PENDING" ? "pending" : "active";
            await storage.updateMembershipSubscription(local.id, {
              status,
              currentPeriodStart: sqSub.start_date ?? local.currentPeriodStart ?? undefined,
              currentPeriodEnd: sqSub.charged_through_date ?? local.currentPeriodEnd ?? undefined,
            });
            console.log(`[MEMBERSHIP WEBHOOK] Synced local #${local.id} → ${status}`);
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
  app.get("/api/staff/membership/stats", staffAuth, async (_req, res) => {
    const stats = await storage.getMembershipStats();
    res.json(stats);
  });

  app.get("/api/staff/membership/plans", staffAuth, async (_req, res) => {
    const plans = await storage.getMembershipPlans();
    res.json(plans);
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
    const { name, tier, priceMonthly, priceAnnual, hoursIncluded, hoursUnit, foodDrinkDiscount, priorityBooking, loyaltyMultiplier, guestPassesMonthly, squarePlanVariationId, squarePlanVariationIdAlt, squareCustomerGroupId, excludeWithDeals, active, sortOrder, color, description } = req.body ?? {};
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
        sortOrder: Number(sortOrder) || 0,
        color: color || "#0047AB",
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

    let plan = await storage.updateMembershipPlan(id, req.body);
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

  app.get("/api/staff/membership/subscriptions", staffAuth, async (_req, res) => {
    const subs = await storage.getMembershipSubscriptions();
    res.json(subs);
  });

  // Manual Square membership sync — staff can trigger this for any registered customer
  app.post("/api/staff/membership/square-sync", staffAuth, async (req, res) => {
    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ message: "Email is required" });
    try {
      if (!square.isConfigured()) return res.status(503).json({ message: "Square is not configured" });
      const customer = await storage.getCustomerByEmail(email.trim().toLowerCase());
      if (!customer) return res.status(404).json({ message: "No app account found with that email. The customer needs to register in the app first." });
      const existing = await storage.getMembershipSubscriptionByCustomer(customer.id);
      if (existing) return res.json({ status: "already_linked", message: `${customer.name} already has a membership linked (${existing.status}).` });
      const sqCustomer = await square.findSquareCustomerByEmail(email.trim()).catch(() => null);
      if (!sqCustomer) return res.json({ status: "no_square_customer", message: `No Square customer found for ${email}. They may need to be added to Square first.` });

      const allPlans = await storage.getMembershipPlans();
      const today = new Date().toISOString().slice(0, 10);

      // ── 1. Check subscriptions ──────────────────────────────────────────────
      const sqSubs: any[] = await square.listSquareSubscriptionsForCustomer(sqCustomer.id).catch(() => []);
      const subPlans = allPlans.filter(p => p.active && (p.squarePlanVariationId || (p as any).squarePlanVariationIdAlt));
      const planMatchesVar = (p: any, vid: string) =>
        p.squarePlanVariationId === vid || p.squarePlanVariationIdAlt === vid;
      const match = sqSubs.find((s: any) =>
        (s.status === "ACTIVE" || s.status === "PENDING") &&
        subPlans.some(p => planMatchesVar(p, s.plan_variation_id))
      );
      if (match) {
        const plan = subPlans.find(p => planMatchesVar(p, match.plan_variation_id))!;
        const periodEnd = match.charged_through_date ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        await storage.createMembershipSubscription({
          customerId: customer.id, planId: plan.id, status: "active",
          currentPeriodStart: match.start_date ?? today, currentPeriodEnd: periodEnd,
          hoursUsedThisPeriod: 0, guestPassesUsed: 0,
          squareSubscriptionId: match.id, squareCustomerId: sqCustomer.id,
          source: "square_sync", staffNotes: "Manually synced from Square via staff portal",
        });
        console.log(`[MEMBERSHIP] Manual Square sync: ${match.id} → customer #${customer.id} (${email}) on plan "${plan.name}"`);
        return res.json({ status: "linked", message: `✓ ${customer.name} linked to ${plan.name} plan (Square sub: ${match.id})` });
      }

      // ── 2. Check Square customer groups ──────────────────────────────────────
      const groupPlans = allPlans.filter(p => p.active && (p as any).squareCustomerGroupId);
      if (groupPlans.length) {
        const customerGroupIds = await square.getCustomerGroupIds(sqCustomer.id).catch(() => [] as string[]);
        const groupMatch = groupPlans.find(p => customerGroupIds.includes((p as any).squareCustomerGroupId));
        if (groupMatch) {
          const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          await storage.createMembershipSubscription({
            customerId: customer.id, planId: groupMatch.id, status: "active",
            currentPeriodStart: today, currentPeriodEnd: periodEnd,
            hoursUsedThisPeriod: 0, guestPassesUsed: 0,
            squareCustomerId: sqCustomer.id,
            source: "square_group_sync", staffNotes: `Manually synced from Square customer group "${groupMatch.name}" via staff portal`,
          });
          console.log(`[MEMBERSHIP] Manual group sync: group "${groupMatch.name}" → customer #${customer.id} (${email})`);
          return res.json({ status: "linked", message: `✓ ${customer.name} linked to ${groupMatch.name} plan via Square customer group` });
        }
        // Customer found in Square but not in any mapped group
        const groupInfo = customerGroupIds.length
          ? `Their Square groups: ${customerGroupIds.join(", ")}`
          : "They are not in any Square customer groups.";
        return res.json({ status: "no_matching_plan", message: `${customer.name} found in Square but has no matching subscription or customer group. ${sqSubs.length ? `Subscriptions: ${sqSubs.map((s: any) => `${s.status} (plan: ${s.plan_variation_id || "unknown"})`).join(", ")}. ` : "No subscriptions found. "}${groupInfo}` });
      }

      // No subscriptions and no group plans configured
      if (!sqSubs.length) {
        return res.json({ status: "no_subscriptions", message: `${customer.name} found in Square but has no subscriptions and no customer groups are mapped to plans.` });
      }
      const subStatuses = sqSubs.map((s: any) => `${s.status} (plan: ${s.plan_variation_id || "unknown"})`).join(", ");
      return res.json({ status: "no_matching_plan", message: `${customer.name} has Square subscriptions but none match an active local plan. Square subs: ${subStatuses}` });
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

  app.post("/api/staff/membership/subscriptions", staffAuth, async (req, res) => {
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
    res.status(201).json(sub);
  });

  app.post("/api/staff/membership/payment-link", staffAuth, async (req, res) => {
    const { subscriptionId, planId } = req.body ?? {};
    if (!subscriptionId || !planId) return res.status(400).json({ message: "subscriptionId and planId required" });
    if (!square.isConfigured()) return res.status(503).json({ message: "Square is not configured" });
    try {
      const [plan, sub] = await Promise.all([
        storage.getMembershipPlan(parseInt(planId)),
        storage.getMembershipSubscription(parseInt(subscriptionId)),
      ]);
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      const redirectUrl = `${process.env.REPLIT_INTERNAL_APP_DOMAIN ? `https://${process.env.REPLIT_INTERNAL_APP_DOMAIN}` : "https://the147bradford.replit.app"}/staff`;
      const link = await square.createMembershipCheckoutLink({
        planName: plan.name,
        amountPence: plan.priceMonthly,
        subscriptionId: parseInt(subscriptionId),
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

      res.json({ url: link.url, paymentLinkId: link.paymentLinkId, emailSent });
    } catch (err: any) {
      console.error("[PAYMENT LINK]", err?.message);
      res.status(500).json({ message: err?.message || "Failed to create payment link" });
    }
  });

  app.patch("/api/staff/membership/subscriptions/:id", staffAuth, async (req, res) => {
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

  // Public API endpoint — deletes all data for a given email address
  app.post("/api/request-deletion", async (req, res) => {
    const { email } = req.body ?? {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ message: "A valid email address is required." });
    }
    const normalised = email.trim().toLowerCase();
    // Delete bookings first, then customer account
    await storage.deleteBookingsByEmail(normalised);
    const customer = await storage.getCustomerByEmail(normalised);
    if (customer) await storage.deleteCustomer(customer.id);
    // Always return success — don't reveal whether an account existed
    res.json({ success: true, message: "If an account existed for that email, all data has been permanently deleted." });
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

  // ── Clock in / out ───────────────────────────────────────────────────────────
  app.get("/api/hr/clock-status", staffAuth, async (req: any, res) => {
    const active = await storage.getActiveClockEntry(req.staffUser.id);
    res.json({ active: active ?? null });
  });

  app.post("/api/hr/clock-in", staffAuth, async (req: any, res) => {
    const existing = await storage.getActiveClockEntry(req.staffUser.id);
    if (existing) return res.status(409).json({ message: "Already clocked in" });
    const { lat, lng } = req.body;
    const entry = await storage.clockIn(req.staffUser.id, lat ? String(lat) : undefined, lng ? String(lng) : undefined);
    res.status(201).json(entry);
  });

  app.post("/api/hr/clock-out", staffAuth, async (req: any, res) => {
    const active = await storage.getActiveClockEntry(req.staffUser.id);
    if (!active) return res.status(404).json({ message: "No active clock-in found" });
    const { lat, lng } = req.body;
    const entry = await storage.clockOut(active.id, lat ? String(lat) : undefined, lng ? String(lng) : undefined);
    res.json(entry);
  });

  app.get("/api/hr/time-entries", staffAuth, async (req: any, res) => {
    const entries = await storage.getTimeEntriesForStaff(req.staffUser.id);
    res.json(entries);
  });

  app.get("/api/hr/time-entries/all", staffAuth, managerAuth, async (_req, res) => {
    const entries = await storage.getAllTimeEntries();
    const users = await storage.getAllStaffUsers();
    const userMap = Object.fromEntries(users.map((u: any) => [u.id, u.displayName || u.username]));
    const enriched = entries.map((e: any) => ({ ...e, staffName: userMap[e.staffId] || `Staff #${e.staffId}` }));
    res.json(enriched);
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
    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) return res.status(400).json({ message: "Invalid staff ID" });
    const pay = await storage.getStaffPay(staffId);
    if (!pay) return res.status(404).json({ message: "Staff member not found" });
    res.json(pay);
  });

  app.put("/api/hr/staff/:id/pay", staffAuth, managerAuth, async (req: any, res) => {
    const staffId = parseInt(req.params.id, 10);
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
    const staffId = parseInt(req.params.id, 10);
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
    const staffId = parseInt(req.params.id, 10);
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

  const httpServer = createServer(app);
  return httpServer;
}
