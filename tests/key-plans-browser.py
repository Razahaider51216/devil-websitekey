import json,time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1365,'height':1000})
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    current=None;steps=[];passed=False;key=None;saved=[]
    links={'discordUrl':'https://example.com/discord','channelUrl':'https://example.com/youtube','videoUrl':'https://example.com/video','commentUrl':'','likeUrl':''}
    modes=[{'plan':mode,'links':dict(links),'updatedAt':None} for mode in ['6h','12h','24h']]
    def configuration():return {'links':links,'updatedAt':None,'modes':modes}
    def state():
        hours=int(current[:-1]) if current else 24
        return {'version':'1.0.0','plan':current,'selected':bool(current),'serverNow':int(time.time()*1000),'lifetimeHours':hours,'waitSeconds':{'6h':0,'12h':49,'24h':90}.get(current,0),'steps':steps,'turnstile':{'enabled':True,'configured':True,'siteKey':'mock-site','challenge':'challenge-'+str(current),'passed':passed},'canClaim':bool(current) and all(s['status']=='done' for s in steps) and passed,'key':key}
    def api(route):
        global current,steps,passed,key,modes
        path=route.request.url.split('/api/')[1];data=route.request.post_data_json if route.request.method=='POST' else {}
        if path=='auth/session':out={'required':True,'configured':True,'user':{'id':'123456789012345678','name':'DEVIL_ADMIN','isAdmin':True,'avatarUrl':'https://cdn.discordapp.com/embed/avatars/0.png','decorationUrl':'https://cdn.discordapp.com/avatar-decoration-presets/test.png'}}
        elif path=='flow/select':
            if current!=data['plan']:
                current=data['plan'];passed=False;key=None
                steps=[{'number':i+1,'title':['เข้าร่วม Discord','ติดตามช่อง DEVIL HUB','คอมเมนต์วิดีโอล่าสุด'][i],'subtitle':'DEVIL HUB / COMMUNITY','service':['DISCORD','YOUTUBE','COMMENT'][i],'url':'https://example.com/mission','configured':True,'status':'ready','deadline':None} for i in range({'6h':0,'12h':2,'24h':3}[current])]
            out=state()
        elif path=='flow':out=state()
        elif path=='flow/open':
            steps[data['step']-1]['status']='opened';out={**state(),'openedUrl':'https://example.com/mission'}
        elif path=='flow/return':
            s=steps[data['step']-1];s['status']='waiting';s['deadline']=int(time.time()*1000)+state()['waitSeconds']*1000;out=state()
        elif path=='flow/verify':passed=True;out=state()
        elif path=='flow/claim':
            key={'key':'DEVIL-11111111-22222222-33333333-44444444','expiresAt':int(time.time()*1000)+state()['lifetimeHours']*3600000,'status':'active'};out=key
        elif path=='admin/keys':out={'serverNow':int(time.time()*1000),'keys':[],'stats':{'total':0,'active':0,'permanent':0,'revoked':0},'configuration':configuration()}
        elif path=='admin/settings':
            saved.append(data['plan']);modes=[{**m,'links':data['links'],'updatedAt':int(time.time()*1000)} if m['plan']==data['plan'] else m for m in modes];out=configuration()
        else:raise AssertionError(path)
        route.fulfill(status=200,content_type='application/json',body=json.dumps(out,ensure_ascii=False))
    context.route('**/api/**',api)
    context.route('https://example.com/**',lambda r:r.fulfill(body='Mission test'))
    context.route('https://cdn.discordapp.com/**',lambda r:r.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="#201f32" stroke="#fd526b" stroke-width="3"/><path d="M25 30L45 45H55L75 30L65 70L50 83L35 70Z" fill="#ff5369"/></svg>'))
    context.route('https://challenges.cloudflare.com/**',lambda r:r.fulfill(content_type='application/javascript',body="window.turnstile={render:function(node,opts){let b=document.createElement('button');b.textContent='Test human check';b.onclick=function(){opts.callback('valid-token')};node.appendChild(b);return 'test'},remove:function(){},reset:function(){}};"))
    page.goto('http://127.0.0.1:5184/');page.locator('.key-plan').first.wait_for()
    assert page.locator('.key-plan').count()==3
    assert page.locator('.avatar-decoration').count()==1
    page.screenshot(path='backups/key-plans-desktop.png',full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='backups/key-plans-mobile.png',full_page=True)
    for mode,n,total,wait in [('6h',0,1,0),('12h',2,3,49),('24h',3,4,90)]:
        if mode!='6h':page.goto('http://127.0.0.1:5184/');page.locator('.key-plan').first.wait_for()
        page.locator('.key-plan-'+mode+' button').click();page.locator('.access-layout').wait_for()
        assert page.locator('.steps-list .step-row').count()==n
        assert 'STEP '+str(total).zfill(2) in page.locator('.bot-step .eyebrow').inner_text()
        assert not page.locator('.access-card .primary-button').is_enabled()
        if n:
            assert page.get_by_text('Test human check',exact=True).count()==0
            page.locator('.open-step').first.click();page.wait_for_timeout(300)
            if page.locator('.return-button').count():page.locator('.return-button').first.click()
            page.locator('.countdown strong').wait_for();assert int(page.locator('.countdown strong').inner_text()) in [wait,wait-1]
            for step in steps:step['status']='done';step['deadline']=None
            page.reload()
        page.get_by_text('Test human check',exact=True).wait_for();page.get_by_text('Test human check',exact=True).click()
        page.locator('.access-card .primary-button:not(:disabled)').wait_for();page.locator('.access-card .primary-button').click()
        page.locator('.key-ticket').wait_for();assert key['expiresAt']>int(time.time()*1000)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.goto('http://127.0.0.1:5184/admin');page.locator('#admin-password').fill('mock-admin-password');page.locator('.admin-login form button').click();page.locator('.mode-tabs').wait_for()
    page.locator('.mode-tabs button').filter(has_text='12H').click();assert page.locator('.link-field').count()==2
    page.locator('#link-discordUrl').fill('https://example.com/unsaved12');page.locator('.mode-tabs button').filter(has_text='24H').click();assert page.locator('#link-discordUrl').input_value()==links['discordUrl'];page.locator('.mode-tabs button').filter(has_text='12H').click();page.locator('#link-discordUrl').fill('https://example.com/new12');page.locator('.link-settings .primary-button').click();page.wait_for_timeout(200);assert saved==['12h']
    page.locator('.mode-tabs button').filter(has_text='24H').click();assert page.locator('.link-field').count()==4
    page.locator('.mode-tabs button').filter(has_text='6H').click();assert page.locator('.link-field').count()==0
    assert not errors,errors
    browser.close()
    print('PASS: 3 plan cards, mobile layout, avatar/decorations, 1/3/4 total steps, 49/90 timers, final CAPTCHA then claim on all modes, separate admin link tabs/save; no browser errors')
