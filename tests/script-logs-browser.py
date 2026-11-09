"""Local page + mocked account API only; never signs in or writes production."""
import os,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('BASE_URL','http://127.0.0.1:5184')
out=Path(__file__).resolve().parents[1]/'backups';out.mkdir(exist_ok=True)
games={'break':{'name':'Break and Steal an Egg','image':'/games/break-and-steal-an-egg.png','currency':'Cash'},'anime':{'name':'Anime Dice','image':'/games/anime-dice.png','currency':'Money'},'throw':{'name':'Throw Food For Animals','image':'/games/throw-food-for-animals.png','currency':'Money'}}
with sync_playwright()as p:
 browser=p.chromium.launch(headless=True)
 for width in [1440,800,390]:
  context=browser.new_context(viewport={'width':width,'height':1000});page=context.new_page();errors=[];calls={'read':0,'link':0,'cleared':False,'images':0}
  page.on('pageerror',lambda e:errors.append(str(e)))
  context.add_init_script("localStorage.setItem('devil-language','en')")
  def api(route):
   path=route.request.url.split('/api/',1)[1];now=int(time.time()*1000)
   if path.startswith('log?'):
    calls['read']+=1;after='after=0'not in path
    events=[] if calls['read']==1 or after else []
    if calls['read']==2:
     events=[{'id':1,'sessionId':'fixture','game':'anime','player':'Fixture','balance':'3.5e46','createdAt':now,'item':{'id':'fixture-1','name':'Goku Fixture','rarity':'Secret','level':99,'amount':2,'statuses':['Gold','Lucky'],'assetId':'123','imageUrl':None,'income':'1e12'}}]
     for event_id,game in [(2,'break'),(3,'throw')]:
      events.append({'id':event_id,'sessionId':'fixture-'+game,'game':game,'player':'Fixture','balance':'1e50','createdAt':now,'item':{'id':'fixture-'+game,'name':game+' animal','rarity':'Rare','level':None,'amount':1,'statuses':[],'assetId':'999','imageUrl':None,'income':'1e6'}})
    data={'events':events,'sessions':[{'id':'fixture','game':'anime','player':'Fixture','balance':'3.5e46','lastSeenAt':now,'online':True}],'cursor':1 if calls['read']>1 else 0,'hasMore':False,'games':games,'serverNow':now,'historyStartedAt':1}
    if calls['cleared']:data.update(events=[],sessions=[],historyStartedAt=None)
   elif path=='log/link':
    calls['link']+=1;data={'url':'https://devil-hub.dev/api/log/ingest/11111111-2222-3333-4444-555555555555/'+('a'if calls['link']==1 else'b')*32}
   elif path.startswith('log/image'):
    calls['images']+=1
    route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><rect width="150" height="150" fill="#17466b"/><circle cx="75" cy="75" r="40" fill="#65caff"/></svg>');return
   elif path=='auth/session':data={'required':True,'configured':True,'user':None,'providers':{'discord':True,'google':True},'siteKey':'fixture','challenge':'fixture'}
   elif path.startswith('support'):data={'messages':[],'thread':None}
   else:raise AssertionError('Unexpected API '+path)
   route.fulfill(status=200,json=data)
  page.route('**/api/**',api)
  page.goto(BASE+'/log',wait_until='networkidle',timeout=60000)
  expect(page.get_by_role('heading',name='Anime Dice',exact=True)).to_be_visible()
  expect(page.get_by_role('heading',name='Goku Fixture',exact=True)).to_be_visible(timeout=10000)
  expect(page.get_by_text('Gold',exact=True)).to_be_visible();expect(page.get_by_text('Lucky',exact=True)).to_be_visible()
  expect(page.get_by_text('Lv. 99',exact=True)).to_be_visible();expect(page.get_by_text('+1T/s',exact=True)).to_be_visible()
  for game,info in games.items():
   image=page.locator('.log-entry img[alt="'+info['name']+'"]')
   expect(image).to_have_attribute('src',info['image'])
   assert image.evaluate('(img)=>img.complete && img.naturalWidth>0'),'map artwork failed: '+game
  assert calls['images']==0,'item image endpoint was requested'
  page.get_by_label('Filter game').select_option('break');expect(page.get_by_role('heading',name='Goku Fixture')).to_have_count(0)
  page.get_by_label('Filter game').select_option('all');expect(page.get_by_role('heading',name='Goku Fixture')).to_be_visible()
  page.on('dialog',lambda d:d.accept());page.get_by_role('button',name='Replace link',exact=True).click()
  expect(page.get_by_label('LOG link')).to_have_value('https://devil-hub.dev/api/log/ingest/11111111-2222-3333-4444-555555555555/'+'b'*32)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  assert not errors,errors
  page.screenshot(path=str(out/f'script-log-{width}.png'),full_page=True)
  calls['cleared']=True
  expect(page.get_by_role('heading',name='Goku Fixture')).to_have_count(0,timeout=8000)
  context.close()
 browser.close()
print('PASS LOG desktop/tablet/mobile: live drops, real map artwork, no item image requests, metadata, filtering, expired history removal, link replacement and no overflow')
