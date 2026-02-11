import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { storage } from "./storage";
import { insertOfferSchema, insertPushTokenSchema, insertBookingSchema } from "@shared/schema";

const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;
const ATTEMPT_WINDOW = 10 * 60 * 1000;

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
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/staff/login", async (req, res) => {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.setHeader("Retry-After", String(rateCheck.retryAfter));
      return res.status(429).json({
        message: `Too many login attempts. Please try again in ${Math.ceil((rateCheck.retryAfter || 900) / 60)} minutes.`,
      });
    }

    const { pin } = req.body;
    if (!pin || typeof pin !== "string") {
      return res.status(400).json({ message: "PIN is required" });
    }

    if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      recordFailedLogin(clientIp);
      return res.status(401).json({ message: "Incorrect PIN" });
    }

    const staffPin = process.env.STAFF_PIN;
    if (!staffPin) {
      return res.status(503).json({ message: "Staff access not configured" });
    }

    if (!timingSafeCompare(pin, staffPin)) {
      recordFailedLogin(clientIp);
      return res.status(401).json({ message: "Incorrect PIN" });
    }

    clearFailedLogins(clientIp);
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const session = await storage.createStaffSession(token, expiresAt);

    res.json({ token: session.token, expiresAt: session.expiresAt });
  });

  app.post("/api/staff/logout", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      await storage.invalidateStaffSession(authHeader.slice(7));
    }
    res.status(204).send();
  });

  app.get("/api/staff/verify", staffAuth, async (_req, res) => {
    res.json({ authenticated: true });
  });

  app.get("/api/offers", async (_req, res) => {
    const offers = await storage.getOffers();
    res.json(offers);
  });

  app.get("/api/offers/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const offer = await storage.getOffer(id);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    res.json(offer);
  });

  app.post("/api/offers", staffAuth, async (req, res) => {
    const parsed = insertOfferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid offer data", errors: parsed.error.flatten() });
    }
    const offer = await storage.createOffer(parsed.data);
    res.status(201).json(offer);
  });

  app.put("/api/offers/:id", staffAuth, async (req, res) => {
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

  app.delete("/api/offers/:id", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const deleted = await storage.deleteOffer(id);
    if (!deleted) return res.status(404).json({ message: "Offer not found" });
    res.status(204).send();
  });

  app.post("/api/push-tokens", async (req, res) => {
    const parsed = insertPushTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid token data" });
    }
    const token = await storage.registerPushToken(parsed.data);
    res.status(201).json(token);
  });

  app.delete("/api/push-tokens/:token", staffAuth, async (req, res) => {
    const deleted = await storage.removePushToken(req.params.token as string);
    if (!deleted) return res.status(404).json({ message: "Token not found" });
    res.status(204).send();
  });

  app.get("/api/push-tokens", staffAuth, async (_req, res) => {
    const tokens = await storage.getAllPushTokens();
    res.json(tokens);
  });

  app.post("/api/notifications/send", staffAuth, async (req, res) => {
    const { title, body } = req.body;
    if (!title || !body) {
      return res.status(400).json({ message: "Title and body are required" });
    }

    const tokens = await storage.getAllPushTokens();
    if (tokens.length === 0) {
      return res.status(400).json({ message: "No registered devices" });
    }

    const messages = tokens.map((t) => ({
      to: t.token,
      sound: "default" as const,
      title,
      body,
    }));

    const chunks: typeof messages[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      chunks.push(messages.slice(i, i + 100));
    }

    let successCount = 0;
    for (const chunk of chunks) {
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chunk),
        });
        if (response.ok) {
          successCount += chunk.length;
        }
      } catch (err) {
        console.error("Push send error:", err);
      }
    }

    const notification = await storage.saveNotification(title, body, successCount);
    res.json({ sent: successCount, total: tokens.length, notification });
  });

  app.get("/api/notifications/history", staffAuth, async (_req, res) => {
    const history = await storage.getNotificationHistory();
    res.json(history);
  });

  app.post("/api/bookings", async (req, res) => {
    const parsed = insertBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid booking data", errors: parsed.error.flatten() });
    }
    if (!parsed.data.gdprConsent) {
      return res.status(400).json({ message: "GDPR consent is required to process your booking" });
    }
    const bookedSlots = await storage.getBookedSlots(parsed.data.date, parsed.data.tableType, parsed.data.tableNumber ?? undefined);
    const requestedStart = parseInt(parsed.data.startTime.replace(":", ""));
    const requestedEnd = requestedStart + (parsed.data.duration ?? 1) * 100;
    for (const slot of bookedSlots) {
      const slotStart = parseInt(slot.startTime.replace(":", ""));
      const slotEnd = slotStart + slot.duration * 100;
      if (requestedStart < slotEnd && requestedEnd > slotStart) {
        return res.status(409).json({ message: "This time slot is already booked" });
      }
    }
    const booking = await storage.createBooking(parsed.data);
    res.status(201).json(booking);
  });

  app.get("/api/bookings/availability", async (req, res) => {
    const { date, tableType, tableNumber } = req.query;
    if (!date || !tableType) {
      return res.status(400).json({ message: "date and tableType are required" });
    }
    const bookedSlots = await storage.getBookedSlots(String(date), String(tableType), tableNumber ? String(tableNumber) : undefined);
    res.json(bookedSlots);
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
    res.json(booking);
  });

  app.put("/api/bookings/:id", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const existing = await storage.getBooking(id);
    if (!existing) return res.status(404).json({ message: "Booking not found" });
    const { customerName, customerEmail, customerPhone, tableType, tableNumber, date, startTime, duration, notes, status } = req.body;
    const updateData: any = {};
    if (customerName !== undefined) updateData.customerName = customerName;
    if (customerEmail !== undefined) updateData.customerEmail = customerEmail;
    if (customerPhone !== undefined) updateData.customerPhone = customerPhone;
    if (tableType !== undefined) updateData.tableType = tableType;
    if (tableNumber !== undefined) updateData.tableNumber = tableNumber;
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

  app.get("/api/gdpr/export", async (req, res) => {
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

  app.delete("/api/gdpr/erase", staffAuth, async (req, res) => {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Email address is required" });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    const deletedCount = await storage.deleteBookingsByEmail(email);
    res.json({
      message: `Erasure complete under UK GDPR Article 17`,
      recordsDeleted: deletedCount,
      email,
      erasureDate: new Date().toISOString(),
    });
  });

  app.post("/api/gdpr/retention-cleanup", staffAuth, async (_req, res) => {
    const anonymized = await storage.anonymizeOldBookings(90);
    const sessionsCleared = await storage.cleanupExpiredSessions();
    res.json({
      message: "Data retention policy applied",
      bookingsAnonymized: anonymized,
      expiredSessionsCleared: sessionsCleared,
      retentionPeriodDays: 90,
    });
  });

  app.get("/staff", (_req, res) => {
    const templatePath = path.resolve(process.cwd(), "server", "templates", "staff-dashboard.html");
    const html = fs.readFileSync(templatePath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });

  const httpServer = createServer(app);
  return httpServer;
}
