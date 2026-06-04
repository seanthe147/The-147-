import { randomBytes, createHash } from "crypto";
import { storage } from "../server/storage";
import { hashPin } from "../server/encryption";

const API_BASE = "http://localhost:5000";
const RUN_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

function makeEmail(label: string): string {
  return `pwreset_${label}_${RUN_ID}@example.test`;
}

function makePasswordHash(password: string): string {
  const { hash, salt } = hashPin(password);
  return `${salt}:${hash}`;
}

async function createCustomer(opts: {
  email: string;
  password?: string;
  verified?: boolean;
}) {
  const password = opts.password || "OriginalPass123";
  const customer = await storage.createCustomer(
    opts.email,
    "PW Reset Tester",
    "07700900111",
    makePasswordHash(password),
  );
  if (opts.verified) {
    await storage.markEmailVerified(customer.id);
  }
  return customer;
}

async function issueResetTokenDirect(customerId: number, opts?: { expired?: boolean }) {
  const tokenRaw = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(tokenRaw).digest("hex");
  const expiresAt = opts?.expired
    ? new Date(Date.now() - 60 * 1000)
    : new Date(Date.now() + 60 * 60 * 1000);
  await storage.setPasswordResetToken(customerId, tokenHash, expiresAt);
  return { tokenRaw, tokenHash };
}

function ipHeader(label: string): Record<string, string> {
  // Use a unique IP per scenario so the per-IP sensitive rate limiter doesn't
  // bleed between tests. The server reads x-forwarded-for first.
  const a = (Math.floor(Math.random() * 200) + 20).toString();
  const b = (Math.floor(Math.random() * 200) + 20).toString();
  return { "x-forwarded-for": `10.${a}.${b}.${label.length}` };
}

async function postJson(path: string, body: any, extraHeaders: Record<string, string> = {}) {
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

async function run() {
  console.log("Password Reset / Verification Test Suite");
  console.log("========================================\n");

  // -------------------------------------------------------------------------
  console.log("forgot-password:");

  // Missing account → 200 generic (no enumeration)
  {
    const res = await postJson(
      "/api/customers/forgot-password",
      { email: `nobody_${RUN_ID}@example.test` },
      ipHeader("missing"),
    );
    const data = await res.json();
    assert(res.status === 200, "Missing account returns 200");
    assert(data.success === true, "Missing account returns generic success body");
  }

  // Invalid email format → 400
  {
    const res = await postJson(
      "/api/customers/forgot-password",
      { email: "not-an-email" },
      ipHeader("badfmt"),
    );
    assert(res.status === 400, "Invalid email format returns 400");
  }

  // Empty email → 400
  {
    const res = await postJson(
      "/api/customers/forgot-password",
      { email: "" },
      ipHeader("empty"),
    );
    assert(res.status === 400, "Empty email returns 400");
  }

  // Unverified account → 403 EMAIL_NOT_VERIFIED
  let unverifiedCustomerId = 0;
  {
    const email = makeEmail("unverified");
    const c = await createCustomer({ email, verified: false });
    unverifiedCustomerId = c.id;
    const res = await postJson(
      "/api/customers/forgot-password",
      { email },
      ipHeader("unverif"),
    );
    const data = await res.json();
    assert(res.status === 403, "Unverified account is refused with 403");
    assert(data.code === "EMAIL_NOT_VERIFIED", "Unverified response carries EMAIL_NOT_VERIFIED code");
    const fresh = await storage.getCustomerById(c.id);
    assert(!fresh?.passwordResetTokenHash, "No reset token issued for unverified account");
  }

  // Verified account → 200 + token issued in DB
  let verifiedCustomerId = 0;
  let verifiedEmail = "";
  {
    verifiedEmail = makeEmail("verified");
    const c = await createCustomer({ email: verifiedEmail, verified: true });
    verifiedCustomerId = c.id;
    const before = Date.now();
    const res = await postJson(
      "/api/customers/forgot-password",
      { email: verifiedEmail },
      ipHeader("verif"),
    );
    assert(res.status === 200, "Verified account returns 200");
    const fresh = await storage.getCustomerById(c.id);
    assert(!!fresh?.passwordResetTokenHash, "Reset token hash is stored for verified account");
    assert(
      !!fresh?.passwordResetTokenExpiresAt &&
        fresh.passwordResetTokenExpiresAt.getTime() > before,
      "Reset token has a future expiry",
    );
    assert(
      !!fresh?.passwordResetLastSentAt &&
        fresh.passwordResetLastSentAt.getTime() >= before,
      "passwordResetLastSentAt is updated",
    );
  }

  // -------------------------------------------------------------------------
  console.log("\nreset-password:");

  // Reset with a valid token succeeds and invalidates the token (no replay)
  {
    const email = makeEmail("happy");
    const c = await createCustomer({ email, verified: true, password: "OldPassword1" });
    const { tokenRaw } = await issueResetTokenDirect(c.id);

    // Create an active session for this customer to verify it gets invalidated
    const sessionToken = randomBytes(32).toString("hex");
    await storage.createCustomerSession(
      sessionToken,
      c.id,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    const meBefore = await fetch(`${API_BASE}/api/customers/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert(meBefore.status === 200, "Pre-reset session can fetch /me");

    const res = await postJson(
      "/api/customers/reset-password",
      { token: tokenRaw, password: "NewPassword456" },
      ipHeader("happy"),
    );
    assert(res.status === 200, "Valid token + new password returns 200");

    // Replay: same token must not work again
    const replay = await postJson(
      "/api/customers/reset-password",
      { token: tokenRaw, password: "AnotherPass789" },
      ipHeader("replay"),
    );
    assert(replay.status === 400, "Reusing the same reset token returns 400 (no replay)");

    // Sessions should now be invalidated
    const meAfter = await fetch(`${API_BASE}/api/customers/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert(
      meAfter.status === 401,
      `Existing session is invalidated after reset (got ${meAfter.status})`,
    );

    // Old password no longer works; new one does
    const loginOld = await postJson(
      "/api/customers/login",
      { email, password: "OldPassword1" },
      ipHeader("loginold"),
    );
    assert(loginOld.status === 401, "Old password rejected after reset");
    const loginNew = await postJson(
      "/api/customers/login",
      { email, password: "NewPassword456" },
      ipHeader("loginnew"),
    );
    assert(loginNew.status === 200, "New password works after reset");
  }

  // Expired token rejected
  {
    const email = makeEmail("expired");
    const c = await createCustomer({ email, verified: true });
    const { tokenRaw } = await issueResetTokenDirect(c.id, { expired: true });
    const res = await postJson(
      "/api/customers/reset-password",
      { token: tokenRaw, password: "WhateverGoesHere1" },
      ipHeader("expired"),
    );
    assert(res.status === 400, "Expired token returns 400");
    const data = await res.json();
    assert(
      typeof data.message === "string" && /expired/i.test(data.message),
      "Expired token error message mentions 'expired'",
    );
  }

  // Unknown / garbage token rejected
  {
    const res = await postJson(
      "/api/customers/reset-password",
      { token: "totally-not-a-real-token", password: "WhateverGoesHere1" },
      ipHeader("garbage"),
    );
    assert(res.status === 400, "Unknown token returns 400");
  }

  // Password length enforced
  {
    const email = makeEmail("short");
    const c = await createCustomer({ email, verified: true });
    const { tokenRaw } = await issueResetTokenDirect(c.id);
    const res = await postJson(
      "/api/customers/reset-password",
      { token: tokenRaw, password: "abc" },
      ipHeader("short"),
    );
    assert(res.status === 400, "Short password (<6) returns 400");
    // Token should still be usable since we rejected before consuming it
    const fresh = await storage.getCustomerById(c.id);
    assert(!!fresh?.passwordResetTokenHash, "Token is preserved when password validation fails");
  }

  // Missing token or password → 400
  {
    const res = await postJson(
      "/api/customers/reset-password",
      { token: "", password: "" },
      ipHeader("miss"),
    );
    assert(res.status === 400, "Missing token+password returns 400");
  }

  // GET /reset-password landing page behaviour
  {
    const noToken = await fetch(`${API_BASE}/reset-password`);
    assert(noToken.status === 400, "GET /reset-password without token returns 400");

    const bogus = await fetch(`${API_BASE}/reset-password?token=does-not-exist`);
    assert(bogus.status === 400, "GET /reset-password with unknown token returns 400");

    const email = makeEmail("landing");
    const c = await createCustomer({ email, verified: true });
    const { tokenRaw } = await issueResetTokenDirect(c.id);
    const ok = await fetch(`${API_BASE}/reset-password?token=${tokenRaw}`);
    assert(ok.status === 200, "GET /reset-password with valid token returns 200");

    const expiredCustomer = await createCustomer({ email: makeEmail("landing2"), verified: true });
    const { tokenRaw: expiredRaw } = await issueResetTokenDirect(expiredCustomer.id, { expired: true });
    const expired = await fetch(`${API_BASE}/reset-password?token=${expiredRaw}`);
    assert(expired.status === 400, "GET /reset-password with expired token returns 400");
  }

  // -------------------------------------------------------------------------
  console.log("\nresend-verification-public:");

  // Always returns 200 (no enumeration), even for unknown emails
  {
    const res = await postJson(
      "/api/customers/resend-verification-public",
      { email: `nobody2_${RUN_ID}@example.test` },
      ipHeader("rv-noacc"),
    );
    assert(res.status === 200, "Unknown email returns 200");
  }

  // Empty email → 400
  {
    const res = await postJson(
      "/api/customers/resend-verification-public",
      { email: "" },
      ipHeader("rv-empty"),
    );
    assert(res.status === 400, "Empty email returns 400");
  }

  // Cooldown: per-customer, 60s between sends. Second call within window must
  // not refresh the verification token / lastSentAt.
  {
    const email = makeEmail("rv-cooldown");
    const c = await createCustomer({ email, verified: false });
    const ip = ipHeader("rv-cooldown");

    const res1 = await postJson(
      "/api/customers/resend-verification-public",
      { email },
      ip,
    );
    assert(res1.status === 200, "First resend returns 200");
    const after1 = await storage.getCustomerById(c.id);
    const firstSentAt = after1?.emailVerifyLastSentAt?.getTime() ?? 0;
    const firstHash = after1?.emailVerifyTokenHash;
    assert(firstSentAt > 0, "First resend records emailVerifyLastSentAt");
    assert(!!firstHash, "First resend stores a verification token hash");

    const res2 = await postJson(
      "/api/customers/resend-verification-public",
      { email },
      ip,
    );
    assert(res2.status === 200, "Second resend (within cooldown) still returns 200");
    const after2 = await storage.getCustomerById(c.id);
    assert(
      (after2?.emailVerifyLastSentAt?.getTime() ?? 0) === firstSentAt,
      "Second resend within 60s does not update emailVerifyLastSentAt",
    );
    assert(
      after2?.emailVerifyTokenHash === firstHash,
      "Second resend within 60s does not rotate the verification token",
    );
  }

  // Already-verified account: endpoint returns 200 but does not issue a token
  {
    const email = makeEmail("rv-verified");
    const c = await createCustomer({ email, verified: true });
    const res = await postJson(
      "/api/customers/resend-verification-public",
      { email },
      ipHeader("rv-verified"),
    );
    assert(res.status === 200, "Resend for verified account returns 200");
    const fresh = await storage.getCustomerById(c.id);
    assert(!fresh?.emailVerifyTokenHash, "Resend for verified account does not issue a verification token");
  }

  // -------------------------------------------------------------------------
  console.log("\nrate limiting (sensitive endpoints):");

  // Per-IP sensitive rate limiter is 10 req / 15 min. Burn 10 then expect 429.
  {
    const sharedIp = { "x-forwarded-for": `10.250.250.${(Math.floor(Math.random() * 200) + 1)}` };
    let saw429 = false;
    let lastStatus = 0;
    for (let i = 0; i < 12; i++) {
      const res = await postJson(
        "/api/customers/forgot-password",
        { email: `ratelimit_${RUN_ID}_${i}@example.test` },
        sharedIp,
      );
      lastStatus = res.status;
      if (res.status === 429) {
        saw429 = true;
        break;
      }
    }
    assert(saw429, `Sensitive endpoint returns 429 after exceeding the per-IP limit (last status ${lastStatus})`);
  }

  // -------------------------------------------------------------------------
  // Cleanup test customers
  try {
    const all = await storage.getAllCustomers();
    for (const cust of all) {
      if (cust.email && cust.email.includes(RUN_ID)) {
        await storage.deleteCustomer(cust.id);
      }
    }
    if (unverifiedCustomerId) await storage.deleteCustomer(unverifiedCustomerId).catch(() => {});
    if (verifiedCustomerId) await storage.deleteCustomer(verifiedCustomerId).catch(() => {});
  } catch (err: any) {
    console.warn("Cleanup error:", err.message);
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Test suite error:", err);
  process.exit(1);
});
