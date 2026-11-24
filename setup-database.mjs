import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Rayomand runs against a PostgreSQL server you already have. This script only
// prepares the connection file and verifies the server is reachable; it never
// pulls images or starts containers.

if (!fs.existsSync('.env')) {
  const password = randomBytes(32).toString('hex');
  const token = randomBytes(32).toString('hex');
  const mailSecret = randomBytes(32).toString('hex');
  fs.writeFileSync('.env', `POSTGRES_DB=noma\nPOSTGRES_USER=noma\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_PORT=5432\nDATABASE_URL=postgresql://noma:${password}@127.0.0.1:5432/noma\nSETUP_TOKEN=${token}\nMAIL_SESSION_SECRET=${mailSecret}\nMAIL_SMTP_PORT=25\nMAIL_SUBMISSION_PORT=587\nMAIL_SMTPS_PORT=465\nMAIL_IMAP_PORT=143\nMAIL_IMAPS_PORT=993\nMAIL_POP3_PORT=110\nMAIL_POP3S_PORT=995\n`, { mode: 0o600, flag: 'wx' });
  console.log('Created private .env. Edit DATABASE_URL if your PostgreSQL server uses different credentials.');
  console.log('Use SETUP_TOKEN from that file to create your first owner in the app.');
}

const url = (() => {
  try {
    const text = fs.readFileSync('.env', 'utf8');
    const line = text.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
    return line ? line.slice('DATABASE_URL='.length).trim() : '';
  } catch {
    return '';
  }
})();

if (!url) {
  console.error('DATABASE_URL is missing from .env. Set it to your PostgreSQL connection string.');
  process.exit(1);
}

let host = '127.0.0.1';
let port = '5432';
try {
  const parsed = new URL(url);
  host = parsed.hostname || host;
  port = parsed.port || port;
} catch {
  console.error('DATABASE_URL is not a valid postgresql:// URL.');
  process.exit(1);
}

// `pg_isready` ships with PostgreSQL client tools; it is the quickest native
// reachability check. If it is not on PATH we simply report the target.
const ready = spawnSync('pg_isready', ['-h', host, '-p', port], { stdio: 'pipe', shell: false, encoding: 'utf8' });
if (ready.error) {
  console.log(`PostgreSQL target: ${host}:${port}`);
  console.log('pg_isready was not found on PATH; start your PostgreSQL server, then run "npm run dev".');
  process.exit(0);
}
if (ready.status !== 0) {
  console.error(`PostgreSQL is not accepting connections at ${host}:${port}.`);
  console.error('Start the server (for example: pg_ctl start, or your system service), then retry.');
  process.exit(ready.status ?? 1);
}

console.log(`PostgreSQL is reachable at ${host}:${port}. Schema migrations run automatically on first request.`);
