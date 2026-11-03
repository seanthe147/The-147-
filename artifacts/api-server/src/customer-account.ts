import type { Express, RequestHandler } from "express";
import { eq, desc, and, isNull, or, sql } from "drizzle-orm";
import { membershipAuditLog, membershipSubscriptions, bookings as bookingTable, appOrders } from "@workspace/db/schema";
import { db, storage } from "./storage";
import { membershipBillingDetails } from "./membership-billing";
import { hashEmail } from "./encryption";

export function registerCustomerAccount(app: Express, staffAuth: RequestHandler) {
  app.get("/api/staff/customers/:id/account", staffAuth, async (req, res) => {
    const id = Number(req.params.id);
    res.setHeader("Cache-Control", "no-store");
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: "Invalid customer." });
    try {
      const customer = await storage.getCustomerById(id);
      if (!customer) return res.status(404).json({ message: "Customer not found." });
      const uniqueId = await storage.uniqueCustomerIdForEmail(customer.email);
      const [bookings, orders, memberships, audit, plans, current] = await Promise.all([
        uniqueId === id ? storage.getBookingsByEmail(customer.email) : storage.getBookingsByCustomerId(id),
        uniqueId === id ? storage.getCustomerOrders(customer.email) : storage.getOrdersByCustomerId(id),
        db.select().from(membershipSubscriptions).where(eq(membershipSubscriptions.customerId, id)),
        db.select().from(membershipAuditLog).where(eq(membershipAuditLog.customerId, id)).orderBy(desc(membershipAuditLog.createdAt)).limit(100),
        storage.getMembershipPlans(),
        storage.getMembershipSubscriptionByCustomer(id),
      ]);
      let billing = null;
      let billingError = null;
      try { billing = await membershipBillingDetails(current); }
      catch { billingError = "Square billing could not be verified. History is available; billing changes are disabled until verification succeeds."; }
      const role = (req as any).staffRole ?? "staff";
      const canReview = role === "manager" || role === "owner";
      const linkCandidates = uniqueId !== id && canReview ? [
        ...(await db.select({ id: bookingTable.id, date: bookingTable.date, label: bookingTable.tableType })
          .from(bookingTable).where(and(isNull(bookingTable.customerId), or(
            eq(bookingTable.emailHash, hashEmail(customer.email)),
            sql`lower(trim(${bookingTable.customerEmail})) = lower(trim(${customer.email}))`,
          ))).limit(100)).map(b => ({ ...b, kind: "booking" })),
        ...(await db.select({ id: appOrders.id, date: appOrders.createdAt, label: appOrders.status })
          .from(appOrders).where(and(isNull(appOrders.customerId), or(
            eq(appOrders.customerEmailHash, hashEmail(customer.email)),
            sql`lower(trim(${appOrders.customerEmail})) = lower(trim(${customer.email}))`,
          ))).limit(100)).map(o => ({ ...o, kind: "order" })),
      ] : [];
      res.json({
        customer: { id, name: customer.name, email: customer.email, phone: customer.phone, createdAt: customer.createdAt },
        bookings: bookings.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200).map(b => ({
          id: b.id, tableType: b.tableType, tableNumber: b.tableNumber, date: b.date,
          startTime: b.startTime, duration: b.duration, status: b.status, notes: b.notes,
        })),
        orders: orders.map(o => ({ id: o.id, createdAt: o.createdAt, status: o.status,
          totalPence: o.totalPence, itemsJson: o.itemsJson, paymentMethod: o.paymentMethod })),
        memberships: memberships.map(m => ({ id: m.id, planId: m.planId,
          planName: plans.find(p => p.id === m.planId)?.name ?? "Membership",
          status: m.status, source: m.source, startDate: m.currentPeriodStart ?? m.createdAt,
          currentPeriodEnd: m.currentPeriodEnd, prepaidUntilDate: m.prepaidUntilDate })),
        audit: audit.map(a => ({ id: a.id, action: a.action, staffUsername: a.staffUsername, note: a.note, createdAt: a.createdAt })),
        billing, billingError, permissions: { role, canDowngradePlatinum: role === "manager" || role === "owner" },
        linking: { candidates: linkCandidates, canReview, message: uniqueId === id
          ? "Bookings and app orders are linked by customer ID. Previously unlinked records are matched only by an unambiguous exact email. Anonymous till sales are not included."
          : "This email matches multiple accounts. Booking and order matching is withheld for manager review; no accounts were merged." },
      });
    } catch (error) {
      console.error("[CUSTOMER-ACCOUNT] Could not load account", error);
      res.status(500).json({ message: "Could not load the customer record. Please retry." });
    }
  });
  app.post("/api/staff/customers/:id/link-record", staffAuth, async (req, res) => {
    if (!["manager", "owner"].includes((req as any).staffRole)) return res.status(403).json({ message: "Manager or owner approval required." });
    const customerId = Number(req.params.id);
    const { kind, recordId, confirmed, reason } = req.body ?? {};
    if (!Number.isSafeInteger(customerId) || customerId < 1 || !Number.isSafeInteger(recordId) || recordId < 1 ||
        !["booking", "order"].includes(kind) || confirmed !== true || typeof reason !== "string" || !reason.trim() || reason.length > 1000) {
      return res.status(400).json({ message: "Confirm the record, customer identity and a reason." });
    }
    try {
      const customer = await storage.getCustomerById(customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found." });
      const table = kind === "booking" ? bookingTable : appOrders;
      // A reviewed match must still share the exact email, and may never take
      // ownership away from another account.
      const hashColumn = kind === "booking" ? bookingTable.emailHash : appOrders.customerEmailHash;
      const rows = await db.transaction(async tx => {
        const updated = await tx.update(table).set({ customerId }).where(and(
          eq(table.id, recordId), isNull(table.customerId),
          or(eq(hashColumn, hashEmail(customer.email)), sql`lower(trim(${table.customerEmail})) = lower(trim(${customer.email}))`),
        )).returning({ id: table.id });
        if (updated.length) await tx.insert(membershipAuditLog).values({
          customerId, action: "customer_record_linked", staffUsername: (req as any).staffUsername ?? "staff",
          note: `${kind} ${recordId}; identity confirmed; ${reason.trim()}`,
        });
        return updated;
      });
      if (!rows.length) return res.status(409).json({ message: "Record is already linked, does not match the email, or is unavailable. Refresh before retrying." });
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Could not link the record." }); }
  });
}
