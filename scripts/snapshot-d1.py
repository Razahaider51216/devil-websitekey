"""Convert a trusted Wrangler SQL export into a portable, private snapshot."""
import json
import sqlite3
import sys
from pathlib import Path

TABLES = ['flows', 'access_keys', 'steps', 'rate_limits', 'site_settings', 'key_devices', 'flow_verifications']

if len(sys.argv) != 3:
    raise SystemExit('Usage: python scripts/snapshot-d1.py backups/d1.sql backups/snapshot.json')
target = Path(sys.argv[2])
if target.exists():
    raise SystemExit('Refusing to overwrite an existing backup')
with sqlite3.connect(':memory:') as db:
    db.executescript(Path(sys.argv[1]).read_text(encoding='utf-8'))
    data = {}
    for table in TABLES:
        cursor = db.execute(f'SELECT * FROM "{table}" ORDER BY 1')
        columns = [column[0] for column in cursor.description]
        data[table] = {'columns': columns, 'rows': cursor.fetchall()}
    if db.execute('PRAGMA foreign_key_check').fetchall():
        raise SystemExit('Source foreign key check failed; no snapshot created')
target.parent.mkdir(parents=True, exist_ok=True)
with target.open('x', encoding='utf-8') as output:
    json.dump({'format': 'devil-key-d1-v1', 'tables': data}, output, ensure_ascii=False)
print('Snapshot created. Keep it private; it contains key and device hashes.')
for table, content in data.items():
    print(f'{table}: {len(content["rows"])} rows')
