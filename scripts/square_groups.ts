(async () => {
  const token = process.env.SQUARE_ACCESS_TOKEN!;
  const base = 'https://connect.squareup.com';
  const headers = { Authorization: `Bearer ${token}`, 'Square-Version': '2024-04-17', 'Content-Type': 'application/json' };

  const byId: Record<string, string> = {};
  let cursor: string | undefined;
  console.log('=== ALL Square customer groups ===');
  do {
    const url = `${base}/v2/customer-groups?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const g: any = await (await fetch(url, { headers })).json();
    if (g.errors) { console.log('ERR', JSON.stringify(g.errors)); break; }
    for (const grp of g.groups || []) { byId[grp.id] = grp.name; console.log(`  ${grp.id}  →  ${grp.name}`); }
    cursor = g.cursor;
  } while (cursor);

  for (const email of ['john.bond@yorkshirewater.co.uk', 'wukkar@gmail.com']) {
    const r: any = await (await fetch(`${base}/v2/customers/search`, {
      method: 'POST', headers,
      body: JSON.stringify({ query: { filter: { email_address: { exact: email } } } })
    })).json();
    console.log(`\n=== ${email} ===`);
    for (const c of r.customers || []) {
      console.log(`  ${c.given_name} ${c.family_name}`);
      for (const gid of c.group_ids || []) console.log(`    group: ${gid}  (${byId[gid] || 'UNKNOWN'})`);
    }
  }

  // Also list the app's membership_plans rows so we can compare names + Square group IDs.
  const pg = (await import('pg')).default;
  const cli = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await cli.connect();
  const plans = await cli.query(`SELECT id, name, tier, square_customer_group_id, hide_from_signup, active FROM membership_plans ORDER BY id`);
  console.log('\n=== App membership_plans rows ===');
  for (const p of plans.rows) console.log(`  plan #${p.id} "${p.name}" tier=${p.tier} squareGroup=${p.square_customer_group_id || '(none)'} hideFromSignup=${p.hide_from_signup} active=${p.active}`);
  await cli.end();
})();
