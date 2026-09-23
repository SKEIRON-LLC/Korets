import { randomInt, randomBytes, scryptSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const base = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
const dataDir = process.env.KORETS_DATA_DIR || join(base, 'KoretsMuseum');
const suppliedPin = process.env.KORETS_SETUP_PIN;
if (suppliedPin && !/^\d{6}$/.test(suppliedPin)) {
  throw new Error('KORETS_SETUP_PIN must be exactly six digits.');
}
const pin = suppliedPin || String(randomInt(100000, 1000000));
const salt = randomBytes(16).toString('hex');
const hash = scryptSync(pin, salt, 64).toString('hex');

await mkdir(dataDir, { recursive: true });
await writeFile(join(dataDir, 'admin.json'), JSON.stringify({ salt, hash }), { flag: 'wx' }).catch((error) => {
  if (error.code === 'EEXIST') {
    console.error('Administrator PIN already exists. Existing PIN was not changed.');
    process.exitCode = 1;
    return;
  }
  throw error;
});
if (!process.exitCode) {
  console.log(`Museum staff PIN: ${pin}`);
  console.log('Write it down securely. This number is shown only once.');
}
