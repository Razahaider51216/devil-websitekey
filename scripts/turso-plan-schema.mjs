import { createClient } from '@libsql/client';
import { pathToFileURL } from 'node:url';
// Additive only: old Workers continue reading their existing fields during rollout.
export async function ensurePlanSchema(db) {
  const columns = (await db.execute('PRAGMA table_info(flows)')).rows;
  if (!['id', 'created_at', 'expires_at'].every(name => columns.some(column => column.name === name))) throw new Error('Unexpected flows schema; no changes made');
  const plan = columns.find(column => column.name === 'plan');
  if (plan) {
    if (String(plan.type).toUpperCase() !== 'TEXT') throw new Error('Unexpected plan column type');
    return false;
  }
  await db.execute('ALTER TABLE flows ADD COLUMN plan text');
  return true;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.TURSO_DATABASE_URL?.startsWith('libsql://') || !process.env.TURSO_AUTH_TOKEN) throw new Error('Turso credentials required');
  const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  try { console.log(JSON.stringify({ schema: 'key-plans-v1', addedColumn: await ensurePlanSchema(db) })); }
  finally { db.close(); }
}
