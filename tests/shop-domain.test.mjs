import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){
    const p=fileURLToPath(new URL(specifier,context.parentURL));if(!existsSync(p)&&existsSync(p+'.ts'))return next(pathToFileURL(p+'.ts').href,context);
  }return next(specifier,context);
}});
const {satang,validateProduct,validateShopSettings,paymentQr,verifyPaymentData,receiverNameMatches}=await import('../lib/shop-domain.ts');
const {isPremiumSource}=await import('../lib/premium.ts');
const {checkSlip,readSlipUpload}=await import('../lib/slipok.ts');
const config={enabled:true,promptpayId:'0812345678',receiverName:'ทดสอบ ระบบ',receiverAliases:['TEST SYSTEM'],orderMinutes:20,branchId:'123'};
const now=Date.parse('2026-11-03T06:30:00Z'),order={priceSatang:12345,createdAt:now-5000,expiresAt:now+1200000,payment:config};
const valid={success:true,transRef:'REF1234567',sendingBank:'004',receivingBank:'006',transTimestamp:new Date(now).toISOString(),amount:123.45,countryCode:'TH',paidLocalCurrency:'764',receiver:{displayName:'นาย ทดสอบ ร**',name:'TEST S**',proxy:{type:'MSISDN',value:'081xxx5678'}}};
test('money is integer satang, QR embeds exact quote and key duration stays bounded',()=>{
  assert.equal(satang('123.45'),12345);assert.equal(satang('12.3'),1230);assert.equal(satang(10),1000);
  for(const v of ['1.001','-1','NaN',NaN,Infinity,{},null,'1e3'])assert.throws(()=>satang(v));
  const qr=paymentQr(config,12345);assert.ok(qr.includes('5406123.45'));assert.ok(qr.includes('0066812345678'));assert.match(qr,/6304[A-F0-9]{4}$/);
  const product={name:'Premium',description:'',price:'99.90',durationKind:'days',durationAmount:30,enabled:true,sortOrder:0};
  assert.equal(validateProduct(product,'id',now).priceSatang,9990);
  for(const change of [{price:0},{durationAmount:0},{durationAmount:3651},{enabled:'true'},{sortOrder:-1},{durationKind:'anything'}])assert.throws(()=>validateProduct({...product,...change},'id',now));
  assert.equal(validateProduct({...product,durationKind:'permanent'},'id',now).durationAmount,0);
  assert.ok(isPremiumSource('purchase')&&isPremiumSource('admin'));assert.ok(!isPremiumSource('steps')&&!isPremiumSource(undefined));
});
test('receiver matching accepts masked bank names but rejects another recipient',()=>{
  assert.ok(receiverNameMatches('นาย ทดสอบ ร**','ทดสอบ ระบบ'));
  assert.ok(receiverNameMatches('นายทดสอบ ร','ทดสอบ ระบบ'));
  assert.ok(receiverNameMatches('TEST S**','TEST SYSTEM'));
  for(const name of ['คนอื่น ระบบ','ทดสอบ อื่น','*** ***','ทดสอบ','T S'])assert.ok(!receiverNameMatches(name,'ทดสอบ ระบบ'));
  assert.equal(validateShopSettings(config).promptpayId,config.promptpayId);
  assert.throws(()=>validateShopSettings({...config,promptpayId:'123'}));
});
test('bank result must match amount, THB, recipient and this order transfer window',()=>{
  assert.equal(verifyPaymentData(valid,order,now).transactionId,'004:REF1234567');
  for(const change of [{success:false},{amount:123.46},{countryCode:'US'},{paidLocalCurrency:'840'},{transRef:'x'},
    {transTimestamp:new Date(order.createdAt-10000).toISOString()},{transTimestamp:new Date(order.expiresAt+1000).toISOString()},
    {transTimestamp:'not-a-date'},{receiver:{displayName:'คนอื่น ระบบ'}},{receiver:{...valid.receiver,proxy:{type:'MSISDN',value:'081xxx9999'}}}])assert.throws(()=>verifyPaymentData({...valid,...change},order,now));
  const local={...valid,transTimestamp:undefined,transDate:'20261103',transTime:'13:30:00'};
  assert.equal(verifyPaymentData(local,order,now).transferredAt,now);
});
test('SlipOK is called only at the fixed origin with server secret, exact amount and log=true; errors never approve',async()=>{
  const file=new File([new Uint8Array([255,216,255,217])],'slip.jpg',{type:'image/jpeg'});
  const success=await checkSlip(file,12345,'123','server-only',async(url,options)=>{
    assert.equal(url,'https://api.slipok.com/api/line/apikey/123');assert.equal(options.headers['x-authorization'],'server-only');assert.equal(options.redirect,'manual');
    assert.equal(options.body.get('amount'),'123.45');assert.equal(options.body.get('log'),'true');assert.ok(options.body.get('files') instanceof File);
    return Response.json({success:true,data:valid});
  });assert.deepEqual(success,valid);
  for(const code of [1001,1002,1003,1004,1007,1009,1010,1011,1013,1014])await assert.rejects(checkSlip(file,12345,'123','server-only',async()=>Response.json({code,data:valid},{status:400})));
  const recovered=await checkSlip(file,12345,'123','server-only',async()=>Response.json({code:1012,data:valid},{status:400}));
  assert.deepEqual(recovered,valid);assert.equal(verifyPaymentData(recovered,order,now).transactionId,'004:REF1234567');
  const {success:omitted,...liveDuplicate}=valid;
  const normalized=await checkSlip(file,12345,'123','server-only',async()=>Response.json({code:1012,data:liveDuplicate},{status:400}));
  assert.equal(verifyPaymentData(normalized,order,now).transactionId,'004:REF1234567');
  for(const status of [200,400]){
    const live={...liveDuplicate,receivingBank:'',paidLocalCurrency:null};
    const result=await checkSlip(file,12345,'123','server-only',async()=>Response.json(status===200?{success:true,data:live}:{code:1012,data:live},{status}));
    assert.equal(verifyPaymentData(result,order,now).receivingBank,'','unknown bank code remains unknown');
    for(const patch of [{amount:123.46},{receiver:{displayName:'Another Person'}},{transTimestamp:'invalid'}])assert.throws(()=>verifyPaymentData({...result,...patch},order,now));
  }
  for(const data of [undefined,{},null,{...valid,success:false}])await assert.rejects(checkSlip(file,12345,'123','server-only',async()=>Response.json({code:1012,data},{status:400})),e=>e.code==='SLIP_DUPLICATE');
  await assert.rejects(checkSlip(file,12345,'123','server-only',async()=>Response.json({code:1009},{status:400})),e=>e.retryAfter===900);
  await assert.rejects(checkSlip(file,12345,'123','server-only',async()=>{throw Error('private secret should not be reflected');}),e=>!e.message.includes('private secret'));
  await assert.rejects(checkSlip(file,12345,'123','server-only',async()=>Response.json({success:true,data:valid},{status:302,headers:{Location:'https://untrusted.test/'}})),
    e=>e.status===503&&e.code==='SLIP_UNAVAILABLE'&&e.retryAfter===30);
});
test('slip uploads enforce bounded images and reject HTML/SVG, repeated fields and oversized requests',async()=>{
  const request=(files)=>{const form=new FormData();for(const file of files)form.append('slip',file);return new Request('https://example.test',{method:'POST',body:form});};
  const jpeg=new File([new Uint8Array([255,216,255,217])],'slip.jpg',{type:'image/jpeg'});
  assert.equal((await readSlipUpload(request([jpeg]))).file.type,'image/jpeg');
  await assert.rejects(readSlipUpload(request([jpeg,jpeg])));
  await assert.rejects(readSlipUpload(request([new File(['<svg onload="alert(1)">'],'image.svg',{type:'image/svg+xml'})])));
  await assert.rejects(readSlipUpload(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})));
});
