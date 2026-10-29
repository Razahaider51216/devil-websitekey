"""Mocked OAuth/CAPTCHA UI; no real login or production writes."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

BASE=os.environ.get('BASE_URL','http://127.0.0.1:5184')
out=Path(__file__).resolve().parents[1]/'backups';out.mkdir(exist_ok=True)
with sync_playwright()as p:
    browser=p.chromium.launch(headless=True)
    for mobile in [False,True]:
        for google in [True,False]:
            ctx=browser.new_context(viewport={'width':390 if mobile else 1365,'height':844 if mobile else 1000})
            ctx.add_init_script("localStorage.setItem('devil-language','en')")
            page=ctx.new_page();errors=[];calls=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            def api(route):
                path=route.request.url.split('/api/',1)[1]
                if path=='auth/session':data={'required':True,'configured':True,'providers':{'google':google,'discord':True},'user':None,'siteKey':'fixture','challenge':'fixture-challenge'}
                elif path in ['auth/google/start','auth/discord/start']:
                    calls.append(path);assert route.request.post_data_json=={'token':'fixture-token'}
                    data={'url':'https://accounts.google.com/fixture'if 'google'in path else'https://discord.com/fixture'}
                else:raise AssertionError('Unexpected API request: '+path)
                route.fulfill(status=200,json=data)
            page.route('**/api/**',api)
            page.route('https://accounts.google.com/fixture',lambda r:r.fulfill(body='Google redirect fixture'))
            page.route('https://discord.com/fixture',lambda r:r.fulfill(body='Discord redirect fixture'))
            page.route('https://challenges.cloudflare.com/**',lambda r:r.fulfill(content_type='application/javascript',body="""
            window.turnstile={render(node,opts){let b=document.createElement('button');b.textContent='Verify fixture';b.onclick=()=>opts.callback('fixture-token');node.append(b);return 'fixture'},remove(){},reset(){}};
            """))
            page.goto(BASE,wait_until='domcontentloaded',timeout=60000)
            g=page.get_by_role('button',name='Sign in with Google',exact=True);d=page.get_by_role('button',name='Sign in with Discord',exact=True)
            expect(g).to_be_disabled();expect(d).to_be_disabled()
            page.get_by_role('button',name='Verify fixture',exact=True).click();expect(d).to_be_enabled()
            if google:expect(g).to_be_enabled()
            else:expect(g).to_be_disabled();expect(page.get_by_text('Google sign-in is not configured yet',exact=True)).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            if google:page.screenshot(path=str(out/('login-providers-mobile.png'if mobile else'login-providers-desktop.png')),full_page=True)
            (g if google else d).click();page.wait_for_url('https://accounts.google.com/fixture'if google else'https://discord.com/fixture')
            assert calls==['auth/google/start'if google else'auth/discord/start']
            assert not errors,errors
            # The admin login still offers Discord exclusively.
            page.goto(BASE+'/admin',wait_until='domcontentloaded',timeout=60000)
            expect(page.get_by_role('button',name='Sign in with Discord',exact=True)).to_be_visible()
            assert page.get_by_role('button',name='Sign in with Google',exact=True).count()==0
            ctx.close()
        print('PASS login provider choices, CAPTCHA gating, Google setup state, Discord fallback and admin isolation: '+('mobile'if mobile else'desktop'))
    browser.close()
