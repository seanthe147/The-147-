import { randomBytes } from "node:crypto";
import { storage } from "./storage";
import * as square from "./square";
import type { MembershipPlan, MembershipSubscription, Customer } from "@shared/schema";

export interface ParsedRow {
  email: string;
  name: string;
  phone?: string;
  planHint?: string;
  nextBillingDate?: string;
  externalRef?: string;
  raw: Record<string, string>;
}

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: Array<{ email: string; reason: string }>;
  rows: Array<{ email: string; subscriptionId: number; planId: number; status: string }>;
}

// ── CSV parsing (handles quoted fields, simple) ──────────────────────────────
export function parseCsv(text: string): ParsedRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  const headers = splitLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const rows: ParsedRow[] = [];

  // Heuristic header matchers (Wix CSV exports use slightly different column names)
  const findIdx = (...keys: string[]) => headers.findIndex(h => keys.some(k => h === k || h.includes(k)));
  const idxEmail = findIdx("email", "memberemail", "contactemail");
  const idxName = findIdx("name", "fullname", "membername", "firstname");
  const idxLast = headers.findIndex(h => h === "lastname" || h === "surname");
  const idxPhone = findIdx("phone", "phonenumber", "mobile");
  const idxPlan = findIdx("plan", "planname", "pricingplan", "membershipplan", "subscription");
  const idxDate = findIdx("nextbilling", "nextpayment", "renewaldate", "expirydate", "nextcharge");
  const idxRef = findIdx("subscriptionid", "orderid", "memberid", "externalid");

  if (idxEmail < 0) {
    throw new Error("CSV is missing an Email column");
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = cells[idx] ?? ""; });

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
      phone: idxPhone >= 0 ? (cells[idxPhone] || "").trim() || undefined : undefined,
      planHint: idxPlan >= 0 ? (cells[idxPlan] || "").trim() || undefined : undefined,
      nextBillingDate: idxDate >= 0 ? normaliseDate(cells[idxDate]) : undefined,
      externalRef: idxRef >= 0 ? (cells[idxRef] || "").trim() || undefined : undefined,
      raw,
    });
  }
  return rows;
}

function normaliseDate(input?: string): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (!s) return undefined;
  // ISO already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // dd/mm/yyyy or dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo}-${d}`;
  }
  // Fallback to Date parser
  const t = Date.parse(s);
  if (!isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return undefined;
}

export function makeMigrationToken(): string {
  return randomBytes(18).toString("base64url");
}

// ── Plan resolution ──────────────────────────────────────────────────────────
export function resolvePlanId(
  hint: string | undefined,
  defaultPlanId: number,
  planMap: Record<string, number>,
  plans: MembershipPlan[],
): number {
  if (!hint) return defaultPlanId;
  const key = hint.toLowerCase().trim();
  if (planMap[key]) return planMap[key];
  const direct = plans.find(p => p.name.toLowerCase() === key);
  if (direct) return direct.id;
  const partial = plans.find(p => key.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(key));
  if (partial) return partial.id;
  return defaultPlanId;
}

// ── Bulk import ──────────────────────────────────────────────────────────────
export async function importWixMembers(opts: {
  rows: ParsedRow[];
  defaultPlanId: number;
  planMap: Record<string, number>;
}): Promise<ImportResult> {
  // De-duplicate by email (keep last occurrence — usually the most recent record from the export)
  const seen = new Map<string, ParsedRow>();
  for (const r of opts.rows) seen.set(r.email.toLowerCase(), r);
  const dedupedRows = Array.from(seen.values());
  const result: ImportResult = { total: dedupedRows.length, created: 0, updated: 0, skipped: [], rows: [] };
  const plans = await storage.getMembershipPlans();

  for (const row of dedupedRows) {
    try {
      const planId = resolvePlanId(row.planHint, opts.defaultPlanId, opts.planMap, plans);
      if (!plans.find(p => p.id === planId)) {
        result.skipped.push({ email: row.email, reason: "No matching plan" });
        continue;
      }

      // Find or create the customer. Use a non-bcrypt sentinel as the password
      // hash so the account is locked out of password login until they reset it.
      let customer = await storage.getCustomerByEmail(row.email);
      if (!customer) {
        const lockedHash = "!MIGRATED_NO_PASSWORD_" + makeMigrationToken();
        customer = await storage.createCustomer(row.email, row.name, row.phone || null, lockedHash);
      }

      // Existing subscription? Don't trample over an active non-imported one.
      const existing = await storage.getMembershipSubscriptionByCustomer(customer.id).catch(() => null);
      if (existing && existing.status === "active" && existing.source !== "wix_import" && existing.source !== "wix_migrated") {
        result.skipped.push({ email: row.email, reason: "Already has an active membership on this system" });
        continue;
      }
      const today = new Date().toISOString().slice(0, 10);
      const periodEnd = row.nextBillingDate || (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        return d.toISOString().slice(0, 10);
      })();

      // Re-import of same row: keep the existing token so any email already sent stays valid.
      const token = (existing && existing.migrationToken) || makeMigrationToken();

      if (existing) {
        await storage.updateMembershipSubscription(existing.id, {
          planId,
          status: existing.migrationCompletedAt ? existing.status : "active",
          currentPeriodEnd: periodEnd,
          source: existing.migrationCompletedAt ? existing.source : "wix_import",
          migrationToken: token,
          legacyExternalRef: row.externalRef ?? null,
        } as any);
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
          legacyExternalRef: row.externalRef ?? null,
        } as any);
        result.created++;
        result.rows.push({ email: row.email, subscriptionId: sub.id, planId, status: "created" });
      }
    } catch (err: any) {
      result.skipped.push({ email: row.email, reason: err?.message || "Unknown error" });
    }
  }
  return result;
}

// ── Migration email content ──────────────────────────────────────────────────
export function buildMigrationEmail(opts: {
  name: string;
  plan: MembershipPlan;
  migrateUrl: string;
}): { subject: string; html: string } {
  const firstName = opts.name.split(/\s+/)[0] || "there";
  const priceMonthly = `£${(opts.plan.priceMonthly / 100).toFixed(2)}`;
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
        <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#333">We've moved our membership system from our old website over to a brand new app and member dashboard — packed with new perks like priority booking, in-app ordering and loyalty points.</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#333">Your <strong>${escapeHtml(opts.plan.name)}</strong> membership has been moved across at the same price you pay today (<strong>${priceMonthly}/month</strong>) — all your benefits are already active. The only thing we need from you is to set up your card on the new system, since for security reasons we can't transfer your old card details.</p>
        <p style="margin:0 0 28px;font-size:15px;line-height:1.55;color:#333">It only takes about a minute. Apple Pay and Google Pay are supported.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr><td style="border-radius:10px;background:#d4af37">
          <a href="${opts.migrateUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#0a0a0a;text-decoration:none;border-radius:10px">Set up my card →</a>
        </td></tr></table>
        <p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:#777">If the button doesn't work, copy this link into your browser:<br/><a href="${opts.migrateUrl}" style="color:#7a6a2e;word-break:break-all">${opts.migrateUrl}</a></p>
      </td></tr>
      <tr><td style="padding:20px 32px 32px;border-top:1px solid #ececec;font-size:12px;color:#999;line-height:1.5">
        Questions? Just reply to this email — a real person will get back to you.<br/>
        <strong style="color:#666">The 147 Bradford</strong> · Family-friendly snooker, pool &amp; darts venue.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  return { subject, html };
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Public migration landing page ────────────────────────────────────────────
export function renderMigrationLandingPage(opts: {
  customer: Customer;
  plan: MembershipPlan;
  sub: MembershipSubscription;
  alreadyDone: boolean;
  token: string;
}): string {
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
    <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.55">Your membership has already been moved across — we just need you to set up your card so we can take next month's payment on <strong>${renews}</strong>.</p>
    <div style="background:#faf6e8;border:1px solid #e8dcb1;border-radius:12px;padding:18px 20px;margin:0 0 26px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#7a6a2e;margin-bottom:6px">Your plan</div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="font-size:19px;font-weight:700;color:#0a0a0a">${planName}</div>
        <div style="font-size:18px;font-weight:700;color:#0a0a0a">£${priceMonthly}<span style="font-size:13px;font-weight:500;color:#888">/month</span></div>
      </div>
    </div>
    <button id="migrateBtn" style="width:100%;padding:15px;background:#d4af37;color:#0a0a0a;border:0;border-radius:12px;font-weight:700;font-size:15px;cursor:pointer">Set up my card with Square →</button>
    <div id="migrateErr" style="display:none;margin-top:14px;padding:12px;background:#fef0f0;border:1px solid #f5c2c2;border-radius:8px;color:#a02525;font-size:13px"></div>
    <p style="margin:22px 0 0;font-size:12px;color:#888;line-height:1.5;text-align:center">Payment is processed securely by Square. We never see or store your card details. Apple Pay and Google Pay are supported.</p>
    <script>
      document.getElementById('migrateBtn').addEventListener('click', async function(){
        var btn=this; var err=document.getElementById('migrateErr');
        btn.disabled=true; btn.textContent='Loading…'; err.style.display='none';
        try{
          var r=await fetch(${JSON.stringify(`/api/migrate/${opts.token}/checkout`)},{method:'POST'});
          var d=await r.json();
          if(!r.ok||!d.checkoutUrl)throw new Error(d.message||'Could not start checkout');
          window.location.href=d.checkoutUrl;
        }catch(e){
          err.textContent=e.message||'Something went wrong. Please try again.';
          err.style.display='block';
          btn.disabled=false; btn.textContent='Set up my card with Square →';
        }
      });
    </script>
  `);
}

export function renderMigrationErrorPage(message: string): string {
  return wrapMigrationPage(`
    <div style="text-align:center">
      <h1 style="margin:0 0 12px;font-size:22px">Link not valid</h1>
      <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.5">${escapeHtml(message)}</p>
      <p style="margin:0;font-size:13px;color:#888">If you think this is a mistake, please reply to the email we sent you and we'll sort it out.</p>
    </div>
  `);
}

function wrapMigrationPage(inner: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Activate your membership · The 147 Bradford</title>
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
