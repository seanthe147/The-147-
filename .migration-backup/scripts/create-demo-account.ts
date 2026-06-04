/**
 * Create (or refresh) the App Store reviewer demo customer account.
 *
 * - Creates a customer with a fixed email + password.
 * - Sets `expires_at` to NOW + 48 hours so the account auto-disables.
 * - Idempotent: re-running resets the password and extends the expiry.
 *
 * Usage:
 *   npx tsx scripts/create-demo-account.ts                      # default 48h
 *   npx tsx scripts/create-demo-account.ts --hours 72           # custom expiry
 *   npx tsx scripts/create-demo-account.ts --email x@y --password Pw
 */
import "dotenv/config";
import { Pool } from "pg";
import { encrypt, hashEmail, hashPassword } from "../server/encryption";

function parseArgs(): { email: string; password: string; hours: number; name: string } {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  return {
    email: get("--email", "appreview@the147bradford.com"),
    password: get("--password", "Reviewer147!"),
    name: get("--name", "App Review"),
    hours: parseInt(get("--hours", "48"), 10),
  };
}

async function main() {
  const { email, password, name, hours } = parseArgs();
  if (!email || !password || !Number.isFinite(hours) || hours <= 0) {
    console.error("Invalid arguments");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  const emailHash = hashEmail(email);
  const { hash, salt } = hashPassword(password);
  const passwordHash = `${salt}:${hash}`;
  const encName = encrypt(name);
  const encEmail = encrypt(email);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const existing = await pool.query<{ id: number }>(
      `SELECT id FROM customers WHERE email_hash = $1 LIMIT 1`,
      [emailHash],
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE customers
           SET name = $1,
               email = $2,
               password_hash = $3,
               email_verified = true,
               privacy_consent_at = NOW(),
               expires_at = $4
         WHERE id = $5`,
        [encName, encEmail, passwordHash, expiresAt, existing.rows[0].id],
      );
      console.log("Refreshed existing demo account.");
    } else {
      await pool.query(
        `INSERT INTO customers
           (name, email, email_hash, password_hash, email_verified, privacy_consent_at, expires_at)
         VALUES ($1, $2, $3, $4, true, NOW(), $5)`,
        [encName, encEmail, emailHash, passwordHash, expiresAt],
      );
      console.log("Created new demo account.");
    }

    // Refuse to print plaintext credentials in production. This script is
    // intended for local/dev use only — running it against the production
    // database would leak the demo account password into the deploy logs
    // (and into anything that aggregates them). Force-allow with
    // ALLOW_DEMO_CREDENTIALS_PRINT=1 when you really need to.
    const isProd = process.env.NODE_ENV === "production";
    const explicitOverride = process.env.ALLOW_DEMO_CREDENTIALS_PRINT === "1";
    if (isProd && !explicitOverride) {
      console.log("");
      console.log("Demo account created. Credentials NOT printed because NODE_ENV=production.");
      console.log("If you really need to print them, re-run with ALLOW_DEMO_CREDENTIALS_PRINT=1.");
      console.log("Email: " + email);
      console.log("Password: <redacted — set in DEMO_ACCOUNT_PASSWORD env var or use the override>");
      console.log("Expires: " + expiresAt.toISOString() + "  (" + hours + "h from now)");
    } else {
      console.log("");
      console.log("================ DEMO CREDENTIALS ================");
      console.log("Email:    " + email);
      console.log("Password: " + password);
      console.log("Expires:  " + expiresAt.toISOString() + "  (" + hours + "h from now)");
      console.log("==================================================");
      console.log("");
      console.log("After expiry, login is rejected with 401 \"This account has expired.\"");
      console.log("Re-run this script to extend the window.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
