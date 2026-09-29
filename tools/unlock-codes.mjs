// Make new unlock codes for the web demo (or revoke one). The codes are printed once; only their hashes go into
// src/game/unlock-codes.json, so keep the printed list somewhere safe.
//   node tools/unlock-codes.mjs 10          -> 10 new codes
//   node tools/unlock-codes.mjs --revoke ABCDE
import { createHash, randomInt } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'src/game/unlock-codes.json';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const hash = (code) => createHash('sha256').update(`planet-escape:${code}`).digest('hex');
const data = JSON.parse(readFileSync(FILE, 'utf8'));

if (process.argv[2] === '--revoke') {
  const code = String(process.argv[3] ?? '').toUpperCase();
  const before = data.hashes.length;
  data.hashes = data.hashes.filter((h) => h !== hash(code));
  console.log(before === data.hashes.length ? `${code}: not a known code` : `${code}: revoked`);
} else {
  const n = Math.max(1, Math.min(500, Number(process.argv[2]) || 10));
  const made = [];
  while (made.length < n) {
    let code = '';
    for (let i = 0; i < 5; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    if (data.hashes.includes(hash(code)) || made.includes(code)) continue;
    made.push(code);
    data.hashes.push(hash(code));
  }
  console.log(made.join('\n'));
}
writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`${data.hashes.length} codes valid`);
