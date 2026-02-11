import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";
import { insertOfferSchema, insertPushTokenSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
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

  app.post("/api/offers", async (req, res) => {
    const parsed = insertOfferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid offer data", errors: parsed.error.flatten() });
    }
    const offer = await storage.createOffer(parsed.data);
    res.status(201).json(offer);
  });

  app.put("/api/offers/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const parsed = insertOfferSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid offer data", errors: parsed.error.flatten() });
    }
    const offer = await storage.updateOffer(id, parsed.data);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    res.json(offer);
  });

  app.delete("/api/offers/:id", async (req, res) => {
    const id = parseInt(req.params.id);
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

  app.delete("/api/push-tokens/:token", async (req, res) => {
    const deleted = await storage.removePushToken(req.params.token);
    if (!deleted) return res.status(404).json({ message: "Token not found" });
    res.status(204).send();
  });

  app.get("/api/push-tokens", async (_req, res) => {
    const tokens = await storage.getAllPushTokens();
    res.json(tokens);
  });

  app.post("/api/notifications/send", async (req, res) => {
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

  app.get("/api/notifications/history", async (_req, res) => {
    const history = await storage.getNotificationHistory();
    res.json(history);
  });

  const httpServer = createServer(app);
  return httpServer;
}
