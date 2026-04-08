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
var users, insertUserSchema, staffUsers, offers, insertOfferSchema, pushTokens, insertPushTokenSchema, notifications, bookings, insertBookingSchema, staffSessions, contactMessages, insertContactMessageSchema, events, insertEventSchema, siteSettings, customers, insertCustomerSchema, customerSessions, bannerImages, insertBannerImageSchema, staffNotices, insertStaffNoticeSchema, staffPopups, insertStaffPopupSchema, blockedPeriods, insertBlockedPeriodSchema, membershipPlans, insertMembershipPlanSchema, membershipSubscriptions, insertMembershipSubscriptionSchema;
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
      depositRequired: boolean("deposit_required").notNull().default(false),
      depositPaid: boolean("deposit_paid").notNull().default(false),
      depositPaymentId: text("deposit_payment_id"),
      squarePaymentId: text("square_payment_id"),
      depositRefunded: boolean("deposit_refunded").notNull().default(false),
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
      linkType: text("link_type"),
      linkValue: text("link_value"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertBannerImageSchema = createInsertSchema(bannerImages).omit({ id: true, createdAt: true });
    staffNotices = pgTable("staff_notices", {
      id: serial("id").primaryKey(),
      message: text("message").notNull(),
      colour: text("colour").notNull().default("amber"),
      createdBy: text("created_by").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      deletedAt: timestamp("deleted_at"),
      deletedBy: text("deleted_by")
    });
    insertStaffNoticeSchema = createInsertSchema(staffNotices).omit({ id: true, createdAt: true });
    staffPopups = pgTable("staff_popups", {
      id: serial("id").primaryKey(),
      title: text("title").notNull(),
      message: text("message").notNull(),
      colour: text("colour").notNull().default("amber"),
      createdBy: text("created_by").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      deletedAt: timestamp("deleted_at"),
      deletedBy: text("deleted_by")
    });
    insertStaffPopupSchema = createInsertSchema(staffPopups).omit({ id: true, createdAt: true });
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
    membershipPlans = pgTable("membership_plans", {
      id: serial("id").primaryKey(),
      name: text("name").notNull(),
      tier: text("tier").notNull().unique(),
      priceMonthly: integer("price_monthly").notNull(),
      hoursIncluded: integer("hours_included"),
      hoursUnit: text("hours_unit").notNull().default("month"),
      foodDrinkDiscount: integer("food_drink_discount").notNull().default(0),
      priorityBooking: boolean("priority_booking").notNull().default(false),
      loyaltyMultiplier: integer("loyalty_multiplier").notNull().default(1),
      guestPassesMonthly: integer("guest_passes_monthly").notNull().default(0),
      squarePlanVariationId: text("square_plan_variation_id"),
      active: boolean("active").notNull().default(true),
      sortOrder: integer("sort_order").notNull().default(0),
      color: text("color").notNull().default("#0047AB"),
      description: text("description")
    });
    insertMembershipPlanSchema = createInsertSchema(membershipPlans).omit({ id: true });
    membershipSubscriptions = pgTable("membership_subscriptions", {
      id: serial("id").primaryKey(),
      customerId: integer("customer_id").notNull(),
      planId: integer("plan_id").notNull(),
      squareSubscriptionId: text("square_subscription_id"),
      squareCustomerId: text("square_customer_id"),
      status: text("status").notNull().default("active"),
      currentPeriodStart: text("current_period_start"),
      currentPeriodEnd: text("current_period_end"),
      hoursUsedThisPeriod: integer("hours_used_this_period").notNull().default(0),
      guestPassesUsed: integer("guest_passes_used").notNull().default(0),
      failedPaymentAttempts: integer("failed_payment_attempts").notNull().default(0),
      cancelledAt: timestamp("cancelled_at"),
      staffNotes: text("staff_notes"),
      source: text("source").notNull().default("staff"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertMembershipSubscriptionSchema = createInsertSchema(membershipSubscriptions).omit({ id: true, createdAt: true });
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
  const skipVerify = process.env.DATABASE_SSL_NO_VERIFY === "true";
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: !skipVerify }
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
        const pad2 = (n) => String(n).padStart(2, "0");
        const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
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
      async getExpiredPendingDeposits(olderThanMinutes) {
        const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1e3);
        const rows = await db.select().from(bookings).where(
          and(
            eq(bookings.status, "pending_deposit"),
            lt(bookings.createdAt, cutoff)
          )
        );
        return rows.map(decryptBookingFields);
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
        const pad2 = (n) => String(n).padStart(2, "0");
        const cutoffStr = `${cutoffDate.getFullYear()}-${pad2(cutoffDate.getMonth() + 1)}-${pad2(cutoffDate.getDate())}`;
        const recentBookings = await db.select({ emailHash: bookings.emailHash }).from(bookings).where(gte(bookings.date, cutoffStr));
        const activeHashes = new Set(
          recentBookings.map((b) => b.emailHash).filter(Boolean)
        );
        const allCustomers = await db.select({ email: customers.email }).from(customers);
        for (const c of allCustomers) {
          if (c.email) activeHashes.add(hashEmail(c.email));
        }
        const oldBookings = await db.select().from(bookings).where(lt(bookings.date, cutoffStr));
        let count = 0;
        for (const booking of oldBookings) {
          const decryptedName = decrypt(booking.customerName);
          if (decryptedName === "ANONYMIZED") continue;
          if (booking.emailHash && activeHashes.has(booking.emailHash)) continue;
          await db.update(bookings).set({
            customerName: "ANONYMIZED",
            customerEmail: "anonymized@removed.local",
            customerPhone: "000000",
            emailHash: null,
            notes: null
          }).where(eq(bookings.id, booking.id));
          count++;
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
      async searchCustomers(query, limit = 6) {
        if (!query || query.trim().length < 2) return [];
        const q = query.trim().toLowerCase();
        const allBookings = await db.select().from(bookings).orderBy(bookings.createdAt);
        const seen = /* @__PURE__ */ new Set();
        const matches = [];
        for (const raw of allBookings) {
          try {
            const name = decrypt(raw.customerName);
            const email = decrypt(raw.customerEmail);
            const phone = decrypt(raw.customerPhone);
            if (name === "ANONYMIZED" || email.includes("@removed.local")) continue;
            const dedupeKey = email.toLowerCase();
            if (seen.has(dedupeKey)) continue;
            const nameLower = name.toLowerCase();
            const phoneLower = phone.toLowerCase().replace(/\s/g, "");
            const qClean = q.replace(/\s/g, "");
            const emailMatch = email.toLowerCase().includes(q);
            const nameMatch = nameLower.includes(q);
            const phoneMatch = phoneLower.includes(qClean);
            if (nameMatch || phoneMatch || emailMatch) {
              seen.add(dedupeKey);
              const score = (nameLower.startsWith(q) ? 2 : 0) + (phoneMatch ? 1 : 0);
              matches.push({ name, phone, email, score });
              if (matches.length >= limit * 3) break;
            }
          } catch {
            continue;
          }
        }
        matches.sort((a, b) => b.score - a.score);
        const top = matches.slice(0, limit);
        const enriched = await Promise.all(top.map(async ({ name, phone, email }) => {
          const customer = await this.getCustomerByEmail(email).catch(() => void 0);
          return { id: customer?.id, name, phone, email };
        }));
        return enriched;
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
      async createStaffNotice(message, createdBy, colour = "amber") {
        const [notice] = await db.insert(staffNotices).values({ message, createdBy, colour }).returning();
        return notice;
      }
      async deleteStaffNotice(id, deletedBy) {
        const result = await db.update(staffNotices).set({ deletedAt: /* @__PURE__ */ new Date(), deletedBy }).where(and(eq(staffNotices.id, id), isNull(staffNotices.deletedAt))).returning();
        return result.length > 0;
      }
      async getStaffPopups() {
        return db.select().from(staffPopups).where(isNull(staffPopups.deletedAt)).orderBy(staffPopups.createdAt);
      }
      async createStaffPopup(title, message, colour, createdBy) {
        const [popup] = await db.insert(staffPopups).values({ title, message, colour, createdBy }).returning();
        return popup;
      }
      async deleteStaffPopup(id, deletedBy) {
        const result = await db.update(staffPopups).set({ deletedAt: /* @__PURE__ */ new Date(), deletedBy }).where(and(eq(staffPopups.id, id), isNull(staffPopups.deletedAt))).returning();
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
      // ── Membership Plans ────────────────────────────────────────────────────────
      async getMembershipPlans(activeOnly = false) {
        const query = db.select().from(membershipPlans);
        if (activeOnly) {
          return query.where(eq(membershipPlans.active, true)).orderBy(membershipPlans.sortOrder);
        }
        return query.orderBy(membershipPlans.sortOrder);
      }
      async getMembershipPlan(id) {
        const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, id));
        return plan;
      }
      async upsertMembershipPlan(data) {
        const [existing] = await db.select().from(membershipPlans).where(eq(membershipPlans.tier, data.tier));
        if (existing) {
          const [updated] = await db.update(membershipPlans).set({
            name: data.name,
            priceMonthly: data.priceMonthly,
            hoursIncluded: data.hoursIncluded ?? null,
            hoursUnit: data.hoursUnit ?? "month",
            foodDrinkDiscount: data.foodDrinkDiscount ?? 0,
            priorityBooking: data.priorityBooking ?? false,
            loyaltyMultiplier: data.loyaltyMultiplier ?? 1,
            guestPassesMonthly: data.guestPassesMonthly ?? 0,
            active: data.active ?? true,
            sortOrder: data.sortOrder ?? 0,
            color: data.color ?? "#0047AB",
            description: data.description ?? null
          }).where(eq(membershipPlans.tier, data.tier)).returning();
          return updated;
        }
        const [plan] = await db.insert(membershipPlans).values(data).returning();
        return plan;
      }
      async updateMembershipPlan(id, data) {
        const [plan] = await db.update(membershipPlans).set(data).where(eq(membershipPlans.id, id)).returning();
        return plan;
      }
      // ── Membership Subscriptions ────────────────────────────────────────────────
      async getMembershipSubscriptions() {
        const rows = await db.select().from(membershipSubscriptions).orderBy(desc(membershipSubscriptions.createdAt));
        const result = await Promise.all(rows.map(async (sub) => {
          const [customer] = await db.select().from(customers).where(eq(customers.id, sub.customerId));
          const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, sub.planId));
          return { ...sub, customer: customer || null, plan: plan || null };
        }));
        return result;
      }
      async getMembershipSubscriptionByCustomer(customerId) {
        const [sub] = await db.select().from(membershipSubscriptions).where(and(eq(membershipSubscriptions.customerId, customerId), eq(membershipSubscriptions.status, "active"))).orderBy(desc(membershipSubscriptions.createdAt));
        if (!sub) return null;
        const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, sub.planId));
        return { ...sub, plan: plan || null };
      }
      async getMembershipSubscription(id) {
        const [sub] = await db.select().from(membershipSubscriptions).where(eq(membershipSubscriptions.id, id));
        return sub;
      }
      async createMembershipSubscription(data) {
        const [sub] = await db.insert(membershipSubscriptions).values(data).returning();
        return sub;
      }
      async updateMembershipSubscription(id, data) {
        const [sub] = await db.update(membershipSubscriptions).set(data).where(eq(membershipSubscriptions.id, id)).returning();
        return sub;
      }
      async getMembershipStats() {
        const all = await db.select().from(membershipSubscriptions);
        const active = all.filter((s) => s.status === "active");
        const paused = all.filter((s) => s.status === "paused");
        const cancelled = all.filter((s) => s.status === "cancelled");
        let mrr = 0;
        for (const sub of active) {
          const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, sub.planId));
          if (plan) mrr += plan.priceMonthly;
        }
        return { total: all.length, active: active.length, paused: paused.length, cancelled: cancelled.length, mrr };
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
async function searchLoyaltyEvents(accountId, limit = 10) {
  try {
    const data = await squareRequest("POST", "/v2/loyalty/events/search", {
      query: {
        filter: {
          loyalty_account_filter: { loyalty_account_id: accountId }
        }
      },
      limit
    });
    return data.events || [];
  } catch {
    return [];
  }
}
async function searchIssuedRewards(accountId) {
  try {
    const data = await squareRequest("POST", "/v2/loyalty/rewards/search", {
      query: {
        loyalty_account_id: accountId,
        status: "ISSUED"
      }
    });
    return data.rewards || [];
  } catch {
    return [];
  }
}
function isConfigured() {
  return !!(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID);
}
async function createSquareCustomer(name, email, phone) {
  const data = await squareRequest("POST", "/v2/customers", {
    given_name: name.split(" ")[0],
    family_name: name.split(" ").slice(1).join(" ") || "",
    email_address: email,
    phone_number: phone ? toE164(phone) : void 0,
    idempotency_key: `cust-${email}-${Date.now()}`
  });
  return data.customer;
}
async function findSquareCustomerByEmail(email) {
  const data = await squareRequest("POST", "/v2/customers/search", {
    query: { filter: { email_address: { fuzzy: email } } },
    limit: 1
  });
  return data.customers?.[0] || null;
}
async function createSquareSubscription(squareCustomerId, planVariationId, locationId, cardId) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const body = {
    idempotency_key: `sub-${squareCustomerId}-${Date.now()}`,
    location_id: locationId,
    plan_variation_id: planVariationId,
    customer_id: squareCustomerId,
    start_date: today
  };
  if (cardId) body.card_id = cardId;
  const data = await squareRequest("POST", "/v2/subscriptions", body);
  return data.subscription;
}
async function cancelSquareSubscription(subscriptionId) {
  const data = await squareRequest("POST", `/v2/subscriptions/${subscriptionId}/cancel`, {});
  return data.subscription;
}
async function pauseSquareSubscription(subscriptionId) {
  const data = await squareRequest("POST", `/v2/subscriptions/${subscriptionId}/pause`, {
    pause_subscription_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10)
  });
  return data.subscription;
}
async function resumeSquareSubscription(subscriptionId) {
  const data = await squareRequest("POST", `/v2/subscriptions/${subscriptionId}/resume`, {
    resume_change_timing: "IMMEDIATE"
  });
  return data.subscription;
}
async function createDepositPaymentLink(opts) {
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) throw new Error("SQUARE_LOCATION_ID not configured");
  const data = await squareRequest("POST", "/v2/online-checkout/payment-links", {
    idempotency_key: `deposit-${opts.referenceId}-${Date.now()}`,
    quick_pay: {
      name: opts.description,
      price_money: {
        amount: opts.amountPence,
        currency: "GBP"
      },
      location_id: locationId
    },
    checkout_options: {
      redirect_url: opts.redirectUrl
    },
    payment_note: opts.referenceId
  });
  const link = data.payment_link;
  return {
    url: link.url,
    paymentLinkId: link.id
  };
}
async function listCustomerGroups() {
  const data = await squareRequest("GET", "/v2/customers/groups");
  return data.groups || [];
}
async function getOrCreateCustomerGroup(name) {
  const groups = await listCustomerGroups();
  const existing = groups.find((g) => g.name === name);
  if (existing) return existing.id;
  const data = await squareRequest("POST", "/v2/customers/groups", {
    idempotency_key: `group-${name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`,
    group: { name }
  });
  return data.group.id;
}
async function addCustomerToGroup(customerId, groupId) {
  await squareRequest("PUT", `/v2/customers/${customerId}/groups/${groupId}`);
}
async function removeCustomerFromGroup(customerId, groupId) {
  await squareRequest("DELETE", `/v2/customers/${customerId}/groups/${groupId}`);
}
async function getCustomerGroupIds(customerId) {
  const data = await squareRequest("GET", `/v2/customers/${customerId}`);
  return data.customer?.group_ids || [];
}
async function createMembershipCheckoutLink(opts) {
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) throw new Error("SQUARE_LOCATION_ID not configured");
  const data = await squareRequest("POST", "/v2/online-checkout/payment-links", {
    idempotency_key: `membership-${opts.subscriptionId}-${Date.now()}`,
    quick_pay: {
      name: `${opts.planName} Membership`,
      price_money: {
        amount: opts.amountPence,
        currency: "GBP"
      },
      location_id: locationId
    },
    payment_note: `MEMBERSHIP:${opts.subscriptionId}`,
    checkout_options: {
      redirect_url: opts.redirectUrl
    }
  });
  const link = data.payment_link;
  return { url: link.url, paymentLinkId: link.id };
}
function membershipGroupName(planName) {
  return `147 Bradford \u2014 ${planName} Members`;
}
async function createRefund(opts) {
  const data = await squareRequest("POST", "/v2/refunds", {
    idempotency_key: opts.idempotencyKey,
    payment_id: opts.paymentId,
    amount_money: {
      amount: opts.amountPence,
      currency: "GBP"
    },
    reason: opts.reason
  });
  return data.refund;
}

// server/ticketsource.ts
var cachedEvents = [];
var lastFetchTime = 0;
var CACHE_DURATION_MS = 10 * 60 * 1e3;
function parseIso(iso) {
  const d = new Date(iso);
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 16);
  return { date, time };
}
async function fetchTicketSourceEvents() {
  const now = Date.now();
  if (cachedEvents.length > 0 && now - lastFetchTime < CACHE_DURATION_MS) {
    return cachedEvents;
  }
  const apiKey = process.env.TICKETSOURCE_API_KEY;
  if (!apiKey) {
    console.log("TICKETSOURCE_API_KEY not set, returning cached/empty events");
    return cachedEvents;
  }
  try {
    const eventsRes = await fetch("https://api.ticketsource.io/events?per_page=100", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!eventsRes.ok) {
      console.error("TicketSource events fetch failed:", eventsRes.status, await eventsRes.text());
      return cachedEvents;
    }
    const eventsData = await eventsRes.json();
    const tsEvents = eventsData.data || [];
    const allAppEvents = [];
    for (const event of tsEvents) {
      if (event.attributes.archived) continue;
      if (!event.attributes.activated) continue;
      const imageUrl = event.attributes.images?.find((i) => i.type === "banner")?.src ?? event.attributes.images?.[0]?.src ?? null;
      try {
        const datesRes = await fetch(
          `https://api.ticketsource.io/events/${event.id}/dates?per_page=100`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        if (!datesRes.ok) continue;
        const datesData = await datesRes.json();
        const dates = datesData.data || [];
        const activeDates = dates.filter((d) => !d.attributes.cancelled && d.attributes.public);
        if (activeDates.length === 0) {
          allAppEvents.push({
            id: event.id,
            title: event.attributes.name,
            description: event.attributes.description || "",
            date: "",
            time: "",
            endDate: null,
            endTime: null,
            status: "on_sale",
            isSoldOut: false,
            ticketUrl: `https://www.ticketsource.com/the147`,
            imageUrl,
            capacity: null,
            availableCapacity: null
          });
        } else {
          for (const d of activeDates) {
            const { date, time } = parseIso(d.attributes.start);
            const endParsed = d.attributes.end ? parseIso(d.attributes.end) : null;
            const bookUrl = d.links?.book_now || `https://www.ticketsource.com/the147`;
            allAppEvents.push({
              id: `${event.id}_${d.id}`,
              title: event.attributes.name,
              description: event.attributes.description || "",
              date,
              time,
              endDate: endParsed?.date ?? null,
              endTime: endParsed?.time ?? null,
              status: d.attributes.on_sale ? "on_sale" : "sold_out",
              isSoldOut: !d.attributes.on_sale,
              ticketUrl: bookUrl,
              imageUrl,
              capacity: null,
              availableCapacity: null
            });
          }
        }
      } catch (err) {
        console.error(`Error fetching dates for event ${event.id}:`, err);
      }
    }
    allAppEvents.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return (a.time || "").localeCompare(b.time || "");
    });
    cachedEvents = allAppEvents;
    lastFetchTime = now;
    console.log(`TicketSource: fetched ${allAppEvents.length} event dates from ${tsEvents.length} events`);
    return allAppEvents;
  } catch (err) {
    console.error("TicketSource fetch error:", err);
    return cachedEvents;
  }
}

// server/routes.ts
function tsIdToNumber(tsId) {
  let hash = 5381;
  for (let i = 0; i < tsId.length; i++) {
    hash = (hash << 5) + hash + tsId.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) + 1e6;
}
function mapTsEvent(e) {
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
    createdAt: /* @__PURE__ */ new Date(),
    source: "ticketsource"
  };
}
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
function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
var rateLimitStore = /* @__PURE__ */ new Map();
function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const entry = rateLimitStore.get(key) || { count: 0, windowStart: now };
  if (now - entry.windowStart > windowMs) {
    entry.count = 1;
    entry.windowStart = now;
    rateLimitStore.set(key, entry);
    return { allowed: true, retryAfter: 0 };
  }
  entry.count++;
  rateLimitStore.set(key, entry);
  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((windowMs - (now - entry.windowStart)) / 1e3);
    return { allowed: false, retryAfter };
  }
  return { allowed: true, retryAfter: 0 };
}
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1e3;
  for (const [k, v] of rateLimitStore) {
    if (v.windowStart < cutoff) rateLimitStore.delete(k);
  }
}, 15 * 60 * 1e3);
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
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");
  const port = parseInt(process.env.SMTP_PORT || "587");
  if (!host || !user || !pass) return false;
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    });
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
  const resendKey = process.env.RESEND_API_KEY;
  const smtpSent = await sendEmailViaSMTP(email, subject, html);
  if (smtpSent) return true;
  if (resendKey) {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const fromName = process.env.RESEND_FROM_NAME || "The 147";
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
      console.warn(`[LOYALTY OTP] Resend also failed (${response.status}): ${errorText}`);
    } catch (err) {
      console.warn("[LOYALTY OTP] Resend exception:", err);
    }
  }
  console.warn(`[LOYALTY OTP] All email methods failed. Manual code for ${email}: ${code}`);
  return false;
}
async function sendDepositLinkEmail(booking) {
  const dateObj = /* @__PURE__ */ new Date(booking.date + "T00:00:00");
  const dateFormatted = dateObj.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const bookingRef = `147-${booking.id.toString().padStart(5, "0")}`;
  const subject = `Deposit Required \u2013 Dining Booking ${bookingRef} on ${dateFormatted}`;
  const html = `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #ffffff;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #0A1628; font-size: 24px; margin: 0;">The 147</h1>
      <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0;">Snooker, Bar &amp; Restaurant</p>
    </div>
    <div style="background: #FFF7E6; border: 1.5px solid #FCD34D; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 28px;">\u{1F4B3}</span>
      <h2 style="color: #92400E; font-size: 18px; margin: 8px 0 0;">Deposit Required</h2>
    </div>
    <p style="color: #374151; font-size: 15px;">Hi ${escHtml(booking.customerName)},</p>
    <p style="color: #374151; font-size: 15px;">Thank you for your dining booking at The 147 for <strong>${booking.guestCount} guests</strong> on ${escHtml(dateFormatted)} at ${escHtml(booking.startTime)}.</p>
    <p style="color: #374151; font-size: 15px;">A <strong>\xA35.00 deposit</strong> is required to confirm your booking. Please click the button below to pay securely.</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${booking.depositPaymentUrl}" style="display: inline-block; background: #16A34A; color: #fff; font-size: 16px; font-weight: 700; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Pay \xA35.00 Deposit \u2192</a>
    </div>
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Booking Ref</td><td style="padding: 8px 0; color: #0047AB; font-size: 15px; font-weight: 700; text-align: right;">${escHtml(bookingRef)}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Date</td><td style="padding: 8px 0; color: #0A1628; font-size: 14px; font-weight: 600; text-align: right;">${escHtml(dateFormatted)}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Time</td><td style="padding: 8px 0; color: #0A1628; font-size: 14px; font-weight: 600; text-align: right;">${escHtml(booking.startTime)}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Guests</td><td style="padding: 8px 0; color: #0A1628; font-size: 14px; font-weight: 600; text-align: right;">${booking.guestCount} guests</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Deposit</td><td style="padding: 8px 0; color: #D97706; font-size: 14px; font-weight: 700; text-align: right;">\xA35.00 due</td></tr>
      </table>
    </div>
    <p style="color: #374151; font-size: 13px; line-height: 1.6;">Your booking will be confirmed once the deposit is received. If you have any questions, please contact us.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 12px; text-align: center;">The 147 &mdash; Snooker, Bar &amp; Restaurant<br/>www.the147.co.uk</p>
  </div>`;
  const smtpSent = await sendEmailViaSMTP(booking.customerEmail, subject, html);
  if (smtpSent) {
    console.log(`[BOOKING] Deposit link email sent via SMTP to ${booking.customerEmail} for booking #${booking.id}`);
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
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: booking.customerEmail, subject, html })
      });
      if (response.ok) return true;
    } catch (_) {
    }
  }
  console.warn(`[BOOKING] Deposit link email failed for booking #${booking.id}`);
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
  const smtpSent = await sendEmailViaSMTP(booking.customerEmail, subject, html);
  if (smtpSent) {
    console.log(`[BOOKING] Confirmation email sent via SMTP to ${booking.customerEmail} for booking #${booking.id}`);
    return true;
  }
  if (resendKey) {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const fromName = process.env.RESEND_FROM_NAME || "The 147";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: booking.customerEmail, subject, html })
      });
      if (response.ok) {
        console.log(`[BOOKING] Confirmation email sent via Resend to ${booking.customerEmail} for booking #${booking.id}`);
        return true;
      }
      console.warn("[BOOKING] Resend also failed:", await response.text());
    } catch (err) {
      console.warn("[BOOKING] Resend exception:", err);
    }
  }
  console.warn(`[BOOKING] Confirmation email could not be sent for booking #${booking.id} to ${booking.customerEmail}`);
  return false;
}
function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
}
function checkLoginRateLimit(ip) {
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
    const rateCheck = checkLoginRateLimit(clientIp);
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
    const rateCheck = checkLoginRateLimit(clientIp);
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
      active: u.active,
      approvalStatus: u.approvalStatus
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
    const id = parseInt(req.body.id, 10);
    const active = req.body.active;
    if (isNaN(id) || typeof active !== "boolean") {
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
  app2.get("/api/staff/customers/search", staffAuth, async (req, res) => {
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
  app2.patch("/api/staff/approve", staffAuth, ownerAuth, async (req, res) => {
    console.log("[approve] req.body:", JSON.stringify(req.body));
    const username = req.body.username;
    const id = req.body.id;
    const finalStatus = req.body.approvalStatus || req.body.status || "";
    if (!["approved", "rejected"].includes(finalStatus)) {
      return res.status(400).json({ message: "approvalStatus ('approved' or 'rejected') is required" });
    }
    let staffUser;
    if (username && typeof username === "string") {
      staffUser = await storage.getStaffUserByUsername(username.trim());
    } else if (id !== void 0 && id !== null) {
      const numId = typeof id === "number" ? id : parseInt(String(id), 10);
      if (!isNaN(numId)) {
        const allUsers = await storage.getAllStaffUsers();
        staffUser = allUsers.find((u) => u.id === numId);
      }
    }
    if (!staffUser) return res.status(404).json({ message: "Staff user not found" });
    const updated = await storage.updateStaffApproval(staffUser.id, finalStatus);
    if (!updated) return res.status(404).json({ message: "Staff user not found" });
    res.json({ message: `Account ${finalStatus}`, user: { id: updated.id, username: updated.username, approvalStatus: updated.approvalStatus } });
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
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
    const rl = checkRateLimit(`booking:${ip}`, 10, 15 * 60 * 1e3);
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({ message: "Too many booking requests. Please wait before trying again." });
    }
    const raw = { ...req.body };
    for (const key of ["tableNumber", "guestCount", "notes", "emailHash"]) {
      if (raw[key] === null || raw[key] === void 0) delete raw[key];
    }
    if (raw.tableNumber !== void 0) raw.tableNumber = String(raw.tableNumber);
    if (raw.duration !== void 0) raw.duration = Number(raw.duration);
    console.log("[booking] raw body keys:", Object.keys(req.body), "tableNumber type:", typeof raw.tableNumber, "value:", raw.tableNumber);
    const parsed = insertBookingSchema.safeParse(raw);
    if (!parsed.success) {
      console.log("[booking] validation failed:", JSON.stringify(parsed.error.flatten()));
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
      const bookingDate = /* @__PURE__ */ new Date(parsed.data.date + "T00:00:00");
      const dow = bookingDate.getDay();
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
    } else if (parsed.data.tableType === "snooker") {
      if (!parsed.data.tableNumber) {
        return res.status(400).json({ message: "Please select a snooker table number (1\u201310)" });
      }
      const snookerNum = parseInt(parsed.data.tableNumber);
      if (snookerNum < 1 || snookerNum > 10) {
        return res.status(400).json({ message: "Invalid snooker table number. Choose between 1 and 10." });
      }
      finalTableNumber = parsed.data.tableNumber;
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
    const DEPOSIT_GUEST_THRESHOLD = 7;
    const DEPOSIT_AMOUNT_PENCE = 500;
    const depositHandling = req.body.depositHandling;
    const guestCount = parsed.data.guestCount ?? 0;
    const isLargeParty = parsed.data.tableType === "dining" && guestCount >= DEPOSIT_GUEST_THRESHOLD;
    if (isLargeParty && depositHandling === "mark_paid") {
      const booking2 = await storage.createBooking({
        ...parsed.data,
        tableNumber: finalTableNumber ?? void 0,
        status: "confirmed",
        depositRequired: true,
        depositPaid: true
      });
      sendBookingConfirmationEmail({
        customerName: parsed.data.customerName,
        customerEmail: parsed.data.customerEmail,
        tableType: parsed.data.tableType,
        tableNumber: parsed.data.tableNumber,
        date: parsed.data.date,
        startTime: parsed.data.startTime,
        duration: parsed.data.duration ?? 1,
        id: booking2.id
      }).catch((err) => console.error("[BOOKING] Email send error:", err));
      return res.status(201).json({ ...booking2, depositHandled: "mark_paid" });
    }
    const requiresDeposit = isLargeParty && (!!process.env.SQUARE_DEPOSIT_LINK_URL || isConfigured());
    const booking = await storage.createBooking({
      ...parsed.data,
      tableNumber: finalTableNumber ?? void 0,
      status: requiresDeposit ? "pending_deposit" : "confirmed",
      depositRequired: requiresDeposit,
      depositPaid: false
    });
    if (requiresDeposit) {
      const staticDepositUrl = process.env.SQUARE_DEPOSIT_LINK_URL;
      const bookingRef = `147-${booking.id.toString().padStart(5, "0")}`;
      if (staticDepositUrl) {
        if (depositHandling === "send_link") {
          const emailSent = await sendDepositLinkEmail({
            customerName: parsed.data.customerName,
            customerEmail: parsed.data.customerEmail,
            guestCount,
            date: parsed.data.date,
            startTime: parsed.data.startTime,
            id: booking.id,
            depositPaymentUrl: staticDepositUrl
          }).catch((err) => {
            console.error("[BOOKING] Deposit email error:", err);
            return false;
          });
          if (!emailSent) console.warn(`[BOOKING] Deposit link email FAILED for booking #${booking.id} \u2014 SMTP credentials may be invalid`);
          return res.status(201).json({ ...booking, depositRequired: true, depositHandled: "send_link", emailSent: emailSent === true, depositPaymentUrl: staticDepositUrl });
        }
        return res.status(201).json({ ...booking, depositRequired: true, depositPaymentUrl: staticDepositUrl });
      }
      try {
        const appDomain = process.env.EXPO_PUBLIC_DOMAIN || req.get("host") || "localhost:5000";
        const protocol = appDomain.includes("localhost") ? "http" : "https";
        const redirectUrl = `${protocol}://${appDomain}/api/bookings/${booking.id}/deposit-return`;
        const paymentLink = await createDepositPaymentLink({
          amountPence: DEPOSIT_AMOUNT_PENCE,
          description: `Dining Deposit \u2013 Booking ${bookingRef} (${guestCount} guests)`,
          referenceId: bookingRef,
          redirectUrl
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
            depositPaymentUrl: paymentLink.url
          }).catch((err) => {
            console.error("[BOOKING] Deposit email error:", err);
            return false;
          });
          if (!emailSent) console.warn(`[BOOKING] Deposit link email FAILED for booking #${booking.id}`);
          return res.status(201).json({ ...booking, depositRequired: true, depositHandled: "send_link", emailSent: emailSent === true });
        }
        return res.status(201).json({ ...booking, depositRequired: true, depositPaymentUrl: paymentLink.url });
      } catch (err) {
        console.error("[BOOKING] Deposit link error \u2014 Square code:", err?.code, "| message:", err?.message, "| status:", err?.statusCode);
        return res.status(503).json({
          message: "payment_link_failed",
          bookingRef,
          bookingId: booking.id
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
      id: booking.id
    }).catch((err) => console.error("[BOOKING] Email send error:", err));
    res.status(201).json(booking);
  });
  app2.post("/api/staff/bookings/repeat", staffAuth, async (req, res) => {
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
    for (const key of ["tableNumber", "guestCount", "notes", "emailHash"]) {
      if (raw[key] === null || raw[key] === void 0) delete raw[key];
    }
    if (raw.tableNumber !== void 0) raw.tableNumber = String(raw.tableNumber);
    if (raw.duration !== void 0) raw.duration = Number(raw.duration);
    const parsed = insertBookingSchema.safeParse({ ...raw, gdprConsent: true });
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid booking data", errors: parsed.error.flatten() });
    }
    const intervalDays = repeatType === "daily" ? 1 : 7;
    const toSlotMins = (t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + (m || 0);
    };
    const DINING_TABLE_COUNT = 25;
    const DINING_TABLE_START = 18;
    const createdBookings = [];
    const skippedDates = [];
    const startDate = /* @__PURE__ */ new Date(parsed.data.date + "T12:00:00Z");
    for (let i = 0; i < count; i++) {
      const d = new Date(startDate);
      d.setUTCDate(startDate.getUTCDate() + i * intervalDays);
      const dateStr = d.toISOString().split("T")[0];
      try {
        let finalTableNumber = parsed.data.tableNumber ?? null;
        if (parsed.data.tableType === "dining") {
          const allBookings = await storage.getBookingsByDate(dateStr);
          const confirmedDining = allBookings.filter((b) => b.tableType === "dining" && b.status === "confirmed" && b.tableNumber);
          const reqStart = toSlotMins(parsed.data.startTime);
          const reqEnd = reqStart + (parsed.data.duration ?? 1) * 60;
          const occupied = /* @__PURE__ */ new Set();
          for (const b of confirmedDining) {
            const bStart = toSlotMins(b.startTime);
            const bEnd = bStart + (b.duration ?? 1) * 60;
            if (reqStart < bEnd && reqEnd > bStart && b.tableNumber) occupied.add(b.tableNumber);
          }
          let assigned = null;
          for (let t = DINING_TABLE_START; t < DINING_TABLE_START + DINING_TABLE_COUNT; t++) {
            if (!occupied.has(String(t))) {
              assigned = String(t);
              break;
            }
          }
          if (!assigned) {
            skippedDates.push(dateStr);
            continue;
          }
          finalTableNumber = assigned;
        } else {
          const bookedSlots = await storage.getBookedSlots(dateStr, parsed.data.tableType, finalTableNumber ?? void 0);
          const reqStart = parseInt(parsed.data.startTime.replace(":", ""));
          const reqEnd = reqStart + (parsed.data.duration ?? 1) * 100;
          let conflict = false;
          for (const slot of bookedSlots) {
            const sStart = parseInt(slot.startTime.replace(":", ""));
            const sEnd = sStart + slot.duration * 100;
            if (reqStart < sEnd && reqEnd > sStart) {
              conflict = true;
              break;
            }
          }
          if (conflict) {
            skippedDates.push(dateStr);
            continue;
          }
        }
        const booking = await storage.createBooking({ ...parsed.data, date: dateStr, tableNumber: finalTableNumber ?? void 0 });
        createdBookings.push(booking);
      } catch (err) {
        console.error(`[repeat-booking] Error for date ${dateStr}:`, err);
        skippedDates.push(dateStr);
      }
    }
    res.status(201).json({ created: createdBookings.length, skipped: skippedDates.length, skippedDates, bookings: createdBookings });
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
    const { message, colour } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "Notice message is required" });
    }
    const validColour = ["amber", "red", "green"].includes(colour) ? colour : "amber";
    const createdBy = req.staffUsername || "Manager";
    const notice = await storage.createStaffNotice(message.trim(), createdBy, validColour);
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
  app2.get("/api/staff-popups", staffAuth, async (_req, res) => {
    const popups = await storage.getStaffPopups();
    res.json(popups);
  });
  app2.post("/api/staff-popups", staffAuth, managerAuth, async (req, res) => {
    const { title, message, colour } = req.body;
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "Popup title is required" });
    }
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "Popup message is required" });
    }
    const validColour = ["amber", "red", "green"].includes(colour) ? colour : "amber";
    const createdBy = req.staffUsername || "Manager";
    const popup = await storage.createStaffPopup(title.trim(), message.trim(), validColour, createdBy);
    res.status(201).json(popup);
  });
  app2.delete("/api/staff-popups/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid popup ID" });
    const deletedBy = req.staffUsername || "Manager";
    const deleted = await storage.deleteStaffPopup(id, deletedBy);
    if (!deleted) return res.status(404).json({ message: "Popup not found" });
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
  app2.post("/api/webhooks/square", async (req, res) => {
    const sigKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    if (sigKey) {
      const signature = req.headers["x-square-hmacsha256-signature"];
      if (!signature) {
        console.warn("[WEBHOOK] Missing Square signature header");
        return res.status(401).json({ message: "Missing signature" });
      }
      try {
        const { createHmac } = await import("node:crypto");
        const notificationUrl = process.env.SQUARE_WEBHOOK_URL || `https://${process.env.EXPO_PUBLIC_DOMAIN || req.get("host")}/api/webhooks/square`;
        const rawBody = req.rawBody?.toString("utf8") ?? JSON.stringify(req.body);
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
    const eventType = event?.type ?? "";
    console.log("[WEBHOOK] Square event received:", eventType);
    if (eventType === "subscription.updated" || eventType === "subscription.activated") {
      try {
        const sqSub = event?.data?.object?.subscription;
        if (sqSub?.id) {
          const allSubs = await storage.getMembershipSubscriptions();
          const local = allSubs.find((s) => s.squareSubscriptionId === sqSub.id);
          if (local) {
            const status = sqSub.status === "ACTIVE" ? "active" : sqSub.status === "PAUSED" ? "paused" : sqSub.status === "CANCELED" ? "cancelled" : sqSub.status === "PENDING" ? "pending" : "active";
            await storage.updateMembershipSubscription(local.id, {
              status,
              currentPeriodStart: sqSub.start_date ?? local.currentPeriodStart ?? void 0,
              currentPeriodEnd: sqSub.charged_through_date ?? local.currentPeriodEnd ?? void 0
            });
            console.log(`[WEBHOOK] Local membership #${local.id} synced from Square subscription status: ${status}`);
          }
        }
      } catch (err) {
        console.error("[WEBHOOK] subscription.updated error:", err);
      }
      return res.sendStatus(200);
    }
    if (eventType === "invoice.payment_failed") {
      try {
        const invoice = event?.data?.object?.invoice;
        const sqSubId = invoice?.subscription_id;
        if (sqSubId) {
          const allSubs = await storage.getMembershipSubscriptions();
          const local = allSubs.find((s) => s.squareSubscriptionId === sqSubId);
          if (local) {
            const newAttempts = (local.failedPaymentAttempts ?? 0) + 1;
            const shouldFreeze = newAttempts >= 3;
            await storage.updateMembershipSubscription(local.id, {
              failedPaymentAttempts: newAttempts,
              ...shouldFreeze ? { status: "frozen" } : {}
            });
            console.log(`[WEBHOOK] Membership #${local.id} renewal failed (attempt ${newAttempts})${shouldFreeze ? " \u2014 FROZEN" : ""}`);
            const customer = await storage.getCustomerById(local.customerId).catch(() => null);
            if (customer?.email) {
              const tokens = await storage.getPushTokensByEmail(customer.email).catch(() => []);
              if (tokens.length > 0) {
                const title = shouldFreeze ? "Membership Suspended" : newAttempts === 2 ? "Renewal Failed Again" : "Renewal Payment Failed";
                const body = shouldFreeze ? "Your membership has been suspended after 3 failed renewal payments. Please update your payment details." : newAttempts === 2 ? `Renewal failed (${newAttempts}/3). One more failure will suspend your membership.` : "Your monthly membership renewal payment failed. Please ensure your card is up to date.";
                await sendTargetedPush(tokens.map((t) => t.token), title, body).catch(() => {
                });
              }
            }
          }
        }
      } catch (err) {
        console.error("[WEBHOOK] invoice.payment_failed error:", err);
      }
      return res.sendStatus(200);
    }
    if (eventType !== "payment.updated") return res.sendStatus(200);
    const payment = event?.data?.object?.payment;
    if (!payment) return res.sendStatus(200);
    const paymentStatus = payment.status ?? "";
    const amountPence = payment.amount_money?.amount;
    const currency = payment.amount_money?.currency;
    const paymentNote = payment.note || payment.payment_note || "";
    if (paymentNote.startsWith("MEMBERSHIP:")) {
      const subId = parseInt(paymentNote.split(":")[1] ?? "");
      if (!isNaN(subId)) {
        try {
          const sub = await storage.getMembershipSubscription(subId);
          if (!sub) return res.sendStatus(200);
          if (paymentStatus === "COMPLETED") {
            await storage.updateMembershipSubscription(subId, {
              status: "active",
              failedPaymentAttempts: 0
            });
            console.log(`[WEBHOOK] Membership #${subId} activated`);
            if (sub.squareCustomerId) {
              const plan = await storage.getMembershipPlan(sub.planId).catch(() => null);
              if (plan) {
                const allPlans = await storage.getMembershipPlans();
                const allGroupNames = allPlans.map((p) => membershipGroupName(p.name));
                const currentGroupIds = await getCustomerGroupIds(sub.squareCustomerId).catch(() => []);
                const allGroups = await listCustomerGroups().catch(() => []);
                for (const group of allGroups) {
                  if (allGroupNames.includes(group.name) && currentGroupIds.includes(group.id)) {
                    await removeCustomerFromGroup(sub.squareCustomerId, group.id).catch(() => {
                    });
                  }
                }
                const groupId = await getOrCreateCustomerGroup(membershipGroupName(plan.name)).catch(() => null);
                if (groupId) await addCustomerToGroup(sub.squareCustomerId, groupId).catch(() => {
                });
                if (plan.squarePlanVariationId && !sub.squareSubscriptionId && process.env.SQUARE_LOCATION_ID) {
                  const sqSub = await createSquareSubscription(
                    sub.squareCustomerId,
                    plan.squarePlanVariationId,
                    process.env.SQUARE_LOCATION_ID
                  ).catch((e) => {
                    console.warn("[WEBHOOK] Recurring subscription setup failed:", e.message);
                    return null;
                  });
                  if (sqSub) {
                    await storage.updateMembershipSubscription(subId, {
                      squareSubscriptionId: sqSub.id,
                      currentPeriodEnd: sqSub.charged_through_date ?? void 0
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
              ...shouldFreeze ? { status: "frozen" } : {}
            });
            console.log(`[WEBHOOK] Membership #${subId} payment failed (attempt ${newAttempts})${shouldFreeze ? " \u2014 FROZEN" : ""}`);
            const customer = await storage.getCustomerById(sub.customerId).catch(() => null);
            if (customer?.email) {
              const tokens = await storage.getPushTokensByEmail(customer.email).catch(() => []);
              if (tokens.length > 0) {
                const title = shouldFreeze ? "Membership Suspended" : newAttempts === 2 ? "Payment Failed Again" : "Membership Payment Failed";
                const body = shouldFreeze ? "Your membership benefits have been suspended after 3 failed payments. Please retry payment to restore access." : newAttempts === 2 ? `Your membership payment failed (attempt ${newAttempts}/3). One more failure will suspend your benefits. Please retry.` : "Your membership payment failed. Please retry to keep your benefits active.";
                await sendTargetedPush(tokens.map((t) => t.token), title, body).catch(() => {
                });
              }
            }
          }
        } catch (mErr) {
          console.error("[WEBHOOK] Membership payment error:", mErr);
        }
      }
      return res.sendStatus(200);
    }
    if (paymentStatus !== "COMPLETED") return res.sendStatus(200);
    if (amountPence !== 500 || currency !== "GBP") return res.sendStatus(200);
    console.log(`[WEBHOOK] \xA35 deposit payment completed \u2014 payment ID: ${payment.id}`);
    try {
      let booking;
      if (paymentNote && paymentNote.startsWith("147-")) {
        const bookingId = parseInt(paymentNote.replace("147-", "").replace(/^0+/, "") || "0");
        if (!isNaN(bookingId) && bookingId > 0) {
          const byRef = await storage.getBooking(bookingId).catch(() => void 0);
          if (byRef && byRef.status === "pending_deposit") {
            booking = byRef;
            console.log(`[WEBHOOK] Matched booking #${booking.id} by reference: ${paymentNote}`);
          }
        }
      }
      if (!booking) {
        const buyerEmail = payment.buyer_email_address;
        if (buyerEmail) {
          const byEmail = await storage.getBookingsByEmail(buyerEmail);
          const pending = byEmail.filter((b) => b.status === "pending_deposit");
          if (pending.length > 0) {
            booking = pending.sort((a, b) => b.id - a.id)[0];
            console.log(`[WEBHOOK] Matched booking #${booking.id} by email: ${buyerEmail}`);
          }
        }
      }
      if (!booking) {
        const all = await storage.getBookings();
        const cutoff = Date.now() - 4 * 60 * 60 * 1e3;
        const recent = all.filter((b) => b.status === "pending_deposit" && new Date(b.createdAt ?? 0).getTime() > cutoff).sort((a, b) => b.id - a.id);
        if (recent.length > 0) {
          booking = recent[0];
          console.log(`[WEBHOOK] Matched booking #${booking.id} by time proximity (no email match)`);
        }
      }
      if (!booking) {
        console.warn("[WEBHOOK] No pending_deposit booking found for this payment");
        return res.sendStatus(200);
      }
      await storage.updateBooking(booking.id, {
        depositPaid: true,
        status: "confirmed",
        squarePaymentId: payment.id ?? null
      });
      console.log(`[WEBHOOK] Booking #${booking.id} confirmed automatically after deposit payment`);
      sendBookingConfirmationEmail({
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        tableType: booking.tableType,
        tableNumber: booking.tableNumber,
        date: booking.date,
        startTime: booking.startTime,
        duration: booking.duration,
        id: booking.id
      }).catch(() => {
      });
    } catch (err) {
      console.error("[WEBHOOK] Error processing Square webhook:", err);
    }
    res.sendStatus(200);
  });
  app2.get("/api/bookings/:id/deposit-return", async (req, res) => {
    const id = parseInt(req.params.id);
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
        id: booking.id
      }).catch(() => {
      });
    }
    const bookingRef = `147-${id.toString().padStart(5, "0")}`;
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Deposit Paid</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb}div{text-align:center;padding:32px}</style></head><body><div><div style="font-size:48px">&#10003;</div><h2 style="color:#16A34A">Deposit Paid</h2><p>Your booking <strong>${bookingRef}</strong> is confirmed.</p><p style="color:#6b7280;font-size:14px">You can close this window and return to The 147 app.</p></div></body></html>`);
  });
  app2.patch("/api/bookings/:id/complete", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const booking = await storage.getBooking(id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    let depositRefunded = false;
    let refundId;
    let refundError;
    if (booking.depositPaid && booking.squarePaymentId && !booking.depositRefunded) {
      try {
        const DEPOSIT_AMOUNT_PENCE = parseInt(process.env.DEPOSIT_AMOUNT_PENCE ?? "500", 10);
        const refund = await createRefund({
          paymentId: booking.squarePaymentId,
          amountPence: DEPOSIT_AMOUNT_PENCE,
          reason: `Booking ${"147-" + id.toString().padStart(5, "0")} completed \u2014 deposit returned`,
          idempotencyKey: `deposit-refund-${id}-${Date.now()}`
        });
        depositRefunded = true;
        refundId = refund.id;
        console.log(`[COMPLETE] Deposit refund ${refund.id} issued for booking #${id}`);
      } catch (refErr) {
        const msg = refErr instanceof Error ? refErr.message : String(refErr);
        refundError = msg;
        console.error(`[COMPLETE] Deposit refund FAILED for booking #${id}:`, msg);
      }
    }
    await storage.updateBooking(id, {
      status: "completed",
      ...depositRefunded ? { depositRefunded: true } : {}
    });
    res.json({ message: "Booking marked as completed", depositRefunded, refundId, refundError });
  });
  app2.patch("/api/bookings/:id/noshow", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const booking = await storage.getBooking(id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    await storage.updateBooking(id, { status: "no_show" });
    console.log(`[NO-SHOW] Booking #${id} marked as no-show \u2014 deposit retained`);
    res.json({ message: "Booking marked as no-show" });
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
    if (tableNumber != null) updateData.tableNumber = tableNumber;
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
      if (eventType === "weekly") {
        const weeklyEvents = await storage.getActiveEvents("weekly");
        return res.json(weeklyEvents);
      }
      if (!eventType || eventType === "event") {
        const tsEvents = await fetchTicketSourceEvents();
        if (tsEvents.length > 0) {
          const mapped = tsEvents.map(mapTsEvent);
          mapped.sort((a, b) => {
            if (!a.date) return 1;
            if (!b.date) return -1;
            return a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "");
          });
          return res.json(mapped);
        }
        const dbEvents = await storage.getActiveEvents(eventType);
        return res.json(dbEvents);
      }
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
        const linkType = req.body.linkType?.trim() || null;
        const linkValue = req.body.linkValue?.trim() || null;
        const image2 = await storage.createBannerImage({
          imageUrl,
          title: req.body.title?.trim() || null,
          sortOrder: isNaN(sortOrder) ? 0 : sortOrder,
          active,
          linkType,
          linkValue
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
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
    const rl = checkRateLimit(`contact:${ip}`, 5, 15 * 60 * 1e3);
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
<p><strong>Name:</strong> ${escHtml(parsed.data.name)}</p>
<p><strong>Email:</strong> ${escHtml(parsed.data.email)}</p>
<p><strong>Phone:</strong> ${escHtml(parsed.data.phone || "Not provided")}</p>
<p><strong>Subject:</strong> ${escHtml(parsed.data.subject)}</p>
<p><strong>Message:</strong></p>
<p>${escHtml(parsed.data.message).replace(/\n/g, "<br>")}</p>
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
  app2.post("/api/loyalty/phone-auth", async (req, res) => {
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
    const rl = checkRateLimit(`phone-auth:${ip}`, 10, 15 * 60 * 1e3);
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({ message: "Too many requests. Please wait before trying again." });
    }
    if (!isConfigured()) {
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
      const sessionToken = randomBytes2(32).toString("hex");
      loyaltySessions.set(sessionToken, { phone: phoneCleaned, expiresAt: Date.now() + LOYALTY_SESSION_EXPIRY });
      const account = await searchLoyaltyAccount(phoneCleaned);
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
          phone: account.mapping?.phone_number
        }
      });
    } catch (err) {
      console.error("Square loyalty phone-auth error:", err.message);
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });
  app2.post("/api/loyalty/send-code", async (req, res) => {
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
    const rl = checkRateLimit(`otp:${ip}`, 10, 15 * 60 * 1e3);
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return res.status(429).json({ message: "Too many requests. Please wait before trying again." });
    }
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
  app2.get("/api/loyalty/history", async (req, res) => {
    if (!isConfigured()) return res.status(503).json({ message: "Not configured" });
    const sessionToken = req.headers["x-loyalty-session"];
    const sessionPhone = sessionToken ? validateLoyaltySession(sessionToken) : null;
    if (!sessionPhone) return res.status(401).json({ message: "Unauthorised" });
    try {
      const account = await searchLoyaltyAccount(sessionPhone);
      if (!account) return res.json({ events: [], rewards: [] });
      const [events2, rewards] = await Promise.all([
        searchLoyaltyEvents(account.id, 15),
        searchIssuedRewards(account.id)
      ]);
      res.json({ events: events2, rewards });
    } catch (err) {
      console.error("Square loyalty history error:", err.message);
      res.status(500).json({ message: err.message });
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
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
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
  const membershipPageHeaders = (res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  };
  const serveMembershipPage = (_req, res) => {
    const pagePath = path.resolve(process.cwd(), "server", "templates", "membership-page.html");
    membershipPageHeaders(res);
    try {
      const html = fs.readFileSync(pagePath, "utf-8");
      res.send(html);
    } catch {
      res.status(500).send("Page unavailable");
    }
  };
  app2.get("/membership", serveMembershipPage);
  app2.get("/widget/membership", serveMembershipPage);
  app2.post("/api/membership/interest", async (req, res) => {
    const { name, email, phone, plan, planName } = req.body ?? {};
    if (!name || !email) return res.status(400).json({ message: "Name and email are required" });
    try {
      await storage.createContactMessage({
        name: String(name),
        email: String(email),
        phone: phone ? String(phone) : void 0,
        subject: `Membership Interest \u2014 ${planName || plan || "General"}`,
        message: `This person registered interest in the ${planName || plan || ""} membership plan via the membership landing page.${phone ? `

Phone: ${phone}` : ""}`,
        gdprConsent: true
      });
    } catch {
    }
    res.json({ ok: true });
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
  app2.get("/api/membership/plans", async (_req, res) => {
    const plans = await storage.getMembershipPlans(true);
    res.set("Cache-Control", "no-store");
    res.json(plans);
  });
  app2.get("/api/membership/my-subscription", customerAuth, async (req, res) => {
    const customerId = req.customerId;
    const sub = await storage.getMembershipSubscriptionByCustomer(customerId);
    res.json(sub ?? null);
  });
  app2.post("/api/membership/join", customerAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      const { planId } = req.body ?? {};
      if (!planId) return res.status(400).json({ message: "planId is required" });
      const existing = await storage.getMembershipSubscriptionByCustomer(customerId);
      if (existing && existing.planId === parseInt(planId) && existing.status === "active") {
        return res.status(409).json({ message: "You already have an active membership on this plan" });
      }
      const plan = await storage.getMembershipPlan(parseInt(planId));
      if (!plan || !plan.active) return res.status(404).json({ message: "Plan not found" });
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const nextMonth = /* @__PURE__ */ new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      if (existing && existing.id) {
        await storage.updateMembershipSubscription(existing.id, {
          status: "cancelled",
          cancelledAt: /* @__PURE__ */ new Date()
        });
      }
      const sub = await storage.createMembershipSubscription({
        customerId,
        planId: plan.id,
        status: "pending",
        currentPeriodStart: today,
        currentPeriodEnd: nextMonth.toISOString().slice(0, 10),
        hoursUsedThisPeriod: 0,
        guestPassesUsed: 0,
        staffNotes: null,
        source: "app"
      });
      let checkoutUrl = null;
      if (isConfigured()) {
        try {
          const customer = await storage.getCustomerById(customerId);
          if (customer) {
            let sqCustomer = await findSquareCustomerByEmail(customer.email).catch(() => null);
            if (!sqCustomer) {
              sqCustomer = await createSquareCustomer(customer.name, customer.email, customer.phone || void 0).catch(() => null);
            }
            if (sqCustomer) {
              await storage.updateMembershipSubscription(sub.id, { squareCustomerId: sqCustomer.id });
              const allPlans = await storage.getMembershipPlans();
              const allGroupNames = allPlans.map((p) => membershipGroupName(p.name));
              const currentGroupIds = await getCustomerGroupIds(sqCustomer.id).catch(() => []);
              const allGroups = await listCustomerGroups().catch(() => []);
              for (const group of allGroups) {
                if (allGroupNames.includes(group.name) && currentGroupIds.includes(group.id)) {
                  await removeCustomerFromGroup(sqCustomer.id, group.id).catch(() => {
                  });
                }
              }
              const newGroupId = await getOrCreateCustomerGroup(membershipGroupName(plan.name)).catch(() => null);
              if (newGroupId) {
                await addCustomerToGroup(sqCustomer.id, newGroupId).catch(() => {
                });
              }
              const redirectUrl = `https://the147bradford.replit.app/api/membership/${sub.id}/payment-return`;
              const checkout = await createMembershipCheckoutLink({
                planName: plan.name,
                amountPence: plan.priceMonthly,
                subscriptionId: sub.id,
                redirectUrl
              }).catch((err) => {
                console.error("[membership/join] checkout link error:", err?.message ?? err);
                return null;
              });
              if (checkout) {
                checkoutUrl = checkout.url;
              }
            }
          }
        } catch (sqErr) {
          console.error("[membership/join] Square error (non-fatal):", sqErr);
        }
      }
      if (!checkoutUrl && !isConfigured()) {
        await storage.updateMembershipSubscription(sub.id, { status: "active" });
      }
      const updated = await storage.getMembershipSubscriptionByCustomer(customerId);
      res.status(201).json({ ...updated ?? sub, checkoutUrl });
    } catch (err) {
      console.error("[membership/join]", err);
      res.status(500).json({ message: "Failed to create membership" });
    }
  });
  app2.get("/api/membership/:id/payment-return", async (req, res) => {
    const subId = parseInt(req.params.id);
    if (!isNaN(subId)) {
      const sub = await storage.getMembershipSubscription(subId).catch(() => null);
      if (sub && sub.status === "pending") {
        await storage.updateMembershipSubscription(subId, { status: "active" }).catch(() => {
        });
        console.log(`[MEMBERSHIP] Subscription #${subId} activated via payment return redirect`);
      }
    }
    res.redirect("https://the147bradford.replit.app/membership?payment=complete");
  });
  app2.post("/api/membership/retry-payment", customerAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      const sub = await storage.getMembershipSubscriptionByCustomer(customerId);
      if (!sub) return res.status(404).json({ message: "No membership found" });
      if (!["pending", "frozen"].includes(sub.status)) {
        return res.status(400).json({ message: "Membership does not require payment" });
      }
      if (!isConfigured()) {
        return res.status(503).json({ message: "Payment system not configured" });
      }
      const plan = sub.plan ?? await storage.getMembershipPlan(sub.planId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      const redirectUrl = `https://the147bradford.replit.app/api/membership/${sub.id}/payment-return`;
      const checkout = await createMembershipCheckoutLink({
        planName: plan.name,
        amountPence: plan.priceMonthly,
        subscriptionId: sub.id,
        redirectUrl
      });
      res.json({ checkoutUrl: checkout.url });
    } catch (err) {
      console.error("[membership/retry-payment]", err);
      res.status(500).json({ message: "Failed to generate payment link" });
    }
  });
  const captureRawBody = (req, res, next) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
    });
    req.on("end", () => {
      req._rawBody = raw;
      next();
    });
    req.on("error", next);
  };
  app2.post("/api/membership/webhook", captureRawBody, async (req, res) => {
    try {
      const bodyStr = req._rawBody || JSON.stringify(req.body);
      const sigKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
      if (sigKey) {
        const sig = req.headers["x-square-hmacsha256-signature"];
        if (!sig) return res.status(401).send("Missing signature");
        const notificationUrl = `https://${req.headers.host}${req.originalUrl}`;
        const { createHmac, timingSafeEqual: timingSafeEqual2 } = await import("node:crypto");
        const expected = createHmac("sha256", sigKey).update(notificationUrl + bodyStr).digest("base64");
        const sigBuf = Buffer.from(sig, "base64");
        const expBuf = Buffer.from(expected, "base64");
        if (sigBuf.length !== expBuf.length || !timingSafeEqual2(sigBuf, expBuf)) {
          console.warn("[Square webhook] Invalid signature \u2014 rejected");
          return res.status(401).send("Invalid signature");
        }
      }
      const event = JSON.parse(bodyStr);
      const type = event?.type ?? "";
      if (type === "subscription.updated" || type === "subscription.activated") {
        const sqSub = event?.data?.object?.subscription;
        if (sqSub?.id) {
          const existingSubs = await storage.getMembershipSubscriptions();
          const local = existingSubs.find((s) => s.squareSubscriptionId === sqSub.id);
          if (local) {
            const status = sqSub.status === "ACTIVE" ? "active" : sqSub.status === "PAUSED" ? "paused" : sqSub.status === "CANCELED" ? "cancelled" : sqSub.status === "PENDING" ? "pending" : "active";
            await storage.updateMembershipSubscription(local.id, {
              status,
              currentPeriodStart: sqSub.start_date ?? local.currentPeriodStart ?? void 0,
              currentPeriodEnd: sqSub.charged_through_date ?? local.currentPeriodEnd ?? void 0
            });
            console.log(`[MEMBERSHIP WEBHOOK] Synced local #${local.id} \u2192 ${status}`);
          }
        }
      }
      if (type === "invoice.payment_failed") {
        const invoice = event?.data?.object?.invoice;
        const sqSubId = invoice?.subscription_id;
        if (sqSubId) {
          const existingSubs = await storage.getMembershipSubscriptions();
          const local = existingSubs.find((s) => s.squareSubscriptionId === sqSubId);
          if (local) {
            const newAttempts = (local.failedPaymentAttempts ?? 0) + 1;
            const shouldFreeze = newAttempts >= 3;
            await storage.updateMembershipSubscription(local.id, {
              failedPaymentAttempts: newAttempts,
              ...shouldFreeze ? { status: "frozen" } : {}
            });
            console.log(`[MEMBERSHIP WEBHOOK] Renewal failed for #${local.id} (attempt ${newAttempts})`);
            const customer = await storage.getCustomerById(local.customerId).catch(() => null);
            if (customer?.email) {
              const tokens = await storage.getPushTokensByEmail(customer.email).catch(() => []);
              if (tokens.length > 0) {
                const title = shouldFreeze ? "Membership Suspended" : newAttempts === 2 ? "Renewal Failed Again" : "Renewal Payment Failed";
                const body = shouldFreeze ? "Your membership has been suspended after 3 failed renewal payments. Please update your payment details." : newAttempts === 2 ? `Renewal failed (${newAttempts}/3). One more failure will suspend your membership.` : "Your monthly membership renewal payment failed. Please ensure your card is up to date.";
                await sendTargetedPush(tokens.map((t) => t.token), title, body).catch(() => {
                });
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
  app2.get("/api/staff/membership/stats", staffAuth, async (_req, res) => {
    const stats = await storage.getMembershipStats();
    res.json(stats);
  });
  app2.get("/api/staff/membership/plans", staffAuth, async (_req, res) => {
    const plans = await storage.getMembershipPlans();
    res.json(plans);
  });
  app2.put("/api/staff/membership/plans/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const plan = await storage.updateMembershipPlan(id, req.body);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json(plan);
  });
  app2.post("/api/staff/membership/plans/seed", staffAuth, managerAuth, async (_req, res) => {
    const defaults = [
      { name: "Rack", tier: "rack", priceMonthly: 1999, hoursIncluded: 4, hoursUnit: "month", foodDrinkDiscount: 5, priorityBooking: false, loyaltyMultiplier: 1, guestPassesMonthly: 0, color: "#0047AB", sortOrder: 0, description: "4 hrs snooker per month, 5% food & drink discount", active: false },
      { name: "Century", tier: "century", priceMonthly: 3499, hoursIncluded: 8, hoursUnit: "month", foodDrinkDiscount: 10, priorityBooking: true, loyaltyMultiplier: 1, guestPassesMonthly: 0, color: "#D4A843", sortOrder: 1, description: "8 hrs snooker per month, 10% food & drink, priority booking", active: false },
      { name: "Maximum", tier: "maximum", priceMonthly: 5499, hoursIncluded: null, hoursUnit: "month", foodDrinkDiscount: 15, priorityBooking: true, loyaltyMultiplier: 2, guestPassesMonthly: 1, color: "#10B981", sortOrder: 2, description: "Unlimited snooker, 15% food & drink, 2\xD7 loyalty points, 1 guest pass/month", active: true }
    ];
    const created = await Promise.all(defaults.map((d) => storage.upsertMembershipPlan(d)));
    res.json(created);
  });
  app2.get("/api/staff/membership/subscriptions", staffAuth, async (_req, res) => {
    const subs = await storage.getMembershipSubscriptions();
    res.json(subs);
  });
  app2.post("/api/staff/membership/subscriptions", staffAuth, async (req, res) => {
    const { customerId, planId, status = "active", staffNotes, source = "staff" } = req.body ?? {};
    if (!customerId || !planId) return res.status(400).json({ message: "customerId and planId are required" });
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const nextMonth = /* @__PURE__ */ new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const sub = await storage.createMembershipSubscription({
      customerId: parseInt(customerId),
      planId: parseInt(planId),
      status,
      currentPeriodStart: today,
      currentPeriodEnd: nextMonth.toISOString().slice(0, 10),
      hoursUsedThisPeriod: 0,
      guestPassesUsed: 0,
      staffNotes: staffNotes || null,
      source
    });
    if (isConfigured()) {
      try {
        const plan = await storage.getMembershipPlan(parseInt(planId));
        const customer = await storage.getCustomerById(parseInt(customerId));
        if (plan?.squarePlanVariationId && customer) {
          let sqCustomer = await findSquareCustomerByEmail(customer.email).catch(() => null);
          if (!sqCustomer) sqCustomer = await createSquareCustomer(customer.name, customer.email, customer.phone || void 0);
          if (sqCustomer) {
            const locationId = process.env.SQUARE_LOCATION_ID;
            const sqSub = await createSquareSubscription(sqCustomer.id, plan.squarePlanVariationId, locationId).catch(() => null);
            if (sqSub) {
              await storage.updateMembershipSubscription(sub.id, {
                squareSubscriptionId: sqSub.id,
                squareCustomerId: sqCustomer.id,
                currentPeriodEnd: sqSub.charged_through_date ?? sub.currentPeriodEnd
              });
            }
          }
        }
      } catch {
      }
    }
    res.status(201).json(sub);
  });
  app2.post("/api/staff/membership/payment-link", staffAuth, async (req, res) => {
    const { subscriptionId, planId } = req.body ?? {};
    if (!subscriptionId || !planId) return res.status(400).json({ message: "subscriptionId and planId required" });
    if (!isConfigured()) return res.status(503).json({ message: "Square is not configured" });
    try {
      const plan = await storage.getMembershipPlan(parseInt(planId));
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      const redirectUrl = `${process.env.REPLIT_INTERNAL_APP_DOMAIN ? `https://${process.env.REPLIT_INTERNAL_APP_DOMAIN}` : "https://the147bradford.replit.app"}/staff`;
      const link = await createMembershipCheckoutLink({
        planName: plan.name,
        amountPence: plan.priceMonthly,
        subscriptionId: parseInt(subscriptionId),
        redirectUrl
      });
      res.json({ url: link.url, paymentLinkId: link.paymentLinkId });
    } catch (err) {
      console.error("[PAYMENT LINK]", err?.message);
      res.status(500).json({ message: err?.message || "Failed to create payment link" });
    }
  });
  app2.patch("/api/staff/membership/subscriptions/:id", staffAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const sub = await storage.getMembershipSubscription(id);
    if (!sub) return res.status(404).json({ message: "Subscription not found" });
    const { status, staffNotes, planId, hoursUsedThisPeriod, guestPassesUsed, currentPeriodStart, currentPeriodEnd } = req.body ?? {};
    const updates = {};
    if (staffNotes !== void 0) updates.staffNotes = staffNotes;
    if (planId !== void 0) updates.planId = parseInt(planId);
    if (hoursUsedThisPeriod !== void 0) updates.hoursUsedThisPeriod = parseInt(hoursUsedThisPeriod);
    if (guestPassesUsed !== void 0) updates.guestPassesUsed = parseInt(guestPassesUsed);
    if (currentPeriodStart !== void 0) updates.currentPeriodStart = currentPeriodStart || null;
    if (currentPeriodEnd !== void 0) updates.currentPeriodEnd = currentPeriodEnd || null;
    if (status !== void 0) {
      updates.status = status;
      if (status === "cancelled") updates.cancelledAt = /* @__PURE__ */ new Date();
      if (sub.squareSubscriptionId && isConfigured()) {
        try {
          if (status === "cancelled") await cancelSquareSubscription(sub.squareSubscriptionId);
          else if (status === "paused") await pauseSquareSubscription(sub.squareSubscriptionId);
          else if (status === "active" && sub.status === "paused") await resumeSquareSubscription(sub.squareSubscriptionId);
        } catch {
        }
      }
    }
    const updated = await storage.updateMembershipSubscription(id, updates);
    res.json(updated);
  });
  app2.get("/delete-account", (_req, res) => {
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
  app2.post("/api/request-deletion", async (req, res) => {
    const { email } = req.body ?? {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ message: "A valid email address is required." });
    }
    const normalised = email.trim().toLowerCase();
    await storage.deleteBookingsByEmail(normalised);
    const customer = await storage.getCustomerByEmail(normalised);
    if (customer) await storage.deleteCustomer(customer.id);
    res.json({ success: true, message: "If an account existed for that email, all data has been permanently deleted." });
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
import * as fs2 from "fs";
import * as path2 from "path";
import nodemailer2 from "nodemailer";
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
  app2.disable("x-powered-by");
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
async function bootstrapOwner() {
  try {
    const { storage: store } = await Promise.resolve().then(() => (init_storage(), storage_exports));
    const allUsers = await store.getAllStaffUsers();
    const hasOwner = allUsers.some((u) => u.role === "owner");
    if (!hasOwner) {
      const targets = ["seanclowe", "seanlowe"];
      for (const username of targets) {
        const user = allUsers.find((u) => u.username === username);
        if (user) {
          await store.updateStaffRole(username, "owner");
          log(`[Bootstrap] Promoted '${username}' to owner (no owner account existed)`);
        }
      }
    }
  } catch (err) {
    console.error("[Bootstrap] Owner bootstrap error:", err);
  }
}
function scheduleDepositAutoCancel() {
  async function runAutoCancel() {
    try {
      const { storage: store } = await Promise.resolve().then(() => (init_storage(), storage_exports));
      const expired = await store.getExpiredPendingDeposits(60);
      if (!expired.length) return;
      for (const booking of expired) {
        try {
          await store.updateBookingStatus(booking.id, "cancelled");
          log(`[DepositAutoCancel] Cancelled booking #${booking.id} \u2014 deposit not received within 1 hour`);
          const smtpHost = process.env.SMTP_HOST;
          const smtpUser = process.env.SMTP_USER;
          const smtpPass = process.env.SMTP_PASS?.replace(/\s+/g, "");
          const smtpPort = parseInt(process.env.SMTP_PORT || "587");
          if (smtpHost && smtpUser && smtpPass && booking.customerEmail) {
            try {
              const transporter = nodemailer2.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: smtpPort === 465,
                auth: { user: smtpUser, pass: smtpPass },
                tls: { rejectUnauthorized: false }
              });
              const dateFormatted = (/* @__PURE__ */ new Date(booking.date + "T12:00:00")).toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric"
              });
              const ref = "#" + String(booking.id).padStart(4, "0");
              await transporter.sendMail({
                from: `"The 147" <${smtpUser}>`,
                to: booking.customerEmail,
                subject: `Booking ${ref} Cancelled \u2014 Deposit Not Received`,
                html: `
                  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
                    <div style="background:#111827;padding:24px 32px;border-radius:8px 8px 0 0">
                      <h1 style="color:#fff;margin:0;font-size:22px">The 147 Bradford</h1>
                    </div>
                    <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
                      <h2 style="margin:0 0 16px;color:#DC2626">Booking Cancelled</h2>
                      <p style="margin:0 0 12px">Hi ${booking.customerName},</p>
                      <p style="margin:0 0 12px">Unfortunately your dining booking <strong>${ref}</strong> for <strong>${dateFormatted}</strong> at <strong>${booking.startTime}</strong> has been automatically cancelled because the \xA35.00 deposit was not received within 1 hour of booking.</p>
                      <p style="margin:0 0 24px">If you'd still like to dine with us, please visit our website to make a new reservation.</p>
                      <p style="margin:0;color:#6b7280;font-size:13px">The 147 Bradford &bull; Snooker &amp; Dining</p>
                    </div>
                  </div>`
              });
              log(`[DepositAutoCancel] Cancellation email sent to ${booking.customerEmail} for booking #${booking.id}`);
            } catch (emailErr) {
              console.error(`[DepositAutoCancel] Email failed for booking #${booking.id}:`, emailErr);
            }
          }
        } catch (err) {
          console.error(`[DepositAutoCancel] Failed for booking #${booking.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[DepositAutoCancel] Scheduler error:", err);
    }
  }
  setInterval(runAutoCancel, 30 * 60 * 1e3);
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
  await bootstrapOwner();
  scheduleRetentionCleanup();
  scheduleBookingReminders();
  scheduleDepositAutoCancel();
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
