"""Assert countdown ticks locally while D1 polling waits for the real step deadline."""
import time
from datetime import datetime,timezone,timedelta
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:5184'
with sync_playwright()as p:
    browser=p.chromium.launch(headless=True);page=browser.new_page()
    start=datetime(2026,10,27,tzinfo=timezone.utc)
    page.clock.install(time=start);page.clock.pause_at(start+timedelta(seconds=1))
    calls=[]
    now=int((start+timedelta(seconds=1)).timestamp()*1000)
    flow={'serverNow':now,'lifetimeHours':24,'canClaim':False,'key':None,
          'steps':[{'number':i,'title':f'Step {i}','subtitle':'Test','service':'TEST','configured':True,'status':'waiting'if i==1 else'ready','deadline':now+30000 if i==1 else None}for i in range(1,5)]}
    def reply(route):
        calls.append(1)
        if len(calls)>1:
            flow['serverNow']=now+30000;flow['steps'][0]['status']='done'
        route.fulfill(json=flow)
    page.route('**/api/flow',reply);page.goto(BASE)
    expect(page.locator('.countdown strong')).to_have_text('30')
    page.clock.run_for(29000)
    expect(page.locator('.countdown strong')).to_have_text('01')
    assert len(calls)==1,'countdown must not query D1 before deadline'
    page.clock.run_for(1100)
    expect(page.locator('.step-done')).to_have_count(1)
    assert len(calls)==2,'one refresh at deadline must confirm the completed step'
    # Quota failures must back off instead of retrying twice per second.
    failures=[]
    page.unroute('**/api/flow')
    page.route('**/api/flow',lambda r:(failures.append(1),r.fulfill(status=503,json={'error':'Daily quota reached'})))
    page.reload();expect(page.locator('.notice.error')).to_be_visible()
    page.clock.run_for(25000)
    assert len(failures)==1
    browser.close()
print('PASS local countdown: 30-second wait uses no intermediate reads, one deadline refresh, and errors back off')
