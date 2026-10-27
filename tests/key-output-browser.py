"""Local UI tests with synthetic keys and a stub Turnstile provider; never issues live keys."""
import json,time
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:5184'
KEY='DEVIL-12345678-ABCDEF12-12345678-ABCDEF12'
SCRIPT=f'script_key = "{KEY}";\nloadstring(game:HttpGet("https://raw.githubusercontent.com/Razahaider51216/devil-scripthub/main/loader?v=vm-1"))()'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':390,'height':844})
    context.add_init_script("localStorage.setItem('devil-language','en');Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.__copied=value}}})")
    page=context.new_page()
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    flow={'serverNow':int(time.time()*1000),'lifetimeHours':24,'steps':[],'canClaim':True,'key':{'key':KEY,'status':'active','expiresAt':None}}
    page.route('**/api/flow',lambda r:r.fulfill(json=flow))
    page.goto(BASE)
    page.get_by_role('button',name='Copy key',exact=True).click()
    assert page.evaluate('window.__copied')==KEY
    page.get_by_role('button',name='Script with key',exact=True).click()
    expect(page.locator('.key-code')).to_have_text(SCRIPT)
    page.get_by_role('button',name='Copy script',exact=True).click()
    assert page.evaluate('window.__copied')==SCRIPT
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    # A completed provider callback must be confirmed by the server before enabling claim.
    flow['key']=None;flow['canClaim']=False
    flow['steps']=[{'number':i,'title':f'Test step {i}','subtitle':'Test','service':'TEST','configured':True,'status':'done','deadline':None} for i in range(1,5)]
    flow['turnstile']={'enabled':True,'configured':True,'siteKey':'synthetic-key','challenge':'session-challenge','passed':False}
    def verify(route):
        assert route.request.post_data_json=={'token':'synthetic-token'}
        flow['turnstile']['passed']=True;flow['canClaim']=True
        route.fulfill(json=flow)
    page.route('**/api/flow/verify',verify)
    widget="""window.turnstile={render:(node,options)=>{window.__widgetOptions=options;node.innerHTML='<button id="test-human">Verify test human</button>';node.querySelector('button').onclick=()=>options.callback('synthetic-token');return 'widget'},remove:()=>{},reset:()=>{}};"""
    page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',lambda r:r.fulfill(body=widget,content_type='application/javascript'))
    page.reload()
    claim=page.get_by_role('button',name='CONNECT / GET KEY')
    expect(claim).to_be_disabled()
    page.get_by_role('button',name='Verify test human').click()
    expect(claim).to_be_enabled()
    expect(page.locator('.bot-step .done-label')).to_be_visible()
    assert page.evaluate('window.__widgetOptions.cData')=='session-challenge'
    assert not errors,errors
    browser.close()
print('PASS mobile: key-only/script copy use the same key; Step 5 confirms on server and unlocks immediately without countdown')
