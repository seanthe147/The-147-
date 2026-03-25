var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/schema.ts
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var users, insertUserSchema, staffUsers, offers, insertOfferSchema, pushTokens, insertPushTokenSchema, notifications, bookings, insertBookingSchema, staffSessions, contactMessages, insertContactMessageSchema, events, insertEventSchema, siteSettings, customers, insertCustomerSchema, customerSessions, bannerImages, insertBannerImageSchema, staffNotices, insertStaffNoticeSchema, blockedPeriods, insertBlockedPeriodSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    users = pgTable("users", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      username: text("username").notNull().unique(),
      password: text("password").notNull()
    });
    insertUserSchema = createInsertSchema(users).pick({
      username: true,
      password: true
    });
    staffUsers = pgTable("staff_users", {
      id: serial("id").primaryKey(),
      username: text("username").notNull().unique(),
      pinHash: text("pin_hash").notNull(),
      pinSalt: text("pin_salt").notNull(),
      displayName: text("display_name"),
      role: text("role").notNull().default("staff"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      active: boolean("active").notNull().default(true),
      approvalStatus: text("approval_status").notNull().default("approved")
    });
    offers = pgTable("offers", {
      id: serial("id").primaryKey(),
      title: text("title").notNull(),
      subtitle: text("subtitle").notNull(),
      discount: text("discount").notNull(),
      validUntil: text("valid_until").notNull(),
      gradientStart: text("gradient_start").notNull().default("#0047AB"),
      gradientEnd: text("gradient_end").notNull().default("#1E6FD9"),
      icon: text("icon").notNull().default("pricetag")
    });
    insertOfferSchema = createInsertSchema(offers).omit({ id: true });
    pushTokens = pgTable("push_tokens", {
      id: serial("id").primaryKey(),
      token: text("token").notNull().unique(),
      deviceName: text("device_name"),
      customerEmail: text("customer_email"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertPushTokenSchema = createInsertSchema(pushTokens).omit({ id: true, createdAt: true });
    notifications = pgTable("notifications", {
      id: serial("id").primaryKey(),
      title: text("title").notNull(),
      body: text("body").notNull(),
      sentAt: timestamp("sent_at").defaultNow().notNull(),
      recipientCount: serial("recipient_count"),
      sentBy: text("sent_by")
    });
    bookings = pgTable("bookings", {
      id: serial("id").primaryKey(),
      customerName: text("customer_name").notNull(),
      customerEmail: text("customer_email").notNull(),
      customerPhone: text("customer_phone").notNull(),
      emailHash: text("email_hash"),
      tableType: text("table_type").notNull(),
      tableNumber: text("table_number"),
      guestCount: integer("guest_count"),
      date: text("date").notNull(),
      startTime: text("start_time").notNull(),
      duration: serial("duration").notNull(),
      status: text("status").notNull().default("confirmed"),
      notes: text("notes"),
      gdprConsent: boolean("gdpr_consent").notNull().default(false),
      reminderSent: boolean("reminder_sent").default(false).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertBookingSchema = createInsertSchema(bookings).omit({ id: true, createdAt: true }).extend({
      tableNumber: z.string().nullable().optional(),
      guestCount: z.number().int().nullable().optional(),
      notes: z.string().nullable().optional(),
      emailHash: z.string().nullable().optional()
    });
    staffSessions = pgTable("staff_sessions", {
      id: serial("id").primaryKey(),
      token: text("token").notNull().unique(),
      staffUserId: integer("staff_user_id"),
      staffUsername: text("staff_username"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      expiresAt: timestamp("expires_at").notNull(),
      active: boolean("active").notNull().default(true)
    });
    contactMessages = pgTable("contact_messages", {
      id: serial("id").primaryKey(),
      name: text("name").notNull(),
      email: text("email").notNull(),
      phone: text("phone"),
      subject: text("subject").notNull(),
      message: text("message").notNull(),
      status: text("status").notNull().default("new"),
      gdprConsent: boolean("gdpr_consent").notNull().default(false),
      pushToken: text("push_token"),
      staffReply: text("staff_reply"),
      repliedAt: timestamp("replied_at"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertContactMessageSchema = createInsertSchema(contactMessages).omit({ id: true, createdAt: true, status: true });
    events = pgTable("events", {
      id: serial("id").primaryKey(),
      title: text("title").notNull(),
      description: text("description"),
      date: text("date"),
      time: text("time"),
      endTime: text("end_time"),
      ticketUrl: text("ticket_url"),
      imageColor: text("image_color").notNull().default("#0047AB"),
      active: boolean("active").notNull().default(true),
      eventType: text("event_type").notNull().default("event"),
      dayOfWeek: text("day_of_week"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true });
    siteSettings = pgTable("site_settings", {
      key: text("key").primaryKey(),
      value: text("value").notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    customers = pgTable("customers", {
      id: serial("id").primaryKey(),
      email: text("email").notNull().unique(),
      name: text("name").notNull(),
      phone: text("phone"),
      passwordHash: text("password_hash").notNull(),
      privacyConsentAt: timestamp("privacy_consent_at"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
    customerSessions = pgTable("customer_sessions", {
      id: serial("id").primaryKey(),
      token: text("token").notNull().unique(),
      customerId: integer("customer_id").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      expiresAt: timestamp("expires_at").notNull(),
      active: boolean("active").notNull().default(true)
    });
    bannerImages = pgTable("banner_images", {
      id: serial("id").primaryKey(),
      imageUrl: text("image_url").notNull(),
      title: text("title"),
      sortOrder: integer("sort_order").notNull().default(0),
      active: boolean("active").notNull().default(true),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertBannerImageSchema = createInsertSchema(bannerImages).omit({ id: true, createdAt: true });
    staffNotices = pgTable("staff_notices", {
      id: serial("id").primaryKey(),
      message: text("message").notNull(),
      createdBy: text("created_by").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      deletedAt: timestamp("deleted_at"),
      deletedBy: text("deleted_by")
    });
    insertStaffNoticeSchema = createInsertSchema(staffNotices).omit({ id: true, createdAt: true });
    blockedPeriods = pgTable("blocked_periods", {
      id: serial("id").primaryKey(),
      label: text("label"),
      tableType: text("table_type"),
      date: text("date"),
      dayOfWeek: integer("day_of_week"),
      startTime: text("start_time"),
      endTime: text("end_time"),
      createdBy: text("created_by").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertBlockedPeriodSchema = createInsertSchema(blockedPeriods).omit({ id: true, createdAt: true });
  }
});

// server/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync } from "node:crypto";
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  return createHash("sha256").update(key).digest();
}
function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return "enc:" + combined.toString("base64");
}
function decrypt(ciphertext) {
  if (!ciphertext) return ciphertext;
  if (!ciphertext.startsWith("enc:")) {
    return ciphertext;
  }
  const key = getEncryptionKey();
  const combined = Buffer.from(ciphertext.slice(4), "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
function hashEmail(email) {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}
function hashPin(pin, salt) {
  const useSalt = salt || randomBytes(SALT_LENGTH).toString("hex");
  const derived = scryptSync(pin, useSalt, 64);
  return { hash: derived.toString("hex"), salt: useSalt };
}
function verifyPin(pin, storedHash, salt) {
  const { hash } = hashPin(pin, salt);
  if (hash.length !== storedHash.length) return false;
  const bufA = Buffer.from(hash);
  const bufB = Buffer.from(storedHash);
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}
var ALGORITHM, IV_LENGTH, AUTH_TAG_LENGTH, SALT_LENGTH;
var init_encryption = __esm({
  "server/encryption.ts"() {
    "use strict";
    ALGORITHM = "aes-256-gcm";
    IV_LENGTH = 16;
    AUTH_TAG_LENGTH = 16;
    SALT_LENGTH = 16;
  }
});

// server/storage.ts
var storage_exports = {};
__export(storage_exports, {
  DatabaseStorage: () => DatabaseStorage,
  storage: () => storage
});
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, lt, lte, sql as sql2, and, gt, isNull, isNotNull, gte, desc } from "drizzle-orm";
function buildPoolConfig() {
  const rawUrl = process.env.DATABASE_URL;
  const url = new URL(rawUrl);
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");
  if (sslmode === "disable" || sslmode === null) {
    return { connectionString: url.toString() };
  }
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false }
  };
}
function encryptBookingFields(booking) {
  return {
    ...booking,
    customerName: encrypt(booking.customerName),
    customerEmail: encrypt(booking.customerEmail),
    customerPhone: encrypt(booking.customerPhone),
    emailHash: hashEmail(booking.customerEmail)
  };
}
function decryptBookingFields(booking) {
  return {
    ...booking,
    customerName: decrypt(booking.customerName),
    customerEmail: decrypt(booking.customerEmail),
    customerPhone: decrypt(booking.customerPhone)
  };
}
var pool, db, DatabaseStorage, storage;
var init_storage = __esm({
  "server/storage.ts"() {
    "use strict";
    init_schema();
    init_encryption();
    pool = new Pool(buildPoolConfig());
    db = drizzle(pool);
    DatabaseStorage = class {
      async getUser(id) {
        const [user] = await db.select().from(users).where(eq(users.id, id));
        return user;
      }
      async getUserByUsername(username) {
        const [user] = await db.select().from(users).where(eq(users.username, username));
        return user;
      }
      async createUser(insertUser) {
        const [user] = await db.insert(users).values(insertUser).returning();
        return user;
      }
      async getOffers() {
        return db.select().from(offers);
      }
      async getOffer(id) {
        const [offer] = await db.select().from(offers).where(eq(offers.id, id));
        return offer;
      }
      async createOffer(offer) {
        const [created] = await db.insert(offers).values(offer).returning();
        return created;
      }
      async updateOffer(id, data) {
        const [updated] = await db.update(offers).set(data).where(eq(offers.id, id)).returning();
        return updated;
      }
      async deleteOffer(id) {
        const result = await db.delete(offers).where(eq(offers.id, id)).returning();
        return result.length > 0;
      }
      async registerPushToken(data) {
        const [existing] = await db.select().from(pushTokens).where(eq(pushTokens.token, data.token));
        if (existing) {
          if (data.customerEmail && existing.customerEmail !== data.customerEmail) {
            const [updated] = await db.update(pushTokens).set({ customerEmail: data.customerEmail }).where(eq(pushTokens.token, data.token)).returning();
            return updated;
          }
          return existing;
        }
        const [created] = await db.insert(pushTokens).values(data).returning();
        return created;
      }
      async getAllPushTokens() {
        return db.select().from(pushTokens);
      }
      async removePushToken(token) {
        const result = await db.delete(pushTokens).where(eq(pushTokens.token, token)).returning();
        return result.length > 0;
      }
      async getPushTokensByEmail(email) {
        return db.select().from(pushTokens).where(sql2`lower(${pushTokens.customerEmail}) = lower(${email})`);
      }
      async saveNotification(title, body, recipientCount, sentBy) {
        const [created] = await db.insert(notifications).values({ title, body, recipientCount, sentBy }).returning();
        return created;
      }
      async getNotificationHistory() {
        return db.select().from(notifications).orderBy(notifications.sentAt);
      }
      async createBooking(booking) {
        const encrypted = encryptBookingFields(booking);
        const [created] = await db.insert(bookings).values(encrypted).returning();
        return decryptBookingFields(created);
      }
      async getBookings() {
        const results = await db.select().from(bookings).orderBy(bookings.date, bookings.startTime);
        return results.map(decryptBookingFields);
      }
      async getBookingsByDate(date) {
        const results = await db.select().from(bookings).where(eq(bookings.date, date)).orderBy(bookings.startTime);
        return results.map(decryptBookingFields);
      }
      async getBooking(id) {
        const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
        return booking ? decryptBookingFields(booking) : void 0;
      }
      async updateBookingStatus(id, status) {
        const [updated] = await db.update(bookings).set({ status }).where(eq(bookings.id, id)).returning();
        return updated ? decryptBookingFields(updated) : void 0;
      }
      async updateBooking(id, data) {
        const encData = { ...data };
        if (data.customerName) encData.customerName = encrypt(data.customerName);
        if (data.customerEmail) {
          encData.customerEmail = encrypt(data.customerEmail);
          encData.emailHash = hashEmail(data.customerEmail);
        }
        if (data.customerPhone) encData.customerPhone = encrypt(data.customerPhone);
        const [updated] = await db.update(bookings).set(encData).where(eq(bookings.id, id)).returning();
        return updated ? decryptBookingFields(updated) : void 0;
      }
      async deleteBooking(id) {
        const result = await db.delete(bookings).where(eq(bookings.id, id)).returning();
        return result.length > 0;
      }
      async getBookedSlots(date, tableType, tableNumber) {
        const conditions = [
          eq(bookings.date, date),
          eq(bookings.tableType, tableType),
          eq(bookings.status, "confirmed")
        ];
        if (tableNumber) {
          conditions.push(eq(bookings.tableNumber, tableNumber));
        }
        const results = await db.select({ startTime: bookings.startTime, duration: bookings.duration }).from(bookings).where(and(...conditions));
        return results;
      }
      async getBookingsDueReminder(windowStartMins, windowEndMins) {
        const now = /* @__PURE__ */ new Date();
        const today = now.toISOString().split("T")[0];
        const fmt = (d) => `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
        const startStr = fmt(new Date(now.getTime() + windowStartMins * 6e4));
        const endStr = fmt(new Date(now.getTime() + windowEndMins * 6e4));
        const results = await db.select().from(bookings).where(
          and(
            eq(bookings.date, today),
            eq(bookings.status, "confirmed"),
            eq(bookings.reminderSent, false),
            gte(bookings.startTime, startStr),
            lte(bookings.startTime, endStr)
          )
        );
        return results.map(decryptBookingFields);
      }
      async markReminderSent(id) {
        await db.update(bookings).set({ reminderSent: true }).where(eq(bookings.id, id));
      }
      async createStaffSession(token, expiresAt, staffUserId, staffUsername) {
        const [session] = await db.insert(staffSessions).values({
          token,
          expiresAt,
          staffUserId: staffUserId ?? null,
          staffUsername: staffUsername ?? null
        }).returning();
        return session;
      }
      async validateStaffSession(token) {
        const [session] = await db.select().from(staffSessions).where(
          and(
            eq(staffSessions.token, token),
            eq(staffSessions.active, true),
            gt(staffSessions.expiresAt, /* @__PURE__ */ new Date())
          )
        );
        return session;
      }
      async invalidateStaffSession(token) {
        const result = await db.update(staffSessions).set({ active: false }).where(eq(staffSessions.token, token)).returning();
        return result.length > 0;
      }
      async getBookingsByEmail(email) {
        const hash = hashEmail(email);
        const byHash = await db.select().from(bookings).where(eq(bookings.emailHash, hash)).orderBy(bookings.date);
        if (byHash.length > 0) {
          return byHash.map(decryptBookingFields);
        }
        const byPlain = await db.select().from(bookings).where(sql2`lower(${bookings.customerEmail}) = lower(${email})`).orderBy(bookings.date);
        return byPlain.map(decryptBookingFields);
      }
      async deleteBookingsByEmail(email) {
        const hash = hashEmail(email);
        const byHash = await db.delete(bookings).where(eq(bookings.emailHash, hash)).returning();
        if (byHash.length > 0) return byHash.length;
        const byPlain = await db.delete(bookings).where(sql2`lower(${bookings.customerEmail}) = lower(${email})`).returning();
        return byPlain.length;
      }
      async anonymizeOldBookings(retentionDays) {
        const cutoffDate = /* @__PURE__ */ new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        const cutoffStr = cutoffDate.toISOString().split("T")[0];
        const oldBookings = await db.select().from(bookings).where(lt(bookings.date, cutoffStr));
        let count = 0;
        for (const booking of oldBookings) {
          const decryptedName = decrypt(booking.customerName);
          if (decryptedName !== "ANONYMIZED") {
            await db.update(bookings).set({
              customerName: "ANONYMIZED",
              customerEmail: "anonymized@removed.local",
              customerPhone: "000000",
              emailHash: null,
              notes: null
            }).where(eq(bookings.id, booking.id));
            count++;
          }
        }
        const contactCutoff = /* @__PURE__ */ new Date();
        contactCutoff.setDate(contactCutoff.getDate() - retentionDays);
        const oldMessages = await db.select().from(contactMessages).where(lt(contactMessages.createdAt, contactCutoff));
        for (const msg of oldMessages) {
          if (msg.name !== "ANONYMIZED") {
            await db.update(contactMessages).set({
              name: "ANONYMIZED",
              email: "anonymized@removed.local",
              phone: null,
              message: "[Deleted after 90-day retention period]"
            }).where(eq(contactMessages.id, msg.id));
            count++;
          }
        }
        return count;
      }
      async cleanupExpiredSessions() {
        const result = await db.delete(staffSessions).where(
          lte(staffSessions.expiresAt, /* @__PURE__ */ new Date())
        ).returning();
        return result.length;
      }
      async createStaffUser(username, pinHash, pinSalt, displayName, role, approvalStatus) {
        const [user] = await db.insert(staffUsers).values({
          username: username.toLowerCase().trim(),
          pinHash,
          pinSalt,
          displayName: displayName || null,
          role: role === "owner" ? "owner" : role === "manager" ? "manager" : "staff",
          approvalStatus: approvalStatus || "approved"
        }).returning();
        return user;
      }
      async updateStaffApproval(id, approvalStatus) {
        const [updated] = await db.update(staffUsers).set({ approvalStatus }).where(eq(staffUsers.id, id)).returning();
        return updated;
      }
      async getStaffUserByUsername(username) {
        const [user] = await db.select().from(staffUsers).where(
          eq(staffUsers.username, username.toLowerCase().trim())
        );
        return user;
      }
      async getAllStaffUsers() {
        return db.select().from(staffUsers).orderBy(staffUsers.createdAt);
      }
      async setStaffActive(id, active) {
        const [updated] = await db.update(staffUsers).set({ active }).where(eq(staffUsers.id, id)).returning();
        return updated;
      }
      async deleteStaffUser(id) {
        const [deleted] = await db.delete(staffUsers).where(eq(staffUsers.id, id)).returning();
        return !!deleted;
      }
      async updateStaffRole(username, newRole) {
        const [updated] = await db.update(staffUsers).set({ role: newRole }).where(eq(staffUsers.username, username.toLowerCase().trim())).returning();
        return updated;
      }
      async updateStaffPin(username, pinHash, pinSalt) {
        const [updated] = await db.update(staffUsers).set({ pinHash, pinSalt }).where(eq(staffUsers.username, username.toLowerCase().trim())).returning();
        return updated;
      }
      async migrateEncryptExistingBookings() {
        const allBookings = await db.select().from(bookings);
        let migrated = 0;
        for (const booking of allBookings) {
          if (booking.customerName === "ANONYMIZED") continue;
          if (booking.customerEmail.startsWith("enc:")) continue;
          const encName = encrypt(booking.customerName);
          const encEmail = encrypt(booking.customerEmail);
          const encPhone = encrypt(booking.customerPhone);
          const eHash = hashEmail(booking.customerEmail);
          await db.update(bookings).set({
            customerName: encName,
            customerEmail: encEmail,
            customerPhone: encPhone,
            emailHash: eHash
          }).where(eq(bookings.id, booking.id));
          migrated++;
        }
        return migrated;
      }
      async getEvents() {
        return db.select().from(events).orderBy(events.date);
      }
      async getActiveEvents(eventType) {
        if (eventType) {
          return db.select().from(events).where(and(eq(events.active, true), eq(events.eventType, eventType))).orderBy(events.date);
        }
        return db.select().from(events).where(eq(events.active, true)).orderBy(events.date);
      }
      async getEvent(id) {
        const [event] = await db.select().from(events).where(eq(events.id, id));
        return event;
      }
      async createEvent(data) {
        const [created] = await db.insert(events).values(data).returning();
        return created;
      }
      async updateEvent(id, data) {
        const [updated] = await db.update(events).set(data).where(eq(events.id, id)).returning();
        return updated;
      }
      async deleteEvent(id) {
        const result = await db.delete(events).where(eq(events.id, id)).returning();
        return result.length > 0;
      }
      async createContactMessage(data) {
        const [created] = await db.insert(contactMessages).values(data).returning();
        return created;
      }
      async getContactMessages() {
        return db.select().from(contactMessages).orderBy(contactMessages.createdAt);
      }
      async updateContactMessageStatus(id, status) {
        const [updated] = await db.update(contactMessages).set({ status }).where(eq(contactMessages.id, id)).returning();
        return updated;
      }
      async replyToContactMessage(id, replyText) {
        const [updated] = await db.update(contactMessages).set({ staffReply: replyText, repliedAt: /* @__PURE__ */ new Date(), status: "replied" }).where(eq(contactMessages.id, id)).returning();
        return updated;
      }
      async getContactMessage(id) {
        const [msg] = await db.select().from(contactMessages).where(eq(contactMessages.id, id));
        return msg;
      }
      async getSetting(key) {
        const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
        return row?.value ?? null;
      }
      async setSetting(key, value) {
        await db.insert(siteSettings).values({ key, value, updatedAt: /* @__PURE__ */ new Date() }).onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: /* @__PURE__ */ new Date() } });
      }
      async getAllSettings() {
        const rows = await db.select().from(siteSettings);
        const result = {};
        for (const row of rows) result[row.key] = row.value;
        return result;
      }
      async getBannerImages() {
        return db.select().from(bannerImages).where(eq(bannerImages.active, true)).orderBy(bannerImages.sortOrder);
      }
      async getAllBannerImages() {
        return db.select().from(bannerImages).orderBy(bannerImages.sortOrder);
      }
      async createBannerImage(data) {
        const [row] = await db.insert(bannerImages).values(data).returning();
        return row;
      }
      async updateBannerImage(id, data) {
        const [row] = await db.update(bannerImages).set(data).where(eq(bannerImages.id, id)).returning();
        return row;
      }
      async deleteBannerImage(id) {
        const [row] = await db.delete(bannerImages).where(eq(bannerImages.id, id)).returning();
        return !!row;
      }
      async createCustomer(email, name, phone, passwordHash) {
        const [customer] = await db.insert(customers).values({
          email: email.toLowerCase().trim(),
          name,
          phone,
          passwordHash,
          privacyConsentAt: /* @__PURE__ */ new Date()
        }).returning();
        return customer;
      }
      async getCustomerByEmail(email) {
        const [customer] = await db.select().from(customers).where(eq(customers.email, email.toLowerCase().trim()));
        return customer;
      }
      async getCustomerById(id) {
        const [customer] = await db.select().from(customers).where(eq(customers.id, id));
        return customer;
      }
      async updateCustomer(id, data) {
        const [updated] = await db.update(customers).set(data).where(eq(customers.id, id)).returning();
        return updated;
      }
      async deleteCustomer(id) {
        await db.delete(customerSessions).where(eq(customerSessions.customerId, id));
        const result = await db.delete(customers).where(eq(customers.id, id)).returning();
        return result.length > 0;
      }
      async createCustomerSession(token, customerId, expiresAt) {
        const [session] = await db.insert(customerSessions).values({
          token,
          customerId,
          expiresAt
        }).returning();
        return session;
      }
      async validateCustomerSession(token) {
        const [session] = await db.select().from(customerSessions).where(
          and(
            eq(customerSessions.token, token),
            eq(customerSessions.active, true),
            gt(customerSessions.expiresAt, /* @__PURE__ */ new Date())
          )
        );
        return session;
      }
      async invalidateCustomerSession(token) {
        const result = await db.update(customerSessions).set({ active: false }).where(eq(customerSessions.token, token)).returning();
        return result.length > 0;
      }
      async getStaffNotices() {
        return db.select().from(staffNotices).where(isNull(staffNotices.deletedAt)).orderBy(staffNotices.createdAt);
      }
      async getDeletedStaffNotices() {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3);
        return db.select().from(staffNotices).where(and(isNotNull(staffNotices.deletedAt), gte(staffNotices.deletedAt, cutoff))).orderBy(desc(staffNotices.deletedAt));
      }
      async createStaffNotice(message, createdBy) {
        const [notice] = await db.insert(staffNotices).values({ message, createdBy }).returning();
        return notice;
      }
      async deleteStaffNotice(id, deletedBy) {
        const result = await db.update(staffNotices).set({ deletedAt: /* @__PURE__ */ new Date(), deletedBy }).where(and(eq(staffNotices.id, id), isNull(staffNotices.deletedAt))).returning();
        return result.length > 0;
      }
      async getBlockedPeriods() {
        return db.select().from(blockedPeriods).orderBy(blockedPeriods.createdAt);
      }
      async createBlockedPeriod(data) {
        const [created] = await db.insert(blockedPeriods).values(data).returning();
        return created;
      }
      async deleteBlockedPeriod(id) {
        const result = await db.delete(blockedPeriods).where(eq(blockedPeriods.id, id)).returning();
        return result.length > 0;
      }
    };
    storage = new DatabaseStorage();
  }
});

// server/index.ts
import express from "express";

// server/routes.ts
init_storage();
init_schema();
init_encryption();
import { createServer } from "node:http";
import { randomBytes as randomBytes2, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import multer from "multer";
import sharp from "sharp";
import nodemailer from "nodemailer";

// server/square.ts
var SQUARE_BASE_URL = process.env.SQUARE_ENVIRONMENT === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
function getHeaders() {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN not configured");
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "Square-Version": "2024-01-18"
  };
}
async function squareRequest(method, path3, body) {
  const url = `${SQUARE_BASE_URL}${path3}`;
  const options = { method, headers: getHeaders() };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    const errorDetail = data.errors?.[0]?.detail || "Square API error";
    const errorCode = data.errors?.[0]?.code || "UNKNOWN";
    throw new SquareError(errorDetail, errorCode, response.status);
  }
  return data;
}
var SquareError = class extends Error {
  code;
  statusCode;
  constructor(message, code, statusCode) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
};
function toE164(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("44")) return `+${digits}`;
  if (digits.startsWith("0")) return `+44${digits.slice(1)}`;
  if (digits.length === 10 || digits.length === 11) return `+44${digits}`;
  return `+${digits}`;
}
async function getLoyaltyProgram() {
  const data = await squareRequest("GET", "/v2/loyalty/programs");
  const program = data.programs?.[0] || data.program;
  if (!program) return null;
  return program;
}
async function searchLoyaltyAccount(phone) {
  const e164Phone = toE164(phone);
  const data = await squareRequest("POST", "/v2/loyalty/accounts/search", {
    query: {
      mappings: [{ phone_number: e164Phone }]
    }
  });
  return data.loyalty_accounts?.[0] || null;
}
async function createLoyaltyAccount(phone, programId) {
  const e164Phone = toE164(phone);
  const data = await squareRequest("POST", "/v2/loyalty/accounts", {
    loyalty_account: {
      program_id: programId,
      mapping: { phone_number: e164Phone }
    },
    idempotency_key: `create-${e164Phone}-${Date.now()}`
  });
  return data.loyalty_account;
}
async function getLoyaltyAccount(accountId) {
  const data = await squareRequest("GET", `/v2/loyalty/accounts/${accountId}`);
  return data.loyalty_account;
}
async function accumulateLoyaltyPoints(accountId, points, idempotencyKey) {
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) throw new Error("SQUARE_LOCATION_ID not configured");
  const data = await squareRequest("POST", `/v2/loyalty/accounts/${accountId}/accumulate`, {
    accumulate_points: { points },
    location_id: locationId,
    idempotency_key: idempotencyKey
  });
  return data.event;
}
async function adjustLoyaltyPoints(accountId, points, reason, idempotencyKey) {
  const data = await squareRequest("POST", `/v2/loyalty/accounts/${accountId}/adjust`, {
    adjust_points: { points, reason },
    idempotency_key: idempotencyKey
  });
  return data.event;
}
async function redeemLoyaltyReward(accountId, rewardTierId, idempotencyKey) {
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) throw new Error("SQUARE_LOCATION_ID not configured");
  const data = await squareRequest("POST", "/v2/loyalty/rewards", {
    reward: {
      loyalty_account_id: accountId,
      reward_tier_id: rewardTierId
    },
    idempotency_key: idempotencyKey
  });
  return data.reward;
}
function isConfigured() {
  return !!(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID);
}

// server/routes.ts
var uploadsDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP and GIF images are allowed"));
    }
  }
});
var loginAttempts = /* @__PURE__ */ new Map();
var MAX_LOGIN_ATTEMPTS = 5;
var LOCKOUT_DURATION = 15 * 60 * 1e3;
var ATTEMPT_WINDOW = 10 * 60 * 1e3;
var sensitiveEndpointAttempts = /* @__PURE__ */ new Map();
var SENSITIVE_RATE_LIMIT = 10;
var SENSITIVE_RATE_WINDOW = 15 * 60 * 1e3;
function checkSensitiveRateLimit(ip) {
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
var loyaltyOtps = /* @__PURE__ */ new Map();
var loyaltySessions = /* @__PURE__ */ new Map();
var OTP_EXPIRY = 5 * 60 * 1e3;
var OTP_MAX_ATTEMPTS = 3;
var LOYALTY_SESSION_EXPIRY = 30 * 24 * 60 * 60 * 1e3;
function generateOtp() {
  const bytes = randomBytes2(3);
  const num = (bytes[0] * 65536 + bytes[1] * 256 + bytes[2]) % 1e6;
  return num.toString().padStart(6, "0");
}
function cleanupExpiredOtps() {
  const now = Date.now();
  for (const [key, val] of loyaltyOtps) {
    if (val.expiresAt <= now) loyaltyOtps.delete(key);
  }
}
function cleanupExpiredLoyaltySessions() {
  const now = Date.now();
  for (const [key, val] of loyaltySessions) {
    if (val.expiresAt <= now) loyaltySessions.delete(key);
  }
}
function validateLoyaltySession(token) {
  const session = loyaltySessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    loyaltySessions.delete(token);
    return null;
  }
  return session.phone;
}
var OTP_HTML = (code) => `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
  <h2 style="color: #0A1628; margin-bottom: 8px;">The 147 Loyalty</h2>
  <p style="color: #555; font-size: 15px;">Your verification code is:</p>
  <div style="background: #F5F5F5; border-radius: 12px; padding: 24px; text-align: center; margin: 20px 0;">
    <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #0047AB;">${code}</span>
  </div>
  <p style="color: #555; font-size: 14px;">This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="color: #999; font-size: 12px;">The 147 &mdash; Snooker, Bar &amp; Restaurant</p>
</div>`;
async function sendEmailViaSMTP(to, subject, html) {
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
async function sendOtpEmail(email, code) {
  const subject = "Your Loyalty Verification Code \u2014 The 147";
  const html = OTP_HTML(code);
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const fromName = process.env.RESEND_FROM_NAME || "The 147";
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: email, subject, html })
      });
      if (response.ok) {
        console.log(`[LOYALTY OTP] Email sent via Resend to ${email}`);
        return true;
      }
      const errorText = await response.text();
      console.warn(`[LOYALTY OTP] Resend failed (${response.status}): ${errorText} \u2014 trying SMTP fallback`);
    } catch (err) {
      console.warn("[LOYALTY OTP] Resend exception \u2014 trying SMTP fallback:", err);
    }
  }
  const smtpSent = await sendEmailViaSMTP(email, subject, html);
  if (smtpSent) return true;
  console.warn(`[LOYALTY OTP] All email methods failed. Manual code for ${email}: ${code}`);
  return false;
}
async function sendBookingConfirmationEmail(booking) {
  const resendKey = process.env.RESEND_API_KEY;
  const tableNames = {
    snooker: "Snooker Table",
    pool: "Pool Table",
    "american-pool": "American Pool Table",
    darts: "Darts Lane",
    shuffleboard: "Shuffleboard"
  };
  const tableName = tableNames[booking.tableType] || booking.tableType;
  const tableDisplay = booking.tableNumber ? `${tableName} #${booking.tableNumber}` : tableName;
  const dateObj = /* @__PURE__ */ new Date(booking.date + "T00:00:00");
  const dateFormatted = dateObj.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
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
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: booking.customerEmail, subject, html })
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
function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
}
function checkRateLimit(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return { allowed: true };
  if (entry.blockedUntil > Date.now()) {
    return { allowed: false, retryAfter: Math.ceil((entry.blockedUntil - Date.now()) / 1e3) };
  }
  if (entry.blockedUntil > 0 && entry.blockedUntil <= Date.now()) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }
  return { allowed: true };
}
function recordFailedLogin(ip) {
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
function clearFailedLogins(ip) {
  loginAttempts.delete(ip);
}
function timingSafeCompare(a, b) {
  const bufA = Buffer.from(a.padEnd(64, "\0"));
  const bufB = Buffer.from(b.padEnd(64, "\0"));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
async function staffAuth(req, res, next) {
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
    req.staffRole = user?.role || "staff";
    req.staffUsername = session.staffUsername;
  } else {
    req.staffRole = "manager";
    req.staffUsername = null;
  }
  next();
}
async function managerAuth(req, res, next) {
  const role = req.staffRole;
  if (role !== "manager" && role !== "owner") {
    return res.status(403).json({ message: "Manager access required" });
  }
  next();
}
async function ownerAuth(req, res, next) {
  if (req.staffRole !== "owner") {
    return res.status(403).json({ message: "Owner access required" });
  }
  next();
}
var customerLoginAttempts = /* @__PURE__ */ new Map();
function checkCustomerRateLimit(ip) {
  const now = Date.now();
  const record = customerLoginAttempts.get(ip);
  if (record && record.blockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((record.blockedUntil - now) / 1e3) };
  }
  if (record && now - record.blockedUntil > ATTEMPT_WINDOW) {
    customerLoginAttempts.delete(ip);
  }
  return { allowed: true };
}
function recordCustomerLoginFailure(ip) {
  const now = Date.now();
  const record = customerLoginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
  record.count++;
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.blockedUntil = now + LOCKOUT_DURATION;
    record.count = 0;
  }
  customerLoginAttempts.set(ip, record);
}
async function customerAuth(req, res, next) {
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
  req.customerId = customer.id;
  req.customerEmail = customer.email;
  next();
}
async function registerRoutes(app2) {
  app2.post("/api/staff/register", async (req, res) => {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.setHeader("Retry-After", String(rateCheck.retryAfter));
      return res.status(429).json({
        message: `Too many attempts. Please try again later.`
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
      displayName?.trim() || void 0,
      assignedRole,
      needsApproval ? "pending" : "approved"
    );
    clearFailedLogins(clientIp);
    res.status(201).json({
      message: needsApproval ? "Account created and awaiting manager approval before you can sign in." : "Staff account created",
      username: staffUser.username,
      displayName: staffUser.displayName,
      role: staffUser.role,
      approvalStatus: staffUser.approvalStatus
    });
  });
  app2.post("/api/staff/login", async (req, res) => {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.setHeader("Retry-After", String(rateCheck.retryAfter));
      return res.status(429).json({
        message: `Too many login attempts. Please try again in ${Math.ceil((rateCheck.retryAfter || 900) / 60)} minutes.`
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
      const token2 = randomBytes2(32).toString("hex");
      const expiresAt2 = new Date(Date.now() + 8 * 60 * 60 * 1e3);
      const session2 = await storage.createStaffSession(token2, expiresAt2, staffUser.id, staffUser.username);
      return res.json({
        token: session2.token,
        expiresAt: session2.expiresAt,
        username: staffUser.username,
        displayName: staffUser.displayName,
        role: staffUser.role
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
    const token = randomBytes2(32).toString("hex");
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1e3);
    const session = await storage.createStaffSession(token, expiresAt);
    res.json({ token: session.token, expiresAt: session.expiresAt, role: "manager" });
  });
  app2.post("/api/staff/logout", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      await storage.invalidateStaffSession(authHeader.slice(7));
    }
    res.status(204).send();
  });
  app2.get("/api/staff/verify", staffAuth, async (req, res) => {
    res.json({
      authenticated: true,
      role: req.staffRole || "staff",
      username: req.staffUsername || null
    });
  });
  app2.get("/api/staff/users", staffAuth, managerAuth, async (_req, res) => {
    const users2 = await storage.getAllStaffUsers();
    res.json(users2.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      createdAt: u.createdAt,
      active: u.active
    })));
  });
  app2.post("/api/staff/change-pin", staffAuth, async (req, res) => {
    const { currentPin, newPin } = req.body;
    const username = req.staffUsername;
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
  app2.post("/api/staff/reset-pin", staffAuth, managerAuth, async (req, res) => {
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
  app2.patch("/api/staff/update-role", staffAuth, ownerAuth, async (req, res) => {
    const { username, role } = req.body;
    if (!username || typeof username !== "string") {
      return res.status(400).json({ message: "Username is required" });
    }
    if (!role || !["staff", "manager", "owner"].includes(role)) {
      return res.status(400).json({ message: "Role must be 'staff', 'manager', or 'owner'" });
    }
    const currentUser = req.staffUsername;
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
  app2.patch("/api/staff/toggle-active", staffAuth, ownerAuth, async (req, res) => {
    const { id, active } = req.body;
    if (typeof id !== "number" || typeof active !== "boolean") {
      return res.status(400).json({ message: "id (number) and active (boolean) are required" });
    }
    const currentUser = req.staffUsername;
    const currentUserRecord = currentUser ? await storage.getStaffUserByUsername(currentUser) : null;
    if (currentUserRecord && currentUserRecord.id === id) {
      return res.status(400).json({ message: "You cannot lock your own account" });
    }
    const updated = await storage.setStaffActive(id, active);
    if (!updated) return res.status(404).json({ message: "Staff user not found" });
    res.json({ message: `Account ${active ? "unlocked" : "locked"} successfully`, user: { id: updated.id, username: updated.username, active: updated.active } });
  });
  app2.delete("/api/staff/:id", staffAuth, ownerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const currentUser = req.staffUsername;
    const currentUserRecord = currentUser ? await storage.getStaffUserByUsername(currentUser) : null;
    if (currentUserRecord && currentUserRecord.id === id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }
    const deleted = await storage.deleteStaffUser(id);
    if (!deleted) return res.status(404).json({ message: "Staff user not found" });
    res.json({ message: "Staff account deleted" });
  });
  app2.patch("/api/staff/approve", staffAuth, ownerAuth, async (req, res) => {
    const { id, approvalStatus } = req.body;
    if (typeof id !== "number" || !["approved", "rejected"].includes(approvalStatus)) {
      return res.status(400).json({ message: "id (number) and approvalStatus ('approved' or 'rejected') are required" });
    }
    const updated = await storage.updateStaffApproval(id, approvalStatus);
    if (!updated) return res.status(404).json({ message: "Staff user not found" });
    res.json({ message: `Account ${approvalStatus}`, user: { id: updated.id, username: updated.username, approvalStatus: updated.approvalStatus } });
  });
  app2.post("/api/staff/migrate-encryption", staffAuth, managerAuth, async (_req, res) => {
    try {
      const count = await storage.migrateEncryptExistingBookings();
      res.json({ message: "Encryption migration complete", recordsMigrated: count });
    } catch (err) {
      console.error("Encryption migration error:", err);
      res.status(500).json({ message: "Migration failed" });
    }
  });
  app2.get("/api/offers", async (_req, res) => {
    const offers2 = await storage.getOffers();
    res.json(offers2);
  });
  app2.get("/api/offers/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const offer = await storage.getOffer(id);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    res.json(offer);
  });
  app2.post("/api/offers", staffAuth, managerAuth, async (req, res) => {
    const parsed = insertOfferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid offer data", errors: parsed.error.flatten() });
    }
    const offer = await storage.createOffer(parsed.data);
    res.status(201).json(offer);
  });
  app2.put("/api/offers/:id", staffAuth, managerAuth, async (req, res) => {
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
  app2.delete("/api/offers/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const deleted = await storage.deleteOffer(id);
    if (!deleted) return res.status(404).json({ message: "Offer not found" });
    res.status(204).send();
  });
  app2.post("/api/crash-report", (req, res) => {
    const { message, stack, platform, timestamp: timestamp2 } = req.body || {};
    console.error(`[CRASH REPORT] platform=${platform} time=${timestamp2} message=${message}`);
    if (stack) console.error(`[CRASH STACK] ${stack}`);
    res.status(200).json({ received: true });
  });
  app2.post("/api/push-tokens", async (req, res) => {
    const parsed = insertPushTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid token data" });
    }
    const token = await storage.registerPushToken(parsed.data);
    res.status(201).json(token);
  });
  app2.delete("/api/push-tokens/:token", staffAuth, managerAuth, async (req, res) => {
    const deleted = await storage.removePushToken(req.params.token);
    if (!deleted) return res.status(404).json({ message: "Token not found" });
    res.status(204).send();
  });
  app2.get("/api/push-tokens", staffAuth, managerAuth, async (_req, res) => {
    const tokens = await storage.getAllPushTokens();
    res.json(tokens);
  });
  async function sendTargetedPush(tokens, title, body) {
    if (!tokens.length) return { successCount: 0, failureCount: 0 };
    const messages = tokens.map((to) => ({ to, sound: "default", title, body }));
    let successCount = 0, failureCount = 0;
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(messages)
      });
      const data = await response.json();
      if (data.data) {
        for (const r of data.data) {
          if (r.status === "ok") successCount++;
          else {
            failureCount++;
            if (r.details?.error === "DeviceNotRegistered") {
            }
          }
        }
      } else failureCount += tokens.length;
    } catch {
      failureCount += tokens.length;
    }
    return { successCount, failureCount };
  }
  async function sendPushNotifications(title, body, sentBy) {
    const tokens = await storage.getAllPushTokens();
    if (tokens.length === 0) return { tokens, successCount: 0, failureCount: 0 };
    const allMessages = tokens.map((t) => ({
      to: t.token,
      sound: "default",
      title,
      body
    }));
    let successCount = 0;
    let failureCount = 0;
    const deadTokens = [];
    async function sendSingleProjectBatch(batch) {
      let responseData;
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate"
          },
          body: JSON.stringify(batch)
        });
        responseData = await response.json();
      } catch (err) {
        console.error("[Push] Network error sending to Expo:", err);
        failureCount += batch.length;
        return;
      }
      if (responseData.errors?.some((e) => e.code === "PUSH_TOO_MANY_EXPERIENCE_IDS")) {
        const details = responseData.errors.find((e) => e.code === "PUSH_TOO_MANY_EXPERIENCE_IDS")?.details ?? {};
        console.log(`[Push] Mixed experience IDs \u2014 splitting into ${Object.keys(details).length} groups`);
        for (const [experienceId, groupTokens] of Object.entries(details)) {
          const groupBatch = batch.filter((m) => groupTokens.includes(m.to));
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
    for (let i = 0; i < allMessages.length; i += 100) {
      await sendSingleProjectBatch(allMessages.slice(i, i + 100));
    }
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
  app2.post("/api/notifications/send", staffAuth, managerAuth, async (req, res) => {
    const { title, body } = req.body;
    if (!title || !body) return res.status(400).json({ message: "Title and body are required" });
    const tokens = await storage.getAllPushTokens();
    if (tokens.length === 0) return res.status(400).json({ message: "No registered devices" });
    const sentBy = req.staffUsername;
    const { successCount, failureCount } = await sendPushNotifications(title, body, sentBy);
    const notification = await storage.saveNotification(title, body, successCount, sentBy);
    res.json({ sent: successCount, failed: failureCount, total: tokens.length, notification });
  });
  app2.get("/api/notifications/history", staffAuth, managerAuth, async (_req, res) => {
    const history = await storage.getNotificationHistory();
    res.json(history);
  });
  app2.get("/api/push/device-count", staffAuth, managerAuth, async (_req, res) => {
    const tokens = await storage.getAllPushTokens();
    res.json({ count: tokens.length });
  });
  app2.get("/api/push/history", staffAuth, managerAuth, async (_req, res) => {
    const history = await storage.getNotificationHistory();
    res.json(history);
  });
  app2.post("/api/push/send", staffAuth, managerAuth, async (req, res) => {
    const { title, body } = req.body;
    if (!title || !body) return res.status(400).json({ message: "Title and body are required" });
    const sentBy = req.staffUsername;
    const tokens = await storage.getAllPushTokens();
    if (tokens.length === 0) {
      const notification2 = await storage.saveNotification(title, body, 0, sentBy);
      return res.json({ count: 0, failed: 0, notification: notification2 });
    }
    const { successCount, failureCount } = await sendPushNotifications(title, body, sentBy);
    const notification = await storage.saveNotification(title, body, successCount, sentBy);
    res.json({ count: successCount, failed: failureCount, total: tokens.length, notification });
  });
  app2.post("/api/bookings", async (req, res) => {
    const body = {
      ...req.body,
      tableNumber: req.body.tableNumber ?? void 0,
      guestCount: req.body.guestCount ?? void 0,
      notes: req.body.notes ?? void 0,
      emailHash: req.body.emailHash ?? void 0
    };
    const parsed = insertBookingSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid booking data", errors: parsed.error.flatten() });
    }
    if (!parsed.data.gdprConsent) {
      return res.status(400).json({ message: "GDPR consent is required to process your booking" });
    }
    const toSlotMins = (t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + (m || 0);
    };
    const POOL_TABLE_COUNT = 6;
    const DINING_TABLE_COUNT = 25;
    const DINING_TABLE_START = 18;
    let finalTableNumber = parsed.data.tableNumber ?? null;
    if (parsed.data.tableType === "dining") {
      const allDiningBookings = await storage.getBookingsByDate(parsed.data.date);
      const confirmedDining = allDiningBookings.filter((b) => b.tableType === "dining" && b.status === "confirmed" && b.tableNumber);
      const reqStart = toSlotMins(parsed.data.startTime);
      const reqEnd = reqStart + (parsed.data.duration ?? 1) * 60;
      const occupiedTables = /* @__PURE__ */ new Set();
      for (const b of confirmedDining) {
        const bStart = toSlotMins(b.startTime);
        const bEnd = bStart + (b.duration ?? 1) * 60;
        if (reqStart < bEnd && reqEnd > bStart && b.tableNumber) {
          occupiedTables.add(b.tableNumber);
        }
      }
      let assigned = null;
      for (let i = DINING_TABLE_START; i < DINING_TABLE_START + DINING_TABLE_COUNT; i++) {
        if (!occupiedTables.has(String(i))) {
          assigned = String(i);
          break;
        }
      }
      if (!assigned) {
        return res.status(409).json({ message: "All dining tables are fully booked for this time slot" });
      }
      finalTableNumber = assigned;
    } else if (parsed.data.tableType === "pool") {
      if (!parsed.data.tableNumber) {
        return res.status(400).json({ message: "Please select a pool table number (1\u20136)" });
      }
      const poolNum = parseInt(parsed.data.tableNumber);
      if (poolNum < 1 || poolNum > POOL_TABLE_COUNT) {
        return res.status(400).json({ message: "Invalid pool table number. Choose between 1 and 6." });
      }
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
    } else {
      const bookedSlots = await storage.getBookedSlots(parsed.data.date, parsed.data.tableType, finalTableNumber ?? void 0);
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
    const booking = await storage.createBooking({ ...parsed.data, tableNumber: finalTableNumber ?? void 0 });
    sendBookingConfirmationEmail({
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
      tableType: parsed.data.tableType,
      tableNumber: parsed.data.tableNumber,
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      duration: parsed.data.duration ?? 1,
      id: booking.id
    }).catch((err) => console.error("[BOOKING] Email send error:", err));
    res.status(201).json(booking);
  });
  app2.get("/api/bookings/availability", async (req, res) => {
    const { date, tableType, tableNumber } = req.query;
    if (!date || !tableType) {
      return res.status(400).json({ message: "date and tableType are required" });
    }
    const POOL_TABLE_COUNT = 6;
    const DINING_TABLE_COUNT = 25;
    if (String(tableType) === "dining") {
      const bookedSlots2 = await storage.getBookedSlots(String(date), "dining");
      return res.json({ slots: bookedSlots2, totalTables: DINING_TABLE_COUNT });
    }
    const bookedSlots = await storage.getBookedSlots(String(date), String(tableType), tableNumber ? String(tableNumber) : void 0);
    res.json({ slots: bookedSlots, totalTables: tableNumber ? 1 : POOL_TABLE_COUNT });
  });
  app2.get("/api/staff-notices", staffAuth, async (_req, res) => {
    const notices = await storage.getStaffNotices();
    res.json(notices);
  });
  app2.post("/api/staff-notices", staffAuth, managerAuth, async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "Notice message is required" });
    }
    const createdBy = req.staffUsername || "Manager";
    const notice = await storage.createStaffNotice(message.trim(), createdBy);
    res.status(201).json(notice);
  });
  app2.get("/api/staff-notices/history", staffAuth, managerAuth, async (_req, res) => {
    const notices = await storage.getDeletedStaffNotices();
    res.json(notices);
  });
  app2.delete("/api/staff-notices/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid notice ID" });
    const deletedBy = req.staffUsername || "Manager";
    const deleted = await storage.deleteStaffNotice(id, deletedBy);
    if (!deleted) return res.status(404).json({ message: "Notice not found" });
    res.status(204).send();
  });
  app2.get("/api/bookings", staffAuth, async (req, res) => {
    const { date } = req.query;
    if (date) {
      const bookingsList = await storage.getBookingsByDate(String(date));
      return res.json(bookingsList);
    }
    const allBookings = await storage.getBookings();
    res.json(allBookings);
  });
  app2.get("/api/bookings/:id", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const booking = await storage.getBooking(id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    res.json(booking);
  });
  app2.patch("/api/bookings/:id/status", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { status } = req.body;
    if (!status || !["confirmed", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const booking = await storage.updateBookingStatus(id, status);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    try {
      const customerTokens = await storage.getPushTokensByEmail(booking.customerEmail);
      if (customerTokens.length) {
        const tableLabel = booking.tableType.charAt(0).toUpperCase() + booking.tableType.slice(1);
        const dateLabel = booking.date ? `on ${booking.date}` : "";
        const title = status === "confirmed" ? "Booking Confirmed \u2705" : "Booking Cancelled";
        const body = status === "confirmed" ? `Your ${tableLabel} table booking at ${booking.startTime} ${dateLabel} has been confirmed. See you soon!` : `Your ${tableLabel} table booking at ${booking.startTime} ${dateLabel} has been cancelled. Contact us if this is a mistake.`;
        await sendTargetedPush(customerTokens.map((t) => t.token), title, body);
      }
    } catch (err) {
      console.error("[Push] Booking status notification error:", err);
    }
    res.json(booking);
  });
  app2.put("/api/bookings/:id", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const existing = await storage.getBooking(id);
    if (!existing) return res.status(404).json({ message: "Booking not found" });
    const { customerName, customerEmail, customerPhone, tableType, tableNumber, guestCount, date, startTime, duration, notes, status } = req.body;
    const updateData = {};
    if (customerName !== void 0) updateData.customerName = customerName;
    if (customerEmail !== void 0) updateData.customerEmail = customerEmail;
    if (customerPhone !== void 0) updateData.customerPhone = customerPhone;
    if (tableType !== void 0) updateData.tableType = tableType;
    if (tableNumber !== void 0) updateData.tableNumber = tableNumber;
    if (guestCount !== void 0) updateData.guestCount = guestCount;
    if (date !== void 0) updateData.date = date;
    if (startTime !== void 0) updateData.startTime = startTime;
    if (duration !== void 0) updateData.duration = duration;
    if (notes !== void 0) updateData.notes = notes;
    if (status !== void 0) updateData.status = status;
    const finalDate = updateData.date ?? existing.date;
    const finalTableType = updateData.tableType ?? existing.tableType;
    const finalTableNumber = updateData.tableNumber ?? existing.tableNumber;
    const finalStartTime = updateData.startTime ?? existing.startTime;
    const finalDuration = updateData.duration ?? existing.duration;
    if (updateData.date || updateData.startTime || updateData.duration || updateData.tableType || updateData.tableNumber) {
      const bookedSlots = await storage.getBookedSlots(finalDate, finalTableType, finalTableNumber ?? void 0);
      const requestedStart = parseInt(finalStartTime.replace(":", ""));
      const requestedEnd = requestedStart + finalDuration * 100;
      for (const slot of bookedSlots) {
        const slotStart = parseInt(slot.startTime.replace(":", ""));
        const slotEnd = slotStart + slot.duration * 100;
        if (requestedStart < slotEnd && requestedEnd > slotStart) {
          const slotBookings = await storage.getBookingsByDate(finalDate);
          const conflicting = slotBookings.find((b) => b.startTime === slot.startTime && b.tableType === finalTableType && (finalTableNumber ? b.tableNumber === finalTableNumber : true) && b.status === "confirmed");
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
  app2.delete("/api/bookings/:id", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const deleted = await storage.deleteBooking(id);
    if (!deleted) return res.status(404).json({ message: "Booking not found" });
    res.status(204).send();
  });
  app2.get("/api/gdpr/export", staffAuth, managerAuth, async (req, res) => {
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
      exportDate: (/* @__PURE__ */ new Date()).toISOString(),
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
        createdAt: b.createdAt
      })),
      totalRecords: userBookings.length
    };
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="gdpr-export-${Date.now()}.json"`);
    res.json(exportData);
  });
  app2.get("/api/customers/me/export", customerAuth, async (req, res) => {
    const clientIp = getClientIp(req);
    if (!checkSensitiveRateLimit(clientIp)) {
      return res.status(429).json({ message: "Too many requests. Please try again later." });
    }
    const customer = await storage.getCustomerById(req.customerId);
    if (!customer) return res.status(404).json({ message: "Account not found" });
    const bookings2 = await storage.getBookingsByEmail(customer.email);
    const exportData = {
      dataSubject: customer.email,
      exportDate: (/* @__PURE__ */ new Date()).toISOString(),
      dataController: "The 147",
      legalBasis: "UK GDPR Article 15 - Right of Access",
      account: { name: customer.name, email: customer.email, phone: customer.phone, createdAt: customer.createdAt },
      bookings: bookings2.map((b) => ({
        id: b.id,
        tableType: b.tableType,
        tableNumber: b.tableNumber,
        date: b.date,
        startTime: b.startTime,
        duration: b.duration,
        status: b.status,
        notes: b.notes,
        createdAt: b.createdAt
      })),
      totalBookings: bookings2.length
    };
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="my-data-export-${Date.now()}.json"`);
    res.json(exportData);
  });
  app2.delete("/api/gdpr/erase", staffAuth, managerAuth, async (req, res) => {
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
    const customer = await storage.getCustomerByEmail(email);
    if (customer) await storage.deleteCustomer(customer.id);
    res.json({
      message: `Erasure complete under UK GDPR Article 17`,
      recordsDeleted: deletedCount,
      customerAccountDeleted: !!customer,
      erasureDate: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app2.post("/api/gdpr/retention-cleanup", staffAuth, managerAuth, async (_req, res) => {
    const anonymized = await storage.anonymizeOldBookings(365);
    const sessionsCleared = await storage.cleanupExpiredSessions();
    res.json({
      message: "Data retention policy applied",
      bookingsAnonymized: anonymized,
      expiredSessionsCleared: sessionsCleared,
      retentionPeriodDays: 365
    });
  });
  app2.get("/api/events", async (req, res) => {
    try {
      const eventType = req.query.type;
      const allEvents = await storage.getActiveEvents(eventType);
      res.json(allEvents);
    } catch (err) {
      console.error("Events fetch error:", err);
      res.json([]);
    }
  });
  app2.get("/api/events/all", staffAuth, managerAuth, async (_req, res) => {
    const allEvents = await storage.getEvents();
    res.json(allEvents);
  });
  app2.post("/api/events", staffAuth, managerAuth, async (req, res) => {
    const parsed = insertEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid event data", details: parsed.error.errors });
    }
    const event = await storage.createEvent(parsed.data);
    res.status(201).json(event);
  });
  app2.put("/api/events/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid event ID" });
    const event = await storage.updateEvent(id, req.body);
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  });
  app2.delete("/api/events/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid event ID" });
    const deleted = await storage.deleteEvent(id);
    if (!deleted) return res.status(404).json({ error: "Event not found" });
    res.json({ message: "Event deleted" });
  });
  app2.get("/api/settings", async (_req, res) => {
    const settings = await storage.getAllSettings();
    res.json(settings);
  });
  app2.get("/api/settings/:key", async (req, res) => {
    const value = await storage.getSetting(req.params.key);
    res.json({ key: req.params.key, value });
  });
  app2.put("/api/settings/:key", staffAuth, managerAuth, async (req, res) => {
    const { value } = req.body;
    if (value === void 0 || value === null) {
      return res.status(400).json({ message: "Value is required" });
    }
    await storage.setSetting(req.params.key, String(value));
    res.json({ key: req.params.key, value: String(value) });
  });
  app2.get("/api/banner-images", async (_req, res) => {
    const images = await storage.getBannerImages();
    res.json(images);
  });
  app2.get("/api/banner-images/all", staffAuth, async (_req, res) => {
    const images = await storage.getAllBannerImages();
    res.json(images);
  });
  app2.post("/api/upload/banner", staffAuth, managerAuth, upload.single("image"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }
    try {
      const compressed = await sharp(req.file.buffer).resize({ width: 1e3, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
      const imageUrl = `data:image/jpeg;base64,${compressed.toString("base64")}`;
      res.json({ imageUrl });
    } catch {
      const base64 = req.file.buffer.toString("base64");
      res.json({ imageUrl: `data:${req.file.mimetype};base64,${base64}` });
    }
  });
  app2.post("/api/banner-images", staffAuth, managerAuth, upload.single("image"), async (req, res) => {
    if (req.file) {
      try {
        const compressed = await sharp(req.file.buffer).resize({ width: 1e3, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
        const imageUrl = `data:image/jpeg;base64,${compressed.toString("base64")}`;
        const sortOrder = parseInt(req.body.sortOrder ?? "0");
        const active = req.body.active !== "false";
        const image2 = await storage.createBannerImage({
          imageUrl,
          title: req.body.title?.trim() || null,
          sortOrder: isNaN(sortOrder) ? 0 : sortOrder,
          active
        });
        return res.status(201).json(image2);
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
  app2.put("/api/banner-images/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const updated = await storage.updateBannerImage(id, req.body);
    if (!updated) return res.status(404).json({ error: "Banner image not found" });
    res.json(updated);
  });
  app2.delete("/api/banner-images/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const deleted = await storage.deleteBannerImage(id);
    if (!deleted) return res.status(404).json({ error: "Banner image not found" });
    res.json({ message: "Banner image deleted" });
  });
  app2.post("/api/contact", async (req, res) => {
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
    if (incomingPushToken && typeof incomingPushToken === "string") {
      await storage.registerPushToken({ token: incomingPushToken, customerEmail: parsed.data.email }).catch(() => {
      });
    }
    const contact = await storage.createContactMessage({
      ...parsed.data,
      pushToken: incomingPushToken ?? null
    });
    try {
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendKey}`
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
<p><small>Sent via The 147 App contact form</small></p>`
          })
        });
      }
    } catch (err) {
      console.error("Email send error (non-critical):", err);
    }
    res.status(201).json({ message: "Your message has been sent. We'll get back to you soon!", id: contact.id });
  });
  app2.get("/api/contact", staffAuth, async (_req, res) => {
    const messages = await storage.getContactMessages();
    res.json(messages);
  });
  app2.patch("/api/contact/:id/status", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { status } = req.body;
    if (!status || !["new", "read", "replied"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const updated = await storage.updateContactMessageStatus(id, status);
    if (!updated) return res.status(404).json({ message: "Message not found" });
    res.json(updated);
  });
  app2.post("/api/contact/:id/reply", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { replyText } = req.body;
    if (!replyText?.trim()) return res.status(400).json({ message: "Reply text is required" });
    const msg = await storage.getContactMessage(id);
    if (!msg) return res.status(404).json({ message: "Message not found" });
    const updated = await storage.replyToContactMessage(id, replyText.trim());
    let pushed = false;
    const tokenSources = [];
    if (msg.pushToken) tokenSources.push(msg.pushToken);
    const emailTokens = await storage.getPushTokensByEmail(msg.email);
    emailTokens.forEach((t) => {
      if (!tokenSources.includes(t.token)) tokenSources.push(t.token);
    });
    if (tokenSources.length) {
      await sendTargetedPush(tokenSources, "The 147 \u2013 Reply to your message", replyText.trim().slice(0, 200));
      pushed = true;
    }
    res.json({ updated, pushed });
  });
  app2.post("/api/loyalty/send-code", async (req, res) => {
    if (!isConfigured()) {
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
      const waitSeconds = Math.ceil((existing.expiresAt - Date.now() - (OTP_EXPIRY - 6e4)) / 1e3);
      if (waitSeconds > 0) {
        return res.status(429).json({ message: `Please wait before requesting a new code`, retryAfter: waitSeconds });
      }
    }
    const code = generateOtp();
    loyaltyOtps.set(otpKey, { code, phone: phoneCleaned, expiresAt: Date.now() + OTP_EXPIRY, attempts: 0 });
    const emailSent = await sendOtpEmail(emailClean, code);
    if (!emailSent) {
      return res.status(503).json({
        message: "We couldn't send the verification email right now. Please ask a staff member for your code, or try again later.",
        manualCode: true
      });
    }
    res.json({ sent: true, expiresIn: OTP_EXPIRY / 1e3 });
  });
  app2.post("/api/loyalty/verify-code", async (req, res) => {
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
    const sessionToken = randomBytes2(32).toString("hex");
    loyaltySessions.set(sessionToken, { phone: phoneCleaned, expiresAt: Date.now() + LOYALTY_SESSION_EXPIRY });
    res.json({ verified: true, sessionToken, expiresIn: LOYALTY_SESSION_EXPIRY / 1e3 });
  });
  app2.get("/api/loyalty/session", async (req, res) => {
    const token = req.headers["x-loyalty-session"];
    if (!token) {
      return res.json({ valid: false });
    }
    const phone = validateLoyaltySession(token);
    if (!phone) {
      return res.json({ valid: false });
    }
    res.json({ valid: true, phone });
  });
  app2.post("/api/loyalty/logout", async (req, res) => {
    const token = req.headers["x-loyalty-session"];
    if (token) {
      loyaltySessions.delete(token);
    }
    res.json({ loggedOut: true });
  });
  app2.get("/api/loyalty/program", async (_req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ message: "Loyalty program not configured" });
    }
    try {
      const program = await getLoyaltyProgram();
      if (!program) {
        return res.json({ configured: true, active: false, program: null });
      }
      res.json({
        configured: true,
        active: program.status === "ACTIVE",
        program: {
          id: program.id,
          terminology: program.terminology,
          reward_tiers: program.reward_tiers?.map((t) => ({
            id: t.id,
            name: t.name,
            points: t.points,
            definition: t.definition
          })),
          accrual_rules: program.accrual_rules?.map((r) => ({
            accrual_type: r.accrual_type,
            points: r.points,
            spend_data: r.spend_amount_money ? {
              amount: r.spend_amount_money.amount,
              currency: r.spend_amount_money.currency
            } : void 0
          }))
        }
      });
    } catch (err) {
      console.error("Square loyalty program error:", err.message);
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });
  app2.post("/api/loyalty/lookup", async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ message: "Loyalty program not configured" });
    }
    const sessionToken = req.headers["x-loyalty-session"];
    const sessionPhone = sessionToken ? validateLoyaltySession(sessionToken) : null;
    if (!sessionPhone) {
      return res.status(401).json({ message: "Please verify your phone number first" });
    }
    try {
      const account = await searchLoyaltyAccount(sessionPhone);
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
          phone: account.mapping?.phone_number
        }
      });
    } catch (err) {
      console.error("Square loyalty lookup error:", err.message);
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });
  app2.post("/api/loyalty/enroll", async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ message: "Loyalty program not configured" });
    }
    const sessionToken = req.headers["x-loyalty-session"];
    const sessionPhone = sessionToken ? validateLoyaltySession(sessionToken) : null;
    if (!sessionPhone) {
      return res.status(401).json({ message: "Please verify your phone number first" });
    }
    const phone = sessionPhone;
    try {
      const program = await getLoyaltyProgram();
      if (!program) {
        return res.status(400).json({ message: "No active loyalty program" });
      }
      const existing = await searchLoyaltyAccount(phone);
      if (existing) {
        return res.json({
          enrolled: false,
          existing: true,
          account: {
            id: existing.id,
            balance: existing.balance,
            lifetime_points: existing.lifetime_points,
            enrolled_at: existing.enrolled_at,
            phone: existing.mapping?.phone_number
          }
        });
      }
      const account = await createLoyaltyAccount(phone, program.id);
      res.status(201).json({
        enrolled: true,
        existing: false,
        account: {
          id: account.id,
          balance: account.balance,
          lifetime_points: account.lifetime_points,
          enrolled_at: account.enrolled_at,
          phone: account.mapping?.phone_number
        }
      });
    } catch (err) {
      console.error("Square loyalty enroll error:", err.message);
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });
  app2.post("/api/loyalty/points/add", staffAuth, async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ message: "Loyalty program not configured" });
    }
    const { accountId, points } = req.body;
    if (!accountId || typeof points !== "number" || points <= 0) {
      return res.status(400).json({ message: "Account ID and positive points value required" });
    }
    try {
      const idempotencyKey = `add-${accountId}-${points}-${Date.now()}`;
      const event = await accumulateLoyaltyPoints(accountId, points, idempotencyKey);
      const updated = await getLoyaltyAccount(accountId);
      res.json({
        success: true,
        event,
        account: {
          id: updated.id,
          balance: updated.balance,
          lifetime_points: updated.lifetime_points
        }
      });
    } catch (err) {
      console.error("Square loyalty add points error:", err.message);
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });
  app2.post("/api/loyalty/points/adjust", staffAuth, async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ message: "Loyalty program not configured" });
    }
    const { accountId, points, reason } = req.body;
    if (!accountId || typeof points !== "number" || !reason) {
      return res.status(400).json({ message: "Account ID, points value, and reason required" });
    }
    try {
      const idempotencyKey = `adjust-${accountId}-${points}-${Date.now()}`;
      const event = await adjustLoyaltyPoints(accountId, points, reason, idempotencyKey);
      const updated = await getLoyaltyAccount(accountId);
      res.json({
        success: true,
        event,
        account: {
          id: updated.id,
          balance: updated.balance,
          lifetime_points: updated.lifetime_points
        }
      });
    } catch (err) {
      console.error("Square loyalty adjust points error:", err.message);
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });
  app2.post("/api/loyalty/redeem", staffAuth, async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ message: "Loyalty program not configured" });
    }
    const { accountId, rewardTierId } = req.body;
    if (!accountId || !rewardTierId) {
      return res.status(400).json({ message: "Account ID and reward tier ID required" });
    }
    try {
      const idempotencyKey = `redeem-${accountId}-${rewardTierId}-${Date.now()}`;
      const reward = await redeemLoyaltyReward(accountId, rewardTierId, idempotencyKey);
      const updated = await getLoyaltyAccount(accountId);
      res.json({
        success: true,
        reward,
        account: {
          id: updated.id,
          balance: updated.balance,
          lifetime_points: updated.lifetime_points
        }
      });
    } catch (err) {
      console.error("Square loyalty redeem error:", err.message);
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });
  app2.get("/staff", (_req, res) => {
    const templatePath = path.resolve(process.cwd(), "server", "templates", "staff-dashboard.html");
    const html = fs.readFileSync(templatePath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });
  app2.post("/api/customers/register", async (req, res) => {
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
      const token = randomBytes2(48).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3);
      await storage.createCustomerSession(token, customer.id, expiresAt);
      res.status(201).json({
        token,
        customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone }
      });
    } catch (err) {
      console.error("Customer register error:", err.message);
      res.status(500).json({ message: "Registration failed" });
    }
  });
  app2.post("/api/customers/login", async (req, res) => {
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
      const token = randomBytes2(48).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3);
      await storage.createCustomerSession(token, customer.id, expiresAt);
      res.json({
        token,
        customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone }
      });
    } catch (err) {
      console.error("Customer login error:", err.message);
      res.status(500).json({ message: "Login failed" });
    }
  });
  app2.post("/api/customers/logout", customerAuth, async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader.slice(7);
    await storage.invalidateCustomerSession(token);
    res.json({ success: true });
  });
  app2.get("/api/customers/me", customerAuth, async (req, res) => {
    const customer = await storage.getCustomerById(req.customerId);
    if (!customer) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json({ id: customer.id, name: customer.name, email: customer.email, phone: customer.phone });
  });
  app2.patch("/api/customers/me", customerAuth, async (req, res) => {
    const { name, phone } = req.body;
    const updates = {};
    if (name !== void 0) {
      const trimmed = String(name).trim();
      if (!trimmed || trimmed.length < 2 || trimmed.length > 100) {
        return res.status(400).json({ message: "Name must be 2\u2013100 characters" });
      }
      updates.name = trimmed;
    }
    if (phone !== void 0) {
      const trimmed = String(phone).trim();
      if (trimmed && (trimmed.length < 7 || trimmed.length > 20 || !/^[+\d\s\-().]+$/.test(trimmed))) {
        return res.status(400).json({ message: "Invalid phone number format" });
      }
      updates.phone = trimmed;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }
    const updated = await storage.updateCustomer(req.customerId, updates);
    if (!updated) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json({ id: updated.id, name: updated.name, email: updated.email, phone: updated.phone });
  });
  app2.delete("/api/customers/me", customerAuth, async (req, res) => {
    const customerId = req.customerId;
    const email = req.customerEmail;
    const bookingsDeleted = await storage.deleteBookingsByEmail(email);
    const deleted = await storage.deleteCustomer(customerId);
    if (!deleted) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json({
      success: true,
      message: "Account and all associated data permanently deleted under UK GDPR Article 17",
      bookingsDeleted
    });
  });
  app2.get("/api/customers/bookings", customerAuth, async (req, res) => {
    const email = req.customerEmail;
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
      createdAt: b.createdAt
    }));
    res.json(safeBookings);
  });
  app2.patch("/api/customers/bookings/:id/cancel", customerAuth, async (req, res) => {
    const bookingId = parseInt(req.params.id);
    if (isNaN(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }
    const booking = await storage.getBooking(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    const customerEmail = req.customerEmail;
    if (booking.customerEmail.toLowerCase() !== customerEmail.toLowerCase()) {
      return res.status(403).json({ message: "Not your booking" });
    }
    if (booking.status === "cancelled") {
      return res.status(400).json({ message: "Booking is already cancelled" });
    }
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    if (booking.date < today) {
      return res.status(400).json({ message: "Cannot cancel past bookings" });
    }
    const updated = await storage.updateBookingStatus(bookingId, "cancelled");
    res.json({ success: true, booking: updated });
  });
  app2.get("/widget/booking", (_req, res) => {
    const widgetPath = path.resolve(process.cwd(), "server", "templates", "booking-widget.html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    try {
      const html = fs.readFileSync(widgetPath, "utf-8");
      res.send(html);
    } catch (err) {
      res.status(500).send("Widget unavailable");
    }
  });
  app2.options("/api/bookings", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.sendStatus(204);
  });
  app2.options("/api/bookings/availability", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.sendStatus(204);
  });
  app2.get("/api/blocked-periods", async (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const periods = await storage.getBlockedPeriods();
    res.json(periods);
  });
  app2.options("/api/blocked-periods", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.sendStatus(204);
  });
  app2.post("/api/blocked-periods", staffAuth, managerAuth, async (req, res) => {
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
      createdBy: req.staffSession?.staffUsername ?? "manager"
    });
    res.status(201).json(created);
  });
  app2.delete("/api/blocked-periods/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const ok = await storage.deleteBlockedPeriod(id);
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.status(204).send();
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
import * as fs2 from "fs";
import * as path2 from "path";
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    const isPublicBookingRoute = req.path === "/api/bookings" && req.method === "POST" || req.path === "/api/bookings/availability" || req.method === "OPTIONS";
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
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
}
function setupSecurityHeaders(app2) {
  const isProd = process.env.NODE_ENV === "production";
  app2.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    if (isProd) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    if (req.path === "/staff" || req.path.startsWith("/staff-portal") || req.path.startsWith("/admin-")) {
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data: blob: https:; frame-ancestors 'none'"
      );
    } else if (req.path === "/widget/booking") {
      res.removeHeader("X-Frame-Options");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors *"
      );
    } else if (!req.path.startsWith("/api")) {
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.squareup.com https://*.resend.com; img-src 'self' data: https:; frame-src https://www.the147order.co.uk https://the147order.co.uk"
      );
    } else {
      res.setHeader("X-Frame-Options", "DENY");
    }
    if (!req.path.startsWith("/api")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
    }
    next();
  });
}
var SENSITIVE_FIELDS = /* @__PURE__ */ new Set([
  "pin",
  "confirmPin",
  "masterPin",
  "newPin",
  "currentPin",
  "password",
  "passwordHash",
  "pinHash",
  "pinSalt",
  "token",
  "authorization",
  "customerName",
  "customerEmail",
  "customerPhone",
  "email",
  "phone",
  "name",
  "code",
  "otp"
]);
function redactSensitive(obj, depth = 0) {
  if (depth > 4 || obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => redactSensitive(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SENSITIVE_FIELDS.has(k) ? "[REDACTED]" : redactSensitive(v, depth + 1);
  }
  return out;
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      limit: "100kb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path3 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path3.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && res.statusCode >= 400) {
        const safe = redactSensitive(capturedJsonResponse);
        const snippet = JSON.stringify(safe);
        logLine += ` :: ${snippet.length > 120 ? snippet.slice(0, 119) + "\u2026" : snippet}`;
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path2.resolve(process.cwd(), "app.json");
    const appJsonContent = fs2.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path2.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs2.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs2.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs2.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express.static(path2.resolve(process.cwd(), "assets")));
  app2.use("/uploads", express.static(path2.resolve(process.cwd(), "uploads")));
  app2.use(express.static(path2.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  const isProd = process.env.NODE_ENV === "production";
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = isProd && status >= 500 ? "An unexpected error occurred. Please try again later." : error.message || "Internal Server Error";
    console.error(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${status} error:`, err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
function scheduleBookingReminders() {
  async function runReminders() {
    try {
      const { storage: store } = await Promise.resolve().then(() => (init_storage(), storage_exports));
      const due = await store.getBookingsDueReminder(55, 65);
      if (!due.length) return;
      for (const booking of due) {
        try {
          const tokens = await store.getPushTokensByEmail(booking.customerEmail);
          if (tokens.length) {
            const tableLabel = booking.tableType === "dining" ? "dining area" : `${booking.tableType} table ${booking.tableNumber ?? ""}`.trim();
            const messages = tokens.map((t) => ({
              to: t.token,
              sound: "default",
              title: "Your booking starts soon \u23F0",
              body: `Reminder: your ${tableLabel} booking at The 147 starts in about 1 hour (${booking.startTime}).`
            }));
            await fetch("https://exp.host/--/api/v2/push/send", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify(messages)
            });
          }
          await store.markReminderSent(booking.id);
          log(`[Reminder] Sent push reminder for booking #${booking.id} (${booking.startTime})`);
        } catch (err) {
          console.error(`[Reminder] Failed for booking #${booking.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[Reminder] Scheduler error:", err);
    }
  }
  setInterval(runReminders, 5 * 60 * 1e3);
}
function scheduleRetentionCleanup() {
  async function runCleanup() {
    try {
      const { storage: store } = await Promise.resolve().then(() => (init_storage(), storage_exports));
      const anonymized = await store.anonymizeOldBookings(365);
      const sessionsCleared = await store.cleanupExpiredSessions();
      if (anonymized > 0 || sessionsCleared > 0) {
        log(`[GDPR Retention] Anonymized ${anonymized} old records, cleared ${sessionsCleared} expired sessions`);
      }
    } catch (err) {
      console.error("[GDPR Retention] Cleanup error:", err);
    }
  }
  setTimeout(runCleanup, 3e4);
  setInterval(runCleanup, 24 * 60 * 60 * 1e3);
}
(async () => {
  setupCors(app);
  setupSecurityHeaders(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  const widgetHtmlPath = path2.resolve(process.cwd(), "server", "templates", "booking-widget.html");
  app.get("/widget/booking", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.setHeader("Cache-Control", "no-store");
    const html = fs2.readFileSync(widgetHtmlPath, "utf-8");
    res.status(200).send(html);
  });
  const privacyPolicyHtmlPath = path2.resolve(process.cwd(), "server", "templates", "privacy-policy.html");
  const privacyPolicyHtml = fs2.readFileSync(privacyPolicyHtmlPath, "utf-8");
  app.get("/privacy-policy", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(privacyPolicyHtml);
  });
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  scheduleRetentionCleanup();
  scheduleBookingReminders();
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
