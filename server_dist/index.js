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
var users, insertUserSchema, staffUsers, offers, insertOfferSchema, pushTokens, insertPushTokenSchema, notifications, bookings, insertBookingSchema, staffSessions, contactMessages, insertContactMessageSchema, events, insertEventSchema, siteSettings, customers, insertCustomerSchema, customerSessions, bannerImages, insertBannerImageSchema, staffNotices, insertStaffNoticeSchema, staffPopups, insertStaffPopupSchema, blockedPeriods, insertBlockedPeriodSchema, membershipPlans, insertMembershipPlanSchema, membershipSubscriptions, insertMembershipSubscriptionSchema, appOrders, orderAuditLog, menuCategoryVisibility, menuItemOverrides, categorySettings, availabilityRules, staffTimeEntries, insertStaffTimeEntrySchema, staffLeaveRequests, insertStaffLeaveRequestSchema, staffLeaveAllowances, insertStaffLeaveAllowanceSchema, staffIncidents, staffRotaShifts, insertStaffRotaShiftSchema, staffRotaPublished, staffDocuments, insertStaffDocumentSchema, staffOnboarding, insertStaffOnboardingSchema, staffPushTokens, paymentLog, insertPaymentLogSchema;
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
      approvalStatus: text("approval_status").notNull().default("approved"),
      // UK employment law fields
      contractedDaysPerWeek: text("contracted_days_per_week").notNull().default("5"),
      // decimal string, e.g. "5" full-time, "3" part-time
      employmentStartDate: text("employment_start_date"),
      // YYYY-MM-DD, for new-starter accrual
      // Pay rate fields (encrypted at rest)
      payType: text("pay_type").default("hourly"),
      // "hourly" | "salary"
      hourlyRate: text("hourly_rate"),
      // AES-256 encrypted decimal string, e.g. "enc:..." → "12.50"
      annualSalary: text("annual_salary"),
      // AES-256 encrypted decimal string, e.g. "enc:..." → "25000"
      weeklyHours: text("weekly_hours").default("37.5")
      // contracted hours per week (e.g. "37.5")
    });
    offers = pgTable("offers", {
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
      linkType: text("link_type")
    });
    insertOfferSchema = createInsertSchema(offers).omit({ id: true });
    pushTokens = pgTable("push_tokens", {
      id: serial("id").primaryKey(),
      token: text("token").notNull().unique(),
      deviceName: text("device_name"),
      customerEmail: text("customer_email"),
      customerEmailHash: text("customer_email_hash"),
      platform: text("platform"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertPushTokenSchema = createInsertSchema(pushTokens).omit({ id: true, createdAt: true });
    notifications = pgTable("notifications", {
      id: serial("id").primaryKey(),
      title: text("title").notNull(),
      body: text("body").notNull(),
      sentAt: timestamp("sent_at").defaultNow().notNull(),
      recipientCount: integer("recipient_count").notNull().default(0),
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
      source: text("source").notNull().default("staff"),
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
      passwordResetLastSentAt: timestamp("password_reset_last_sent_at")
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
      showOnHome: boolean("show_on_home").notNull().default(true),
      showOnOrder: boolean("show_on_order").notNull().default(true),
      showOnEvents: boolean("show_on_events").notNull().default(true),
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
      priceAnnual: integer("price_annual"),
      squarePlanVariationId: text("square_plan_variation_id"),
      squarePlanVariationIdAlt: text("square_plan_variation_id_alt"),
      squareCustomerGroupId: text("square_customer_group_id"),
      excludeWithDeals: boolean("exclude_with_deals").notNull().default(false),
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
      paymentReminderSentAt: timestamp("payment_reminder_sent_at"),
      cancelledAt: timestamp("cancelled_at"),
      staffNotes: text("staff_notes"),
      source: text("source").notNull().default("staff"),
      migrationToken: text("migration_token"),
      migrationEmailedAt: timestamp("migration_emailed_at"),
      migrationCompletedAt: timestamp("migration_completed_at"),
      legacyExternalRef: text("legacy_external_ref"),
      termsAcceptedAt: timestamp("terms_accepted_at"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertMembershipSubscriptionSchema = createInsertSchema(membershipSubscriptions).omit({ id: true, createdAt: true });
    appOrders = pgTable("app_orders", {
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
      status: text("status").notNull().default("pending"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    orderAuditLog = pgTable("order_audit_log", {
      id: serial("id").primaryKey(),
      orderId: integer("order_id").notNull(),
      staffUsername: text("staff_username").notNull(),
      action: text("action").notNull(),
      reason: text("reason"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    menuCategoryVisibility = pgTable("menu_category_visibility", {
      categoryId: text("category_id").primaryKey(),
      hidden: boolean("hidden").notNull().default(false),
      updatedBy: text("updated_by").notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    menuItemOverrides = pgTable("menu_item_overrides", {
      variationId: text("variation_id").primaryKey(),
      itemId: text("item_id").notNull(),
      name: text("name").notNull(),
      soldOut: boolean("sold_out").notNull().default(false),
      hidden: boolean("hidden").notNull().default(false),
      updatedBy: text("updated_by").notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    categorySettings = pgTable("category_settings", {
      categoryId: text("category_id").primaryKey(),
      displayOrder: integer("display_order").notNull().default(99),
      mergedIntoId: text("merged_into_id"),
      parentCategoryId: text("parent_category_id"),
      displayName: text("display_name"),
      imageUrl: text("image_url"),
      updatedBy: text("updated_by").notNull().default("system"),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    availabilityRules = pgTable("availability_rules", {
      id: serial("id").primaryKey(),
      targetType: text("target_type").notNull(),
      // 'item' | 'category'
      targetId: text("target_id").notNull(),
      targetName: text("target_name").notNull(),
      daysOfWeek: text("days_of_week"),
      // JSON array e.g. "[1,2,3,4,5]", null = all days
      startTime: text("start_time"),
      // "HH:MM" or null
      endTime: text("end_time"),
      // "HH:MM" or null
      startDate: text("start_date"),
      // "YYYY-MM-DD" or null
      endDate: text("end_date"),
      // "YYYY-MM-DD" or null
      note: text("note"),
      enabled: boolean("enabled").notNull().default(true),
      createdBy: text("created_by").notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    staffTimeEntries = pgTable("staff_time_entries", {
      id: serial("id").primaryKey(),
      staffId: integer("staff_id").notNull(),
      // references staffUsers.id
      clockedInAt: timestamp("clocked_in_at").notNull(),
      clockedOutAt: timestamp("clocked_out_at"),
      clockInLat: text("clock_in_lat"),
      clockInLng: text("clock_in_lng"),
      clockOutLat: text("clock_out_lat"),
      clockOutLng: text("clock_out_lng"),
      notes: text("notes"),
      status: text("status").notNull().default("active"),
      // active | completed | amended
      amendedBy: integer("amended_by"),
      amendedAt: timestamp("amended_at"),
      amendReason: text("amend_reason"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertStaffTimeEntrySchema = createInsertSchema(staffTimeEntries).omit({ id: true, createdAt: true });
    staffLeaveRequests = pgTable("staff_leave_requests", {
      id: serial("id").primaryKey(),
      staffId: integer("staff_id").notNull(),
      leaveType: text("leave_type").notNull().default("annual"),
      // annual | sick | unpaid | other
      startDate: text("start_date").notNull(),
      // YYYY-MM-DD
      endDate: text("end_date").notNull(),
      // YYYY-MM-DD
      totalDays: text("total_days").notNull(),
      // stored as decimal string e.g. "2.5"
      reason: text("reason"),
      status: text("status").notNull().default("pending"),
      // pending | approved | rejected
      reviewedBy: integer("reviewed_by"),
      reviewedAt: timestamp("reviewed_at"),
      reviewNotes: text("review_notes"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertStaffLeaveRequestSchema = createInsertSchema(staffLeaveRequests).omit({ id: true, createdAt: true });
    staffLeaveAllowances = pgTable("staff_leave_allowances", {
      id: serial("id").primaryKey(),
      staffId: integer("staff_id").notNull(),
      year: integer("year").notNull(),
      totalDays: text("total_days").notNull().default("28"),
      // pro-rata entitlement, e.g. "28" full-time
      carryOver: text("carry_over").notNull().default("0"),
      // days carried from previous year
      leaveYearStart: text("leave_year_start").notNull().default("01-01"),
      // MM-DD, e.g. "01-01" or "04-01"
      maxCarryOverDays: text("max_carry_over_days").notNull().default("8"),
      // UK discretionary cap (8 days normal, 20 if sick/family)
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertStaffLeaveAllowanceSchema = createInsertSchema(staffLeaveAllowances).omit({ id: true, createdAt: true });
    staffIncidents = pgTable("staff_incidents", {
      id: serial("id").primaryKey(),
      reportedBy: integer("reported_by").notNull(),
      incidentDate: text("incident_date").notNull(),
      // ISO datetime string
      location: text("location").notNull(),
      description: text("description").notNull(),
      injuryType: text("injury_type"),
      // none | minor | medical_treatment | lost_time
      personsInvolved: text("persons_involved"),
      witnessNames: text("witness_names"),
      actionTaken: text("action_taken"),
      reportedToManager: boolean("reported_to_manager").notNull().default(false),
      status: text("status").notNull().default("open"),
      // open | under_review | closed
      closedAt: timestamp("closed_at"),
      closedBy: integer("closed_by"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    staffRotaShifts = pgTable("staff_rota_shifts", {
      id: serial("id").primaryKey(),
      staffId: integer("staff_id").notNull(),
      weekStart: text("week_start").notNull(),
      // YYYY-MM-DD (Monday)
      dayOfWeek: integer("day_of_week").notNull(),
      // 0=Mon … 6=Sun
      shiftStart: text("shift_start").notNull(),
      // "HH:MM"
      shiftEnd: text("shift_end").notNull(),
      // "HH:MM"
      role: text("role"),
      // "Bar" | "Kitchen" | "Floor" | "Manager" etc.
      notes: text("notes"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertStaffRotaShiftSchema = createInsertSchema(staffRotaShifts).omit({ id: true, createdAt: true, updatedAt: true });
    staffRotaPublished = pgTable("staff_rota_published", {
      id: serial("id").primaryKey(),
      weekStart: text("week_start").notNull().unique(),
      // YYYY-MM-DD (Monday)
      publishedAt: timestamp("published_at").defaultNow().notNull(),
      publishedByUsername: text("published_by_username"),
      notificationSent: boolean("notification_sent").notNull().default(false),
      staffNotified: integer("staff_notified").notNull().default(0)
    });
    staffDocuments = pgTable("staff_documents", {
      id: serial("id").primaryKey(),
      staffId: integer("staff_id").notNull(),
      uploadedBy: integer("uploaded_by").notNull(),
      category: text("category").notNull().default("other"),
      // contract | right-to-work | certification | id | onboarding | other
      fileName: text("file_name").notNull(),
      fileType: text("file_type").notNull(),
      // MIME type e.g. application/pdf
      fileData: text("file_data").notNull(),
      // base64 encoded file content
      fileSizeBytes: integer("file_size_bytes").notNull(),
      notes: text("notes"),
      expiresAt: text("expires_at"),
      // YYYY-MM-DD, optional (e.g. for visas/certs)
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertStaffDocumentSchema = createInsertSchema(staffDocuments).omit({ id: true, createdAt: true });
    staffOnboarding = pgTable("staff_onboarding", {
      id: serial("id").primaryKey(),
      staffId: integer("staff_id").notNull().unique(),
      // Emergency contact
      emergencyName: text("emergency_name"),
      emergencyPhone: text("emergency_phone"),
      emergencyRelation: text("emergency_relation"),
      // Tax / HMRC (encrypted)
      nationalInsurance: text("national_insurance"),
      // enc: prefix when stored
      starterDeclaration: text("starter_declaration"),
      // A | B | C  (P46 equivalent)
      taxCode: text("tax_code"),
      // Bank details (encrypted)
      bankAccountName: text("bank_account_name"),
      // enc: prefix
      bankSortCode: text("bank_sort_code"),
      // enc: prefix
      bankAccountNumber: text("bank_account_number"),
      // enc: prefix
      // Right to work
      rightToWorkType: text("right_to_work_type"),
      // british-passport | eu-settled | visa | other
      rightToWorkExpiry: text("right_to_work_expiry"),
      // YYYY-MM-DD or null (no expiry)
      // Meta
      completedAt: timestamp("completed_at"),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertStaffOnboardingSchema = createInsertSchema(staffOnboarding).omit({ id: true, updatedAt: true });
    staffPushTokens = pgTable("staff_push_tokens", {
      id: serial("id").primaryKey(),
      staffId: integer("staff_id").notNull(),
      token: text("token").notNull().unique(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    paymentLog = pgTable("payment_log", {
      id: serial("id").primaryKey(),
      amountPence: integer("amount_pence").notNull(),
      currency: text("currency").notNull().default("gbp"),
      description: text("description").notNull(),
      customerName: text("customer_name"),
      customerEmail: text("customer_email"),
      customerPhone: text("customer_phone"),
      stripePaymentIntentId: text("stripe_payment_intent_id"),
      status: text("status").notNull().default("pending"),
      // pending | succeeded | failed
      staffUsername: text("staff_username"),
      staffDisplayName: text("staff_display_name"),
      failureMessage: text("failure_message"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertPaymentLogSchema = createInsertSchema(paymentLog).omit({ id: true, createdAt: true });
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
  runStartupMigrations: () => runStartupMigrations,
  storage: () => storage
});
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, lt, lte, sql as sql2, and, gt, isNull, isNotNull, gte, desc, inArray, ne } from "drizzle-orm";
function decryptCustomer(c) {
  return {
    ...c,
    email: decrypt(c.email),
    name: decrypt(c.name),
    phone: c.phone ? decrypt(c.phone) : c.phone
  };
}
function decryptPaymentLog(p) {
  return {
    ...p,
    customerName: p.customerName ? decrypt(p.customerName) : p.customerName,
    customerEmail: p.customerEmail ? decrypt(p.customerEmail) : p.customerEmail,
    customerPhone: p.customerPhone ? decrypt(p.customerPhone) : p.customerPhone
  };
}
function decryptContactMessage(m) {
  return {
    ...m,
    name: decrypt(m.name),
    email: decrypt(m.email),
    phone: m.phone ? decrypt(m.phone) : m.phone,
    message: decrypt(m.message)
  };
}
function decryptPushToken(t) {
  return {
    ...t,
    customerEmail: t.customerEmail ? decrypt(t.customerEmail) : t.customerEmail
  };
}
function decryptAppOrder(o) {
  return {
    ...o,
    customerName: o.customerName ? decrypt(o.customerName) : o.customerName,
    customerEmail: o.customerEmail ? decrypt(o.customerEmail) : o.customerEmail
  };
}
function decryptTimeEntry(entry) {
  return {
    ...entry,
    clockInLat: entry.clockInLat ? decrypt(entry.clockInLat) : entry.clockInLat,
    clockInLng: entry.clockInLng ? decrypt(entry.clockInLng) : entry.clockInLng,
    clockOutLat: entry.clockOutLat ? decrypt(entry.clockOutLat) : entry.clockOutLat,
    clockOutLng: entry.clockOutLng ? decrypt(entry.clockOutLng) : entry.clockOutLng
  };
}
function decryptIncident(incident) {
  return {
    ...incident,
    description: incident.description ? decrypt(incident.description) : incident.description
  };
}
function decryptLeaveRequest(req) {
  return {
    ...req,
    reason: req.reason ? decrypt(req.reason) : req.reason,
    reviewNotes: req.reviewNotes ? decrypt(req.reviewNotes) : req.reviewNotes
  };
}
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
async function runStartupMigrations() {
  const client = await pool.connect();
  try {
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
  } catch (err) {
    console.error("[DB] Startup migration failed (non-fatal):", err.message);
  } finally {
    client.release();
  }
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
    pool.on("error", (err) => {
      console.error("[DB] Unexpected pool error (non-fatal):", err.message);
    });
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
        return db.select().from(offers).where(eq(offers.active, true));
      }
      async getAllOffers() {
        return db.select().from(offers).orderBy(offers.id);
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
        const encEmail = data.customerEmail ? encrypt(data.customerEmail) : null;
        const emailHash = data.customerEmail ? hashEmail(data.customerEmail) : null;
        if (existing) {
          if (data.customerEmail && existing.customerEmailHash !== emailHash) {
            const [updated] = await db.update(pushTokens).set({ customerEmail: encEmail, customerEmailHash: emailHash }).where(eq(pushTokens.token, data.token)).returning();
            return decryptPushToken(updated);
          }
          return decryptPushToken(existing);
        }
        const [created] = await db.insert(pushTokens).values({
          ...data,
          customerEmail: encEmail,
          customerEmailHash: emailHash
        }).returning();
        return decryptPushToken(created);
      }
      async getAllPushTokens() {
        const rows = await db.select().from(pushTokens);
        return rows.map(decryptPushToken);
      }
      async removePushToken(token) {
        const result = await db.delete(pushTokens).where(eq(pushTokens.token, token)).returning();
        return result.length > 0;
      }
      async getPushTokensByEmail(email) {
        const hash = hashEmail(email);
        const byHash = await db.select().from(pushTokens).where(eq(pushTokens.customerEmailHash, hash));
        if (byHash.length > 0) return byHash.map(decryptPushToken);
        const byPlain = await db.select().from(pushTokens).where(sql2`lower(${pushTokens.customerEmail}) = lower(${email})`);
        return byPlain.map(decryptPushToken);
      }
      async saveNotification(title, body, recipientCount, sentBy) {
        const [created] = await db.insert(notifications).values({ title, body, recipientCount, sentBy }).returning();
        return created;
      }
      async getNotificationHistory() {
        return db.select().from(notifications).orderBy(desc(notifications.sentAt));
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
      async getBookedSlots(date, tableType, tableNumber, excludeBookingId) {
        const conditions = [
          eq(bookings.date, date),
          eq(bookings.tableType, tableType),
          eq(bookings.status, "confirmed")
        ];
        if (tableNumber) {
          conditions.push(eq(bookings.tableNumber, tableNumber));
        }
        if (excludeBookingId) {
          conditions.push(ne(bookings.id, excludeBookingId));
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
        const allCustomers = await db.select({ emailHash: customers.emailHash, email: customers.email }).from(customers);
        for (const c of allCustomers) {
          if (c.emailHash) {
            activeHashes.add(c.emailHash);
          } else if (c.email && !c.email.startsWith("enc:")) {
            activeHashes.add(hashEmail(c.email));
          }
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
      async anonymizeOldHRRecords() {
        let count = 0;
        const now = /* @__PURE__ */ new Date();
        const gpsRetention = new Date(now);
        gpsRetention.setFullYear(gpsRetention.getFullYear() - 3);
        const oldTimeEntries = await db.select().from(staffTimeEntries).where(lt(staffTimeEntries.clockedInAt, gpsRetention));
        for (const entry of oldTimeEntries) {
          if (!entry.clockInLat && !entry.clockInLng && !entry.clockOutLat && !entry.clockOutLng) continue;
          await db.update(staffTimeEntries).set({ clockInLat: null, clockInLng: null, clockOutLat: null, clockOutLng: null }).where(eq(staffTimeEntries.id, entry.id));
          count++;
        }
        const hrRetention = new Date(now);
        hrRetention.setFullYear(hrRetention.getFullYear() - 7);
        const oldIncidents = await db.select().from(staffIncidents).where(lt(staffIncidents.createdAt, hrRetention));
        for (const incident of oldIncidents) {
          if (!incident.description || incident.description === "ANONYMIZED") continue;
          await db.update(staffIncidents).set({ description: "ANONYMIZED" }).where(eq(staffIncidents.id, incident.id));
          count++;
        }
        const oldLeaveRequests = await db.select().from(staffLeaveRequests).where(lt(staffLeaveRequests.createdAt, hrRetention));
        for (const req of oldLeaveRequests) {
          if (!req.reason || req.reason === "ANONYMIZED") continue;
          await db.update(staffLeaveRequests).set({ reason: "ANONYMIZED", reviewNotes: req.reviewNotes ? "ANONYMIZED" : null }).where(eq(staffLeaveRequests.id, req.id));
          count++;
        }
        return count;
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
      async getStaffUserById(id) {
        const [user] = await db.select().from(staffUsers).where(eq(staffUsers.id, id));
        return user;
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
      async migrateEncryptExistingPII() {
        const allCustomers = await db.select().from(customers);
        for (const c of allCustomers) {
          if (c.email.startsWith("enc:") || c.email === "ANONYMIZED") continue;
          await db.update(customers).set({
            email: encrypt(c.email),
            emailHash: hashEmail(c.email),
            name: c.name.startsWith("enc:") ? c.name : encrypt(c.name),
            phone: c.phone && !c.phone.startsWith("enc:") ? encrypt(c.phone) : c.phone
          }).where(eq(customers.id, c.id));
        }
        const allMessages = await db.select().from(contactMessages);
        for (const m of allMessages) {
          if (m.name === "ANONYMIZED" || m.name.startsWith("enc:")) continue;
          await db.update(contactMessages).set({
            name: encrypt(m.name),
            email: encrypt(m.email),
            phone: m.phone && !m.phone.startsWith("enc:") ? encrypt(m.phone) : m.phone,
            message: m.message.startsWith("enc:") ? m.message : encrypt(m.message)
          }).where(eq(contactMessages.id, m.id));
        }
        const allTokens = await db.select().from(pushTokens);
        for (const t of allTokens) {
          if (!t.customerEmail || t.customerEmail.startsWith("enc:")) continue;
          await db.update(pushTokens).set({
            customerEmail: encrypt(t.customerEmail),
            customerEmailHash: hashEmail(t.customerEmail)
          }).where(eq(pushTokens.id, t.id));
        }
        const allOrders = await db.select().from(appOrders);
        for (const o of allOrders) {
          if (!o.customerEmail && !o.customerName) continue;
          if (o.customerEmail?.startsWith("enc:")) continue;
          const updates = {};
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
        const encrypted = {
          ...data,
          name: encrypt(data.name),
          email: encrypt(data.email),
          phone: data.phone ? encrypt(data.phone) : void 0,
          message: encrypt(data.message)
        };
        const [created] = await db.insert(contactMessages).values(encrypted).returning();
        return decryptContactMessage(created);
      }
      async getContactMessages() {
        const rows = await db.select().from(contactMessages).orderBy(contactMessages.createdAt);
        return rows.map(decryptContactMessage);
      }
      async updateContactMessageStatus(id, status) {
        const [updated] = await db.update(contactMessages).set({ status }).where(eq(contactMessages.id, id)).returning();
        return updated ? decryptContactMessage(updated) : void 0;
      }
      async replyToContactMessage(id, replyText) {
        const [updated] = await db.update(contactMessages).set({ staffReply: replyText, repliedAt: /* @__PURE__ */ new Date(), status: "replied" }).where(eq(contactMessages.id, id)).returning();
        return updated ? decryptContactMessage(updated) : void 0;
      }
      async getContactMessage(id) {
        const [msg] = await db.select().from(contactMessages).where(eq(contactMessages.id, id));
        return msg ? decryptContactMessage(msg) : void 0;
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
      async getBannerImages(page) {
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
      async createCustomer(email, name, phone, passwordHash, opts) {
        const normalised = email.toLowerCase().trim();
        const [customer] = await db.insert(customers).values({
          email: encrypt(normalised),
          emailHash: hashEmail(normalised),
          name: encrypt(name),
          phone: phone ? encrypt(phone) : null,
          passwordHash,
          privacyConsentAt: /* @__PURE__ */ new Date(),
          emailVerifyTokenHash: opts?.emailVerifyTokenHash ?? null,
          emailVerifyTokenExpiresAt: opts?.emailVerifyTokenExpiresAt ?? null,
          emailVerifyLastSentAt: opts?.emailVerifyTokenHash ? /* @__PURE__ */ new Date() : null
        }).returning();
        return decryptCustomer(customer);
      }
      async setEmailVerificationToken(id, tokenHash, expiresAt) {
        await db.update(customers).set({
          emailVerifyTokenHash: tokenHash,
          emailVerifyTokenExpiresAt: expiresAt,
          emailVerifyLastSentAt: /* @__PURE__ */ new Date()
        }).where(eq(customers.id, id));
      }
      async getCustomerByVerifyTokenHash(tokenHash) {
        const [row] = await db.select().from(customers).where(eq(customers.emailVerifyTokenHash, tokenHash));
        return row ? decryptCustomer(row) : void 0;
      }
      async markEmailVerified(id) {
        await db.update(customers).set({
          emailVerified: true,
          emailVerifyTokenHash: null,
          emailVerifyTokenExpiresAt: null
        }).where(eq(customers.id, id));
      }
      async setPasswordResetToken(id, tokenHash, expiresAt) {
        await db.update(customers).set({
          passwordResetTokenHash: tokenHash,
          passwordResetTokenExpiresAt: expiresAt,
          passwordResetLastSentAt: /* @__PURE__ */ new Date()
        }).where(eq(customers.id, id));
      }
      async getCustomerByPasswordResetTokenHash(tokenHash) {
        const [row] = await db.select().from(customers).where(eq(customers.passwordResetTokenHash, tokenHash));
        return row ? decryptCustomer(row) : void 0;
      }
      async setCustomerPassword(id, passwordHash) {
        await db.update(customers).set({
          passwordHash,
          passwordResetTokenHash: null,
          passwordResetTokenExpiresAt: null
        }).where(eq(customers.id, id));
        await db.update(customerSessions).set({ active: false }).where(eq(customerSessions.customerId, id));
      }
      async getCustomerByEmail(email) {
        const hash = hashEmail(email.toLowerCase().trim());
        const [byHash] = await db.select().from(customers).where(eq(customers.emailHash, hash));
        if (byHash) return decryptCustomer(byHash);
        const [byPlain] = await db.select().from(customers).where(eq(customers.email, email.toLowerCase().trim()));
        return byPlain ? decryptCustomer(byPlain) : void 0;
      }
      async getCustomerById(id) {
        const [customer] = await db.select().from(customers).where(eq(customers.id, id));
        return customer ? decryptCustomer(customer) : void 0;
      }
      async getAllCustomers() {
        const rows = await db.select().from(customers).orderBy(customers.id);
        return rows.map(decryptCustomer);
      }
      async updateCustomer(id, data) {
        const encData = {};
        if (data.name) encData.name = encrypt(data.name);
        if (data.phone) encData.phone = encrypt(data.phone);
        const [updated] = await db.update(customers).set(encData).where(eq(customers.id, id)).returning();
        return updated ? decryptCustomer(updated) : void 0;
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
      async createMembershipPlan(data) {
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
          const [rawCustomer] = await db.select().from(customers).where(eq(customers.id, sub.customerId));
          const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, sub.planId));
          let customer = null;
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
      async getMembershipSubscriptionByCustomer(customerId) {
        const [sub] = await db.select().from(membershipSubscriptions).where(and(eq(membershipSubscriptions.customerId, customerId), eq(membershipSubscriptions.status, "active"))).orderBy(desc(membershipSubscriptions.createdAt));
        if (!sub) return null;
        const [plan] = await db.select().from(membershipPlans).where(and(eq(membershipPlans.id, sub.planId), eq(membershipPlans.active, true)));
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
      // Pending memberships that need a payment reminder email.
      // Returns subs that have been pending >= remindAfterHours and have not yet had a reminder sent.
      async getPendingMembershipsNeedingReminder(remindAfterHours) {
        const cutoff = new Date(Date.now() - remindAfterHours * 60 * 60 * 1e3);
        const rows = await db.select().from(membershipSubscriptions).where(and(
          eq(membershipSubscriptions.status, "pending"),
          isNull(membershipSubscriptions.paymentReminderSentAt),
          lte(membershipSubscriptions.createdAt, cutoff)
        ));
        const out = [];
        for (const sub of rows) {
          const [customer] = await db.select().from(customers).where(eq(customers.id, sub.customerId));
          const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, sub.planId));
          out.push({ ...sub, customer: customer ?? null, plan: plan ?? null });
        }
        return out;
      }
      // Pending memberships old enough to auto-cancel (payment never completed).
      async getPendingMembershipsToAutoCancel(maxAgeHours) {
        const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1e3);
        const rows = await db.select().from(membershipSubscriptions).where(and(
          eq(membershipSubscriptions.status, "pending"),
          lte(membershipSubscriptions.createdAt, cutoff)
        ));
        const out = [];
        for (const sub of rows) {
          const [customer] = await db.select().from(customers).where(eq(customers.id, sub.customerId));
          const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, sub.planId));
          out.push({ ...sub, customer: customer ?? null, plan: plan ?? null });
        }
        return out;
      }
      async markMembershipReminderSent(id) {
        await db.update(membershipSubscriptions).set({ paymentReminderSentAt: /* @__PURE__ */ new Date() }).where(eq(membershipSubscriptions.id, id));
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
      // ── Menu visibility overrides ───────────────────────────────────────────────
      async getMenuCategoryOverrides() {
        return db.select().from(menuCategoryVisibility);
      }
      async setMenuCategoryHidden(categoryId, hidden, updatedBy) {
        await db.insert(menuCategoryVisibility).values({ categoryId, hidden, updatedBy, updatedAt: /* @__PURE__ */ new Date() }).onConflictDoUpdate({
          target: menuCategoryVisibility.categoryId,
          set: { hidden, updatedBy, updatedAt: /* @__PURE__ */ new Date() }
        });
      }
      async getMenuItemOverrides() {
        return db.select().from(menuItemOverrides);
      }
      async setMenuItemSoldOut(variationId, itemId, name, soldOut, updatedBy) {
        const existing = await db.select().from(menuItemOverrides).where(eq(menuItemOverrides.variationId, variationId));
        const currentHidden = existing[0]?.hidden ?? false;
        await db.insert(menuItemOverrides).values({ variationId, itemId, name, soldOut, hidden: currentHidden, updatedBy, updatedAt: /* @__PURE__ */ new Date() }).onConflictDoUpdate({
          target: menuItemOverrides.variationId,
          set: { soldOut, updatedBy, updatedAt: /* @__PURE__ */ new Date() }
        });
      }
      async setMenuItemHidden(variationId, itemId, name, hidden, updatedBy) {
        const existing = await db.select().from(menuItemOverrides).where(eq(menuItemOverrides.variationId, variationId));
        const currentSoldOut = existing[0]?.soldOut ?? false;
        await db.insert(menuItemOverrides).values({ variationId, itemId, name, soldOut: currentSoldOut, hidden, updatedBy, updatedAt: /* @__PURE__ */ new Date() }).onConflictDoUpdate({
          target: menuItemOverrides.variationId,
          set: { hidden, updatedBy, updatedAt: /* @__PURE__ */ new Date() }
        });
      }
      async getCategorySettings() {
        return db.select().from(categorySettings);
      }
      async upsertCategorySettings(settings) {
        for (const s of settings) {
          await db.insert(categorySettings).values({
            categoryId: s.categoryId,
            displayOrder: s.displayOrder ?? 99,
            mergedIntoId: s.mergedIntoId ?? null,
            parentCategoryId: s.parentCategoryId ?? null,
            displayName: s.displayName ?? null,
            imageUrl: s.imageUrl ?? null,
            updatedBy: s.updatedBy,
            updatedAt: /* @__PURE__ */ new Date()
          }).onConflictDoUpdate({
            target: categorySettings.categoryId,
            set: {
              ...s.displayOrder !== void 0 ? { displayOrder: s.displayOrder } : {},
              ...s.mergedIntoId !== void 0 ? { mergedIntoId: s.mergedIntoId } : {},
              ...s.parentCategoryId !== void 0 ? { parentCategoryId: s.parentCategoryId } : {},
              ...s.displayName !== void 0 ? { displayName: s.displayName } : {},
              updatedBy: s.updatedBy,
              updatedAt: /* @__PURE__ */ new Date()
            }
          });
        }
      }
      async updateCategoryImage(categoryId, imageUrl, updatedBy) {
        await db.insert(categorySettings).values({
          categoryId,
          displayOrder: 99,
          mergedIntoId: null,
          displayName: null,
          imageUrl,
          updatedBy,
          updatedAt: /* @__PURE__ */ new Date()
        }).onConflictDoUpdate({
          target: categorySettings.categoryId,
          set: { imageUrl, updatedBy, updatedAt: /* @__PURE__ */ new Date() }
        });
      }
      async getAvailabilityRules() {
        return db.select().from(availabilityRules).orderBy(availabilityRules.id);
      }
      async createAvailabilityRule(rule) {
        const [created] = await db.insert(availabilityRules).values({ ...rule, updatedAt: /* @__PURE__ */ new Date() }).returning();
        return created;
      }
      async updateAvailabilityRule(id, rule) {
        const [updated] = await db.update(availabilityRules).set({ ...rule, updatedAt: /* @__PURE__ */ new Date() }).where(eq(availabilityRules.id, id)).returning();
        return updated;
      }
      async deleteAvailabilityRule(id) {
        const result = await db.delete(availabilityRules).where(eq(availabilityRules.id, id)).returning();
        return result.length > 0;
      }
      async createAppOrder(data) {
        const rows = await db.insert(appOrders).values({
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
          status: "pending"
        }).returning({ id: appOrders.id });
        return { id: rows[0].id };
      }
      async getRecentAppOrders(limit = 100) {
        const rows = await db.select().from(appOrders).orderBy(desc(appOrders.createdAt)).limit(limit);
        return rows.map(decryptAppOrder);
      }
      async getAppOrder(id) {
        const rows = await db.select().from(appOrders).where(eq(appOrders.id, id));
        return rows[0] ? decryptAppOrder(rows[0]) : null;
      }
      async getOrderBySquareOrderId(squareOrderId) {
        const rows = await db.select().from(appOrders).where(eq(appOrders.squareOrderId, squareOrderId));
        return rows[0] ? decryptAppOrder(rows[0]) : null;
      }
      async updateAppOrderPaid(squareOrderId, squarePaymentId) {
        await db.update(appOrders).set({ status: "paid", squarePaymentId }).where(eq(appOrders.squareOrderId, squareOrderId));
      }
      async updateAppOrderStatus(id, status) {
        await db.update(appOrders).set({ status }).where(eq(appOrders.id, id));
      }
      async getCustomerOrders(email) {
        const emailHash = hashEmail(email);
        const byHash = await db.select().from(appOrders).where(and(
          eq(appOrders.customerEmailHash, emailHash),
          sql2`${appOrders.status} != 'expired'`
        )).orderBy(desc(appOrders.createdAt)).limit(50);
        if (byHash.length > 0) return byHash.map(decryptAppOrder);
        const byPlain = await db.select().from(appOrders).where(and(
          eq(appOrders.customerEmail, email),
          sql2`${appOrders.status} != 'expired'`
        )).orderBy(desc(appOrders.createdAt)).limit(50);
        return byPlain.map(decryptAppOrder);
      }
      async expireStaleOrders(olderThanMinutes = 30) {
        const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1e3);
        const result = await db.update(appOrders).set({ status: "expired" }).where(and(
          eq(appOrders.status, "pending"),
          lte(appOrders.createdAt, cutoff)
        ));
        return result.rowCount ?? 0;
      }
      async logOrderAction(data) {
        await db.insert(orderAuditLog).values({
          orderId: data.orderId,
          staffUsername: data.staffUsername,
          action: data.action,
          reason: data.reason ?? null
        });
      }
      async getOrderAuditLog(orderId) {
        return db.select().from(orderAuditLog).where(eq(orderAuditLog.orderId, orderId)).orderBy(desc(orderAuditLog.createdAt));
      }
      async getAuditLogsForOrders(orderIds) {
        if (orderIds.length === 0) return [];
        return db.select().from(orderAuditLog).where(inArray(orderAuditLog.orderId, orderIds)).orderBy(desc(orderAuditLog.createdAt));
      }
      // ══════════════════════════════════════════════════════════════════
      // STAFF HR — TIME ENTRIES
      // ══════════════════════════════════════════════════════════════════
      async getActiveClockEntry(staffId) {
        const [entry] = await db.select().from(staffTimeEntries).where(and(eq(staffTimeEntries.staffId, staffId), eq(staffTimeEntries.status, "active"))).orderBy(desc(staffTimeEntries.clockedInAt)).limit(1);
        return entry ?? null;
      }
      async clockIn(staffId, lat, lng) {
        const [entry] = await db.insert(staffTimeEntries).values({
          staffId,
          clockedInAt: /* @__PURE__ */ new Date(),
          status: "active",
          clockInLat: lat ? encrypt(lat) : null,
          clockInLng: lng ? encrypt(lng) : null
        }).returning();
        return decryptTimeEntry(entry);
      }
      async clockOut(entryId, lat, lng) {
        const [entry] = await db.update(staffTimeEntries).set({
          clockedOutAt: /* @__PURE__ */ new Date(),
          status: "completed",
          clockOutLat: lat ? encrypt(lat) : null,
          clockOutLng: lng ? encrypt(lng) : null
        }).where(eq(staffTimeEntries.id, entryId)).returning();
        return entry ? decryptTimeEntry(entry) : null;
      }
      async getTimeEntriesForStaff(staffId, limit = 50) {
        const rows = await db.select().from(staffTimeEntries).where(eq(staffTimeEntries.staffId, staffId)).orderBy(desc(staffTimeEntries.clockedInAt)).limit(limit);
        return rows.map(decryptTimeEntry);
      }
      async getAllTimeEntries(limit = 200) {
        const rows = await db.select().from(staffTimeEntries).orderBy(desc(staffTimeEntries.clockedInAt)).limit(limit);
        return rows.map(decryptTimeEntry);
      }
      async amendTimeEntry(id, amendedBy, reason, updates) {
        const [entry] = await db.update(staffTimeEntries).set({ ...updates, status: "amended", amendedBy, amendedAt: /* @__PURE__ */ new Date(), amendReason: reason }).where(eq(staffTimeEntries.id, id)).returning();
        return entry ?? null;
      }
      // ══════════════════════════════════════════════════════════════════
      // STAFF HR — LEAVE REQUESTS
      // ══════════════════════════════════════════════════════════════════
      async createLeaveRequest(data) {
        const [req] = await db.insert(staffLeaveRequests).values({
          ...data,
          status: "pending",
          reason: data.reason ? encrypt(data.reason) : null
        }).returning();
        return decryptLeaveRequest(req);
      }
      async getLeaveRequestsForStaff(staffId) {
        const rows = await db.select().from(staffLeaveRequests).where(eq(staffLeaveRequests.staffId, staffId)).orderBy(desc(staffLeaveRequests.createdAt));
        return rows.map(decryptLeaveRequest);
      }
      async getAllLeaveRequests() {
        const rows = await db.select().from(staffLeaveRequests).orderBy(desc(staffLeaveRequests.createdAt));
        return rows.map(decryptLeaveRequest);
      }
      async reviewLeaveRequest(id, reviewedBy, status, reviewNotes) {
        const [req] = await db.update(staffLeaveRequests).set({
          status,
          reviewedBy,
          reviewedAt: /* @__PURE__ */ new Date(),
          reviewNotes: reviewNotes ? encrypt(reviewNotes) : null
        }).where(eq(staffLeaveRequests.id, id)).returning();
        return req ? decryptLeaveRequest(req) : null;
      }
      // ══════════════════════════════════════════════════════════════════
      // STAFF HR — LEAVE ALLOWANCES
      // ══════════════════════════════════════════════════════════════════
      async getLeaveAllowance(staffId, year) {
        const [row] = await db.select().from(staffLeaveAllowances).where(and(eq(staffLeaveAllowances.staffId, staffId), eq(staffLeaveAllowances.year, year)));
        return row ?? null;
      }
      async upsertLeaveAllowance(staffId, year, totalDays, carryOver, leaveYearStart, maxCarryOverDays) {
        const existing = await this.getLeaveAllowance(staffId, year);
        const updateFields = { totalDays, carryOver };
        if (leaveYearStart !== void 0) updateFields.leaveYearStart = leaveYearStart;
        if (maxCarryOverDays !== void 0) updateFields.maxCarryOverDays = maxCarryOverDays;
        if (existing) {
          const [row2] = await db.update(staffLeaveAllowances).set(updateFields).where(eq(staffLeaveAllowances.id, existing.id)).returning();
          return row2;
        }
        const [row] = await db.insert(staffLeaveAllowances).values({
          staffId,
          year,
          totalDays,
          carryOver,
          leaveYearStart: leaveYearStart ?? "01-01",
          maxCarryOverDays: maxCarryOverDays ?? "8"
        }).returning();
        return row;
      }
      async getAllLeaveAllowances(year) {
        return db.select().from(staffLeaveAllowances).where(eq(staffLeaveAllowances.year, year));
      }
      async updateStaffEmployment(staffId, contractedDaysPerWeek, employmentStartDate) {
        const [row] = await db.update(staffUsers).set({ contractedDaysPerWeek, employmentStartDate: employmentStartDate || null }).where(eq(staffUsers.id, staffId)).returning();
        return row;
      }
      // ══════════════════════════════════════════════════════════════════
      // STAFF HR — INCIDENT REPORTS
      // ══════════════════════════════════════════════════════════════════
      async createIncident(data) {
        const encrypted = { ...data, description: data.description ? encrypt(data.description) : data.description };
        const [incident] = await db.insert(staffIncidents).values(encrypted).returning();
        return decryptIncident(incident);
      }
      async getIncidentsForStaff(staffId) {
        const rows = await db.select().from(staffIncidents).where(eq(staffIncidents.reportedBy, staffId)).orderBy(desc(staffIncidents.createdAt));
        return rows.map(decryptIncident);
      }
      async getAllIncidents() {
        const rows = await db.select().from(staffIncidents).orderBy(desc(staffIncidents.createdAt));
        return rows.map(decryptIncident);
      }
      async updateIncidentStatus(id, status, closedBy) {
        const [incident] = await db.update(staffIncidents).set({ status, ...status === "closed" ? { closedAt: /* @__PURE__ */ new Date(), closedBy: closedBy ?? null } : {} }).where(eq(staffIncidents.id, id)).returning();
        return incident ? decryptIncident(incident) : null;
      }
      // ══════════════════════════════════════════════════════════════════
      // STAFF ROTA
      // ══════════════════════════════════════════════════════════════════
      async getRotaShifts(weekStart) {
        return db.select().from(staffRotaShifts).where(eq(staffRotaShifts.weekStart, weekStart)).orderBy(staffRotaShifts.dayOfWeek, staffRotaShifts.shiftStart);
      }
      async getRotaShiftsForStaff(staffId, weekStart) {
        return db.select().from(staffRotaShifts).where(and(eq(staffRotaShifts.staffId, staffId), eq(staffRotaShifts.weekStart, weekStart))).orderBy(staffRotaShifts.dayOfWeek, staffRotaShifts.shiftStart);
      }
      async upsertRotaShift(data, existingId) {
        if (existingId) {
          const [updated] = await db.update(staffRotaShifts).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(staffRotaShifts.id, existingId)).returning();
          return updated;
        }
        const [created] = await db.insert(staffRotaShifts).values(data).returning();
        return created;
      }
      async deleteRotaShift(id) {
        const result = await db.delete(staffRotaShifts).where(eq(staffRotaShifts.id, id)).returning();
        return result.length > 0;
      }
      async publishRota(weekStart, publishedByUsername) {
        const [existing] = await db.select().from(staffRotaPublished).where(eq(staffRotaPublished.weekStart, weekStart));
        if (existing) {
          const [updated] = await db.update(staffRotaPublished).set({ publishedAt: /* @__PURE__ */ new Date(), publishedByUsername, notificationSent: false }).where(eq(staffRotaPublished.weekStart, weekStart)).returning();
          return updated;
        }
        const [created] = await db.insert(staffRotaPublished).values({ weekStart, publishedByUsername, notificationSent: false, staffNotified: 0 }).returning();
        return created;
      }
      async getRotaPublished(weekStart) {
        const [row] = await db.select().from(staffRotaPublished).where(eq(staffRotaPublished.weekStart, weekStart));
        return row;
      }
      // ══════════════════════════════════════════════════════════════════
      // STAFF PUSH TOKENS
      // ══════════════════════════════════════════════════════════════════
      async upsertStaffPushToken(staffId, token) {
        const [existing] = await db.select().from(staffPushTokens).where(eq(staffPushTokens.token, token));
        if (existing) {
          const [updated] = await db.update(staffPushTokens).set({ staffId, updatedAt: /* @__PURE__ */ new Date() }).where(eq(staffPushTokens.token, token)).returning();
          return updated;
        }
        const [created] = await db.insert(staffPushTokens).values({ staffId, token }).returning();
        return created;
      }
      async getStaffPushTokens(staffIds) {
        if (!staffIds.length) return [];
        return db.select().from(staffPushTokens).where(inArray(staffPushTokens.staffId, staffIds));
      }
      async removeStaffPushToken(token) {
        const result = await db.delete(staffPushTokens).where(eq(staffPushTokens.token, token)).returning();
        return result.length > 0;
      }
      // ── Pay rate ────────────────────────────────────────────────────────────────
      async getStaffPay(staffId) {
        const [user] = await db.select({
          payType: staffUsers.payType,
          hourlyRate: staffUsers.hourlyRate,
          annualSalary: staffUsers.annualSalary,
          weeklyHours: staffUsers.weeklyHours
        }).from(staffUsers).where(eq(staffUsers.id, staffId));
        if (!user) return null;
        return {
          payType: user.payType ?? "hourly",
          hourlyRate: user.hourlyRate ? decrypt(user.hourlyRate) : null,
          annualSalary: user.annualSalary ? decrypt(user.annualSalary) : null,
          weeklyHours: user.weeklyHours ?? "37.5"
        };
      }
      async updateStaffPay(staffId, data) {
        await db.update(staffUsers).set({
          payType: data.payType,
          hourlyRate: data.hourlyRate ? encrypt(data.hourlyRate) : null,
          annualSalary: data.annualSalary ? encrypt(data.annualSalary) : null,
          weeklyHours: data.weeklyHours ?? "37.5"
        }).where(eq(staffUsers.id, staffId));
      }
      // ── Document storage ────────────────────────────────────────────────────────
      async getDocumentsForStaff(staffId) {
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
          createdAt: staffDocuments.createdAt
        }).from(staffDocuments).where(eq(staffDocuments.staffId, staffId)).orderBy(desc(staffDocuments.createdAt));
        return rows.map((r) => ({
          ...r,
          fileName: decrypt(r.fileName),
          notes: r.notes ? decrypt(r.notes) : null
        }));
      }
      async getDocumentById(id) {
        const [row] = await db.select().from(staffDocuments).where(eq(staffDocuments.id, id));
        if (!row) return null;
        return {
          ...row,
          fileData: decrypt(row.fileData),
          fileName: decrypt(row.fileName),
          notes: row.notes ? decrypt(row.notes) : null
        };
      }
      async uploadDocument(data) {
        const [doc] = await db.insert(staffDocuments).values({
          ...data,
          fileData: encrypt(data.fileData),
          // AES-256-GCM encrypt file contents at rest
          fileName: encrypt(data.fileName),
          // encrypt filename (may reveal identity)
          notes: data.notes ? encrypt(data.notes) : null
        }).returning();
        return {
          ...doc,
          fileData: data.fileData,
          fileName: data.fileName,
          notes: data.notes ?? null
        };
      }
      async deleteDocument(id) {
        const result = await db.delete(staffDocuments).where(eq(staffDocuments.id, id)).returning();
        return result.length > 0;
      }
      async getAllDocuments() {
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
          createdAt: staffDocuments.createdAt
        }).from(staffDocuments).orderBy(desc(staffDocuments.createdAt));
        return rows.map((r) => ({
          ...r,
          fileName: decrypt(r.fileName),
          notes: r.notes ? decrypt(r.notes) : null
        }));
      }
      // ── Staff onboarding ────────────────────────────────────────────────────────
      decryptOnboarding(row) {
        const d = (v) => v ? decrypt(v) : v;
        return {
          ...row,
          nationalInsurance: d(row.nationalInsurance) ?? null,
          bankAccountName: d(row.bankAccountName) ?? null,
          bankSortCode: d(row.bankSortCode) ?? null,
          bankAccountNumber: d(row.bankAccountNumber) ?? null
        };
      }
      async getOnboarding(staffId) {
        const [row] = await db.select().from(staffOnboarding).where(eq(staffOnboarding.staffId, staffId));
        return row ? this.decryptOnboarding(row) : null;
      }
      async upsertOnboarding(staffId, data) {
        const enc = (v) => v ? encrypt(v) : null;
        const values = {
          ...data,
          staffId,
          nationalInsurance: enc(data.nationalInsurance) ?? void 0,
          bankAccountName: enc(data.bankAccountName) ?? void 0,
          bankSortCode: enc(data.bankSortCode) ?? void 0,
          bankAccountNumber: enc(data.bankAccountNumber) ?? void 0,
          updatedAt: /* @__PURE__ */ new Date()
        };
        const existing = await this.getOnboarding(staffId);
        if (existing) {
          const [updated] = await db.update(staffOnboarding).set(values).where(eq(staffOnboarding.staffId, staffId)).returning();
          return this.decryptOnboarding(updated);
        } else {
          const [created] = await db.insert(staffOnboarding).values(values).returning();
          return this.decryptOnboarding(created);
        }
      }
      async getAllOnboardingStatus() {
        return db.select({
          staffId: staffOnboarding.staffId,
          completedAt: staffOnboarding.completedAt,
          updatedAt: staffOnboarding.updatedAt
        }).from(staffOnboarding);
      }
      // ── Payment log ──────────────────────────────────────────────────────────────
      // Customer PII (name/email/phone) is encrypted at rest, matching the rest of the codebase.
      async createPaymentLog(data) {
        const toStore = {
          ...data,
          customerName: data.customerName ? encrypt(data.customerName) : data.customerName,
          customerEmail: data.customerEmail ? encrypt(data.customerEmail) : data.customerEmail,
          customerPhone: data.customerPhone ? encrypt(data.customerPhone) : data.customerPhone
        };
        const [row] = await db.insert(paymentLog).values(toStore).returning();
        return decryptPaymentLog(row);
      }
      async updatePaymentLog(id, patch) {
        const toStore = { ...patch };
        if (patch.customerName !== void 0) toStore.customerName = patch.customerName ? encrypt(patch.customerName) : patch.customerName;
        if (patch.customerEmail !== void 0) toStore.customerEmail = patch.customerEmail ? encrypt(patch.customerEmail) : patch.customerEmail;
        if (patch.customerPhone !== void 0) toStore.customerPhone = patch.customerPhone ? encrypt(patch.customerPhone) : patch.customerPhone;
        const [row] = await db.update(paymentLog).set(toStore).where(eq(paymentLog.id, id)).returning();
        return row ? decryptPaymentLog(row) : null;
      }
      async listPaymentLogs(limit = 100) {
        const rows = await db.select().from(paymentLog).orderBy(desc(paymentLog.createdAt)).limit(limit);
        return rows.map(decryptPaymentLog);
      }
      async getPaymentLogByIntent(intentId) {
        const [row] = await db.select().from(paymentLog).where(eq(paymentLog.stripePaymentIntentId, intentId));
        return row ? decryptPaymentLog(row) : null;
      }
    };
    storage = new DatabaseStorage();
  }
});

// server/wix-migration.ts
var wix_migration_exports = {};
__export(wix_migration_exports, {
  buildMigrationEmail: () => buildMigrationEmail,
  importWixMembers: () => importWixMembers,
  makeMigrationToken: () => makeMigrationToken,
  parseCsv: () => parseCsv,
  renderMigrationErrorPage: () => renderMigrationErrorPage,
  renderMigrationLandingPage: () => renderMigrationLandingPage,
  resolvePlanId: () => resolvePlanId
});
import { randomBytes as randomBytes2 } from "node:crypto";
function parseCsv(text2) {
  const lines = text2.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const splitLine = (line) => {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") {
          out.push(cur);
          cur = "";
        } else cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const rows = [];
  const findIdx = (...keys) => headers.findIndex((h) => keys.some((k) => h === k || h.includes(k)));
  const idxEmail = findIdx("email", "memberemail", "contactemail");
  const idxName = findIdx("name", "fullname", "membername", "firstname");
  const idxLast = headers.findIndex((h) => h === "lastname" || h === "surname");
  const idxPhone = findIdx("phone", "phonenumber", "mobile");
  const idxPlan = findIdx("plan", "planname", "pricingplan", "membershipplan", "subscription");
  const idxDate = findIdx("nextbilling", "nextpayment", "renewaldate", "expirydate", "nextcharge");
  const idxRef = findIdx("subscriptionid", "orderid", "memberid", "externalid");
  if (idxEmail < 0) {
    throw new Error("CSV is missing an Email column");
  }
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const raw = {};
    headers.forEach((h, idx) => {
      raw[h] = cells[idx] ?? "";
    });
    const email = (cells[idxEmail] || "").trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    let name = idxName >= 0 ? (cells[idxName] || "").trim() : "";
    if (idxLast >= 0) {
      const last = (cells[idxLast] || "").trim();
      if (last) name = (name + " " + last).trim();
    }
    if (!name) name = email.split("@")[0];
    rows.push({
      email,
      name,
      phone: idxPhone >= 0 ? (cells[idxPhone] || "").trim() || void 0 : void 0,
      planHint: idxPlan >= 0 ? (cells[idxPlan] || "").trim() || void 0 : void 0,
      nextBillingDate: idxDate >= 0 ? normaliseDate(cells[idxDate]) : void 0,
      externalRef: idxRef >= 0 ? (cells[idxRef] || "").trim() || void 0 : void 0,
      raw
    });
  }
  return rows;
}
function normaliseDate(input) {
  if (!input) return void 0;
  const s = input.trim();
  if (!s) return void 0;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo}-${d}`;
  }
  const t = Date.parse(s);
  if (!isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return void 0;
}
function makeMigrationToken() {
  return randomBytes2(18).toString("base64url");
}
function resolvePlanId(hint, defaultPlanId, planMap, plans) {
  if (!hint) return defaultPlanId;
  const key = hint.toLowerCase().trim();
  if (planMap[key]) return planMap[key];
  const direct = plans.find((p) => p.name.toLowerCase() === key);
  if (direct) return direct.id;
  const partial = plans.find((p) => key.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(key));
  if (partial) return partial.id;
  return defaultPlanId;
}
async function importWixMembers(opts) {
  const seen = /* @__PURE__ */ new Map();
  for (const r of opts.rows) seen.set(r.email.toLowerCase(), r);
  const dedupedRows = Array.from(seen.values());
  const result = { total: dedupedRows.length, created: 0, updated: 0, skipped: [], rows: [] };
  const plans = await storage.getMembershipPlans();
  for (const row of dedupedRows) {
    try {
      const planId = resolvePlanId(row.planHint, opts.defaultPlanId, opts.planMap, plans);
      if (!plans.find((p) => p.id === planId)) {
        result.skipped.push({ email: row.email, reason: "No matching plan" });
        continue;
      }
      let customer = await storage.getCustomerByEmail(row.email);
      if (!customer) {
        const lockedHash = "!MIGRATED_NO_PASSWORD_" + makeMigrationToken();
        customer = await storage.createCustomer(row.email, row.name, row.phone || null, lockedHash);
      }
      const existing = await storage.getMembershipSubscriptionByCustomer(customer.id).catch(() => null);
      if (existing && existing.status === "active" && existing.source !== "wix_import" && existing.source !== "wix_migrated") {
        result.skipped.push({ email: row.email, reason: "Already has an active membership on this system" });
        continue;
      }
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const periodEnd = row.nextBillingDate || (() => {
        const d = /* @__PURE__ */ new Date();
        d.setMonth(d.getMonth() + 1);
        return d.toISOString().slice(0, 10);
      })();
      const token = existing && existing.migrationToken || makeMigrationToken();
      if (existing) {
        await storage.updateMembershipSubscription(existing.id, {
          planId,
          status: existing.migrationCompletedAt ? existing.status : "active",
          currentPeriodEnd: periodEnd,
          source: existing.migrationCompletedAt ? existing.source : "wix_import",
          migrationToken: token,
          legacyExternalRef: row.externalRef ?? null
        });
        result.updated++;
        result.rows.push({ email: row.email, subscriptionId: existing.id, planId, status: "updated" });
      } else {
        const sub = await storage.createMembershipSubscription({
          customerId: customer.id,
          planId,
          status: "active",
          currentPeriodStart: today,
          currentPeriodEnd: periodEnd,
          hoursUsedThisPeriod: 0,
          guestPassesUsed: 0,
          source: "wix_import",
          migrationToken: token,
          legacyExternalRef: row.externalRef ?? null
        });
        result.created++;
        result.rows.push({ email: row.email, subscriptionId: sub.id, planId, status: "created" });
      }
    } catch (err) {
      result.skipped.push({ email: row.email, reason: err?.message || "Unknown error" });
    }
  }
  return result;
}
function buildMigrationEmail(opts) {
  const firstName = opts.name.split(/\s+/)[0] || "there";
  const priceMonthly = `\xA3${(opts.plan.priceMonthly / 100).toFixed(2)}`;
  const subject = `Action needed: keep your 147 Bradford ${opts.plan.name} membership active`;
  const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f4f3;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f3;padding:40px 20px">
  <tr><td align="center">
    <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
      <tr><td style="background:#0a0a0a;padding:28px 32px;text-align:center">
        <div style="color:#d4af37;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase">The 147 Bradford</div>
      </td></tr>
      <tr><td style="padding:36px 32px 24px">
        <h1 style="margin:0 0 18px;font-size:22px;font-weight:700;color:#0a0a0a">Hi ${escapeHtml(firstName)},</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#333">We've moved our membership system from our old website over to a brand new app and member dashboard \u2014 packed with new perks like priority booking, in-app ordering and loyalty points.</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#333">Your <strong>${escapeHtml(opts.plan.name)}</strong> membership has been moved across at the same price you pay today (<strong>${priceMonthly}/month</strong>) \u2014 all your benefits are already active. The only thing we need from you is to set up your card on the new system, since for security reasons we can't transfer your old card details.</p>
        <p style="margin:0 0 28px;font-size:15px;line-height:1.55;color:#333">It only takes about a minute. Apple Pay and Google Pay are supported.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr><td style="border-radius:10px;background:#d4af37">
          <a href="${opts.migrateUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#0a0a0a;text-decoration:none;border-radius:10px">Set up my card \u2192</a>
        </td></tr></table>
        <p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:#777">If the button doesn't work, copy this link into your browser:<br/><a href="${opts.migrateUrl}" style="color:#7a6a2e;word-break:break-all">${opts.migrateUrl}</a></p>
      </td></tr>
      <tr><td style="padding:20px 32px 32px;border-top:1px solid #ececec;font-size:12px;color:#999;line-height:1.5">
        Questions? Just reply to this email \u2014 a real person will get back to you.<br/>
        <strong style="color:#666">The 147 Bradford</strong> \xB7 Family-friendly snooker, pool &amp; darts venue.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  return { subject, html };
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function renderMigrationLandingPage(opts) {
  const name = escapeHtml(opts.customer.name.split(/\s+/)[0] || "");
  const priceMonthly = (opts.plan.priceMonthly / 100).toFixed(2);
  const planName = escapeHtml(opts.plan.name);
  const renews = opts.sub.currentPeriodEnd ? new Date(opts.sub.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "next month";
  if (opts.alreadyDone) {
    return wrapMigrationPage(`
      <div style="text-align:center">
        <div style="width:64px;height:64px;border-radius:50%;background:#e8f7ee;display:inline-flex;align-items:center;justify-content:center;margin-bottom:18px">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22a960" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h1 style="margin:0 0 10px;font-size:26px">You're all set, ${name}.</h1>
        <p style="margin:0 0 26px;font-size:15px;color:#555;line-height:1.55">Your <strong>${planName}</strong> membership is fully active on the new system. We'll see you at the venue.</p>
        <a href="/test-site" style="display:inline-block;padding:13px 28px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px">Visit site</a>
      </div>
    `);
  }
  return wrapMigrationPage(`
    <h1 style="margin:0 0 10px;font-size:26px;font-weight:700">Welcome to the new system, ${name}.</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.55">Your membership has already been moved across \u2014 we just need you to set up your card so we can take next month's payment on <strong>${renews}</strong>.</p>
    <div style="background:#faf6e8;border:1px solid #e8dcb1;border-radius:12px;padding:18px 20px;margin:0 0 26px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#7a6a2e;margin-bottom:6px">Your plan</div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="font-size:19px;font-weight:700;color:#0a0a0a">${planName}</div>
        <div style="font-size:18px;font-weight:700;color:#0a0a0a">\xA3${priceMonthly}<span style="font-size:13px;font-weight:500;color:#888">/month</span></div>
      </div>
    </div>
    <button id="migrateBtn" style="width:100%;padding:15px;background:#d4af37;color:#0a0a0a;border:0;border-radius:12px;font-weight:700;font-size:15px;cursor:pointer">Set up my card with Square \u2192</button>
    <div id="migrateErr" style="display:none;margin-top:14px;padding:12px;background:#fef0f0;border:1px solid #f5c2c2;border-radius:8px;color:#a02525;font-size:13px"></div>
    <p style="margin:22px 0 0;font-size:12px;color:#888;line-height:1.5;text-align:center">Payment is processed securely by Square. We never see or store your card details. Apple Pay and Google Pay are supported.</p>
    <script>
      document.getElementById('migrateBtn').addEventListener('click', async function(){
        var btn=this; var err=document.getElementById('migrateErr');
        btn.disabled=true; btn.textContent='Loading\u2026'; err.style.display='none';
        try{
          var r=await fetch(${JSON.stringify(`/api/migrate/${opts.token}/checkout`)},{method:'POST'});
          var d=await r.json();
          if(!r.ok||!d.checkoutUrl)throw new Error(d.message||'Could not start checkout');
          window.location.href=d.checkoutUrl;
        }catch(e){
          err.textContent=e.message||'Something went wrong. Please try again.';
          err.style.display='block';
          btn.disabled=false; btn.textContent='Set up my card with Square \u2192';
        }
      });
    </script>
  `);
}
function renderMigrationErrorPage(message) {
  return wrapMigrationPage(`
    <div style="text-align:center">
      <h1 style="margin:0 0 12px;font-size:22px">Link not valid</h1>
      <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.5">${escapeHtml(message)}</p>
      <p style="margin:0;font-size:13px;color:#888">If you think this is a mistake, please reply to the email we sent you and we'll sort it out.</p>
    </div>
  `);
}
function wrapMigrationPage(inner) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Activate your membership \xB7 The 147 Bradford</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:0;background:#f4f4f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased}
  .page{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:40px 18px}
  .brand{color:#d4af37;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:24px}
  .card{width:100%;max-width:480px;background:#ffffff;border-radius:18px;padding:36px 32px;box-shadow:0 4px 18px rgba(0,0,0,0.06)}
  @media (max-width:480px){.card{padding:28px 22px}}
</style></head>
<body><div class="page"><div class="brand">The 147 Bradford</div><div class="card">${inner}</div></div></body></html>`;
}
var init_wix_migration = __esm({
  "server/wix-migration.ts"() {
    "use strict";
    init_storage();
  }
});

// server/web-content.ts
var web_content_exports = {};
__export(web_content_exports, {
  WEB_PAGES: () => WEB_PAGES,
  applyWebContentOverrides: () => applyWebContentOverrides,
  getEditorPayload: () => getEditorPayload,
  renderWebText: () => renderWebText,
  saveOverride: () => saveOverride
});
function renderWebText(value) {
  return escapeHtml2(value).replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}
async function applyWebContentOverrides(slug, html) {
  const overrides = await loadOverridesForPage(slug);
  if (!overrides || Object.keys(overrides).length === 0) return html;
  return html.replace(
    /<!--WEB:([a-z0-9_\-]+):([a-z0-9_\-]+)-->[\s\S]*?<!--\/WEB-->/g,
    (full, pageSlug, blockKey) => {
      if (pageSlug !== slug) return full;
      const v = overrides[blockKey];
      if (v == null || v === "") return full;
      return `<!--WEB:${pageSlug}:${blockKey}-->${renderWebText(v)}<!--/WEB-->`;
    }
  );
}
async function loadOverridesForPage(slug) {
  const page = WEB_PAGES.find((p) => p.slug === slug);
  if (!page) return {};
  const out = {};
  await Promise.all(
    page.blocks.map(async (b) => {
      try {
        const v = await storage.getSetting(settingKey(slug, b.key));
        if (v != null && v !== "") out[b.key] = v;
      } catch {
      }
    })
  );
  return out;
}
async function getEditorPayload() {
  return await Promise.all(
    WEB_PAGES.map(async (page) => {
      const blocks = await Promise.all(
        page.blocks.map(async (b) => {
          let value = "";
          try {
            const v = await storage.getSetting(settingKey(page.slug, b.key));
            if (v != null) value = v;
          } catch {
          }
          return { ...b, value };
        })
      );
      return { slug: page.slug, label: page.label, blocks };
    })
  );
}
async function saveOverride(slug, key, value) {
  const page = WEB_PAGES.find((p) => p.slug === slug);
  if (!page) throw new Error("Unknown page");
  if (!page.blocks.find((b) => b.key === key)) throw new Error("Unknown block");
  await storage.setSetting(settingKey(slug, key), String(value ?? ""));
}
var WEB_PAGES, settingKey, escapeHtml2;
var init_web_content = __esm({
  "server/web-content.ts"() {
    "use strict";
    init_storage();
    WEB_PAGES = [
      {
        slug: "home",
        label: "Home",
        blocks: [
          { key: "hero_eyebrow", label: "Hero \xB7 small label", type: "text" },
          { key: "hero_title", label: "Hero \xB7 headline", type: "text", hint: "Use *word* to highlight a word in gold italic." },
          { key: "hero_sub", label: "Hero \xB7 subtitle", type: "textarea" }
        ]
      },
      {
        slug: "snooker",
        label: "Snooker",
        blocks: [
          { key: "hero_eyebrow", label: "Hero \xB7 small label", type: "text" },
          { key: "hero_title", label: "Hero \xB7 headline", type: "text", hint: "Use *word* to highlight a word in gold italic." },
          { key: "hero_sub", label: "Hero \xB7 subtitle", type: "textarea" }
        ]
      },
      {
        slug: "dining",
        label: "Dining",
        blocks: [
          { key: "hero_eyebrow", label: "Hero \xB7 small label", type: "text" },
          { key: "hero_title", label: "Hero \xB7 headline", type: "text", hint: "Use *word* to highlight a word in gold italic." },
          { key: "hero_sub", label: "Hero \xB7 subtitle", type: "textarea" }
        ]
      },
      {
        slug: "events",
        label: "Events",
        blocks: [
          { key: "hero_eyebrow", label: "Hero \xB7 small label", type: "text" },
          { key: "hero_title", label: "Hero \xB7 headline", type: "text", hint: "Use *word* to highlight a word in gold italic." },
          { key: "hero_sub", label: "Hero \xB7 subtitle", type: "textarea" }
        ]
      },
      {
        slug: "function-rooms",
        label: "Function Rooms",
        blocks: [
          { key: "hero_eyebrow", label: "Hero \xB7 small label", type: "text" },
          { key: "hero_title", label: "Hero \xB7 headline", type: "text", hint: "Use *word* to highlight a word in gold italic." },
          { key: "hero_sub", label: "Hero \xB7 subtitle", type: "textarea" }
        ]
      },
      {
        slug: "gift-cards",
        label: "Gift Cards",
        blocks: [
          { key: "hero_eyebrow", label: "Hero \xB7 small label", type: "text" },
          { key: "hero_title", label: "Hero \xB7 headline", type: "text", hint: "Use *word* to highlight a word in gold italic." },
          { key: "hero_sub", label: "Hero \xB7 subtitle", type: "textarea" }
        ]
      },
      {
        slug: "contact",
        label: "Contact",
        blocks: [
          { key: "hero_eyebrow", label: "Hero \xB7 small label", type: "text" },
          { key: "hero_title", label: "Hero \xB7 headline", type: "text", hint: "Use *word* to highlight a word in gold italic." },
          { key: "hero_sub", label: "Hero \xB7 subtitle", type: "textarea" }
        ]
      }
    ];
    settingKey = (slug, key) => `web:${slug}:${key}`;
    escapeHtml2 = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
});

// server/index.ts
import express from "express";

// server/routes.ts
init_storage();
init_schema();
init_encryption();
import { createServer } from "node:http";
import { randomBytes as randomBytes3, timingSafeEqual, createHash as createHash2 } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import multer from "multer";
import sharp from "sharp";
import nodemailer from "nodemailer";

// server/square.ts
var SQUARE_BASE_URL = process.env.SQUARE_ENVIRONMENT === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
function getLocationId() {
  const loc = process.env.SQUARE_LOC_ID || process.env.SQUARE_LOCATION_ID;
  if (!loc) throw new Error("SQUARE_LOCATION_ID not configured");
  return loc;
}
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
  const locationId = getLocationId();
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
  const locationId = getLocationId();
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
  return !!(process.env.SQUARE_ACCESS_TOKEN && (process.env.SQUARE_LOC_ID || process.env.SQUARE_LOCATION_ID));
}
function getApplicationId() {
  return process.env.SQUARE_APPLICATION_ID || null;
}
function getEnvironment() {
  return process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
}
function getPublicLocationId() {
  return process.env.SQUARE_LOC_ID || process.env.SQUARE_LOCATION_ID || null;
}
function isWebPaymentsConfigured() {
  return !!(getApplicationId() && getPublicLocationId() && process.env.SQUARE_ACCESS_TOKEN);
}
async function createCardPayment(opts) {
  const body = {
    idempotency_key: opts.idempotencyKey,
    source_id: opts.sourceId,
    amount_money: { amount: opts.amountPence, currency: "GBP" },
    location_id: getLocationId(),
    autocomplete: true
  };
  if (opts.note) body.note = opts.note.slice(0, 500);
  if (opts.referenceId) body.reference_id = opts.referenceId.slice(0, 40);
  if (opts.buyerEmail) body.buyer_email_address = opts.buyerEmail;
  if (opts.verificationToken) body.verification_token = opts.verificationToken;
  if (opts.orderId) body.order_id = opts.orderId;
  const data = await squareRequest("POST", "/v2/payments", body);
  return data.payment;
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
async function createSquareSubscription(squareCustomerId, planVariationId, locationId, cardId, startDate) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const body = {
    idempotency_key: `sub-${squareCustomerId}-${Date.now()}`,
    location_id: locationId,
    plan_variation_id: planVariationId,
    customer_id: squareCustomerId,
    start_date: startDate || today
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
async function listSquareSubscriptionsForCustomer(squareCustomerId) {
  const data = await squareRequest("POST", "/v2/subscriptions/search", {
    query: { filter: { customer_ids: [squareCustomerId] } }
  });
  return data.subscriptions || [];
}
async function createDepositPaymentLink(opts) {
  const locationId = getLocationId();
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
  const locationId = getLocationId();
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
async function createSubscriptionCheckoutLink(opts) {
  const body = {
    idempotency_key: `sub-checkout-${opts.subscriptionId}-${Date.now()}`,
    subscription_plan_variation_id: opts.planVariationId,
    checkout_options: {
      redirect_url: opts.redirectUrl,
      subscription_cancel_url: "https://the147bradford.replit.app/membership"
    }
  };
  if (opts.buyerEmail) {
    body.pre_populated_data = { buyer_email: opts.buyerEmail };
  }
  const data = await squareRequest("POST", "/v2/online-checkout/payment-links", body);
  const link = data.payment_link;
  return { url: link.url, paymentLinkId: link.id };
}
async function createCatalogSubscriptionPlan(opts) {
  const tempPlanId = `#plan-${opts.localPlanId}`;
  const tempVarId = `#var-${opts.localPlanId}`;
  const data = await squareRequest("POST", "/v2/catalog/batch-upsert", {
    idempotency_key: `147-membership-plan-${opts.localPlanId}-${Date.now()}`,
    batches: [
      {
        objects: [
          {
            type: "SUBSCRIPTION_PLAN",
            id: tempPlanId,
            subscription_plan_data: {
              name: `The 147 Bradford \u2014 ${opts.name} Membership`,
              subscription_plan_variations: [
                {
                  type: "SUBSCRIPTION_PLAN_VARIATION",
                  id: tempVarId,
                  subscription_plan_variation_data: {
                    name: "Monthly",
                    phases: [
                      {
                        cadence: "MONTHLY",
                        pricing: {
                          type: "STATIC",
                          price_money: {
                            amount: opts.amountPence,
                            currency: "GBP"
                          }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  });
  const idMapping = data.id_mappings?.reduce(
    (acc, m) => {
      acc[m.client_object_id] = m.object_id;
      return acc;
    },
    {}
  ) ?? {};
  const squarePlanId = idMapping[tempPlanId] ?? "";
  const squarePlanVariationId = idMapping[tempVarId] ?? "";
  if (!squarePlanVariationId) {
    throw new Error(`Square did not return a variation ID for plan ${opts.name}`);
  }
  return { planId: opts.localPlanId, squarePlanId, squarePlanVariationId };
}
async function syncPlanToSquareCatalog(opts) {
  let newVariationId = null;
  if (opts.priceChanged) {
    const result = await createCatalogSubscriptionPlan({
      localPlanId: opts.localPlanId,
      name: opts.planName,
      amountPence: opts.newAmountPence
    });
    newVariationId = result.squarePlanVariationId;
    return { newVariationId };
  }
  if (opts.nameChanged) {
    const current = await squareRequest(
      "GET",
      `/v2/catalog/object/${opts.planVariationId}?include_related_objects=true`
    ).catch(() => null);
    const parentPlanId = current?.object?.subscription_plan_variation_data?.subscription_plan_id;
    if (parentPlanId) {
      const parentData = await squareRequest("GET", `/v2/catalog/object/${parentPlanId}`).catch(() => null);
      if (parentData?.object) {
        await squareRequest("POST", "/v2/catalog/object", {
          idempotency_key: `update-plan-name-${parentPlanId}-${Date.now()}`,
          object: {
            type: "SUBSCRIPTION_PLAN",
            id: parentPlanId,
            version: parentData.object.version,
            subscription_plan_data: {
              name: `The 147 Bradford \u2014 ${opts.planName} Membership`
            }
          }
        }).catch(() => {
        });
      }
    }
  }
  return { newVariationId };
}
function membershipGroupName(planName) {
  return `147 Bradford \u2014 ${planName} Members`;
}
var PARENT_CATEGORY_IDS = /* @__PURE__ */ new Set([
  "U4FPHVKPDJ3APM2V4NCNDRTK",
  "EZKBBONU2F3MW2D2YIAKCUFQ",
  "OJC6HWZ2YC274FOIWONUY2FI",
  "C7GP3UY7G5KANXQH6TSG4QN3"
]);
var SKIP_ITEMS = /* @__PURE__ */ new Set([
  "Platinum Membership",
  "Click and collect (example service)"
]);
var CATEGORY_ORDER = {
  "Starters": 1,
  "Sharers": 2,
  "Light Bites": 3,
  "Pub Classic Mains": 4,
  "Burgers": 5,
  "Turkish Mains": 6,
  "Loaded Fries Menu": 7,
  "Pastas": 8,
  "Panini": 9,
  "Toasties": 10,
  "Build Your Own Pizza": 11,
  "Breakfast & Baps": 12,
  "Sides": 13,
  "Extras": 14,
  "Snack's": 15,
  "Snacks": 16,
  "Kids Mains": 17,
  "Kids": 18,
  "Kids Puddings": 19,
  "Puddings": 20,
  "Golden Years - Starters": 21,
  "Golden Years - Mains": 22,
  "Golden Years - Puddings": 23,
  "Draught": 24,
  "Drinks - Draught": 24,
  "Beer": 25,
  "Bitters & Stouts": 26,
  "Cider": 27,
  "Bottles": 28,
  "Bottles - Beers": 29,
  "Bottles - Cider": 30,
  "Soft Drinks": 31,
  "Soft drinks": 31,
  "Bottled Soft Drinks": 32,
  "Low & No alcohol": 33,
  "Spirits": 34,
  "Spirits - Shots & Bombs": 35,
  "Wine": 36,
  "Drinks - Wines - Wine Promo": 37,
  "Hot Drinks": 38,
  "Offers & Promotions": 39,
  "Snooker, Darts": 40,
  "Darts": 41
};
var DEAL_EXCLUDE_PATTERNS = [
  /next.?time/i,
  /next.?visit/i,
  /next.?purchase/i,
  /\bstaff\b/i,
  /\bmember\b/i,
  /\bplatinum\b/i,
  /\bgold\b/i,
  /\bvip\b/i,
  /blue.?light/i,
  /\bbulls?\b/i,
  /loyalty/i
];
var dealsCache = null;
async function getSquareDeals() {
  if (dealsCache && Date.now() < dealsCache.expiry) return dealsCache.data;
  try {
    const [discountData, ruleData, productSetData] = await Promise.all([
      squareRequest("POST", "/v2/catalog/search", {
        object_types: ["DISCOUNT"],
        include_deleted_objects: false
      }),
      squareRequest("POST", "/v2/catalog/search", {
        object_types: ["PRICING_RULE"],
        include_deleted_objects: false
      }),
      squareRequest("POST", "/v2/catalog/search", {
        object_types: ["PRODUCT_SET"],
        include_deleted_objects: false
      })
    ]);
    const productSetMap = /* @__PURE__ */ new Map();
    for (const o of productSetData.objects || []) {
      if (o.type !== "PRODUCT_SET" || o.is_deleted) continue;
      const ids = o.product_set_data?.product_ids_any || [];
      if (ids.length > 0) productSetMap.set(o.id, ids);
    }
    const allProductIds = [...new Set([...productSetMap.values()].flat())];
    const variationParentItemId = /* @__PURE__ */ new Map();
    if (allProductIds.length > 0) {
      try {
        const batchData = await squareRequest("POST", "/v2/catalog/batch-retrieve", {
          object_ids: allProductIds,
          include_related_objects: false
        });
        for (const o of batchData.objects || []) {
          if (o.type === "ITEM_VARIATION" && o.item_variation_data?.item_id) {
            variationParentItemId.set(o.id, o.item_variation_data.item_id);
          }
        }
      } catch {
      }
    }
    const expiryByDiscountId = /* @__PURE__ */ new Map();
    const variationsByDiscountId = /* @__PURE__ */ new Map();
    for (const o of ruleData.objects || []) {
      if (o.type !== "PRICING_RULE" || o.is_deleted) continue;
      const pd = o.pricing_rule_data || {};
      if (!pd.discount_id) continue;
      if (pd.valid_until_date) {
        const existing = expiryByDiscountId.get(pd.discount_id);
        if (!existing || pd.valid_until_date < existing) {
          expiryByDiscountId.set(pd.discount_id, pd.valid_until_date);
        }
      }
      if (pd.match_products_id) {
        const ids = productSetMap.get(pd.match_products_id) || [];
        if (ids.length > 0) {
          const expanded = new Set(ids);
          for (const id of ids) {
            const parentItemId = variationParentItemId.get(id);
            if (parentItemId) expanded.add(parentItemId);
          }
          const existing = variationsByDiscountId.get(pd.discount_id) || [];
          variationsByDiscountId.set(pd.discount_id, [.../* @__PURE__ */ new Set([...existing, ...expanded])]);
        }
      }
    }
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const seen = /* @__PURE__ */ new Set();
    const deals = [];
    for (const o of discountData.objects || []) {
      if (o.type !== "DISCOUNT" || o.is_deleted) continue;
      const dd = o.discount_data || {};
      const name = (dd.name || "").trim();
      if (!name) continue;
      if (DEAL_EXCLUDE_PATTERNS.some((p) => p.test(name))) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const expiresOn = expiryByDiscountId.get(o.id);
      if (expiresOn && expiresOn < today) continue;
      const applicableVariationIds = variationsByDiscountId.get(o.id);
      deals.push({
        id: o.id,
        name,
        discountType: dd.discount_type === "FIXED_AMOUNT" ? "FIXED_AMOUNT" : "FIXED_PERCENTAGE",
        percentage: dd.percentage,
        amountPence: dd.amount_money?.amount,
        ...expiresOn ? { expiresOn } : {},
        ...applicableVariationIds ? { applicableVariationIds } : {}
      });
    }
    dealsCache = { data: deals, expiry: Date.now() + 5 * 60 * 1e3 };
    return deals;
  } catch {
    return dealsCache?.data ?? [];
  }
}
var menuCache = null;
async function getMenuFromSquare() {
  if (menuCache && Date.now() < menuCache.expiry) return menuCache.data;
  let allItems = [];
  let cursor = null;
  do {
    const url = `/v2/catalog/list?types=ITEM${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const data = await squareRequest("GET", url);
    allItems = allItems.concat(data.objects || []);
    cursor = data.cursor || null;
  } while (cursor);
  const items = allItems.filter(
    (o) => o.type === "ITEM" && !SKIP_ITEMS.has(o.item_data?.name)
  );
  const subcatIds = /* @__PURE__ */ new Set();
  const modifierListIds = /* @__PURE__ */ new Set();
  items.forEach((item) => {
    (item.item_data?.categories || []).forEach((c) => {
      if (!PARENT_CATEGORY_IDS.has(c.id)) subcatIds.add(c.id);
    });
    (item.item_data?.modifier_list_info || []).forEach((m) => {
      if (m.enabled !== false) modifierListIds.add(m.modifier_list_id);
    });
  });
  const catNames = {};
  const catImageIds = {};
  if (subcatIds.size > 0) {
    const catData = await squareRequest("POST", "/v2/catalog/batch-retrieve", {
      object_ids: Array.from(subcatIds)
    });
    (catData.objects || []).forEach((o) => {
      catNames[o.id] = o.category_data?.name || "Other";
      if (o.category_data?.image_ids?.[0]) {
        catImageIds[o.id] = o.category_data.image_ids[0];
      }
    });
  }
  const modifierListMap = {};
  if (modifierListIds.size > 0) {
    const modIds = Array.from(modifierListIds);
    for (let i = 0; i < modIds.length; i += 100) {
      try {
        const chunk = modIds.slice(i, i + 100);
        const modData = await squareRequest("POST", "/v2/catalog/batch-retrieve", {
          object_ids: chunk
        });
        (modData.objects || []).forEach((o) => {
          if (o.type !== "MODIFIER_LIST") return;
          const mld = o.modifier_list_data || {};
          modifierListMap[o.id] = {
            id: o.id,
            name: mld.name || "",
            selectionType: mld.selection_type === "MULTIPLE" ? "MULTIPLE" : "SINGLE",
            minSelections: mld.min_selected_modifiers ?? (mld.selection_type === "SINGLE" ? 1 : 0),
            maxSelections: mld.max_selected_modifiers ?? (mld.selection_type === "SINGLE" ? 1 : 999),
            options: (mld.modifiers || []).map((m) => ({
              id: m.id,
              name: m.modifier_data?.name || "",
              price: m.modifier_data?.price_money?.amount || 0
            }))
          };
        });
      } catch {
      }
    }
  }
  const itemImageIds = {};
  items.forEach((item) => {
    if (item.item_data?.image_ids?.[0]) {
      itemImageIds[item.id] = item.item_data.image_ids[0];
    }
  });
  const allImageObjectIds = [
    .../* @__PURE__ */ new Set([...Object.values(itemImageIds), ...Object.values(catImageIds)])
  ];
  const imageUrlMap = {};
  if (allImageObjectIds.length > 0) {
    for (let i = 0; i < allImageObjectIds.length; i += 100) {
      try {
        const chunk = allImageObjectIds.slice(i, i + 100);
        const imgData = await squareRequest("POST", "/v2/catalog/batch-retrieve", {
          object_ids: chunk
        });
        (imgData.objects || []).forEach((o) => {
          if (o.image_data?.url) imageUrlMap[o.id] = o.image_data.url;
        });
      } catch {
      }
    }
  }
  const categoryMap = {};
  items.forEach((item) => {
    const subcatId = (item.item_data?.categories || []).find(
      (c) => !PARENT_CATEGORY_IDS.has(c.id)
    )?.id;
    if (!subcatId) return;
    const variations = item.item_data?.variations || [];
    if (!variations.length) return;
    if (!categoryMap[subcatId]) {
      const catImgId = catImageIds[subcatId];
      categoryMap[subcatId] = {
        name: catNames[subcatId] || "Other",
        imageUrl: catImgId ? imageUrlMap[catImgId] : void 0,
        items: []
      };
    }
    const itemImgId = itemImageIds[item.id];
    const itemImageUrl = itemImgId ? imageUrlMap[itemImgId] : void 0;
    const hasMultiple = variations.length > 1;
    const isGenericName = (n) => ["regular", "standard", ""].includes(n.toLowerCase());
    const hasMeaningfulVariations = hasMultiple && variations.some((v) => !isGenericName(v.item_variation_data?.name || ""));
    const variationsToShow = hasMeaningfulVariations ? variations : [variations[0]];
    const itemModifiers = (item.item_data?.modifier_list_info || []).filter((m) => m.enabled !== false && modifierListMap[m.modifier_list_id]).map((m) => modifierListMap[m.modifier_list_id]);
    variationsToShow.forEach((variation) => {
      const rawVarName = variation.item_variation_data?.name || "";
      const variationName = hasMeaningfulVariations && !isGenericName(rawVarName) ? rawVarName : void 0;
      categoryMap[subcatId].items.push({
        id: item.id,
        variationId: variation.id,
        name: item.item_data.name,
        variationName,
        description: item.item_data.description || "",
        price: variation.item_variation_data?.price_money?.amount || 0,
        imageUrl: itemImageUrl,
        ...itemModifiers.length > 0 ? { modifiers: itemModifiers } : {}
      });
    });
  });
  const result = Object.entries(categoryMap).map(([id, { name, imageUrl, items: its }]) => ({
    id,
    name,
    imageUrl,
    items: its.sort((a, b) => a.name.localeCompare(b.name))
  })).sort((a, b) => {
    const oa = CATEGORY_ORDER[a.name] ?? 99;
    const ob = CATEGORY_ORDER[b.name] ?? 99;
    return oa !== ob ? oa - ob : a.name.localeCompare(b.name);
  });
  menuCache = { data: result, expiry: Date.now() + 5 * 60 * 1e3 };
  return result;
}
function invalidateMenuCache() {
  menuCache = null;
}
function normalizeUkPhone(phone) {
  const digits = phone.replace(/[\s\-\(\)]/g, "");
  if (digits.startsWith("+44")) return digits;
  if (digits.startsWith("44") && digits.length >= 12) return "+" + digits;
  if (digits.startsWith("07") && digits.length === 11) return "+44" + digits.slice(1);
  if (digits.startsWith("7") && digits.length === 10) return "+44" + digits;
  return void 0;
}
async function buildSquareOrderBody(items, tableNote, customer, discountPercent, discountLabel, excludeWithDeals, orderNote) {
  const locationId = getLocationId();
  let prePopulated;
  if (customer?.email || customer?.name || customer?.phone) {
    prePopulated = {};
    if (customer.email) prePopulated.buyer_email = customer.email;
    if (customer.phone) {
      const e164 = normalizeUkPhone(customer.phone);
      if (e164) prePopulated.buyer_phone_number = e164;
    }
    if (customer.name) {
      const parts = customer.name.trim().split(/\s+/);
      const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
      prePopulated.buyer_address = {
        first_name: parts[0],
        ...lastName ? { last_name: lastName } : {}
      };
    }
  }
  const ticketName = tableNote || (customer?.name ? customer.name.split(" ")[0] : "Guest");
  const memberDiscountUid = "MEMBER-DISCOUNT";
  const activeDeals = await getSquareDeals().catch(() => []);
  const dealByVariationId = /* @__PURE__ */ new Map();
  for (const deal of activeDeals) {
    if (!deal.applicableVariationIds) continue;
    for (const vid of deal.applicableVariationIds) {
      if (!dealByVariationId.has(vid)) dealByVariationId.set(vid, deal);
    }
  }
  const matchedDeals = items.filter((i) => dealByVariationId.has(i.variationId) || i.itemId && dealByVariationId.has(i.itemId)).map((i) => (dealByVariationId.get(i.variationId) ?? dealByVariationId.get(i.itemId)).name);
  const hasMemberDiscount = typeof discountPercent === "number" && discountPercent > 0;
  const dealsInCart = matchedDeals.length > 0;
  const itemLevelMemberDiscount = hasMemberDiscount && excludeWithDeals && dealsInCart;
  const orderLevelMemberDiscount = hasMemberDiscount && !itemLevelMemberDiscount;
  const orderDiscounts = orderLevelMemberDiscount ? [{
    uid: memberDiscountUid,
    name: discountLabel ?? "Member Discount",
    type: "FIXED_PERCENTAGE",
    percentage: String(discountPercent),
    scope: "ORDER"
  }] : itemLevelMemberDiscount ? [{
    uid: memberDiscountUid,
    name: discountLabel ?? "Member Discount",
    type: "FIXED_PERCENTAGE",
    percentage: String(discountPercent),
    scope: "LINE_ITEM"
  }] : [];
  const lineItems = items.map((item, idx) => {
    const lineUid = `li-${idx}`;
    const deal = dealByVariationId.get(item.variationId) ?? (item.itemId ? dealByVariationId.get(item.itemId) : void 0);
    const appliedDiscounts = [];
    if (deal) {
      const discountUid = `deal-${idx}`;
      if (deal.discountType === "FIXED_AMOUNT" && deal.amountPence != null) {
        orderDiscounts.push({
          uid: discountUid,
          name: deal.name,
          type: "FIXED_AMOUNT",
          amount_money: { amount: deal.amountPence * item.quantity, currency: "GBP" },
          scope: "LINE_ITEM"
        });
      } else if (deal.discountType === "FIXED_PERCENTAGE" && deal.percentage) {
        orderDiscounts.push({
          uid: discountUid,
          name: deal.name,
          type: "FIXED_PERCENTAGE",
          percentage: deal.percentage,
          scope: "LINE_ITEM"
        });
      }
      if (orderDiscounts.find((d) => d.uid === discountUid)) {
        appliedDiscounts.push({ discount_uid: discountUid });
      }
    } else if (itemLevelMemberDiscount) {
      appliedDiscounts.push({ discount_uid: memberDiscountUid });
    }
    return {
      uid: lineUid,
      catalog_object_id: item.variationId,
      quantity: String(item.quantity),
      base_price_money: { amount: item.price, currency: "GBP" },
      ...item.modifiers?.length ? {
        modifiers: item.modifiers.map((m) => ({
          catalog_object_id: m.catalogObjectId,
          base_price_money: { amount: m.price, currency: "GBP" }
        }))
      } : {},
      ...appliedDiscounts.length ? { applied_discounts: appliedDiscounts } : {}
    };
  });
  const noteParts = [tableNote, orderNote].filter(Boolean);
  const combinedNote = noteParts.join(" | ");
  const order = {
    location_id: locationId,
    line_items: lineItems,
    ...orderDiscounts.length ? { discounts: orderDiscounts } : {},
    fulfillments: [
      {
        type: "PICKUP",
        state: "PROPOSED",
        pickup_details: {
          recipient: { display_name: ticketName.slice(0, 60) },
          schedule_type: "ASAP",
          is_curbside_pickup: false,
          note: combinedNote || void 0
        }
      }
    ],
    ...combinedNote ? {
      note: combinedNote.slice(0, 500),
      reference_id: (tableNote || "ORDER").replace(/\s+/g, "-").toUpperCase().slice(0, 40)
    } : {}
  };
  return { order, prePopulated };
}
async function createSquareOrderForCheckout(items, tableNote, customer, discountPercent, discountLabel, excludeWithDeals, orderNote) {
  const idempotencyKey = `order-create-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const { order } = await buildSquareOrderBody(
    items,
    tableNote,
    customer,
    discountPercent,
    discountLabel,
    excludeWithDeals,
    orderNote
  );
  const data = await squareRequest("POST", "/v2/orders", {
    idempotency_key: idempotencyKey,
    order
  });
  if (!data.order?.id) throw new Error("No order returned from Square");
  const totalPence = Number(data.order.total_money?.amount ?? data.order.net_amounts?.total_money?.amount ?? 0);
  return { orderId: data.order.id, totalPence };
}
async function createOrderCheckoutLink(items, tableNote, customer, discountPercent, discountLabel, excludeWithDeals, orderNote) {
  const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const { order, prePopulated } = await buildSquareOrderBody(
    items,
    tableNote,
    customer,
    discountPercent,
    discountLabel,
    excludeWithDeals,
    orderNote
  );
  const body = {
    idempotency_key: idempotencyKey,
    order,
    checkout_options: {
      allow_tipping: false,
      ...prePopulated ? { pre_populated_data: prePopulated } : {}
    }
  };
  const data = await squareRequest("POST", "/v2/online-checkout/payment-links", body);
  if (!data.payment_link?.url) throw new Error("No checkout URL returned from Square");
  return {
    url: data.payment_link.url,
    linkId: data.payment_link.id ?? "",
    squareOrderId: data.payment_link.order_id ?? ""
  };
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

// server/stripe.ts
import Stripe from "stripe";
var cachedClient = null;
var cachedKey = null;
function isStripeConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY);
}
function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
  }
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new Stripe(key, { apiVersion: "2024-11-20.acacia" });
    cachedKey = key;
  }
  return cachedClient;
}
function getPublishableKey() {
  return process.env.STRIPE_PUBLISHABLE_KEY || null;
}

// server/uk-leave-utils.ts
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(Date.UTC(year, month - 1, day));
}
function addDays(d, n) {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
function toIso(d) {
  return d.toISOString().slice(0, 10);
}
function substituteWeekend(d) {
  const dow = d.getUTCDay();
  if (dow === 6) return addDays(d, 2);
  if (dow === 0) return addDays(d, 1);
  return d;
}
function getEnglandWalesBankHolidays(year) {
  const holidays = [];
  holidays.push(substituteWeekend(new Date(Date.UTC(year, 0, 1))));
  const easter = easterSunday(year);
  holidays.push(addDays(easter, -2));
  holidays.push(addDays(easter, 1));
  const may1 = new Date(Date.UTC(year, 4, 1));
  const may1dow = may1.getUTCDay();
  const firstMayMonday = may1dow === 1 ? may1 : addDays(may1, (8 - may1dow) % 7);
  holidays.push(firstMayMonday);
  const may31 = new Date(Date.UTC(year, 4, 31));
  const may31dow = may31.getUTCDay();
  const lastMayMonday = may31dow === 1 ? may31 : addDays(may31, -(may31dow === 0 ? 6 : may31dow - 1));
  holidays.push(lastMayMonday);
  const aug31 = new Date(Date.UTC(year, 7, 31));
  const aug31dow = aug31.getUTCDay();
  const lastAugMonday = aug31dow === 1 ? aug31 : addDays(aug31, -(aug31dow === 0 ? 6 : aug31dow - 1));
  holidays.push(lastAugMonday);
  const xmas = new Date(Date.UTC(year, 11, 25));
  const boxing = new Date(Date.UTC(year, 11, 26));
  const xmasDow = xmas.getUTCDay();
  if (xmasDow === 6) {
    holidays.push(addDays(xmas, 2));
    holidays.push(addDays(xmas, 3));
  } else if (xmasDow === 0) {
    holidays.push(addDays(xmas, 2));
    holidays.push(boxing);
  } else if (xmasDow === 5) {
    holidays.push(xmas);
    holidays.push(addDays(boxing, 2));
  } else {
    holidays.push(xmas);
    holidays.push(boxing);
  }
  return [...new Set(holidays.map(toIso))].sort();
}
function countWorkingDays(startDate, endDate) {
  const s = /* @__PURE__ */ new Date(startDate + "T00:00:00Z");
  const e = /* @__PURE__ */ new Date(endDate + "T00:00:00Z");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
  const startYear = s.getUTCFullYear();
  const endYear = e.getUTCFullYear();
  const bankHolidaySet = /* @__PURE__ */ new Set();
  for (let y = startYear; y <= endYear; y++) {
    for (const d of getEnglandWalesBankHolidays(y)) bankHolidaySet.add(d);
  }
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getUTCDay();
    const iso = toIso(cur);
    if (dow !== 0 && dow !== 6 && !bankHolidaySet.has(iso)) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}
function calculateLeaveYearBounds(leaveYearStart, referenceDate = /* @__PURE__ */ new Date()) {
  const [mm, dd] = leaveYearStart.split("-").map(Number);
  const refYear = referenceDate.getFullYear();
  let yearStart = new Date(Date.UTC(refYear, mm - 1, dd));
  if (referenceDate < yearStart) {
    yearStart = new Date(Date.UTC(refYear - 1, mm - 1, dd));
  }
  const nextYearStart = new Date(yearStart);
  nextYearStart.setUTCFullYear(nextYearStart.getUTCFullYear() + 1);
  const yearEnd = addDays(nextYearStart, -1);
  return { yearStart, yearEnd, leaveYear: yearStart.getUTCFullYear() };
}
function roundUpHalf(n) {
  return Math.ceil(n * 2) / 2;
}
function calculateProRataEntitlement(contractedDaysPerWeek, employmentStartDate, leaveYearStart, referenceDate = /* @__PURE__ */ new Date()) {
  const fullEntitlement = roundUpHalf(contractedDaysPerWeek * 5.6);
  if (!employmentStartDate) {
    return { fullEntitlement, actualEntitlement: fullEntitlement, isProRata: false, monthsAccrued: 12 };
  }
  const empStart = /* @__PURE__ */ new Date(employmentStartDate + "T00:00:00Z");
  if (isNaN(empStart.getTime())) {
    return { fullEntitlement, actualEntitlement: fullEntitlement, isProRata: false, monthsAccrued: 12 };
  }
  const { yearStart, yearEnd } = calculateLeaveYearBounds(leaveYearStart, referenceDate);
  if (empStart <= yearStart) {
    return { fullEntitlement, actualEntitlement: fullEntitlement, isProRata: false, monthsAccrued: 12 };
  }
  let months = 0;
  const cur = new Date(empStart);
  while (cur <= yearEnd) {
    const next = new Date(cur);
    next.setUTCMonth(next.getUTCMonth() + 1);
    if (next > yearEnd) break;
    months++;
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  months++;
  const monthsAccrued = Math.min(months, 12);
  const actualEntitlement = roundUpHalf(monthsAccrued / 12 * fullEntitlement);
  return { fullEntitlement, actualEntitlement, isProRata: empStart > yearStart, monthsAccrued };
}
function applyCarryOverCap(carryOver, maxCarryOverDays) {
  return Math.min(carryOver, maxCarryOverDays);
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
  const bytes = randomBytes3(3);
  const num = (bytes[0] * 65536 + bytes[1] * 256 + bytes[2]) % 1e6;
  return num.toString().padStart(6, "0");
}
function maskEmail(email) {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.length > 2 ? local[0] + local[1] : local[0];
  return `${visible}***@${domain}`;
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
function escapeHtml3(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
var PAYMENT_RECEIPT_HTML = (p) => {
  const amount = "\xA3" + (p.amountPence / 100).toFixed(2);
  const brandLabel = p.brand.charAt(0).toUpperCase() + p.brand.slice(1);
  return `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #ffffff;">
    <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #0047AB;">
      <h1 style="color: #0A1628; margin: 0; font-size: 24px;">The 147 Bradford</h1>
      <p style="color: #6B7280; margin: 4px 0 0; font-size: 13px;">Snooker, Bar &amp; Restaurant</p>
    </div>
    <h2 style="color: #1A1A2E; font-size: 20px; margin-top: 28px;">Payment receipt</h2>
    <p style="color: #555; font-size: 15px; line-height: 1.5;">Hi ${escapeHtml3(p.customerName)},</p>
    <p style="color: #555; font-size: 15px; line-height: 1.5;">Thank you for your payment. Here are the details:</p>
    <div style="background: #F8F9FB; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 15px; color: #1A1A2E;">
        <tr><td style="padding: 6px 0; color: #6B7280;">Amount paid</td><td style="padding: 6px 0; text-align: right; font-weight: 700; font-size: 20px; color: #0047AB;">${amount}</td></tr>
        <tr><td style="padding: 6px 0; color: #6B7280;">For</td><td style="padding: 6px 0; text-align: right;">${escapeHtml3(p.description)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6B7280;">Date</td><td style="padding: 6px 0; text-align: right;">${escapeHtml3(p.dateStr)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6B7280;">Card</td><td style="padding: 6px 0; text-align: right;">${escapeHtml3(brandLabel)} \u2022\u2022\u2022\u2022 ${escapeHtml3(p.last4)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6B7280;">Receipt no.</td><td style="padding: 6px 0; text-align: right; font-family: monospace; font-size: 13px;">${escapeHtml3(p.receiptNumber)}</td></tr>
      </table>
    </div>
    <p style="color: #555; font-size: 14px; line-height: 1.5;">If you have any questions about this payment, just reply to this email and our team will be happy to help.</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 28px 0;" />
    <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">The 147 Bradford &mdash; Snooker, Bar &amp; Restaurant<br />This is an automated receipt. Please keep it for your records.</p>
  </div>`;
};
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
      tls: { rejectUnauthorized: true }
    });
    await transporter.sendMail({ from: `"The 147" <${user}>`, to, subject, html });
    console.log(`[EMAIL SMTP] Sent to ${maskEmail(to)}`);
    return true;
  } catch (err) {
    console.error("[EMAIL SMTP] Error:", err);
    return false;
  }
}
async function sendMigrationEmail(subId, req) {
  const { buildMigrationEmail: buildMigrationEmail2, makeMigrationToken: makeMigrationToken2 } = await Promise.resolve().then(() => (init_wix_migration(), wix_migration_exports));
  const subs = await storage.getMembershipSubscriptions();
  const sub = subs.find((s) => s.id === subId);
  if (!sub || !sub.customer || !sub.plan) return { success: false, message: "Member not found" };
  if (!sub.customer.email) return { success: false, message: "No email on file" };
  let token = sub.migrationToken;
  if (!token) {
    token = makeMigrationToken2();
    await storage.updateMembershipSubscription(sub.id, { migrationToken: token });
  }
  const host = req.headers.host || "the147bradford.replit.app";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const migrateUrl = `${proto}://${host}/migrate/${token}`;
  const { subject, html } = buildMigrationEmail2({ name: sub.customer.name, plan: sub.plan, migrateUrl });
  const sent = await sendEmailViaSMTP(sub.customer.email, subject, html);
  if (!sent) return { success: false, message: "SMTP not configured or send failed" };
  await storage.updateMembershipSubscription(sub.id, { migrationEmailedAt: /* @__PURE__ */ new Date() });
  return { success: true };
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
        console.log(`[LOYALTY OTP] Email sent via Resend to ${maskEmail(email)}`);
        return true;
      }
      const errorText = await response.text();
      console.warn(`[LOYALTY OTP] Resend also failed (${response.status}): ${errorText}`);
    } catch (err) {
      console.warn("[LOYALTY OTP] Resend exception:", err);
    }
  }
  console.warn(`[LOYALTY OTP] All email methods failed for ${maskEmail(email)} \u2014 OTP not delivered`);
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
    console.log(`[BOOKING] Deposit link email sent via SMTP to ${maskEmail(booking.customerEmail)} for booking #${booking.id}`);
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
function getPublicAppOrigin() {
  const fromEnv = process.env.PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const replitDomains = process.env.REPLIT_DOMAINS?.trim();
  if (replitDomains) {
    const primary = replitDomains.split(",")[0].trim();
    if (primary) return `https://${primary}`;
  }
  const devDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (devDomain) return `https://${devDomain}`;
  return "https://the147bradford.replit.app";
}
function buildVerifyUrl(tokenRaw) {
  return `${getPublicAppOrigin()}/verify-email?token=${encodeURIComponent(tokenRaw)}`;
}
async function sendVerificationEmail(opts) {
  const verifyUrl = buildVerifyUrl(opts.tokenRaw);
  const subject = "Confirm your email \u2014 The 147";
  const html = `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #ffffff;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #0A1628; font-size: 24px; margin: 0;">The 147</h1>
      <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0;">Snooker, Bar &amp; Restaurant</p>
    </div>
    <div style="background: #EFF6FF; border: 1.5px solid #BFDBFE; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 28px;">\u2709\uFE0F</span>
      <h2 style="color: #1E40AF; font-size: 18px; margin: 8px 0 0;">Confirm your email address</h2>
    </div>
    <p style="color: #374151; font-size: 15px;">Hi ${escHtml(opts.name)},</p>
    <p style="color: #374151; font-size: 15px;">Thanks for creating your account at The 147. Please confirm your email address so we can keep your account secure and let you recover bookings or your membership if you ever lose access.</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${verifyUrl}" style="display: inline-block; background: #0047AB; color: #fff; font-size: 16px; font-weight: 700; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Confirm Email \u2192</a>
    </div>
    <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">Or paste this link into your browser:<br/><span style="word-break: break-all; color: #0047AB;">${escHtml(verifyUrl)}</span></p>
    <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">This link expires in 7 days. You can keep using your account and bookings without verifying \u2014 but recovery features need a confirmed email.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 12px; text-align: center;">If you didn't create an account at The 147, you can safely ignore this email.</p>
  </div>`;
  const sent = await sendEmailViaSMTP(opts.email, subject, html);
  if (sent) {
    console.log(`[VERIFY EMAIL] Sent via SMTP to ${maskEmail(opts.email)}`);
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
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: opts.email, subject, html })
      });
      if (response.ok) {
        console.log(`[VERIFY EMAIL] Sent via Resend to ${maskEmail(opts.email)}`);
        return true;
      }
    } catch (_) {
    }
  }
  console.warn(`[VERIFY EMAIL] Failed to send to ${maskEmail(opts.email)}`);
  return false;
}
async function sendPasswordResetEmail(opts) {
  const resetUrl = `${getPublicAppOrigin()}/reset-password?token=${encodeURIComponent(opts.tokenRaw)}`;
  const subject = "Reset your password \u2014 The 147";
  const html = `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #ffffff;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #0A1628; font-size: 24px; margin: 0;">The 147</h1>
      <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0;">Snooker, Bar &amp; Restaurant</p>
    </div>
    <div style="background: #EFF6FF; border: 1.5px solid #BFDBFE; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 28px;">\u{1F511}</span>
      <h2 style="color: #1E40AF; font-size: 18px; margin: 8px 0 0;">Reset your password</h2>
    </div>
    <p style="color: #374151; font-size: 15px;">Hi ${escHtml(opts.name)},</p>
    <p style="color: #374151; font-size: 15px;">We received a request to reset the password on your The 147 account. Click the button below to choose a new password.</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${resetUrl}" style="display: inline-block; background: #0047AB; color: #fff; font-size: 16px; font-weight: 700; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Reset Password \u2192</a>
    </div>
    <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">Or paste this link into your browser:<br/><span style="word-break: break-all; color: #0047AB;">${escHtml(resetUrl)}</span></p>
    <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email \u2014 your password won't change.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 12px; text-align: center;">The 147 &mdash; Snooker, Bar &amp; Restaurant</p>
  </div>`;
  const sent = await sendEmailViaSMTP(opts.email, subject, html);
  if (sent) {
    console.log(`[RESET EMAIL] Sent via SMTP to ${maskEmail(opts.email)}`);
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
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: opts.email, subject, html })
      });
      if (response.ok) {
        console.log(`[RESET EMAIL] Sent via Resend to ${maskEmail(opts.email)}`);
        return true;
      }
    } catch (_) {
    }
  }
  console.warn(`[RESET EMAIL] Failed to send to ${maskEmail(opts.email)}`);
  return false;
}
function renderResetPasswordPage(opts) {
  const { token, error, success } = opts;
  if (success) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Password updated \u2014 The 147</title><style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#F2F5FA;color:#0D1526;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#fff;border-radius:24px;max-width:480px;width:100%;padding:40px 32px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.08)}
.ring{width:80px;height:80px;border-radius:50%;background:#DCFCE7;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
h1{font-size:24px;font-weight:800;color:#0A1628;margin-bottom:12px}
p{color:#4B5A72;font-size:15px;line-height:1.6;margin-bottom:24px}
a.btn{display:inline-block;background:#0047AB;color:#fff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:12px;text-decoration:none}
</style></head><body><div class="card"><div class="ring"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#16A34A" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></div><h1>Password updated</h1><p>Your password has been reset. You can now sign in with your new password.</p><a class="btn" href="/membership">Back to The 147</a></div></body></html>`;
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Reset password \u2014 The 147</title><style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#F2F5FA;color:#0D1526;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#fff;border-radius:24px;max-width:440px;width:100%;padding:36px 28px;box-shadow:0 8px 32px rgba(0,0,0,.08)}
h1{font-size:22px;font-weight:800;color:#0A1628;margin-bottom:8px;text-align:center}
.sub{color:#4B5A72;font-size:14px;line-height:1.5;margin-bottom:24px;text-align:center}
label{display:block;font-size:13px;font-weight:600;color:#0A1628;margin-bottom:6px}
input{width:100%;padding:12px 14px;border:1.5px solid #D6DCEA;border-radius:10px;font-size:15px;margin-bottom:16px}
input:focus{outline:none;border-color:#0047AB}
button{width:100%;background:#0047AB;color:#fff;font-weight:700;font-size:15px;padding:13px;border:0;border-radius:12px;cursor:pointer}
button:disabled{opacity:.6;cursor:not-allowed}
.err{background:#FEE2E2;border:1px solid #FCA5A5;color:#B91C1C;padding:10px 12px;border-radius:10px;font-size:13px;margin-bottom:16px;display:${error ? "block" : "none"}}
</style></head><body><div class="card">
<h1>Choose a new password</h1>
<p class="sub">Enter a new password for your The 147 account. It must be at least 6 characters.</p>
<div class="err" id="err">${escHtml(error || "")}</div>
<form id="rf" onsubmit="return false;">
  <label>New password</label>
  <input type="password" id="p1" autocomplete="new-password" placeholder="Min. 6 characters" minlength="6" required>
  <label>Confirm new password</label>
  <input type="password" id="p2" autocomplete="new-password" placeholder="Re-enter password" minlength="6" required>
  <button type="submit" id="b">Update password</button>
</form>
<script>
const tok=${JSON.stringify(token)};
const err=document.getElementById('err');
const btn=document.getElementById('b');
document.getElementById('rf').addEventListener('submit',async()=>{
  const p1=document.getElementById('p1').value;
  const p2=document.getElementById('p2').value;
  err.style.display='none';
  if(p1.length<6){err.textContent='Password must be at least 6 characters.';err.style.display='block';return;}
  if(p1!==p2){err.textContent='Passwords do not match.';err.style.display='block';return;}
  btn.disabled=true;btn.textContent='Updating\u2026';
  try{
    const r=await fetch('/api/customers/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:tok,password:p1})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){err.textContent=d.message||'Could not reset password.';err.style.display='block';btn.disabled=false;btn.textContent='Update password';return;}
    window.location.href='/reset-password?done=1';
  }catch{err.textContent='Network error \u2014 please try again.';err.style.display='block';btn.disabled=false;btn.textContent='Update password';}
});
</script>
</div></body></html>`;
}
function renderVerifyResultPage(kind, message) {
  const isSuccess = kind === "success";
  const accent = isSuccess ? "#16A34A" : "#DC2626";
  const bg = isSuccess ? "#DCFCE7" : "#FEE2E2";
  const icon = isSuccess ? `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="${accent}" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>` : `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="${accent}" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  const title = isSuccess ? "Email verified" : "We couldn't verify that link";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escHtml(title)} \u2014 The 147</title><style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#F2F5FA;color:#0D1526;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border-radius:24px;max-width:480px;width:100%;padding:40px 32px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.08)}
  .ring{width:80px;height:80px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
  h1{font-size:24px;font-weight:800;color:#0A1628;margin-bottom:12px}
  p{color:#4B5A72;font-size:15px;line-height:1.6;margin-bottom:24px}
  a.btn{display:inline-block;background:#0047AB;color:#fff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:12px;text-decoration:none}
  .brand{margin-top:24px;font-size:12px;color:#8EA0BB}
  </style></head><body><div class="card"><div class="ring">${icon}</div><h1>${escHtml(title)}</h1><p>${escHtml(message)}</p><a class="btn" href="/">Back to The 147</a><div class="brand">The 147 \u2014 Snooker, Bar &amp; Restaurant</div></div></body></html>`;
}
async function sendMembershipPaymentLinkEmail(opts) {
  const price = `\xA3${(opts.priceMonthly / 100).toFixed(2)}`;
  const subject = `Your ${opts.planName} Membership \u2014 Payment Required`;
  const html = `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #ffffff;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #0A1628; font-size: 24px; margin: 0;">The 147</h1>
      <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0;">Snooker, Bar &amp; Restaurant</p>
    </div>
    <div style="background: #EFF6FF; border: 1.5px solid #BFDBFE; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 28px;">\u{1F3B1}</span>
      <h2 style="color: #1E40AF; font-size: 18px; margin: 8px 0 0;">${escHtml(opts.planName)} Membership</h2>
    </div>
    <p style="color: #374151; font-size: 15px;">Hi ${escHtml(opts.customerName)},</p>
    <p style="color: #374151; font-size: 15px;">Welcome to The 147! Your <strong>${escHtml(opts.planName)} Membership</strong> has been set up by our team.</p>
    <p style="color: #374151; font-size: 15px;">To activate your membership, please complete your first payment of <strong>${price}/month</strong> using the secure link below.</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${opts.paymentUrl}" style="display: inline-block; background: #0047AB; color: #fff; font-size: 16px; font-weight: 700; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Pay ${price} &amp; Activate \u2192</a>
    </div>
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Membership</td><td style="padding: 8px 0; color: #0A1628; font-size: 14px; font-weight: 700; text-align: right;">${escHtml(opts.planName)}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">Monthly Price</td><td style="padding: 8px 0; color: #0047AB; font-size: 14px; font-weight: 700; text-align: right;">${price}/month</td></tr>
      </table>
    </div>
    <p style="color: #374151; font-size: 13px; line-height: 1.6;">Your membership will be activated as soon as payment is received. If you have any questions please don't hesitate to get in touch.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 12px; text-align: center;">The 147 &mdash; Snooker, Bar &amp; Restaurant<br/>www.the147.co.uk</p>
  </div>`;
  const smtpSent = await sendEmailViaSMTP(opts.customerEmail, subject, html);
  if (smtpSent) {
    console.log(`[MEMBERSHIP] Payment link email sent via SMTP to ${maskEmail(opts.customerEmail)}`);
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
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: opts.customerEmail, subject, html })
      });
      if (response.ok) {
        console.log(`[MEMBERSHIP] Payment link email sent via Resend to ${maskEmail(opts.customerEmail)}`);
        return true;
      }
    } catch (_) {
    }
  }
  console.warn(`[MEMBERSHIP] Payment link email failed for ${maskEmail(opts.customerEmail)}`);
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
    console.log(`[BOOKING] Confirmation email sent via SMTP to ${maskEmail(booking.customerEmail)} for booking #${booking.id}`);
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
        console.log(`[BOOKING] Confirmation email sent via Resend to ${maskEmail(booking.customerEmail)} for booking #${booking.id}`);
        return true;
      }
      console.warn("[BOOKING] Resend also failed:", await response.text());
    } catch (err) {
      console.warn("[BOOKING] Resend exception:", err);
    }
  }
  console.warn(`[BOOKING] Confirmation email could not be sent for booking #${booking.id} to ${maskEmail(booking.customerEmail)}`);
  return false;
}
async function sendBookingCancellationEmail(booking) {
  const tableLabels = { snooker: "Snooker Table", pool: "Pool Table", dining: "Dining Table" };
  const tableLabel = tableLabels[booking.tableType] ?? booking.tableType;
  const tableNum = booking.tableNumber ? ` #${booking.tableNumber}` : "";
  const [dy, dm, dd] = booking.date.split("-").map(Number);
  const dateObj = new Date(dy, dm - 1, dd);
  const dateStr = dateObj.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const [sh, sm] = booking.startTime.split(":").map(Number);
  const endMins = sh * 60 + sm + booking.duration * 60;
  const endTime = `${Math.floor(endMins / 60).toString().padStart(2, "0")}:${(endMins % 60).toString().padStart(2, "0")}`;
  const subject = `Booking Cancelled \u2013 The 147`;
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f9f9f9;padding:32px;border-radius:12px">
    <h2 style="color:#1a1a2e;margin-bottom:4px">Booking Cancelled</h2>
    <p style="color:#555;margin-top:0">Hi ${booking.customerName}, your booking has been cancelled.</p>
    <div style="background:#fff;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #DC2626">
      <p style="margin:0 0 8px 0"><strong>${tableLabel}${tableNum}</strong></p>
      <p style="margin:0 0 4px 0;color:#555">${dateStr}</p>
      <p style="margin:0;color:#555">${booking.startTime} \u2013 ${endTime} (${booking.duration} hour${booking.duration > 1 ? "s" : ""})</p>
    </div>
    <p style="color:#555;font-size:13px">If you'd like to make a new booking, you can do so through the app at any time.</p>
    <p style="color:#888;font-size:12px;margin-top:24px">The 147 Bradford \xB7 Snooker &amp; Pool Club</p>
  </div>`;
  const smtpSent = await sendEmailViaSMTP(booking.customerEmail, subject, html);
  if (smtpSent) return true;
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const fromName = "The 147 Bradford";
      const fromEmail = process.env.RESEND_FROM_EMAIL || "bookings@the147bradford.com";
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: booking.customerEmail, subject, html })
      });
      if (response.ok) return true;
    } catch (_) {
    }
  }
  return false;
}
async function sendBookingRescheduleEmail(booking) {
  const tableLabels = {
    snooker: "Snooker Table",
    pool: "Pool Table",
    "american-pool": "American Pool Table",
    darts: "Darts Lane",
    shuffleboard: "Shuffleboard",
    dining: "Dining Table"
  };
  const tableLabel = tableLabels[booking.tableType] ?? booking.tableType;
  const tableNum = booking.tableNumber ? ` #${booking.tableNumber}` : "";
  const tableDisplay = `${tableLabel}${tableNum}`;
  const [dy, dm, dd] = booking.date.split("-").map(Number);
  const dateObj = new Date(dy, dm - 1, dd);
  const dateStr = dateObj.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const [sh, sm] = booking.startTime.split(":").map(Number);
  const endMins = sh * 60 + sm + booking.duration * 60;
  const endTime = `${Math.floor(endMins / 60).toString().padStart(2, "0")}:${(endMins % 60).toString().padStart(2, "0")}`;
  const durationLabel = booking.duration === 1 ? "1 hour" : `${booking.duration} hours`;
  const bookingRef = `147-${booking.id.toString().padStart(5, "0")}`;
  const subject = `Booking Rescheduled \u2013 ${tableDisplay} on ${dateStr}`;
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f9f9f9;padding:32px;border-radius:12px">
    <div style="text-align:center;margin-bottom:24px">
      <h1 style="color:#0A1628;font-size:24px;margin:0">The 147</h1>
      <p style="color:#6b7280;font-size:13px;margin:4px 0 0">Snooker, Bar &amp; Restaurant</p>
    </div>
    <div style="background:#dbeafe;border-radius:12px;padding:16px;text-align:center;margin-bottom:24px">
      <span style="font-size:28px">&#128197;</span>
      <h2 style="color:#0047AB;font-size:18px;margin:8px 0 0">Booking Rescheduled</h2>
    </div>
    <p style="color:#374151;font-size:15px">Hi ${escHtml(booking.customerName)},</p>
    <p style="color:#374151;font-size:15px">Your booking at The 147 has been rescheduled. Here are your updated details:</p>
    <div style="background:#fff;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #0047AB">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600">Booking Ref</td><td style="padding:8px 0;color:#0047AB;font-size:15px;font-weight:700;text-align:right">${escHtml(bookingRef)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600">Table</td><td style="padding:8px 0;color:#0A1628;font-size:14px;font-weight:600;text-align:right">${escHtml(tableDisplay)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600">New Date</td><td style="padding:8px 0;color:#0A1628;font-size:14px;font-weight:600;text-align:right">${escHtml(dateStr)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600">New Time</td><td style="padding:8px 0;color:#0A1628;font-size:14px;font-weight:600;text-align:right">${escHtml(booking.startTime)} \u2013 ${escHtml(endTime)} (${escHtml(durationLabel)})</td></tr>
      </table>
    </div>
    <p style="color:#374151;font-size:14px">Please arrive 5 minutes before your slot. If you need to cancel or change your booking again, you can do so through the app.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
    <p style="color:#9ca3af;font-size:12px;text-align:center">The 147 &mdash; Snooker, Bar &amp; Restaurant<br/>www.the147.co.uk</p>
  </div>`;
  const smtpSent = await sendEmailViaSMTP(booking.customerEmail, subject, html);
  if (smtpSent) {
    console.log(`[BOOKING] Reschedule email sent via SMTP to ${maskEmail(booking.customerEmail)} for booking #${booking.id}`);
    return true;
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const fromName = process.env.RESEND_FROM_NAME || "The 147";
      const fromEmail = process.env.RESEND_FROM_EMAIL || "bookings@the147bradford.com";
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: booking.customerEmail, subject, html })
      });
      if (response.ok) {
        console.log(`[BOOKING] Reschedule email sent via Resend to ${maskEmail(booking.customerEmail)} for booking #${booking.id}`);
        return true;
      }
    } catch (_) {
    }
  }
  console.warn(`[BOOKING] Reschedule email could not be sent for booking #${booking.id} to ${maskEmail(booking.customerEmail)}`);
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
    req.staffUser = user || null;
  } else {
    req.staffRole = "manager";
    req.staffUsername = null;
    req.staffUser = { id: null, role: "manager", username: null, displayName: "System" };
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
      const token2 = randomBytes3(32).toString("hex");
      const expiresAt2 = new Date(Date.now() + 24 * 60 * 60 * 1e3);
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
    const token = randomBytes3(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3);
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
  app2.get("/api/staff/web-content", staffAuth, ownerAuth, async (_req, res) => {
    try {
      const { getEditorPayload: getEditorPayload2 } = await Promise.resolve().then(() => (init_web_content(), web_content_exports));
      res.json(await getEditorPayload2());
    } catch (err) {
      console.error("Failed to load web content:", err);
      res.status(500).json({ message: "Failed to load website content" });
    }
  });
  app2.put("/api/staff/web-content", staffAuth, ownerAuth, async (req, res) => {
    try {
      const { saveOverride: saveOverride2 } = await Promise.resolve().then(() => (init_web_content(), web_content_exports));
      const { page, block, value } = req.body || {};
      if (typeof page !== "string" || typeof block !== "string") {
        return res.status(400).json({ message: "page and block are required" });
      }
      await saveOverride2(page, block, typeof value === "string" ? value : "");
      res.json({ ok: true });
    } catch (err) {
      console.error("Failed to save web content:", err);
      res.status(400).json({ message: err?.message || "Failed to save" });
    }
  });
  app2.post("/api/staff/wix-migration/preview", staffAuth, ownerAuth, async (req, res) => {
    try {
      const { parseCsv: parseCsv2 } = await Promise.resolve().then(() => (init_wix_migration(), wix_migration_exports));
      const { csv } = req.body || {};
      if (typeof csv !== "string" || !csv.trim()) return res.status(400).json({ message: "Paste your CSV first" });
      const rows = parseCsv2(csv);
      const plans = await storage.getMembershipPlans();
      res.json({ rows, plans });
    } catch (err) {
      res.status(400).json({ message: err?.message || "Couldn't parse CSV" });
    }
  });
  app2.post("/api/staff/wix-migration/import", staffAuth, ownerAuth, async (req, res) => {
    try {
      const { parseCsv: parseCsv2, importWixMembers: importWixMembers2 } = await Promise.resolve().then(() => (init_wix_migration(), wix_migration_exports));
      const { csv, defaultPlanId, planMap } = req.body || {};
      if (typeof csv !== "string" || !csv.trim()) return res.status(400).json({ message: "CSV is required" });
      if (!defaultPlanId) return res.status(400).json({ message: "Pick a default plan" });
      const rows = parseCsv2(csv);
      const result = await importWixMembers2({
        rows,
        defaultPlanId: parseInt(defaultPlanId),
        planMap: planMap && typeof planMap === "object" ? planMap : {}
      });
      res.json(result);
    } catch (err) {
      console.error("[wix-migration/import]", err);
      res.status(500).json({ message: err?.message || "Import failed" });
    }
  });
  app2.get("/api/staff/wix-migration/status", staffAuth, ownerAuth, async (_req, res) => {
    try {
      const subs = await storage.getMembershipSubscriptions();
      const imported = subs.filter((s) => s.source === "wix_import");
      const stats = {
        total: imported.length,
        emailed: imported.filter((s) => s.migrationEmailedAt).length,
        completed: imported.filter((s) => s.migrationCompletedAt).length,
        pending: imported.filter((s) => !s.migrationCompletedAt).length
      };
      const list = imported.map((s) => ({
        id: s.id,
        customerName: s.customer?.name || "",
        customerEmail: s.customer?.email || "",
        planName: s.plan?.name || "",
        priceMonthly: s.plan?.priceMonthly || 0,
        currentPeriodEnd: s.currentPeriodEnd,
        emailedAt: s.migrationEmailedAt,
        completedAt: s.migrationCompletedAt,
        hasToken: !!s.migrationToken
      })).sort((a, b) => {
        if (!a.completedAt && b.completedAt) return -1;
        if (a.completedAt && !b.completedAt) return 1;
        return (a.customerName || "").localeCompare(b.customerName || "");
      });
      res.json({ stats, list });
    } catch (err) {
      console.error("[wix-migration/status]", err);
      res.status(500).json({ message: "Failed to load status" });
    }
  });
  app2.post("/api/staff/wix-migration/send-email/:id", staffAuth, ownerAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const ok = await sendMigrationEmail(id, req);
      if (!ok.success) return res.status(400).json({ message: ok.message });
      res.json({ ok: true });
    } catch (err) {
      console.error("[wix-migration/send-email]", err);
      res.status(500).json({ message: "Failed to send" });
    }
  });
  app2.post("/api/staff/wix-migration/send-all-emails", staffAuth, ownerAuth, async (req, res) => {
    try {
      const { onlyUnsent } = req.body || {};
      const subs = await storage.getMembershipSubscriptions();
      const targets = subs.filter((s) => s.source === "wix_import" && !s.migrationCompletedAt && (!onlyUnsent || !s.migrationEmailedAt));
      let sent = 0, failed = 0;
      for (const s of targets) {
        const result = await sendMigrationEmail(s.id, req);
        if (result.success) sent++;
        else failed++;
      }
      res.json({ sent, failed, total: targets.length });
    } catch (err) {
      console.error("[wix-migration/send-all-emails]", err);
      res.status(500).json({ message: "Bulk send failed" });
    }
  });
  app2.post("/api/migrate/:token/checkout", async (req, res) => {
    try {
      const token = req.params.token;
      if (!token || token.length < 16) return res.status(400).json({ message: "Invalid link" });
      const subs = await storage.getMembershipSubscriptions();
      const sub = subs.find((s) => s.migrationToken === token);
      if (!sub) return res.status(404).json({ message: "This link isn't valid anymore." });
      if (sub.migrationCompletedAt) return res.status(400).json({ message: "This membership has already been activated." });
      if (sub.squareSubscriptionId) return res.status(400).json({ message: "Your card is already set up \u2014 refresh this page to confirm." });
      if (!sub.customer || !sub.plan) return res.status(404).json({ message: "Membership not found" });
      if (!isConfigured()) return res.status(503).json({ message: "Payment system unavailable" });
      const variationId = sub.plan.squarePlanVariationId;
      if (!variationId) return res.status(503).json({ message: "Plan isn't set up for online payments yet \u2014 please contact us." });
      let sqCustomerId = sub.squareCustomerId;
      if (!sqCustomerId) {
        const sqCustomer = await findSquareCustomerByEmail(sub.customer.email).catch(() => null) || await createSquareCustomer(sub.customer.name, sub.customer.email, sub.customer.phone || void 0).catch(() => null);
        if (sqCustomer) {
          sqCustomerId = sqCustomer.id;
          await storage.updateMembershipSubscription(sub.id, { squareCustomerId: sqCustomerId });
        }
      }
      const host = req.headers.host || "the147bradford.replit.app";
      const proto = req.headers["x-forwarded-proto"] || "https";
      const redirectUrl = `${proto}://${host}/migrate/${token}/done`;
      const checkout = await createSubscriptionCheckoutLink({
        planVariationId: variationId,
        subscriptionId: sub.id,
        buyerEmail: sub.customer.email,
        redirectUrl
      });
      res.json({ checkoutUrl: checkout.url });
    } catch (err) {
      console.error("[migrate/checkout]", err);
      res.status(500).json({ message: "Couldn't start checkout \u2014 please try again." });
    }
  });
  app2.get("/migrate/:token/done", async (req, res) => {
    try {
      const subs = await storage.getMembershipSubscriptions();
      const sub = subs.find((s) => s.migrationToken === req.params.token);
      if (sub && !sub.migrationCompletedAt) {
        await storage.updateMembershipSubscription(sub.id, {
          migrationCompletedAt: /* @__PURE__ */ new Date(),
          source: "wix_migrated"
        });
      }
    } catch (err) {
    }
    res.redirect(`/migrate/${req.params.token}`);
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
  app2.get("/api/staff/offers", staffAuth, async (_req, res) => {
    const offers2 = await storage.getAllOffers();
    res.json(offers2);
  });
  const trim = (v, max) => {
    const s = String(v ?? "").trim();
    return s.length > max ? s.slice(0, max) : s;
  };
  const isEmail = (s) => /^[^\s@]{1,80}@[^\s@]{1,80}\.[^\s@]{1,40}$/.test(s);
  app2.get("/api/staff/payments/config", staffAuth, async (_req, res) => {
    res.json({
      stripeConfigured: isStripeConfigured(),
      publishableKey: getPublishableKey(),
      boxOfficeUrl: process.env.TICKETSOURCE_BOX_OFFICE_URL || "",
      square: {
        configured: isWebPaymentsConfigured(),
        applicationId: getApplicationId(),
        locationId: getPublicLocationId(),
        environment: getEnvironment()
      }
    });
  });
  app2.post("/api/staff/payments/square/charge", staffAuth, async (req, res) => {
    if (!isWebPaymentsConfigured()) {
      return res.status(503).json({ message: "Square Web Payments is not configured. Add SQUARE_APPLICATION_ID, SQUARE_ACCESS_TOKEN, and SQUARE_LOC_ID." });
    }
    const { sourceId, amountPence, description, customerName, customerEmail, customerPhone, verificationToken } = req.body || {};
    const sid = trim(sourceId, 200);
    if (!sid) return res.status(400).json({ message: "Missing card token" });
    const amt = Number(amountPence);
    if (!Number.isFinite(amt) || amt < 50 || amt > 1e7) {
      return res.status(400).json({ message: "Amount must be between \xA30.50 and \xA3100,000.00" });
    }
    const desc2 = trim(description, 200);
    if (!desc2) return res.status(400).json({ message: "Description is required" });
    const name = trim(customerName, 120) || null;
    const email = trim(customerEmail, 160) || null;
    if (email && !isEmail(email)) return res.status(400).json({ message: "Invalid customer email" });
    const phone = trim(customerPhone, 40) || null;
    const staffUser = req.staffUser;
    const staffUsername = req.staffUsername || null;
    const log2 = await storage.createPaymentLog({
      amountPence: Math.round(amt),
      currency: "gbp",
      description: desc2,
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      stripePaymentIntentId: `sq_pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: "pending",
      staffUsername,
      staffDisplayName: staffUser?.displayName || staffUser?.username || null,
      failureMessage: null
    });
    try {
      const idemRaw = `${log2.id}|${sid}`;
      const idempotencyKey = createHash2("sha256").update(idemRaw).digest("hex").slice(0, 45);
      const payment = await createCardPayment({
        sourceId: sid,
        amountPence: Math.round(amt),
        idempotencyKey,
        note: desc2,
        referenceId: `staff-${log2.id}`,
        buyerEmail: email || void 0,
        verificationToken: verificationToken || null
      });
      const succeeded = payment.status === "COMPLETED" || payment.status === "APPROVED";
      const status = succeeded ? "succeeded" : payment.status === "FAILED" || payment.status === "CANCELED" ? "failed" : "pending";
      await storage.updatePaymentLog(log2.id, {
        status,
        stripePaymentIntentId: payment.id,
        failureMessage: succeeded ? null : `Square status: ${payment.status}`
      });
      if (succeeded && email) {
        const last4 = payment.card_details?.card?.last_4 || "----";
        const brand = payment.card_details?.card?.card_brand || "card";
        try {
          const html = PAYMENT_RECEIPT_HTML({
            amountPence: Math.round(amt),
            description: desc2,
            customerName: name || "Customer",
            last4,
            brand: String(brand).toLowerCase(),
            receiptNumber: `147-${log2.id}`,
            dateStr: (/* @__PURE__ */ new Date()).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })
          });
          await sendEmailViaSMTP(email, `Your receipt from The 147 Bradford \u2014 ${desc2}`, html);
        } catch (mailErr) {
          console.error("Square receipt email failed:", { message: mailErr?.message });
        }
      }
      res.json({ ok: succeeded, status: payment.status, paymentId: payment.id, logId: log2.id });
    } catch (err) {
      const squareErrors = Array.isArray(err?.errors) ? err.errors : Array.isArray(err?.result?.errors) ? err.result.errors : [];
      const first = squareErrors[0] || {};
      const errorCode = first.code;
      const errorDetail = first.detail || err?.message;
      await storage.updatePaymentLog(log2.id, {
        status: "failed",
        failureMessage: (errorCode ? `[${errorCode}] ` : "") + (errorDetail || "Square charge failed").slice(0, 500)
      }).catch(() => {
      });
      console.error("Square charge error:", { code: err?.code, statusCode: err?.statusCode, errorCode });
      res.status(400).json({
        message: errorDetail || "Card charge failed",
        errorCode: errorCode || null,
        provider: "square"
      });
    }
  });
  app2.post("/api/staff/payments/create-intent", staffAuth, async (req, res) => {
    if (!isStripeConfigured()) {
      return res.status(503).json({ message: "Stripe is not configured. Please add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY." });
    }
    const { amountPence, description, customerName, customerEmail, customerPhone, moto } = req.body || {};
    const amt = Number(amountPence);
    if (!Number.isFinite(amt) || amt < 50 || amt > 1e7) {
      return res.status(400).json({ message: "Amount must be between \xA30.50 and \xA3100,000.00" });
    }
    const desc2 = trim(description, 200);
    if (!desc2) return res.status(400).json({ message: "Description is required" });
    const name = trim(customerName, 120) || null;
    const email = trim(customerEmail, 160) || null;
    if (email && !isEmail(email)) return res.status(400).json({ message: "Invalid customer email" });
    const phone = trim(customerPhone, 40) || null;
    const staffUser = req.staffUser;
    const staffUsername = req.staffUsername || null;
    try {
      const stripe = getStripeClient();
      const idemBucket = Math.floor(Date.now() / 6e4);
      const idemRaw = `${staffUsername || "system"}|${Math.round(amt)}|${desc2}|${idemBucket}`;
      const idempotencyKey = createHash2("sha256").update(idemRaw).digest("hex");
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(amt),
        currency: "gbp",
        description: desc2,
        // Branded receipt is sent ourselves on finalize — don't ask Stripe to send a duplicate
        payment_method_types: ["card"],
        // MOTO requires Stripe to enable the capability on the account first.
        // Until then, the moto flag is informational only — sending it would cause
        // "Received unknown parameter" errors. Set STRIPE_MOTO_ENABLED=true once
        // Stripe support has activated MOTO on your account.
        ...moto && process.env.STRIPE_MOTO_ENABLED === "true" ? { payment_method_options: { card: { moto: true } } } : {},
        metadata: {
          source: "staff_dashboard",
          staffUsername: staffUsername || "system",
          customerName: name || "",
          customerPhone: phone || ""
        }
      }, { idempotencyKey });
      const log2 = await storage.createPaymentLog({
        amountPence: Math.round(amt),
        currency: "gbp",
        description: desc2,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        stripePaymentIntentId: intent.id,
        status: "pending",
        staffUsername,
        staffDisplayName: staffUser?.displayName || staffUser?.username || null,
        failureMessage: null
      });
      res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, logId: log2.id });
    } catch (err) {
      console.error("Stripe create-intent error:", {
        type: err?.type,
        code: err?.code,
        statusCode: err?.statusCode,
        requestId: err?.requestId
      });
      res.status(500).json({ message: err?.message || "Failed to create payment intent" });
    }
  });
  app2.post("/api/staff/payments/finalize", staffAuth, async (req, res) => {
    if (!isStripeConfigured()) return res.status(503).json({ message: "Stripe not configured" });
    const piId = trim(req.body?.paymentIntentId, 120);
    if (!piId || !/^pi_[A-Za-z0-9_]+$/.test(piId)) return res.status(400).json({ message: "Invalid paymentIntentId" });
    const existing = await storage.getPaymentLogByIntent(piId);
    if (!existing) return res.status(404).json({ message: "Payment record not found" });
    try {
      const stripe = getStripeClient();
      const intent = await stripe.paymentIntents.retrieve(piId);
      let status = "pending";
      if (intent.status === "succeeded") status = "succeeded";
      else if (intent.status === "canceled" || intent.status === "requires_payment_method") status = "failed";
      const failureMessage = intent.last_payment_error?.message || null;
      const updated = await storage.updatePaymentLog(existing.id, { status, failureMessage });
      if (status === "succeeded" && existing.status !== "succeeded" && existing.customerEmail) {
        const charge = intent.latest_charge && typeof intent.latest_charge !== "string" ? intent.latest_charge : null;
        const last4 = charge?.payment_method_details?.card?.last4 || "----";
        const brand = charge?.payment_method_details?.card?.brand || "card";
        const html = PAYMENT_RECEIPT_HTML({
          amountPence: existing.amountPence,
          description: existing.description,
          customerName: existing.customerName || "Customer",
          last4,
          brand,
          receiptNumber: charge?.receipt_number || `147-${existing.id}`,
          dateStr: (/* @__PURE__ */ new Date()).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })
        });
        sendEmailViaSMTP(
          existing.customerEmail,
          `Receipt for your payment \u2014 The 147 Bradford`,
          html
        ).catch((err) => console.error("[RECEIPT] send failed:", err));
      }
      res.json(updated);
    } catch (err) {
      console.error("Stripe finalize error:", err);
      res.status(500).json({ message: err?.message || "Failed to verify payment" });
    }
  });
  app2.get("/api/staff/payments/log", staffAuth, managerAuth, async (_req, res) => {
    const logs = await storage.listPaymentLogs(100);
    res.json(logs);
  });
  app2.patch("/api/staff/offers/:id/toggle", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const offer = await storage.getOffer(id);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    const updated = await storage.updateOffer(id, { active: !offer.active });
    res.json(updated);
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
    const { date, tableType, tableNumber, excludeId } = req.query;
    if (!date || !tableType) {
      return res.status(400).json({ message: "date and tableType are required" });
    }
    const POOL_TABLE_COUNT = 6;
    const DINING_TABLE_COUNT = 25;
    const excludeBookingId = excludeId ? parseInt(String(excludeId)) : void 0;
    if (String(tableType) === "dining") {
      const bookedSlots2 = await storage.getBookedSlots(String(date), "dining", void 0, excludeBookingId);
      return res.json({ slots: bookedSlots2, totalTables: DINING_TABLE_COUNT });
    }
    const bookedSlots = await storage.getBookedSlots(String(date), String(tableType), tableNumber ? String(tableNumber) : void 0, excludeBookingId);
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
    if (eventType === "subscription.created") {
      try {
        const sqSub = event?.data?.object?.subscription;
        if (sqSub?.id && sqSub?.customer_id) {
          const allSubs = await storage.getMembershipSubscriptions();
          const local = allSubs.find(
            (s) => s.squareCustomerId === sqSub.customer_id && (s.status === "pending" || s.status === "pending_payment") && !s.squareSubscriptionId
          );
          if (local) {
            await storage.updateMembershipSubscription(local.id, { squareSubscriptionId: sqSub.id });
            console.log(`[WEBHOOK] Linked Square subscription ${sqSub.id} \u2192 local #${local.id}`);
          }
        }
      } catch (err) {
        console.error("[WEBHOOK] subscription.created error:", err);
      }
      return res.sendStatus(200);
    }
    if (eventType === "invoice.payment_made") {
      try {
        const invoice = event?.data?.object?.invoice;
        const sqSubId = invoice?.subscription_id;
        if (sqSubId) {
          const allSubs = await storage.getMembershipSubscriptions();
          const local = allSubs.find((s) => s.squareSubscriptionId === sqSubId);
          if (local) {
            const next = /* @__PURE__ */ new Date();
            next.setMonth(next.getMonth() + 1);
            const nextPeriodEnd = invoice.next_payment_due_date ?? next.toISOString().slice(0, 10);
            const wasAlreadyActive = local.status === "active";
            await storage.updateMembershipSubscription(local.id, {
              status: "active",
              failedPaymentAttempts: 0,
              currentPeriodStart: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
              currentPeriodEnd: nextPeriodEnd
            });
            console.log(`[WEBHOOK] Membership #${local.id} payment received \u2014 active until ${nextPeriodEnd}`);
            if (wasAlreadyActive) {
              const customer = await storage.getCustomerById(local.customerId).catch(() => null);
              if (customer?.email) {
                const tokens = await storage.getPushTokensByEmail(customer.email).catch(() => []);
                if (tokens.length > 0) {
                  await sendTargetedPush(
                    tokens.map((t) => t.token),
                    "Membership Renewed",
                    `Your membership has been renewed and is active until ${nextPeriodEnd}.`
                  ).catch(() => {
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("[WEBHOOK] invoice.payment_made error:", err);
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
                const sqLocId = process.env.SQUARE_LOC_ID || process.env.SQUARE_LOCATION_ID;
                if (plan.squarePlanVariationId && !sub.squareSubscriptionId && sqLocId) {
                  const sqSub = await createSquareSubscription(
                    sub.squareCustomerId,
                    plan.squarePlanVariationId,
                    sqLocId
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
    if (paymentStatus === "COMPLETED") {
      const paymentOrderId = payment.order_id;
      if (paymentOrderId) {
        try {
          const appOrder = await storage.getOrderBySquareOrderId(paymentOrderId);
          if (appOrder && appOrder.status === "pending") {
            await storage.updateAppOrderPaid(paymentOrderId, payment.id);
            console.log(`[WEBHOOK] App order #${appOrder.id} marked paid (Square order: ${paymentOrderId})`);
            return res.sendStatus(200);
          }
        } catch (err) {
          console.error("[WEBHOOK] App order status update failed:", err.message);
        }
      }
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
            console.log(`[WEBHOOK] Matched booking #${booking.id} by email: ${maskEmail(buyerEmail)}`);
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
  function isAvailableNow(rules, targetId) {
    const activeRules = rules.filter((r) => r.targetId === targetId && r.enabled);
    if (activeRules.length === 0) return true;
    const now = /* @__PURE__ */ new Date();
    const dayOfWeek = now.getDay();
    const hhmm = now.toTimeString().slice(0, 5);
    const dateStr = now.toISOString().slice(0, 10);
    return activeRules.some((rule) => {
      if (rule.startDate && dateStr < rule.startDate) return false;
      if (rule.endDate && dateStr > rule.endDate) return false;
      if (rule.daysOfWeek) {
        const days = JSON.parse(rule.daysOfWeek);
        if (!days.includes(dayOfWeek)) return false;
      }
      if (rule.startTime && hhmm < rule.startTime) return false;
      if (rule.endTime && hhmm > rule.endTime) return false;
      return true;
    });
  }
  app2.get("/api/deals", async (_req, res) => {
    try {
      const deals = await getSquareDeals();
      res.json(deals);
    } catch {
      res.json([]);
    }
  });
  app2.get("/api/menu", async (_req, res) => {
    try {
      const [categories, categoryOverrides, itemOverrides, catSettingsArr, availRules] = await Promise.all([
        getMenuFromSquare(),
        storage.getMenuCategoryOverrides(),
        storage.getMenuItemOverrides(),
        storage.getCategorySettings(),
        storage.getAvailabilityRules()
      ]);
      const hiddenCategoryIds = new Set(categoryOverrides.filter((c) => c.hidden).map((c) => c.categoryId));
      const itemOverrideMap = new Map(itemOverrides.map((o) => [o.variationId, o]));
      const catSettingsMap = new Map(catSettingsArr.map((s) => [s.categoryId, s]));
      const mergedMap = /* @__PURE__ */ new Map();
      for (const cat of categories) {
        if (hiddenCategoryIds.has(cat.id)) continue;
        if (!isAvailableNow(availRules.filter((r) => r.targetType === "category"), cat.id)) continue;
        const settings = catSettingsMap.get(cat.id);
        const targetId = settings?.mergedIntoId ?? cat.id;
        const displayName = settings?.displayName ?? cat.name;
        const displayOrder = settings?.displayOrder ?? 99;
        if (!mergedMap.has(targetId)) {
          const targetSettings = catSettingsMap.get(targetId);
          const targetCat = categories.find((c) => c.id === targetId);
          const customImg = targetSettings?.imageUrl ?? catSettingsMap.get(cat.id)?.imageUrl ?? null;
          mergedMap.set(targetId, {
            id: targetId,
            name: targetSettings?.displayName ?? targetCat?.name ?? displayName,
            imageUrl: customImg ?? targetCat?.imageUrl ?? cat.imageUrl,
            order: targetSettings?.displayOrder ?? targetCat ? catSettingsMap.get(targetId)?.displayOrder ?? 99 : displayOrder,
            items: []
          });
        }
        const availableItems = cat.items.filter((item) => {
          const override = itemOverrideMap.get(item.variationId);
          if (override?.hidden) return false;
          if (!isAvailableNow(availRules.filter((r) => r.targetType === "item"), item.id)) return false;
          return true;
        }).map((item) => {
          const override = itemOverrideMap.get(item.variationId);
          const base = {
            id: item.id,
            variationId: item.variationId,
            name: item.name,
            variationName: item.variationName,
            description: item.description,
            price: item.price,
            imageUrl: item.imageUrl,
            ...item.modifiers && item.modifiers.length > 0 ? { modifiers: item.modifiers } : {}
          };
          return override?.soldOut ? { ...base, soldOut: true } : base;
        });
        mergedMap.get(targetId).items.push(...availableItems);
      }
      const nodes = mergedMap;
      const childrenByParent = /* @__PURE__ */ new Map();
      const isChild = /* @__PURE__ */ new Set();
      for (const node of nodes.values()) {
        const parentId = catSettingsMap.get(node.id)?.parentCategoryId ?? null;
        if (parentId && nodes.has(parentId) && parentId !== node.id) {
          if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
          childrenByParent.get(parentId).push(node);
          isChild.add(node.id);
        }
      }
      const topLevel = [];
      for (const node of nodes.values()) {
        if (isChild.has(node.id)) continue;
        const kids = childrenByParent.get(node.id) ?? [];
        if (kids.length > 0) {
          kids.sort((a, b) => a.order !== b.order ? a.order - b.order : a.name.localeCompare(b.name));
          node.subcategories = kids.filter((k) => k.items.length > 0).map(({ order, subcategories, ...rest }) => rest);
        }
        if (node.items.length > 0 || node.subcategories && node.subcategories.length > 0) {
          topLevel.push(node);
        }
      }
      const filtered = topLevel.sort((a, b) => a.order !== b.order ? a.order - b.order : a.name.localeCompare(b.name)).map(({ order, ...rest }) => rest);
      res.json(filtered);
    } catch (err) {
      console.error("[MENU] Failed to fetch menu:", err.message);
      res.status(500).json({ message: "Failed to load menu" });
    }
  });
  app2.get("/api/staff/menu", staffAuth, async (req, res) => {
    try {
      if (req.query.nocache === "1") invalidateMenuCache();
      const [categories, categoryOverrides, itemOverrides] = await Promise.all([
        getMenuFromSquare(),
        storage.getMenuCategoryOverrides(),
        storage.getMenuItemOverrides()
      ]);
      const categoryOverrideMap = new Map(categoryOverrides.map((o) => [o.categoryId, o]));
      const itemOverrideMap = new Map(itemOverrides.map((o) => [o.variationId, o]));
      const result = categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        hidden: categoryOverrideMap.get(cat.id)?.hidden ?? false,
        items: cat.items.map((item) => ({
          variationId: item.variationId,
          itemId: item.id,
          name: item.name,
          variationName: item.variationName,
          price: item.price,
          soldOut: itemOverrideMap.get(item.variationId)?.soldOut ?? false,
          hidden: itemOverrideMap.get(item.variationId)?.hidden ?? false
        }))
      }));
      res.json(result);
    } catch (err) {
      console.error("[STAFF MENU] Failed to fetch menu:", err.message);
      res.status(500).json({ message: "Failed to load menu" });
    }
  });
  app2.put("/api/staff/menu/categories/:categoryId", staffAuth, managerAuth, async (req, res) => {
    const { categoryId } = req.params;
    const { hidden } = req.body;
    if (typeof hidden !== "boolean") return res.status(400).json({ message: "hidden must be boolean" });
    try {
      const updatedBy = req.staffUser?.username ?? "staff";
      await storage.setMenuCategoryHidden(categoryId, hidden, updatedBy);
      invalidateMenuCache();
      res.json({ ok: true });
    } catch (err) {
      console.error("[STAFF MENU] Category hide error:", err.message);
      res.status(500).json({ message: "Failed to update category" });
    }
  });
  app2.put("/api/staff/menu/items/:variationId/sold-out", staffAuth, async (req, res) => {
    const { variationId } = req.params;
    const { soldOut, itemId, name } = req.body;
    if (typeof soldOut !== "boolean") return res.status(400).json({ message: "soldOut must be boolean" });
    if (!itemId || !name) return res.status(400).json({ message: "itemId and name required" });
    try {
      const updatedBy = req.staffUser?.username ?? "staff";
      await storage.setMenuItemSoldOut(variationId, itemId, name, soldOut, updatedBy);
      invalidateMenuCache();
      res.json({ ok: true });
    } catch (err) {
      console.error("[STAFF MENU] Item sold-out error:", err.message);
      res.status(500).json({ message: "Failed to update item" });
    }
  });
  app2.put("/api/staff/menu/items/:variationId/hidden", staffAuth, managerAuth, async (req, res) => {
    const { variationId } = req.params;
    const { hidden, itemId, name } = req.body;
    if (typeof hidden !== "boolean") return res.status(400).json({ message: "hidden must be boolean" });
    if (!itemId || !name) return res.status(400).json({ message: "itemId and name required" });
    try {
      const updatedBy = req.staffUser?.username ?? "staff";
      await storage.setMenuItemHidden(variationId, itemId, name, hidden, updatedBy);
      invalidateMenuCache();
      res.json({ ok: true });
    } catch (err) {
      console.error("[STAFF MENU] Item hide error:", err.message);
      res.status(500).json({ message: "Failed to update item" });
    }
  });
  app2.get("/api/staff/menu/category-settings", staffAuth, managerAuth, async (req, res) => {
    try {
      const [categories, settings] = await Promise.all([
        getMenuFromSquare(),
        storage.getCategorySettings()
      ]);
      const settingsMap = new Map(settings.map((s) => [s.categoryId, s]));
      const result = categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        imageUrl: settingsMap.get(cat.id)?.imageUrl ?? cat.imageUrl ?? null,
        customImageUrl: settingsMap.get(cat.id)?.imageUrl ?? null,
        displayName: settingsMap.get(cat.id)?.displayName ?? null,
        displayOrder: settingsMap.get(cat.id)?.displayOrder ?? 99,
        mergedIntoId: settingsMap.get(cat.id)?.mergedIntoId ?? null,
        parentCategoryId: settingsMap.get(cat.id)?.parentCategoryId ?? null
      }));
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to load category settings" });
    }
  });
  app2.put("/api/staff/menu/category-settings", staffAuth, managerAuth, async (req, res) => {
    try {
      const { settings } = req.body;
      if (!Array.isArray(settings)) return res.status(400).json({ message: "settings must be an array" });
      const updatedBy = req.staffUser?.username ?? "staff";
      await storage.upsertCategorySettings(settings.map((s) => ({ ...s, updatedBy })));
      invalidateMenuCache();
      res.json({ ok: true });
    } catch (err) {
      console.error("[STAFF MENU] Category settings error:", err.message);
      res.status(500).json({ message: "Failed to save category settings" });
    }
  });
  app2.patch("/api/staff/menu/category-image/:categoryId", staffAuth, managerAuth, upload.single("image"), async (req, res) => {
    const { categoryId } = req.params;
    const updatedBy = req.staffUser?.username ?? "staff";
    try {
      if (req.file) {
        const compressed = await sharp(req.file.buffer).resize({ width: 800, withoutEnlargement: true }).jpeg({ quality: 75, mozjpeg: true }).toBuffer();
        const imageUrl = `data:image/jpeg;base64,${compressed.toString("base64")}`;
        await storage.updateCategoryImage(categoryId, imageUrl, updatedBy);
        invalidateMenuCache();
        return res.json({ ok: true, imageUrl });
      } else if (req.body.remove === "true") {
        await storage.updateCategoryImage(categoryId, null, updatedBy);
        invalidateMenuCache();
        return res.json({ ok: true, imageUrl: null });
      }
      return res.status(400).json({ message: "No image provided" });
    } catch (err) {
      console.error("[CATEGORY IMAGE] Error:", err.message);
      return res.status(500).json({ message: "Failed to update category image" });
    }
  });
  app2.get("/api/staff/menu/availability", staffAuth, managerAuth, async (_req, res) => {
    try {
      const rules = await storage.getAvailabilityRules();
      res.json(rules);
    } catch (err) {
      res.status(500).json({ message: "Failed to load availability rules" });
    }
  });
  app2.post("/api/staff/menu/availability", staffAuth, managerAuth, async (req, res) => {
    try {
      const { targetType, targetId, targetName, daysOfWeek, startTime, endTime, startDate, endDate, note } = req.body;
      if (!targetType || !targetId || !targetName) return res.status(400).json({ message: "targetType, targetId, and targetName required" });
      const createdBy = req.staffUser?.username ?? "staff";
      const rule = await storage.createAvailabilityRule({
        targetType,
        targetId,
        targetName,
        daysOfWeek: daysOfWeek ? JSON.stringify(daysOfWeek) : null,
        startTime: startTime || null,
        endTime: endTime || null,
        startDate: startDate || null,
        endDate: endDate || null,
        note: note || null,
        enabled: true,
        createdBy
      });
      invalidateMenuCache();
      res.json(rule);
    } catch (err) {
      console.error("[AVAILABILITY] Create error:", err.message);
      res.status(500).json({ message: "Failed to create rule" });
    }
  });
  app2.put("/api/staff/menu/availability/:id", staffAuth, managerAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { daysOfWeek, startTime, endTime, startDate, endDate, note, enabled } = req.body;
      const updated = await storage.updateAvailabilityRule(id, {
        ...daysOfWeek !== void 0 ? { daysOfWeek: daysOfWeek ? JSON.stringify(daysOfWeek) : null } : {},
        ...startTime !== void 0 ? { startTime: startTime || null } : {},
        ...endTime !== void 0 ? { endTime: endTime || null } : {},
        ...startDate !== void 0 ? { startDate: startDate || null } : {},
        ...endDate !== void 0 ? { endDate: endDate || null } : {},
        ...note !== void 0 ? { note: note || null } : {},
        ...enabled !== void 0 ? { enabled } : {}
      });
      if (!updated) return res.status(404).json({ message: "Rule not found" });
      invalidateMenuCache();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update rule" });
    }
  });
  app2.delete("/api/staff/menu/availability/:id", staffAuth, managerAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ok = await storage.deleteAvailabilityRule(id);
      if (!ok) return res.status(404).json({ message: "Rule not found" });
      invalidateMenuCache();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete rule" });
    }
  });
  function getTodayStr() {
    return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  }
  const DEFAULT_SCHEDULE = { days: [4, 5, 6, 0], startTime: "12:00", endTime: "20:00" };
  const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  async function getOrderingSchedule() {
    try {
      const raw = await storage.getSetting("ordering_schedule");
      if (raw) return { ...DEFAULT_SCHEDULE, ...JSON.parse(raw) };
    } catch {
    }
    return DEFAULT_SCHEDULE;
  }
  async function getOrderingOverrides() {
    try {
      const raw = await storage.getSetting("ordering_overrides");
      if (raw) return JSON.parse(raw);
    } catch {
    }
    return [];
  }
  function scheduleOpenMessage(schedule) {
    const dayNames = schedule.days.sort((a, b) => a - b).map((d) => DAY_NAMES_SHORT[d]);
    const start = schedule.startTime.replace(":", "").length === 4 ? schedule.startTime : schedule.startTime;
    const fmt = (t) => {
      const [h, m] = t.split(":").map(Number);
      if (m === 0) return h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
      return h < 12 ? `${h}:${String(m).padStart(2, "0")}am` : `${h === 12 ? 12 : h - 12}:${String(m).padStart(2, "0")}pm`;
    };
    return `${dayNames.join(", ")} ${fmt(schedule.startTime)}\u2013${fmt(schedule.endTime)}`;
  }
  async function getOrderingStatus() {
    const today = getTodayStr();
    const now = /* @__PURE__ */ new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    const dow = now.getDay();
    const manualEnabled = await storage.getSetting("ordering_enabled");
    if (manualEnabled === "false") {
      const disabledDate = await storage.getSetting("ordering_disabled_date");
      if (!disabledDate || disabledDate === today) {
        return { enabled: false, reason: "Online ordering has been temporarily closed by staff.", manualOverride: true };
      }
      await storage.setSetting("ordering_enabled", "true");
    }
    const schedule = await getOrderingSchedule();
    const overrides = await getOrderingOverrides();
    const todayOverride = overrides.find((o) => o.date === today);
    if (todayOverride) {
      if (todayOverride.closed) {
        return { enabled: false, reason: `Ordering is closed today${todayOverride.note ? ` (${todayOverride.note})` : ""}.`, nextOpen: scheduleOpenMessage(schedule) };
      }
      const oStart = todayOverride.startTime ?? schedule.startTime;
      const oEnd = todayOverride.endTime ?? schedule.endTime;
      if (hhmm >= oStart && hhmm < oEnd) {
        return { enabled: true, reason: `Ordering open until ${oEnd}`, closesAt: oEnd };
      }
      if (hhmm < oStart) {
        return { enabled: false, reason: `Ordering opens today at ${oStart}${todayOverride.note ? ` (${todayOverride.note})` : ""}`, nextOpen: `Today from ${oStart}` };
      }
    }
    const isScheduledDay = schedule.days.includes(dow);
    if (!isScheduledDay) {
      let daysAhead = 1;
      let nextDow = (dow + daysAhead) % 7;
      while (!schedule.days.includes(nextDow) && daysAhead < 8) {
        daysAhead++;
        nextDow = (dow + daysAhead) % 7;
      }
      const nextName = daysAhead === 1 ? "Tomorrow" : DAY_NAMES_FULL[nextDow];
      return { enabled: false, reason: `Food ordering is available ${scheduleOpenMessage(schedule)}.`, nextOpen: `${nextName} from ${schedule.startTime}` };
    }
    if (hhmm < schedule.startTime) {
      return { enabled: false, reason: `Food ordering opens at ${schedule.startTime} today.`, nextOpen: `Today from ${schedule.startTime}` };
    }
    if (hhmm >= schedule.endTime) {
      let daysAhead = 1;
      let nextDow = (dow + daysAhead) % 7;
      while (!schedule.days.includes(nextDow) && daysAhead < 8) {
        daysAhead++;
        nextDow = (dow + daysAhead) % 7;
      }
      const nextName = daysAhead === 1 ? "Tomorrow" : DAY_NAMES_FULL[nextDow];
      return { enabled: false, reason: `Food ordering closes at ${schedule.endTime}. See you ${nextName.toLowerCase()}!`, nextOpen: `${nextName} from ${schedule.startTime}` };
    }
    return { enabled: true, reason: `Ordering open until ${schedule.endTime}`, closesAt: schedule.endTime };
  }
  async function getOrderingEnabled() {
    const status = await getOrderingStatus();
    return status.enabled;
  }
  app2.get("/api/ordering-status", async (_req, res) => {
    try {
      const status = await getOrderingStatus();
      res.json(status);
    } catch {
      res.json({ enabled: true, reason: "Ordering available" });
    }
  });
  app2.put("/api/staff/ordering-status", staffAuth, async (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled must be boolean" });
    }
    await storage.setSetting("ordering_enabled", String(enabled));
    if (!enabled) {
      await storage.setSetting("ordering_disabled_date", getTodayStr());
    } else {
      await storage.setSetting("ordering_disabled_date", "");
    }
    const who = req.staff?.username || req.staff?.name || "staff";
    console.log(`[ORDERING] Online ordering ${enabled ? "enabled" : "disabled"} by ${who}`);
    const status = await getOrderingStatus();
    res.json(status);
  });
  app2.get("/api/staff/ordering-schedule", staffAuth, async (_req, res) => {
    const schedule = await getOrderingSchedule();
    res.json(schedule);
  });
  app2.put("/api/staff/ordering-schedule", staffAuth, async (req, res) => {
    const { days, startTime, endTime } = req.body;
    if (!Array.isArray(days) || !startTime || !endTime) {
      return res.status(400).json({ message: "days, startTime and endTime required" });
    }
    const schedule = { days, startTime, endTime };
    await storage.setSetting("ordering_schedule", JSON.stringify(schedule));
    const who = req.staff?.username || req.staff?.name || "staff";
    console.log(`[ORDERING] Schedule updated by ${who}: ${JSON.stringify(schedule)}`);
    res.json(schedule);
  });
  app2.get("/api/staff/ordering-overrides", staffAuth, async (_req, res) => {
    const overrides = await getOrderingOverrides();
    res.json(overrides);
  });
  app2.post("/api/staff/ordering-overrides", staffAuth, async (req, res) => {
    const { date, closed, startTime, endTime, note } = req.body;
    if (!date) return res.status(400).json({ message: "date required" });
    const overrides = await getOrderingOverrides();
    const idx = overrides.findIndex((o) => o.date === date);
    const entry = { date, closed: !!closed, startTime, endTime, note };
    if (idx >= 0) overrides[idx] = entry;
    else overrides.push(entry);
    overrides.sort((a, b) => a.date.localeCompare(b.date));
    await storage.setSetting("ordering_overrides", JSON.stringify(overrides));
    res.json(entry);
  });
  app2.delete("/api/staff/ordering-overrides/:date", staffAuth, async (req, res) => {
    const { date } = req.params;
    const overrides = await getOrderingOverrides();
    const filtered = overrides.filter((o) => o.date !== date);
    await storage.setSetting("ordering_overrides", JSON.stringify(filtered));
    res.json({ success: true });
  });
  app2.post("/api/orders/checkout", async (req, res) => {
    const { items, tableNote, orderNote, customer } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }
    try {
      const orderingEnabled = await getOrderingEnabled();
      if (!orderingEnabled) {
        return res.status(503).json({ message: "Online ordering is currently unavailable. Please order at the bar." });
      }
      let discountPercent;
      let discountLabel;
      let excludeWithDeals = false;
      if (customer?.email) {
        try {
          const cust = await storage.getCustomerByEmail(customer.email);
          if (cust) {
            const preSub = await storage.getMembershipSubscriptionByCustomer(cust.id);
            const needsSync = !preSub || preSub.source === "square_group_sync";
            if (needsSync) {
              await syncSquareMembershipForCustomer(cust.id, cust.email).catch(
                (e) => console.warn("[ORDER] Pre-checkout sync failed:", e.message)
              );
            }
            const sub = await storage.getMembershipSubscriptionByCustomer(cust.id);
            const isActive = sub?.status === "active";
            const notCancelled = !sub?.cancelledAt;
            const periodValid = !sub?.currentPeriodEnd || new Date(sub.currentPeriodEnd) >= /* @__PURE__ */ new Date();
            const planActive = sub?.plan !== null;
            const hasDiscount = (sub?.plan?.foodDrinkDiscount ?? 0) > 0;
            if (sub && isActive && notCancelled && periodValid && planActive && hasDiscount) {
              discountPercent = sub.plan.foodDrinkDiscount;
              discountLabel = `${sub.plan.name} Member Discount`;
              excludeWithDeals = !!sub.plan?.excludeWithDeals;
            } else if (sub) {
              console.log(
                `[ORDER] Discount withheld for ${customer.email}: status=${sub.status}, cancelledAt=${sub.cancelledAt}, periodEnd=${sub.currentPeriodEnd}, planActive=${planActive}, discount=${sub.plan?.foodDrinkDiscount}`
              );
            }
          }
        } catch (err) {
          console.warn("[ORDER] Could not look up membership discount:", err.message);
        }
      }
      const { url, linkId, squareOrderId } = await createOrderCheckoutLink(
        items,
        tableNote,
        customer,
        discountPercent,
        discountLabel,
        excludeWithDeals,
        orderNote
      );
      const rawTotal = items.reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0);
      const discountedTotal = discountPercent ? Math.round(rawTotal * (1 - discountPercent / 100)) : rawTotal;
      storage.createAppOrder({
        squareLinkId: linkId || void 0,
        squareOrderId: squareOrderId || void 0,
        tableNote: tableNote || void 0,
        customerName: customer?.name || void 0,
        customerEmail: customer?.email || void 0,
        itemsJson: JSON.stringify(
          items.map((i) => ({
            name: i.name ?? "Item",
            quantity: i.quantity,
            price: i.price,
            ...i.modifiers?.length ? { modifiers: i.modifiers.map((m) => m.name) } : {}
          }))
        ),
        totalPence: discountedTotal,
        discountPercent: discountPercent ?? void 0,
        discountLabel: discountLabel ?? void 0
      }).catch((err) => console.error("[ORDER] Failed to save order record:", err.message));
      res.json({ url, discountPercent: discountPercent ?? null, discountLabel: discountLabel ?? null });
    } catch (err) {
      console.error("[ORDER] Checkout failed:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app2.get("/api/public/square-config", (_req, res) => {
    const applicationId = getApplicationId();
    const locationId = getPublicLocationId();
    const environment = getEnvironment();
    res.json({
      applicationId,
      locationId,
      environment,
      configured: isWebPaymentsConfigured()
    });
  });
  app2.post("/api/orders/create", async (req, res) => {
    const { items, tableNote, orderNote, customer } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }
    if (!isWebPaymentsConfigured()) {
      return res.status(503).json({ message: "In-app payments are not configured." });
    }
    try {
      const orderingEnabled = await getOrderingEnabled();
      if (!orderingEnabled) {
        return res.status(503).json({ message: "Online ordering is currently unavailable. Please order at the bar." });
      }
      let discountPercent;
      let discountLabel;
      let excludeWithDeals = false;
      if (customer?.email) {
        try {
          const cust = await storage.getCustomerByEmail(customer.email);
          if (cust) {
            const preSub = await storage.getMembershipSubscriptionByCustomer(cust.id);
            const needsSync = !preSub || preSub.source === "square_group_sync";
            if (needsSync) {
              await syncSquareMembershipForCustomer(cust.id, cust.email).catch(
                (e) => console.warn("[ORDER] Pre-create sync failed:", e.message)
              );
            }
            const sub = await storage.getMembershipSubscriptionByCustomer(cust.id);
            const isActive = sub?.status === "active";
            const notCancelled = !sub?.cancelledAt;
            const periodValid = !sub?.currentPeriodEnd || new Date(sub.currentPeriodEnd) >= /* @__PURE__ */ new Date();
            const planActive = sub?.plan !== null;
            const hasDiscount = (sub?.plan?.foodDrinkDiscount ?? 0) > 0;
            if (sub && isActive && notCancelled && periodValid && planActive && hasDiscount) {
              discountPercent = sub.plan.foodDrinkDiscount;
              discountLabel = `${sub.plan.name} Member Discount`;
              excludeWithDeals = !!sub.plan?.excludeWithDeals;
            }
          }
        } catch (err) {
          console.warn("[ORDER] Could not look up membership discount:", err.message);
        }
      }
      const { orderId, totalPence } = await createSquareOrderForCheckout(
        items,
        tableNote,
        customer,
        discountPercent,
        discountLabel,
        excludeWithDeals,
        orderNote
      );
      const appOrder = await storage.createAppOrder({
        squareOrderId: orderId,
        tableNote: tableNote || void 0,
        customerName: customer?.name || void 0,
        customerEmail: customer?.email || void 0,
        itemsJson: JSON.stringify(
          items.map((i) => ({
            name: i.name ?? "Item",
            quantity: i.quantity,
            price: i.price,
            ...i.modifiers?.length ? { modifiers: i.modifiers.map((m) => m.name) } : {}
          }))
        ),
        totalPence,
        discountPercent: discountPercent ?? void 0,
        discountLabel: discountLabel ?? void 0
      });
      res.json({
        appOrderId: appOrder.id,
        squareOrderId: orderId,
        amountPence: totalPence,
        discountPercent: discountPercent ?? null,
        discountLabel: discountLabel ?? null
      });
    } catch (err) {
      console.error("[ORDER] Create order failed:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app2.post("/api/orders/:appOrderId/pay", async (req, res) => {
    const appOrderId = parseInt(String(req.params.appOrderId));
    if (isNaN(appOrderId)) return res.status(400).json({ message: "Invalid order id" });
    const { sourceId, verificationToken, buyerEmail } = req.body || {};
    if (typeof sourceId !== "string" || !sourceId.trim()) {
      return res.status(400).json({ message: "Missing payment token" });
    }
    if (!isWebPaymentsConfigured()) {
      return res.status(503).json({ message: "In-app payments are not configured." });
    }
    try {
      const order = await storage.getAppOrder(appOrderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.status !== "pending") {
        return res.status(409).json({ message: `Order is already ${order.status}` });
      }
      if (!order.squareOrderId) {
        return res.status(400).json({ message: "Order is missing Square reference" });
      }
      const idemRaw = `app-order-${appOrderId}|${sourceId}`;
      const idempotencyKey = createHash2("sha256").update(idemRaw).digest("hex").slice(0, 45);
      const payment = await createCardPayment({
        sourceId: sourceId.trim(),
        amountPence: order.totalPence,
        idempotencyKey,
        note: order.tableNote ? `Order ${appOrderId} \u2014 ${order.tableNote}` : `Order ${appOrderId}`,
        referenceId: `app-order-${appOrderId}`,
        buyerEmail: buyerEmail || order.customerEmail || null,
        verificationToken: verificationToken || null,
        orderId: order.squareOrderId
      });
      const succeeded = payment.status === "COMPLETED" || payment.status === "APPROVED";
      if (succeeded) {
        await storage.updateAppOrderPaid(order.squareOrderId, payment.id).catch(
          (e) => console.error("[ORDER] Failed to mark paid:", e.message)
        );
      }
      res.json({
        ok: succeeded,
        status: payment.status,
        paymentId: payment.id,
        appOrderId: order.id
      });
    } catch (err) {
      const squareErrors = Array.isArray(err?.errors) ? err.errors : Array.isArray(err?.result?.errors) ? err.result.errors : [];
      const first = squareErrors[0] || {};
      const errorCode = first.code;
      const errorDetail = first.detail || err?.message;
      console.error("[ORDER] Pay failed:", { code: err?.code, errorCode, detail: errorDetail });
      res.status(400).json({
        message: errorDetail || "Card charge failed",
        errorCode: errorCode || null
      });
    }
  });
  app2.get("/api/staff/orders", staffAuth, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 200);
      const orders = await storage.getRecentAppOrders(limit);
      const orderIds = orders.map((o) => o.id);
      const auditEntries = await storage.getAuditLogsForOrders(orderIds);
      const auditMap = {};
      for (const entry of auditEntries) {
        if (!auditMap[entry.orderId]) auditMap[entry.orderId] = entry;
      }
      const enriched = orders.map((o) => ({ ...o, audit: auditMap[o.id] ?? null }));
      res.json(enriched);
    } catch (err) {
      console.error("[ORDERS] Failed to load orders:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app2.post("/api/staff/orders/:id/cancel", staffAuth, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ message: "Invalid order ID" });
    const { pin, reason } = req.body;
    const staffUsername = req.staffUsername;
    if (staffUsername) {
      if (!pin) return res.status(400).json({ message: "PIN required to authorise this action" });
      const staffUser = await storage.getStaffUserByUsername(staffUsername);
      if (!staffUser || !verifyPin(String(pin), staffUser.pinHash, staffUser.pinSalt)) {
        return res.status(401).json({ message: "Incorrect PIN" });
      }
    }
    try {
      const order = await storage.getAppOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.status === "cancelled" || order.status === "refunded") {
        return res.status(400).json({ message: `Order is already ${order.status}` });
      }
      const actor = staffUsername || "admin";
      if (order.status === "paid" && order.squarePaymentId) {
        const idKey = `refund-cancel-${id}-${Date.now()}`;
        await createRefund({ paymentId: order.squarePaymentId, amountPence: order.totalPence, reason: reason || "Order cancelled by staff", idempotencyKey: idKey });
        await storage.updateAppOrderStatus(id, "refunded");
        await storage.logOrderAction({ orderId: id, staffUsername: actor, action: "cancel+refund", reason: reason || void 0 });
        console.log(`[ORDERS] Order #${id} cancelled+refunded by ${actor}`);
        return res.json({ status: "refunded", message: "Payment refunded and order cancelled" });
      }
      await storage.updateAppOrderStatus(id, "cancelled");
      await storage.logOrderAction({ orderId: id, staffUsername: actor, action: "cancel", reason: reason || void 0 });
      console.log(`[ORDERS] Order #${id} cancelled by ${actor}`);
      res.json({ status: "cancelled" });
    } catch (err) {
      console.error("[ORDERS] Cancel failed:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app2.post("/api/staff/orders/:id/refund", staffAuth, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ message: "Invalid order ID" });
    const { pin, reason } = req.body;
    const staffUsername = req.staffUsername;
    if (staffUsername) {
      if (!pin) return res.status(400).json({ message: "PIN required to authorise this action" });
      const staffUser = await storage.getStaffUserByUsername(staffUsername);
      if (!staffUser || !verifyPin(String(pin), staffUser.pinHash, staffUser.pinSalt)) {
        return res.status(401).json({ message: "Incorrect PIN" });
      }
    }
    try {
      const order = await storage.getAppOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.status !== "paid") return res.status(400).json({ message: "Only paid orders can be refunded" });
      if (!order.squarePaymentId) return res.status(400).json({ message: "No payment ID on record \u2014 contact Square support" });
      const actor = staffUsername || "admin";
      const idKey = `refund-${id}-${Date.now()}`;
      await createRefund({
        paymentId: order.squarePaymentId,
        amountPence: order.totalPence,
        reason: reason || "Refund issued by staff",
        idempotencyKey: idKey
      });
      await storage.updateAppOrderStatus(id, "refunded");
      await storage.logOrderAction({ orderId: id, staffUsername: actor, action: "refund", reason: reason || void 0 });
      console.log(`[ORDERS] Order #${id} refunded by ${actor}`);
      res.json({ status: "refunded" });
    } catch (err) {
      console.error("[ORDERS] Refund failed:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app2.get("/api/customers/orders", customerAuth, async (req, res) => {
    try {
      const email = req.customerEmail;
      if (!email) return res.status(400).json({ message: "No customer email" });
      const orders = await storage.getCustomerOrders(email);
      res.json(orders);
    } catch (err) {
      console.error("[ORDERS] Customer orders failed:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app2.get("/api/events", async (req, res) => {
    try {
      const eventType = req.query.type;
      if (eventType === "weekly") {
        const weeklyEvents = await storage.getActiveEvents("weekly");
        return res.json(weeklyEvents);
      }
      if (!eventType || eventType === "event") {
        const [tsEvents, dbEvents] = await Promise.all([
          fetchTicketSourceEvents().catch(() => []),
          storage.getActiveEvents("event")
        ]);
        const mapped = tsEvents.map(mapTsEvent);
        const combined = [...dbEvents, ...mapped];
        combined.sort((a, b) => {
          if (!a.date) return 1;
          if (!b.date) return -1;
          return a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "");
        });
        return res.json(combined);
      }
      const allEvents = await storage.getActiveEvents(eventType);
      res.json(allEvents);
    } catch (err) {
      console.error("Events fetch error:", err);
      res.json([]);
    }
  });
  app2.get("/api/events/all", staffAuth, managerAuth, async (req, res) => {
    const { type } = req.query;
    const dbEvents = await storage.getEvents();
    if (type === "weekly") {
      return res.json(dbEvents.filter((e) => e.eventType === "weekly"));
    }
    const dbFiltered = type === "event" ? dbEvents.filter((e) => e.eventType === "event") : dbEvents;
    try {
      const tsEvents = await fetchTicketSourceEvents().catch(() => []);
      const mapped = tsEvents.map(mapTsEvent);
      const combined = [...dbFiltered, ...mapped];
      combined.sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "");
      });
      return res.json(combined);
    } catch {
      return res.json(dbFiltered);
    }
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
  app2.get("/api/banner-images", async (req, res) => {
    const page = typeof req.query.page === "string" ? req.query.page : void 0;
    const images = await storage.getBannerImages(page);
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
      const sessionToken = randomBytes3(32).toString("hex");
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
    const sessionToken = randomBytes3(32).toString("hex");
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
  async function syncSquareMembershipForCustomer(customerId, email) {
    try {
      if (!isConfigured()) return;
      const existing = await storage.getMembershipSubscriptionByCustomer(customerId);
      const allPlans = await storage.getMembershipPlans();
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      if (existing && existing.source === "square_group_sync") {
        const sqCustomerForCheck = await findSquareCustomerByEmail(email).catch(() => null);
        if (sqCustomerForCheck) {
          const groupPlansForCheck = allPlans.filter((p) => p.active && p.squareCustomerGroupId);
          const currentGroupIds = await getCustomerGroupIds(sqCustomerForCheck.id).catch(() => []);
          const stillInGroup = groupPlansForCheck.some((p) => currentGroupIds.includes(p.squareCustomerGroupId) && p.id === existing.planId);
          if (!stillInGroup) {
            await storage.updateMembershipSubscription(existing.id, {
              status: "cancelled",
              cancelledAt: /* @__PURE__ */ new Date(),
              staffNotes: "Auto-cancelled: customer removed from Square customer group"
            });
            console.log(`[MEMBERSHIP] Group membership cancelled for #${customerId} (${email}) \u2014 no longer in Square group`);
          } else {
            const refreshedEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
            await storage.updateMembershipSubscription(existing.id, { currentPeriodEnd: refreshedEnd });
            return;
          }
        } else {
          return;
        }
      } else if (existing) {
        return;
      }
      const sqCustomer = await findSquareCustomerByEmail(email).catch(() => null);
      if (!sqCustomer) return;
      const sqSubs = await listSquareSubscriptionsForCustomer(sqCustomer.id).catch(() => []);
      const subPlans = allPlans.filter((p) => p.active && (p.squarePlanVariationId || p.squarePlanVariationIdAlt));
      const planMatchesVariation = (p, variationId) => p.squarePlanVariationId === variationId || p.squarePlanVariationIdAlt === variationId;
      const matchedSub = sqSubs.find(
        (s) => (s.status === "ACTIVE" || s.status === "PENDING") && subPlans.some((p) => planMatchesVariation(p, s.plan_variation_id))
      );
      if (matchedSub) {
        const plan = subPlans.find((p) => planMatchesVariation(p, matchedSub.plan_variation_id));
        const periodEnd = matchedSub.charged_through_date ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
        await storage.createMembershipSubscription({
          customerId,
          planId: plan.id,
          status: "active",
          currentPeriodStart: matchedSub.start_date ?? today,
          currentPeriodEnd: periodEnd,
          hoursUsedThisPeriod: 0,
          guestPassesUsed: 0,
          squareSubscriptionId: matchedSub.id,
          squareCustomerId: sqCustomer.id,
          source: "square_sync",
          staffNotes: "Auto-synced from Square on app sign-in"
        });
        console.log(`[MEMBERSHIP] Auto-synced Square subscription ${matchedSub.id} \u2192 customer #${customerId} (${email})`);
        return;
      }
      const groupPlans = allPlans.filter((p) => p.active && p.squareCustomerGroupId);
      if (groupPlans.length) {
        const customerGroupIds = await getCustomerGroupIds(sqCustomer.id).catch(() => []);
        const groupMatch = groupPlans.find((p) => customerGroupIds.includes(p.squareCustomerGroupId));
        if (groupMatch) {
          const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
          await storage.createMembershipSubscription({
            customerId,
            planId: groupMatch.id,
            status: "active",
            currentPeriodStart: today,
            currentPeriodEnd: periodEnd,
            hoursUsedThisPeriod: 0,
            guestPassesUsed: 0,
            squareCustomerId: sqCustomer.id,
            source: "square_group_sync",
            staffNotes: `Auto-synced from Square customer group "${groupMatch.name}" on app sign-in`
          });
          console.log(`[MEMBERSHIP] Auto-synced Square group "${groupMatch.name}" \u2192 customer #${customerId} (${email})`);
        }
      }
    } catch (err) {
      console.warn("[MEMBERSHIP] Square sync failed (non-fatal):", err.message);
    }
  }
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
      const verifyTokenRaw = randomBytes3(32).toString("hex");
      const verifyTokenHash = createHash2("sha256").update(verifyTokenRaw).digest("hex");
      const verifyExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
      const customer = await storage.createCustomer(email, name.trim(), phone?.trim() || null, passwordHash, {
        emailVerifyTokenHash: verifyTokenHash,
        emailVerifyTokenExpiresAt: verifyExpiresAt
      });
      const token = randomBytes3(48).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3);
      await storage.createCustomerSession(token, customer.id, expiresAt);
      res.status(201).json({
        token,
        customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, emailVerified: false }
      });
      sendVerificationEmail({ name: customer.name, email: customer.email, tokenRaw: verifyTokenRaw });
      syncSquareMembershipForCustomer(customer.id, customer.email);
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
      const token = randomBytes3(48).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3);
      await storage.createCustomerSession(token, customer.id, expiresAt);
      res.json({
        token,
        customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, emailVerified: customer.emailVerified }
      });
      syncSquareMembershipForCustomer(customer.id, customer.email);
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
    res.json({ id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, emailVerified: customer.emailVerified });
  });
  app2.post("/api/customers/me/resend-verification", customerAuth, async (req, res) => {
    const customerId = req.customerId;
    if (!customerId) return res.status(401).json({ message: "Not signed in" });
    const customer = await storage.getCustomerById(customerId);
    if (!customer) return res.status(404).json({ message: "Account not found" });
    if (customer.emailVerified) {
      return res.json({ success: true, alreadyVerified: true });
    }
    const lastSent = customer.emailVerifyLastSentAt;
    if (lastSent && Date.now() - lastSent.getTime() < 6e4) {
      const retryAfter = Math.ceil((6e4 - (Date.now() - lastSent.getTime())) / 1e3);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ message: `Please wait ${retryAfter}s before requesting another email.` });
    }
    const verifyTokenRaw = randomBytes3(32).toString("hex");
    const verifyTokenHash = createHash2("sha256").update(verifyTokenRaw).digest("hex");
    const verifyExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
    await storage.setEmailVerificationToken(customerId, verifyTokenHash, verifyExpiresAt);
    sendVerificationEmail({ name: customer.name, email: customer.email, tokenRaw: verifyTokenRaw });
    res.json({ success: true });
  });
  app2.get("/verify-email", async (req, res) => {
    const tokenRaw = String(req.query.token || "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!tokenRaw) {
      return res.status(400).send(renderVerifyResultPage("error", "Missing verification token. Please use the link from your email."));
    }
    const tokenHash = createHash2("sha256").update(tokenRaw).digest("hex");
    const customer = await storage.getCustomerByVerifyTokenHash(tokenHash);
    if (!customer) {
      return res.status(400).send(renderVerifyResultPage("error", "This link is invalid or has already been used. If you've already verified, you're all set."));
    }
    const expiresAt = customer.emailVerifyTokenExpiresAt;
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      return res.status(400).send(renderVerifyResultPage("error", "This verification link has expired. Sign in to your account and request a new one."));
    }
    await storage.markEmailVerified(customer.id);
    res.send(renderVerifyResultPage("success", "Your email is verified. You can now use account recovery if you ever lose access."));
  });
  app2.post("/api/customers/resend-verification-public", async (req, res) => {
    const clientIp = getClientIp(req);
    if (!checkSensitiveRateLimit(clientIp)) {
      return res.status(429).json({ message: "Too many requests. Please try again later." });
    }
    const email = String(req.body?.email || "").trim();
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    try {
      const customer = await storage.getCustomerByEmail(email);
      if (customer && !customer.emailVerified) {
        const lastSent = customer.emailVerifyLastSentAt;
        if (!lastSent || Date.now() - lastSent.getTime() >= 6e4) {
          const verifyTokenRaw = randomBytes3(32).toString("hex");
          const verifyTokenHash = createHash2("sha256").update(verifyTokenRaw).digest("hex");
          const verifyExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
          await storage.setEmailVerificationToken(customer.id, verifyTokenHash, verifyExpiresAt);
          sendVerificationEmail({ name: customer.name, email: customer.email, tokenRaw: verifyTokenRaw });
        }
      }
    } catch (err) {
      console.error("Public resend verification error:", err.message);
    }
    res.json({ success: true });
  });
  app2.post("/api/customers/forgot-password", async (req, res) => {
    const clientIp = getClientIp(req);
    if (!checkSensitiveRateLimit(clientIp)) {
      return res.status(429).json({ message: "Too many requests. Please try again later." });
    }
    const email = String(req.body?.email || "").trim();
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }
    try {
      const customer = await storage.getCustomerByEmail(email);
      if (!customer) {
        return res.json({ success: true });
      }
      if (!customer.emailVerified) {
        return res.status(403).json({
          code: "EMAIL_NOT_VERIFIED",
          message: "Please verify your email address before resetting your password. We can resend the verification link.",
          email: customer.email
        });
      }
      const lastSent = customer.passwordResetLastSentAt;
      if (lastSent && Date.now() - lastSent.getTime() < 6e4) {
        return res.json({ success: true });
      }
      const tokenRaw = randomBytes3(32).toString("hex");
      const tokenHash = createHash2("sha256").update(tokenRaw).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1e3);
      await storage.setPasswordResetToken(customer.id, tokenHash, expiresAt);
      sendPasswordResetEmail({ name: customer.name, email: customer.email, tokenRaw });
      res.json({ success: true });
    } catch (err) {
      console.error("Forgot password error:", err.message);
      res.status(500).json({ message: "Could not process the request" });
    }
  });
  app2.post("/api/customers/reset-password", async (req, res) => {
    const clientIp = getClientIp(req);
    if (!checkSensitiveRateLimit(clientIp)) {
      return res.status(429).json({ message: "Too many requests. Please try again later." });
    }
    const token = String(req.body?.token || "");
    const password = String(req.body?.password || "");
    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    try {
      const tokenHash = createHash2("sha256").update(token).digest("hex");
      const customer = await storage.getCustomerByPasswordResetTokenHash(tokenHash);
      if (!customer) {
        return res.status(400).json({ message: "This reset link is invalid or has already been used." });
      }
      const expiresAt = customer.passwordResetTokenExpiresAt;
      if (!expiresAt || expiresAt.getTime() < Date.now()) {
        return res.status(400).json({ message: "This reset link has expired. Please request a new one." });
      }
      if (!customer.emailVerified) {
        return res.status(403).json({ code: "EMAIL_NOT_VERIFIED", message: "Please verify your email address before resetting your password." });
      }
      const { hash, salt } = hashPin(password);
      const passwordHash = `${salt}:${hash}`;
      await storage.setCustomerPassword(customer.id, passwordHash);
      res.json({ success: true });
    } catch (err) {
      console.error("Reset password error:", err.message);
      res.status(500).json({ message: "Could not reset password" });
    }
  });
  app2.get("/reset-password", async (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (req.query.done === "1") {
      return res.send(renderResetPasswordPage({ token: "", success: true }));
    }
    const tokenRaw = String(req.query.token || "");
    if (!tokenRaw) {
      return res.status(400).send(renderResetPasswordPage({ token: "", error: "Missing reset token. Please use the link from your email." }));
    }
    const tokenHash = createHash2("sha256").update(tokenRaw).digest("hex");
    const customer = await storage.getCustomerByPasswordResetTokenHash(tokenHash);
    if (!customer) {
      return res.status(400).send(renderResetPasswordPage({ token: "", error: "This reset link is invalid or has already been used." }));
    }
    const expiresAt = customer.passwordResetTokenExpiresAt;
    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      return res.status(400).send(renderResetPasswordPage({ token: "", error: "This reset link has expired. Please request a new one." }));
    }
    res.send(renderResetPasswordPage({ token: tokenRaw }));
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
    sendBookingCancellationEmail({
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      date: booking.date,
      startTime: booking.startTime,
      duration: booking.duration,
      tableType: booking.tableType,
      tableNumber: booking.tableNumber || void 0,
      id: bookingId
    }).catch(() => {
    });
    res.json({ success: true, booking: updated });
  });
  app2.patch("/api/customers/bookings/:id/reschedule", customerAuth, async (req, res) => {
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
      return res.status(400).json({ message: "Cannot reschedule a cancelled booking" });
    }
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    if (booking.date < today) {
      return res.status(400).json({ message: "Cannot reschedule past bookings" });
    }
    const { date, startTime, duration } = req.body;
    if (!date || !startTime || !duration) {
      return res.status(400).json({ message: "date, startTime, and duration are required" });
    }
    const dur = parseInt(String(duration));
    if (isNaN(dur) || dur < 1) {
      return res.status(400).json({ message: "Invalid duration" });
    }
    const DINING_TABLE_COUNT = 25;
    const reqStart = parseInt(startTime.toString().replace(":", ""));
    const reqEnd = reqStart + dur * 100;
    const slots = await storage.getBookedSlots(date, booking.tableType, booking.tableNumber || void 0, bookingId);
    if (booking.tableType === "dining") {
      let count = 0;
      for (const slot of slots) {
        const slotStart = parseInt(slot.startTime.replace(":", ""));
        const slotEnd = slotStart + slot.duration * 100;
        if (reqStart < slotEnd && reqEnd > slotStart) count++;
      }
      if (count >= DINING_TABLE_COUNT) {
        return res.status(409).json({ message: "That time slot is fully booked" });
      }
    } else {
      for (const slot of slots) {
        const slotStart = parseInt(slot.startTime.replace(":", ""));
        const slotEnd = slotStart + slot.duration * 100;
        if (reqStart < slotEnd && reqEnd > slotStart) {
          return res.status(409).json({ message: "That time slot is no longer available" });
        }
      }
    }
    const updated = await storage.updateBooking(bookingId, { date, startTime, duration: dur });
    sendBookingRescheduleEmail({
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      date,
      startTime,
      duration: dur,
      tableType: booking.tableType,
      tableNumber: booking.tableNumber || void 0,
      id: bookingId
    }).catch(() => {
    });
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
      const { planId, billingFrequency = "monthly", startDate, termsAccepted } = req.body ?? {};
      if (!planId) return res.status(400).json({ message: "planId is required" });
      if (termsAccepted !== true) return res.status(400).json({ message: "You must accept the Terms & Conditions to join" });
      const isAnnual = billingFrequency === "annual";
      const existing = await storage.getMembershipSubscriptionByCustomer(customerId);
      if (existing && existing.planId === parseInt(planId) && existing.status === "active") {
        return res.status(409).json({ message: "You already have an active membership on this plan" });
      }
      const plan = await storage.getMembershipPlan(parseInt(planId));
      if (!plan || !plan.active) return res.status(404).json({ message: "Plan not found" });
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const periodStart = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && startDate > today ? startDate : today;
      const periodEndDate = /* @__PURE__ */ new Date(periodStart + "T12:00:00Z");
      if (isAnnual) {
        periodEndDate.setFullYear(periodEndDate.getFullYear() + 1);
      } else {
        periodEndDate.setMonth(periodEndDate.getMonth() + 1);
      }
      const periodEnd = periodEndDate.toISOString().slice(0, 10);
      if (existing && existing.id) {
        await storage.updateMembershipSubscription(existing.id, {
          status: "cancelled",
          cancelledAt: /* @__PURE__ */ new Date()
        });
      }
      const initialStatus = periodStart > today ? "pending_start" : "pending";
      const sub = await storage.createMembershipSubscription({
        customerId,
        planId: plan.id,
        status: initialStatus,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        hoursUsedThisPeriod: 0,
        guestPassesUsed: 0,
        staffNotes: periodStart > today ? `[Deferred start: ${periodStart}]` : null,
        source: isAnnual ? "app_annual" : "app",
        termsAcceptedAt: /* @__PURE__ */ new Date()
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
              const variationId = isAnnual ? plan.squarePlanVariationIdAlt || plan.squarePlanVariationId : plan.squarePlanVariationId;
              const chargeAmount = isAnnual ? plan.priceAnnual || plan.priceMonthly * 12 : plan.priceMonthly;
              const checkout = variationId ? await createSubscriptionCheckoutLink({
                planVariationId: variationId,
                subscriptionId: sub.id,
                buyerEmail: customer?.email,
                redirectUrl
              }).catch((err) => {
                console.error("[membership/join] subscription checkout error:", err?.message ?? err);
                return null;
              }) : await createMembershipCheckoutLink({
                planName: `${plan.name}${isAnnual ? " (Annual)" : ""}`,
                amountPence: chargeAmount,
                subscriptionId: sub.id,
                redirectUrl
              }).catch((err) => {
                console.error("[membership/join] one-time checkout error:", err?.message ?? err);
                return null;
              });
              if (checkout) {
                checkoutUrl = checkout.url;
                console.log(`[membership/join] ${variationId ? "Subscription" : "One-time"} ${isAnnual ? "annual" : "monthly"} checkout created for sub #${sub.id}`);
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
      if (type === "subscription.created") {
        const sqSub = event?.data?.object?.subscription;
        if (sqSub?.id && sqSub?.customer_id) {
          const existingSubs = await storage.getMembershipSubscriptions();
          let local = existingSubs.find(
            (s) => s.squareCustomerId === sqSub.customer_id && (s.status === "pending" || s.status === "pending_payment") && !s.squareSubscriptionId
          );
          if (!local) {
            local = existingSubs.find(
              (s) => s.squareCustomerId === sqSub.customer_id && !s.squareSubscriptionId && !!s.migrationToken
            );
          }
          if (local) {
            await storage.updateMembershipSubscription(local.id, {
              squareSubscriptionId: sqSub.id,
              ...local.migrationToken && !local.migrationCompletedAt ? { migrationCompletedAt: /* @__PURE__ */ new Date(), source: "wix_migrated" } : {}
            });
            console.log(`[MEMBERSHIP WEBHOOK] Linked Square subscription ${sqSub.id} \u2192 local #${local.id}${local.migrationToken ? " (Wix migration complete)" : ""}`);
          }
        }
      }
      if (type === "invoice.payment_made") {
        const invoice = event?.data?.object?.invoice;
        const sqSubId = invoice?.subscription_id;
        if (sqSubId) {
          const existingSubs = await storage.getMembershipSubscriptions();
          const local = existingSubs.find((s) => s.squareSubscriptionId === sqSubId);
          if (local) {
            let nextPeriodEnd;
            if (invoice.next_payment_amount_money || invoice.next_payment_due_date) {
              nextPeriodEnd = invoice.next_payment_due_date ?? void 0;
            }
            if (!nextPeriodEnd) {
              const next = /* @__PURE__ */ new Date();
              next.setMonth(next.getMonth() + 1);
              nextPeriodEnd = next.toISOString().slice(0, 10);
            }
            await storage.updateMembershipSubscription(local.id, {
              status: "active",
              failedPaymentAttempts: 0,
              currentPeriodStart: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
              currentPeriodEnd: nextPeriodEnd
            });
            console.log(`[MEMBERSHIP WEBHOOK] Payment received for #${local.id} \u2014 activated, renews ${nextPeriodEnd}`);
            if (local.status === "active") {
              const customer = await storage.getCustomerById(local.customerId).catch(() => null);
              if (customer?.email) {
                const tokens = await storage.getPushTokensByEmail(customer.email).catch(() => []);
                if (tokens.length > 0) {
                  await sendTargetedPush(
                    tokens.map((t) => t.token),
                    "Membership Renewed",
                    `Your membership has been renewed and is active until ${nextPeriodEnd}.`
                  ).catch(() => {
                  });
                }
              }
            }
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
  app2.get("/api/staff/square/customer-groups", staffAuth, async (_req, res) => {
    try {
      if (!isConfigured()) return res.status(503).json({ message: "Square is not configured" });
      const groups = await listCustomerGroups();
      res.json(groups);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app2.post("/api/staff/membership/plans", staffAuth, managerAuth, async (req, res) => {
    const { name, tier, priceMonthly, priceAnnual, hoursIncluded, hoursUnit, foodDrinkDiscount, priorityBooking, loyaltyMultiplier, guestPassesMonthly, squarePlanVariationId, squarePlanVariationIdAlt, squareCustomerGroupId, excludeWithDeals, active, sortOrder, color, description } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ message: "Plan name is required" });
    if (priceMonthly == null || isNaN(Number(priceMonthly))) return res.status(400).json({ message: "Monthly price is required" });
    const resolvedTier = (tier?.trim() || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")) + "_" + Date.now();
    try {
      const plan = await storage.createMembershipPlan({
        name: name.trim(),
        tier: resolvedTier,
        priceMonthly: Number(priceMonthly),
        hoursIncluded: hoursIncluded != null && hoursIncluded !== "" ? Number(hoursIncluded) : null,
        hoursUnit: hoursUnit || "month",
        foodDrinkDiscount: Number(foodDrinkDiscount) || 0,
        priorityBooking: !!priorityBooking,
        loyaltyMultiplier: Number(loyaltyMultiplier) || 1,
        guestPassesMonthly: Number(guestPassesMonthly) || 0,
        priceAnnual: priceAnnual != null && priceAnnual !== "" ? Number(priceAnnual) : null,
        squarePlanVariationId: squarePlanVariationId?.trim() || null,
        squarePlanVariationIdAlt: squarePlanVariationIdAlt?.trim() || null,
        squareCustomerGroupId: squareCustomerGroupId?.trim() || null,
        excludeWithDeals: !!excludeWithDeals,
        active: active !== false,
        sortOrder: Number(sortOrder) || 0,
        color: color || "#0047AB",
        description: description?.trim() || null
      });
      res.json(plan);
    } catch (err) {
      console.error("[PLAN CREATE]", err.message);
      res.status(500).json({ message: err.message });
    }
  });
  app2.put("/api/staff/membership/plans/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const oldPlan = await storage.getMembershipPlan(id);
    let plan = await storage.updateMembershipPlan(id, req.body);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    let squareSynced = false;
    let squareSyncError = null;
    if (plan.squarePlanVariationId && isConfigured() && oldPlan) {
      const priceChanged = req.body.priceMonthly !== void 0 && req.body.priceMonthly !== oldPlan.priceMonthly;
      const nameChanged = req.body.name !== void 0 && req.body.name !== oldPlan.name;
      if (priceChanged || nameChanged) {
        try {
          const { newVariationId } = await syncPlanToSquareCatalog({
            localPlanId: id,
            planVariationId: plan.squarePlanVariationId,
            planName: plan.name,
            newAmountPence: plan.priceMonthly,
            priceChanged,
            nameChanged
          });
          if (newVariationId) {
            await storage.updateMembershipPlan(id, { squarePlanVariationId: newVariationId });
            plan = { ...plan, squarePlanVariationId: newVariationId };
            console.log(`[PLAN EDIT] New Square plan created for price change: ${newVariationId}`);
          }
          squareSynced = true;
          console.log(`[PLAN EDIT] Square synced \u2014 ${plan.name} price=\xA3${(plan.priceMonthly / 100).toFixed(2)}`);
        } catch (sqErr) {
          squareSyncError = sqErr?.message ?? "Square sync failed";
          console.error("[PLAN EDIT] Square sync error:", sqErr?.message);
        }
      }
    }
    res.json({ ...plan, squareSynced, squareSyncError });
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
  app2.post("/api/staff/membership/setup-square-billing", staffAuth, managerAuth, async (_req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ message: "Square is not configured" });
    }
    try {
      const plans = await storage.getMembershipPlans();
      const results = [];
      for (const plan of plans) {
        if (plan.squarePlanVariationId) {
          results.push({ planId: plan.id, name: plan.name, squarePlanVariationId: plan.squarePlanVariationId, skipped: true });
          continue;
        }
        const result = await createCatalogSubscriptionPlan({
          localPlanId: plan.id,
          name: plan.name,
          amountPence: plan.priceMonthly
        });
        await storage.updateMembershipPlan(plan.id, { squarePlanVariationId: result.squarePlanVariationId });
        results.push({ planId: plan.id, name: plan.name, squarePlanVariationId: result.squarePlanVariationId });
        console.log(`[SQUARE SETUP] Created plan variation for ${plan.name}: ${result.squarePlanVariationId}`);
      }
      res.json({ success: true, results });
    } catch (err) {
      console.error("[SQUARE SETUP] Error:", err?.message);
      res.status(500).json({ message: err?.message || "Setup failed" });
    }
  });
  app2.get("/api/staff/membership/subscriptions", staffAuth, async (_req, res) => {
    const subs = await storage.getMembershipSubscriptions();
    res.json(subs);
  });
  app2.post("/api/staff/membership/square-sync", staffAuth, async (req, res) => {
    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ message: "Email is required" });
    try {
      if (!isConfigured()) return res.status(503).json({ message: "Square is not configured" });
      const customer = await storage.getCustomerByEmail(email.trim().toLowerCase());
      if (!customer) return res.status(404).json({ message: "No app account found with that email. The customer needs to register in the app first." });
      const existing = await storage.getMembershipSubscriptionByCustomer(customer.id);
      if (existing) return res.json({ status: "already_linked", message: `${customer.name} already has a membership linked (${existing.status}).` });
      const sqCustomer = await findSquareCustomerByEmail(email.trim()).catch(() => null);
      if (!sqCustomer) return res.json({ status: "no_square_customer", message: `No Square customer found for ${email}. They may need to be added to Square first.` });
      const allPlans = await storage.getMembershipPlans();
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const sqSubs = await listSquareSubscriptionsForCustomer(sqCustomer.id).catch(() => []);
      const subPlans = allPlans.filter((p) => p.active && (p.squarePlanVariationId || p.squarePlanVariationIdAlt));
      const planMatchesVar = (p, vid) => p.squarePlanVariationId === vid || p.squarePlanVariationIdAlt === vid;
      const match = sqSubs.find(
        (s) => (s.status === "ACTIVE" || s.status === "PENDING") && subPlans.some((p) => planMatchesVar(p, s.plan_variation_id))
      );
      if (match) {
        const plan = subPlans.find((p) => planMatchesVar(p, match.plan_variation_id));
        const periodEnd = match.charged_through_date ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
        await storage.createMembershipSubscription({
          customerId: customer.id,
          planId: plan.id,
          status: "active",
          currentPeriodStart: match.start_date ?? today,
          currentPeriodEnd: periodEnd,
          hoursUsedThisPeriod: 0,
          guestPassesUsed: 0,
          squareSubscriptionId: match.id,
          squareCustomerId: sqCustomer.id,
          source: "square_sync",
          staffNotes: "Manually synced from Square via staff portal"
        });
        console.log(`[MEMBERSHIP] Manual Square sync: ${match.id} \u2192 customer #${customer.id} (${email}) on plan "${plan.name}"`);
        return res.json({ status: "linked", message: `\u2713 ${customer.name} linked to ${plan.name} plan (Square sub: ${match.id})` });
      }
      const groupPlans = allPlans.filter((p) => p.active && p.squareCustomerGroupId);
      if (groupPlans.length) {
        const customerGroupIds = await getCustomerGroupIds(sqCustomer.id).catch(() => []);
        const groupMatch = groupPlans.find((p) => customerGroupIds.includes(p.squareCustomerGroupId));
        if (groupMatch) {
          const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
          await storage.createMembershipSubscription({
            customerId: customer.id,
            planId: groupMatch.id,
            status: "active",
            currentPeriodStart: today,
            currentPeriodEnd: periodEnd,
            hoursUsedThisPeriod: 0,
            guestPassesUsed: 0,
            squareCustomerId: sqCustomer.id,
            source: "square_group_sync",
            staffNotes: `Manually synced from Square customer group "${groupMatch.name}" via staff portal`
          });
          console.log(`[MEMBERSHIP] Manual group sync: group "${groupMatch.name}" \u2192 customer #${customer.id} (${email})`);
          return res.json({ status: "linked", message: `\u2713 ${customer.name} linked to ${groupMatch.name} plan via Square customer group` });
        }
        const groupInfo = customerGroupIds.length ? `Their Square groups: ${customerGroupIds.join(", ")}` : "They are not in any Square customer groups.";
        return res.json({ status: "no_matching_plan", message: `${customer.name} found in Square but has no matching subscription or customer group. ${sqSubs.length ? `Subscriptions: ${sqSubs.map((s) => `${s.status} (plan: ${s.plan_variation_id || "unknown"})`).join(", ")}. ` : "No subscriptions found. "}${groupInfo}` });
      }
      if (!sqSubs.length) {
        return res.json({ status: "no_subscriptions", message: `${customer.name} found in Square but has no subscriptions and no customer groups are mapped to plans.` });
      }
      const subStatuses = sqSubs.map((s) => `${s.status} (plan: ${s.plan_variation_id || "unknown"})`).join(", ");
      return res.json({ status: "no_matching_plan", message: `${customer.name} has Square subscriptions but none match an active local plan. Square subs: ${subStatuses}` });
    } catch (err) {
      console.error("[MEMBERSHIP] Manual Square sync error:", err.message);
      return res.status(500).json({ message: "Sync failed: " + err.message });
    }
  });
  app2.post("/api/staff/membership/sync-all", staffAuth, managerAuth, async (req, res) => {
    if (!isConfigured()) return res.status(503).json({ message: "Square is not configured" });
    try {
      const allCustomers = await storage.getAllCustomers();
      const results = [];
      for (const c of allCustomers) {
        try {
          await syncSquareMembershipForCustomer(c.id, c.email);
          const sub = await storage.getMembershipSubscriptionByCustomer(c.id);
          results.push({ email: c.email, status: sub ? `linked: ${sub.status} (${sub.plan?.name ?? "unknown plan"})` : "no membership found" });
        } catch (e) {
          results.push({ email: c.email, status: `error: ${e.message}` });
        }
      }
      const linked = results.filter((r) => r.status.startsWith("linked")).length;
      console.log(`[MEMBERSHIP] Bulk sync complete: ${linked}/${allCustomers.length} customers linked`);
      res.json({ total: allCustomers.length, linked, results });
    } catch (err) {
      res.status(500).json({ message: "Bulk sync failed: " + err.message });
    }
  });
  app2.post("/api/staff/membership/subscriptions", staffAuth, async (req, res) => {
    const { customerId, planId, status = "active", staffNotes, source = "staff", startDate } = req.body ?? {};
    if (!customerId || !planId) return res.status(400).json({ message: "customerId and planId are required" });
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const periodStart = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : today;
    const periodStartDate = /* @__PURE__ */ new Date(periodStart + "T12:00:00Z");
    const periodEndDate = new Date(periodStartDate);
    periodEndDate.setMonth(periodEndDate.getMonth() + 1);
    const periodEnd = periodEndDate.toISOString().slice(0, 10);
    const effectiveStatus = startDate && startDate > today ? "pending_start" : status;
    const sub = await storage.createMembershipSubscription({
      customerId: parseInt(customerId),
      planId: parseInt(planId),
      status: effectiveStatus,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
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
            const locationId = process.env.SQUARE_LOC_ID || process.env.SQUARE_LOCATION_ID;
            const sqSub = await createSquareSubscription(sqCustomer.id, plan.squarePlanVariationId, locationId, void 0, periodStart).catch(() => null);
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
      const [plan, sub] = await Promise.all([
        storage.getMembershipPlan(parseInt(planId)),
        storage.getMembershipSubscription(parseInt(subscriptionId))
      ]);
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      const redirectUrl = `${process.env.REPLIT_INTERNAL_APP_DOMAIN ? `https://${process.env.REPLIT_INTERNAL_APP_DOMAIN}` : "https://the147bradford.replit.app"}/staff`;
      const link = await createMembershipCheckoutLink({
        planName: plan.name,
        amountPence: plan.priceMonthly,
        subscriptionId: parseInt(subscriptionId),
        redirectUrl
      });
      let emailSent = false;
      if (sub) {
        const customer = await storage.getCustomerById(sub.customerId).catch(() => null);
        if (customer?.email) {
          emailSent = await sendMembershipPaymentLinkEmail({
            customerName: customer.name,
            customerEmail: customer.email,
            planName: plan.name,
            priceMonthly: plan.priceMonthly,
            paymentUrl: link.url
          });
        }
      }
      res.json({ url: link.url, paymentLinkId: link.paymentLinkId, emailSent });
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
  app2.post("/api/admin/sar", staffAuth, managerAuth, async (req, res) => {
    const { email } = req.body ?? {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ message: "A valid email address is required." });
    }
    const normalised = email.trim().toLowerCase();
    const [customer, bookings2, pushTokens2, orders, allMessages] = await Promise.all([
      storage.getCustomerByEmail(normalised),
      storage.getBookingsByEmail(normalised),
      storage.getPushTokensByEmail(normalised),
      storage.getCustomerOrders(normalised),
      storage.getContactMessages()
    ]);
    const contactMessages2 = allMessages.filter((m) => m.email.toLowerCase() === normalised);
    const report = {
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      subjectEmail: normalised,
      customerAccount: customer ? {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone ?? null,
        createdAt: customer.createdAt,
        privacyConsentAt: customer.privacyConsentAt ?? null
      } : null,
      bookings: bookings2.map((b) => ({
        id: b.id,
        date: b.date,
        startTime: b.startTime,
        tableNumber: b.tableNumber,
        status: b.status,
        createdAt: b.createdAt
      })),
      contactMessages: contactMessages2.map((m) => ({
        id: m.id,
        subject: m.subject,
        message: m.message,
        createdAt: m.createdAt,
        status: m.status
      })),
      pushTokens: pushTokens2.map((t) => ({
        platform: t.platform,
        deviceName: t.deviceName,
        createdAt: t.createdAt
      })),
      orders: orders.map((o) => ({
        id: o.id,
        totalPence: o.totalPence,
        status: o.status,
        createdAt: o.createdAt
      }))
    };
    res.json(report);
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
  app2.get("/api/hr/geofence", staffAuth, async (_req, res) => {
    const lat = await storage.getSetting("geofence_lat");
    const lng = await storage.getSetting("geofence_lng");
    const radius = await storage.getSetting("geofence_radius");
    res.json({ lat: lat ?? null, lng: lng ?? null, radius: radius ? Number(radius) : 200 });
  });
  app2.put("/api/hr/geofence", staffAuth, managerAuth, async (req, res) => {
    const { lat, lng, radius } = req.body;
    if (!lat || !lng) return res.status(400).json({ message: "lat and lng are required" });
    await storage.setSetting("geofence_lat", String(lat));
    await storage.setSetting("geofence_lng", String(lng));
    await storage.setSetting("geofence_radius", String(radius ?? 200));
    res.json({ lat: String(lat), lng: String(lng), radius: Number(radius ?? 200) });
  });
  app2.get("/api/hr/clock-status", staffAuth, async (req, res) => {
    const active = await storage.getActiveClockEntry(req.staffUser.id);
    res.json({ active: active ?? null });
  });
  app2.post("/api/hr/clock-in", staffAuth, async (req, res) => {
    const existing = await storage.getActiveClockEntry(req.staffUser.id);
    if (existing) return res.status(409).json({ message: "Already clocked in" });
    const { lat, lng } = req.body;
    const entry = await storage.clockIn(req.staffUser.id, lat ? String(lat) : void 0, lng ? String(lng) : void 0);
    res.status(201).json(entry);
  });
  app2.post("/api/hr/clock-out", staffAuth, async (req, res) => {
    const active = await storage.getActiveClockEntry(req.staffUser.id);
    if (!active) return res.status(404).json({ message: "No active clock-in found" });
    const { lat, lng } = req.body;
    const entry = await storage.clockOut(active.id, lat ? String(lat) : void 0, lng ? String(lng) : void 0);
    res.json(entry);
  });
  app2.get("/api/hr/time-entries", staffAuth, async (req, res) => {
    const entries = await storage.getTimeEntriesForStaff(req.staffUser.id);
    res.json(entries);
  });
  app2.get("/api/hr/time-entries/all", staffAuth, managerAuth, async (_req, res) => {
    const entries = await storage.getAllTimeEntries();
    const users2 = await storage.getAllStaffUsers();
    const userMap = Object.fromEntries(users2.map((u) => [u.id, u.displayName || u.username]));
    const enriched = entries.map((e) => ({ ...e, staffName: userMap[e.staffId] || `Staff #${e.staffId}` }));
    res.json(enriched);
  });
  app2.patch("/api/hr/time-entries/:id/amend", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { reason, clockedInAt, clockedOutAt } = req.body;
    if (!reason) return res.status(400).json({ message: "Amendment reason required" });
    const updates = {};
    if (clockedInAt) updates.clockedInAt = new Date(clockedInAt);
    if (clockedOutAt) updates.clockedOutAt = new Date(clockedOutAt);
    const entry = await storage.amendTimeEntry(id, req.staffUser.id, reason, updates);
    if (!entry) return res.status(404).json({ message: "Entry not found" });
    res.json(entry);
  });
  app2.get("/api/hr/staff/:id/documents", staffAuth, managerAuth, async (req, res) => {
    const staffId = parseInt(req.params.id);
    const docs = await storage.getDocumentsForStaff(staffId);
    res.json(docs);
  });
  app2.get("/api/hr/documents/:id/download", staffAuth, managerAuth, async (req, res) => {
    const doc = await storage.getDocumentById(parseInt(req.params.id));
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.json(doc);
  });
  app2.post("/api/hr/staff/:id/documents", staffAuth, managerAuth, async (req, res) => {
    const staffId = parseInt(req.params.id);
    const { category, fileName, fileType, fileData, fileSizeBytes, notes, expiresAt } = req.body;
    if (!fileName || !fileType || !fileData || !fileSizeBytes) {
      return res.status(400).json({ message: "fileName, fileType, fileData and fileSizeBytes are required" });
    }
    if (fileSizeBytes > 10 * 1024 * 1024) {
      return res.status(400).json({ message: "File too large \u2014 maximum 10 MB" });
    }
    const doc = await storage.uploadDocument({
      staffId,
      uploadedBy: req.staffUser.id,
      category: category || "other",
      fileName,
      fileType,
      fileData,
      fileSizeBytes,
      notes: notes || void 0,
      expiresAt: expiresAt || void 0
    });
    res.status(201).json({ id: doc.id, fileName: doc.fileName, category: doc.category, createdAt: doc.createdAt });
  });
  app2.delete("/api/hr/documents/:id", staffAuth, managerAuth, async (req, res) => {
    const deleted = await storage.deleteDocument(parseInt(req.params.id));
    if (!deleted) return res.status(404).json({ message: "Document not found" });
    res.json({ success: true });
  });
  app2.get("/api/hr/documents", staffAuth, managerAuth, async (_req, res) => {
    const docs = await storage.getAllDocuments();
    res.json(docs);
  });
  app2.get("/api/hr/onboarding/mine", staffAuth, async (req, res) => {
    const record = await storage.getOnboarding(req.staffUser.id);
    res.json(record ?? null);
  });
  app2.put("/api/hr/onboarding/mine", staffAuth, async (req, res) => {
    const {
      emergencyName,
      emergencyPhone,
      emergencyRelation,
      nationalInsurance,
      starterDeclaration,
      taxCode,
      bankAccountName,
      bankSortCode,
      bankAccountNumber,
      rightToWorkType,
      rightToWorkExpiry,
      markComplete
    } = req.body;
    const data = {
      emergencyName,
      emergencyPhone,
      emergencyRelation,
      nationalInsurance,
      starterDeclaration,
      taxCode,
      bankAccountName,
      bankSortCode,
      bankAccountNumber,
      rightToWorkType,
      rightToWorkExpiry
    };
    if (markComplete) data.completedAt = /* @__PURE__ */ new Date();
    const record = await storage.upsertOnboarding(req.staffUser.id, data);
    res.json(record);
  });
  app2.get("/api/hr/staff/:id/onboarding", staffAuth, managerAuth, async (req, res) => {
    const record = await storage.getOnboarding(parseInt(req.params.id));
    res.json(record ?? null);
  });
  app2.get("/api/hr/onboarding/status", staffAuth, managerAuth, async (_req, res) => {
    const statuses = await storage.getAllOnboardingStatus();
    res.json(statuses);
  });
  app2.get("/api/hr/bank-holidays", staffAuth, (req, res) => {
    const year = parseInt(String(req.query.year || (/* @__PURE__ */ new Date()).getFullYear()));
    const holidays = getEnglandWalesBankHolidays(year);
    res.json({ year, holidays });
  });
  app2.post("/api/hr/leave-requests", staffAuth, async (req, res) => {
    const { leaveType, startDate, endDate, reason } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate are required" });
    const calculatedDays = countWorkingDays(startDate, endDate);
    if (calculatedDays <= 0) {
      return res.status(400).json({ message: "No working days found in the selected date range (weekends and bank holidays are excluded)" });
    }
    const leaveReq = await storage.createLeaveRequest({
      staffId: req.staffUser.id,
      leaveType: leaveType || "annual",
      startDate,
      endDate,
      totalDays: String(calculatedDays),
      reason
    });
    res.status(201).json(leaveReq);
  });
  app2.get("/api/hr/leave-preview", staffAuth, (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const days = countWorkingDays(startDate, endDate);
    res.json({ workingDays: days });
  });
  app2.get("/api/hr/leave-requests", staffAuth, async (req, res) => {
    const requests = await storage.getLeaveRequestsForStaff(req.staffUser.id);
    res.json(requests);
  });
  app2.get("/api/hr/leave-requests/all", staffAuth, managerAuth, async (_req, res) => {
    const requests = await storage.getAllLeaveRequests();
    const users2 = await storage.getAllStaffUsers();
    const userMap = Object.fromEntries(users2.map((u) => [u.id, u.displayName || u.username]));
    const enriched = requests.map((r) => ({ ...r, staffName: userMap[r.staffId] || `Staff #${r.staffId}` }));
    res.json(enriched);
  });
  app2.patch("/api/hr/leave-requests/:id/review", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { status, reviewNotes } = req.body;
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ message: "status must be approved or rejected" });
    const updated = await storage.reviewLeaveRequest(id, req.staffUser.id, status, reviewNotes);
    if (!updated) return res.status(404).json({ message: "Leave request not found" });
    res.json(updated);
  });
  app2.get("/api/hr/leave-allowance", staffAuth, async (req, res) => {
    const staffUser = req.staffUser;
    if (!staffUser?.id) return res.status(403).json({ message: "Leave allowance not available for system sessions" });
    const contractedDaysPerWeek = parseFloat(staffUser.contractedDaysPerWeek ?? "5");
    const employmentStartDate = staffUser.employmentStartDate ?? null;
    const today = /* @__PURE__ */ new Date();
    let allowance = await storage.getLeaveAllowance(staffUser.id, today.getFullYear());
    const leaveYearStart = allowance?.leaveYearStart ?? "01-01";
    const maxCarryOverDays = parseFloat(allowance?.maxCarryOverDays ?? "8");
    const { yearStart, yearEnd, leaveYear } = calculateLeaveYearBounds(leaveYearStart, today);
    const { fullEntitlement, actualEntitlement, isProRata, monthsAccrued } = calculateProRataEntitlement(
      contractedDaysPerWeek,
      employmentStartDate,
      leaveYearStart,
      today
    );
    if (!allowance) {
      allowance = await storage.upsertLeaveAllowance(
        staffUser.id,
        leaveYear,
        String(actualEntitlement),
        "0",
        leaveYearStart,
        "8"
      );
    }
    const rawCarryOver = parseFloat(allowance.carryOver ?? "0");
    const cappedCarryOver = applyCarryOverCap(rawCarryOver, maxCarryOverDays);
    const totalEntitlement = parseFloat(allowance.totalDays) + cappedCarryOver;
    const allRequests = await storage.getLeaveRequestsForStaff(staffUser.id);
    const yearRequests = allRequests.filter(
      (r) => r.startDate >= yearStart.toISOString().slice(0, 10) && r.startDate <= yearEnd.toISOString().slice(0, 10)
    );
    const annualLeaveUsed = yearRequests.filter((r) => r.status === "approved" && r.leaveType === "annual").reduce((sum, r) => sum + parseFloat(r.totalDays || "0"), 0);
    const sickDaysThisYear = yearRequests.filter((r) => r.status === "approved" && r.leaveType === "sick").reduce((sum, r) => sum + parseFloat(r.totalDays || "0"), 0);
    const unpaidDaysThisYear = yearRequests.filter((r) => r.status === "approved" && r.leaveType === "unpaid").reduce((sum, r) => sum + parseFloat(r.totalDays || "0"), 0);
    const pendingAnnualDays = yearRequests.filter((r) => r.status === "pending" && r.leaveType === "annual").reduce((sum, r) => sum + parseFloat(r.totalDays || "0"), 0);
    res.json({
      allowance,
      // Entitlement breakdown
      contractedDaysPerWeek,
      fullEntitlement,
      actualEntitlement: parseFloat(allowance.totalDays),
      // the stored (possibly manager-overridden) value
      isProRata,
      monthsAccrued,
      carryOver: cappedCarryOver,
      carryOverCapped: cappedCarryOver < rawCarryOver,
      totalEntitlement,
      // Usage — annual only counts against balance
      annualLeaveUsed,
      sickDaysThisYear,
      unpaidDaysThisYear,
      pendingAnnualDays,
      remaining: totalEntitlement - annualLeaveUsed,
      // Leave year info
      leaveYearStart: allowance.leaveYearStart,
      leaveYearLabel: `${yearStart.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} \u2013 ${yearEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
    });
  });
  app2.put("/api/hr/leave-allowance/:staffId", staffAuth, managerAuth, async (req, res) => {
    const staffId = parseInt(String(req.params.staffId));
    const { year, totalDays, carryOver, leaveYearStart, maxCarryOverDays } = req.body;
    const allowance = await storage.upsertLeaveAllowance(
      staffId,
      year || (/* @__PURE__ */ new Date()).getFullYear(),
      String(totalDays ?? "28"),
      String(carryOver ?? "0"),
      leaveYearStart,
      maxCarryOverDays !== void 0 ? String(maxCarryOverDays) : void 0
    );
    res.json(allowance);
  });
  app2.put("/api/hr/staff/:staffId/employment", staffAuth, managerAuth, async (req, res) => {
    const staffId = parseInt(String(req.params.staffId));
    const { contractedDaysPerWeek, employmentStartDate } = req.body;
    if (contractedDaysPerWeek === void 0) return res.status(400).json({ message: "contractedDaysPerWeek is required" });
    const days = parseFloat(String(contractedDaysPerWeek));
    if (isNaN(days) || days <= 0 || days > 7) return res.status(400).json({ message: "contractedDaysPerWeek must be between 0.5 and 7" });
    const updated = await storage.updateStaffEmployment(staffId, String(days), employmentStartDate || null);
    if (!updated) return res.status(404).json({ message: "Staff member not found" });
    res.json(updated);
  });
  app2.get("/api/hr/leave-allowances/all", staffAuth, managerAuth, async (req, res) => {
    const year = parseInt(String(req.query.year || (/* @__PURE__ */ new Date()).getFullYear()));
    const allowances = await storage.getAllLeaveAllowances(year);
    const users2 = await storage.getAllStaffUsers();
    const userMap = Object.fromEntries(users2.map((u) => [u.id, u.displayName || u.username]));
    const enriched = allowances.map((a) => ({ ...a, staffName: userMap[a.staffId] || `Staff #${a.staffId}` }));
    res.json(enriched);
  });
  app2.post("/api/hr/incidents", staffAuth, async (req, res) => {
    const { incidentDate, location, description, injuryType, personsInvolved, witnessNames, actionTaken } = req.body;
    if (!incidentDate || !location || !description) return res.status(400).json({ message: "incidentDate, location, description required" });
    const incident = await storage.createIncident({
      reportedBy: req.staffUser.id,
      incidentDate,
      location,
      description,
      injuryType: injuryType ?? null,
      personsInvolved: personsInvolved ?? null,
      witnessNames: witnessNames ?? null,
      actionTaken: actionTaken ?? null,
      reportedToManager: true,
      status: "open"
    });
    res.status(201).json(incident);
  });
  app2.get("/api/hr/incidents", staffAuth, async (req, res) => {
    const isManager = req.staffUser.role === "manager" || req.staffUser.role === "owner";
    if (isManager) {
      const incidents2 = await storage.getAllIncidents();
      const users2 = await storage.getAllStaffUsers();
      const userMap = Object.fromEntries(users2.map((u) => [u.id, u.displayName || u.username]));
      const enriched = incidents2.map((i) => ({ ...i, reportedByName: userMap[i.reportedBy] || `Staff #${i.reportedBy}` }));
      return res.json(enriched);
    }
    const incidents = await storage.getIncidentsForStaff(req.staffUser.id);
    res.json(incidents);
  });
  app2.patch("/api/hr/incidents/:id/status", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!["open", "under_review", "closed"].includes(status)) return res.status(400).json({ message: "Invalid status" });
    const incident = await storage.updateIncidentStatus(id, status, req.staffUser.id);
    if (!incident) return res.status(404).json({ message: "Incident not found" });
    res.json(incident);
  });
  app2.get("/api/hr/my-data", staffAuth, async (req, res) => {
    const staffId = req.staffUser.id;
    const [timeEntries, leaveRequests, incidents] = await Promise.all([
      storage.getTimeEntriesForStaff(staffId),
      storage.getLeaveRequestsForStaff(staffId),
      storage.getIncidentsForStaff(staffId)
    ]);
    res.json({
      gdprNotice: "This is all personal data The 147 Bradford holds for your staff account under GDPR Article 15 (Right of Access).",
      retentionPolicy: "Employment records are retained for 6 years after the end of employment as required by UK employment law.",
      staffProfile: { id: req.staffUser.id, username: req.staffUser.username, displayName: req.staffUser.displayName, role: req.staffUser.role },
      timeEntries,
      leaveRequests,
      incidents
    });
  });
  app2.get("/api/hr/rota", staffAuth, managerAuth, async (req, res) => {
    const weekStart = String(req.query.weekStart || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return res.status(400).json({ message: "weekStart (YYYY-MM-DD) required" });
    }
    const [shifts, staffUsers2, published] = await Promise.all([
      storage.getRotaShifts(weekStart),
      storage.getAllStaffUsers(),
      storage.getRotaPublished(weekStart)
    ]);
    const allLeave = await storage.getAllLeaveRequests();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const weekLeave = allLeave.filter(
      (l) => l.status === "approved" && l.startDate <= weekEndStr && l.endDate >= weekStart
    );
    const userMap = Object.fromEntries(staffUsers2.map((u) => [u.id, { displayName: u.displayName || u.username, username: u.username, role: u.role, active: u.active }]));
    res.json({ shifts, staffUsers: staffUsers2.filter((u) => u.active), userMap, weekLeave, published: published || null });
  });
  app2.get("/api/hr/rota/my", staffAuth, async (req, res) => {
    const weekStart = String(req.query.weekStart || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !req.staffUser?.id) {
      return res.status(400).json({ message: "weekStart required and staff must be logged in" });
    }
    const shifts = await storage.getRotaShiftsForStaff(req.staffUser.id, weekStart);
    const published = await storage.getRotaPublished(weekStart);
    res.json({ shifts, published: published || null });
  });
  app2.post("/api/hr/rota/shifts", staffAuth, managerAuth, async (req, res) => {
    const { staffId, weekStart, dayOfWeek, shiftStart, shiftEnd, role, notes, id } = req.body;
    if (!staffId || !weekStart || dayOfWeek === void 0 || !shiftStart || !shiftEnd) {
      return res.status(400).json({ message: "staffId, weekStart, dayOfWeek, shiftStart, shiftEnd required" });
    }
    const shift = await storage.upsertRotaShift(
      { staffId: Number(staffId), weekStart, dayOfWeek: Number(dayOfWeek), shiftStart, shiftEnd, role: role || null, notes: notes || null },
      id ? Number(id) : void 0
    );
    res.status(id ? 200 : 201).json(shift);
  });
  app2.delete("/api/hr/rota/shifts/:id", staffAuth, managerAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const deleted = await storage.deleteRotaShift(id);
    if (!deleted) return res.status(404).json({ message: "Shift not found" });
    res.status(204).send();
  });
  app2.post("/api/hr/rota/publish", staffAuth, managerAuth, async (req, res) => {
    const { weekStart } = req.body;
    if (!weekStart) return res.status(400).json({ message: "weekStart required" });
    const publishedBy = req.staffUser?.username || null;
    const published = await storage.publishRota(weekStart, publishedBy);
    const shifts = await storage.getRotaShifts(weekStart);
    const shiftsByStaff = /* @__PURE__ */ new Map();
    for (const s of shifts) {
      const list = shiftsByStaff.get(s.staffId) || [];
      list.push(s);
      shiftsByStaff.set(s.staffId, list);
    }
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    function summariseShifts(staffShifts) {
      const sorted = [...staffShifts].sort(
        (a, b) => a.dayOfWeek - b.dayOfWeek || a.shiftStart.localeCompare(b.shiftStart)
      );
      const parts = sorted.map((s) => `${dayNames[s.dayOfWeek] ?? "?"} ${s.shiftStart}\u2013${s.shiftEnd}`);
      let summary = parts.join(", ");
      if (summary.length > 140) summary = summary.slice(0, 137) + "\u2026";
      return summary;
    }
    const staffIds = [...shiftsByStaff.keys()];
    const tokens = await storage.getStaffPushTokens(staffIds);
    let notified = 0;
    if (tokens.length > 0) {
      const messages = tokens.map((t) => {
        const personShifts = shiftsByStaff.get(t.staffId) || [];
        const summary = summariseShifts(personShifts);
        const count = personShifts.length;
        const body = count === 1 ? `You're working ${summary}. Tap to view.` : `Your ${count} shifts: ${summary}`;
        return {
          to: t.token,
          sound: "default",
          title: "Your Rota Has Been Published",
          body
        };
      });
      try {
        const r = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(messages)
        });
        const data = await r.json();
        notified = data.data?.filter((d) => d.status === "ok").length ?? 0;
      } catch {
      }
    }
    res.json({ ...published, staffNotified: notified, tokenCount: tokens.length });
  });
  app2.post("/api/hr/staff-push-token", staffAuth, async (req, res) => {
    const { token } = req.body;
    if (!token || typeof token !== "string") return res.status(400).json({ message: "token required" });
    if (!req.staffUser?.id) return res.status(403).json({ message: "Must be logged in as a named staff user" });
    const record = await storage.upsertStaffPushToken(req.staffUser.id, token);
    res.json(record);
  });
  app2.get("/api/hr/staff/:id/pay", staffAuth, managerAuth, async (req, res) => {
    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) return res.status(400).json({ message: "Invalid staff ID" });
    const pay = await storage.getStaffPay(staffId);
    if (!pay) return res.status(404).json({ message: "Staff member not found" });
    res.json(pay);
  });
  app2.put("/api/hr/staff/:id/pay", staffAuth, managerAuth, async (req, res) => {
    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) return res.status(400).json({ message: "Invalid staff ID" });
    const { payType, hourlyRate, annualSalary, weeklyHours } = req.body;
    if (!payType || !["hourly", "salary"].includes(payType)) return res.status(400).json({ message: "payType must be 'hourly' or 'salary'" });
    await storage.updateStaffPay(staffId, { payType, hourlyRate: hourlyRate || null, annualSalary: annualSalary || null, weeklyHours: weeklyHours || "37.5" });
    res.json({ success: true });
  });
  const SSP_WEEKLY_RATE = 118.75;
  const SSP_LEL_WEEKLY = 123;
  const SSP_MIN_PIW_DAYS = 4;
  const SSP_WAITING_CAL_DAYS = 3;
  const SSP_LINK_GAP_DAYS = 56;
  const SSP_MAX_WEEKS = 28;
  function calDaysInPeriod(start, end) {
    return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 864e5) + 1;
  }
  function daysBetween(endDate, startDate) {
    return Math.round((new Date(startDate).getTime() - new Date(endDate).getTime()) / 864e5);
  }
  app2.get("/api/hr/staff/:id/ssp", staffAuth, managerAuth, async (req, res) => {
    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) return res.status(400).json({ message: "Invalid staff ID" });
    const [pay, staffUser, allLeave] = await Promise.all([
      storage.getStaffPay(staffId),
      storage.getStaffUserById(staffId),
      storage.getLeaveRequestsForStaff(staffId)
    ]);
    if (!staffUser) return res.status(404).json({ message: "Staff member not found" });
    const contractedDaysPerWeek = parseFloat(staffUser.contractedDaysPerWeek ?? "5");
    const weeklyHours = parseFloat(pay?.weeklyHours ?? "37.5");
    const hourlyRate = pay?.hourlyRate ? parseFloat(pay.hourlyRate) : null;
    const annualSalary = pay?.annualSalary ? parseFloat(pay.annualSalary) : null;
    const payType = pay?.payType ?? "hourly";
    const weeklyEarnings = payType === "salary" && annualSalary ? annualSalary / 52 : payType === "hourly" && hourlyRate ? hourlyRate * weeklyHours : 0;
    const qualifiesForSSP = weeklyEarnings >= SSP_LEL_WEEKLY;
    const dailySSP = SSP_WEEKLY_RATE / contractedDaysPerWeek;
    const sickPeriods = allLeave.filter((r) => r.leaveType === "sick" && r.status === "approved").sort((a, b) => a.startDate.localeCompare(b.startDate));
    const results = [];
    let totalPayableDays = 0;
    let prevEnd = null;
    let prevId = null;
    for (const period of sickPeriods) {
      const calDays = calDaysInPeriod(period.startDate, period.endDate);
      const workingDays = parseFloat(period.totalDays || "0");
      const isPIW = calDays >= SSP_MIN_PIW_DAYS;
      let isLinked = false;
      let linkedToId = null;
      if (prevEnd && isPIW) {
        const gap = daysBetween(prevEnd, period.startDate) - 1;
        if (gap >= 0 && gap <= SSP_LINK_GAP_DAYS) {
          isLinked = true;
          linkedToId = prevId;
        }
      }
      if (!isPIW) {
        results.push({ id: period.id, startDate: period.startDate, endDate: period.endDate, calendarDays: calDays, workingDays, isPIW: false, isLinked: false, waitingWorkingDays: 0, payableDays: 0, dailySSP, sspAmount: 0, notes: `${calDays} calendar days \u2014 minimum 4 required for SSP` });
        continue;
      }
      const waitingWorkingDays = isLinked ? 0 : Math.min(workingDays, Math.round(SSP_WAITING_CAL_DAYS / calDays * workingDays));
      const rawPayable = Math.max(0, workingDays - waitingWorkingDays);
      const maxPayable = SSP_MAX_WEEKS * contractedDaysPerWeek - totalPayableDays;
      const payableDays = Math.min(rawPayable, Math.max(0, maxPayable));
      const sspAmount = qualifiesForSSP ? parseFloat((payableDays * dailySSP).toFixed(2)) : 0;
      totalPayableDays += payableDays;
      prevEnd = period.endDate;
      prevId = period.id;
      results.push({
        id: period.id,
        startDate: period.startDate,
        endDate: period.endDate,
        calendarDays: calDays,
        workingDays,
        isPIW: true,
        isLinked,
        linkedToId,
        waitingWorkingDays,
        payableDays: parseFloat(payableDays.toFixed(2)),
        dailySSP: parseFloat(dailySSP.toFixed(4)),
        sspAmount,
        notes: !qualifiesForSSP ? "Earnings below Lower Earnings Limit \u2014 does not qualify for SSP" : payableDays < rawPayable ? "28-week SSP limit reached" : isLinked ? "Linked PIW \u2014 waiting days not re-applied" : waitingWorkingDays > 0 ? `${SSP_WAITING_CAL_DAYS} waiting days applied` : ""
      });
    }
    res.json({
      staffId,
      payType,
      weeklyEarnings: parseFloat(weeklyEarnings.toFixed(2)),
      lel: SSP_LEL_WEEKLY,
      qualifiesForSSP,
      dailySSP: parseFloat(dailySSP.toFixed(4)),
      sspWeeklyRate: SSP_WEEKLY_RATE,
      totalPayableDays: parseFloat(totalPayableDays.toFixed(2)),
      totalSSPWeeks: parseFloat((totalPayableDays / contractedDaysPerWeek).toFixed(2)),
      totalSSP: parseFloat(results.reduce((s, r) => s + r.sspAmount, 0).toFixed(2)),
      limitReached: totalPayableDays >= SSP_MAX_WEEKS * contractedDaysPerWeek,
      maxWeeks: SSP_MAX_WEEKS,
      periods: results,
      disclaimer: "Figures are estimates based on contracted days. Verify with your payroll provider before processing payments.",
      rateYear: "2025/26"
    });
  });
  app2.get("/api/hr/staff/:id/holiday-pay", staffAuth, managerAuth, async (req, res) => {
    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) return res.status(400).json({ message: "Invalid staff ID" });
    const [pay, staffUser, allLeave] = await Promise.all([
      storage.getStaffPay(staffId),
      storage.getStaffUserById(staffId),
      storage.getLeaveRequestsForStaff(staffId)
    ]);
    if (!staffUser) return res.status(404).json({ message: "Staff member not found" });
    const contractedDaysPerWeek = parseFloat(staffUser.contractedDaysPerWeek ?? "5");
    const weeklyHours = parseFloat(pay?.weeklyHours ?? "37.5");
    const hourlyRate = pay?.hourlyRate ? parseFloat(pay.hourlyRate) : null;
    const annualSalary = pay?.annualSalary ? parseFloat(pay.annualSalary) : null;
    const payType = pay?.payType ?? "hourly";
    const dailyRate = payType === "salary" && annualSalary ? annualSalary / 52 / contractedDaysPerWeek : payType === "hourly" && hourlyRate ? hourlyRate * (weeklyHours / contractedDaysPerWeek) : 0;
    const annualLeave = allLeave.filter((r) => r.leaveType === "annual").sort((a, b) => b.startDate.localeCompare(a.startDate));
    const results = annualLeave.map((req2) => {
      const days = parseFloat(req2.totalDays || "0");
      return {
        id: req2.id,
        startDate: req2.startDate,
        endDate: req2.endDate,
        days,
        status: req2.status,
        dailyRate: parseFloat(dailyRate.toFixed(4)),
        holidayPay: parseFloat((days * dailyRate).toFixed(2))
      };
    });
    const totalApproved = results.filter((r) => r.status === "approved").reduce((s, r) => s + r.holidayPay, 0);
    const totalPending = results.filter((r) => r.status === "pending").reduce((s, r) => s + r.holidayPay, 0);
    res.json({
      staffId,
      payType,
      hourlyRate,
      annualSalary,
      weeklyHours,
      contractedDaysPerWeek,
      dailyRate: parseFloat(dailyRate.toFixed(4)),
      hasPay: dailyRate > 0,
      results,
      totalApprovedHolidayPay: parseFloat(totalApproved.toFixed(2)),
      totalPendingHolidayPay: parseFloat(totalPending.toFixed(2)),
      note: payType === "salary" ? "Salaried staff receive normal pay during leave \u2014 this shows the equivalent daily cost." : "Holiday pay is calculated at your contracted daily rate. Under UK law variable-hours workers may be entitled to a 52-week average rate \u2014 verify with your payroll provider.",
      disclaimer: "Figures are estimates. Verify with your payroll provider before processing payments."
    });
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
init_storage();
import * as fs2 from "fs";
import * as path2 from "path";
import nodemailer2 from "nodemailer";
import * as http from "http";
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
    const devConnectSrc = isProd ? null : "*";
    if (req.path === "/staff" || req.path.startsWith("/staff-portal") || req.path.startsWith("/admin-") || req.path.startsWith("/staff-")) {
      res.setHeader("X-Frame-Options", "DENY");
      const connectSrc = devConnectSrc ?? "'self' https://api.stripe.com https://m.stripe.com https://m.stripe.network https://pci-connect.squareup.com https://pci-connect.squareupsandbox.com https://connect.squareup.com https://connect.squareupsandbox.com https://o160250.ingest.sentry.io";
      res.setHeader(
        "Content-Security-Policy",
        `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://m.stripe.network https://web.squarecdn.com https://sandbox.web.squarecdn.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://web.squarecdn.com https://sandbox.web.squarecdn.com; font-src 'self' data: https://fonts.gstatic.com https://square-fonts-production-f.squarecdn.com https://d1g145x70srn7h.cloudfront.net; connect-src ${connectSrc}; img-src 'self' data: blob: https:; frame-src https://js.stripe.com https://hooks.stripe.com https://*.ticketsource.co.uk https://*.ticketsource.com https://web.squarecdn.com https://sandbox.web.squarecdn.com; frame-ancestors 'none'`
      );
    } else if (req.path === "/widget/booking") {
      res.removeHeader("X-Frame-Options");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors *"
      );
    } else if (!req.path.startsWith("/api")) {
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      const genericConnectSrc = devConnectSrc ?? "'self' https://*.squareup.com https://*.resend.com https://api.stripe.com https://m.stripe.com https://m.stripe.network";
      res.setHeader(
        "Content-Security-Policy",
        `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://js.stripe.com https://m.stripe.network; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; connect-src ${genericConnectSrc}; img-src 'self' data: https:; frame-src 'self' https://www.the147order.co.uk https://the147order.co.uk https://js.stripe.com https://hooks.stripe.com https://web.squarecdn.com https://sandbox.web.squarecdn.com`
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
function serveExpoManifest(platform, res, req) {
  const manifestPath = path2.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs2.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  let manifestStr = fs2.readFileSync(manifestPath, "utf-8");
  try {
    const manifest = JSON.parse(manifestStr);
    const builtUrl = manifest?.launchAsset?.url;
    if (builtUrl) {
      const builtOrigin = new URL(builtUrl).origin;
      const forwardedProto = req.header("x-forwarded-proto");
      const protocol = forwardedProto || req.protocol || "https";
      const forwardedHost = req.header("x-forwarded-host");
      const host = forwardedHost || req.get("host") || "";
      const currentOrigin = `${protocol}://${host}`;
      if (builtOrigin !== currentOrigin) {
        manifestStr = manifestStr.split(builtOrigin).join(currentOrigin);
      }
    }
  } catch {
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  res.send(manifestStr);
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
      if (process.env.NODE_ENV !== "production") {
        const proxyReq = http.request(
          {
            hostname: "localhost",
            port: 8081,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: "localhost:8081" }
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
            proxyRes.pipe(res, { end: true });
          }
        );
        proxyReq.on("error", () => {
          return serveExpoManifest(platform, res, req);
        });
        req.pipe(proxyReq, { end: true });
        return;
      }
      return serveExpoManifest(platform, res, req);
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
  if (process.env.NODE_ENV !== "production") {
    app2.use((req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      const isMetro = req.path.startsWith("/_expo") || req.path.startsWith("/hot") || req.path.startsWith("/symbolicate") || req.path.startsWith("/logs") || req.path.startsWith("/inspector") || /^\/\d+-\d+\//.test(req.path);
      if (!isMetro) return next();
      const proxyReq = http.request(
        {
          hostname: "localhost",
          port: 8081,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: "localhost:8081" }
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        }
      );
      proxyReq.on("error", () => {
        if (!res.headersSent) res.status(502).send("Metro bundler not ready");
      });
      req.pipe(proxyReq, { end: true });
    });
  }
  app2.use("/assets", express.static(path2.resolve(process.cwd(), "assets")));
  app2.use("/uploads", express.static(path2.resolve(process.cwd(), "uploads")));
  app2.use(express.static(path2.resolve(process.cwd(), "static-build")));
  app2.get("/preview-home", (_req, res) => {
    try {
      const p = path2.resolve(process.cwd(), "server", "templates", "home-mockup.html");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(fs2.readFileSync(p, "utf-8"));
    } catch {
      res.status(500).send("Mockup unavailable");
    }
  });
  const TEST_SITE_PAGES = {
    "": "home.html",
    "snooker": "snooker.html",
    "dining": "dining.html",
    "events": "events.html",
    "function-rooms": "function-rooms.html",
    "gift-cards": "gift-cards.html",
    "contact": "contact.html",
    // Full native pages for interactive systems (replace modal popups)
    "membership": "membership.html",
    "order": "order.html",
    "book": "book.html",
    // Legacy minimal-chrome versions (kept for backwards compat)
    "join": "membership-join.html",
    "menu": "order-menu.html"
  };
  app2.get("/test-site/styles.css", (_req, res) => {
    try {
      const p = path2.resolve(process.cwd(), "server", "templates", "test-site", "styles.css");
      res.setHeader("Content-Type", "text/css; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.send(fs2.readFileSync(p, "utf-8"));
    } catch {
      res.status(404).end();
    }
  });
  app2.get("/test-site/embed.js", (_req, res) => {
    try {
      const p = path2.resolve(process.cwd(), "server", "templates", "test-site", "embed.js");
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.send(fs2.readFileSync(p, "utf-8"));
    } catch {
      res.status(404).end();
    }
  });
  app2.get(["/test-site", "/test-site/:page"], async (req, res) => {
    const slug = (req.params.page ?? "").toLowerCase();
    const file = TEST_SITE_PAGES[slug];
    if (!file) return res.status(404).send("Page not found");
    try {
      const { applyWebContentOverrides: applyWebContentOverrides2 } = await Promise.resolve().then(() => (init_web_content(), web_content_exports));
      const p = path2.resolve(process.cwd(), "server", "templates", "test-site", file);
      const raw = fs2.readFileSync(p, "utf-8");
      const overrideSlug = slug || "home";
      const finalHtml = await applyWebContentOverrides2(overrideSlug, raw);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(finalHtml);
    } catch {
      res.status(500).send("Page unavailable");
    }
  });
  app2.get("/migrate/:token", async (req, res) => {
    try {
      const { storage: storage2 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
      const { renderMigrationLandingPage: renderMigrationLandingPage2, renderMigrationErrorPage: renderMigrationErrorPage2 } = await Promise.resolve().then(() => (init_wix_migration(), wix_migration_exports));
      const subs = await storage2.getMembershipSubscriptions();
      const sub = subs.find((s) => s.migrationToken === req.params.token);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (!sub || !sub.customer || !sub.plan) {
        return res.status(404).send(renderMigrationErrorPage2("This link is no longer valid."));
      }
      res.send(renderMigrationLandingPage2({
        customer: sub.customer,
        plan: sub.plan,
        sub,
        alreadyDone: !!sub.migrationCompletedAt,
        token: req.params.token
      }));
    } catch {
      res.status(500).send("Page unavailable");
    }
  });
  if (process.env.NODE_ENV !== "production") {
    app2.use((req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      const platform = req.header("expo-platform");
      if (platform === "ios" || platform === "android") return next();
      if (req.path === "/verify-email") return next();
      const proxyReq = http.request(
        {
          hostname: "localhost",
          port: 8081,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: "localhost:8081" }
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        }
      );
      proxyReq.on("error", () => {
        if (!res.headersSent) res.status(502).send("Metro bundler not ready");
      });
      req.pipe(proxyReq, { end: true });
    });
  } else {
    const indexPath = path2.resolve(process.cwd(), "static-build", "index.html");
    app2.use((req, res, next) => {
      if (res.headersSent) return next();
      if (req.path.startsWith("/api")) return next();
      const platform = req.header("expo-platform");
      if (platform === "ios" || platform === "android") return next();
      const serverPages = /* @__PURE__ */ new Set([
        "/staff",
        "/membership",
        "/delete-account",
        "/privacy-policy",
        "/terms",
        "/staff-privacy-notice",
        "/booking-widget",
        "/verify-email"
      ]);
      if (serverPages.has(req.path)) return next();
      if (fs2.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
  }
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
function scheduleOrderExpiry() {
  async function runExpiry() {
    try {
      const { storage: store } = await Promise.resolve().then(() => (init_storage(), storage_exports));
      const expired = await store.expireStaleOrders(30);
      if (expired > 0) {
        log(`[Orders] Expired ${expired} abandoned pending order(s) (no payment after 30 min)`);
      }
    } catch (e) {
      log(`[Orders] Expiry job error: ${e.message}`);
    }
  }
  runExpiry();
  setInterval(runExpiry, 15 * 60 * 1e3);
}
function scheduleMembershipPaymentReminders() {
  const REMIND_AFTER_HOURS = 24;
  const CANCEL_AFTER_HOURS = 72;
  const SITE_URL = "https://the147bradford.replit.app";
  function buildTransport() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS?.replace(/\s+/g, "");
    const smtpPort = parseInt(process.env.SMTP_PORT || "587");
    if (!smtpHost || !smtpUser || !smtpPass) return null;
    return {
      transporter: nodemailer2.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { rejectUnauthorized: false }
      }),
      from: `"The 147" <${smtpUser}>`
    };
  }
  async function runReminders() {
    try {
      const { storage: store } = await Promise.resolve().then(() => (init_storage(), storage_exports));
      const due = await store.getPendingMembershipsNeedingReminder(REMIND_AFTER_HOURS);
      if (!due.length) return;
      const mail = buildTransport();
      for (const sub of due) {
        const customer = sub.customer;
        const plan = sub.plan;
        if (!customer?.email) {
          await store.markMembershipReminderSent(sub.id);
          continue;
        }
        if (mail) {
          try {
            await mail.transporter.sendMail({
              from: mail.from,
              to: customer.email,
              subject: `Finish setting up your ${plan?.name ?? "membership"} at The 147`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
                  <div style="background:#111827;padding:24px 32px;border-radius:8px 8px 0 0">
                    <h1 style="color:#fff;margin:0;font-size:22px">The 147 Bradford</h1>
                  </div>
                  <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
                    <h2 style="margin:0 0 16px">Your membership signup is incomplete</h2>
                    <p style="margin:0 0 12px">Hi ${customer.name},</p>
                    <p style="margin:0 0 12px">We noticed you started signing up for the <strong>${plan?.name ?? "membership"}</strong> plan at The 147 Bradford but didn't finish your payment.</p>
                    <p style="margin:0 0 24px">Tap the button below to complete your signup and start enjoying member benefits:</p>
                    <p style="margin:0 0 24px;text-align:center">
                      <a href="${SITE_URL}/membership" style="display:inline-block;background:#0047AB;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none">Complete My Membership</a>
                    </p>
                    <p style="margin:0 0 12px;color:#6b7280;font-size:13px">If you no longer wish to join, you can ignore this email \u2014 your incomplete signup will be cancelled automatically in a couple of days.</p>
                    <p style="margin:24px 0 0;color:#6b7280;font-size:13px">The 147 Bradford &bull; Snooker &amp; Dining</p>
                  </div>
                </div>`
            });
            log(`[MembershipReminder] Sent payment reminder to ${customer.email} for sub #${sub.id}`);
          } catch (emailErr) {
            console.error(`[MembershipReminder] Email failed for sub #${sub.id}:`, emailErr);
            continue;
          }
        }
        await store.markMembershipReminderSent(sub.id);
      }
    } catch (err) {
      console.error("[MembershipReminder] Scheduler error:", err);
    }
  }
  async function runAutoCancel() {
    try {
      const { storage: store } = await Promise.resolve().then(() => (init_storage(), storage_exports));
      const stale = await store.getPendingMembershipsToAutoCancel(CANCEL_AFTER_HOURS);
      if (!stale.length) return;
      const mail = buildTransport();
      for (const sub of stale) {
        try {
          await store.updateMembershipSubscription(sub.id, {
            status: "cancelled",
            cancelledAt: /* @__PURE__ */ new Date(),
            staffNotes: (sub.staffNotes ? sub.staffNotes + "\n" : "") + `Auto-cancelled \u2014 payment not completed within ${CANCEL_AFTER_HOURS}h of signup.`
          });
          log(`[MembershipAutoCancel] Cancelled sub #${sub.id} \u2014 payment not completed in ${CANCEL_AFTER_HOURS}h`);
          const customer = sub.customer;
          const plan = sub.plan;
          if (mail && customer?.email) {
            try {
              await mail.transporter.sendMail({
                from: mail.from,
                to: customer.email,
                subject: `Your membership signup at The 147 has been cancelled`,
                html: `
                  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
                    <div style="background:#111827;padding:24px 32px;border-radius:8px 8px 0 0">
                      <h1 style="color:#fff;margin:0;font-size:22px">The 147 Bradford</h1>
                    </div>
                    <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
                      <h2 style="margin:0 0 16px;color:#DC2626">Signup Cancelled</h2>
                      <p style="margin:0 0 12px">Hi ${customer.name},</p>
                      <p style="margin:0 0 12px">Your incomplete signup for the <strong>${plan?.name ?? "membership"}</strong> plan has been cancelled because no payment was received.</p>
                      <p style="margin:0 0 24px">No charge has been made. If you'd still like to join, you're welcome to sign up again at any time:</p>
                      <p style="margin:0 0 24px;text-align:center">
                        <a href="${SITE_URL}/membership" style="display:inline-block;background:#0047AB;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none">View Membership Plans</a>
                      </p>
                      <p style="margin:24px 0 0;color:#6b7280;font-size:13px">The 147 Bradford &bull; Snooker &amp; Dining</p>
                    </div>
                  </div>`
              });
            } catch (emailErr) {
              console.error(`[MembershipAutoCancel] Cancellation email failed for sub #${sub.id}:`, emailErr);
            }
          }
        } catch (err) {
          console.error(`[MembershipAutoCancel] Failed for sub #${sub.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[MembershipAutoCancel] Scheduler error:", err);
    }
  }
  setTimeout(() => {
    runReminders();
    runAutoCancel();
  }, 60 * 1e3);
  setInterval(runReminders, 30 * 60 * 1e3);
  setInterval(runAutoCancel, 60 * 60 * 1e3);
}
function scheduleRetentionCleanup() {
  async function runCleanup() {
    try {
      const { storage: store } = await Promise.resolve().then(() => (init_storage(), storage_exports));
      const anonymized = await store.anonymizeOldBookings(365);
      const hrAnonymized = await store.anonymizeOldHRRecords();
      const sessionsCleared = await store.cleanupExpiredSessions();
      if (anonymized > 0 || hrAnonymized > 0 || sessionsCleared > 0) {
        log(`[GDPR Retention] Booking records: ${anonymized}, HR records: ${hrAnonymized}, sessions cleared: ${sessionsCleared}`);
      }
    } catch (err) {
      console.error("[GDPR Retention] Cleanup error:", err);
    }
  }
  setTimeout(runCleanup, 3e4);
  setInterval(runCleanup, 24 * 60 * 60 * 1e3);
}
(async () => {
  const ascKeyContent = process.env.ASC_KEY_P8 || "";
  if (ascKeyContent) {
    try {
      const keyId = process.env.EXPO_ASC_KEY_ID || "PRH75PPG5Z";
      const keyPath = process.env.EXPO_ASC_API_KEY_PATH || `/tmp/AuthKey_${keyId}.p8`;
      const base64 = ascKeyContent.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
      const lines = base64.match(/.{1,64}/g) || [];
      const pem = "-----BEGIN PRIVATE KEY-----\n" + lines.join("\n") + "\n-----END PRIVATE KEY-----\n";
      fs2.mkdirSync(path2.dirname(keyPath), { recursive: true });
      fs2.writeFileSync(keyPath, pem, { mode: 384 });
      log(`\u2713 ASC .p8 key written to ${keyPath}`);
    } catch (e) {
      console.warn("\u26A0 Could not write ASC .p8 key:", e);
    }
  }
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
  const termsHtmlPath = path2.resolve(process.cwd(), "server", "templates", "terms-of-service.html");
  const termsHtml = fs2.readFileSync(termsHtmlPath, "utf-8");
  app.get("/terms", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(termsHtml);
  });
  const staffPrivacyHtmlPath = path2.resolve(process.cwd(), "server", "templates", "staff-privacy-notice.html");
  const staffPrivacyHtml = fs2.readFileSync(staffPrivacyHtmlPath, "utf-8");
  app.get("/staff-privacy-notice", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(staffPrivacyHtml);
  });
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  await new Promise((resolve3) => {
    server.listen(port, "0.0.0.0", () => {
      log(`express server serving on port ${port}`);
      resolve3();
    });
  });
  if (process.env.NODE_ENV !== "production" && port !== 8082) {
    const previewServer = http.createServer(app);
    previewServer.listen(8082, "0.0.0.0", () => {
      log("express also serving on port 8082 (Replit preview)");
    });
  }
  await runStartupMigrations();
  const { storage: storeForMigration } = await Promise.resolve().then(() => (init_storage(), storage_exports));
  await storeForMigration.migrateEncryptExistingPII();
  await bootstrapOwner();
  scheduleRetentionCleanup();
  scheduleBookingReminders();
  scheduleDepositAutoCancel();
  scheduleOrderExpiry();
  scheduleMembershipPaymentReminders();
})().catch((err) => {
  console.error("FATAL SERVER ERROR:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});
