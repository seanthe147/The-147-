import { decrypt } from '../server/encryption';
import pg from 'pg';
(async () => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const r = await c.query(`SELECT id, customer_name, customer_email, customer_phone, date, start_time AS time, email_hash AS customer_email_hash, created_at FROM bookings ORDER BY id`);
  console.log(`=== ALL ${r.rows.length} bookings — decrypted names/emails ===`);
  const customers = await c.query(`SELECT id, email_hash FROM customers`);
  const customerHashes = new Set(customers.rows.map((x:any) => x.email_hash));

  const allNames:string[] = [];
  const allEmails:string[] = [];
  let orphanedBookings = 0;
  for (const b of r.rows) {
    let name='?', email='?';
    try{ name = decrypt(b.customer_name); allNames.push(name); }catch{}
    try{ email = decrypt(b.customer_email); allEmails.push(email); }catch{}
    const hasMatchingCustomer = b.customer_email_hash && customerHashes.has(b.customer_email_hash);
    if (b.customer_email_hash && !hasMatchingCustomer) orphanedBookings++;
    // Print every booking compactly
    console.log(`  #${b.id} "${name}" <${email}> ${b.date} ${b.time} | hashMatchesCustomer=${hasMatchingCustomer ? 'yes' : (b.customer_email_hash ? 'NO (orphaned)' : '(no hash)')}`);
  }

  console.log(`\n=== Bookings with email_hash NOT matching any current customer row: ${orphanedBookings} ===`);
  console.log('(orphan = customer deleted but booking remains, OR guest booking with no account)');

  console.log('\n=== Search booking names + emails for: turner, bond, holden, jon, john, jackie ===');
  const haystack = allNames.concat(allEmails).map(s => s.toLowerCase());
  for (const needle of ['turner','bond','holden','jon','john','jackie']) {
    const hits = haystack.filter(s => s.includes(needle));
    console.log(`  "${needle}": ${hits.length}${hits.length ? ' → ' + hits.slice(0,5).join(' | ') : ''}`);
  }

  // Also check app_orders for the same
  try {
    const o = await c.query(`SELECT id, customer_name, customer_email, customer_email_hash FROM app_orders ORDER BY id`);
    console.log(`\n=== app_orders: ${o.rows.length} rows ===`);
    let orphOrders = 0;
    const oNames:string[] = [];
    for (const row of o.rows) {
      let name='?', email='?';
      try{ name = decrypt(row.customer_name); oNames.push(name); }catch{}
      try{ email = decrypt(row.customer_email); }catch{}
      if (row.customer_email_hash && !customerHashes.has(row.customer_email_hash)) orphOrders++;
      console.log(`  order #${row.id} "${name}" <${email}>`);
    }
    console.log(`  orders with no matching customer: ${orphOrders}`);
  } catch (e:any) {
    console.log('app_orders query failed:', e.message);
  }

  await c.end();
})();
