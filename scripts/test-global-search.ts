// One-off RBAC smoke test for /api/staff/search.
// Creates two ephemeral staff users, mints sessions, hits the live backend,
// asserts plain staff cannot see manager-only groups.
import { storage } from "../server/storage";
import { hashPassword } from "../server/encryption";
import { randomBytes } from "node:crypto";

const PORT = process.env.PORT || "5000";
const BASE = `http://localhost:${PORT}`;

function rid(){ return randomBytes(4).toString("hex"); }

async function mintSession(role: "staff" | "manager"): Promise<{ token: string; username: string; userId: number }>{
  const username = `gs_${role}_${rid()}`;
  const pwd = hashPassword("Testing!1234");
  const created = await storage.createStaffUser({
    username,
    pinHash: null,
    pinSalt: null,
    passwordHash: pwd.hash,
    passwordSalt: pwd.salt,
    displayName: `GS ${role}`,
    role,
    mustChangePassword: false,
  });
  // Auto-approve the test user (manager+ approval flow).
  await storage.updateStaffApproval(created.id, "approved");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await storage.createStaffSession(token, expiresAt, created.id, username);
  return { token, username, userId: created.id };
}

async function callSearch(token: string, q: string){
  const r = await fetch(`${BASE}/api/staff/search?q=${encodeURIComponent(q)}`,{
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: r.status, body: await r.json() };
}

async function cleanup(userId: number){
  try { await storage.deleteStaffUser(userId); } catch {}
}

(async()=>{
  let managerSession, staffSession;
  try{
    [managerSession, staffSession] = await Promise.all([
      mintSession("manager"),
      mintSession("staff"),
    ]);

    console.log(`[setup] manager=${managerSession.username} staff=${staffSession.username}`);

    // Use a query likely to hit at least products + events.
    const q = "snooker";
    const [mgr, stf] = await Promise.all([
      callSearch(managerSession.token, q),
      callSearch(staffSession.token, q),
    ]);

    console.log(`\n[manager response] status=${mgr.status} role=${mgr.body?.role}`);
    console.log(`  group counts:`, Object.fromEntries(
      Object.entries(mgr.body.groups||{}).map(([k,v]:any)=>[k,Array.isArray(v)?v.length:'?'])
    ));
    console.log(`\n[staff response] status=${stf.status} role=${stf.body?.role}`);
    console.log(`  group counts:`, Object.fromEntries(
      Object.entries(stf.body.groups||{}).map(([k,v]:any)=>[k,Array.isArray(v)?v.length:'?'])
    ));

    let failed = 0;
    function check(cond: boolean, msg: string){
      console.log(`  ${cond?"PASS":"FAIL"} ${msg}`);
      if(!cond) failed++;
    }

    console.log("\n=== assertions ===");
    check(mgr.status===200, "manager: 200 OK");
    check(stf.status===200, "staff: 200 OK");
    check(mgr.body?.role==="manager", "manager: role echoed as 'manager'");
    check(stf.body?.role==="staff", "staff: role echoed as 'staff'");

    // RBAC core: staff must see EMPTY arrays for manager-only groups
    // even when the dataset contains matches for the query.
    const sg = stf.body.groups || {};
    check(Array.isArray(sg.customers)   && sg.customers.length===0,   "staff: customers group empty");
    check(Array.isArray(sg.bookings)    && sg.bookings.length===0,    "staff: bookings group empty");
    check(Array.isArray(sg.memberships) && sg.memberships.length===0, "staff: memberships group empty");
    check(Array.isArray(sg.staff)       && sg.staff.length===0,       "staff: staff group empty");

    // Allowed groups must still be arrays (may legitimately be empty if no
    // catalogue matches the test query — that's fine, just shape).
    check(Array.isArray(sg.products), "staff: products group is an array");
    check(Array.isArray(sg.events),   "staff: events group is an array");

    // Manager must see the same shape (all six keys present).
    const mg = mgr.body.groups || {};
    for(const key of ["products","events","customers","bookings","memberships","staff"]){
      check(Array.isArray(mg[key]), `manager: ${key} group is an array`);
    }

    // Encryption-aware booking search: create a booking with a unique
    // customer name and confirm a manager can find it via substring search,
    // proving we are not searching ciphertext.
    const uniqueName = `GsTest_${rid()}_${rid()}`;
    const created = await storage.createBooking({
      customerName: uniqueName,
      customerEmail: `${uniqueName.toLowerCase()}@example.test`,
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
    } as any);
    try {
      const mgrBookingHit = await callSearch(managerSession.token, uniqueName.slice(0, 12));
      const matched = (mgrBookingHit.body?.groups?.bookings || []).some((b:any)=>String(b.id)===String(created.id));
      check(matched, "manager: encryption-aware booking name search finds new booking");
      const stfBookingHit = await callSearch(staffSession.token, uniqueName.slice(0, 12));
      check((stfBookingHit.body?.groups?.bookings || []).length === 0, "staff: cannot see bookings group even by exact name");
      // Email-hash fast path
      const mgrEmailHit = await callSearch(managerSession.token, `${uniqueName.toLowerCase()}@example.test`);
      const emailMatched = (mgrEmailHit.body?.groups?.bookings || []).some((b:any)=>String(b.id)===String(created.id));
      check(emailMatched, "manager: email-hash fast path finds booking by exact email");
      // Numeric id fast path
      const mgrIdHit = await callSearch(managerSession.token, String(created.id));
      const idMatched = (mgrIdHit.body?.groups?.bookings || []).some((b:any)=>String(b.id)===String(created.id));
      check(idMatched, "manager: numeric id fast path finds booking");
    } finally {
      try { await storage.deleteBooking(created.id); } catch {}
    }

    // Try a query that is virtually guaranteed to match something for managers
    // — search by the manager's own username should hit the staff group.
    const mgrSelf = await callSearch(managerSession.token, managerSession.username.slice(0,8));
    console.log(`\n[manager self-search] staff matches=${mgrSelf.body?.groups?.staff?.length}`);
    check((mgrSelf.body?.groups?.staff || []).length >= 1, "manager: can find self in staff group");
    const stfSelf = await callSearch(staffSession.token, managerSession.username.slice(0,8));
    check((stfSelf.body?.groups?.staff || []).length === 0, "staff: cannot see staff group even when querying a real username");

    // Short-query guard: q < 2 chars must return all-empty groups, not 401.
    const shortMgr = await callSearch(managerSession.token, "a");
    check(shortMgr.status===200 && Object.values(shortMgr.body.groups||{}).every((v:any)=>Array.isArray(v)&&v.length===0), "manager: q<2 returns empty groups (not error)");

    console.log(`\n=== ${failed===0?"ALL ASSERTIONS PASSED":failed+" ASSERTION(S) FAILED"} ===`);
    process.exit(failed===0 ? 0 : 1);
  } finally {
    if(managerSession) await cleanup(managerSession.userId);
    if(staffSession)   await cleanup(staffSession.userId);
  }
})();
