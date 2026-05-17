import { hashEmail, decrypt } from '../server/encryption';
import pg from 'pg';

(async () => {
  const targets = ['wukkar@gmail.com'];
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  for (const email of targets) {
    const h = hashEmail(email);
    console.log(`\n=== ${email} ===`);
    console.log(`hash = ${h}`);

    const cust = await c.query(`SELECT id, email_hash, created_at FROM customers WHERE email_hash=$1`, [h]);
    console.log(`customers match: ${cust.rows.length}`, cust.rows);

    const bk = await c.query(`SELECT id, date, start_time, status, created_at FROM bookings WHERE email_hash=$1`, [h]);
    console.log(`bookings match (by hash): ${bk.rows.length}`, bk.rows);

    const ord = await c.query(`SELECT id, status, created_at FROM app_orders WHERE customer_email_hash=$1`, [h]);
    console.log(`app_orders match (by hash): ${ord.rows.length}`, ord.rows);

    // Also brute-force decrypt every booking email and compare (in case older bookings
    // pre-date the email_hash backfill)
    const allBk = await c.query(`SELECT id, customer_email FROM bookings`);
    const bkMatches:any[] = [];
    for (const row of allBk.rows) {
      try {
        const dec = decrypt(row.customer_email);
        if (dec && dec.toLowerCase() === email.toLowerCase()) bkMatches.push({id:row.id, decrypted:dec});
      } catch {}
    }
    console.log(`bookings match (decrypt scan): ${bkMatches.length}`, bkMatches);

    const allCust = await c.query(`SELECT id, email FROM customers`);
    const custDec:any[] = [];
    for (const row of allCust.rows) {
      try {
        const dec = decrypt(row.email);
        if (dec && dec.toLowerCase() === email.toLowerCase()) custDec.push({id:row.id, decrypted:dec});
      } catch {}
    }
    console.log(`customers match (decrypt scan): ${custDec.length}`, custDec);

    const allOrd = await c.query(`SELECT id, customer_email FROM app_orders`);
    const ordDec:any[] = [];
    for (const row of allOrd.rows) {
      try {
        if (!row.customer_email) continue;
        const dec = decrypt(row.customer_email);
        if (dec && dec.toLowerCase() === email.toLowerCase()) ordDec.push({id:row.id, decrypted:dec});
      } catch {}
    }
    console.log(`app_orders match (decrypt scan): ${ordDec.length}`, ordDec);
  }

  await c.end();
})();
