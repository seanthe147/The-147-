import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, lt, lte, sql, and, gt, isNull, isNotNull, gte, desc } from "drizzle-orm";
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
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
  };
}

const pool = new Pool(buildPoolConfig());

const db = drizzle(pool);

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
  getBookedSlots(date: string, tableType: string, tableNumber?: string): Promise<Array<{ startTime: string; duration: number }>>;
  getBookingsDueReminder(windowStartMins: number, windowEndMins: number): Promise<Booking[]>;
  markReminderSent(id: number): Promise<void>;
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
  createCustomer(email: string, name: string, phone: string | null, passwordHash: string): Promise<Customer>;
  getCustomerByEmail(email: string): Promise<Customer | undefined>;
  getCustomerById(id: number): Promise<Customer | undefined>;
  updateCustomer(id: number, data: Partial<{ name: string; phone: string }>): Promise<Customer | undefined>;
  deleteCustomer(id: number): Promise<boolean>;
  createCustomerSession(token: string, customerId: number, expiresAt: Date): Promise<CustomerSession>;
  validateCustomerSession(token: string): Promise<CustomerSession | undefined>;
  invalidateCustomerSession(token: string): Promise<boolean>;
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
    return db.select().from(offers);
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

  async getBookedSlots(date: string, tableType: string, tableNumber?: string): Promise<Array<{ startTime: string; duration: number }>> {
    const conditions = [
      eq(bookings.date, date),
      eq(bookings.tableType, tableType),
      eq(bookings.status, "confirmed"),
    ];
    if (tableNumber) {
      conditions.push(eq(bookings.tableNumber, tableNumber));
    }
    const results = await db
      .select({ startTime: bookings.startTime, duration: bookings.duration })
      .from(bookings)
      .where(and(...conditions));
    return results;
  }

  async getBookingsDueReminder(windowStartMins: number, windowEndMins: number): Promise<Booking[]> {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
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
          notes: null,
        }).where(eq(bookings.id, booking.id));
        count++;
      }
    }

    // Also anonymize contact messages older than the retention period
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

  async createStaffNotice(message: string, createdBy: string): Promise<StaffNotice> {
    const [notice] = await db.insert(staffNotices).values({ message, createdBy }).returning();
    return notice;
  }

  async deleteStaffNotice(id: number, deletedBy: string): Promise<boolean> {
    const result = await db.update(staffNotices)
      .set({ deletedAt: new Date(), deletedBy })
      .where(and(eq(staffNotices.id, id), isNull(staffNotices.deletedAt)))
      .returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
