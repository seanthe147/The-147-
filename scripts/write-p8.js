const fs = require('fs');
const path = '/tmp/AuthKey_7Q6GZ9HT5V.p8';

let content = process.env.ASC_KEY_P8 || '';

// Strip all headers, whitespace and newlines to get raw base64
const base64 = content
  .replace(/-----BEGIN PRIVATE KEY-----/g, '')
  .replace(/-----END PRIVATE KEY-----/g, '')
  .replace(/\s+/g, '');

// Rebuild proper PEM with 64-char lines
const lines = base64.match(/.{1,64}/g) || [];
const pem = '-----BEGIN PRIVATE KEY-----\n' + lines.join('\n') + '\n-----END PRIVATE KEY-----\n';

fs.writeFileSync(path, pem, { mode: 0o600 });
console.log('✓ .p8 file written to', path);
console.log('First line:', pem.split('\n')[0]);
console.log('Lines:', pem.split('\n').length);
