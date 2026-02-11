import { drizzle } from "drizzle-orm/node-postgres";
import { eq, lt, lte } from "drizzle-orm";
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
  users,
  offers,
  pushTokens,
  notifications,
  bookings,
  staffSessions,
} from "@shared/schema";

const db = drizzle(process.env.DATABASE_URL!);

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
  createStaffSession(token: string, expiresAt: Date): Promise<StaffSession>;
  validateStaffSession(token: string): Promise<StaffSession | undefined>;
  invalidateStaffSession(token: string): Promise<boolean>;
  getBookingsByEmail(email: string): Promise<Booking[]>;
  deleteBookingsByEmail(email: string): Promise<number>;
  anonymizeOldBookings(retentionDays: number): Promise<number>;
  cleanupExpiredSessions(): Promise<number>;
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
    const [created] = await db.insert(bookings).values(booking).returning();
    return created;
  }

  async getBookings(): Promise<Booking[]> {
    return db.select().from(bookings).orderBy(bookings.date, bookings.startTime);
  }

  async getBookingsByDate(date: string): Promise<Booking[]> {
    return db.select().from(bookings).where(eq(bookings.date, date)).orderBy(bookings.startTime);
  }

  async getBooking(id: number): Promise<Booking | undefined> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    return booking;
  }

  async updateBookingStatus(id: number, status: string): Promise<Booking | undefined> {
    const [updated] = await db.update(bookings).set({ status }).where(eq(bookings.id, id)).returning();
    return updated;
  }

  async updateBooking(id: number, data: Partial<InsertBooking>): Promise<Booking | undefined> {
    const [updated] = await db.update(bookings).set(data).where(eq(bookings.id, id)).returning();
    return updated;
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

  async createStaffSession(token: string, expiresAt: Date): Promise<StaffSession> {
    const [session] = await db.insert(staffSessions).values({ token, expiresAt }).returning();
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
    return db.select().from(bookings).where(eq(bookings.customerEmail, email.toLowerCase())).orderBy(bookings.date);
  }

  async deleteBookingsByEmail(email: string): Promise<number> {
    const result = await db.delete(bookings).where(eq(bookings.customerEmail, email.toLowerCase())).returning();
    return result.length;
  }

  async anonymizeOldBookings(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];
    const oldBookings = await db.select().from(bookings).where(lt(bookings.date, cutoffStr));
    let count = 0;
    for (const booking of oldBookings) {
      if (booking.customerName !== "ANONYMIZED") {
        await db.update(bookings).set({
          customerName: "ANONYMIZED",
          customerEmail: "anonymized@removed.local",
          customerPhone: "000000",
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
}

export const storage = new DatabaseStorage();
