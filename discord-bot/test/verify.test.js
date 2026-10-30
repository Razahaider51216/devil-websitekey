import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageFlags,PermissionFlagsBits } from 'discord.js';
import { verifyCommand } from '../src/commands.js';
import { parseButtonEmoji,verifyPanel,verifyPrompt,verifyResult,validateGrantRole,imageUrl,verifyIds } from '../src/verify-ui.js';
import { createVerifier } from '../src/verify.js';
const avatar='https://cdn.discordapp.com/embed/avatars/0.png';
const options={title:'DEVIL HUB',description:'> Verify your identity',label:'Verify Now',style:'green',emoji:'<a:verify:1546638487845867550>',color:0x38bdf8,image:'https://devil-hub.dev/devilhubv3.png',infoLabel:'Help',infoText:'Instructions',roleId:'623456789012345678'};
test('/set-verify has channel and role selectors, customizable presentation and manager permissions',()=>{
  const command=verifyCommand.toJSON();assert.equal(command.name,'set-verify');assert.equal(command.options.find(o=>o.name==='channel').required,true);assert.equal(command.options.find(o=>o.name==='role').type,8);
  assert.equal(command.default_member_permissions,String(PermissionFlagsBits.ManageGuild|PermissionFlagsBits.ManageRoles));
  for(const name of ['title','description','button-label','button-color','emoji','color','image-url','image','info-label','info-text'])assert.ok(command.options.some(o=>o.name===name));
});
test('verify Components V2 supports panel image, bot thumbnail, custom emoji/color and requested private result wording',()=>{
  const payload=verifyPanel(options,avatar),container=payload.components[0].toJSON();assert.equal(payload.flags,MessageFlags.IsComponentsV2);assert.equal(container.accent_color,0x38bdf8);
  assert.equal(container.components[0].items[0].media.url,options.image);assert.equal(container.components[1].accessory.media.url,avatar);
  const button=container.components.at(-1).components[0];assert.equal(button.label,'Verify Now');assert.equal(button.style,3);assert.equal(button.emoji.animated,true);
  const prompt=verifyPrompt('https://devil-hub.dev/verify#ticket='+'a'.repeat(64),avatar).components[0].toJSON();
  assert.match(JSON.stringify(prompt),/Verify your identity to receive your role\./);assert.equal(prompt.components.at(-1).components[0].label,'Continue Verification');
  assert.match(JSON.stringify(verifyResult(true,avatar).components[0].toJSON()),/1546638487845867550/);
  assert.match(JSON.stringify(verifyResult(false,avatar).components[0].toJSON()),/1546638491478265946/);
  assert.deepEqual(parseButtonEmoji('<:verify:1546638487845867550>'),{id:'1546638487845867550',name:'verify',animated:false});assert.equal(parseButtonEmoji('🔐'),'🔐');
  assert.throws(()=>parseButtonEmoji('bad emoji'));assert.throws(()=>imageUrl('http://evil.test/image.png'));
});
test('role checks enforce normal roles and both bot and administrator hierarchy',()=>{
  const guild={id:'guild',ownerId:'owner'},role={id:'role',guild,managed:false,permissions:{has:()=>false},comparePositionTo:other=>2-other.position};
  const me={permissions:{has:()=>true},roles:{highest:{position:5}}},actor={id:'operator',roles:{highest:{position:4}}};
  assert.doesNotThrow(()=>validateGrantRole(guild,role,me,actor));assert.throws(()=>validateGrantRole(guild,{...role,managed:true},me,actor));
  assert.throws(()=>validateGrantRole(guild,role,{...me,roles:{highest:{position:1}}},actor));assert.throws(()=>validateGrantRole(guild,role,me,{...actor,roles:{highest:{position:1}}}));
});
test('bot sends an ephemeral destination panel, grants no role before web approval, then edits only the private reply',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'devil-verify-')),guildId='423456789012345678',channelId='523456789012345678',userId='223456789012345678',id='b'.repeat(64);
  let serverStatus='pending',grants=0,privateResult,privatePrompt;
  const guild={id:guildId,name:'DEVIL HUB',ownerId:'owner',roles:{fetch:async()=>role},members:{fetchMe:async()=>me,fetch:async memberId=>memberId===userId?member:actor}};
  const role={id:options.roleId,name:'Verified',guild,managed:false,permissions:{has:()=>false},comparePositionTo:()=>-1};
  const me={permissions:{has:()=>true},roles:{highest:{position:10}}},actor={id:'owner',roles:{highest:{position:10}}},member={roles:{add:async()=>{grants++;}}};
  const channel={id:channelId,guildId,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async()=>({id:'panel'}),messages:{}};
  const client={user:{id:'bot',displayAvatarURL:()=>avatar},isReady:()=>true,guilds:{fetch:async()=>guild},rest:{patch:async(_route,payload)=>{privateResult=payload;}}};
  const config={website:'https://devil-hub.dev',guildId,applicationId:'123456789012345678',apiSecret:'fixture-only-secret-'.repeat(2)};
  const send=async(url,request)=>{
    const input=JSON.parse(request.body);assert.equal(request.headers.Authorization,'Bearer '+config.apiSecret);
    if(url.endsWith('/start'))return Response.json({id,ticket:'a'.repeat(64),expiresAt:Date.now()+600000});
    if(url.endsWith('/poll'))return Response.json({jobs:[{id,userId,guildId,roleId:role.id,status:serverStatus}]});
    if(url.endsWith('/finish')){assert.equal(input.ok,true);serverStatus='done';return Response.json({status:'done'});}
    throw new Error('Unexpected HTTP');
  };
  try{
    const verifier=await createVerifier(client,config,{directory:pathToFileURL(directory+'/'),send});
    await verifier.handle({isChatInputCommand:()=>true,commandName:'set-verify',memberPermissions:{has:()=>true},guild,user:{id:'owner'},options:{getChannel:()=>channel,getRole:()=>role,getString:()=>null,getAttachment:()=>null},deferReply:async()=>{},editReply:async()=>{}});
    const click={isChatInputCommand:()=>false,isButton:()=>true,customId:verifyIds.verify,channelId,guildId,guild,message:{id:'panel'},user:{id:userId},id:'723456789012345678',token:'private-interaction-token',deferReply:async payload=>assert.equal(payload.flags,MessageFlags.Ephemeral),editReply:async payload=>{privatePrompt=payload;}};
    await verifier.handle(click);assert.ok(privatePrompt);await verifier.poll();assert.equal(grants,0);
    serverStatus='approved';await verifier.poll();assert.equal(grants,1);assert.equal(privateResult.auth,false);assert.match(JSON.stringify(privateResult.body),/Verification Successful/);
    await verifier.poll();assert.equal(grants,1);verifier.stop();
  }finally{await rm(directory,{recursive:true,force:true});}
});
