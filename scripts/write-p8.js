const fs = require('fs');
const path = '/tmp/AuthKey_PRH75PPG5Z.p8';
let content = process.env.ASC_KEY_P8 || '';
if (!content.includes('BEGIN PRIVATE KEY')) {
  content = '-----BEGIN PRIVATE KEY-----\n' + content.trim() + '\n-----END PRIVATE KEY-----\n';
}
fs.writeFileSync(path, content, { mode: 0o600 });
console.log('✓ .p8 file written to', path);
console.log('First line:', content.split('\n')[0]);
