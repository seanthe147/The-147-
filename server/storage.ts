import { drizzle } from "drizzle-orm/node-postgres";
import { eq, lt, lte, sql } from "drizzle-orm";
import { and, gt } from "drizzle-orm";
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
  users,
  offers,
  pushTokens,
  notifications,
  bookings,
  staffSessions,
  staffUsers,
  contactMessages,
  siteSettings,
} from "@shared/schema";
import { encrypt, decrypt, hashEmail } from "./encryption";

const db = drizzle(process.env.DATABASE_URL!);

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
  createStaffSession(token: string, expiresAt: Date, staffUserId?: number, staffUsername?: string): Promise<StaffSession>;
  validateStaffSession(token: string): Promise<StaffSession | undefined>;
  invalidateStaffSession(token: string): Promise<boolean>;
  getBookingsByEmail(email: string): Promise<Booking[]>;
  deleteBookingsByEmail(email: string): Promise<number>;
  anonymizeOldBookings(retentionDays: number): Promise<number>;
  cleanupExpiredSessions(): Promise<number>;
  createStaffUser(username: string, pinHash: string, pinSalt: string, displayName?: string): Promise<StaffUser>;
  getStaffUserByUsername(username: string): Promise<StaffUser | undefined>;
  getAllStaffUsers(): Promise<StaffUser[]>;
  migrateEncryptExistingBookings(): Promise<number>;
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
    if (existing) return existing;
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

  async saveNotification(title: string, body: string, recipientCount: number): Promise<Notification> {
    const [created] = await db.insert(notifications).values({ title, body, recipientCount }).returning();
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
    return count;
  }

  async cleanupExpiredSessions(): Promise<number> {
    const result = await db.delete(staffSessions).where(
      lte(staffSessions.expiresAt, new Date())
    ).returning();
    return result.length;
  }

  async createStaffUser(username: string, pinHash: string, pinSalt: string, displayName?: string): Promise<StaffUser> {
    const [user] = await db.insert(staffUsers).values({
      username: username.toLowerCase().trim(),
      pinHash,
      pinSalt,
      displayName: displayName || null,
    }).returning();
    return user;
  }

  async getStaffUserByUsername(username: string): Promise<StaffUser | undefined> {
    const [user] = await db.select().from(staffUsers).where(
      eq(staffUsers.username, username.toLowerCase().trim())
    );
    return user;
  }

  async getAllStaffUsers(): Promise<StaffUser[]> {
    return db.select().from(staffUsers).where(eq(staffUsers.active, true));
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
}

export const storage = new DatabaseStorage();
