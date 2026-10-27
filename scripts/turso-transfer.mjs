import { createClient } from '@libsql/client';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const tables = ['flows', 'access_keys', 'steps', 'rate_limits', 'site_settings', 'key_devices', 'flow_verifications'];
const quote = name => '"' + name.replaceAll('"', '""') + '"';
function canonical(rows) {
  return JSON.stringify(rows.map(row => Array.from(row)).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'en')));
}
export function digest(rows) { return createHash('sha256').update(canonical(rows)).digest('hex'); }

async function compare(db, snapshot) {
  const counts = {};
  for (const table of tables) {
    const source = snapshot.tables[table];
    const result = await db.execute(`SELECT ${source.columns.map(quote).join(',')} FROM ${quote(table)}`);
    if (digest(result.rows) !== digest(source.rows)) throw new Error(`Data mismatch in ${table}`);
    counts[table] = source.rows.length;
  }
  if ((await db.execute('PRAGMA foreign_key_check')).rows.length) throw new Error('Target foreign key check failed');
  return counts;
}

export async function transfer(db, snapshot, action) {
  if (!['import', 'verify'].includes(action)) throw new Error('Expected import or verify');
  if (snapshot.format !== 'devil-key-d1-v1' || tables.some(t => !snapshot.tables?.[t])) throw new Error('Incomplete source snapshot');
  for (const table of tables) {
    const { columns, rows } = snapshot.tables[table];
    if (!Array.isArray(columns) || columns.some(c => !/^[a-z_]+$/.test(c)) || !Array.isArray(rows) || rows.some(r => r.length !== columns.length)) throw new Error(`Invalid snapshot: ${table}`);
  }
  if (action === 'verify') return compare(db, snapshot);
  // Never overwrite or merge an existing target: a second import could undo revocations/HWID bindings.
  const existing = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  if (existing.rows.length) throw new Error('Target must be empty; refusing to overwrite existing data');
  const tx = await db.transaction('write');
  try {
    for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(n => n.endsWith('.sql')).sort()) {
      const sql = readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8');
      for (const statement of sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await tx.execute(statement);
    }
    for (const table of tables) {
      const { columns, rows } = snapshot.tables[table];
      // Validate exact columns before inserting, even for an empty source table.
      const actual = await tx.execute(`PRAGMA table_info(${quote(table)})`);
      if (JSON.stringify(actual.rows.map(r => r.name)) !== JSON.stringify(columns)) throw new Error(`Schema mismatch: ${table}`);
      const sql = `INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
      for (let i = 0; i < rows.length; i += 100) await tx.batch(rows.slice(i, i + 100).map(args => ({ sql, args })));
    }
    const counts = await compare(tx, snapshot);
    await tx.commit();
    return counts;
  } catch (error) { await tx.rollback(); throw error; }
  finally { tx.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [action, filename] = process.argv.slice(2);
  if (!filename || !process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) throw new Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN; usage: node scripts/turso-transfer.mjs import|verify backups/snapshot.json');
  const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN, intMode: 'number' });
  try {
    const counts = await transfer(client, JSON.parse(readFileSync(filename, 'utf8')), action);
    console.log('All seven tables match, including key hashes, expiry, revocations, HWID and settings.', counts);
  } catch { console.error('Transfer failed. Target has not been approved for cutover. Check source snapshot, empty target, and credentials.'); process.exitCode = 1; }
  finally { client.close(); }
}
