// Regression test for Task #105 (Staff Access Control).
//
// The original security report flagged two High-severity issues:
//   1. POST /api/staff/register auto-approved any plain "staff" account
//      created with the shared venue STAFF_PIN, turning a leaked PIN into
//      ongoing system access.
//   2. Several manager-intended endpoints (customer search, bookings list,
//      booking mutation routes) were gated only by staffAuth, so any
//      approved plain staff session could enumerate customer PII and
//      mutate bookings.
//
// Both were already fixed in the codebase before this task ran. This
// script locks the fixed behaviour in place so neither can regress
// silently. It hits the live backend over real HTTP with real bearer
// tokens, then cleans up every record it created.
import { storage } from "../server/storage";
import { hashPassword } from "../server/encryption";
import { randomBytes } from "node:crypto";
import type { InsertBooking } from "../shared/schema";

const PORT = process.env.PORT || "5000";
const BASE = `http://localhost:${PORT}`;

function rid() { return randomBytes(4).toString("hex"); }

async function provisionApprovedSession(role: "staff" | "manager"): Promise<{ token: string; username: string; userId: number }> {
  const username = `ac_${role}_${rid()}`;
  const pwd = hashPassword("Testing!1234");
  const created = await storage.createStaffUser({
    username,
    pinHash: null,
    pinSalt: null,
    passwordHash: pwd.hash,
    passwordSalt: pwd.salt,
    displayName: `AC ${role}`,
    role,
    mustChangePassword: false,
  });
  await storage.updateStaffApproval(created.id, "approved");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await storage.createStaffSession(token, expiresAt, created.id, username);
  return { token, username, userId: created.id };
}

async function call(method: string, path: string, token: string | null, body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed: any = null;
  try { parsed = await r.json(); } catch {}
  return { status: r.status, body: parsed };
}

(async () => {
  let managerSession: Awaited<ReturnType<typeof provisionApprovedSession>> | null = null;
  let staffSession: Awaited<ReturnType<typeof provisionApprovedSession>> | null = null;
  const createdUsernamesForCleanup: string[] = [];
  let testBookingId: number | null = null;
  let failed = 0;
  function check(cond: boolean, msg: string) {
    console.log(`  ${cond ? "PASS" : "FAIL"} ${msg}`);
    if (!cond) failed++;
  }

  // Fail closed: this script's whole point is to catch regressions in the
  // STAFF_PIN-gated registration flow. If STAFF_PIN isn't configured, we
  // cannot exercise that path at all — silently skipping would let a real
  // regression slip through CI. Require it explicitly.
  if (!process.env.STAFF_PIN) {
    console.error("FAIL STAFF_PIN must be set to run this regression test (Finding 1 cannot be exercised otherwise)");
    process.exit(1);
  }

  try {
    [managerSession, staffSession] = await Promise.all([
      provisionApprovedSession("manager"),
      provisionApprovedSession("staff"),
    ]);
    console.log(`[setup] manager=${managerSession.username} staff=${staffSession.username}`);

    // ── FINDING 1: registration must NOT auto-approve any role ─────────────
    // STAFF_PIN presence is enforced by the fail-closed guard above, so it's
    // safe to assume it's set here.
    console.log("\n=== Finding 1: shared PIN cannot mint auto-approved accounts ===");
    const staffPin = process.env.STAFF_PIN!;

    const newUsername = `ac_reg_${rid()}`;
    createdUsernamesForCleanup.push(newUsername);
    const reg = await call("POST", "/api/staff/register", null, {
      masterPin: staffPin,
      username: newUsername,
      password: "Testing!1234",
      role: "staff",
    });
    check(reg.status === 201, `register: 201 Created (got ${reg.status})`);
    check(reg.body?.approvalStatus === "pending", `register: plain "staff" role lands in 'pending' (got ${reg.body?.approvalStatus})`);

    // Try to log in as the freshly registered (still-pending) account.
    const login = await call("POST", "/api/staff/login", null, {
      username: newUsername,
      password: "Testing!1234",
    });
    check(login.status === 401 || login.status === 403, `login: pending account is rejected (got ${login.status})`);

    // Sanity: same flow with role=manager must also stay pending (it always
    // did, but pin this so future refactors don't re-introduce role-based
    // auto-approval the other way).
    const mgrUsername = `ac_reg_mgr_${rid()}`;
    createdUsernamesForCleanup.push(mgrUsername);
    const regMgr = await call("POST", "/api/staff/register", null, {
      masterPin: staffPin,
      username: mgrUsername,
      password: "Testing!1234",
      role: "manager",
    });
    check(regMgr.body?.approvalStatus === "pending", `register: "manager" role lands in 'pending' (got ${regMgr.body?.approvalStatus})`);

    // Negative: wrong masterPin must not create an account.
    const badUsername = `ac_reg_bad_${rid()}`;
    const regBad = await call("POST", "/api/staff/register", null, {
      masterPin: "obviously-wrong-pin",
      username: badUsername,
      password: "Testing!1234",
      role: "staff",
    });
    check(regBad.status === 401, `register: wrong masterPin rejected with 401 (got ${regBad.status})`);
    const leaked = await storage.getStaffUserByUsername(badUsername);
    check(!leaked, "register: no account row created when masterPin is wrong");

    // ── FINDING 2: plain staff cannot reach manager-only endpoints ─────────
    console.log("\n=== Finding 2: plain staff sessions get 403 on manager-only endpoints ===");

    // Seed a real booking so the per-:id endpoints have something to act on.
    // The booking storage layer encrypts PII, so we use a marker name that
    // won't conflict with real data.
    const seedBooking: InsertBooking = {
      customerName: `AcTest_${rid()}`,
      customerEmail: `ac_${rid()}@example.test`,
      customerPhone: "07700900000",
      tableType: "snooker",
      tableNumber: "1",
      guestCount: 2,
      date: "2099-01-01",
      startTime: "12:00",
      duration: 1,
      status: "confirmed",
      notes: null,
      gdprConsent: true,
      depositRequired: false,
      depositPaid: false,
    };
    const created = await storage.createBooking(seedBooking);
    testBookingId = created.id;

    type Probe = { method: string; path: string; body?: unknown; label: string };
    const probes: Probe[] = [
      { method: "GET",    path: "/api/staff/customers/search?q=test",         label: "GET  /api/staff/customers/search" },
      { method: "GET",    path: "/api/bookings",                              label: "GET  /api/bookings" },
      { method: "GET",    path: `/api/bookings/${testBookingId}`,             label: "GET  /api/bookings/:id" },
      { method: "PATCH",  path: `/api/bookings/${testBookingId}/complete`,    label: "PATCH /api/bookings/:id/complete", body: {} },
      { method: "PATCH",  path: `/api/bookings/${testBookingId}/noshow`,      label: "PATCH /api/bookings/:id/noshow",   body: {} },
      { method: "PATCH",  path: `/api/bookings/${testBookingId}/status`,      label: "PATCH /api/bookings/:id/status",   body: { status: "cancelled" } },
      { method: "PUT",    path: `/api/bookings/${testBookingId}`,             label: "PUT   /api/bookings/:id",          body: { notes: "blocked-write-attempt" } },
      { method: "DELETE", path: `/api/bookings/${testBookingId}`,             label: "DEL   /api/bookings/:id" },
    ];

    for (const p of probes) {
      const stf = await call(p.method, p.path, staffSession!.token, p.body);
      check(stf.status === 403, `staff: ${p.label} → 403 (got ${stf.status})`);
    }

    // Spot-check the positive case: manager passes the auth gate. We accept
    // 200/204 (success) or 404 (booking gone after a previous probe) or 409
    // (conflict on PUT). We're only proving the gate doesn't 403 the
    // manager — the underlying behaviour is covered by other tests.
    const mgrCustomerSearch = await call("GET", "/api/staff/customers/search?q=test", managerSession!.token);
    check(mgrCustomerSearch.status === 200, `manager: GET /api/staff/customers/search → 200 (got ${mgrCustomerSearch.status})`);
    const mgrBookingsList = await call("GET", "/api/bookings", managerSession!.token);
    check(mgrBookingsList.status === 200, `manager: GET /api/bookings → 200 (got ${mgrBookingsList.status})`);

    // Also confirm the plain-staff session is itself valid by hitting an
    // endpoint we know plain staff CAN reach. This rules out the (otherwise
    // hidden) failure mode where every probe 403s simply because the session
    // is broken.
    const stfVerify = await call("GET", "/api/staff/verify", staffSession!.token);
    check(stfVerify.status === 200, `staff: control endpoint /api/staff/verify reachable (got ${stfVerify.status})`);

    console.log(`\n=== ${failed === 0 ? "ALL ASSERTIONS PASSED" : failed + " ASSERTION(S) FAILED"} ===`);
    // Set exit code but let `finally` run to completion so we don't leave
    // test rows behind. Calling process.exit() here would short-circuit the
    // async cleanup below.
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    if (testBookingId != null) {
      try { await storage.deleteBooking(testBookingId); } catch {}
    }
    for (const u of createdUsernamesForCleanup) {
      try {
        const row = await storage.getStaffUserByUsername(u);
        if (row) await storage.deleteStaffUser(row.id);
      } catch {}
    }
    if (managerSession) { try { await storage.deleteStaffUser(managerSession.userId); } catch {} }
    if (staffSession)   { try { await storage.deleteStaffUser(staffSession.userId);   } catch {} }
  }
})();
