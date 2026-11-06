import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPremiumRole, handlePremiumRole, premiumRoleId } from '../src/premium-role.js';
import { ids, roleModal } from '../src/ui.js';
test('role modal is separate from reset and the API fails closed',async()=>{
  assert.equal(roleModal().toJSON().custom_id,ids.roleModal);
  const config={website:'https://devil-hub.dev',apiSecret:'fixture'};
  const send=async(url,options)=>{
    assert.equal(url,config.website+'/api/bot/claim-role');
    assert.equal(options.headers.Authorization,'Bearer fixture');
    assert.equal(options.redirect,'error');
    assert.deepEqual(JSON.parse(options.body),{key:'private',discordUserId:'123'});
    return Response.json({ok:true,status:'eligible'});
  };
  assert.equal((await checkPremiumRole(config,'private','123',send)).ok,true);
  assert.equal((await checkPremiumRole(config,'private','123',async()=>Response.json({ok:true}))).ok,false);
  assert.equal((await checkPremiumRole(config,'private','123',async()=>{throw Error('network');})).ok,false);
});
test('successful modal grants only the fixed role to the interacting member privately',async()=>{
  const original=globalThis.fetch;let assigned,recipient,reply,deferred;
  const role={id:premiumRoleId,guild:{id:'guild'},managed:false,permissions:{has:()=>false},comparePositionTo:()=>-1};
  const guild={id:'guild',roles:{fetch:async id=>{assert.equal(id,premiumRoleId);return role;}},members:{
    fetchMe:async()=>({permissions:{has:()=>true},roles:{highest:{}}}),
    fetch:async id=>{recipient=id;return {roles:{add:async r=>{assigned=r.id;}}};}}};
  globalThis.fetch=async()=>Response.json({ok:true,status:'eligible'});
  try{
    const interaction={isButton:()=>false,isModalSubmit:()=>true,customId:ids.roleModal,user:{id:'actor'},
      fields:{getTextInputValue:()=> 'private'},deferReply:async p=>{deferred=p;},editReply:async p=>{reply=p;}};
    assert.equal(await handlePremiumRole(interaction,{user:{displayAvatarURL:()=> 'https://example.com/avatar.png'},guilds:{fetch:async()=>guild}},
      {guildId:'guild',website:'https://devil-hub.dev',apiSecret:'fixture'}),true);
    assert.equal(assigned,premiumRoleId);assert.equal(recipient,'actor');assert.equal(deferred.flags,64);
    assert.ok(!JSON.stringify(reply).includes('private'));assert.match(reply.embeds[0].toJSON().description,/Success/);
    assigned=undefined;
    globalThis.fetch=async()=>Response.json({error:'premium_required'},{status:403});
    await handlePremiumRole(interaction,{user:{displayAvatarURL:()=> 'https://example.com/avatar.png'},guilds:{fetch:async()=>guild}},
      {guildId:'guild',website:'https://devil-hub.dev',apiSecret:'fixture'});
    assert.equal(assigned,undefined);assert.match(reply.embeds[0].toJSON().description,/Failed/);
  }finally{globalThis.fetch=original;}
});
