// Static guard-rail checks for src/templates/membership-page.html.
// Run: node artifacts/api-server/run-membership-page-check.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const dir = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(dir, "src/templates/membership-page.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const js = scripts.join("\n");
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check("inline scripts parse", () => scripts.forEach(s => new Function(s)));
check("no automatic checkout navigation", () => {
  assert.ok(!/openCheckout\s*\(/.test(js), "openCheckout must not exist");
  assert.ok(!/window\.open\s*\(/.test(js), "no programmatic window.open");
  assert.ok(!/location\.(assign|href\s*=)/.test(js), "no programmatic navigation");
  assert.ok(!/top\.location/.test(js), "no top-frame navigation");
});
check("checkout is an explicit link with visible fallback", () => {
  assert.match(js, /function checkoutLinkHtml/);
  assert.match(html, /id="manualPayHint"/);
  assert.match(js, /not active until Square confirms payment/);
});
check("logout on pagehide, never visibilitychange", () => {
  assert.match(js, /addEventListener\('pagehide'/);
  assert.match(js, /event\.persisted/);
  assert.ok(!/visibilitychange/.test(js));
});
check("no persisted login token", () => {
  assert.ok(!/localStorage\.setItem/.test(js));
});
check("late async responses are ownership-guarded", () => {
  assert.match(js, /function owns\(tok,gen\)/);
  for (const ep of ["/api/membership/cancel", "/api/membership/change-plan", "/api/membership/join",
    "/api/membership/upgrade-checkout", "/api/membership/undo-cancel", "/api/membership/payment-card",
    "/api/membership/enable-auto-renew"]) {
    assert.ok(js.includes(ep), `missing action ${ep}`);
  }
  const guards = (js.match(/owns\(ownerToken,gen\)|owns\(tok,gen\)/g) || []).length;
  assert.ok(guards >= 25, `expected many ownership guards, found ${guards}`);
  assert.match(js, /seq===manageSeq/);
});
check("accessible modal", () => {
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(js, /e\.key==='Escape'/);
  assert.match(js, /e\.key!=='Tab'/);
  assert.match(js, /dialogReturnFocus/);
  assert.match(js, /setAttribute\('inert'/);
  assert.equal((html.match(/class="form-err" id="\w+" role="alert"/g) || []).length, 3);
});
check("compact embedded mode", () => {
  assert.match(html, /classList\.add\('embedded'\)/);
  assert.match(html, /\.embedded \.hero\{/);
});
check("recurring consent preserved", () => {
  for (const id of ["joinTerms", "mTerms", "mCardConsent", "mArTerms", "rConsent"]) assert.ok(html.includes(id), id);
  assert.match(js, /minimumTermAccepted:true|minimumTermAccepted=true/);
});
check("no emoji", () => assert.ok(!/\p{Extended_Pictographic}/u.test(html.replace(/[✓✦◷↗▣∞]/g, ""))));

let failed = 0;
for (const [name, fn] of checks) {
  try { fn(); console.log("ok  ", name); } catch (e) { failed++; console.log("FAIL", name, "-", e.message); }
}
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log("membership page checks passed");
