import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, seal, unseal, cookieValue, cookie, requireOrigin } from '../lib/security.ts';
import { authorizationUrl, discordIdentity, discordMedia } from '../lib/discord-domain.ts';
const secret = 'test-secret-only-'.repeat(3);
test('signed cookies reject tampering, wrong purpose, wrong key and expiry', async () => {
  const signed = await seal({ id: '123' }, 'session', secret, 1000, 10000);
  assert.equal((await unseal(signed, 'session', secret, 10001)).id, '123');
  assert.equal(await unseal(signed, 'other', secret, 10001), null);
  assert.equal(await unseal(signed, 'session', secret+'x', 10001), null);
  assert.equal(await unseal(signed, 'session', secret, 11000), null);
  assert.equal(await unseal('x'+signed.slice(1), 'session', secret, 10001), null);
  assert.equal(await unseal(signed, 'session', secret, -100000), null);
});
test('cookies reject ambiguity and cross origin mutations', () => {
  const req = new Request('https://example.test/', {headers:{cookie:'a=one; a=two',origin:'https://evil.test'}});
  assert.equal(cookieValue(req,'a'),undefined);
  assert.throws(()=>requireOrigin(req), e=>e.status===403);
  assert.match(cookie(req,'auth','v',600),/^__Host-auth=v; HttpOnly; SameSite=Lax; Path=\/; Max-Age=600; Secure$/);
});
test('JSON reader bounds streamed bodies and accepts only UTF8 JSON objects', async () => {
  const request = body => new Request('https://example.test/',{method:'POST',headers:{'content-type':'application/json'},body});
  assert.deepEqual(await readJson(request('{"step":1}')),{step:1});
  for (const text of ['[]','null','"str"','{']) await assert.rejects(readJson(request(text)),e=>e.status===400);
  await assert.rejects(readJson(request(new Uint8Array([255]))),e=>e.status===400);
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(9000));c.enqueue(new Uint8Array(9000));c.close();}});
  await assert.rejects(readJson(new Request('https://example.test/',{method:'POST',headers:{'content-type':'application/json'},body:stream,duplex:'half'})),e=>e.status===413);
  await assert.rejects(readJson(new Request('https://example.test/',{method:'POST',body:'{}'})),e=>e.status===415);
});
test('Discord requests only identify and keeps tokens server side', async () => {
  const url=new URL(authorizationUrl('123','https://example.test/api/callback','random'));
  assert.equal(url.origin,'https://discord.com');assert.equal(url.searchParams.get('scope'),'identify');assert.equal(url.searchParams.get('state'),'random');
  let calls=0;
  const user=await discordIdentity('code','123','private','https://example.test/api/callback',async (url,options)=>{
    calls++;
    if(calls===1){assert.equal(options.body.get('grant_type'),'authorization_code');return Response.json({access_token:'secret-token',token_type:'Bearer'});}
    assert.equal(options.headers.Authorization,'Bearer secret-token');return Response.json({id:'123456789012345678',username:'tester',global_name:'Name'});
  });
  assert.deepEqual(user,{id:'123456789012345678',name:'Name',avatar:null,decoration:null,discriminator:'0'});assert.equal(calls,2);
  await assert.rejects(discordIdentity('code','123','secret','https://example.test/',async()=>Response.json({error:'invalid_grant'},{status:400})));
});
test('Discord media uses trusted CDN assets, animated avatars and real decorations', () => {
  const avatar='a_'+'a'.repeat(32),frame='a_'+'b'.repeat(32);
  const media=discordMedia('123456789012345678',avatar,frame);
  assert.match(media.avatarUrl,/^https:\/\/cdn\.discordapp\.com\/avatars\/123456789012345678\/a_a+\.gif\?size=128$/);
  assert.match(media.decorationUrl,/\/avatar-decoration-presets\/a_b+\.png\?size=160$/);
  const fallback=discordMedia('123456789012345678','https://evil.test/image','../../evil','1234');
  assert.equal(fallback.avatarUrl,'https://cdn.discordapp.com/embed/avatars/4.png');assert.equal(fallback.decorationUrl,null);
});
