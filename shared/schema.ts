import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, boolean, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
// drizzle-zod >=0.8 emits Zod v4 schemas, so any `z.xxx()` we splice into
// those schemas via `.extend(...)` MUST also come from `zod/v4`. Importing the
// classic `zod` (v3) entrypoint here causes drizzle-zod's parser to throw
// `Invalid element at key "<field>": expected a Zod schema` at request time,
// which surfaces to customers as the generic "Booking Error / unexpected
// error" alert. Keep this import on `zod/v4`.
import { z } from "zod/v4";

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
  pinHash: text("pin_hash"),
  pinSalt: text("pin_salt"),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
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

// Bar tabs — staff open a tab against a table or booking, add items as the
// session progresses, then close (cash/card/charged-to-booking) at the end.
export const tabs = pgTable("tabs", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id"),                  // optional link to a booking
  tableType: text("table_type").notNull(),           // snooker | pool | dining | bar
  tableNumber: text("table_number"),                 // e.g. "Table 4" or null for bar
  customerName: text("customer_name"),               // free-text for walk-ups
  customerEmail: text("customer_email"),
  status: text("status").notNull().default("open"),  // open | closed | voided
  openedByStaffId: integer("opened_by_staff_id"),
  openedByName: text("opened_by_name"),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
  closedByName: text("closed_by_name"),
  closeMethod: text("close_method"),                 // cash | card | comp | added-to-booking
  totalPence: integer("total_pence").notNull().default(0),
  notes: text("notes"),
});
export type Tab = typeof tabs.$inferSelect;
export type InsertTab = typeof tabs.$inferInsert;

export const tabItems = pgTable("tab_items", {
  id: serial("id").primaryKey(),
  tabId: integer("tab_id").notNull(),
  name: text("name").notNull(),
  unitPricePence: integer("unit_price_pence").notNull(),
  quantity: integer("quantity").notNull().default(1),
  addedByName: text("added_by_name"),
  addedAt: timestamp("added_at").defaultNow().notNull(),
  voided: boolean("voided").notNull().default(false),
  voidReason: text("void_reason"),
});
export type TabItem = typeof tabItems.$inferSelect;
export type InsertTabItem = typeof tabItems.$inferInsert;

// Square POS sessions — mirrored from Square Orders so we can show which
// tables are currently in use (a check is open in Square POS) and the running
// total. Updated by webhook (order.created / order.updated / payment.updated)
// with a 60-second safety-net poll in case a webhook is missed.
export const tableSessions = pgTable("table_sessions", {
  id: serial("id").primaryKey(),
  squareOrderId: text("square_order_id").notNull().unique(),
  ticketName: text("ticket_name"),                   // raw "Snooker 4" etc.
  tableType: text("table_type"),                     // snooker | pool | dining
  tableNumber: text("table_number"),                 // numeric portion as text
  state: text("state").notNull().default("open"),    // open | paid | cancelled
  totalPence: integer("total_pence").notNull().default(0),
  itemCount: integer("item_count").notNull().default(0),
  paymentMethod: text("payment_method"),             // CARD | CASH | etc.
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
});
export type TableSession = typeof tableSessions.$inferSelect;
export type InsertTableSession = typeof tableSessions.$inferInsert;

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

// ── Teya POSLink OAuth tokens (single-row store) ──────────────────────────────
// Holds the OAuth2 access + refresh tokens granted to The 147 by Teya after
// the owner walks through https://id.teya.com/oauth/v2/oauth-authorize. We
// only ever store one row (id = 1) because the venue is one merchant — using
// a primary-keyed singleton makes upserts trivial and avoids "which row do
// we use?" ambiguity. Both tokens are stored encrypted at rest via the same
// AES-GCM helper used for customer PII (server/encryption.ts) so a stolen
// DB dump cannot replay against Teya.
//
// `expiresAt` lets us refresh proactively (60s before expiry) instead of
// waiting for a 401, which would slow the first kiosk payment of the hour.
// `scope` is informational — Teya may grant fewer scopes than requested and
// staff need to see what was actually authorised.
export const teyaOauthTokens = pgTable("teya_oauth_tokens", {
  id: integer("id").primaryKey().default(1),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  tokenType: text("token_type").notNull().default("Bearer"),
  scope: text("scope"),
  // Absolute expiry timestamp (Teya returns expires_in seconds; we add it
  // to "now" at the moment of the token exchange for monotonic comparison).
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type TeyaOauthTokens = typeof teyaOauthTokens.$inferSelect;

export const marketingPages = pgTable("marketing_pages", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  heroEyebrow: text("hero_eyebrow").notNull().default(""),
  heroTitle: text("hero_title").notNull().default(""),
  heroSub: text("hero_sub").notNull().default(""),
  heroBg: text("hero_bg").notNull().default(""),
  bodyHtml: text("body_html").notNull().default(""),
  metaTitle: text("meta_title").notNull().default(""),
  metaDescription: text("meta_description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MarketingPage = typeof marketingPages.$inferSelect;
export type InsertMarketingPage = typeof marketingPages.$inferInsert;

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
  expiresAt: timestamp("expires_at"),
  // Cached link to the customer's Square Loyalty account so we don't have to
  // search by phone on every request and so we can skip the phone+OTP flow
  // entirely once the customer has signed into their main account.
  squareLoyaltyAccountId: text("square_loyalty_account_id"),
  // Date of birth, stored encrypted as ISO YYYY-MM-DD. Used to grant a
  // birthday-week loyalty bonus. Optional — customers may decline to share.
  dateOfBirth: text("date_of_birth"),
  // The four-digit calendar year in which we last awarded the birthday
  // bonus to this customer. Lets us idempotently grant the bonus exactly
  // once per year regardless of how many times /api/loyalty/me is called.
  lastBirthdayBonusYear: integer("last_birthday_bonus_year"),
  // The four-digit calendar year in which we last sent the "happy birthday
  // week" push notification. Separate from lastBirthdayBonusYear because
  // the bonus is awarded only when the customer opens the app, while the
  // push fires once at the start of the window to *invite* them in.
  lastBirthdayPushYear: integer("last_birthday_push_year"),
  // ── Saved card on file (FEATURE_SAVED_CARDS) ───────────────────────────
  // Cached link to the customer's Square Customer record so we can attach a
  // card on file without searching by email each time. Created lazily the
  // first time the customer asks to save a card during checkout. Membership
  // signup uses its own membershipSubscriptions.squareCustomerId; this
  // column covers customers who have *not* joined the membership.
  squareCustomerId: text("square_customer_id"),
  // The single saved card we offer as the "Pay with •••• 4242" CTA. We
  // intentionally keep ONE card per customer (the most recently saved) for
  // the test version — multi-card UX would need a card-picker sheet which
  // is out of scope. The denormalised brand/last4/exp* columns are stored
  // so the cart can render the CTA without an extra Square round-trip.
  squareCardId: text("square_card_id"),
  squareCardBrand: text("square_card_brand"),
  squareCardLast4: text("square_card_last4"),
  squareCardExpMonth: integer("square_card_exp_month"),
  squareCardExpYear: integer("square_card_exp_year"),
  // ── Dietary preferences (FEATURE_DIETARY_FILTERS) ──────────────────────
  // Comma-separated list of tag codes the customer wants the menu to be
  // pre-filtered to. Tag codes match menuItemOverrides.dietaryTags below
  // (e.g. "V,VG,GF,DF,NF" — Vegetarian, Vegan, Gluten-Free, Dairy-Free,
  // Nut-Free). Stored as plain text rather than text[] so the existing
  // drizzle / zod / encryption tooling doesn't need a new array codec.
  dietaryFilters: text("dietary_filters"),
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
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Banner `linkValue` is rendered into web `Linking.openURL()` calls on the
// home and events screens. In a browser, opening a `javascript:` URL would
// execute attacker-controlled script in the page origin and could exfiltrate
// auth tokens stored in AsyncStorage (`customer_session_token`,
// `staff_session_token`). To prevent this stored-XSS sink, we restrict the
// stored value to plain http/https navigation URLs at every entry point.
// Helper is exported so the server, the schema, and the two client sinks can
// all share one definition.
export function isSafePublicUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  // Only allow standard navigation schemes. Explicitly rejects `javascript:`,
  // `data:`, `vbscript:`, `file:`, `blob:`, etc.
  return parsed.protocol === "https:" || parsed.protocol === "http:";
}

export const insertBannerImageSchema = createInsertSchema(bannerImages)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .superRefine((data, ctx) => {
    if (data.linkType === "url" && data.linkValue != null && !isSafePublicUrl(data.linkValue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["linkValue"],
        message: "Banner URL must start with https:// or http://",
      });
    }
  });

export type InsertBannerImage = z.infer<typeof insertBannerImageSchema>;
export type BannerImage = typeof bannerImages.$inferSelect;

// Per-deal display preferences for the customer-app "Current Deals" strip.
// Keyed by Square's discount catalog ID — no cascade because deals live in
// Square (not our DB). When a deal vanishes from Square, its row here just
// stops being joined against and becomes dead weight (cleanup is cheap and
// non-urgent). Unhidden by default; sortOrder=0 also lets brand-new deals
// surface at the top until a manager curates them.
export const dealPreferences = pgTable("deal_preferences", {
  id: serial("id").primaryKey(),
  squareDiscountId: text("square_discount_id").notNull().unique(),
  hidden: boolean("hidden").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type DealPreference = typeof dealPreferences.$inferSelect;

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
  // Explicit "this plan grants unlimited snooker" flag. When true, the
  // benefits list shows "Unlimited snooker access" regardless of
  // hoursIncluded. When false, hoursIncluded controls the wording:
  //   > 0  → "X hours per month"
  //   0    → no snooker line at all
  //   null → no snooker line at all
  // Previously, a null/blank hoursIncluded was implicitly treated as
  // "unlimited", which surprised staff who left it blank to mean
  // "not configured yet".
  snookerUnlimited: boolean("snooker_unlimited").notNull().default(false),
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
  // Hide from the customer-facing Membership signup screen while keeping the
  // plan active for discount lookup. Used for internal-only tiers (Staff,
  // VIP, comped accounts) that are assigned via Square Customer Groups
  // rather than purchased through the app.
  hideFromSignup: boolean("hide_from_signup").notNull().default(false),
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
  // How the order will be / was paid:
  //   "online"  → Square Web Payments / hosted checkout (default)
  //   "counter" → Kiosk mode — customer takes a numbered ticket to the
  //               counter and pays staff in person. Staff use the
  //               dashboard's "Mark Paid" action to flip the status.
  paymentMethod: text("payment_method").notNull().default("online"),
  // Short human-readable ticket number (1-999) shown on the kiosk
  // confirmation screen and on the staff dashboard. Resets per day.
  // Null for online orders.
  ticketNumber: integer("ticket_number"),
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

// ── Membership audit log ─────────────────────────────────────────────────────
// Single queryable trail of every staff-initiated membership action: refunds,
// cancellations, plan changes, payment-link sends, pauses/resumes, etc.
// Mirrors the shape of `passwordResetAuditLog` but keyed by subscription so
// the per-member history drawer can list the actions for one membership.
// Free-text `note` is intentionally plaintext (it's an internal staff log,
// like staffNotes); customer PII is referenced by id only, not duplicated.
export const membershipAuditLog = pgTable("membership_audit_log", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id"),
  customerId: integer("customer_id"),
  action: text("action").notNull(),
  staffUsername: text("staff_username").notNull(),
  amountPence: integer("amount_pence"),
  refundId: text("refund_id"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("membership_audit_log_created_at_idx").on(table.createdAt),
  subscriptionIdx: index("membership_audit_log_subscription_id_idx").on(table.subscriptionId),
  customerIdx: index("membership_audit_log_customer_id_idx").on(table.customerId),
}));

export type MembershipAuditEntry = typeof membershipAuditLog.$inferSelect;

// ── Booking audit log ────────────────────────────────────────────────────────
// Trail of every staff-initiated booking action: create, edit, status change,
// complete (with refund), no-show, delete. Now that ordinary staff can modify
// bookings (not only managers), this gives a clear "who did what" record per
// booking so disputes can be resolved. fromValue / toValue store JSON
// snapshots of the relevant fields so the diff can be reconstructed without
// joining other tables. note is a short human-readable summary.
export const bookingAuditLog = pgTable("booking_audit_log", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  action: text("action").notNull(),
  staffUsername: text("staff_username").notNull(),
  staffId: integer("staff_id"),
  fromValue: text("from_value"),
  toValue: text("to_value"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("booking_audit_log_created_at_idx").on(table.createdAt),
  bookingIdx: index("booking_audit_log_booking_id_idx").on(table.bookingId),
}));

export type BookingAuditEntry = typeof bookingAuditLog.$inferSelect;

// ── Generic staff action log ─────────────────────────────────────────────────
// Catch-all audit trail of every state-changing API call made by an
// authenticated staff or manager session. Captured automatically by the
// staffAuth middleware via res.on("finish") so coverage is uniform across all
// staff routes — no need to hand-instrument each endpoint. Sensitive fields
// (passwords, PINs, tokens, card details) are stripped from the request body
// before persistence and large payloads are truncated to keep the table small.
export const staffActionLog = pgTable("staff_action_log", {
  id: serial("id").primaryKey(),
  staffUsername: text("staff_username").notNull(),
  staffId: integer("staff_id"),
  staffRole: text("staff_role").notNull(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  route: text("route"),
  statusCode: integer("status_code").notNull(),
  requestBody: text("request_body"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("staff_action_log_created_at_idx").on(table.createdAt),
  staffIdx: index("staff_action_log_staff_username_idx").on(table.staffUsername),
  pathIdx: index("staff_action_log_path_idx").on(table.path),
}));

export type StaffActionEntry = typeof staffActionLog.$inferSelect;

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
  // ── Dietary tags (FEATURE_DIETARY_FILTERS) ──────────────────────────────
  // Comma-separated tag codes that describe an item's dietary suitability:
  // V (Vegetarian), VG (Vegan), GF (Gluten-Free), DF (Dairy-Free),
  // NF (Nut-Free). Empty / null means "untagged" — the filter UI surfaces
  // those items only when the customer has no active filter selected, so
  // staff can roll the feature out gradually without disappearing the
  // un-tagged half of the menu.
  dietaryTags: text("dietary_tags"),
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
  // True when items in this category come from the kitchen (food) and
  // therefore can only be ordered while the kitchen is open. False/null
  // means bar/drinks/snacks — always orderable inside venue hours. Used
  // by /api/ordering-status + /api/menu so the customer order screen + kiosk
  // can show "Kitchen closed — drinks only" and grey out food items
  // automatically without blocking drink sales outside kitchen hours.
  isKitchen: boolean("is_kitchen").notNull().default(false),
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
// Trust / fraud-control fields:
//   geofenceEnforced: true only when the server actually verified GPS against
//     a configured venue geofence at the time of THIS clock action. False if
//     the geofence was unset (no policy) or if no verification was possible.
//     Used by manager UIs to distinguish authoritative shifts from advisory
//     ones — coordinates are still client-supplied so this is "server checked
//     the math", not "server attested the device".
//   clockInFlags / clockOutFlags: comma-separated reason codes the server
//     attached at create/update time. See enforceGeofenceOrRespond() in
//     server/routes.ts for the catalogue. Empty/null = no flags.
//   clientIp / userAgent: forensic trail for after-the-fact investigation.
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
  geofenceEnforced: boolean("geofence_enforced").notNull().default(false),
  clockInFlags: text("clock_in_flags"),
  clockOutFlags: text("clock_out_flags"),
  clientIp: text("client_ip"),
  userAgent: text("user_agent"),
  // When location cannot be independently verified (i.e. coordinates come
  // from the client and the server has no attestation proof), the entry is
  // flagged so that managers must explicitly review it before it can be
  // treated as an authoritative attendance record for payroll purposes.
  needsManagerReview: boolean("needs_manager_review").notNull().default(false),
  managerReviewedAt: timestamp("manager_reviewed_at"),
  managerReviewedBy: integer("manager_reviewed_by"),
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

// ── Loyalty Game prize definitions ────────────────────────────────────────────
// Each row defines one prize tier. The game rolls a weighted random result at
// play time and issues the matching prize via Square Loyalty or as a points
// adjustment. 'none' type = "better luck next time" — no Square action needed.
export const gamePrizes = pgTable("game_prizes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),                // e.g. "Free Soft Drink"
  description: text("description"),            // shown to customer on win screen
  prizeType: text("prize_type").notNull(),     // 'none' | 'loyalty_points' | 'reward_tier'
  value: integer("value"),                     // points to award (prizeType='loyalty_points')
  rewardTierId: text("reward_tier_id"),        // Square reward tier ID (prizeType='reward_tier') — manager selects from Square Dashboard
  squareDiscountType: text("square_discount_type"), // 'FIXED_PERCENTAGE' | 'FIXED_AMOUNT' — copied from Square tier for display
  squareDiscountValue: integer("square_discount_value"), // % value (e.g. 10 = 10%) or pence (e.g. 500 = £5.00)
  tierPoints: integer("tier_points"),          // points cost of the Square reward tier (used to pre-fund the customer before issuing)
  weightPercent: integer("weight_percent").notNull().default(10), // probability weight (relative)
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type GamePrize = typeof gamePrizes.$inferSelect;

// ── Loyalty Game play history ─────────────────────────────────────────────────
// One row per play. Used to enforce the once-per-calendar-day limit and to
// show staff a winners list. customerId is a FK to customers.id in intent but
// not declared as a hard FK so a deleted customer doesn't orphan the log.
export const gamePlays = pgTable("game_plays", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  prizeId: integer("prize_id"),               // null → prize type 'none' (no win)
  squareRewardId: text("square_reward_id"),   // Square reward ID if reward_tier prize issued
  pointsAwarded: integer("points_awarded"),   // set when prizeType='loyalty_points'
  playedAt: timestamp("played_at").defaultNow().notNull(),
  // London calendar date (YYYY-MM-DD) for fast daily-limit queries without
  // timezone conversion in SQL.
  londonDate: text("london_date").notNull(),
});

export type GamePlay = typeof gamePlays.$inferSelect;

// ── Venue Reward Tiers ─────────────────────────────────────────────────────────
// Custom rewards that don't go through Square — e.g. "Free 30 min table time",
// "Free house drink", "Coaching session". Managed by staff in the portal.
// Point deductions are applied to the customer's Square loyalty balance.
export const venueRewardTiers = pgTable("venue_reward_tiers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),                      // "Free House Drink"
  description: text("description"),                  // Extra detail shown to customer
  category: text("category").notNull().default("other"), // 'food'|'drink'|'table'|'experience'|'other'
  pointsCost: integer("points_cost").notNull(),       // points required to claim
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type VenueRewardTier = typeof venueRewardTiers.$inferSelect;
export const insertVenueRewardTierSchema = createInsertSchema(venueRewardTiers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVenueRewardTier = z.infer<typeof insertVenueRewardTierSchema>;

// ── Venue Reward Claims ────────────────────────────────────────────────────────
// Created when a customer claims a venue reward. Staff look up the 6-char code
// at the till/bar and mark it redeemed to release the physical item.
export const venueRewardClaims = pgTable("venue_reward_claims", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  tierId: integer("tier_id").notNull(),
  claimCode: text("claim_code").notNull(),             // 6-char uppercase alphanumeric
  status: text("status").notNull().default("pending"), // 'pending'|'redeemed'|'expired'
  pointsDeducted: integer("points_deducted").notNull(),
  redeemedAt: timestamp("redeemed_at"),
  redeemedByStaffId: integer("redeemed_by_staff_id"),
  expiresAt: timestamp("expires_at").notNull(),        // 24h from claim
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type VenueRewardClaim = typeof venueRewardClaims.$inferSelect;
