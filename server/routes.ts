import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { storage } from "./storage";
import { insertOfferSchema, insertPushTokenSchema, insertBookingSchema } from "@shared/schema";

async function staffAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const token = authHeader.slice(7);
  const session = await storage.validateStaffSession(token);
  if (!session) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/staff/login", async (req, res) => {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ message: "PIN is required" });
    }

    const staffPin = process.env.STAFF_PIN;
    if (!staffPin) {
      return res.status(503).json({ message: "Staff access not configured" });
    }

    if (pin !== staffPin) {
      return res.status(401).json({ message: "Incorrect PIN" });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
    const bookedSlots = await storage.getBookedSlots(parsed.data.date, parsed.data.tableType);
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
    const { date, tableType } = req.query;
    if (!date || !tableType) {
      return res.status(400).json({ message: "date and tableType are required" });
    }
    const bookedSlots = await storage.getBookedSlots(String(date), String(tableType));
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

  app.delete("/api/bookings/:id", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const deleted = await storage.deleteBooking(id);
    if (!deleted) return res.status(404).json({ message: "Booking not found" });
    res.status(204).send();
  });

  const httpServer = createServer(app);
  return httpServer;
}
