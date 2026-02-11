import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const offers = pgTable("offers", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull(),
  discount: text("discount").notNull(),
  validUntil: text("valid_until").notNull(),
  gradientStart: text("gradient_start").notNull().default("#0047AB"),
  gradientEnd: text("gradient_end").notNull().default("#1E6FD9"),
  icon: text("icon").notNull().default("pricetag"),
});

export const insertOfferSchema = createInsertSchema(offers).omit({ id: true });

export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offers.$inferSelect;

export const pushTokens = pgTable("push_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  deviceName: text("device_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPushTokenSchema = createInsertSchema(pushTokens).omit({ id: true, createdAt: true });

export type InsertPushToken = z.infer<typeof insertPushTokenSchema>;
export type PushToken = typeof pushTokens.$inferSelect;

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  recipientCount: serial("recipient_count"),
});

export type Notification = typeof notifications.$inferSelect;
