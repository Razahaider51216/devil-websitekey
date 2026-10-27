"""Verify the actual migration removes full-table scans without modifying keys or progress."""
import sqlite3
from pathlib import Path
db=sqlite3.connect(':memory:')
files=sorted(Path('drizzle').glob('*.sql'))
for file in files:
    if file.name.startswith('0004_'):break
    db.executescript(file.read_text())
db.executemany('INSERT INTO flows VALUES(?,?,?)',[(str(i),1,999999)for i in range(2000)])
db.executemany('INSERT INTO steps VALUES(?,?,?,?,?,?)',[(str(i),str(i//4),i%4+1,1,2,'hash')for i in range(8000)])
db.execute("INSERT INTO access_keys VALUES('key','0','key-hash','kept','steps',1,999999,NULL,'hours',24)")
def plan(sql):return ' '.join(str(r[-1])for r in db.execute('EXPLAIN QUERY PLAN '+sql))
assert 'SCAN steps' in plan("SELECT * FROM steps WHERE flow_id='42'")
before=list(db.execute('SELECT * FROM access_keys')),list(db.execute('SELECT * FROM steps WHERE flow_id=\'0\''))
db.executescript(next(f for f in files if f.name.startswith('0004_')).read_text())
assert 'steps_flow_id_idx' in plan("SELECT * FROM steps WHERE flow_id='42'")
assert 'rate_limits_expires_at_idx' in plan('DELETE FROM rate_limits WHERE expires_at < 100')
assert 'access_keys_created_at_idx' in plan('SELECT * FROM access_keys ORDER BY created_at DESC LIMIT 200')
assert before==(list(db.execute('SELECT * FROM access_keys')),list(db.execute('SELECT * FROM steps WHERE flow_id=\'0\'')))
print('PASS indexed step lookup, rate cleanup and recent-key ordering; existing keys and completed steps retained')
