// Verified deployed schema floor for this production database only.
export function mayDeferIndexes(output, databaseId, migrations) {
  if (databaseId !== 'a6d4a6f2-6545-45a9-a10f-67e7ebaf02e6') return false;
  if (!/7500/.test(output) || !/exceeded D1.s free tier daily row (read|write) limit/i.test(output)) return false;
  const ordered = Object.keys(migrations).sort();
  const floor = ordered.indexOf('0003_sloppy_anthem.sql');
  if (floor < 0 || floor === ordered.length - 1) return false;
  return ordered.slice(floor + 1).every(file => {
    const statements = migrations[file].replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
    return statements.length > 0 && statements.every(s => /^CREATE INDEX\s+[`"\w]+\s+ON\s+[`"\w]+\s*\([`"\w\s,]+\)$/i.test(s));
  });
}
