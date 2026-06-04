(async () => {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  const env = process.env.SQUARE_ENVIRONMENT || 'production';
  const base = env === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
  console.log(`Square env: ${env}, token: ${token ? 'present' : 'MISSING'}`);
  if (!token) return;

  for (const email of ['john.bond@yorkshirewater.co.uk', 'wukkar@gmail.com']) {
    console.log(`\n=== Square customer search: ${email} ===`);
    const r = await fetch(`${base}/v2/customers/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Square-Version': '2024-04-17' },
      body: JSON.stringify({ query: { filter: { email_address: { exact: email } } } })
    });
    const j: any = await r.json();
    if (!j.customers || j.customers.length === 0) {
      console.log('  ZERO matches in Square');
      continue;
    }
    for (const c of j.customers) {
      console.log(`  Square id=${c.id}`);
      console.log(`    name: ${c.given_name || ''} ${c.family_name || ''}`);
      console.log(`    email: ${c.email_address}`);
      console.log(`    created: ${c.created_at}`);
      console.log(`    groups: ${(c.group_ids || []).join(', ') || '(none)'}`);
      console.log(`    note: ${c.note || ''}`);
    }
  }
})();
