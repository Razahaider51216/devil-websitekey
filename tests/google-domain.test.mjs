import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')) {
    const url=new URL(specifier,context.parentURL);if(!existsSync(fileURLToPath(url))&&existsSync(fileURLToPath(url)+'.ts'))return next(url.href+'.ts',context);
  }return next(specifier,context);
}});
const {googlePkce,googleAuthorizationUrl,verifyGoogleIdToken,googleIdentity,googleAvatar}=await import('../lib/google-domain.ts');
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'google-test',alg:'RS256',use:'sig'};
const clientId='test.apps.googleusercontent.com',nonce='test-nonce',now=Math.floor(Date.now()/1000);
const base={iss:'https://accounts.google.com',aud:clientId,sub:'123456789012345678',nonce,iat:now,exp:now+3600,name:'Google member',picture:'https://lh3.googleusercontent.com/a/test'};
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function token(claims=base,header={alg:'RS256',kid:'google-test'}) {
  const message=enc(header)+'.'+enc(claims);return message+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(message))).toString('base64url');
}
test('Google authorization requests profile-only access with independent PKCE, state and nonce',async()=>{
  const a=await googlePkce(),b=await googlePkce();assert.notEqual(a.verifier,b.verifier);assert.equal(a.verifier.length,43);
  assert.equal(a.challenge,Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(a.verifier))).toString('base64url'));
  const url=new URL(googleAuthorizationUrl(clientId,'https://devil-hub.dev/api/auth/google/callback','state',nonce,a.challenge));
  assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('scope'),'openid profile');
  assert.equal(url.searchParams.get('state'),'state');assert.equal(url.searchParams.get('nonce'),nonce);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('access_type'),null);
});
test('real RSA verification validates issuer, audience, nonce, expiry and provider-scoped identity',async()=>{
  let fetches=0;const send=async()=>{fetches++;return Response.json({keys:[jwk]},{headers:{'cache-control':'max-age=3600'}});};
  const signed=await token();const user=await verifyGoogleIdToken(signed,clientId,nonce,send);
  assert.equal(user.id,'google:123456789012345678');assert.equal(user.name,'Google member');assert.equal(user.avatarUrl,base.picture);
  await verifyGoogleIdToken(signed,clientId,nonce,send);assert.equal(fetches,1,'cache validated public signing keys');
  for(const patch of [{iss:'https://evil.test'},{aud:'other.apps.googleusercontent.com'},{azp:'other'},{nonce:'wrong'},{exp:now-1},{iat:now+3600},{sub:'google:collision'}]) {
    await assert.rejects(verifyGoogleIdToken(await token({...base,...patch}),clientId,nonce,send),e=>e.code==='GOOGLE_TOKEN_INVALID');
  }
  await assert.rejects(verifyGoogleIdToken(await token(base,{alg:'none',kid:'google-test'}),clientId,nonce,send));
  const parts=signed.split('.');parts[1]=enc({...base,sub:'attacker'});
  await assert.rejects(verifyGoogleIdToken(parts.join('.'),clientId,nonce,send),e=>e.code==='GOOGLE_TOKEN_INVALID');
  assert.equal(googleAvatar('https://evil.test/avatar.png'),undefined);assert.equal(googleAvatar('https://lh3.googleusercontent.com.evil.test/a'),undefined);
});
test('Google code exchange sends secret and verifier only server side and rejects unsafe diagnostic details',async()=>{
  const signed=await token();let exchanges=0;
  const send=async(url,opts)=>{
    if(url==='https://oauth2.googleapis.com/token') {
      exchanges++;assert.equal(opts.method,'POST');assert.equal(opts.body.get('client_secret'),'private-client-secret');assert.equal(opts.body.get('code_verifier'),'private-verifier');
      assert.equal(opts.body.get('redirect_uri'),'https://devil-hub.dev/api/auth/google/callback');return Response.json({id_token:signed});
    }
    assert.equal(url,'https://www.googleapis.com/oauth2/v3/certs');return Response.json({keys:[jwk]});
  };
  assert.equal((await googleIdentity('code',clientId,'private-client-secret','https://devil-hub.dev/api/auth/google/callback','private-verifier',nonce,send)).id,base.sub.replace(/^/,'google:'));
  assert.equal(exchanges,1);
  for(const [status,error,code]of [[401,'invalid_client','GOOGLE_CLIENT_INVALID'],[400,'invalid_grant','GOOGLE_GRANT_INVALID'],[429,'rate_limit','GOOGLE_RATE_LIMIT'],[500,'private-detail','GOOGLE_TOKEN_FAILED']]) {
    await assert.rejects(googleIdentity('code',clientId,'secret','https://example.test/','verifier',nonce,async()=>Response.json({error,error_description:'private-detail'},{status})),e=>e.code===code&&!e.message.includes('private-detail'));
  }
  await assert.rejects(googleIdentity('code',clientId,'secret','https://example.test/','verifier',nonce,async()=>{throw new Error('private-detail');}),e=>e.code==='GOOGLE_NETWORK_FAILED');
});
