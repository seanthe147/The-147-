import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, boolean, integer, index } from "drizzle-orm/pg-core";
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
  // UK employment law fields
  contractedDaysPerWeek: text("contracted_days_per_week").notNull().default("5"), // decimal string, e.g. "5" full-time, "3" part-time
  employmentStartDate: text("employment_start_date"),                             // YYYY-MM-DD, for new-starter accrual
  // Pay rate fields (encrypted at rest)
  payType: text("pay_type").default("hourly"),    // "hourly" | "salary"
  hourlyRate: text("hourly_rate"),                // AES-256 encrypted decimal string, e.g. "enc:..." → "12.50"
  annualSalary: text("annual_salary"),            // AES-256 encrypted decimal string, e.g. "enc:..." → "25000"
  weeklyHours: text("weekly_hours").default("37.5"), // contracted hours per week (e.g. "37.5")
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
  linkUrl: text("link_url"),
  linkType: text("link_type"),
});

export const insertOfferSchema = createInsertSchema(offers).omit({ id: true });

export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offers.$inferSelect;

export const pushTokens = pgTable("push_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  deviceName: text("device_name"),
  customerEmail: text("customer_email"),
  customerEmailHash: text("customer_email_hash"),
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
  source: text("source").notNull().default("staff"),
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
  email: text("email").notNull(),
  emailHash: text("email_hash").unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  privacyConsentAt: timestamp("privacy_consent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerifyTokenHash: text("email_verify_token_hash"),
  emailVerifyTokenExpiresAt: timestamp("email_verify_token_expires_at"),
  emailVerifyLastSentAt: timestamp("email_verify_last_sent_at"),
  passwordResetTokenHash: text("password_reset_token_hash"),
  passwordResetTokenExpiresAt: timestamp("password_reset_token_expires_at"),
  passwordResetLastSentAt: timestamp("password_reset_last_sent_at"),
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
  paymentReminderSentAt: timestamp("payment_reminder_sent_at"),
  cancelledAt: timestamp("cancelled_at"),
  staffNotes: text("staff_notes"),
  source: text("source").notNull().default("staff"),
  migrationToken: text("migration_token"),
  migrationEmailedAt: timestamp("migration_emailed_at"),
  migrationCompletedAt: timestamp("migration_completed_at"),
  legacyExternalRef: text("legacy_external_ref"),
  termsAcceptedAt: timestamp("terms_accepted_at"),
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
  customerEmailHash: text("customer_email_hash"),
  itemsJson: text("items_json").notNull(),
  totalPence: integer("total_pence").notNull().default(0),
  discountPercent: integer("discount_percent"),
  discountLabel: text("discount_label"),
  // Lifecycle:
  //   pending  → order created, awaiting payment
  //   paid     → payment captured (kitchen sees it)
  //   preparing→ kitchen has started the order
  //   ready    → ready to collect from the bar
  //   delivered→ taken to the customer's table (terminal)
  //   collected→ picked up by the customer (terminal)
  //   cancelled/refunded/expired → terminal failure states
  status: text("status").notNull().default("pending"),
  confirmationToken: text("confirmation_token"),
  // Expo push token of the device that placed the order. Used to notify
  // ONLY that device when the order's status changes (e.g. "ready"). We
  // intentionally store the originating device's token rather than every
  // token associated with the customer's email — a customer may have the
  // app on multiple devices and only the one that ordered should buzz.
  pushToken: text("push_token"),
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

// ── Staff-initiated password reset audit log ─────────────────────────────────
// Tracks every attempt by a manager to send a password reset email to a customer
// (whether it succeeded or not), so abuse can be detected and support can follow up.
// customerEmail / customerName are stored encrypted using the same encrypt() helper
// applied to the customers table, so this log doesn't leak plaintext PII at rest.
export const passwordResetAuditLog = pgTable("password_reset_audit_log", {
  id: serial("id").primaryKey(),
  staffUsername: text("staff_username").notNull(),
  customerId: integer("customer_id"),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  outcome: text("outcome").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("password_reset_audit_log_created_at_idx").on(table.createdAt),
  staffUsernameIdx: index("password_reset_audit_log_staff_username_idx").on(table.staffUsername),
}));

export type PasswordResetAuditEntry = typeof passwordResetAuditLog.$inferSelect;

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
  parentCategoryId: text("parent_category_id"),
  displayName: text("display_name"),
  imageUrl: text("image_url"),
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

// ══════════════════════════════════════════════════════════════════════════════
//  STAFF HR MODULE
// ══════════════════════════════════════════════════════════════════════════════

// ── Clock-in / Clock-out time entries ─────────────────────────────────────────
export const staffTimeEntries = pgTable("staff_time_entries", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull(),             // references staffUsers.id
  clockedInAt: timestamp("clocked_in_at").notNull(),
  clockedOutAt: timestamp("clocked_out_at"),
  clockInLat: text("clock_in_lat"),
  clockInLng: text("clock_in_lng"),
  clockOutLat: text("clock_out_lat"),
  clockOutLng: text("clock_out_lng"),
  notes: text("notes"),
  status: text("status").notNull().default("active"),  // active | completed | amended
  amendedBy: integer("amended_by"),
  amendedAt: timestamp("amended_at"),
  amendReason: text("amend_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type StaffTimeEntry = typeof staffTimeEntries.$inferSelect;
export const insertStaffTimeEntrySchema = createInsertSchema(staffTimeEntries).omit({ id: true, createdAt: true });

// ── Leave requests ─────────────────────────────────────────────────────────────
export const staffLeaveRequests = pgTable("staff_leave_requests", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull(),
  leaveType: text("leave_type").notNull().default("annual"), // annual | sick | unpaid | other
  startDate: text("start_date").notNull(),   // YYYY-MM-DD
  endDate: text("end_date").notNull(),       // YYYY-MM-DD
  totalDays: text("total_days").notNull(),   // stored as decimal string e.g. "2.5"
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type StaffLeaveRequest = typeof staffLeaveRequests.$inferSelect;
export const insertStaffLeaveRequestSchema = createInsertSchema(staffLeaveRequests).omit({ id: true, createdAt: true });

// ── Annual leave allowances (per staff member, per year) ─────────────────────
export const staffLeaveAllowances = pgTable("staff_leave_allowances", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull(),
  year: integer("year").notNull(),
  totalDays: text("total_days").notNull().default("28"),         // pro-rata entitlement, e.g. "28" full-time
  carryOver: text("carry_over").notNull().default("0"),          // days carried from previous year
  leaveYearStart: text("leave_year_start").notNull().default("01-01"), // MM-DD, e.g. "01-01" or "04-01"
  maxCarryOverDays: text("max_carry_over_days").notNull().default("8"), // UK discretionary cap (8 days normal, 20 if sick/family)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type StaffLeaveAllowance = typeof staffLeaveAllowances.$inferSelect;
export const insertStaffLeaveAllowanceSchema = createInsertSchema(staffLeaveAllowances).omit({ id: true, createdAt: true });

// ── Incident / accident reports ────────────────────────────────────────────────
export const staffIncidents = pgTable("staff_incidents", {
  id: serial("id").primaryKey(),
  reportedBy: integer("reported_by").notNull(),
  incidentDate: text("incident_date").notNull(),      // ISO datetime string
  location: text("location").notNull(),
  description: text("description").notNull(),
  injuryType: text("injury_type"),                    // none | minor | medical_treatment | lost_time
  personsInvolved: text("persons_involved"),
  witnessNames: text("witness_names"),
  actionTaken: text("action_taken"),
  reportedToManager: boolean("reported_to_manager").notNull().default(false),
  status: text("status").notNull().default("open"),   // open | under_review | closed
  closedAt: timestamp("closed_at"),
  closedBy: integer("closed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type StaffIncident = typeof staffIncidents.$inferSelect;

// ── Rota / shift scheduling ────────────────────────────────────────────────────
export const staffRotaShifts = pgTable("staff_rota_shifts", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull(),
  weekStart: text("week_start").notNull(),      // YYYY-MM-DD (Monday)
  dayOfWeek: integer("day_of_week").notNull(),  // 0=Mon … 6=Sun
  shiftStart: text("shift_start").notNull(),    // "HH:MM"
  shiftEnd: text("shift_end").notNull(),        // "HH:MM"
  role: text("role"),                           // "Bar" | "Kitchen" | "Floor" | "Manager" etc.
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type StaffRotaShift = typeof staffRotaShifts.$inferSelect;
export const insertStaffRotaShiftSchema = createInsertSchema(staffRotaShifts).omit({ id: true, createdAt: true, updatedAt: true });

// ── Rota published weeks ───────────────────────────────────────────────────────
export const staffRotaPublished = pgTable("staff_rota_published", {
  id: serial("id").primaryKey(),
  weekStart: text("week_start").notNull().unique(), // YYYY-MM-DD (Monday)
  publishedAt: timestamp("published_at").defaultNow().notNull(),
  publishedByUsername: text("published_by_username"),
  notificationSent: boolean("notification_sent").notNull().default(false),
  staffNotified: integer("staff_notified").notNull().default(0),
});

export type StaffRotaPublished = typeof staffRotaPublished.$inferSelect;

// ── Staff documents ────────────────────────────────────────────────────────────
export const staffDocuments = pgTable("staff_documents", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull(),
  uploadedBy: integer("uploaded_by").notNull(),
  category: text("category").notNull().default("other"), // contract | right-to-work | certification | id | onboarding | other
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),       // MIME type e.g. application/pdf
  fileData: text("file_data").notNull(),        // base64 encoded file content
  fileSizeBytes: integer("file_size_bytes").notNull(),
  notes: text("notes"),
  expiresAt: text("expires_at"),               // YYYY-MM-DD, optional (e.g. for visas/certs)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type StaffDocument = typeof staffDocuments.$inferSelect;
export const insertStaffDocumentSchema = createInsertSchema(staffDocuments).omit({ id: true, createdAt: true });

// ── Staff onboarding ───────────────────────────────────────────────────────────
export const staffOnboarding = pgTable("staff_onboarding", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().unique(),
  // Emergency contact
  emergencyName: text("emergency_name"),
  emergencyPhone: text("emergency_phone"),
  emergencyRelation: text("emergency_relation"),
  // Tax / HMRC (encrypted)
  nationalInsurance: text("national_insurance"),  // enc: prefix when stored
  starterDeclaration: text("starter_declaration"), // A | B | C  (P46 equivalent)
  taxCode: text("tax_code"),
  // Bank details (encrypted)
  bankAccountName: text("bank_account_name"),   // enc: prefix
  bankSortCode: text("bank_sort_code"),          // enc: prefix
  bankAccountNumber: text("bank_account_number"), // enc: prefix
  // Right to work
  rightToWorkType: text("right_to_work_type"),  // british-passport | eu-settled | visa | other
  rightToWorkExpiry: text("right_to_work_expiry"), // YYYY-MM-DD or null (no expiry)
  // Meta
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type StaffOnboarding = typeof staffOnboarding.$inferSelect;
export const insertStaffOnboardingSchema = createInsertSchema(staffOnboarding).omit({ id: true, updatedAt: true });

// ── Staff push tokens (for targeted staff notifications) ───────────────────────
export const staffPushTokens = pgTable("staff_push_tokens", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type StaffPushToken = typeof staffPushTokens.$inferSelect;

// ── Staff payment log (Stripe phone payments taken via dashboard) ──────────────
export const paymentLog = pgTable("payment_log", {
  id: serial("id").primaryKey(),
  amountPence: integer("amount_pence").notNull(),
  currency: text("currency").notNull().default("gbp"),
  description: text("description").notNull(),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  status: text("status").notNull().default("pending"), // pending | succeeded | failed
  staffUsername: text("staff_username"),
  staffDisplayName: text("staff_display_name"),
  failureMessage: text("failure_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PaymentLog = typeof paymentLog.$inferSelect;
export const insertPaymentLogSchema = createInsertSchema(paymentLog).omit({ id: true, createdAt: true });
export type InsertPaymentLog = z.infer<typeof insertPaymentLogSchema>;
