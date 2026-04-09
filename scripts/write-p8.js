const fs = require('fs');

const keyId = process.env.EXPO_ASC_KEY_ID || 'PRH75PPG5Z';
const path = process.env.EXPO_ASC_API_KEY_PATH || `/tmp/AuthKey_${keyId}.p8`;

let content = process.env.ASC_KEY_P8 || '';

if (!content) {
  console.error('ERROR: ASC_KEY_P8 secret is not set');
  process.exit(1);
}

const base64 = content
  .replace(/-----BEGIN PRIVATE KEY-----/g, '')
  .replace(/-----END PRIVATE KEY-----/g, '')
  .replace(/\s+/g, '');

const lines = base64.match(/.{1,64}/g) || [];
const pem = '-----BEGIN PRIVATE KEY-----\n' + lines.join('\n') + '\n-----END PRIVATE KEY-----\n';

fs.mkdirSync(require('path').dirname(path), { recursive: true });
fs.writeFileSync(path, pem, { mode: 0o600 });
console.log('✓ .p8 file written to', path);
console.log('Key ID:', keyId);
console.log('First line:', pem.split('\n')[0]);
console.log('Lines:', pem.split('\n').length);
