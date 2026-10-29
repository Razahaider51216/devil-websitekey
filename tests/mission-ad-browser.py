"""Mocked OnClick script and APIs: never sends real ad traffic."""
import os,time
from playwright.sync_api import sync_playwright,expect

BASE=os.environ.get('BASE_URL','http://127.0.0.1:5184')
TAG='https://al5sm.com/tag.min.js'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for mobile in [False,True]:
        for mode,count in [('6h',1),('12h',2),('24h',3)]:
            ctx=browser.new_context(viewport={'width':390 if mobile else 1365,'height':844 if mobile else 1000})
            ctx.add_init_script("localStorage.setItem('devil-language','en')")
            state={'done':0,'login':True,'key':False,'blocked':False,'fail':False}
            loads=[];errors=[]
            def flow():
                return {'plan':mode,'selected':True,'waitSeconds':30,'serverNow':int(time.time()*1000),'lifetimeHours':int(mode[:-1]),'canClaim':state['done']==count,'key':{'key':'FIXTURE-NOT-A-REAL-KEY','status':'active','expiresAt':int(time.time()*1000)+86400000} if state['key'] else None,'steps':[{'number':i,'title':'Mission '+str(i),'subtitle':'Fixture mission','service':'YOUTUBE','configured':True,'status':'done' if i<=state['done'] else 'ready','deadline':None} for i in range(1,count+1)]}
            def route(r):
                url=r.request.url
                if url==TAG:
                    loads.append(url)
                    if state['blocked']:r.abort();return
                    r.fulfill(content_type='application/javascript',body="""
                    window.fixtureAdLoads=(window.fixtureAdLoads||0)+1;
                    window.fixtureAdZone=document.currentScript.dataset.zone;
                    document.addEventListener('click',()=>{window.fixtureClicks=(window.fixtureClicks||0)+1;});
                    """);return
                if '/api/' in url:
                    path=url.split('/api/')[1]
                    if path=='auth/session':data={'required':True,'configured':True,'providers':{'google':True,'discord':True},'user':{'id':'fixture','name':'Fixture','provider':'discord','isAdmin':False} if state['login'] else None,'siteKey':'fixture','challenge':'fixture'}
                    elif path in ['flow','flow/select']:data=flow()
                    elif path=='flow/open':
                        if state['fail']:r.fulfill(status=500,json={'error':'Fixture failure'});return
                        state['done']=r.request.post_data_json['step'];data={**flow(),'openedUrl':BASE+'/__mission_fixture'}
                    elif path=='flow/claim':state['key']=True;data=flow()['key']
                    else:raise AssertionError('Unexpected API '+path)
                    r.fulfill(json=data)
                elif '/__mission_fixture' in url:r.fulfill(body='Mission fixture only')
                elif not url.startswith(BASE):r.abort()
                else:r.continue_()
            ctx.route('**/*',route)
            page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(BASE,wait_until='domcontentloaded')
            expect(page.get_by_role('heading',name='CHOOSE YOUR ACCESS.')).to_be_visible();assert not loads
            page.get_by_role('button',name='Choose '+mode.upper(),exact=True).click()
            page.wait_for_function('window.fixtureAdLoads===1')
            assert page.evaluate('fixtureAdZone')=='12144051'
            assert page.locator('#devil-mission-onclick').count()==1
            # Ordinary page clicks are allowed; we do not intercept or synthesize them.
            page.get_by_role('heading',name='Mission 1',exact=True).click()
            assert page.evaluate('fixtureClicks')>=1
            for n in range(1,count+1):
                page.get_by_role('button',name='Start step',exact=True).first.click()
                expect(page.locator('.step-done')).to_have_count(n)
            assert len(loads)==1,'no duplicate script during mission updates'
            # Receiving a key replaces the document, removing third-party listeners.
            with page.expect_navigation(wait_until='domcontentloaded'):
                page.locator('button.primary-button',has_text='CONNECT').click()
            expect(page.get_by_role('heading',name='YOUR KEY IS READY.')).to_be_visible()
            page.wait_for_function('!window.fixtureAdLoads')
            assert page.locator('#devil-mission-onclick').count()==0 and len(loads)==1
            # The plan selector also starts in a clean document.
            state['key']=False;state['done']=0
            page.goto(BASE+'/?plan='+mode,wait_until='domcontentloaded');page.wait_for_function('window.fixtureAdLoads===1')
            page.locator('.choose-plan').click();expect(page.get_by_role('heading',name='CHOOSE YOUR ACCESS.')).to_be_visible()
            assert page.evaluate('typeof fixtureAdLoads')=='undefined'
            # A blocked ad script never blocks mission APIs or key issuance.
            state['blocked']=True
            page.goto(BASE+'/?plan='+mode,wait_until='domcontentloaded')
            for n in range(1,count+1):
                page.get_by_role('button',name='Start step',exact=True).first.click();expect(page.locator('.step-done')).to_have_count(n)
            with page.expect_navigation(wait_until='domcontentloaded'):
                page.locator('button.primary-button',has_text='CONNECT').click()
            expect(page.get_by_role('heading',name='YOUR KEY IS READY.')).to_be_visible()
            state['key']=False;state['done']=0;state['fail']=True
            page.goto(BASE+'/?plan='+mode,wait_until='domcontentloaded')
            page.get_by_role('button',name='Start step',exact=True).first.click();expect(page.get_by_role('alert')).to_contain_text('Fixture failure')
            assert state['done']==0
            state['login']=False;before=len(loads)
            for path in ['/?plan='+mode,'/admin','/games']:
                page.goto(BASE+path,wait_until='domcontentloaded');expect(page.get_by_role('button',name='Sign in with Discord',exact=True)).to_be_visible()
                assert page.locator('#devil-mission-onclick').count()==0
            assert len(loads)==before and not errors,errors
            ctx.close();print('PASS original OnClick tag, mission/claim, blocked ads and excluded pages: '+mode+' '+('mobile' if mobile else 'desktop'))
    browser.close()
