import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTurnstile } from '../lib/turnstile.ts';
test('human verification requires Cloudflare success and the correct hostname, action and session', async () => {
  const valid={success:true, hostname:'devil.example', action:'devil-key-claim', cdata:'session-hash'};
  const check = data => verifyTurnstile('server-secret','token','devil.example','session-hash',async(url,options) => {
    assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(options.body.get('secret'),'server-secret');
    assert.equal(options.body.get('response'),'token');
    return Response.json(data);
  });
  assert.equal(await check(valid),true);
  for(const bad of [{...valid,success:false},{...valid,hostname:'other.example'}, {...valid,action:'other'}, {...valid,cdata:'other-session'},{}]) assert.equal(await check(bad),false);
  const noFetch=()=>{throw new Error('must not contact service')};
  assert.equal(await verifyTurnstile('secret','','host','session',noFetch),false);
  assert.equal(await verifyTurnstile('', 'token','host','session',noFetch),false);
  assert.equal(await verifyTurnstile('secret','x'.repeat(2049),'host','session',noFetch),false);
  await assert.rejects(()=>verifyTurnstile('secret','token','host','session',async()=>new Response('',{status:503})));
});
