"""Run against local preview only, with configured local fixture links. No external links are visited."""
import concurrent.futures
import http.cookiejar
import json
from pathlib import Path
import time
import urllib.error
import urllib.request

BASE = 'http://127.0.0.1:5184'
values = dict(line.split('=', 1) for line in Path('.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def request(path, method='GET', data=None, admin=False, origin=BASE, expected=200, opener=client):
    headers = {'Content-Type': 'application/json', 'Origin': origin}
    if admin: headers['Authorization'] = 'Bearer ' + values['ADMIN_ACCESS_KEY']
    req = urllib.request.Request(BASE+'/api/'+path, data=None if data is None else json.dumps(data).encode(), method=method, headers=headers)
    for attempt in range(3):
        try:
            response = opener.open(req)
        except urllib.error.HTTPError as error:
            response = error
        raw = response.read()
        if response.code != 503 or b'worker restarted mid-request' not in raw: break
        time.sleep(1) # Wrangler-only reload, not an application error
    assert raw.startswith(b'{'), (path, response.code, ascii(raw.decode())[:1500])
    result = json.loads(raw)
    assert response.code == expected, (path, response.code, expected, result)
    return result

request('admin/keys', expected=401)
initial = request('flow')
assert all(s['configured'] for s in initial['steps']), 'Use temporary local fixture links for this full-flow test'
request('flow/claim','POST',{},expected=409)
request('flow/open','POST',{'step':2},expected=409)
request('flow/return','POST',{'step':1},expected=409)
request('flow/open','POST',{'step':1},origin='https://untrusted.example',expected=403)
print('PASS: unauthorized access, wrong origin, skipped steps and early claim rejected',flush=True)

for step in range(1,5):
    opened = request('flow/open','POST',{'step':step})
    assert opened['steps'][step-1]['status'] == 'opened'
    returned = request('flow/return','POST',{'step':step})
    state = returned['steps'][step-1]
    assert state['status'] == 'waiting'
    again = request('flow/return','POST',{'step':step})
    assert again['steps'][step-1]['deadline'] == state['deadline'], 'return must not reset countdown'
    request('flow/claim','POST',{},expected=409)
    time.sleep(max(0,(state['deadline']-time.time()*1000)/1000)+.15)
    current = request('flow')
    assert current['steps'][step-1]['status'] == 'done'
    print('PASS: step',step,'completed after real server 30-second timer',flush=True)

assert current['canClaim']
cookie = '; '.join(c.name+'='+c.value for c in jar)
def claim(_):
    req=urllib.request.Request(BASE+'/api/flow/claim', data=b'{}', headers={'Content-Type':'application/json','Origin':BASE,'Cookie':cookie})
    return json.load(urllib.request.urlopen(req))
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    claimed = list(pool.map(claim, range(4)))
assert len({k['key'] for k in claimed}) == 1, 'concurrent claim must issue one key'
assert request('validate','POST',{'key':claimed[0]['key'],'hwid':'local-integration-device'})['valid']
assert request('flow')['key']['key'] == claimed[0]['key']
print('PASS: concurrent and repeated claims return same valid persistent key',flush=True)

request('admin/keys','POST',{'kind':'days','amount':0},admin=True,expected=400)
for kind, amount in [('permanent',0),('days',7),('months',1)]:
    made=request('admin/keys','POST',{'kind':kind,'amount':amount,'label':'Local QA '+kind},admin=True,expected=201)
    assert (made['expiresAt'] is None) == (kind == 'permanent')
    assert request('validate','POST',{'key':made['key'],'hwid':'local-integration-device'})['valid']
    request('admin/keys/'+made['id'],'DELETE',admin=True)
    assert request('validate','POST',{'key':made['key'],'hwid':'local-integration-device'})['status'] == 'revoked'
    print('PASS: admin creates and revokes',kind,'key',flush=True)
assert not request('validate','POST',{'key':'DEVIL-invalid'})['valid']
print('ALL LOCAL INTEGRATION CHECKS PASSED',flush=True)
