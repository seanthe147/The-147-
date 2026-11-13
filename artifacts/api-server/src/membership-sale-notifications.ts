import { and, eq } from "drizzle-orm";
import { membershipAuditLog as audit, membershipPurchaseRecords as purchases } from "@workspace/db/schema";
import { db, storage } from "./storage";
import { sendMarketingEmail } from "./email-helpers";
import { getSquareCustomer } from "./square";
import { squareCadenceForPlan } from "./membership-billing-policy";

const pending = "membership_sale_email_pending";
const sent = "membership_sale_email_sent";
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Called inside the purchase transaction, only when its unique receipt is new.
// The audit record doubles as a durable delivery queue; no customer PII is copied.
export async function queueMembershipSaleEmail(tx: Pick<typeof db, "insert">, purchaseId: string,
  subscriptionId?: number | null, customerId?: number | null) {
  await tx.insert(audit).values({ action: pending, staffUsername: "system",
    subscriptionId, customerId, note: purchaseId });
}

export async function deliverMembershipSaleEmails(
  send = sendMarketingEmail,
) {
  const queued = await db.select({ id: audit.id }).from(audit)
    .where(eq(audit.action, pending)).orderBy(audit.id).limit(20);
  for (const entry of queued) {
    try {
      await db.transaction(async tx => {
        // Multiple webhooks/instances cannot concurrently send the same notice.
        const [notice] = await tx.select().from(audit)
          .where(and(eq(audit.id, entry.id), eq(audit.action, pending)))
          .for("update", { skipLocked: true });
        if (!notice?.note) return;
        const [purchase] = await tx.select().from(purchases).where(eq(purchases.id, notice.note));
        if (!purchase) throw new Error("Purchase record unavailable");
        const customer = purchase.customerId ? await storage.getCustomerById(purchase.customerId)
          : await storage.getCustomerBySquareCustomerId(purchase.squareCustomerId);
        const plan = await storage.getMembershipPlan(purchase.planId);
        let name = customer?.name?.trim();
        if (!name) {
          const remote = await getSquareCustomer(purchase.squareCustomerId);
          name = [remote?.given_name, remote?.family_name].filter(Boolean).join(" ").trim();
        }
        if (!name || !plan) throw new Error("Customer name or plan unavailable");
        const date = purchase.purchasedAt?.toLocaleString("en-GB", {
          timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short", hour12: true,
        }) ?? "Confirmed by Square";
        const amount = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(purchase.amountPence / 100);
        const cadence = purchase.source === "square_pos" ? "Prepaid till purchase"
          : purchase.frequency === "annual" ? "Annual" : squareCadenceForPlan(plan, "monthly") === "THIRTY_DAYS" ? "Every 30 days" : "Monthly";
        const html = `<div style="font-family:Arial,sans-serif;color:#142033">
          <h1>New membership purchase</h1>
          <p><strong>Customer:</strong> ${escapeHtml(name)}</p>
          <p><strong>Plan:</strong> ${escapeHtml(plan.name)}</p>
          <p><strong>Billing:</strong> ${cadence}</p>
          <p><strong>Amount paid:</strong> ${amount}</p>
          <p><strong>Purchased:</strong> ${escapeHtml(date)}</p>
          <p>Payment has been confirmed by Square. Review the membership in the staff portal.</p>
        </div>`;
        if (!await send("info@the147.co.uk", "The 147 — new membership purchase", html))
          throw new Error("Email delivery not confirmed");
        await tx.update(audit).set({ action: sent }).where(eq(audit.id, notice.id));
      });
    } catch {
      // Leave pending for the next scheduled attempt; never undo paid access.
      console.warn("[MEMBERSHIP] Purchase email pending; delivery will retry.");
    }
  }
}
