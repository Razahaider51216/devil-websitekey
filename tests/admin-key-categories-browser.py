"""Check the deployed bundle locally with fixture admin APIs; no real key mutations."""
import os,time,copy
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('DEVIL_TEST_URL','http://127.0.0.1:5184')
OUT=Path('.sites-runtime/admin-key-categories');OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright()as p:
 browser=p.chromium.launch(headless=True)
 for width,language in [(390,'th'),(1440,'en')]:
  context=browser.new_context(viewport={'width':width,'height':900})
  context.add_init_script("localStorage.setItem('devil-language',"+repr(language)+")")
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  now=int(time.time()*1000)
  rows=[{'id':str(i),'key':f'DEVIL-11111111-22222222-33333333-0000000{i}','label':label,'source':source,
   'createdAt':now,'expiresAt':now+86400000,'status':'active','kind':'days','amount':1}
   for i,(source,label)in enumerate([('admin','Admin fixture'),('steps','Free fixture'),('purchase','Purchased fixture')])]
  def api(route):
   url=urlsplit(route.request.url);path=url.path.removeprefix('/api/');method=route.request.method
   if path=='auth/session':data={'required':True,'configured':True,'user':{'id':'123456789012345678','name':'QA Admin','provider':'discord','isAdmin':True}}
   elif path=='admin/keys'and method=='GET':
    source=parse_qs(url.query).get('source',['all'])[0];selected=[k for k in rows if source=='all'or k['source']==source]
    data={'source':source,'categoryTotal':len(selected),'serverNow':now,'keys':selected,'stats':{'total':len(rows),'active':len(rows)},'configuration':{'links':{},'modes':[]}}
   elif path=='admin/keys'and method=='POST':
    key=copy.deepcopy(rows[0]);key.update({'id':'new','label':route.request.post_data_json['label']});rows.append(key);data=key
   elif path.startswith('admin/keys/')and method=='DELETE':
    key=next(k for k in rows if k['id']==path.rsplit('/',1)[1]);key['status']='revoked';data={'ok':True}
   elif path.startswith(('support/','admin/support/')):data={'thread':None,'messages':[],'threads':[],'unread':0}
   else:data={}
   route.fulfill(json=data)
  page.route('**/api/**',api);page.goto(BASE+'/admin',wait_until='domcontentloaded')
  menu=page.locator('#admin-section');expect(menu).to_be_visible(timeout=60000);menu.select_option('keys')
  category=page.locator('#key-source');expect(category).to_have_value('admin');expect(category).to_be_enabled()
  table=page.locator('.key-manager tbody');expect(table.locator('tr')).to_have_count(1);expect(table).to_contain_text('Admin fixture')
  category.select_option('steps');expect(table).to_contain_text('Free fixture');expect(table).not_to_contain_text('Admin fixture')
  page.locator('.key-manager input').fill('no matching key');expect(table.locator('tr')).to_have_count(0)
  expect(category).to_be_enabled();category.select_option('purchase');expect(table).to_contain_text('Purchased fixture')
  expect(page.locator('.key-manager input')).to_have_value('');expect(table.locator('tr')).to_have_count(1)
  category.select_option('all');expect(table.locator('tr')).to_have_count(3)
  category.select_option('steps');expect(table).to_contain_text('Free fixture')
  page.locator('.key-manager input').fill('no existing key matches this')
  page.locator('#key-label').fill('New admin fixture');page.locator('.create-card button[type=submit], .create-card .primary-button').click()
  expect(category).to_have_value('admin');expect(table).to_contain_text('New admin fixture');expect(table).not_to_contain_text('Free fixture')
  page.on('dialog',lambda dialog:dialog.accept())
  row=table.locator('tr').filter(has_text='New admin fixture');row.locator('.revoke-button').click()
  expect(row.locator('.revoke-button')).to_be_disabled()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'mobile layout overflows'
  page.screenshot(path=str(OUT/f'admin-keys-{width}.png'),full_page=True)
  assert not errors,errors
  context.close()
 browser.close()
print('PASS Thai mobile and English desktop categories, search reset, create-to-admin, revoke, layout and browser errors')
