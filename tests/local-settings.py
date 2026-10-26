"""Local D1 settings regression test. Never connects to a production server."""
import http.cookiejar
import json
from pathlib import Path
import urllib.error
import urllib.request
import time

BASE = 'http://127.0.0.1:5184'
values = dict(line.split('=', 1) for line in Path('.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def call(path, data=None, admin=False, expected=200, origin=BASE):
    headers = {'Content-Type':'application/json', 'Origin':origin}
    if admin: headers['Authorization'] = 'Bearer '+values['ADMIN_ACCESS_KEY']
    for attempt in range(3):
        req=urllib.request.Request(BASE+'/api/'+path, data=None if data is None else json.dumps(data).encode(), headers=headers)
        try: response=client.open(req, timeout=20)
        except urllib.error.HTTPError as error: response=error
        raw=response.read()
        if response.code != 503 or b'worker restarted mid-request' not in raw: break
        time.sleep(1)
    assert response.code == expected, (path,response.code,ascii(raw.decode())[:300])
    return json.loads(raw)

call('admin/settings', expected=401)
before=call('admin/settings', admin=True)
links={'discordUrl':'https://discord.gg/local-test', 'channelUrl':'https://www.youtube.com/@local-test', 'videoUrl':'https://www.youtube.com/watch?v=local-test', 'commentUrl':'', 'likeUrl':''}
call('admin/settings', {'links':links}, expected=401)
call('admin/settings', {'links':links}, admin=True, origin='https://untrusted.example',expected=403)
for bad in ['javascript:alert(1)','http://example.com','https://user:pass@example.com','x'*2049]:
    call('admin/settings', {'links':{**links,'discordUrl':bad}},admin=True,expected=400)
call('admin/settings', {'links':{}},admin=True,expected=400)
print('PASS: settings require admin, correct origin and valid HTTPS links',flush=True)

saved=call('admin/settings', {'links':links},admin=True)
assert saved['links']==links and saved['updatedAt']
assert call('admin/settings',admin=True)['links']==links
flow=call('flow')
assert [s['url'] for s in flow['steps']]==[links['discordUrl'], links['channelUrl'], links['videoUrl'], links['videoUrl']]
assert all(s['configured'] for s in flow['steps'])
call('flow/open', {'step':1})
returned=call('flow/return', {'step':1})
deadline=returned['steps'][0]['deadline']
time.sleep(max(0,(deadline-time.time()*1000)/1000)+.1)
assert call('flow')['steps'][0]['status']=='done'
changed={**links,'discordUrl':'https://discord.gg/changed-local-test', 'commentUrl':'https://www.youtube.com/watch?v=comment-only'}
call('admin/settings',{'links':changed},admin=True)
new=call('flow')
assert new['steps'][0]['status']=='ready', 'changing an effective link invalidates completed progress'
assert new['steps'][2]['url']==changed['commentUrl'] and new['steps'][3]['url']==links['videoUrl']
assert not new['canClaim']
print('PASS: saved links apply immediately; per-step overrides and progress invalidation work',flush=True)

blank={k:'' for k in links}
call('admin/settings',{'links':blank},admin=True)
assert not any(s['configured'] for s in call('flow')['steps']), 'saved empty links must not fall back to env defaults'
call('admin/settings',{'links':links},admin=True)
print('PASS: clearing links disables steps; local fixture links saved for browser and full-flow QA',flush=True)
