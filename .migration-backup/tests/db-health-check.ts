import pg from "pg";

const REQUIRED_TABLES = [
  "bookings",
  "customers",
  "staff_users",
  "events",
  "offers",
  "banner_images",
  "push_tokens",
  "site_settings",
  "contact_messages",
];

async function checkDatabaseHealth() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log("Database Health Check");
  console.log("====================\n");

  let allPassed = true;

  for (const table of REQUIRED_TABLES) {
    try {
      const result = await client.query(`SELECT count(*) as cnt FROM ${table}`);
      const count = result.rows[0].cnt;
      console.log(`✓ ${table}: ${count} rows`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`✗ ${table}: ERROR - ${message}`);
      allPassed = false;
    }
  }

  await client.end();
  console.log("\n" + (allPassed ? "All tables healthy ✓" : "Some tables have issues ✗"));
  process.exit(allPassed ? 0 : 1);
}

checkDatabaseHealth();
