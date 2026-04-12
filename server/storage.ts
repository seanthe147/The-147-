import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, lt, lte, sql, and, gt, isNull, isNotNull, gte, desc, inArray, ne } from "drizzle-orm";
import {
  type User,
  type InsertUser,
  type Offer,
  type InsertOffer,
  type PushToken,
  type InsertPushToken,
  type Notification,
  type Booking,
  type InsertBooking,
  type StaffSession,
  type StaffUser,
  type ContactMessage,
  type InsertContactMessage,
  type Event,
  type InsertEvent,
  type BannerImage,
  type InsertBannerImage,
  type Customer,
  type CustomerSession,
  type StaffNotice,
  type StaffPopup,
  type BlockedPeriod,
  type InsertBlockedPeriod,
  type MembershipPlan,
  type InsertMembershipPlan,
  type MembershipSubscription,
  type InsertMembershipSubscription,
  type MenuCategoryVisibility,
  type MenuItemOverride,
  type CategorySetting,
  type AvailabilityRule,
  users,
  offers,
  pushTokens,
  notifications,
  bookings,
  staffSessions,
  staffUsers,
  contactMessages,
  events,
  siteSettings,
  bannerImages,
  customers,
  customerSessions,
  staffNotices,
  staffPopups,
  blockedPeriods,
  membershipPlans,
  membershipSubscriptions,
  menuCategoryVisibility,
  menuItemOverrides,
  categorySettings,
  availabilityRules,
  appOrders,
  type AppOrder,
  orderAuditLog,
  type OrderAuditEntry,
} from "@shared/schema";
import { encrypt, decrypt, hashEmail } from "./encryption";

function buildPoolConfig() {
  const rawUrl = process.env.DATABASE_URL!;
  const url = new URL(rawUrl);
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");
  if (sslmode === "disable" || sslmode === null) {
    return { connectionString: url.toString() };
  }
  // Verify TLS certificates unless explicitly opted out via env var.
  // Set DATABASE_SSL_NO_VERIFY=true only for local dev with self-signed certs.
  const skipVerify = process.env.DATABASE_SSL_NO_VERIFY === "true";
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: !skipVerify },
  };
}

const pool = new Pool(buildPoolConfig());

// Prevent idle connection errors from crashing the process
pool.on("error", (err) => {
  console.error("[DB] Unexpected pool error (non-fatal):", err.message);
});

const db = drizzle(pool);

// ── Startup migrations — safe, idempotent schema updates ──────────────────────
export async function runStartupMigrations() {
  const client = await pool.connect();
  try {
    // Add columns introduced after initial deployment
    await client.query(`
      ALTER TABLE offers
        ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
    `);

    await client.query(`
      ALTER TABLE membership_plans
        ADD COLUMN IF NOT EXISTS price_annual INTEGER,
        ADD COLUMN IF NOT EXISTS square_plan_variation_id_alt TEXT,
        ADD COLUMN IF NOT EXISTS square_customer_group_id TEXT,
        ADD COLUMN IF NOT EXISTS exclude_with_deals BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // Ensure VIP plan exists (10% food & drink, group-based, excludes stacking with deals)
    await client.query(`
      INSERT INTO membership_plans
        (name, tier, price_monthly, hours_included, hours_unit, food_drink_discount,
         priority_booking, loyalty_multiplier, guest_passes_monthly,
         square_plan_variation_id, square_customer_group_id, exclude_with_deals,
         active, sort_order, color, description)
      VALUES
        ('VIP', 'vip', 0, NULL, 'month', 10,
         FALSE, 1, 0,
         NULL, NULL, TRUE,
         TRUE, 3, '#7C3AED',
         '10% off food & drink (excluding snooker bookings and active offers)')
      ON CONFLICT (tier) DO NOTHING;
    `);

    console.log("[DB] Startup migrations applied");
  } catch (err: any) {
    console.error("[DB] Startup migration failed (non-fatal):", err.message);
  } finally {
    client.release();
  }
}

function encryptBookingFields(booking: InsertBooking): InsertBooking & { emailHash?: string } {
  return {
    ...booking,
    customerName: encrypt(booking.customerName),
    customerEmail: encrypt(booking.customerEmail),
    customerPhone: encrypt(booking.customerPhone),
    emailHash: hashEmail(booking.customerEmail),
  };
}

function decryptBookingFields(booking: Booking): Booking {
  return {
    ...booking,
    customerName: decrypt(booking.customerName),
    customerEmail: decrypt(booking.customerEmail),
    customerPhone: decrypt(booking.customerPhone),
  };
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getOffers(): Promise<Offer[]>;
  getAllOffers(): Promise<Offer[]>;
  getOffer(id: number): Promise<Offer | undefined>;
  createOffer(offer: InsertOffer): Promise<Offer>;
  updateOffer(id: number, offer: Partial<InsertOffer>): Promise<Offer | undefined>;
  deleteOffer(id: number): Promise<boolean>;
  registerPushToken(token: InsertPushToken): Promise<PushToken>;
  getAllPushTokens(): Promise<PushToken[]>;
  removePushToken(token: string): Promise<boolean>;
  getPushTokensByEmail(email: string): Promise<PushToken[]>;
  saveNotification(title: string, body: string, recipientCount: number): Promise<Notification>;
  getNotificationHistory(): Promise<Notification[]>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  getBookings(): Promise<Booking[]>;
  getBookingsByDate(date: string): Promise<Booking[]>;
  getBooking(id: number): Promise<Booking | undefined>;
  updateBookingStatus(id: number, status: string): Promise<Booking | undefined>;
  updateBooking(id: number, data: Partial<InsertBooking>): Promise<Booking | undefined>;
  deleteBooking(id: number): Promise<boolean>;
  getBookedSlots(date: string, tableType: string, tableNumber?: string, excludeBookingId?: number): Promise<Array<{ startTime: string; duration: number }>>;
  getBookingsDueReminder(windowStartMins: number, windowEndMins: number): Promise<Booking[]>;
  markReminderSent(id: number): Promise<void>;
  getExpiredPendingDeposits(olderThanMinutes: number): Promise<Booking[]>;
  createStaffSession(token: string, expiresAt: Date, staffUserId?: number, staffUsername?: string): Promise<StaffSession>;
  validateStaffSession(token: string): Promise<StaffSession | undefined>;
  invalidateStaffSession(token: string): Promise<boolean>;
  getBookingsByEmail(email: string): Promise<Booking[]>;
  deleteBookingsByEmail(email: string): Promise<number>;
  anonymizeOldBookings(retentionDays: number): Promise<number>;
  cleanupExpiredSessions(): Promise<number>;
  createStaffUser(username: string, pinHash: string, pinSalt: string, displayName?: string, role?: string, approvalStatus?: string): Promise<StaffUser>;
  updateStaffApproval(id: number, approvalStatus: string): Promise<StaffUser | undefined>;
  getStaffUserByUsername(username: string): Promise<StaffUser | undefined>;
  getAllStaffUsers(): Promise<StaffUser[]>;
  updateStaffPin(username: string, pinHash: string, pinSalt: string): Promise<StaffUser | undefined>;
  migrateEncryptExistingBookings(): Promise<number>;
  searchCustomers(query: string, limit?: number): Promise<Array<{ id?: number; name: string; phone: string; email: string }>>;
  createCustomer(email: string, name: string, phone: string | null, passwordHash: string): Promise<Customer>;
  getCustomerByEmail(email: string): Promise<Customer | undefined>;
  getCustomerById(id: number): Promise<Customer | undefined>;
  getAllCustomers(): Promise<Customer[]>;
  updateCustomer(id: number, data: Partial<{ name: string; phone: string }>): Promise<Customer | undefined>;
  deleteCustomer(id: number): Promise<boolean>;
  createCustomerSession(token: string, customerId: number, expiresAt: Date): Promise<CustomerSession>;
  validateCustomerSession(token: string): Promise<CustomerSession | undefined>;
  invalidateCustomerSession(token: string): Promise<boolean>;
  getBlockedPeriods(): Promise<BlockedPeriod[]>;
  createBlockedPeriod(data: InsertBlockedPeriod): Promise<BlockedPeriod>;
  deleteBlockedPeriod(id: number): Promise<boolean>;
  getCategorySettings(): Promise<CategorySetting[]>;
  upsertCategorySettings(settings: { categoryId: string; displayOrder?: number; mergedIntoId?: string | null; displayName?: string | null; updatedBy: string }[]): Promise<void>;
  getAvailabilityRules(): Promise<AvailabilityRule[]>;
  createAvailabilityRule(rule: Omit<AvailabilityRule, 'id' | 'updatedAt'>): Promise<AvailabilityRule>;
  updateAvailabilityRule(id: number, rule: Partial<Omit<AvailabilityRule, 'id' | 'updatedAt'>>): Promise<AvailabilityRule | undefined>;
  deleteAvailabilityRule(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getOffers(): Promise<Offer[]> {
    return db.select().from(offers).where(eq(offers.active, true));
  }

  async getAllOffers(): Promise<Offer[]> {
    return db.select().from(offers).orderBy(offers.id);
  }

  async getOffer(id: number): Promise<Offer | undefined> {
    const [offer] = await db.select().from(offers).where(eq(offers.id, id));
    return offer;
  }

  async createOffer(offer: InsertOffer): Promise<Offer> {
    const [created] = await db.insert(offers).values(offer).returning();
    return created;
  }

  async updateOffer(id: number, data: Partial<InsertOffer>): Promise<Offer | undefined> {
    const [updated] = await db.update(offers).set(data).where(eq(offers.id, id)).returning();
    return updated;
  }

  async deleteOffer(id: number): Promise<boolean> {
    const result = await db.delete(offers).where(eq(offers.id, id)).returning();
    return result.length > 0;
  }

  async registerPushToken(data: InsertPushToken): Promise<PushToken> {
    const [existing] = await db.select().from(pushTokens).where(eq(pushTokens.token, data.token));
    if (existing) {
      // Update email if newly provided
      if (data.customerEmail && existing.customerEmail !== data.customerEmail) {
        const [updated] = await db.update(pushTokens).set({ customerEmail: data.customerEmail }).where(eq(pushTokens.token, data.token)).returning();
        return updated;
      }
      return existing;
    }
    const [created] = await db.insert(pushTokens).values(data).returning();
    return created;
  }

  async getAllPushTokens(): Promise<PushToken[]> {
    return db.select().from(pushTokens);
  }

  async removePushToken(token: string): Promise<boolean> {
    const result = await db.delete(pushTokens).where(eq(pushTokens.token, token)).returning();
    return result.length > 0;
  }

  async getPushTokensByEmail(email: string): Promise<PushToken[]> {
    return db.select().from(pushTokens).where(sql`lower(${pushTokens.customerEmail}) = lower(${email})`);
  }

  async saveNotification(title: string, body: string, recipientCount: number, sentBy?: string): Promise<Notification> {
    const [created] = await db.insert(notifications).values({ title, body, recipientCount, sentBy }).returning();
    return created;
  }

  async getNotificationHistory(): Promise<Notification[]> {
    return db.select().from(notifications).orderBy(notifications.sentAt);
  }

  async createBooking(booking: InsertBooking): Promise<Booking> {
    const encrypted = encryptBookingFields(booking);
    const [created] = await db.insert(bookings).values(encrypted).returning();
    return decryptBookingFields(created);
  }

  async getBookings(): Promise<Booking[]> {
    const results = await db.select().from(bookings).orderBy(bookings.date, bookings.startTime);
    return results.map(decryptBookingFields);
  }

  async getBookingsByDate(date: string): Promise<Booking[]> {
    const results = await db.select().from(bookings).where(eq(bookings.date, date)).orderBy(bookings.startTime);
    return results.map(decryptBookingFields);
  }

  async getBooking(id: number): Promise<Booking | undefined> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    return booking ? decryptBookingFields(booking) : undefined;
  }

  async updateBookingStatus(id: number, status: string): Promise<Booking | undefined> {
    const [updated] = await db.update(bookings).set({ status }).where(eq(bookings.id, id)).returning();
    return updated ? decryptBookingFields(updated) : undefined;
  }

  async updateBooking(id: number, data: Partial<InsertBooking>): Promise<Booking | undefined> {
    const encData: any = { ...data };
    if (data.customerName) encData.customerName = encrypt(data.customerName);
    if (data.customerEmail) {
      encData.customerEmail = encrypt(data.customerEmail);
      encData.emailHash = hashEmail(data.customerEmail);
    }
    if (data.customerPhone) encData.customerPhone = encrypt(data.customerPhone);
    const [updated] = await db.update(bookings).set(encData).where(eq(bookings.id, id)).returning();
    return updated ? decryptBookingFields(updated) : undefined;
  }

  async deleteBooking(id: number): Promise<boolean> {
    const result = await db.delete(bookings).where(eq(bookings.id, id)).returning();
    return result.length > 0;
  }

  async getBookedSlots(date: string, tableType: string, tableNumber?: string, excludeBookingId?: number): Promise<Array<{ startTime: string; duration: number }>> {
    const conditions = [
      eq(bookings.date, date),
      eq(bookings.tableType, tableType),
      eq(bookings.status, "confirmed"),
    ];
    if (tableNumber) {
      conditions.push(eq(bookings.tableNumber, tableNumber));
    }
    if (excludeBookingId) {
      conditions.push(ne(bookings.id, excludeBookingId));
    }
    const results = await db
      .select({ startTime: bookings.startTime, duration: bookings.duration })
      .from(bookings)
      .where(and(...conditions));
    return results;
  }

  async getBookingsDueReminder(windowStartMins: number, windowEndMins: number): Promise<Booking[]> {
    const now = new Date();
    // Use LOCAL date (not UTC) so reminders fire correctly for UK timezone (BST/GMT)
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const fmt = (d: Date) =>
      `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    const startStr = fmt(new Date(now.getTime() + windowStartMins * 60_000));
    const endStr   = fmt(new Date(now.getTime() + windowEndMins   * 60_000));
    const results = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.date, today),
          eq(bookings.status, "confirmed"),
          eq(bookings.reminderSent, false),
          gte(bookings.startTime, startStr),
          lte(bookings.startTime, endStr),
        ),
      );
    return results.map(decryptBookingFields);
  }

  async markReminderSent(id: number): Promise<void> {
    await db.update(bookings).set({ reminderSent: true }).where(eq(bookings.id, id));
  }

  async getExpiredPendingDeposits(olderThanMinutes: number): Promise<Booking[]> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const rows = await db.select().from(bookings).where(
      and(
        eq(bookings.status, "pending_deposit"),
        lt(bookings.createdAt, cutoff)
      )
    );
    return rows.map(decryptBookingFields);
  }

  async createStaffSession(token: string, expiresAt: Date, staffUserId?: number, staffUsername?: string): Promise<StaffSession> {
    const [session] = await db.insert(staffSessions).values({
      token,
      expiresAt,
      staffUserId: staffUserId ?? null,
      staffUsername: staffUsername ?? null,
    }).returning();
    return session;
  }

  async validateStaffSession(token: string): Promise<StaffSession | undefined> {
    const [session] = await db
      .select()
      .from(staffSessions)
      .where(
        and(
          eq(staffSessions.token, token),
          eq(staffSessions.active, true),
          gt(staffSessions.expiresAt, new Date())
        )
      );
    return session;
  }

  async invalidateStaffSession(token: string): Promise<boolean> {
    const result = await db
      .update(staffSessions)
      .set({ active: false })
      .where(eq(staffSessions.token, token))
      .returning();
    return result.length > 0;
  }

  async getBookingsByEmail(email: string): Promise<Booking[]> {
    const hash = hashEmail(email);
    const byHash = await db.select().from(bookings).where(eq(bookings.emailHash, hash)).orderBy(bookings.date);
    if (byHash.length > 0) {
      return byHash.map(decryptBookingFields);
    }
    const byPlain = await db.select().from(bookings).where(sql`lower(${bookings.customerEmail}) = lower(${email})`).orderBy(bookings.date);
    return byPlain.map(decryptBookingFields);
  }

  async deleteBookingsByEmail(email: string): Promise<number> {
    const hash = hashEmail(email);
    const byHash = await db.delete(bookings).where(eq(bookings.emailHash, hash)).returning();
    if (byHash.length > 0) return byHash.length;
    const byPlain = await db.delete(bookings).where(sql`lower(${bookings.customerEmail}) = lower(${email})`).returning();
    return byPlain.length;
  }

  async anonymizeOldBookings(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const cutoffStr = `${cutoffDate.getFullYear()}-${pad2(cutoffDate.getMonth() + 1)}-${pad2(cutoffDate.getDate())}`;

    // Build a set of emailHashes that are still "active":
    // 1. Any customer who has a booking on or after the cutoff date
    // 2. Any customer who has a registered account in the customers table
    const recentBookings = await db.select({ emailHash: bookings.emailHash })
      .from(bookings)
      .where(gte(bookings.date, cutoffStr));
    const activeHashes = new Set<string>(
      recentBookings.map(b => b.emailHash).filter(Boolean) as string[]
    );

    // Add hashes of all registered customer accounts — they are always active
    const allCustomers = await db.select({ email: customers.email }).from(customers);
    for (const c of allCustomers) {
      if (c.email) activeHashes.add(hashEmail(c.email));
    }

    // Anonymise old bookings only for customers with no recent activity and no account
    const oldBookings = await db.select().from(bookings).where(lt(bookings.date, cutoffStr));
    let count = 0;
    for (const booking of oldBookings) {
      const decryptedName = decrypt(booking.customerName);
      if (decryptedName === "ANONYMIZED") continue;
      // Skip if this customer is still active (recent booking or registered account)
      if (booking.emailHash && activeHashes.has(booking.emailHash)) continue;
      await db.update(bookings).set({
        customerName: "ANONYMIZED",
        customerEmail: "anonymized@removed.local",
        customerPhone: "000000",
        emailHash: null,
        notes: null,
      }).where(eq(bookings.id, booking.id));
      count++;
    }

    // Also anonymise contact messages older than the retention period
    // (no "still active" exemption here — messages are one-off enquiries)
    const contactCutoff = new Date();
    contactCutoff.setDate(contactCutoff.getDate() - retentionDays);
    const oldMessages = await db.select().from(contactMessages).where(lt(contactMessages.createdAt, contactCutoff));
    for (const msg of oldMessages) {
      if (msg.name !== "ANONYMIZED") {
        await db.update(contactMessages).set({
          name: "ANONYMIZED",
          email: "anonymized@removed.local",
          phone: null,
          message: "[Deleted after 90-day retention period]",
        }).where(eq(contactMessages.id, msg.id));
        count++;
      }
    }

    return count;
  }

  async cleanupExpiredSessions(): Promise<number> {
    const result = await db.delete(staffSessions).where(
      lte(staffSessions.expiresAt, new Date())
    ).returning();
    return result.length;
  }

  async createStaffUser(username: string, pinHash: string, pinSalt: string, displayName?: string, role?: string, approvalStatus?: string): Promise<StaffUser> {
    const [user] = await db.insert(staffUsers).values({
      username: username.toLowerCase().trim(),
      pinHash,
      pinSalt,
      displayName: displayName || null,
      role: role === "owner" ? "owner" : role === "manager" ? "manager" : "staff",
      approvalStatus: approvalStatus || "approved",
    }).returning();
    return user;
  }

  async updateStaffApproval(id: number, approvalStatus: string): Promise<StaffUser | undefined> {
    const [updated] = await db.update(staffUsers)
      .set({ approvalStatus })
      .where(eq(staffUsers.id, id))
      .returning();
    return updated;
  }

  async getStaffUserByUsername(username: string): Promise<StaffUser | undefined> {
    const [user] = await db.select().from(staffUsers).where(
      eq(staffUsers.username, username.toLowerCase().trim())
    );
    return user;
  }

  async getAllStaffUsers(): Promise<StaffUser[]> {
    return db.select().from(staffUsers).orderBy(staffUsers.createdAt);
  }

  async setStaffActive(id: number, active: boolean): Promise<StaffUser | undefined> {
    const [updated] = await db.update(staffUsers)
      .set({ active })
      .where(eq(staffUsers.id, id))
      .returning();
    return updated;
  }

  async deleteStaffUser(id: number): Promise<boolean> {
    const [deleted] = await db.delete(staffUsers).where(eq(staffUsers.id, id)).returning();
    return !!deleted;
  }

  async updateStaffRole(username: string, newRole: string): Promise<StaffUser | undefined> {
    const [updated] = await db.update(staffUsers)
      .set({ role: newRole })
      .where(eq(staffUsers.username, username.toLowerCase().trim()))
      .returning();
    return updated;
  }

  async updateStaffPin(username: string, pinHash: string, pinSalt: string): Promise<StaffUser | undefined> {
    const [updated] = await db.update(staffUsers)
      .set({ pinHash, pinSalt })
      .where(eq(staffUsers.username, username.toLowerCase().trim()))
      .returning();
    return updated;
  }

  async migrateEncryptExistingBookings(): Promise<number> {
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
        emailHash: eHash,
      }).where(eq(bookings.id, booking.id));
      migrated++;
    }
    return migrated;
  }

  async searchCustomers(query: string, limit = 6): Promise<Array<{ id?: number; name: string; phone: string; email: string }>> {
    if (!query || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    // Fetch all bookings (decrypted) and search in-memory (data is encrypted at rest)
    const allBookings = await db.select().from(bookings).orderBy(bookings.createdAt);
    const seen = new Set<string>();
    const matches: Array<{ name: string; phone: string; email: string; score: number }> = [];
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
          if (matches.length >= limit * 3) break; // collect enough to sort then trim
        }
      } catch { continue; }
    }
    matches.sort((a, b) => b.score - a.score);
    const top = matches.slice(0, limit);
    // Enrich with customer account IDs (customers table stores plain lowercase email)
    const enriched = await Promise.all(top.map(async ({ name, phone, email }) => {
      const customer = await this.getCustomerByEmail(email).catch(() => undefined);
      return { id: customer?.id, name, phone, email };
    }));
    return enriched;
  }

  async getEvents(): Promise<Event[]> {
    return db.select().from(events).orderBy(events.date);
  }

  async getActiveEvents(eventType?: string): Promise<Event[]> {
    if (eventType) {
      return db.select().from(events).where(and(eq(events.active, true), eq(events.eventType, eventType))).orderBy(events.date);
    }
    return db.select().from(events).where(eq(events.active, true)).orderBy(events.date);
  }

  async getEvent(id: number): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }

  async createEvent(data: InsertEvent): Promise<Event> {
    const [created] = await db.insert(events).values(data).returning();
    return created;
  }

  async updateEvent(id: number, data: Partial<InsertEvent>): Promise<Event | undefined> {
    const [updated] = await db.update(events).set(data).where(eq(events.id, id)).returning();
    return updated;
  }

  async deleteEvent(id: number): Promise<boolean> {
    const result = await db.delete(events).where(eq(events.id, id)).returning();
    return result.length > 0;
  }

  async createContactMessage(data: InsertContactMessage): Promise<ContactMessage> {
    const [created] = await db.insert(contactMessages).values(data).returning();
    return created;
  }

  async getContactMessages(): Promise<ContactMessage[]> {
    return db.select().from(contactMessages).orderBy(contactMessages.createdAt);
  }

  async updateContactMessageStatus(id: number, status: string): Promise<ContactMessage | undefined> {
    const [updated] = await db.update(contactMessages).set({ status }).where(eq(contactMessages.id, id)).returning();
    return updated;
  }

  async replyToContactMessage(id: number, replyText: string): Promise<ContactMessage | undefined> {
    const [updated] = await db.update(contactMessages)
      .set({ staffReply: replyText, repliedAt: new Date(), status: "replied" })
      .where(eq(contactMessages.id, id))
      .returning();
    return updated;
  }

  async getContactMessage(id: number): Promise<ContactMessage | undefined> {
    const [msg] = await db.select().from(contactMessages).where(eq(contactMessages.id, id));
    return msg;
  }

  async getSetting(key: string): Promise<string | null> {
    const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await db.insert(siteSettings).values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date() } });
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const rows = await db.select().from(siteSettings);
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  }

  async getBannerImages(): Promise<BannerImage[]> {
    return db.select().from(bannerImages).where(eq(bannerImages.active, true)).orderBy(bannerImages.sortOrder);
  }

  async getAllBannerImages(): Promise<BannerImage[]> {
    return db.select().from(bannerImages).orderBy(bannerImages.sortOrder);
  }

  async createBannerImage(data: InsertBannerImage): Promise<BannerImage> {
    const [row] = await db.insert(bannerImages).values(data).returning();
    return row;
  }

  async updateBannerImage(id: number, data: Partial<InsertBannerImage>): Promise<BannerImage | undefined> {
    const [row] = await db.update(bannerImages).set(data).where(eq(bannerImages.id, id)).returning();
    return row;
  }

  async deleteBannerImage(id: number): Promise<boolean> {
    const [row] = await db.delete(bannerImages).where(eq(bannerImages.id, id)).returning();
    return !!row;
  }

  async createCustomer(email: string, name: string, phone: string | null, passwordHash: string): Promise<Customer> {
    const [customer] = await db.insert(customers).values({
      email: email.toLowerCase().trim(),
      name,
      phone,
      passwordHash,
      privacyConsentAt: new Date(),
    }).returning();
    return customer;
  }

  async getCustomerByEmail(email: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.email, email.toLowerCase().trim()));
    return customer;
  }

  async getCustomerById(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async getAllCustomers(): Promise<Customer[]> {
    return db.select().from(customers).orderBy(customers.id);
  }

  async updateCustomer(id: number, data: Partial<{ name: string; phone: string }>): Promise<Customer | undefined> {
    const [updated] = await db.update(customers).set(data).where(eq(customers.id, id)).returning();
    return updated;
  }

  async deleteCustomer(id: number): Promise<boolean> {
    await db.delete(customerSessions).where(eq(customerSessions.customerId, id));
    const result = await db.delete(customers).where(eq(customers.id, id)).returning();
    return result.length > 0;
  }

  async createCustomerSession(token: string, customerId: number, expiresAt: Date): Promise<CustomerSession> {
    const [session] = await db.insert(customerSessions).values({
      token,
      customerId,
      expiresAt,
    }).returning();
    return session;
  }

  async validateCustomerSession(token: string): Promise<CustomerSession | undefined> {
    const [session] = await db
      .select()
      .from(customerSessions)
      .where(
        and(
          eq(customerSessions.token, token),
          eq(customerSessions.active, true),
          gt(customerSessions.expiresAt, new Date())
        )
      );
    return session;
  }

  async invalidateCustomerSession(token: string): Promise<boolean> {
    const result = await db
      .update(customerSessions)
      .set({ active: false })
      .where(eq(customerSessions.token, token))
      .returning();
    return result.length > 0;
  }

  async getStaffNotices(): Promise<StaffNotice[]> {
    return db.select().from(staffNotices)
      .where(isNull(staffNotices.deletedAt))
      .orderBy(staffNotices.createdAt);
  }

  async getDeletedStaffNotices(): Promise<StaffNotice[]> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return db.select().from(staffNotices)
      .where(and(isNotNull(staffNotices.deletedAt), gte(staffNotices.deletedAt, cutoff)))
      .orderBy(desc(staffNotices.deletedAt));
  }

  async createStaffNotice(message: string, createdBy: string, colour: string = "amber"): Promise<StaffNotice> {
    const [notice] = await db.insert(staffNotices).values({ message, createdBy, colour }).returning();
    return notice;
  }

  async deleteStaffNotice(id: number, deletedBy: string): Promise<boolean> {
    const result = await db.update(staffNotices)
      .set({ deletedAt: new Date(), deletedBy })
      .where(and(eq(staffNotices.id, id), isNull(staffNotices.deletedAt)))
      .returning();
    return result.length > 0;
  }

  async getStaffPopups(): Promise<StaffPopup[]> {
    return db.select().from(staffPopups)
      .where(isNull(staffPopups.deletedAt))
      .orderBy(staffPopups.createdAt);
  }

  async createStaffPopup(title: string, message: string, colour: string, createdBy: string): Promise<StaffPopup> {
    const [popup] = await db.insert(staffPopups).values({ title, message, colour, createdBy }).returning();
    return popup;
  }

  async deleteStaffPopup(id: number, deletedBy: string): Promise<boolean> {
    const result = await db.update(staffPopups)
      .set({ deletedAt: new Date(), deletedBy })
      .where(and(eq(staffPopups.id, id), isNull(staffPopups.deletedAt)))
      .returning();
    return result.length > 0;
  }

  async getBlockedPeriods(): Promise<BlockedPeriod[]> {
    return db.select().from(blockedPeriods).orderBy(blockedPeriods.createdAt);
  }

  async createBlockedPeriod(data: InsertBlockedPeriod): Promise<BlockedPeriod> {
    const [created] = await db.insert(blockedPeriods).values(data).returning();
    return created;
  }

  async deleteBlockedPeriod(id: number): Promise<boolean> {
    const result = await db.delete(blockedPeriods).where(eq(blockedPeriods.id, id)).returning();
    return result.length > 0;
  }

  // ── Membership Plans ────────────────────────────────────────────────────────

  async getMembershipPlans(activeOnly = false): Promise<MembershipPlan[]> {
    const query = db.select().from(membershipPlans);
    if (activeOnly) {
      return query.where(eq(membershipPlans.active, true)).orderBy(membershipPlans.sortOrder);
    }
    return query.orderBy(membershipPlans.sortOrder);
  }

  async getMembershipPlan(id: number): Promise<MembershipPlan | undefined> {
    const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, id));
    return plan;
  }

  async upsertMembershipPlan(data: InsertMembershipPlan): Promise<MembershipPlan> {
    const [existing] = await db.select().from(membershipPlans).where(eq(membershipPlans.tier, data.tier));
    if (existing) {
      const [updated] = await db.update(membershipPlans)
        .set({
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
          description: data.description ?? null,
        })
        .where(eq(membershipPlans.tier, data.tier))
        .returning();
      return updated;
    }
    const [plan] = await db.insert(membershipPlans).values(data).returning();
    return plan;
  }

  async createMembershipPlan(data: InsertMembershipPlan): Promise<MembershipPlan> {
    const [plan] = await db.insert(membershipPlans).values(data).returning();
    return plan;
  }

  async updateMembershipPlan(id: number, data: Partial<InsertMembershipPlan>): Promise<MembershipPlan | undefined> {
    const [plan] = await db.update(membershipPlans).set(data).where(eq(membershipPlans.id, id)).returning();
    return plan;
  }

  // ── Membership Subscriptions ────────────────────────────────────────────────

  async getMembershipSubscriptions(): Promise<(MembershipSubscription & { customer: Customer | null; plan: MembershipPlan | null })[]> {
    const rows = await db.select().from(membershipSubscriptions)
      .orderBy(desc(membershipSubscriptions.createdAt));
    const result = await Promise.all(rows.map(async (sub) => {
      const [customer] = await db.select().from(customers).where(eq(customers.id, sub.customerId));
      const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, sub.planId));
      return { ...sub, customer: customer || null, plan: plan || null };
    }));
    return result;
  }

  async getMembershipSubscriptionByCustomer(customerId: number): Promise<(MembershipSubscription & { plan: MembershipPlan | null }) | null> {
    const [sub] = await db.select().from(membershipSubscriptions)
      .where(and(eq(membershipSubscriptions.customerId, customerId), eq(membershipSubscriptions.status, "active")))
      .orderBy(desc(membershipSubscriptions.createdAt));
    if (!sub) return null;
    // Only return the plan if it is currently active in the staff portal
    const [plan] = await db.select().from(membershipPlans)
      .where(and(eq(membershipPlans.id, sub.planId), eq(membershipPlans.active, true)));
    return { ...sub, plan: plan || null };
  }

  async getMembershipSubscription(id: number): Promise<MembershipSubscription | undefined> {
    const [sub] = await db.select().from(membershipSubscriptions).where(eq(membershipSubscriptions.id, id));
    return sub;
  }

  async createMembershipSubscription(data: InsertMembershipSubscription): Promise<MembershipSubscription> {
    const [sub] = await db.insert(membershipSubscriptions).values(data).returning();
    return sub;
  }

  async updateMembershipSubscription(id: number, data: Partial<InsertMembershipSubscription>): Promise<MembershipSubscription | undefined> {
    const [sub] = await db.update(membershipSubscriptions).set(data).where(eq(membershipSubscriptions.id, id)).returning();
    return sub;
  }

  async getMembershipStats(): Promise<{ total: number; active: number; paused: number; cancelled: number; mrr: number }> {
    const all = await db.select().from(membershipSubscriptions);
    const active = all.filter(s => s.status === "active");
    const paused = all.filter(s => s.status === "paused");
    const cancelled = all.filter(s => s.status === "cancelled");
    let mrr = 0;
    for (const sub of active) {
      const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, sub.planId));
      if (plan) mrr += plan.priceMonthly;
    }
    return { total: all.length, active: active.length, paused: paused.length, cancelled: cancelled.length, mrr };
  }

  // ── Menu visibility overrides ───────────────────────────────────────────────

  async getMenuCategoryOverrides(): Promise<MenuCategoryVisibility[]> {
    return db.select().from(menuCategoryVisibility);
  }

  async setMenuCategoryHidden(categoryId: string, hidden: boolean, updatedBy: string): Promise<void> {
    await db.insert(menuCategoryVisibility)
      .values({ categoryId, hidden, updatedBy, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: menuCategoryVisibility.categoryId,
        set: { hidden, updatedBy, updatedAt: new Date() },
      });
  }

  async getMenuItemOverrides(): Promise<MenuItemOverride[]> {
    return db.select().from(menuItemOverrides);
  }

  async setMenuItemSoldOut(variationId: string, itemId: string, name: string, soldOut: boolean, updatedBy: string): Promise<void> {
    const existing = await db.select().from(menuItemOverrides).where(eq(menuItemOverrides.variationId, variationId));
    const currentHidden = existing[0]?.hidden ?? false;
    await db.insert(menuItemOverrides)
      .values({ variationId, itemId, name, soldOut, hidden: currentHidden, updatedBy, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: menuItemOverrides.variationId,
        set: { soldOut, updatedBy, updatedAt: new Date() },
      });
  }

  async setMenuItemHidden(variationId: string, itemId: string, name: string, hidden: boolean, updatedBy: string): Promise<void> {
    const existing = await db.select().from(menuItemOverrides).where(eq(menuItemOverrides.variationId, variationId));
    const currentSoldOut = existing[0]?.soldOut ?? false;
    await db.insert(menuItemOverrides)
      .values({ variationId, itemId, name, soldOut: currentSoldOut, hidden, updatedBy, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: menuItemOverrides.variationId,
        set: { hidden, updatedBy, updatedAt: new Date() },
      });
  }

  async getCategorySettings(): Promise<CategorySetting[]> {
    return db.select().from(categorySettings);
  }

  async upsertCategorySettings(settings: { categoryId: string; displayOrder?: number; mergedIntoId?: string | null; displayName?: string | null; updatedBy: string }[]): Promise<void> {
    for (const s of settings) {
      await db.insert(categorySettings)
        .values({
          categoryId: s.categoryId,
          displayOrder: s.displayOrder ?? 99,
          mergedIntoId: s.mergedIntoId ?? null,
          displayName: s.displayName ?? null,
          updatedBy: s.updatedBy,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: categorySettings.categoryId,
          set: {
            ...(s.displayOrder !== undefined ? { displayOrder: s.displayOrder } : {}),
            ...(s.mergedIntoId !== undefined ? { mergedIntoId: s.mergedIntoId } : {}),
            ...(s.displayName !== undefined ? { displayName: s.displayName } : {}),
            updatedBy: s.updatedBy,
            updatedAt: new Date(),
          },
        });
    }
  }

  async getAvailabilityRules(): Promise<AvailabilityRule[]> {
    return db.select().from(availabilityRules).orderBy(availabilityRules.id);
  }

  async createAvailabilityRule(rule: Omit<AvailabilityRule, 'id' | 'updatedAt'>): Promise<AvailabilityRule> {
    const [created] = await db.insert(availabilityRules).values({ ...rule, updatedAt: new Date() }).returning();
    return created;
  }

  async updateAvailabilityRule(id: number, rule: Partial<Omit<AvailabilityRule, 'id' | 'updatedAt'>>): Promise<AvailabilityRule | undefined> {
    const [updated] = await db.update(availabilityRules)
      .set({ ...rule, updatedAt: new Date() })
      .where(eq(availabilityRules.id, id))
      .returning();
    return updated;
  }

  async deleteAvailabilityRule(id: number): Promise<boolean> {
    const result = await db.delete(availabilityRules).where(eq(availabilityRules.id, id)).returning();
    return result.length > 0;
  }

  async createAppOrder(data: {
    squareLinkId?: string;
    squareOrderId?: string;
    tableNote?: string;
    customerName?: string;
    customerEmail?: string;
    itemsJson: string;
    totalPence: number;
    discountPercent?: number;
    discountLabel?: string;
  }): Promise<void> {
    await db.insert(appOrders).values({
      squareLinkId: data.squareLinkId ?? null,
      squareOrderId: data.squareOrderId ?? null,
      squarePaymentId: null,
      tableNote: data.tableNote ?? null,
      customerName: data.customerName ?? null,
      customerEmail: data.customerEmail ?? null,
      itemsJson: data.itemsJson,
      totalPence: data.totalPence,
      discountPercent: data.discountPercent ?? null,
      discountLabel: data.discountLabel ?? null,
      status: "pending",
    });
  }

  async getRecentAppOrders(limit = 100): Promise<AppOrder[]> {
    return db.select().from(appOrders).orderBy(desc(appOrders.createdAt)).limit(limit);
  }

  async getAppOrder(id: number): Promise<AppOrder | null> {
    const rows = await db.select().from(appOrders).where(eq(appOrders.id, id));
    return rows[0] ?? null;
  }

  async getOrderBySquareOrderId(squareOrderId: string): Promise<AppOrder | null> {
    const rows = await db.select().from(appOrders).where(eq(appOrders.squareOrderId, squareOrderId));
    return rows[0] ?? null;
  }

  async updateAppOrderPaid(squareOrderId: string, squarePaymentId: string): Promise<void> {
    await db.update(appOrders)
      .set({ status: "paid", squarePaymentId })
      .where(eq(appOrders.squareOrderId, squareOrderId));
  }

  async updateAppOrderStatus(id: number, status: string): Promise<void> {
    await db.update(appOrders).set({ status }).where(eq(appOrders.id, id));
  }

  async getCustomerOrders(email: string): Promise<AppOrder[]> {
    return db.select().from(appOrders)
      .where(and(
        eq(appOrders.customerEmail, email),
        // Never show expired (abandoned) orders to the customer
        sql`${appOrders.status} != 'expired'`
      ))
      .orderBy(desc(appOrders.createdAt))
      .limit(50);
  }

  async expireStaleOrders(olderThanMinutes: number = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const result = await db.update(appOrders)
      .set({ status: "expired" })
      .where(and(
        eq(appOrders.status, "pending"),
        lte(appOrders.createdAt, cutoff)
      ));
    return (result as any).rowCount ?? 0;
  }

  async logOrderAction(data: {
    orderId: number;
    staffUsername: string;
    action: string;
    reason?: string;
  }): Promise<void> {
    await db.insert(orderAuditLog).values({
      orderId: data.orderId,
      staffUsername: data.staffUsername,
      action: data.action,
      reason: data.reason ?? null,
    });
  }

  async getOrderAuditLog(orderId: number): Promise<OrderAuditEntry[]> {
    return db.select().from(orderAuditLog)
      .where(eq(orderAuditLog.orderId, orderId))
      .orderBy(desc(orderAuditLog.createdAt));
  }

  async getAuditLogsForOrders(orderIds: number[]): Promise<OrderAuditEntry[]> {
    if (orderIds.length === 0) return [];
    return db.select().from(orderAuditLog)
      .where(inArray(orderAuditLog.orderId, orderIds))
      .orderBy(desc(orderAuditLog.createdAt));
  }
}

export const storage = new DatabaseStorage();
