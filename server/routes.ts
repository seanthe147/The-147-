import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import multer from "multer";
import sharp from "sharp";
import nodemailer from "nodemailer";
import { storage } from "./storage";
import { insertOfferSchema, insertPushTokenSchema, insertBookingSchema, insertContactMessageSchema, insertEventSchema, insertBannerImageSchema } from "@shared/schema";
import { hashPin, verifyPin } from "./encryption";
import * as square from "./square";

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

async function sendEmailViaSMTP(to: string, subject: string, html: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || "587");
  if (!host || !user || !pass) return false;
  try {
    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    await transporter.sendMail({ from: `"The 147" <${user}>`, to, subject, html });
    console.log(`[EMAIL SMTP] Sent to ${to}`);
    return true;
  } catch (err) {
    console.error("[EMAIL SMTP] Error:", err);
    return false;
  }
}

async function sendOtpEmail(email: string, code: string): Promise<boolean> {
  const subject = "Your Loyalty Verification Code — The 147";
  const html = OTP_HTML(code);
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const fromName = process.env.RESEND_FROM_NAME || "The 147";
  const resendKey = process.env.RESEND_API_KEY;

  // Try Resend first
  if (resendKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: email, subject, html }),
      });
      if (response.ok) {
        console.log(`[LOYALTY OTP] Email sent via Resend to ${email}`);
        return true;
      }
      const errorText = await response.text();
      console.warn(`[LOYALTY OTP] Resend failed (${response.status}): ${errorText} — trying SMTP fallback`);
    } catch (err) {
      console.warn("[LOYALTY OTP] Resend exception — trying SMTP fallback:", err);
    }
  }

  // SMTP fallback
  const smtpSent = await sendEmailViaSMTP(email, subject, html);
  if (smtpSent) return true;

  // Both failed — log code so staff can manually provide it
  console.warn(`[LOYALTY OTP] All email methods failed. Manual code for ${email}: ${code}`);
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
    <p style="color: #374151; font-size: 15px;">Hi ${booking.customerName},</p>
    <p style="color: #374151; font-size: 15px;">Your booking at The 147 has been confirmed. Here are your details:</p>
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Booking Ref</td><td style="padding: 8px 0; color: #0047AB; font-size: 15px; font-weight: 700; text-align: right;">${bookingRef}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Table</td><td style="padding: 8px 0; color: #0A1628; font-size: 14px; font-weight: 600; text-align: right;">${tableDisplay}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Date</td><td style="padding: 8px 0; color: #0A1628; font-size: 14px; font-weight: 600; text-align: right;">${dateFormatted}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Time</td><td style="padding: 8px 0; color: #0A1628; font-size: 14px; font-weight: 600; text-align: right;">${booking.startTime} - ${endTime} (${durationLabel})</td></tr>
      </table>
    </div>
    <p style="color: #374151; font-size: 14px;">Please arrive 5 minutes before your slot. If you need to cancel or change your booking, please contact us.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 12px; text-align: center;">The 147 &mdash; Snooker, Bar &amp; Restaurant<br/>www.the147.co.uk</p>
  </div>`;

  const subject = `Booking Confirmed - ${tableDisplay} on ${dateFormatted}`;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const fromName = process.env.RESEND_FROM_NAME || "The 147";

  if (resendKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: booking.customerEmail, subject, html }),
      });
      if (response.ok) {
        console.log(`[BOOKING] Confirmation email sent to ${booking.customerEmail} for booking #${booking.id}`);
        return true;
      }
      console.warn("[BOOKING] Resend failed, trying SMTP:", await response.text());
    } catch (err) {
      console.warn("[BOOKING] Resend exception, trying SMTP:", err);
    }
  }

  const smtpSent = await sendEmailViaSMTP(booking.customerEmail, subject, html);
  if (smtpSent) return true;

  console.warn(`[BOOKING] Confirmation email could not be sent for booking #${booking.id} to ${booking.customerEmail}`);
  return false;
}

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
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
  } else {
    (req as any).staffRole = "manager";
    (req as any).staffUsername = null;
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
    const rateCheck = checkRateLimit(clientIp);
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
    const rateCheck = checkRateLimit(clientIp);
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
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
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
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
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

  app.post("/api/staff/migrate-encryption", staffAuth, managerAuth, async (_req, res) => {
    try {
      const count = await storage.migrateEncryptExistingBookings();
      res.json({ message: "Encryption migration complete", recordsMigrated: count });
    } catch (err) {
      console.error("Encryption migration error:", err);
      res.status(500).json({ message: "Migration failed" });
    }
  });

  app.get("/api/offers", async (_req, res) => {
    const offers = await storage.getOffers();
    res.json(offers);
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

    const booking = await storage.createBooking({ ...parsed.data, tableNumber: finalTableNumber ?? undefined });

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

  app.get("/api/bookings/availability", async (req, res) => {
    const { date, tableType, tableNumber } = req.query;
    if (!date || !tableType) {
      return res.status(400).json({ message: "date and tableType are required" });
    }
    const POOL_TABLE_COUNT = 6;
    const DINING_TABLE_COUNT = 25;
    // For dining: return all dining bookings so the frontend can count concurrent usage
    if (String(tableType) === "dining") {
      const bookedSlots = await storage.getBookedSlots(String(date), "dining");
      return res.json({ slots: bookedSlots, totalTables: DINING_TABLE_COUNT });
    }
    // For pool/snooker: per-table availability check requires a table number
    const bookedSlots = await storage.getBookedSlots(String(date), String(tableType), tableNumber ? String(tableNumber) : undefined);
    res.json({ slots: bookedSlots, totalTables: tableNumber ? 1 : POOL_TABLE_COUNT });
  });

  // Staff notices
  app.get("/api/staff-notices", staffAuth, async (_req, res) => {
    const notices = await storage.getStaffNotices();
    res.json(notices);
  });

  app.post("/api/staff-notices", staffAuth, managerAuth, async (req: any, res) => {
    const { message } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "Notice message is required" });
    }
    const createdBy = (req as any).staffUsername || "Manager";
    const notice = await storage.createStaffNotice(message.trim(), createdBy);
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
    if (tableNumber !== undefined) updateData.tableNumber = tableNumber;
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

  app.get("/api/events", async (req, res) => {
    try {
      const eventType = req.query.type as string | undefined;
      const allEvents = await storage.getActiveEvents(eventType);
      res.json(allEvents);
    } catch (err) {
      console.error("Events fetch error:", err);
      res.json([]);
    }
  });

  app.get("/api/events/all", staffAuth, managerAuth, async (_req, res) => {
    const allEvents = await storage.getEvents();
    res.json(allEvents);
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

  app.get("/api/banner-images", async (_req, res) => {
    const images = await storage.getBannerImages();
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
        const image = await storage.createBannerImage({
          imageUrl,
          title: req.body.title?.trim() || null,
          sortOrder: isNaN(sortOrder) ? 0 : sortOrder,
          active,
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
<p><strong>Name:</strong> ${parsed.data.name}</p>
<p><strong>Email:</strong> ${parsed.data.email}</p>
<p><strong>Phone:</strong> ${parsed.data.phone || "Not provided"}</p>
<p><strong>Subject:</strong> ${parsed.data.subject}</p>
<p><strong>Message:</strong></p>
<p>${parsed.data.message.replace(/\n/g, "<br>")}</p>
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

  app.post("/api/loyalty/send-code", async (req, res) => {
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
    res.status(200).send(html);
  });

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
      const customer = await storage.createCustomer(email, name.trim(), phone?.trim() || null, passwordHash);
      const token = randomBytes(48).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await storage.createCustomerSession(token, customer.id, expiresAt);
      res.status(201).json({
        token,
        customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
      });
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
        customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
      });
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
    res.json({ id: customer.id, name: customer.name, email: customer.email, phone: customer.phone });
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
    res.json({ success: true, booking: updated });
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

  const httpServer = createServer(app);
  return httpServer;
}
