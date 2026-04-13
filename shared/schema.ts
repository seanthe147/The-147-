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
  role: text("role").notNull().default("staff"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  active: boolean("active").notNull().default(true),
  approvalStatus: text("approval_status").notNull().default("approved"),
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
  active: boolean("active").notNull().default(true),
});

export const insertOfferSchema = createInsertSchema(offers).omit({ id: true });

export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offers.$inferSelect;

export const pushTokens = pgTable("push_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  deviceName: text("device_name"),
  customerEmail: text("customer_email"),
  platform: text("platform"),
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
  recipientCount: integer("recipient_count").notNull().default(0),
  sentBy: text("sent_by"),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBookingSchema = createInsertSchema(bookings)
  .omit({ id: true, createdAt: true })
  .extend({
    tableNumber: z.string().nullable().optional(),
    guestCount: z.number().int().nullable().optional(),
    notes: z.string().nullable().optional(),
    emailHash: z.string().nullable().optional(),
  });

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
  gdprConsent: boolean("gdpr_consent").notNull().default(false),
  pushToken: text("push_token"),
  staffReply: text("staff_reply"),
  repliedAt: timestamp("replied_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContactMessageSchema = createInsertSchema(contactMessages).omit({ id: true, createdAt: true, status: true });

export const events = pgTable("events", {
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true });

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type InsertContactMessage = z.infer<typeof insertContactMessageSchema>;
export type ContactMessage = typeof contactMessages.$inferSelect;

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  privacyConsentAt: timestamp("privacy_consent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

export const customerSessions = pgTable("customer_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  customerId: integer("customer_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  active: boolean("active").notNull().default(true),
});

export type CustomerSession = typeof customerSessions.$inferSelect;

export const bannerImages = pgTable("banner_images", {
  id: serial("id").primaryKey(),
  imageUrl: text("image_url").notNull(),
  title: text("title"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  linkType: text("link_type"),
  linkValue: text("link_value"),
  showOnHome: boolean("show_on_home").notNull().default(true),
  showOnOrder: boolean("show_on_order").notNull().default(true),
  showOnEvents: boolean("show_on_events").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBannerImageSchema = createInsertSchema(bannerImages).omit({ id: true, createdAt: true });

export type InsertBannerImage = z.infer<typeof insertBannerImageSchema>;
export type BannerImage = typeof bannerImages.$inferSelect;

export const staffNotices = pgTable("staff_notices", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  colour: text("colour").notNull().default("amber"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: text("deleted_by"),
});

export const insertStaffNoticeSchema = createInsertSchema(staffNotices).omit({ id: true, createdAt: true });

export type InsertStaffNotice = z.infer<typeof insertStaffNoticeSchema>;
export type StaffNotice = typeof staffNotices.$inferSelect;

export const staffPopups = pgTable("staff_popups", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  colour: text("colour").notNull().default("amber"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: text("deleted_by"),
});

export const insertStaffPopupSchema = createInsertSchema(staffPopups).omit({ id: true, createdAt: true });

export type InsertStaffPopup = z.infer<typeof insertStaffPopupSchema>;
export type StaffPopup = typeof staffPopups.$inferSelect;

export const blockedPeriods = pgTable("blocked_periods", {
  id: serial("id").primaryKey(),
  label: text("label"),
  tableType: text("table_type"),
  date: text("date"),
  dayOfWeek: integer("day_of_week"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBlockedPeriodSchema = createInsertSchema(blockedPeriods).omit({ id: true, createdAt: true });

export type InsertBlockedPeriod = z.infer<typeof insertBlockedPeriodSchema>;
export type BlockedPeriod = typeof blockedPeriods.$inferSelect;

export const membershipPlans = pgTable("membership_plans", {
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
  priceAnnual: integer("price_annual"),
  squarePlanVariationId: text("square_plan_variation_id"),
  squarePlanVariationIdAlt: text("square_plan_variation_id_alt"),
  squareCustomerGroupId: text("square_customer_group_id"),
  excludeWithDeals: boolean("exclude_with_deals").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  color: text("color").notNull().default("#0047AB"),
  description: text("description"),
});

export const insertMembershipPlanSchema = createInsertSchema(membershipPlans).omit({ id: true });

export type InsertMembershipPlan = z.infer<typeof insertMembershipPlanSchema>;
export type MembershipPlan = typeof membershipPlans.$inferSelect;

export const membershipSubscriptions = pgTable("membership_subscriptions", {
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMembershipSubscriptionSchema = createInsertSchema(membershipSubscriptions).omit({ id: true, createdAt: true });

export type InsertMembershipSubscription = z.infer<typeof insertMembershipSubscriptionSchema>;
export type MembershipSubscription = typeof membershipSubscriptions.$inferSelect;

// ── App orders (from native ordering system) ──────────────────────────────────

export const appOrders = pgTable("app_orders", {
  id: serial("id").primaryKey(),
  squareLinkId: text("square_link_id"),
  squareOrderId: text("square_order_id"),
  squarePaymentId: text("square_payment_id"),
  tableNote: text("table_note"),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  itemsJson: text("items_json").notNull(),
  totalPence: integer("total_pence").notNull().default(0),
  discountPercent: integer("discount_percent"),
  discountLabel: text("discount_label"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AppOrder = typeof appOrders.$inferSelect;

// ── Order audit log ───────────────────────────────────────────────────────────

export const orderAuditLog = pgTable("order_audit_log", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  staffUsername: text("staff_username").notNull(),
  action: text("action").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type OrderAuditEntry = typeof orderAuditLog.$inferSelect;

// ── Menu visibility overrides ─────────────────────────────────────────────────

export const menuCategoryVisibility = pgTable("menu_category_visibility", {
  categoryId: text("category_id").primaryKey(),
  hidden: boolean("hidden").notNull().default(false),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MenuCategoryVisibility = typeof menuCategoryVisibility.$inferSelect;

export const menuItemOverrides = pgTable("menu_item_overrides", {
  variationId: text("variation_id").primaryKey(),
  itemId: text("item_id").notNull(),
  name: text("name").notNull(),
  soldOut: boolean("sold_out").notNull().default(false),
  hidden: boolean("hidden").notNull().default(false),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MenuItemOverride = typeof menuItemOverrides.$inferSelect;

// ── Category display settings (order, merge, rename) ──────────────────────────

export const categorySettings = pgTable("category_settings", {
  categoryId: text("category_id").primaryKey(),
  displayOrder: integer("display_order").notNull().default(99),
  mergedIntoId: text("merged_into_id"),
  displayName: text("display_name"),
  updatedBy: text("updated_by").notNull().default("system"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CategorySetting = typeof categorySettings.$inferSelect;

// ── Availability rules (time / day / date restrictions) ───────────────────────

export const availabilityRules = pgTable("availability_rules", {
  id: serial("id").primaryKey(),
  targetType: text("target_type").notNull(),   // 'item' | 'category'
  targetId: text("target_id").notNull(),
  targetName: text("target_name").notNull(),
  daysOfWeek: text("days_of_week"),            // JSON array e.g. "[1,2,3,4,5]", null = all days
  startTime: text("start_time"),               // "HH:MM" or null
  endTime: text("end_time"),                   // "HH:MM" or null
  startDate: text("start_date"),               // "YYYY-MM-DD" or null
  endDate: text("end_date"),                   // "YYYY-MM-DD" or null
  note: text("note"),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: text("created_by").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AvailabilityRule = typeof availabilityRules.$inferSelect;
