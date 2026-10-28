"""Explicit live delivery smoke test. Creates and removes only one temporary test key.
Run manually; excluded from the offline npm test suite. Never prints keys or tickets.
"""
from pathlib import Path
import concurrent.futures, hashlib, json, os, re, secrets, time, urllib.request, urllib.error, uuid

root = Path(__file__).resolve().parents[1]
text = (root / '.env.cloudflare.local').read_text(encoding='utf-8-sig')
token = re.search(r'^\s*CLOUDFLARE_API_TOKEN\s*=\s*(.+?)\s*$', text, re.M)[1].strip().strip('"\'')
configuration = json.loads((root / 'cloudflare.config.json').read_text())
api = 'https://api.cloudflare.com/client/v4/accounts/9507af231005e5cfc8290675b502c50e/d1/database/' + configuration['database_id'] + '/query'
site = 'https://devil-hub.dev'
staging = Path(os.environ.get('DEVIL_RUNTIME_STAGING', str(root.parent / 'devil-private-staging-20261028')))
manifest = json.loads((staging / 'runtime-manifest.json').read_text())

def query(sql, params):
    request = urllib.request.Request(api, data=json.dumps({'sql': sql, 'params': params}).encode(),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.load(response)
        if not result.get('success'):
            raise RuntimeError('Live D1 test request failed')
        return result

def web(url, body=None):
    request = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json', 'User-Agent': 'Roblox/WinInet'})
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            return response.status, response.read(), response.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers

test_id = 'runtime-smoke-' + str(uuid.uuid4())
key = 'DEVIL-' + '-'.join(secrets.token_hex(4).upper() for _ in range(4))
hwid = 'executor:runtime-smoke-' + str(uuid.uuid4())
created = int(time.time() * 1000)
inserted = False
try:
    query('INSERT INTO access_keys (id,key_hash,label,source,created_at,expires_at,duration_kind,duration_amount) VALUES (?,?,?,?,?,?,?,?)',
        [test_id, hashlib.sha256(key.encode()).hexdigest(), 'Temporary runtime delivery check', 'admin', created, created + 600_000, 'days', 1])
    inserted = True
    code, body, _ = web(site + '/api/runtime/session', {'key': key, 'hwid': hwid, 'bootstrap': 'private-runtime-domain-20261028-2'})
    if code != 200:
        data = json.loads(body)
        raise RuntimeError('Session test failed: HTTP ' + str(code) + ', category ' + str(data.get('code', data.get('status', 'unknown'))))
    session = json.loads(body)
    assert session['release'] == manifest['release']
    assert web(site + '/api/runtime/session', {'key': key, 'hwid': hwid + '-other', 'bootstrap': 'private-runtime-domain-20261028-2'})[0] == 403
    assert web(site + '/api/runtime/session', {'key': key, 'hwid': hwid})[0] == 426
    print('PASS live key verification and wrong-device denial', flush=True)

    def check(item):
        name, expected = item
        status, contents, headers = web(session['prefix'] + name)
        if status != 200:
            raise RuntimeError('Private file test failed: ' + name.split('/', 1)[1] + ', HTTP ' + str(status))
        assert len(contents) == expected['bytes']
        assert hashlib.sha256(contents).hexdigest() == expected['sha256']
        assert headers.get('Cache-Control') == 'private, no-store'
        return name.split('/', 1)[1]

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for name in pool.map(check, manifest['files'].items()):
            print('PASS live immutable bytes:', name, flush=True)
    for path in ['assets/devil-logo.png', 'preview/ObsidianLibrary.lua', 'preview/OuroFlow.lua']:
        root_ref = manifest['root'].split('/')[0]
        expected = manifest['files'][root_ref + '/' + path]
        status, contents, _ = web(session['prefix'] + 'main/' + path)
        assert status == 200 and hashlib.sha256(contents).hexdigest() == expected['sha256']
    query('UPDATE access_keys SET revoked_at=? WHERE id=?', [int(time.time() * 1000), test_id])
    assert web(session['entry'])[0] == 403
    print('PASS live legacy main aliases and immediate revoked-key denial', flush=True)
    report = {'release': session['release'], 'files_verified': len(manifest['files']), 'maps': manifest['maps'],
        'wrong_device_denied': True, 'revoked_key_denied': True, 'live_roblox_gameplay_verified': False}
    (staging / 'live-delivery-audit.json').write_text(json.dumps(report, indent=2) + '\n')
finally:
    if inserted:
        query('DELETE FROM key_devices WHERE key_id=?', [test_id])
        query('DELETE FROM access_keys WHERE id=?', [test_id])
        print('Temporary live test key removed', flush=True)
