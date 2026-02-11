import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
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

export const staffUsers = pgTable("staff_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  pinSalt: text("pin_salt").notNull(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  active: boolean("active").notNull().default(true),
});

export type StaffUser = typeof staffUsers.$inferSelect;

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

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  emailHash: text("email_hash"),
  tableType: text("table_type").notNull(),
  tableNumber: text("table_number"),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  duration: serial("duration").notNull(),
  status: text("status").notNull().default("confirmed"),
  notes: text("notes"),
  gdprConsent: boolean("gdpr_consent").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBookingSchema = createInsertSchema(bookings).omit({ id: true, createdAt: true });

export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;

export const staffSessions = pgTable("staff_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  staffUserId: integer("staff_user_id"),
  staffUsername: text("staff_username"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  active: boolean("active").notNull().default(true),
});

export type StaffSession = typeof staffSessions.$inferSelect;

export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContactMessageSchema = createInsertSchema(contactMessages).omit({ id: true, createdAt: true, status: true });

export type InsertContactMessage = z.infer<typeof insertContactMessageSchema>;
export type ContactMessage = typeof contactMessages.$inferSelect;
