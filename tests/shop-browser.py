"""Local production-build browser QA. All API responses are fixtures, no real payments."""
import base64,copy,json,os,subprocess,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1];BASE=os.environ.get('BASE_URL','http://127.0.0.1:5184')
OUT=ROOT/'backups/shop-qa';OUT.mkdir(parents=True,exist_ok=True)
QR=subprocess.check_output(['node','--input-type=module','-e',"import qr from 'promptpay-qr';console.log(qr('0812345678',{amount:99.90}))"],cwd=ROOT,text=True).strip()
STAMP=int(time.time()*1000)
PRODUCT={'id':'11111111-1111-4111-8111-111111111111','name':'DEVIL Premium 30 Days','description':'Premium access for all supported maps.','priceSatang':9990,'durationKind':'days','durationAmount':30,'enabled':True,'sortOrder':0,'updatedAt':STAMP}
ORDER={'id':'22222222-2222-4222-8222-222222222222','productName':PRODUCT['name'],'priceSatang':9990,'durationKind':'days','durationAmount':30,'status':'pending','createdAt':STAMP,'expiresAt':STAMP+1200000,'serverNow':STAMP,'paidAt':None,'lastError':None,'retryAt':None,'payment':{'promptpayId':'0812345678','receiverName':'TEST SYSTEM'},'qrPayload':QR,'key':None}
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j54kAAAAASUVORK5CYII=')
with sync_playwright()as p:
 browser=p.chromium.launch(headless=True)
 for mobile in [False,True]:
  ctx=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1000})
  ctx.add_init_script("localStorage.setItem('devil-language','en')")
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  state={'products':[copy.deepcopy(PRODUCT)],'order':copy.deepcopy(ORDER),'verify':0,'config':{'settings':{'enabled':True,'promptpayId':'0812345678','receiverName':'TEST SYSTEM','receiverAliases':[],'orderMinutes':20},'revision':1,'configured':True,'apiKeyConfigured':True,'branchId':'123'}}
  def api(route):
   path=route.request.url.split('/api/',1)[1];method=route.request.method
   if path=='auth/session':data={'required':True,'configured':True,'user':{'id':'123456789012345678','name':'DEVIL TEST','provider':'discord','isAdmin':True}}
   elif path=='shop/products':data={'products':[x for x in state['products']if x['enabled']],'available':True}
   elif path=='shop/orders':data={'orders':[]}if method=='GET'else state['order']
   elif path.endswith('/verify'):
    assert method=='POST'and 'multipart/form-data'in route.request.headers['content-type'];state['verify']+=1
    state['order'].update({'status':'paid','qrPayload':None,'paidAt':STAMP,'key':{'key':'DEVIL-11111111-22222222-33333333-44444444','expiresAt':STAMP+30*86400000,'createdAt':STAMP,'status':'active','premium':True}});data=state['order']
   elif path=='shop/orders/'+ORDER['id']:data=state['order']
   elif path=='admin/keys':data={'keys':[],'stats':{'total':0,'active':0,'permanent':0,'revoked':0},'serverNow':STAMP,'configuration':{'links':{},'modes':[]}}
   elif path=='admin/shop':data={**state['config'],'products':state['products']}
   elif path.startswith('admin/shop/products'):
    body=route.request.post_data_json
    if method=='POST':
     value=body['product'];state['products'].append({'id':'33333333-3333-4333-8333-333333333333',**value,'priceSatang':round(float(value['price'])*100),'updatedAt':STAMP+1})
    elif method=='PUT':
     value=body['product'];item=next(x for x in state['products']if x['id']==path.rsplit('/',1)[1]);item.update({**value,'priceSatang':round(float(value['price'])*100),'updatedAt':STAMP+2})
    elif method=='DELETE':state['products']=[x for x in state['products']if x['id']!=path.rsplit('/',1)[1]]
    data={'products':state['products']}
   elif path=='admin/shop/settings':
    body=route.request.post_data_json;assert 'apiKey'not in body['settings'];state['config'].update({'settings':body['settings'],'revision':2});data=state['config']
   elif path=='admin/shop/orders':data={'orders':[{**state['order'],'ownerName':'QA Buyer','ownerId':'fixture','slipUrl':None if state.get('reviewWithoutSlip')else'/api/admin/shop/orders/'+ORDER['id']+'/slip','slipSha256':None if state.get('reviewWithoutSlip')else'a'*64,'attempts':0 if state.get('reviewWithoutSlip')else 1,'transactionId':'004:TESTREF','review':state['order'].get('review')}],'next':None}
   elif path=='admin/shop/orders/'+ORDER['id']+'/approve':
    body=route.request.post_data_json;assert body['confirmReceived']and body['slipSha256']==(None if state.get('reviewWithoutSlip')else'a'*64)and body['attempts']==(0 if state.get('reviewWithoutSlip')else 1)
    assert body['bankCode']=='004'and body['receivingBank']=='006'and body['transactionRef']=='REVIEW12345'
    state['order'].update({'status':'paid','lastError':None,'review':{'adminId':'123456789012345678','note':body['note'],'approvedAt':STAMP}});data=state['order']
   elif path.startswith('support/')or path.startswith('admin/support/'):data={'thread':None,'messages':[],'threads':[]}
   else:raise AssertionError('Unexpected API: '+path)
   route.fulfill(status=200,json=data)
  page.route('**/api/**',api)
  page.goto(BASE+'/buy',wait_until='domcontentloaded',timeout=60000)
  expect(page.locator('.shop-card')).to_have_count(1,timeout=60000)
  expect(page.locator('.shop-card h2')).to_have_text(PRODUCT['name'])
  assert page.locator('script[src*="al5sm.com"]').count()==0,'Ads must stay outside Buy'
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Shop overflows viewport'
  page.screenshot(path=str(OUT/('shop-mobile.png'if mobile else'shop-desktop.png')),full_page=True)
  page.get_by_role('button',name='Buy premium',exact=True).click()
  page.wait_for_url('**/buy/'+ORDER['id'],timeout=60000)
  expect(page.locator('.payment-qr img')).to_be_visible(timeout=60000)
  assert page.locator('.payment-qr img').get_attribute('src').startswith('data:image/png;base64,')
  expect(page.get_by_role('link',name='Save QR',exact=True)).to_be_visible()
  assert state['verify']==0
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Checkout overflows viewport'
  page.screenshot(path=str(OUT/('checkout-mobile.png'if mobile else'checkout-desktop.png')),full_page=True)
  page.get_by_role('button',name='I’ve paid · Upload slip',exact=True).click()
  page.get_by_label('Transfer slip image').set_input_files({'name':'slip.png','mimeType':'image/png','buffer':PNG})
  expect(page.locator('.slip-preview img')).to_be_visible()
  page.get_by_role('button',name='Verify slip & get key',exact=True).click()
  expect(page.get_by_text('Your premium key is ready',exact=True)).to_be_visible()
  expect(page.locator('.key-output')).to_be_visible();assert state['verify']==1
  page.screenshot(path=str(OUT/('paid-mobile.png'if mobile else'paid-desktop.png')),full_page=True)
  page.goto(BASE+'/admin',wait_until='domcontentloaded',timeout=60000)
  expect(page.locator('#admin-section')).to_be_visible(timeout=60000);page.select_option('#admin-section','shop')
  expect(page.locator('.shop-manager')).to_be_visible();expect(page.locator('.shop-admin-product')).to_have_count(1)
  form=page.locator('.shop-product-form');form.get_by_label('Product name',exact=True).fill('QA Lifetime')
  form.get_by_label('Product description',exact=True).fill('A test product with a long readable description.')
  form.get_by_label('Price (THB)',exact=True).fill('499.50');form.get_by_label('Key duration type').select_option('permanent')
  form.get_by_label('Publish this product').check();form.get_by_role('button',name='Add product',exact=True).click()
  expect(page.locator('.shop-admin-product')).to_have_count(2)
  page.get_by_role('button',name='Edit QA Lifetime',exact=True).click();form.get_by_label('Product name',exact=True).fill('QA Lifetime Updated')
  form.get_by_role('button',name='Save product',exact=True).click();expect(page.get_by_text('QA Lifetime Updated',exact=True)).to_be_visible()
  page.once('dialog',lambda dialog:dialog.accept());page.get_by_role('button',name='Delete QA Lifetime Updated',exact=True).click()
  expect(page.locator('.shop-admin-product')).to_have_count(1)
  page.get_by_role('button',name='Payment settings',exact=True).click()
  expect(page.get_by_label('PromptPay ID',exact=True)).to_have_value('0812345678')
  page.get_by_label('Payment window (minutes)',exact=True).fill('30');page.get_by_role('button',name='Save payment settings',exact=True).click()
  expect(page.get_by_text('Saved successfully',exact=True)).to_be_visible()
  page.get_by_role('button',name='Orders',exact=True).click();expect(page.locator('.shop-admin-order')).to_have_count(1)
  state['order'].update({'status':'pending','lastError':None,'review':None});state['reviewWithoutSlip']=True
  page.locator('.shop-admin-orders').get_by_role('button',name='Refresh',exact=True).click()
  page.get_by_role('button',name='Review & approve',exact=True).click()
  review=page.locator('.shop-review-form')
  review.get_by_label('Sending bank code',exact=True).fill('004');review.get_by_label('Receiving bank code',exact=True).fill('006')
  review.get_by_label('Bank transaction reference',exact=True).fill('REVIEW12345')
  review.get_by_label("Transfer date/time on slip (this device's timezone)",exact=True).fill('2026-11-03T13:30')
  review.get_by_label('Review note',exact=True).fill('Received the full amount in the bank account')
  expect(review.get_by_role('button',name='Approve & issue premium Key',exact=True)).to_be_disabled()
  review.get_by_role('checkbox').check()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Manual review overflows viewport'
  page.screenshot(path=str(OUT/('manual-review-mobile.png'if mobile else'manual-review-desktop.png')),full_page=True)
  review.get_by_role('button',name='Approve & issue premium Key',exact=True).click()
  expect(page.locator('.shop-review-result')).to_contain_text('Approved by admin')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Shop admin overflows viewport'
  page.screenshot(path=str(OUT/('admin-shop-mobile.png'if mobile else'admin-shop-desktop.png')),full_page=True)
  assert not errors,errors
  print('PASS '+('mobile'if mobile else'desktop')+': shop, exact-amount QR, upload, premium key, admin add/edit/delete, settings and order list')
  ctx.close()
 browser.close()
