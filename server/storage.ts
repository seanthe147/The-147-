import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import {
  type User,
  type InsertUser,
  type Offer,
  type InsertOffer,
  type PushToken,
  type InsertPushToken,
  type Notification,
  users,
  offers,
  pushTokens,
  notifications,
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
}

export const storage = new DatabaseStorage();
