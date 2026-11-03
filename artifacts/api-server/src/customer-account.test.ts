import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { customers, bookings, appOrders, membershipAuditLog } from "@workspace/db/schema";
import { db, storage } from "./storage";
import { registerCustomerAccount } from "./customer-account";
import { encrypt, hashEmail } from "./encryption";

if (process.env.MEMBERSHIP_BILLING_ISOLATED_TEST !== "yes") throw new Error("Use isolated billing test runner");
let id: number;
let secondId: number;
let bookingId: number;
let orderId: number;
let base: string;
let server: ReturnType<ReturnType<typeof express>["listen"]>;
const email = "linked-records@example.invalid";
before(async () => {
  id = (await storage.createCustomer(email, "Account fixture", null, "!locked")).id;
  secondId = (await storage.createCustomer("other-account@example.invalid", "Other fixture", null, "!locked")).id;
  bookingId = (await storage.createBooking({ customerName: "Account fixture", customerEmail: email, customerPhone: "000",
    tableType: "snooker", date: "2099-01-01", startTime: "12:00", duration: 60, gdprConsent: true })).id;
  orderId = (await storage.createAppOrder({ customerEmail: email, customerName: "Account fixture",
    itemsJson: '[{"name":"Fixture drink","quantity":1}]', totalPence: 100 })).id;
  const app = express();
  app.use(express.json());
  registerCustomerAccount(app, (req, res, next) => {
    const role = req.header("x-test-role");
    if (!role) { res.sendStatus(401); return; }
    (req as any).staffRole = role; (req as any).staffUsername = "fixture-staff"; next();
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await db.delete(membershipAuditLog).where(inArray(membershipAuditLog.customerId, [id, secondId]));
  await db.delete(bookings).where(eq(bookings.id, bookingId));
  await db.delete(appOrders).where(eq(appOrders.id, orderId));
  await db.delete(customers).where(inArray(customers.id, [id, secondId]));
});
test("account history requires staff auth and projects only safe fields", async () => {
  const url = `${base}/api/staff/customers/${id}/account`;
  assert.equal((await fetch(url)).status, 401);
  const result = await fetch(url, { headers: { "x-test-role": "staff" } });
  assert.equal(result.headers.get("cache-control"), "no-store");
  const data = await result.json() as any;
  assert.equal(data.bookings[0].id, bookingId);
  assert.equal(data.orders[0].id, orderId);
  assert.equal(data.permissions.canDowngradePlatinum, false);
  for (const secret of ["passwordHash", "confirmationToken", "pushToken", "squarePaymentId"]) assert.equal(JSON.stringify(data).includes(secret), false);
});
test("legacy matching links records once and histories survive an email change", async () => {
  await db.update(bookings).set({ customerId: null }).where(eq(bookings.id, bookingId));
  await db.update(appOrders).set({ customerId: null }).where(eq(appOrders.id, orderId));
  assert.equal((await storage.getBookingsByEmail(email))[0].id, bookingId);
  assert.equal((await storage.getCustomerOrders(email))[0].id, orderId);
  const nextEmail = "new-address@example.invalid";
  await db.update(customers).set({ email: encrypt(nextEmail), emailHash: hashEmail(nextEmail) }).where(eq(customers.id, id));
  assert.equal((await storage.getBookingsByEmail(nextEmail))[0].id, bookingId);
  assert.equal((await storage.getCustomerOrders(nextEmail))[0].id, orderId);
  await db.update(customers).set({ email: encrypt(email), emailHash: hashEmail(email) }).where(eq(customers.id, id));
});
test("ambiguous accounts require manager review and linked records cannot be reassigned", async () => {
  await db.update(customers).set({ email, emailHash: null }).where(eq(customers.id, secondId));
  await db.update(bookings).set({ customerId: null }).where(eq(bookings.id, bookingId));
  assert.equal(await storage.uniqueCustomerIdForEmail(email), null);
  const data = await (await fetch(`${base}/api/staff/customers/${id}/account`, { headers: { "x-test-role": "manager" } })).json() as any;
  assert.equal(data.linking.candidates[0].id, bookingId);
  const link = (customer: number, role: string) => fetch(`${base}/api/staff/customers/${customer}/link-record`, {
    method: "POST", headers: { "x-test-role": role, "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "booking", recordId: bookingId, confirmed: true, reason: "Verified identity with customer" }),
  });
  assert.equal((await link(id, "staff")).status, 403);
  assert.equal((await link(id, "manager")).status, 200);
  assert.equal((await link(secondId, "owner")).status, 409);
});
