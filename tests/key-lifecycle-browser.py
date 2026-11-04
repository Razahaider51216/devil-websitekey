"""Production bundle UI checks with fixture APIs; no real keys or payments."""
import copy,time,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('DEVIL_TEST_URL','http://127.0.0.1:5184')
OUT=Path('.sites-runtime/key-112-browser');OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright()as p:
 browser=p.chromium.launch(headless=True)
 for width,lang in [(390,'th'),(1440,'en')]:
  context=browser.new_context(viewport={'width':width,'height':900})
  context.add_init_script("localStorage.setItem('devil-language',"+repr(lang)+")")
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  now=int(time.time()*1000)
  key={'id':'11111111-1111-4111-8111-111111111111','source':'steps','kind':'hours','amount':6,'key':'DEVIL-11111111-22222222-33333333-44444444','status':'active','expiresAt':now+21600000}
  state={'flow':{'version':'1.1.2','serverNow':now,'plans':[{'id':'6h','hours':6,'totalSteps':2,'waitSeconds':30}],
   'plan':'6h','selected':True,'premium':False,'canDeleteFreeKey':True,'lifetimeHours':6,'waitSeconds':30,'steps':[],'canClaim':False,'key':key},'deletes':0}
  def api(route):
   path=route.request.url.split('/api/',1)[1]
   if path=='auth/session':data={'required':True,'configured':True,'user':{'id':'223456789012345678','name':'QA User','provider':'discord','isAdmin':False}}
   elif path=='flow':data=state['flow']
   elif path=='keys/free/delete':
    assert route.request.post_data_json=={'id':key['id']}
    state['deletes']+=1;state['flow'].update({'plan':None,'selected':False,'key':None,'canDeleteFreeKey':False});data=state['flow']
   elif path.startswith('support/'):data={'thread':None,'messages':[],'unread':0}
   else:data={}
   route.fulfill(json=data)
  page.route('**/api/**',api)
  page.goto(BASE,wait_until='domcontentloaded')
  button=page.get_by_role('button',name='ลบคีย์ฟรี'if lang=='th'else'Delete Free key',exact=True)
  expect(button).to_be_visible(timeout=60000)
  expect(page.locator('.version').first).to_contain_text('1.1.2')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(OUT/f'free-{width}.png'),full_page=True)
  page.on('dialog',lambda dialog:dialog.accept());button.click()
  expect(page.locator('.plan-grid')).to_be_visible();expect(page.locator('.key-ticket')).to_have_count(0)
  assert state['deletes']==1
  premium=copy.deepcopy(key);premium.update({'source':'purchase','kind':'permanent','expiresAt':None})
  state['flow'].update({'premium':True,'key':premium,'canDeleteFreeKey':False})
  page.reload(wait_until='domcontentloaded')
  expect(page.locator('.key-ticket')).to_be_visible(timeout=60000)
  expect(button).to_have_count(0);expect(page.locator('.plan-grid')).to_have_count(0)
  expect(page.locator('.key-ticket .notice')).to_contain_text('พรีเมียม'if lang=='th'else'Premium')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(OUT/f'premium-{width}.png'),full_page=True)
  assert not errors,errors
  context.close()
 browser.close()
print('PASS mobile Thai and desktop English: version, Free deletion, fresh plan picker, Premium-only key, no overflow or browser errors')
