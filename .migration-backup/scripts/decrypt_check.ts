import { decrypt } from '../server/encryption';
import pg from 'pg';
(async () => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query(`SELECT id, email, name, phone, email_hash, email_verified, square_customer_id FROM customers ORDER BY id`);
  console.log('=== DECRYPTED app customers ===');
  for (const row of r.rows) {
    let email='?',name='?',phone='?';
    try{ email = decrypt(row.email); }catch(e:any){ email='DECRYPT_FAIL'; }
    try{ name = decrypt(row.name); }catch(e:any){ name='DECRYPT_FAIL'; }
    try{ if(row.phone) phone = decrypt(row.phone); }catch(e:any){}
    console.log(`id=${row.id} | name="${name}" | email="${email}" | phone="${phone}" | verified=${row.email_verified} | sqId=${row.square_customer_id||'—'}`);
  }
  console.log('\n=== Name search for turner/bond/holden/jon/john/jackie ===');
  const allNames = r.rows.map((x:any) => { try { return decrypt(x.name).toLowerCase(); } catch { return ''; } });
  ['turner','bond','holden','jon','john','jackie'].forEach(needle => {
    const hits = allNames.filter((n:string) => n.includes(needle));
    console.log(`  "${needle}": ${hits.length} matches${hits.length ? ' → ' + hits.join(', ') : ''}`);
  });
  await c.end();
})();
