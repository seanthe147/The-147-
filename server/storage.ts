import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, lt, lte, sql, and, gt, isNull, isNotNull, gte, desc, inArray, ne, ilike, or } from "drizzle-orm";
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
  marketingPages,
  type MarketingPage,
  type InsertMarketingPage,
  bannerImages,
  dealPreferences,
  type DealPreference,
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
  passwordResetAuditLog,
  type PasswordResetAuditEntry,
  membershipAuditLog,
  type MembershipAuditEntry,
  bookingAuditLog,
  type BookingAuditEntry,
  staffActionLog,
  type StaffActionEntry,
  staffTimeEntries,
  type StaffTimeEntry,
  staffLeaveRequests,
  type StaffLeaveRequest,
  staffLeaveAllowances,
  type StaffLeaveAllowance,
  staffIncidents,
  type StaffIncident,
  staffRotaShifts,
  type StaffRotaShift,
  staffRotaPublished,
  type StaffRotaPublished,
  staffPushTokens,
  type StaffPushToken,
  staffDocuments,
  type StaffDocument,
  staffOnboarding,
  type StaffOnboarding,
  paymentLog,
  type PaymentLog,
  type InsertPaymentLog,
} from "@shared/schema";
import { encrypt, decrypt, hashEmail } from "./encryption";

function decryptCustomer<T extends { email: string; name: string; phone?: string | null; dateOfBirth?: string | null }>(c: T): T {
  return {
    ...c,
    email: decrypt(c.email),
    name: decrypt(c.name),
    phone: c.phone ? decrypt(c.phone) : c.phone,
    dateOfBirth: c.dateOfBirth ? decrypt(c.dateOfBirth) : c.dateOfBirth,
  };
}

function decryptPaymentLog<T extends { customerName?: string | null; customerEmail?: string | null; customerPhone?: string | null }>(p: T): T {
  return {
    ...p,
    customerName: p.customerName ? decrypt(p.customerName) : p.customerName,
    customerEmail: p.customerEmail ? decrypt(p.customerEmail) : p.customerEmail,
    customerPhone: p.customerPhone ? decrypt(p.customerPhone) : p.customerPhone,
  };
}

function decryptContactMessage<T extends { name: string; email: string; phone?: string | null; message: string }>(m: T): T {
  return {
    ...m,
    name: decrypt(m.name),
    email: decrypt(m.email),
    phone: m.phone ? decrypt(m.phone) : m.phone,
    message: decrypt(m.message),
  };
}

function decryptPushToken<T extends { customerEmail?: string | null }>(t: T): T {
  return {
    ...t,
    customerEmail: t.customerEmail ? decrypt(t.customerEmail) : t.customerEmail,
  };
}

function decryptAppOrder<T extends { customerName?: string | null; customerEmail?: string | null }>(o: T): T {
  return {
    ...o,
    customerName: o.customerName ? decrypt(o.customerName) : o.customerName,
    customerEmail: o.customerEmail ? decrypt(o.customerEmail) : o.customerEmail,
  };
}

function decryptTimeEntry<T extends { clockInLat?: string | null; clockInLng?: string | null; clockOutLat?: string | null; clockOutLng?: string | null }>(entry: T): T {
  return {
    ...entry,
    clockInLat: entry.clockInLat ? decrypt(entry.clockInLat) : entry.clockInLat,
    clockInLng: entry.clockInLng ? decrypt(entry.clockInLng) : entry.clockInLng,
    clockOutLat: entry.clockOutLat ? decrypt(entry.clockOutLat) : entry.clockOutLat,
    clockOutLng: entry.clockOutLng ? decrypt(entry.clockOutLng) : entry.clockOutLng,
  };
}

function decryptIncident<T extends { description?: string | null }>(incident: T): T {
  return {
    ...incident,
    description: incident.description ? decrypt(incident.description) : incident.description,
  };
}

function decryptLeaveRequest<T extends { reason?: string | null; reviewNotes?: string | null }>(req: T): T {
  return {
    ...req,
    reason: req.reason ? decrypt(req.reason) : req.reason,
    reviewNotes: req.reviewNotes ? decrypt(req.reviewNotes) : req.reviewNotes,
  };
}

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
export { db };

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

    // Add GDPR encryption helper columns (new — may already exist)
    await client.query(`
      ALTER TABLE customers
        ADD COLUMN IF NOT EXISTS email_hash TEXT,
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS email_verify_token_hash TEXT,
        ADD COLUMN IF NOT EXISTS email_verify_token_expires_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS email_verify_last_sent_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT,
        ADD COLUMN IF NOT EXISTS password_reset_token_expires_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS password_reset_last_sent_at TIMESTAMP;
    `);

    // Loyalty programme columns (Phases 3–5). Adding them here as well as
    // through drizzle's db:push so production hot-deploys don't blow up if
    // the schema sync ran on a stale revision.
    await client.query(`
      ALTER TABLE customers
        ADD COLUMN IF NOT EXISTS square_loyalty_account_id TEXT,
        ADD COLUMN IF NOT EXISTS date_of_birth TEXT,
        ADD COLUMN IF NOT EXISTS last_birthday_bonus_year INTEGER,
        ADD COLUMN IF NOT EXISTS last_birthday_push_year INTEGER;
    `);
    // Remove old unique constraint on customers.email (now stored encrypted; email_hash is the unique lookup)
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname IN ('customers_email_unique', 'customers_email_key')
            AND conrelid = 'customers'::regclass
        ) THEN
          ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_email_unique;
          ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_email_key;
        END IF;
      END $$;
    `);
    // Add unique constraint on email_hash only if not already present
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'customers_email_hash_unique'
            AND conrelid = 'customers'::regclass
        ) THEN
          ALTER TABLE customers ADD CONSTRAINT customers_email_hash_unique UNIQUE (email_hash);
        END IF;
      END $$;
    `);
    await client.query(`
      ALTER TABLE push_tokens
        ADD COLUMN IF NOT EXISTS customer_email_hash TEXT;
    `);
    await client.query(`
      ALTER TABLE app_orders
        ADD COLUMN IF NOT EXISTS customer_email_hash TEXT;
    `);
    await client.query(`
      ALTER TABLE app_orders
        ADD COLUMN IF NOT EXISTS confirmation_token TEXT;
    `);
    await client.query(`
      ALTER TABLE app_orders
        ADD COLUMN IF NOT EXISTS push_token TEXT;
    `);

    // Staff password migration: add password columns, relax pin NOT NULL,
    // and force every existing PIN-only user to set a password on next login.
    await client.query(`
      ALTER TABLE staff_users
        ADD COLUMN IF NOT EXISTS password_hash TEXT,
        ADD COLUMN IF NOT EXISTS password_salt TEXT,
        ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;
    `);
    await client.query(`
      ALTER TABLE staff_users
        ALTER COLUMN pin_hash DROP NOT NULL,
        ALTER COLUMN pin_salt DROP NOT NULL;
    `);

    // Audit trail of staff-initiated password resets (Task #27)
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_audit_log (
        id SERIAL PRIMARY KEY,
        staff_username TEXT NOT NULL,
        customer_id INTEGER,
        customer_email TEXT,
        customer_name TEXT,
        outcome TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS password_reset_audit_log_created_at_idx
        ON password_reset_audit_log (created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS password_reset_audit_log_staff_username_idx
        ON password_reset_audit_log (staff_username);
    `);

    // Audit trail of staff-initiated membership actions (Task #74)
    // — refunds, cancellations, plan changes, payment-link sends, pauses/resumes.
    await client.query(`
      CREATE TABLE IF NOT EXISTS membership_audit_log (
        id SERIAL PRIMARY KEY,
        subscription_id INTEGER,
        customer_id INTEGER,
        action TEXT NOT NULL,
        staff_username TEXT NOT NULL,
        amount_pence INTEGER,
        refund_id TEXT,
        note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS membership_audit_log_created_at_idx
        ON membership_audit_log (created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS membership_audit_log_subscription_id_idx
        ON membership_audit_log (subscription_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS membership_audit_log_customer_id_idx
        ON membership_audit_log (customer_id);
    `);

    // Audit trail of staff-initiated booking actions — created/edited/status
    // change/completed/no-show/deleted. Now that ordinary staff (not just
    // managers) can modify bookings, this gives a clear "who did what" record.
    await client.query(`
      CREATE TABLE IF NOT EXISTS booking_audit_log (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        staff_username TEXT NOT NULL,
        staff_id INTEGER,
        from_value TEXT,
        to_value TEXT,
        note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS booking_audit_log_created_at_idx
        ON booking_audit_log (created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS booking_audit_log_booking_id_idx
        ON booking_audit_log (booking_id);
    `);

    // Generic staff action log — catch-all audit trail of every state-changing
    // API call made by an authenticated staff/manager session. Captured by the
    // staffAuth middleware so coverage is uniform across all endpoints.
    await client.query(`
      CREATE TABLE IF NOT EXISTS staff_action_log (
        id SERIAL PRIMARY KEY,
        staff_username TEXT NOT NULL,
        staff_id INTEGER,
        staff_role TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        route TEXT,
        status_code INTEGER NOT NULL,
        request_body TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS staff_action_log_created_at_idx
        ON staff_action_log (created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS staff_action_log_staff_username_idx
        ON staff_action_log (staff_username);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS staff_action_log_path_idx
        ON staff_action_log (path);
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

    // Map the VIP plan to its Square customer group, and at the same time
    // force the row active so the auto-sync helper (which filters on
    // `p.active && squareCustomerGroupId`) picks up VIPs. Both columns are
    // updated by the SAME guarded UPDATE so this is a one-shot fix:
    // once the group ID is set, this row never matches the WHERE again,
    // meaning subsequent boots will not override staff who later disable
    // the plan or change the group via the Edit Plan UI.
    await client.query(`
      UPDATE membership_plans
         SET square_customer_group_id = '575ce1a2-a598-4f09-82ba-90a7b88e9da1',
             active = TRUE
       WHERE tier = 'vip'
         AND (square_customer_group_id IS NULL OR square_customer_group_id = '');
    `);

    // Attendance trust columns + concurrency guard (Task #104).
    // db:push handles these in normal deploys; the IF NOT EXISTS clauses make
    // this safe to run on every boot as belt-and-suspenders for environments
    // where the schema push hasn't been applied yet.
    await client.query(`
      ALTER TABLE staff_time_entries
        ADD COLUMN IF NOT EXISTS geofence_enforced BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS clock_in_flags TEXT,
        ADD COLUMN IF NOT EXISTS clock_out_flags TEXT,
        ADD COLUMN IF NOT EXISTS client_ip TEXT,
        ADD COLUMN IF NOT EXISTS user_agent TEXT,
        ADD COLUMN IF NOT EXISTS needs_manager_review BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS manager_reviewed_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS manager_reviewed_by INTEGER;
    `);
    // Partial unique index — at most one "active" (i.e. not-yet-clocked-out)
    // entry per staff member at any given time. Prevents the
    // getActiveClockEntry-then-insert race window from creating duplicate
    // open shifts under concurrent requests.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS staff_time_entries_active_uniq
        ON staff_time_entries (staff_id) WHERE status = 'active';
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
  searchBookings(q: string, limit?: number): Promise<Booking[]>;
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
  getBookingByDepositPaymentId(depositPaymentId: string): Promise<Booking | undefined>;
  deleteBookingsByEmail(email: string): Promise<number>;
  deletePushTokensByEmail(email: string): Promise<number>;
  deleteOrdersByEmail(email: string): Promise<number>;
  deleteContactMessagesByEmail(email: string): Promise<number>;
  anonymizeOldBookings(retentionDays: number): Promise<number>;
  anonymizeOldHRRecords(): Promise<number>;
  cleanupExpiredSessions(): Promise<number>;
  createStaffUser(opts: {
    username: string;
    pinHash?: string | null;
    pinSalt?: string | null;
    passwordHash?: string | null;
    passwordSalt?: string | null;
    mustChangePassword?: boolean;
    displayName?: string;
    role?: string;
    approvalStatus?: string;
  }): Promise<StaffUser>;
  updateStaffApproval(id: number, approvalStatus: string): Promise<StaffUser | undefined>;
  getStaffUserById(id: number): Promise<StaffUser | undefined>;
  getStaffUserByUsername(username: string): Promise<StaffUser | undefined>;
  getAllStaffUsers(): Promise<StaffUser[]>;
  updateStaffPin(username: string, pinHash: string, pinSalt: string): Promise<StaffUser | undefined>;
  updateStaffPassword(username: string, passwordHash: string, passwordSalt: string, mustChangePassword?: boolean): Promise<StaffUser | undefined>;
  setMustChangePassword(username: string, mustChange: boolean): Promise<StaffUser | undefined>;
  migrateEncryptExistingBookings(): Promise<number>;
  migrateEncryptExistingPII(): Promise<void>;
  searchCustomers(query: string, limit?: number): Promise<Array<{ id?: number; name: string; phone: string; email: string }>>;
  createCustomer(email: string, name: string, phone: string | null, passwordHash: string, opts?: { emailVerifyTokenHash?: string; emailVerifyTokenExpiresAt?: Date; dateOfBirth?: string | null }): Promise<Customer>;
  setEmailVerificationToken(id: number, tokenHash: string, expiresAt: Date): Promise<void>;
  getCustomerByVerifyTokenHash(tokenHash: string): Promise<Customer | undefined>;
  markEmailVerified(id: number): Promise<void>;
  setPasswordResetToken(id: number, tokenHash: string, expiresAt: Date): Promise<void>;
  getCustomerByPasswordResetTokenHash(tokenHash: string): Promise<Customer | undefined>;
  setCustomerPassword(id: number, passwordHash: string): Promise<void>;
  getCustomerByEmail(email: string): Promise<Customer | undefined>;
  getCustomerById(id: number): Promise<Customer | undefined>;
  getAllCustomers(): Promise<Customer[]>;
  updateCustomer(id: number, data: Partial<{ name: string; phone: string; dateOfBirth: string | null }>): Promise<Customer | undefined>;
  setSquareLoyaltyAccountId(id: number, accountId: string | null): Promise<void>;
  setLastBirthdayBonusYear(id: number, year: number): Promise<void>;
  setLastBirthdayPushYear(id: number, year: number): Promise<void>;
  getCustomerBySquareLoyaltyAccountId(accountId: string): Promise<Customer | undefined>;
  getCustomersInBirthdayWindow(year: number, monthDay: string): Promise<Customer[]>;
  getCustomersWithLoyaltyAccount(): Promise<Customer[]>;
  deleteCustomer(id: number): Promise<boolean>;
  createCustomerSession(token: string, customerId: number, expiresAt: Date): Promise<CustomerSession>;
  validateCustomerSession(token: string): Promise<CustomerSession | undefined>;
  invalidateCustomerSession(token: string): Promise<boolean>;
  getBlockedPeriods(): Promise<BlockedPeriod[]>;
  createBlockedPeriod(data: InsertBlockedPeriod): Promise<BlockedPeriod>;
  deleteBlockedPeriod(id: number): Promise<boolean>;
  getCategorySettings(): Promise<CategorySetting[]>;
  upsertCategorySettings(settings: { categoryId: string; displayOrder?: number; mergedIntoId?: string | null; parentCategoryId?: string | null; displayName?: string | null; imageUrl?: string | null; updatedBy: string }[]): Promise<void>;
  updateCategoryImage(categoryId: string, imageUrl: string | null, updatedBy: string): Promise<void>;
  getAvailabilityRules(): Promise<AvailabilityRule[]>;
  createAvailabilityRule(rule: Omit<AvailabilityRule, 'id' | 'updatedAt'>): Promise<AvailabilityRule>;
  updateAvailabilityRule(id: number, rule: Partial<Omit<AvailabilityRule, 'id' | 'updatedAt'>>): Promise<AvailabilityRule | undefined>;
  deleteAvailabilityRule(id: number): Promise<boolean>;
  getAllLeaveRequests(): Promise<StaffLeaveRequest[]>;
  getLeaveAllowance(staffId: number, year: number): Promise<StaffLeaveAllowance | null>;
  upsertLeaveAllowance(staffId: number, year: number, totalDays: string, carryOver: string, leaveYearStart?: string, maxCarryOverDays?: string): Promise<StaffLeaveAllowance>;
  getAllLeaveAllowances(year: number): Promise<StaffLeaveAllowance[]>;
  updateStaffEmployment(staffId: number, contractedDaysPerWeek: string, employmentStartDate: string | null): Promise<StaffUser | undefined>;
  // Rota
  getRotaShifts(weekStart: string): Promise<StaffRotaShift[]>;
  getRotaShiftsForStaff(staffId: number, weekStart: string): Promise<StaffRotaShift[]>;
  upsertRotaShift(data: Omit<StaffRotaShift, 'id' | 'createdAt' | 'updatedAt'>, existingId?: number): Promise<StaffRotaShift>;
  deleteRotaShift(id: number): Promise<boolean>;
  publishRota(weekStart: string, publishedByUsername: string | null): Promise<StaffRotaPublished>;
  getRotaPublished(weekStart: string): Promise<StaffRotaPublished | undefined>;
  // Staff push tokens
  upsertStaffPushToken(staffId: number, token: string): Promise<StaffPushToken>;
  getStaffPushTokens(staffIds: number[]): Promise<StaffPushToken[]>;
  removeStaffPushToken(token: string): Promise<boolean>;
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
    const encEmail = data.customerEmail ? encrypt(data.customerEmail) : null;
    const emailHash = data.customerEmail ? hashEmail(data.customerEmail) : null;
    if (existing) {
      if (data.customerEmail && existing.customerEmailHash !== emailHash) {
        const [updated] = await db.update(pushTokens)
          .set({ customerEmail: encEmail, customerEmailHash: emailHash })
          .where(eq(pushTokens.token, data.token)).returning();
        return decryptPushToken(updated);
      }
      return decryptPushToken(existing);
    }
    const [created] = await db.insert(pushTokens).values({
      ...data,
      customerEmail: encEmail,
      customerEmailHash: emailHash,
    }).returning();
    return decryptPushToken(created);
  }

  async getAllPushTokens(): Promise<PushToken[]> {
    const rows = await db.select().from(pushTokens);
    return rows.map(decryptPushToken);
  }

  async removePushToken(token: string): Promise<boolean> {
    const result = await db.delete(pushTokens).where(eq(pushTokens.token, token)).returning();
    return result.length > 0;
  }

  async getPushTokensByEmail(email: string): Promise<PushToken[]> {
    const hash = hashEmail(email);
    // Try hash-based lookup first (encrypted records)
    const byHash = await db.select().from(pushTokens).where(eq(pushTokens.customerEmailHash, hash));
    if (byHash.length > 0) return byHash.map(decryptPushToken);
    // Fallback: plaintext lookup for legacy records
    const byPlain = await db.select().from(pushTokens).where(sql`lower(${pushTokens.customerEmail}) = lower(${email})`);
    return byPlain.map(decryptPushToken);
  }

  async saveNotification(title: string, body: string, recipientCount: number, sentBy?: string): Promise<Notification> {
    const [created] = await db.insert(notifications).values({ title, body, recipientCount, sentBy }).returning();
    return created;
  }

  async getNotificationHistory(): Promise<Notification[]> {
    return db.select().from(notifications).orderBy(desc(notifications.sentAt));
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

  // Booking PII (customer_name/email/phone) is encrypted at rest, so SQL ILIKE
  // against those columns matches ciphertext and is useless. We use three paths
  // in priority order to balance correctness with performance:
  //   1. Numeric query → exact id lookup (cheap, indexed).
  //   2. Email-shaped query → emailHash exact lookup (cheap, indexed).
  //   3. Otherwise → fetch the most recent SCAN_LIMIT bookings, decrypt each,
  //      and substring-match in memory. Mirrors how searchCustomers works.
  // SCAN_LIMIT bounds the worst-case work per keystroke; older bookings are
  // not full-text searchable until we add derived searchable columns.
  async searchBookings(q: string, limit = 5): Promise<Booking[]> {
    const trimmed = q.trim();
    if (trimmed.length < 2) return [];
    const seen = new Set<number>();
    const out: Booking[] = [];
    const push = (b: Booking) => {
      if (seen.has(b.id) || out.length >= limit) return;
      seen.add(b.id);
      out.push(b);
    };

    // Path 1 — exact id match.
    const asNumber = Number(trimmed);
    if (Number.isInteger(asNumber) && asNumber > 0 && asNumber < 2_147_483_647) {
      const [byId] = await db.select().from(bookings).where(eq(bookings.id, asNumber)).limit(1);
      if (byId) push(decryptBookingFields(byId));
    }

    // Path 2 — exact email-hash lookup. emailHash is set by encryptBookingFields.
    if (trimmed.includes("@")) {
      const hash = hashEmail(trimmed);
      const byEmail = await db
        .select()
        .from(bookings)
        .where(eq(bookings.emailHash, hash))
        .orderBy(desc(bookings.date), desc(bookings.startTime))
        .limit(limit);
      for (const b of byEmail) push(decryptBookingFields(b));
    }
    if (out.length >= limit) return out;

    // Path 3 — bounded in-memory substring scan (handles legacy plaintext rows
    // and partial name/phone queries against encrypted rows).
    const SCAN_LIMIT = 500;
    const recent = await db
      .select()
      .from(bookings)
      .orderBy(desc(bookings.date), desc(bookings.startTime))
      .limit(SCAN_LIMIT);
    const needle = trimmed.toLowerCase();
    const needleDigits = trimmed.replace(/\D/g, "");
    for (const raw of recent) {
      if (out.length >= limit) break;
      let dec: Booking;
      try {
        dec = decryptBookingFields(raw);
      } catch {
        continue;
      }
      const name = (dec.customerName || "").toLowerCase();
      const email = (dec.customerEmail || "").toLowerCase();
      const phone = (dec.customerPhone || "").toLowerCase();
      const phoneDigits = phone.replace(/\D/g, "");
      const hit =
        name.includes(needle) ||
        email.includes(needle) ||
        phone.includes(needle) ||
        (needleDigits.length >= 3 && phoneDigits.includes(needleDigits));
      if (hit) push(dec);
    }
    return out;
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

  // Mass-revoke every active session belonging to a staff user. Called whenever
  // an admin action removes that user's access (lock, reject, delete, PIN/password
  // reset) so the affected person is signed out immediately rather than waiting
  // up to 24h for their bearer token to expire.
  async invalidateStaffSessionsByUserId(staffUserId: number, exceptToken?: string): Promise<number> {
    const conditions = [eq(staffSessions.staffUserId, staffUserId), eq(staffSessions.active, true)];
    if (exceptToken) conditions.push(ne(staffSessions.token, exceptToken));
    const result = await db
      .update(staffSessions)
      .set({ active: false })
      .where(and(...conditions))
      .returning();
    return result.length;
  }

  async invalidateStaffSessionsByUsername(username: string): Promise<number> {
    const normalised = username.toLowerCase().trim();
    const result = await db
      .update(staffSessions)
      .set({ active: false })
      .where(and(eq(staffSessions.staffUsername, normalised), eq(staffSessions.active, true)))
      .returning();
    return result.length;
  }

  async getBookingByDepositPaymentId(depositPaymentId: string): Promise<Booking | undefined> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.depositPaymentId, depositPaymentId));
    return booking ? decryptBookingFields(booking) : undefined;
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

  async deletePushTokensByEmail(email: string): Promise<number> {
    const hash = hashEmail(email);
    const byHash = await db.delete(pushTokens).where(eq(pushTokens.customerEmailHash, hash)).returning();
    if (byHash.length > 0) return byHash.length;
    const byPlain = await db.delete(pushTokens).where(sql`lower(${pushTokens.customerEmail}) = lower(${email})`).returning();
    return byPlain.length;
  }

  async deleteOrdersByEmail(email: string): Promise<number> {
    const hash = hashEmail(email);
    const byHash = await db.delete(appOrders).where(eq(appOrders.customerEmailHash, hash)).returning();
    if (byHash.length > 0) return byHash.length;
    const byPlain = await db.delete(appOrders).where(sql`lower(${appOrders.customerEmail}) = lower(${email})`).returning();
    return byPlain.length;
  }

  async deleteContactMessagesByEmail(email: string): Promise<number> {
    const allMessages = await db.select().from(contactMessages).orderBy(contactMessages.createdAt);
    const normalised = email.trim().toLowerCase();
    const toDelete: number[] = [];
    for (const msg of allMessages) {
      try {
        const decryptedEmail = decrypt(msg.email);
        if (decryptedEmail.toLowerCase() === normalised) {
          toDelete.push(msg.id);
        }
      } catch {
        if (msg.email.toLowerCase() === normalised) {
          toDelete.push(msg.id);
        }
      }
    }
    if (toDelete.length === 0) return 0;
    await db.delete(contactMessages).where(inArray(contactMessages.id, toDelete));
    return toDelete.length;
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
    // Use emailHash column (deterministic hash) rather than re-hashing the encrypted email field
    const allCustomers = await db.select({ emailHash: customers.emailHash, email: customers.email }).from(customers);
    for (const c of allCustomers) {
      if (c.emailHash) {
        activeHashes.add(c.emailHash);
      } else if (c.email && !c.email.startsWith("enc:")) {
        // Legacy plaintext record — compute hash on the fly
        activeHashes.add(hashEmail(c.email));
      }
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
    // Clean both staff and customer sessions. Previously this only deleted
    // staffSessions, which left expired customer_sessions accumulating
    // indefinitely (15+ stale rows observed in production).
    const now = new Date();
    const staffDeleted = await db.delete(staffSessions).where(
      lte(staffSessions.expiresAt, now)
    ).returning();
    const customerDeleted = await db.delete(customerSessions).where(
      lte(customerSessions.expiresAt, now)
    ).returning();
    return staffDeleted.length + customerDeleted.length;
  }

  async anonymizeOldHRRecords(): Promise<number> {
    let count = 0;
    const now = new Date();

    // Working Time Regulations: time entry GPS data — anonymise after 3 years
    const gpsRetention = new Date(now);
    gpsRetention.setFullYear(gpsRetention.getFullYear() - 3);
    const oldTimeEntries = await db.select().from(staffTimeEntries)
      .where(lt(staffTimeEntries.clockedInAt, gpsRetention));
    for (const entry of oldTimeEntries) {
      if (!entry.clockInLat && !entry.clockInLng && !entry.clockOutLat && !entry.clockOutLng) continue;
      await db.update(staffTimeEntries)
        .set({ clockInLat: null, clockInLng: null, clockOutLat: null, clockOutLng: null })
        .where(eq(staffTimeEntries.id, entry.id));
      count++;
    }

    // Personnel records: incident descriptions and leave reasons — anonymise after 7 years
    const hrRetention = new Date(now);
    hrRetention.setFullYear(hrRetention.getFullYear() - 7);

    const oldIncidents = await db.select().from(staffIncidents)
      .where(lt(staffIncidents.createdAt, hrRetention));
    for (const incident of oldIncidents) {
      if (!incident.description || incident.description === "ANONYMIZED") continue;
      await db.update(staffIncidents)
        .set({ description: "ANONYMIZED" })
        .where(eq(staffIncidents.id, incident.id));
      count++;
    }

    const oldLeaveRequests = await db.select().from(staffLeaveRequests)
      .where(lt(staffLeaveRequests.createdAt, hrRetention));
    for (const req of oldLeaveRequests) {
      if (!req.reason || req.reason === "ANONYMIZED") continue;
      await db.update(staffLeaveRequests)
        .set({ reason: "ANONYMIZED", reviewNotes: req.reviewNotes ? "ANONYMIZED" : null })
        .where(eq(staffLeaveRequests.id, req.id));
      count++;
    }

    return count;
  }

  async createStaffUser(opts: {
    username: string;
    pinHash?: string | null;
    pinSalt?: string | null;
    passwordHash?: string | null;
    passwordSalt?: string | null;
    mustChangePassword?: boolean;
    displayName?: string;
    role?: string;
    approvalStatus?: string;
  }): Promise<StaffUser> {
    const role = opts.role === "owner" ? "owner" : opts.role === "manager" ? "manager" : "staff";
    const [user] = await db.insert(staffUsers).values({
      username: opts.username.toLowerCase().trim(),
      pinHash: opts.pinHash ?? null,
      pinSalt: opts.pinSalt ?? null,
      passwordHash: opts.passwordHash ?? null,
      passwordSalt: opts.passwordSalt ?? null,
      mustChangePassword: opts.mustChangePassword ?? false,
      displayName: opts.displayName || null,
      role,
      approvalStatus: opts.approvalStatus || "approved",
    }).returning();
    return user;
  }

  async updateStaffApproval(id: number, approvalStatus: string): Promise<StaffUser | undefined> {
    const [updated] = await db.update(staffUsers)
      .set({ approvalStatus })
      .where(eq(staffUsers.id, id))
      .returning();
    // If a manager just rejected the user (or moved them back to pending),
    // revoke any sessions they currently hold so they cannot keep using the
    // portal.
    if (updated && (approvalStatus === "rejected" || approvalStatus === "pending")) {
      await this.invalidateStaffSessionsByUserId(updated.id).catch(() => undefined);
    }
    return updated;
  }

  async getStaffUserById(id: number): Promise<StaffUser | undefined> {
    const [user] = await db.select().from(staffUsers).where(eq(staffUsers.id, id));
    return user;
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
    // Locking the account must immediately end any in-flight sessions —
    // otherwise the offboarded user keeps full portal access until token expiry.
    if (updated && active === false) {
      await this.invalidateStaffSessionsByUserId(updated.id).catch(() => undefined);
    }
    return updated;
  }

  async deleteStaffUser(id: number): Promise<boolean> {
    // Revoke sessions BEFORE deleting the user row so we still have the id.
    await this.invalidateStaffSessionsByUserId(id).catch(() => undefined);
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

  async updateStaffPassword(username: string, passwordHash: string, passwordSalt: string, mustChangePassword: boolean = false): Promise<StaffUser | undefined> {
    const [updated] = await db.update(staffUsers)
      .set({
        passwordHash,
        passwordSalt,
        mustChangePassword,
        // Wipe legacy PIN once a password is in place
        pinHash: null,
        pinSalt: null,
      })
      .where(eq(staffUsers.username, username.toLowerCase().trim()))
      .returning();
    return updated;
  }

  async setMustChangePassword(username: string, mustChange: boolean): Promise<StaffUser | undefined> {
    const [updated] = await db.update(staffUsers)
      .set({ mustChangePassword: mustChange })
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

  async migrateEncryptExistingPII(): Promise<void> {
    // Encrypt plaintext customer account records
    const allCustomers = await db.select().from(customers);
    for (const c of allCustomers) {
      if (c.email.startsWith("enc:") || c.email === "ANONYMIZED") continue;
      await db.update(customers).set({
        email: encrypt(c.email),
        emailHash: hashEmail(c.email),
        name: c.name.startsWith("enc:") ? c.name : encrypt(c.name),
        phone: (c.phone && !c.phone.startsWith("enc:")) ? encrypt(c.phone) : c.phone,
      }).where(eq(customers.id, c.id));
    }

    // Encrypt plaintext contact messages
    const allMessages = await db.select().from(contactMessages);
    for (const m of allMessages) {
      if (m.name === "ANONYMIZED" || m.name.startsWith("enc:")) continue;
      await db.update(contactMessages).set({
        name: encrypt(m.name),
        email: encrypt(m.email),
        phone: (m.phone && !m.phone.startsWith("enc:")) ? encrypt(m.phone) : m.phone,
        message: m.message.startsWith("enc:") ? m.message : encrypt(m.message),
      }).where(eq(contactMessages.id, m.id));
    }

    // Encrypt plaintext push token emails
    const allTokens = await db.select().from(pushTokens);
    for (const t of allTokens) {
      if (!t.customerEmail || t.customerEmail.startsWith("enc:")) continue;
      await db.update(pushTokens).set({
        customerEmail: encrypt(t.customerEmail),
        customerEmailHash: hashEmail(t.customerEmail),
      }).where(eq(pushTokens.id, t.id));
    }

    // Encrypt plaintext app order customer fields
    const allOrders = await db.select().from(appOrders);
    for (const o of allOrders) {
      if (!o.customerEmail && !o.customerName) continue;
      if (o.customerEmail?.startsWith("enc:")) continue;
      const updates: Record<string, string | null> = {};
      if (o.customerName && !o.customerName.startsWith("enc:")) updates.customerName = encrypt(o.customerName);
      if (o.customerEmail && !o.customerEmail.startsWith("enc:")) {
        updates.customerEmail = encrypt(o.customerEmail);
        updates.customerEmailHash = hashEmail(o.customerEmail);
      }
      if (Object.keys(updates).length > 0) {
        await db.update(appOrders).set(updates).where(eq(appOrders.id, o.id));
      }
    }

    console.log("[GDPR] Existing PII encryption migration complete");
  }

  async searchCustomers(query: string, limit = 6): Promise<Array<{ id?: number; name: string; phone: string; email: string }>> {
    if (!query || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    const qClean = q.replace(/\s/g, "");
    // Search the customers table directly so accounts without bookings are included.
    // Data is encrypted at rest, so we decrypt and filter in-memory.
    const allCustomers = await db.select().from(customers).orderBy(customers.id);
    const seen = new Set<string>();
    const matches: Array<{ id: number; name: string; phone: string; email: string; score: number }> = [];
    for (const raw of allCustomers) {
      try {
        const dec = decryptCustomer(raw);
        const name = dec.name || "";
        const email = dec.email || "";
        const phone = dec.phone || "";
        if (name === "ANONYMIZED" || email.includes("@removed.local")) continue;
        const emailLower = email.toLowerCase();
        if (seen.has(emailLower)) continue;
        const nameLower = name.toLowerCase();
        const phoneLower = phone.toLowerCase().replace(/\s/g, "");
        const emailMatch = emailLower.includes(q);
        const nameMatch = nameLower.includes(q);
        const phoneMatch = qClean.length > 0 && phoneLower.includes(qClean);
        if (nameMatch || phoneMatch || emailMatch) {
          seen.add(emailLower);
          const score = (nameLower.startsWith(q) ? 2 : 0) + (phoneMatch ? 1 : 0);
          matches.push({ id: dec.id, name, phone, email, score });
        }
      } catch { continue; }
    }
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, limit).map(({ id, name, phone, email }) => ({ id, name, phone, email }));
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
    const encrypted = {
      ...data,
      name: encrypt(data.name),
      email: encrypt(data.email),
      phone: data.phone ? encrypt(data.phone) : undefined,
      message: encrypt(data.message),
    };
    const [created] = await db.insert(contactMessages).values(encrypted).returning();
    return decryptContactMessage(created);
  }

  async getContactMessages(): Promise<ContactMessage[]> {
    const rows = await db.select().from(contactMessages).orderBy(contactMessages.createdAt);
    return rows.map(decryptContactMessage);
  }

  async updateContactMessageStatus(id: number, status: string): Promise<ContactMessage | undefined> {
    const [updated] = await db.update(contactMessages).set({ status }).where(eq(contactMessages.id, id)).returning();
    return updated ? decryptContactMessage(updated) : undefined;
  }

  async replyToContactMessage(id: number, replyText: string): Promise<ContactMessage | undefined> {
    const [updated] = await db.update(contactMessages)
      .set({ staffReply: replyText, repliedAt: new Date(), status: "replied" })
      .where(eq(contactMessages.id, id))
      .returning();
    return updated ? decryptContactMessage(updated) : undefined;
  }

  async getContactMessage(id: number): Promise<ContactMessage | undefined> {
    const [msg] = await db.select().from(contactMessages).where(eq(contactMessages.id, id));
    return msg ? decryptContactMessage(msg) : undefined;
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

  // ── Marketing pages (custom DB-backed pages) ─────────────────────────────
  async listMarketingPages(): Promise<MarketingPage[]> {
    return db.select().from(marketingPages).orderBy(marketingPages.sortOrder, marketingPages.slug);
  }

  async getMarketingPage(slug: string): Promise<MarketingPage | null> {
    const [row] = await db.select().from(marketingPages).where(eq(marketingPages.slug, slug));
    return row ?? null;
  }

  async createMarketingPage(data: InsertMarketingPage): Promise<MarketingPage> {
    const [row] = await db
      .insert(marketingPages)
      .values({ ...data, updatedAt: new Date() })
      .returning();
    return row;
  }

  async updateMarketingPage(
    slug: string,
    patch: Partial<InsertMarketingPage>,
  ): Promise<MarketingPage | null> {
    const [row] = await db
      .update(marketingPages)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(marketingPages.slug, slug))
      .returning();
    return row ?? null;
  }

  async deleteMarketingPage(slug: string): Promise<boolean> {
    const result = await db.delete(marketingPages).where(eq(marketingPages.slug, slug)).returning();
    return result.length > 0;
  }

  async getBannerImages(page?: string): Promise<BannerImage[]> {
    if (page === "home") {
      return db.select().from(bannerImages).where(and(eq(bannerImages.active, true), eq(bannerImages.showOnHome, true))).orderBy(bannerImages.sortOrder);
    }
    if (page === "order") {
      return db.select().from(bannerImages).where(and(eq(bannerImages.active, true), eq(bannerImages.showOnOrder, true))).orderBy(bannerImages.sortOrder);
    }
    if (page === "events") {
      return db.select().from(bannerImages).where(and(eq(bannerImages.active, true), eq(bannerImages.showOnEvents, true))).orderBy(bannerImages.sortOrder);
    }
    return db.select().from(bannerImages).where(eq(bannerImages.active, true)).orderBy(bannerImages.sortOrder);
  }

  async getAllBannerImages(): Promise<BannerImage[]> {
    return db.select().from(bannerImages).orderBy(bannerImages.sortOrder);
  }

  async getBannerImageById(id: number): Promise<BannerImage | undefined> {
    const [row] = await db.select().from(bannerImages).where(eq(bannerImages.id, id));
    return row;
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

  // ── Square deal display preferences ──
  // These rows are keyed by Square discount IDs and only exist as a curation
  // layer over the live deals returned from Square. Missing prefs default to
  // visible + sortOrder=0 so new deals don't disappear silently.
  async getDealPreferences(): Promise<DealPreference[]> {
    return db.select().from(dealPreferences);
  }

  async upsertDealPreference(squareDiscountId: string, patch: { hidden?: boolean; sortOrder?: number }): Promise<DealPreference> {
    // Single-statement upsert keyed on the unique squareDiscountId column so
    // two concurrent toggles for the same deal can't race past a SELECT and
    // both try to INSERT (which would 500 on the unique violation).
    const setOnConflict: { hidden?: boolean; sortOrder?: number; updatedAt: Date } = { updatedAt: new Date() };
    if (patch.hidden !== undefined) setOnConflict.hidden = patch.hidden;
    if (patch.sortOrder !== undefined) setOnConflict.sortOrder = patch.sortOrder;
    const [row] = await db.insert(dealPreferences)
      .values({
        squareDiscountId,
        hidden: patch.hidden ?? false,
        sortOrder: patch.sortOrder ?? 0,
      })
      .onConflictDoUpdate({
        target: dealPreferences.squareDiscountId,
        set: setOnConflict,
      })
      .returning();
    return row;
  }

  // Atomic bulk reorder of deals. Accepts the desired final order as an array
  // of Square discount IDs (position 0 is shown first). Upserts each one's
  // sortOrder inside a single transaction so the home strip never sees a
  // partially-shuffled state. Hidden flags are preserved on existing rows.
  async reorderDealPreferences(orderedSquareDiscountIds: string[]): Promise<DealPreference[]> {
    const seen = new Set<string>();
    const dedup: string[] = [];
    for (const id of orderedSquareDiscountIds) {
      if (typeof id === "string" && id && !seen.has(id)) {
        seen.add(id);
        dedup.push(id);
      }
    }
    await db.transaction(async (tx) => {
      for (let i = 0; i < dedup.length; i++) {
        const sid = dedup[i];
        const existing = await tx.select().from(dealPreferences).where(eq(dealPreferences.squareDiscountId, sid)).limit(1);
        if (existing.length) {
          await tx.update(dealPreferences)
            .set({ sortOrder: i, updatedAt: new Date() })
            .where(eq(dealPreferences.squareDiscountId, sid));
        } else {
          await tx.insert(dealPreferences).values({ squareDiscountId: sid, hidden: false, sortOrder: i });
        }
      }
    });
    return db.select().from(dealPreferences);
  }

  // Atomic bulk reorder. Accepts the desired final order as an array of banner
  // ids (position 0 is shown first). Updates every row's sortOrder in a single
  // transaction so the home-screen banner strip is never observed in a
  // partially-updated state. Ids that don't currently exist are silently
  // ignored. Returns the freshly-ordered list of all banners.
  async reorderBannerImages(orderedIds: number[]): Promise<BannerImage[]> {
    const seen = new Set<number>();
    const dedup: number[] = [];
    for (const id of orderedIds) {
      if (Number.isFinite(id) && !seen.has(id)) {
        seen.add(id);
        dedup.push(Number(id));
      }
    }
    await db.transaction(async (tx) => {
      for (let i = 0; i < dedup.length; i++) {
        await tx.update(bannerImages).set({ sortOrder: i }).where(eq(bannerImages.id, dedup[i]));
      }
    });
    return db.select().from(bannerImages).orderBy(bannerImages.sortOrder);
  }

  async createCustomer(email: string, name: string, phone: string | null, passwordHash: string, opts?: { emailVerifyTokenHash?: string; emailVerifyTokenExpiresAt?: Date; dateOfBirth?: string | null }): Promise<Customer> {
    const normalised = email.toLowerCase().trim();
    const [customer] = await db.insert(customers).values({
      email: encrypt(normalised),
      emailHash: hashEmail(normalised),
      name: encrypt(name),
      phone: phone ? encrypt(phone) : null,
      passwordHash,
      privacyConsentAt: new Date(),
      // Encrypt DOB at rest to match updateCustomer's behaviour. The
       // decryptCustomer wrapper used by every read path will decrypt it
       // back to canonical YYYY-MM-DD on the way out.
      dateOfBirth: opts?.dateOfBirth ? encrypt(opts.dateOfBirth) : null,
      emailVerifyTokenHash: opts?.emailVerifyTokenHash ?? null,
      emailVerifyTokenExpiresAt: opts?.emailVerifyTokenExpiresAt ?? null,
      emailVerifyLastSentAt: opts?.emailVerifyTokenHash ? new Date() : null,
    }).returning();
    return decryptCustomer(customer);
  }

  async setEmailVerificationToken(id: number, tokenHash: string, expiresAt: Date): Promise<void> {
    await db.update(customers).set({
      emailVerifyTokenHash: tokenHash,
      emailVerifyTokenExpiresAt: expiresAt,
      emailVerifyLastSentAt: new Date(),
    }).where(eq(customers.id, id));
  }

  async getCustomerByVerifyTokenHash(tokenHash: string): Promise<Customer | undefined> {
    const [row] = await db.select().from(customers).where(eq(customers.emailVerifyTokenHash, tokenHash));
    return row ? decryptCustomer(row) : undefined;
  }

  async markEmailVerified(id: number): Promise<void> {
    await db.update(customers).set({
      emailVerified: true,
      emailVerifyTokenHash: null,
      emailVerifyTokenExpiresAt: null,
    }).where(eq(customers.id, id));
  }

  async setPasswordResetToken(id: number, tokenHash: string, expiresAt: Date): Promise<void> {
    await db.update(customers).set({
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: expiresAt,
      passwordResetLastSentAt: new Date(),
    }).where(eq(customers.id, id));
  }

  async getCustomerByPasswordResetTokenHash(tokenHash: string): Promise<Customer | undefined> {
    const [row] = await db.select().from(customers).where(eq(customers.passwordResetTokenHash, tokenHash));
    return row ? decryptCustomer(row) : undefined;
  }

  async setCustomerPassword(id: number, passwordHash: string): Promise<void> {
    await db.update(customers).set({
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
    }).where(eq(customers.id, id));
    // Invalidate all existing sessions for this customer
    await db.update(customerSessions).set({ active: false }).where(eq(customerSessions.customerId, id));
  }

  async getCustomerByEmail(email: string): Promise<Customer | undefined> {
    const hash = hashEmail(email.toLowerCase().trim());
    // Try hash-based lookup (encrypted records)
    const [byHash] = await db.select().from(customers).where(eq(customers.emailHash, hash));
    if (byHash) return decryptCustomer(byHash);
    // Fallback: plaintext lookup for legacy unencrypted records
    const [byPlain] = await db.select().from(customers).where(eq(customers.email, email.toLowerCase().trim()));
    return byPlain ? decryptCustomer(byPlain) : undefined;
  }

  async getCustomerById(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer ? decryptCustomer(customer) : undefined;
  }

  async getAllCustomers(): Promise<Customer[]> {
    const rows = await db.select().from(customers).orderBy(customers.id);
    return rows.map(decryptCustomer);
  }

  async updateCustomer(id: number, data: Partial<{ name: string; phone: string; dateOfBirth: string | null }>): Promise<Customer | undefined> {
    const encData: Record<string, string | null> = {};
    if (data.name) encData.name = encrypt(data.name);
    if (data.phone) encData.phone = encrypt(data.phone);
    // dateOfBirth: null = clear, string = encrypt and store, undefined = leave alone
    if (data.dateOfBirth === null) encData.dateOfBirth = null;
    else if (typeof data.dateOfBirth === "string") encData.dateOfBirth = encrypt(data.dateOfBirth);
    const [updated] = await db.update(customers).set(encData).where(eq(customers.id, id)).returning();
    return updated ? decryptCustomer(updated) : undefined;
  }

  // Cache the customer's Square Loyalty account ID locally so subsequent
  // requests don't need to search Square by phone number every time. Plain
  // text — Square's account IDs are non-secret identifiers.
  async setSquareLoyaltyAccountId(id: number, accountId: string | null): Promise<void> {
    await db.update(customers).set({ squareLoyaltyAccountId: accountId }).where(eq(customers.id, id));
  }

  // Track which calendar year we last awarded the birthday bonus to a
  // customer. Used by /api/loyalty/me to ensure the bonus is granted once
  // per year per customer regardless of how often the endpoint is called.
  async setLastBirthdayBonusYear(id: number, year: number): Promise<void> {
    await db.update(customers).set({ lastBirthdayBonusYear: year }).where(eq(customers.id, id));
  }

  async setLastBirthdayPushYear(id: number, year: number): Promise<void> {
    await db.update(customers).set({ lastBirthdayPushYear: year }).where(eq(customers.id, id));
  }

  // Reverse lookup used by Square loyalty webhooks: given a Square loyalty
  // account ID, find the local customer so we can route the push notification.
  async getCustomerBySquareLoyaltyAccountId(accountId: string): Promise<Customer | undefined> {
    if (!accountId) return undefined;
    const [row] = await db
      .select()
      .from(customers)
      .where(eq(customers.squareLoyaltyAccountId, accountId))
      .limit(1);
    return row ? decryptCustomer(row) : undefined;
  }

  // Find every customer whose birthday MM-DD matches the supplied string and
  // who hasn't already been pushed this year. DOBs are encrypted, so this
  // does a full scan + in-memory filter — fine for a venue customer base in
  // the low thousands. Caller is the daily birthday-push scheduler.
  async getCustomersInBirthdayWindow(year: number, monthDay: string): Promise<Customer[]> {
    // Mirror the Feb-29 → Feb-28 fallback that birthdayWindowForYear() in
    // routes.ts uses, so leap-day customers still receive their birthday
    // push in non-leap years (on Feb 28). We detect the non-leap-year
    // condition by checking whether Feb 29 of `year` actually exists.
    const isLeap = new Date(year, 1, 29).getMonth() === 1;
    const all = await db.select().from(customers);
    const out: Customer[] = [];
    for (const row of all) {
      const decrypted = decryptCustomer(row);
      if (!decrypted.dateOfBirth) continue;
      let md = decrypted.dateOfBirth.slice(5); // "YYYY-MM-DD" → "MM-DD"
      if (md === "02-29" && !isLeap) md = "02-28";
      if (md !== monthDay) continue;
      if ((decrypted.lastBirthdayPushYear ?? 0) >= year) continue;
      out.push(decrypted);
    }
    return out;
  }

  // Every enrolled-in-loyalty customer (we have a Square account ID for them).
  // Used by the double-points-day broadcast push.
  async getCustomersWithLoyaltyAccount(): Promise<Customer[]> {
    const rows = await db
      .select()
      .from(customers)
      .where(isNotNull(customers.squareLoyaltyAccountId));
    return rows.map(decryptCustomer);
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
          snookerUnlimited: data.snookerUnlimited ?? false,
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
      const [rawCustomer] = await db.select().from(customers).where(eq(customers.id, sub.customerId));
      const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, sub.planId));
      let customer: Customer | null = null;
      if (rawCustomer) {
        try {
          customer = decryptCustomer(rawCustomer);
        } catch {
          customer = rawCustomer;
        }
      }
      return { ...sub, customer, plan: plan || null };
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

  // Pending memberships that need a payment reminder email.
  // Returns subs that have been pending >= remindAfterHours and have not yet had a reminder sent.
  async getPendingMembershipsNeedingReminder(remindAfterHours: number): Promise<(MembershipSubscription & { customer: Customer | null; plan: MembershipPlan | null })[]> {
    const cutoff = new Date(Date.now() - remindAfterHours * 60 * 60 * 1000);
    const rows = await db.select().from(membershipSubscriptions)
      .where(and(
        eq(membershipSubscriptions.status, "pending"),
        isNull(membershipSubscriptions.paymentReminderSentAt),
        lte(membershipSubscriptions.createdAt, cutoff),
      ));
    const out: (MembershipSubscription & { customer: Customer | null; plan: MembershipPlan | null })[] = [];
    for (const sub of rows) {
      const [customer] = await db.select().from(customers).where(eq(customers.id, sub.customerId));
      const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, sub.planId));
      out.push({ ...sub, customer: customer ?? null, plan: plan ?? null });
    }
    return out;
  }

  // Pending memberships old enough to auto-cancel (payment never completed).
  async getPendingMembershipsToAutoCancel(maxAgeHours: number): Promise<(MembershipSubscription & { customer: Customer | null; plan: MembershipPlan | null })[]> {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    const rows = await db.select().from(membershipSubscriptions)
      .where(and(
        eq(membershipSubscriptions.status, "pending"),
        lte(membershipSubscriptions.createdAt, cutoff),
      ));
    const out: (MembershipSubscription & { customer: Customer | null; plan: MembershipPlan | null })[] = [];
    for (const sub of rows) {
      const [customer] = await db.select().from(customers).where(eq(customers.id, sub.customerId));
      const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, sub.planId));
      out.push({ ...sub, customer: customer ?? null, plan: plan ?? null });
    }
    return out;
  }

  async markMembershipReminderSent(id: number): Promise<void> {
    await db.update(membershipSubscriptions)
      .set({ paymentReminderSentAt: new Date() } as any)
      .where(eq(membershipSubscriptions.id, id));
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

  async upsertCategorySettings(settings: { categoryId: string; displayOrder?: number; mergedIntoId?: string | null; parentCategoryId?: string | null; displayName?: string | null; imageUrl?: string | null; updatedBy: string }[]): Promise<void> {
    for (const s of settings) {
      await db.insert(categorySettings)
        .values({
          categoryId: s.categoryId,
          displayOrder: s.displayOrder ?? 99,
          mergedIntoId: s.mergedIntoId ?? null,
          parentCategoryId: s.parentCategoryId ?? null,
          displayName: s.displayName ?? null,
          imageUrl: s.imageUrl ?? null,
          updatedBy: s.updatedBy,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: categorySettings.categoryId,
          set: {
            ...(s.displayOrder !== undefined ? { displayOrder: s.displayOrder } : {}),
            ...(s.mergedIntoId !== undefined ? { mergedIntoId: s.mergedIntoId } : {}),
            ...(s.parentCategoryId !== undefined ? { parentCategoryId: s.parentCategoryId } : {}),
            ...(s.displayName !== undefined ? { displayName: s.displayName } : {}),
            updatedBy: s.updatedBy,
            updatedAt: new Date(),
          },
        });
    }
  }

  async updateCategoryImage(categoryId: string, imageUrl: string | null, updatedBy: string): Promise<void> {
    await db.insert(categorySettings)
      .values({
        categoryId,
        displayOrder: 99,
        mergedIntoId: null,
        displayName: null,
        imageUrl,
        updatedBy,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: categorySettings.categoryId,
        set: { imageUrl, updatedBy, updatedAt: new Date() },
      });
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

  // Pre-allocate the next app_orders.id WITHOUT inserting a row, so we can
  // pass it to Square as the KDS ticket name (e.g. "Collection #1234") before
  // the order is actually created. The reserved id is then used in the
  // subsequent createAppOrder() call so the row matches what the kitchen sees.
  async reserveAppOrderId(): Promise<number> {
    const rows: any = await db.execute(sql`SELECT nextval('app_orders_id_seq') AS id`);
    const raw = rows.rows?.[0]?.id ?? rows[0]?.id;
    return Number(raw);
  }

  async createAppOrder(data: {
    id?: number;
    squareLinkId?: string;
    squareOrderId?: string;
    tableNote?: string;
    customerName?: string;
    customerEmail?: string;
    itemsJson: string;
    totalPence: number;
    discountPercent?: number;
    discountLabel?: string;
    confirmationToken?: string;
    pushToken?: string;
  }): Promise<{ id: number }> {
    const rows = await db.insert(appOrders).values({
      ...(data.id !== undefined ? { id: data.id } : {}),
      squareLinkId: data.squareLinkId ?? null,
      squareOrderId: data.squareOrderId ?? null,
      squarePaymentId: null,
      tableNote: data.tableNote ?? null,
      customerName: data.customerName ? encrypt(data.customerName) : null,
      customerEmail: data.customerEmail ? encrypt(data.customerEmail) : null,
      customerEmailHash: data.customerEmail ? hashEmail(data.customerEmail) : null,
      itemsJson: data.itemsJson,
      totalPence: data.totalPence,
      discountPercent: data.discountPercent ?? null,
      discountLabel: data.discountLabel ?? null,
      status: "pending",
      confirmationToken: data.confirmationToken ?? null,
      pushToken: data.pushToken ?? null,
    }).returning({ id: appOrders.id });
    return { id: rows[0].id };
  }

  async getRecentAppOrders(limit = 100): Promise<AppOrder[]> {
    const rows = await db.select().from(appOrders).orderBy(desc(appOrders.createdAt)).limit(limit);
    return rows.map(decryptAppOrder);
  }

  async getAppOrder(id: number): Promise<AppOrder | null> {
    const rows = await db.select().from(appOrders).where(eq(appOrders.id, id));
    return rows[0] ? decryptAppOrder(rows[0]) : null;
  }

  async getOrderBySquareOrderId(squareOrderId: string): Promise<AppOrder | null> {
    const rows = await db.select().from(appOrders).where(eq(appOrders.squareOrderId, squareOrderId));
    return rows[0] ? decryptAppOrder(rows[0]) : null;
  }

  async updateAppOrderPaid(squareOrderId: string, squarePaymentId: string): Promise<boolean> {
    // Atomically transition pending → paid. Returns true only on first
    // successful transition. This is the safety net for two races:
    //   (1) The expireStaleOrders job marks an order 'expired' just before a
    //       Square webhook for the same order arrives. Without the status
    //       guard, the webhook would silently flip 'expired' back to 'paid'.
    //   (2) Two webhooks (payment.created and payment.updated) racing to
    //       process the same payment — only the first writes succeed; the
    //       second is a no-op and any side-effects (audit log, push) won't
    //       fire twice.
    const result = await db.update(appOrders)
      .set({ status: "paid", squarePaymentId })
      .where(and(
        eq(appOrders.squareOrderId, squareOrderId),
        eq(appOrders.status, "pending"),
      ));
    return ((result as any).rowCount ?? 0) > 0;
  }

  async updateAppOrderStatus(id: number, status: string): Promise<void> {
    await db.update(appOrders).set({ status }).where(eq(appOrders.id, id));
  }

  async getCustomerOrders(email: string): Promise<AppOrder[]> {
    const emailHash = hashEmail(email);
    // Try hash-based lookup (encrypted records)
    const byHash = await db.select().from(appOrders)
      .where(and(
        eq(appOrders.customerEmailHash, emailHash),
        sql`${appOrders.status} != 'expired'`
      ))
      .orderBy(desc(appOrders.createdAt))
      .limit(50);
    if (byHash.length > 0) return byHash.map(decryptAppOrder);
    // Fallback: plaintext lookup for legacy records
    const byPlain = await db.select().from(appOrders)
      .where(and(
        eq(appOrders.customerEmail, email),
        sql`${appOrders.status} != 'expired'`
      ))
      .orderBy(desc(appOrders.createdAt))
      .limit(50);
    return byPlain.map(decryptAppOrder);
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

  // ── Password reset audit ──────────────────────────────────────────────────
  async logPasswordResetAttempt(data: {
    staffUsername: string;
    customerId?: number | null;
    customerEmail?: string | null;
    customerName?: string | null;
    outcome: string;
  }): Promise<void> {
    await db.insert(passwordResetAuditLog).values({
      staffUsername: data.staffUsername,
      customerId: data.customerId ?? null,
      customerEmail: data.customerEmail ? encrypt(data.customerEmail) : null,
      customerName: data.customerName ? encrypt(data.customerName) : null,
      outcome: data.outcome,
    });
  }

  async listPasswordResetAuditLog(limit = 50): Promise<PasswordResetAuditEntry[]> {
    const rows = await db.select().from(passwordResetAuditLog)
      .orderBy(desc(passwordResetAuditLog.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      ...r,
      customerEmail: r.customerEmail ? decrypt(r.customerEmail) : null,
      customerName: r.customerName ? decrypt(r.customerName) : null,
    }));
  }

  // ── Membership audit log ──────────────────────────────────────────────────
  async logMembershipAction(data: {
    subscriptionId?: number | null;
    customerId?: number | null;
    action: string;
    staffUsername: string;
    amountPence?: number | null;
    refundId?: string | null;
    note?: string | null;
  }): Promise<void> {
    await db.insert(membershipAuditLog).values({
      subscriptionId: data.subscriptionId ?? null,
      customerId: data.customerId ?? null,
      action: data.action,
      staffUsername: data.staffUsername,
      amountPence: data.amountPence ?? null,
      refundId: data.refundId ?? null,
      note: data.note ?? null,
    });
  }

  async listMembershipAuditLogForSubscription(subscriptionId: number, limit = 100): Promise<MembershipAuditEntry[]> {
    return db.select().from(membershipAuditLog)
      .where(eq(membershipAuditLog.subscriptionId, subscriptionId))
      .orderBy(desc(membershipAuditLog.createdAt))
      .limit(limit);
  }

  // ── Booking audit log ─────────────────────────────────────────────────────
  // Never throws — audit logging must not break the request that triggered it.
  // Errors are logged and swallowed so the booking action still succeeds.
  async logBookingAction(data: {
    bookingId: number;
    action: string;
    staffUsername: string;
    staffId?: number | null;
    fromValue?: unknown;
    toValue?: unknown;
    note?: string | null;
  }): Promise<void> {
    try {
      await db.insert(bookingAuditLog).values({
        bookingId: data.bookingId,
        action: data.action,
        staffUsername: data.staffUsername,
        staffId: data.staffId ?? null,
        fromValue: data.fromValue !== undefined ? JSON.stringify(data.fromValue) : null,
        toValue: data.toValue !== undefined ? JSON.stringify(data.toValue) : null,
        note: data.note ?? null,
      });
    } catch (err) {
      console.error("[booking-audit] logBookingAction failed:", err);
    }
  }

  async listBookingAuditLogForBooking(bookingId: number, limit = 100): Promise<BookingAuditEntry[]> {
    return db.select().from(bookingAuditLog)
      .where(eq(bookingAuditLog.bookingId, bookingId))
      .orderBy(desc(bookingAuditLog.createdAt))
      .limit(limit);
  }

  async listRecentBookingAuditLog(limit = 100): Promise<BookingAuditEntry[]> {
    return db.select().from(bookingAuditLog)
      .orderBy(desc(bookingAuditLog.createdAt))
      .limit(limit);
  }

  // ── Generic staff action log ──────────────────────────────────────────────
  // Never throws — audit logging must not break the request that triggered it.
  async logStaffAction(data: {
    staffUsername: string;
    staffId?: number | null;
    staffRole: string;
    method: string;
    path: string;
    route?: string | null;
    statusCode: number;
    requestBody?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    try {
      await db.insert(staffActionLog).values({
        staffUsername: data.staffUsername,
        staffId: data.staffId ?? null,
        staffRole: data.staffRole,
        method: data.method,
        path: data.path,
        route: data.route ?? null,
        statusCode: data.statusCode,
        requestBody: data.requestBody ?? null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
      });
    } catch (err) {
      console.error("[staff-audit] logStaffAction failed:", err);
    }
  }

  async listRecentStaffActions(limit = 200): Promise<StaffActionEntry[]> {
    return db.select().from(staffActionLog)
      .orderBy(desc(staffActionLog.createdAt))
      .limit(limit);
  }

  async listStaffActionsByUsername(username: string, limit = 200): Promise<StaffActionEntry[]> {
    return db.select().from(staffActionLog)
      .where(eq(staffActionLog.staffUsername, username))
      .orderBy(desc(staffActionLog.createdAt))
      .limit(limit);
  }

  // ══════════════════════════════════════════════════════════════════
  // STAFF HR — TIME ENTRIES
  // ══════════════════════════════════════════════════════════════════

  async getActiveClockEntry(staffId: number): Promise<StaffTimeEntry | null> {
    const [entry] = await db.select().from(staffTimeEntries)
      .where(and(eq(staffTimeEntries.staffId, staffId), eq(staffTimeEntries.status, "active")))
      .orderBy(desc(staffTimeEntries.clockedInAt))
      .limit(1);
    return entry ?? null;
  }

  async clockIn(
    staffId: number,
    lat?: string,
    lng?: string,
    audit?: { geofenceEnforced?: boolean; flags?: string[]; clientIp?: string; userAgent?: string; needsManagerReview?: boolean },
  ): Promise<StaffTimeEntry> {
    const [entry] = await db.insert(staffTimeEntries).values({
      staffId, clockedInAt: new Date(), status: "active",
      clockInLat: lat ? encrypt(lat) : null,
      clockInLng: lng ? encrypt(lng) : null,
      geofenceEnforced: audit?.geofenceEnforced ?? false,
      clockInFlags: audit?.flags && audit.flags.length ? audit.flags.join(",") : null,
      clientIp: audit?.clientIp ?? null,
      userAgent: audit?.userAgent ?? null,
      // Entries with unverified client-supplied location require a manager
      // to explicitly approve them before they are treated as authoritative
      // attendance records for payroll or HR reporting purposes.
      needsManagerReview: audit?.needsManagerReview ?? false,
    }).returning();
    return decryptTimeEntry(entry);
  }

  async clockOut(
    entryId: number,
    lat?: string,
    lng?: string,
    audit?: { geofenceEnforced?: boolean; flags?: string[]; needsManagerReview?: boolean },
  ): Promise<StaffTimeEntry | null> {
    // Atomic clock-out:
    //   • The WHERE clause includes status='active' so two concurrent
    //     clock-out requests can't both succeed — the second update finds
    //     no matching row and returns nothing.
    //   • geofenceEnforced is AND'd so it is only true when BOTH halves
    //     of the shift were independently verified (which currently never
    //     happens with client-supplied coordinates — see routes.ts).
    //   • needsManagerReview is OR'd: once flagged at clock-in it stays
    //     flagged regardless of the clock-out audit value.
    const newEnforced = audit?.geofenceEnforced ?? false;
    const newReview = audit?.needsManagerReview ?? false;
    const [entry] = await db.update(staffTimeEntries)
      .set({ clockedOutAt: new Date(), status: "completed",
        clockOutLat: lat ? encrypt(lat) : null,
        clockOutLng: lng ? encrypt(lng) : null,
        geofenceEnforced: sql`${staffTimeEntries.geofenceEnforced} AND ${newEnforced}`,
        clockOutFlags: audit?.flags && audit.flags.length ? audit.flags.join(",") : null,
        needsManagerReview: sql`${staffTimeEntries.needsManagerReview} OR ${newReview}`,
      })
      .where(and(eq(staffTimeEntries.id, entryId), eq(staffTimeEntries.status, "active")))
      .returning();
    return entry ? decryptTimeEntry(entry) : null;
  }

  async reviewTimeEntry(id: number, reviewedBy: number): Promise<StaffTimeEntry | null> {
    const [entry] = await db.update(staffTimeEntries)
      .set({ needsManagerReview: false, managerReviewedAt: new Date(), managerReviewedBy: reviewedBy })
      .where(eq(staffTimeEntries.id, id))
      .returning();
    return entry ? decryptTimeEntry(entry) : null;
  }

  async getTimeEntriesForStaff(staffId: number, limit = 50): Promise<StaffTimeEntry[]> {
    const rows = await db.select().from(staffTimeEntries)
      .where(eq(staffTimeEntries.staffId, staffId))
      .orderBy(desc(staffTimeEntries.clockedInAt))
      .limit(limit);
    return rows.map(decryptTimeEntry);
  }

  async getAllTimeEntries(limit = 200): Promise<StaffTimeEntry[]> {
    const rows = await db.select().from(staffTimeEntries)
      .orderBy(desc(staffTimeEntries.clockedInAt))
      .limit(limit);
    return rows.map(decryptTimeEntry);
  }

  async amendTimeEntry(id: number, amendedBy: number, reason: string, updates: Partial<Pick<StaffTimeEntry, "clockedInAt" | "clockedOutAt">>): Promise<StaffTimeEntry | null> {
    const [entry] = await db.update(staffTimeEntries)
      .set({ ...updates, status: "amended", amendedBy, amendedAt: new Date(), amendReason: reason })
      .where(eq(staffTimeEntries.id, id))
      .returning();
    return entry ?? null;
  }

  // ══════════════════════════════════════════════════════════════════
  // STAFF HR — LEAVE REQUESTS
  // ══════════════════════════════════════════════════════════════════

  async createLeaveRequest(data: { staffId: number; leaveType: string; startDate: string; endDate: string; totalDays: string; reason?: string }): Promise<StaffLeaveRequest> {
    const [req] = await db.insert(staffLeaveRequests).values({
      ...data, status: "pending",
      reason: data.reason ? encrypt(data.reason) : null,
    }).returning();
    return decryptLeaveRequest(req);
  }

  async getLeaveRequestsForStaff(staffId: number): Promise<StaffLeaveRequest[]> {
    const rows = await db.select().from(staffLeaveRequests)
      .where(eq(staffLeaveRequests.staffId, staffId))
      .orderBy(desc(staffLeaveRequests.createdAt));
    return rows.map(decryptLeaveRequest);
  }

  async getAllLeaveRequests(): Promise<StaffLeaveRequest[]> {
    const rows = await db.select().from(staffLeaveRequests)
      .orderBy(desc(staffLeaveRequests.createdAt));
    return rows.map(decryptLeaveRequest);
  }

  async reviewLeaveRequest(id: number, reviewedBy: number, status: "approved" | "rejected", reviewNotes?: string): Promise<StaffLeaveRequest | null> {
    const [req] = await db.update(staffLeaveRequests)
      .set({ status, reviewedBy, reviewedAt: new Date(),
        reviewNotes: reviewNotes ? encrypt(reviewNotes) : null })
      .where(eq(staffLeaveRequests.id, id))
      .returning();
    return req ? decryptLeaveRequest(req) : null;
  }

  // ══════════════════════════════════════════════════════════════════
  // STAFF HR — LEAVE ALLOWANCES
  // ══════════════════════════════════════════════════════════════════

  async getLeaveAllowance(staffId: number, year: number): Promise<StaffLeaveAllowance | null> {
    const [row] = await db.select().from(staffLeaveAllowances)
      .where(and(eq(staffLeaveAllowances.staffId, staffId), eq(staffLeaveAllowances.year, year)));
    return row ?? null;
  }

  async upsertLeaveAllowance(staffId: number, year: number, totalDays: string, carryOver: string, leaveYearStart?: string, maxCarryOverDays?: string): Promise<StaffLeaveAllowance> {
    const existing = await this.getLeaveAllowance(staffId, year);
    const updateFields: Record<string, any> = { totalDays, carryOver };
    if (leaveYearStart !== undefined) updateFields.leaveYearStart = leaveYearStart;
    if (maxCarryOverDays !== undefined) updateFields.maxCarryOverDays = maxCarryOverDays;
    if (existing) {
      const [row] = await db.update(staffLeaveAllowances)
        .set(updateFields)
        .where(eq(staffLeaveAllowances.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(staffLeaveAllowances).values({
      staffId, year, totalDays, carryOver,
      leaveYearStart: leaveYearStart ?? "01-01",
      maxCarryOverDays: maxCarryOverDays ?? "8",
    }).returning();
    return row;
  }

  async getAllLeaveAllowances(year: number): Promise<StaffLeaveAllowance[]> {
    return db.select().from(staffLeaveAllowances).where(eq(staffLeaveAllowances.year, year));
  }

  async updateStaffEmployment(staffId: number, contractedDaysPerWeek: string, employmentStartDate: string | null): Promise<StaffUser | undefined> {
    const [row] = await db.update(staffUsers)
      .set({ contractedDaysPerWeek, employmentStartDate: employmentStartDate || null })
      .where(eq(staffUsers.id, staffId))
      .returning();
    return row;
  }

  // ══════════════════════════════════════════════════════════════════
  // STAFF HR — INCIDENT REPORTS
  // ══════════════════════════════════════════════════════════════════

  async createIncident(data: Omit<typeof staffIncidents.$inferInsert, "id" | "createdAt">): Promise<StaffIncident> {
    const encrypted = { ...data, description: data.description ? encrypt(data.description) : data.description };
    const [incident] = await db.insert(staffIncidents).values(encrypted).returning();
    return decryptIncident(incident);
  }

  async getIncidentsForStaff(staffId: number): Promise<StaffIncident[]> {
    const rows = await db.select().from(staffIncidents)
      .where(eq(staffIncidents.reportedBy, staffId))
      .orderBy(desc(staffIncidents.createdAt));
    return rows.map(decryptIncident);
  }

  async getAllIncidents(): Promise<StaffIncident[]> {
    const rows = await db.select().from(staffIncidents).orderBy(desc(staffIncidents.createdAt));
    return rows.map(decryptIncident);
  }

  async updateIncidentStatus(id: number, status: string, closedBy?: number): Promise<StaffIncident | null> {
    const [incident] = await db.update(staffIncidents)
      .set({ status, ...(status === "closed" ? { closedAt: new Date(), closedBy: closedBy ?? null } : {}) })
      .where(eq(staffIncidents.id, id))
      .returning();
    return incident ? decryptIncident(incident) : null;
  }

  // ══════════════════════════════════════════════════════════════════
  // STAFF ROTA
  // ══════════════════════════════════════════════════════════════════

  async getRotaShifts(weekStart: string): Promise<StaffRotaShift[]> {
    return db.select().from(staffRotaShifts)
      .where(eq(staffRotaShifts.weekStart, weekStart))
      .orderBy(staffRotaShifts.dayOfWeek, staffRotaShifts.shiftStart);
  }

  async getRotaShiftsForStaff(staffId: number, weekStart: string): Promise<StaffRotaShift[]> {
    return db.select().from(staffRotaShifts)
      .where(and(eq(staffRotaShifts.staffId, staffId), eq(staffRotaShifts.weekStart, weekStart)))
      .orderBy(staffRotaShifts.dayOfWeek, staffRotaShifts.shiftStart);
  }

  async upsertRotaShift(data: Omit<StaffRotaShift, 'id' | 'createdAt' | 'updatedAt'>, existingId?: number): Promise<StaffRotaShift> {
    if (existingId) {
      const [updated] = await db.update(staffRotaShifts)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(staffRotaShifts.id, existingId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(staffRotaShifts).values(data).returning();
    return created;
  }

  async deleteRotaShift(id: number): Promise<boolean> {
    const result = await db.delete(staffRotaShifts).where(eq(staffRotaShifts.id, id)).returning();
    return result.length > 0;
  }

  async publishRota(weekStart: string, publishedByUsername: string | null): Promise<StaffRotaPublished> {
    const [existing] = await db.select().from(staffRotaPublished).where(eq(staffRotaPublished.weekStart, weekStart));
    if (existing) {
      const [updated] = await db.update(staffRotaPublished)
        .set({ publishedAt: new Date(), publishedByUsername, notificationSent: false })
        .where(eq(staffRotaPublished.weekStart, weekStart))
        .returning();
      return updated;
    }
    const [created] = await db.insert(staffRotaPublished)
      .values({ weekStart, publishedByUsername, notificationSent: false, staffNotified: 0 })
      .returning();
    return created;
  }

  async getRotaPublished(weekStart: string): Promise<StaffRotaPublished | undefined> {
    const [row] = await db.select().from(staffRotaPublished).where(eq(staffRotaPublished.weekStart, weekStart));
    return row;
  }

  // ══════════════════════════════════════════════════════════════════
  // STAFF PUSH TOKENS
  // ══════════════════════════════════════════════════════════════════

  async upsertStaffPushToken(staffId: number, token: string): Promise<StaffPushToken> {
    const [existing] = await db.select().from(staffPushTokens).where(eq(staffPushTokens.token, token));
    if (existing) {
      const [updated] = await db.update(staffPushTokens)
        .set({ staffId, updatedAt: new Date() })
        .where(eq(staffPushTokens.token, token))
        .returning();
      return updated;
    }
    const [created] = await db.insert(staffPushTokens).values({ staffId, token }).returning();
    return created;
  }

  async getStaffPushTokens(staffIds: number[]): Promise<StaffPushToken[]> {
    if (!staffIds.length) return [];
    return db.select().from(staffPushTokens).where(inArray(staffPushTokens.staffId, staffIds));
  }

  async removeStaffPushToken(token: string): Promise<boolean> {
    const result = await db.delete(staffPushTokens).where(eq(staffPushTokens.token, token)).returning();
    return result.length > 0;
  }

  // ── Pay rate ────────────────────────────────────────────────────────────────

  async getStaffPay(staffId: number): Promise<{ payType: string; hourlyRate: string | null; annualSalary: string | null; weeklyHours: string } | null> {
    const [user] = await db.select({
      payType: staffUsers.payType,
      hourlyRate: staffUsers.hourlyRate,
      annualSalary: staffUsers.annualSalary,
      weeklyHours: staffUsers.weeklyHours,
    }).from(staffUsers).where(eq(staffUsers.id, staffId));
    if (!user) return null;
    return {
      payType: user.payType ?? "hourly",
      hourlyRate: user.hourlyRate ? decrypt(user.hourlyRate) : null,
      annualSalary: user.annualSalary ? decrypt(user.annualSalary) : null,
      weeklyHours: user.weeklyHours ?? "37.5",
    };
  }

  async updateStaffPay(staffId: number, data: { payType: string; hourlyRate?: string | null; annualSalary?: string | null; weeklyHours?: string }): Promise<void> {
    await db.update(staffUsers).set({
      payType: data.payType,
      hourlyRate: data.hourlyRate ? encrypt(data.hourlyRate) : null,
      annualSalary: data.annualSalary ? encrypt(data.annualSalary) : null,
      weeklyHours: data.weeklyHours ?? "37.5",
    }).where(eq(staffUsers.id, staffId));
  }

  // ── Document storage ────────────────────────────────────────────────────────

  async getDocumentsForStaff(staffId: number): Promise<Omit<StaffDocument, "fileData">[]> {
    const rows = await db.select({
      id: staffDocuments.id,
      staffId: staffDocuments.staffId,
      uploadedBy: staffDocuments.uploadedBy,
      category: staffDocuments.category,
      fileName: staffDocuments.fileName,
      fileType: staffDocuments.fileType,
      fileSizeBytes: staffDocuments.fileSizeBytes,
      notes: staffDocuments.notes,
      expiresAt: staffDocuments.expiresAt,
      createdAt: staffDocuments.createdAt,
    }).from(staffDocuments).where(eq(staffDocuments.staffId, staffId)).orderBy(desc(staffDocuments.createdAt));
    return rows.map(r => ({
      ...r,
      fileName: decrypt(r.fileName),
      notes: r.notes ? decrypt(r.notes) : null,
    }));
  }

  async getDocumentById(id: number): Promise<StaffDocument | null> {
    const [row] = await db.select().from(staffDocuments).where(eq(staffDocuments.id, id));
    if (!row) return null;
    return {
      ...row,
      fileData: decrypt(row.fileData),
      fileName: decrypt(row.fileName),
      notes: row.notes ? decrypt(row.notes) : null,
    };
  }

  async uploadDocument(data: {
    staffId: number;
    uploadedBy: number;
    category: string;
    fileName: string;
    fileType: string;
    fileData: string;
    fileSizeBytes: number;
    notes?: string;
    expiresAt?: string;
  }): Promise<StaffDocument> {
    const [doc] = await db.insert(staffDocuments).values({
      ...data,
      fileData: encrypt(data.fileData),          // AES-256-GCM encrypt file contents at rest
      fileName: encrypt(data.fileName),          // encrypt filename (may reveal identity)
      notes: data.notes ? encrypt(data.notes) : null,
    }).returning();
    // Return with decrypted values for immediate use
    return {
      ...doc,
      fileData: data.fileData,
      fileName: data.fileName,
      notes: data.notes ?? null,
    };
  }

  async deleteDocument(id: number): Promise<boolean> {
    const result = await db.delete(staffDocuments).where(eq(staffDocuments.id, id)).returning();
    return result.length > 0;
  }

  async getAllDocuments(): Promise<Omit<StaffDocument, "fileData">[]> {
    const rows = await db.select({
      id: staffDocuments.id,
      staffId: staffDocuments.staffId,
      uploadedBy: staffDocuments.uploadedBy,
      category: staffDocuments.category,
      fileName: staffDocuments.fileName,
      fileType: staffDocuments.fileType,
      fileSizeBytes: staffDocuments.fileSizeBytes,
      notes: staffDocuments.notes,
      expiresAt: staffDocuments.expiresAt,
      createdAt: staffDocuments.createdAt,
    }).from(staffDocuments).orderBy(desc(staffDocuments.createdAt));
    return rows.map(r => ({
      ...r,
      fileName: decrypt(r.fileName),
      notes: r.notes ? decrypt(r.notes) : null,
    }));
  }

  // ── Staff onboarding ────────────────────────────────────────────────────────

  private decryptOnboarding<T extends Partial<StaffOnboarding>>(row: T): T {
    const d = (v: string | null | undefined) => (v ? decrypt(v) : v);
    return {
      ...row,
      nationalInsurance: d(row.nationalInsurance) ?? null,
      bankAccountName: d(row.bankAccountName) ?? null,
      bankSortCode: d(row.bankSortCode) ?? null,
      bankAccountNumber: d(row.bankAccountNumber) ?? null,
    } as T;
  }

  async getOnboarding(staffId: number): Promise<StaffOnboarding | null> {
    const [row] = await db.select().from(staffOnboarding).where(eq(staffOnboarding.staffId, staffId));
    return row ? this.decryptOnboarding(row) : null;
  }

  async upsertOnboarding(staffId: number, data: Partial<StaffOnboarding>): Promise<StaffOnboarding> {
    const enc = (v: string | null | undefined) => (v ? encrypt(v) : null);
    const values: Partial<StaffOnboarding> = {
      ...data,
      staffId,
      nationalInsurance: enc(data.nationalInsurance) ?? undefined,
      bankAccountName: enc(data.bankAccountName) ?? undefined,
      bankSortCode: enc(data.bankSortCode) ?? undefined,
      bankAccountNumber: enc(data.bankAccountNumber) ?? undefined,
      updatedAt: new Date(),
    };
    const existing = await this.getOnboarding(staffId);
    if (existing) {
      const [updated] = await db.update(staffOnboarding)
        .set(values)
        .where(eq(staffOnboarding.staffId, staffId))
        .returning();
      return this.decryptOnboarding(updated);
    } else {
      const [created] = await db.insert(staffOnboarding)
        .values(values as typeof staffOnboarding.$inferInsert)
        .returning();
      return this.decryptOnboarding(created);
    }
  }

  async getAllOnboardingStatus(): Promise<{ staffId: number; completedAt: Date | null; updatedAt: Date }[]> {
    return db.select({
      staffId: staffOnboarding.staffId,
      completedAt: staffOnboarding.completedAt,
      updatedAt: staffOnboarding.updatedAt,
    }).from(staffOnboarding);
  }

  // ── Payment log ──────────────────────────────────────────────────────────────
  // Customer PII (name/email/phone) is encrypted at rest, matching the rest of the codebase.
  async createPaymentLog(data: InsertPaymentLog): Promise<PaymentLog> {
    const toStore: InsertPaymentLog = {
      ...data,
      customerName: data.customerName ? encrypt(data.customerName) : data.customerName,
      customerEmail: data.customerEmail ? encrypt(data.customerEmail) : data.customerEmail,
      customerPhone: data.customerPhone ? encrypt(data.customerPhone) : data.customerPhone,
    };
    const [row] = await db.insert(paymentLog).values(toStore).returning();
    return decryptPaymentLog(row);
  }

  async updatePaymentLog(id: number, patch: Partial<InsertPaymentLog>): Promise<PaymentLog | null> {
    const toStore: Partial<InsertPaymentLog> = { ...patch };
    if (patch.customerName !== undefined) toStore.customerName = patch.customerName ? encrypt(patch.customerName) : patch.customerName;
    if (patch.customerEmail !== undefined) toStore.customerEmail = patch.customerEmail ? encrypt(patch.customerEmail) : patch.customerEmail;
    if (patch.customerPhone !== undefined) toStore.customerPhone = patch.customerPhone ? encrypt(patch.customerPhone) : patch.customerPhone;
    const [row] = await db.update(paymentLog).set(toStore).where(eq(paymentLog.id, id)).returning();
    return row ? decryptPaymentLog(row) : null;
  }

  async listPaymentLogs(limit: number = 100): Promise<PaymentLog[]> {
    const rows = await db.select().from(paymentLog).orderBy(desc(paymentLog.createdAt)).limit(limit);
    return rows.map(decryptPaymentLog);
  }

  async getPaymentLogByIntent(intentId: string): Promise<PaymentLog | null> {
    const [row] = await db.select().from(paymentLog).where(eq(paymentLog.stripePaymentIntentId, intentId));
    return row ? decryptPaymentLog(row) : null;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Feature-flagged additions (May 2026 test version)
  // The methods below back the four feature flags defined in
  // shared/featureFlags.ts. Each one is a thin write wrapper — the public
  // read paths reuse the existing getCustomerById / getMenuItemOverrides
  // methods above so we don't fan out the encryption / decryption surface.
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Persist a single saved card on a customer (FEATURE_SAVED_CARDS). One card
   * per customer in the test version — calling this overwrites whatever was
   * there before (and the caller is responsible for first DELETEing the old
   * card on Square's side via Square's /v2/cards/{id}/disable). Caller must
   * have already created or looked up the Square Customer.
   */
  async setCustomerSavedCard(
    customerId: number,
    card: {
      squareCustomerId: string;
      squareCardId: string;
      brand: string | null;
      last4: string | null;
      expMonth: number | null;
      expYear: number | null;
    }
  ): Promise<void> {
    await db.update(customers).set({
      squareCustomerId: card.squareCustomerId,
      squareCardId: card.squareCardId,
      squareCardBrand: card.brand,
      squareCardLast4: card.last4,
      squareCardExpMonth: card.expMonth,
      squareCardExpYear: card.expYear,
    }).where(eq(customers.id, customerId));
  }

  /** Forget the saved card. squareCustomerId is preserved so a re-save
   *  doesn't have to re-create the Square Customer. */
  async clearCustomerSavedCard(customerId: number): Promise<void> {
    await db.update(customers).set({
      squareCardId: null,
      squareCardBrand: null,
      squareCardLast4: null,
      squareCardExpMonth: null,
      squareCardExpYear: null,
    }).where(eq(customers.id, customerId));
  }

  /** Update the dietary-preference filter on a customer (FEATURE_DIETARY_FILTERS).
   *  Pass null to clear. */
  async setCustomerDietaryFilters(customerId: number, filters: string | null): Promise<void> {
    await db.update(customers).set({ dietaryFilters: filters }).where(eq(customers.id, customerId));
  }

  /** Set / replace the dietary-tag string for a menu variation (FEATURE_DIETARY_FILTERS).
   *  Mirrors setMenuItemSoldOut / setMenuItemHidden — preserves the other
   *  override flags by reading the existing row first. Pass null/empty
   *  string to clear all tags. */
  async setMenuItemDietaryTags(
    variationId: string,
    itemId: string,
    name: string,
    dietaryTags: string | null,
    updatedBy: string
  ): Promise<void> {
    const existing = await db.select().from(menuItemOverrides).where(eq(menuItemOverrides.variationId, variationId));
    const currentSoldOut = existing[0]?.soldOut ?? false;
    const currentHidden = existing[0]?.hidden ?? false;
    const cleaned = dietaryTags && dietaryTags.trim() ? dietaryTags.trim() : null;
    await db.insert(menuItemOverrides)
      .values({ variationId, itemId, name, soldOut: currentSoldOut, hidden: currentHidden, dietaryTags: cleaned, updatedBy, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: menuItemOverrides.variationId,
        set: { itemId, name, dietaryTags: cleaned, updatedBy, updatedAt: new Date() },
      });
  }

  /**
   * Most recent paid app-order for a customer (FEATURE_PERSONALISED_HOME).
   * Used to power the "Reorder last round" home card. Hash-then-plaintext
   * lookup mirrors getCustomerOrders so legacy + encrypted records both
   * resolve. Returns null if the customer has never placed a paid order.
   */
  async getLastPaidAppOrderForCustomer(email: string): Promise<AppOrder | null> {
    const PAID_STATUSES = ["paid", "preparing", "ready", "delivered", "collected", "completed"];
    const emailHash = hashEmail(email);
    const byHash = await db.select().from(appOrders)
      .where(and(
        eq(appOrders.customerEmailHash, emailHash),
        inArray(appOrders.status, PAID_STATUSES)
      ))
      .orderBy(desc(appOrders.createdAt))
      .limit(1);
    if (byHash.length > 0) return decryptAppOrder(byHash[0]);
    const byPlain = await db.select().from(appOrders)
      .where(and(
        eq(appOrders.customerEmail, email),
        inArray(appOrders.status, PAID_STATUSES)
      ))
      .orderBy(desc(appOrders.createdAt))
      .limit(1);
    return byPlain.length > 0 ? decryptAppOrder(byPlain[0]) : null;
  }

}

export const storage = new DatabaseStorage();
