import { build } from "esbuild";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import pg from "pg";
import path from "node:path";

const cwd = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(cwd, "../..");
const temp = await mkdtemp(path.join(cwd, ".membership-billing-test-"));
const postgres = await mkdtemp(path.join(tmpdir(), "membership-pg-"));
// Do not inherit DATABASE_URL, provider credentials, NODE_OPTIONS or PG settings.
const env = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "LANG", "LD_LIBRARY_PATH"].filter(key => process.env[key])
    .map(key => [key, process.env[key]]),
);
Object.assign(env, {
  NODE_ENV: "test",
  MEMBERSHIP_BILLING_ISOLATED_TEST: "yes",
  ENCRYPTION_KEY: "membership-test-only-not-a-secret",
  SQUARE_ENVIRONMENT: "sandbox",
  SQUARE_ACCESS_TOKEN: "fixture-square-token",
  SQUARE_LOCATION_ID: "fixture-square-location",
  DATABASE_URL: `postgresql://membership_test@localhost/membership_billing_test?host=${encodeURIComponent(postgres)}`,
});
const bin = name => process.env.MEMBERSHIP_TEST_PG_BIN
  ? path.join(process.env.MEMBERSHIP_TEST_PG_BIN, name) : name;
async function run(command, args, directory = cwd) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: directory, stdio: "inherit", env });
    child.once("error", reject);
    child.once("exit", code => resolve(code ?? 1));
  });
  if (code !== 0) throw new Error(`${path.basename(command)} failed with exit code ${code}`);
}
let started = false;
try {
  await run(bin("initdb"), ["-D", path.join(postgres, "data"), "-U", "membership_test", "--auth=trust", "--no-locale"]);
  // Private Unix socket only: no listening TCP port and no access to the app DB.
  await run(bin("pg_ctl"), ["-D", path.join(postgres, "data"), "-l", path.join(postgres, "server.log"),
    "-o", `-k ${postgres} -c listen_addresses=''`, "-w", "start"]);
  started = true;
  await run(bin("createdb"), ["-h", postgres, "-U", "membership_test", "membership_billing_test"]);
  await run("pnpm", ["--filter", "@workspace/db", "run", "push"], workspace);
  const seed = new pg.Client({ connectionString: env.DATABASE_URL });
  try {
    await seed.connect();
    // Only synthetic catalog rows; migrations require an existing Platinum plan.
    await seed.query(`INSERT INTO membership_plans (name, tier, price_monthly, price_annual)
      VALUES ('Platinum', 'platinum', 699, 6500), ('Maximum', 'maximum', 1000, 10000)`);
  } finally { await seed.end(); }
  await run(process.execPath, ["--experimental-strip-types", "--test",
    "src/membership-billing-policy.test.ts", "src/platinum-offer-migration.test.ts",
    "src/membership-failure-notifications.test.ts"]);
  for (const entry of ["membership-billing", "membership-square-sync"]) {
  const output = path.join(temp, `${entry}.test.mjs`);
  await build({
    absWorkingDir: cwd, entryPoints: [`src/${entry}.test.ts`], outfile: output,
    bundle: true, platform: "node", format: "esm",
    external: ["express", "pg", "drizzle-orm", "drizzle-zod", "zod"],
  });
  try {
    await run(process.execPath, ["--test", "--test-force-exit", output]);
  } finally {
    // Independent check also catches failed setup/teardown and force-exit leaks.
    const verify = new pg.Client({ connectionString: env.DATABASE_URL });
    try {
      await verify.connect();
      for (const table of ["customers", "membership_subscriptions", "membership_billing_states", "membership_audit_log", "membership_purchase_records", "membership_square_events"]) {
        const result = await verify.query(`SELECT count(*)::int AS count FROM ${table}`);
        if (result.rows[0].count !== 0) throw new Error(`Membership test left fixtures in ${table}`);
      }
      const plans = await verify.query("SELECT count(*)::int AS count FROM membership_plans WHERE tier LIKE 'fixture-%'");
      if (plans.rows[0].count !== 0) throw new Error("Membership test left fixture plans");
      console.log("Membership fixture cleanup verified.");
    } finally { await verify.end(); }
  }
  }
} finally {
  try {
    if (started) await run(bin("pg_ctl"), ["-D", path.join(postgres, "data"), "-m", "immediate", "-w", "stop"]);
  } finally {
    await rm(temp, { recursive: true, force: true });
    await rm(postgres, { recursive: true, force: true });
  }
}
