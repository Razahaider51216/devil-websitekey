"""UI-only browser checks; API requests are mocked, no production writes."""
import copy,json,os,re,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

BASE=os.environ.get('BASE_URL','http://127.0.0.1:5184')
root=Path(__file__).resolve().parents[1]
seed=json.loads((root/'public/games/sources.json').read_text(encoding='utf-8'))['games']
out=root/'backups';out.mkdir(exist_ok=True)
with sync_playwright()as p:
    browser=p.chromium.launch(headless=True)
    for mobile in [False,True]:
        ctx=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1080})
        ctx.add_init_script("localStorage.setItem('devil-language','en')")
        page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        state={'games':copy.deepcopy(seed),'revision':1}
        links={'discordUrl':'https://discord.gg/test','channelUrl':'https://youtube.com/@test','videoUrl':'','commentUrl':'','likeUrl':''}
        config={'links':links,'modes':[{'plan':mode,'links':links}for mode in ['6h','12h','24h']]}
        def api(route):
            path=route.request.url.split('/api/',1)[1];method=route.request.method
            if path=='auth/session':data={'required':True,'user':{'id':'123456789012345678','name':'DEVIL TEST','isAdmin':True}}
            elif path=='games':data={'games':[g for g in state['games']if g['enabled']]}
            elif path=='admin/keys':data={'keys':[],'stats':{'total':0,'active':0,'permanent':0,'revoked':0},'configuration':config,'serverNow':int(time.time()*1000)}
            elif path.startswith('admin/games'):
                body=route.request.post_data_json if method!='GET'else None
                if method=='POST':state['games'].append({'id':'added-game',**body['game']});state['revision']+=1
                elif method=='PATCH':
                    game=next(g for g in state['games']if g['id']==path.rsplit('/',1)[1]);game.update(body['game']);state['revision']+=1
                elif method=='DELETE':state['games']=[g for g in state['games']if g['id']!=path.rsplit('/',1)[1]];state['revision']+=1
                data=state
            elif path=='admin/settings':data=config
            elif path=='admin/scripts':data={'scripts':[],'configured':True}
            elif path=='admin/runtime':data={'active':None,'files':0}
            else:raise AssertionError('Unexpected API request: '+path)
            route.fulfill(status=200,json=data)
        page.route('**/api/**',api)
        page.goto(BASE+'/games',wait_until='domcontentloaded',timeout=60000);expect(page.locator('.game-card')).to_have_count(12,timeout=60000)
        expect(page.get_by_role('link',name='Supported games',exact=True)).to_be_visible()
        assert page.locator('.game-card a[href="/"]').count()==12
        assert page.locator('.game-card a[target="_blank"]').count()==12
        page.wait_for_function("Array.from(document.querySelectorAll('.game-card img')).slice(0,2).every(i=>i.complete && i.naturalWidth>0)")
        for cover in page.locator('.game-cover img').all():
            cover.scroll_into_view_if_needed();expect(cover).to_be_visible()
        page.wait_for_function("Array.from(document.querySelectorAll('.game-cover img')).every(i=>i.complete && i.naturalWidth>0)")
        page.evaluate('window.scrollTo(0,0)')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),'directory overflows viewport'
        page.screenshot(path=str(out/('supported-games-mobile.png'if mobile else'supported-games-desktop.png')),full_page=True)
        page.locator('.language-switch button[lang="th"]').click()
        expect(page.locator('.topbar nav a[href="/games"]')).to_have_text('แมพที่รองรับ')
        page.locator('.language-switch button[lang="en"]').click()
        search=page.get_by_role('textbox',name='Search games');search.fill('Anime Dice');expect(page.locator('.game-card')).to_have_count(1)
        search.fill('not-a-game');expect(page.get_by_text('No games found',exact=True)).to_be_visible()
        page.goto(BASE+'/admin',wait_until='domcontentloaded',timeout=60000);expect(page.locator('#admin-section')).to_be_visible(timeout=60000)
        assert page.locator('.stats-grid').count()==1 and page.locator('.script-manager').count()==0
        page.select_option('#admin-section','games');expect(page.locator('.admin-game-row')).to_have_count(12)
        form=page.locator('.game-edit-form');form.get_by_label('Game name',exact=True).fill('QA added game')
        form.get_by_label('Game image URL',exact=True).fill(seed[0]['imageUrl'])
        form.get_by_label('Roblox game URL',exact=True).fill('https://www.roblox.com/games/12345')
        form.get_by_role('button',name='Add game',exact=True).click();expect(page.locator('.admin-game-row')).to_have_count(13)
        page.get_by_role('button',name='Edit QA added game',exact=True).click()
        form.get_by_label('Game name',exact=True).fill('QA edited game');form.get_by_label('Show this game in the directory').uncheck()
        form.get_by_role('button',name='Save changes',exact=True).click()
        expect(page.get_by_text('QA edited game',exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),'admin games overflows viewport'
        page.screenshot(path=str(out/('admin-games-mobile.png'if mobile else'admin-games-desktop.png')),full_page=True)
        page.once('dialog',lambda dialog:dialog.accept())
        page.get_by_role('button',name='Delete QA edited game',exact=True).click()
        expect(page.locator('.admin-game-row')).to_have_count(12)
        page.select_option('#admin-section','missions');expect(page.locator('.link-settings')).to_be_visible();assert page.locator('.game-manager').count()==0
        page.select_option('#admin-section','keys');expect(page.locator('.create-card')).to_be_visible();assert page.locator('.link-settings').count()==0
        page.select_option('#admin-section','scripts');expect(page.locator('.script-manager')).to_be_visible();assert page.locator('.admin-layout .key-manager').count()==0
        page.goto(BASE+'/games',wait_until='domcontentloaded',timeout=60000);expect(page.locator('.game-card')).to_have_count(12)
        assert not errors,errors
        print('PASS games directory and categorized admin, '+('mobile'if mobile else'desktop')+': real images, search, key links, add/edit/hide and menu isolation')
        ctx.close()
    browser.close()
