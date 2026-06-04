// Guards against the "silent one-time fallback" class of regressions in the
// membership signup / hosted checkout flow.
//
// The original bug: when the in-app payment sheet couldn't load, the app
// asked the server for a hosted checkout URL and opened it in the browser.
// On the server, /api/membership/join was supposed to create a RECURRING
// subscription checkout, but if Square couldn't produce one (missing plan
// variation ID, transient API error, etc.) it silently fell back to a
// ONE-TIME payment link via createMembershipCheckoutLink. The customer's
// card got charged once, no Square subscription was ever created, and the
// member's card was never re-charged — they thought they were a member but
// would never be billed again.
//
// This test parses server/routes.ts and asserts:
//   1. The /api/membership/join handler never calls
//      createMembershipCheckoutLink (the one-time link helper).
//   2. The same handler returns a 503 / error response when the subscription
//      checkout can't be created (no silent success path with no checkoutUrl
//      that Square is configured for).
//   3. The /api/membership/retry-payment handler uses
//      createSubscriptionCheckoutLink, never createMembershipCheckoutLink.
//   4. The /api/staff/membership/payment-link handler uses
//      createSubscriptionCheckoutLink, never createMembershipCheckoutLink.
//
// We do this with source-level static analysis (similar to
// payment-sheet-html.test.ts) rather than booting the full Express app +
// real Postgres + a Square mock, which would be far heavier and brittle.
//
// Run with:
//   npx tsx tests/membership-recurring-only.test.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  \u2713 ${message}`);
    passed++;
  } else {
    console.log(`  \u2717 ${message}`);
    failed++;
  }
}

function extractHandler(source: string, marker: string): string {
  // Find the route-registration line (e.g.
  // `app.post("/api/membership/join", customerAuth, async (req, res) => {`)
  // and return everything up to the matching closing `});` for the handler.
  const idx = source.indexOf(marker);
  if (idx === -1) throw new Error(`Could not locate route marker: ${marker}`);
  // Find the opening brace of the handler arrow function.
  const braceStart = source.indexOf("=> {", idx);
  if (braceStart === -1) throw new Error(`Could not locate handler body for: ${marker}`);
  let depth = 0;
  let i = braceStart + 3; // position at the `{`
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(idx, i + 1);
      }
    }
  }
  throw new Error(`Unterminated handler body for: ${marker}`);
}

function run() {
  console.log("Membership signup — recurring-only checkout invariant");
  console.log("=====================================================\n");

  const routesPath = join(__dirname, "..", "server", "routes.ts");
  const source = readFileSync(routesPath, "utf8");

  // 1) /api/membership/join handler — never calls one-time link helper,
  //    and returns an error when no recurring checkout URL was produced.
  const joinHandler = extractHandler(
    source,
    `app.post("/api/membership/join", customerAuth`,
  );
  assert(
    !joinHandler.includes("createMembershipCheckoutLink"),
    "/api/membership/join never calls createMembershipCheckoutLink (one-time)",
  );
  assert(
    joinHandler.includes("createSubscriptionCheckoutLink"),
    "/api/membership/join uses createSubscriptionCheckoutLink (recurring)",
  );
  // When Square is configured but no checkoutUrl was produced, we must
  // explicitly bail with an error — never return a 201 with no checkoutUrl
  // and a "pending" sub that expects a hosted page that doesn't exist.
  assert(
    /square\.isConfigured\(\)\s*&&\s*!checkoutUrl/.test(joinHandler) &&
      /res\.status\(\d{3}\)\.json\(\s*\{[^}]*message/.test(joinHandler),
    "/api/membership/join returns an error response when no recurring checkoutUrl is produced",
  );
  // And the half-created local subscription is rolled back so the customer
  // isn't stuck in a pending state pointing at a checkout that doesn't exist.
  assert(
    /updateMembershipSubscription\([^)]*\{[^}]*status:\s*["']cancelled["']/s.test(
      joinHandler,
    ),
    "/api/membership/join rolls back the pending subscription on failure",
  );

  // 2) /api/membership/retry-payment — recurring only.
  const retryHandler = extractHandler(
    source,
    `app.post("/api/membership/retry-payment", customerAuth`,
  );
  assert(
    !retryHandler.includes("createMembershipCheckoutLink"),
    "/api/membership/retry-payment never calls createMembershipCheckoutLink (one-time)",
  );
  assert(
    retryHandler.includes("createSubscriptionCheckoutLink"),
    "/api/membership/retry-payment uses createSubscriptionCheckoutLink (recurring)",
  );

  // 3) /api/staff/membership/payment-link — recurring only.
  const staffHandler = extractHandler(
    source,
    `app.post("/api/staff/membership/payment-link", staffAuth`,
  );
  assert(
    !staffHandler.includes("createMembershipCheckoutLink"),
    "/api/staff/membership/payment-link never calls createMembershipCheckoutLink (one-time)",
  );
  assert(
    staffHandler.includes("createSubscriptionCheckoutLink"),
    "/api/staff/membership/payment-link uses createSubscriptionCheckoutLink (recurring)",
  );

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

run();
