"""Use only local D1; assert atomic first-device binding without printing issued keys."""
import concurrent.futures
import json
from pathlib import Path
import urllib.request
import urllib.error
BASE='http://127.0.0.1:5184'
values=dict(line.split('=',1) for line in Path('.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
def call(path, data=None, admin=False, method=None):
    headers={'Content-Type':'application/json','Origin':BASE}
    if admin: headers['Authorization']='Bearer '+values['ADMIN_ACCESS_KEY']
    req=urllib.request.Request(BASE+'/api/'+path,data=None if data is None else json.dumps(data).encode(),headers=headers,method=method)
    return json.load(urllib.request.urlopen(req,timeout=20))
key=call('admin/keys',{'kind':'days','amount':1,'label':'Local HWID race regression'},True)
try:
    for hwid in [None,'',[],{},'tiny','x'*513]:
        result=call('validate',{'key':key['key'],'hwid':hwid})
        assert not result['valid'] and result['status']=='hwid_required'
    devices=['device-race-A','device-race-B']
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        replies=list(pool.map(lambda hwid:call('validate',{'key':key['key'],'hwid':hwid}),devices))
    assert sum(r['valid'] for r in replies)==1,'simultaneous first use must bind only one device'
    winner=devices[next(i for i,r in enumerate(replies) if r['valid'])]
    loser=devices[next(i for i,r in enumerate(replies) if not r['valid'])]
    for _ in range(3): assert call('validate',{'key':key['key'],'hwid':winner})['valid']
    result=call('validate',{'key':key['key'],'hwid':loser})
    assert not result['valid'] and result['status']=='hwid_mismatch'
    assert not call('validate',{'key':key['key']})['valid'],'missing HWID cannot bypass existing binding'
finally:
    call('admin/keys/'+key['id'],admin=True,method='DELETE')
assert call('validate',{'key':key['key'],'hwid':winner})['status']=='revoked'
print('PASS local D1: missing/malformed HWID rejected, atomic two-device race, same-device reuse, other-device denial and revocation')
