import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageFlags,PermissionFlagsBits,ChannelType } from 'discord.js';
import { verifyCommand } from '../src/commands.js';
import { parseButtonEmoji,verifyPanel,verifyPrompt,verifyResult,validateGrantRole,imageUrl,verifyIds } from '../src/verify-ui.js';
import { createVerifier } from '../src/verify.js';
import { createVerifySetup,setupPanel,setupModal,defaultVerifyOptions,setupPrefix } from '../src/verify-setup.js';
const avatar='https://cdn.discordapp.com/embed/avatars/0.png';
const options={title:'DEVIL HUB',description:'> Verify your identity',label:'Verify Now',style:'green',emoji:'<a:verify:1546638487845867550>',color:0x38bdf8,image:'https://devil-hub.dev/devilhubv3.png',infoLabel:'Help',infoText:'Instructions',roleId:'623456789012345678'};
test('/set-verify opens a private setup panel without any command arguments',()=>{
  const command=verifyCommand.toJSON();assert.equal(command.name,'set-verify');assert.equal(command.options?.length||0,0);
  assert.equal(command.default_member_permissions,String(PermissionFlagsBits.ManageGuild|PermissionFlagsBits.ManageRoles));
  const draft={id:'a'.repeat(24),channelId:null,roleId:null,options:defaultVerifyOptions('https://devil-hub.dev')};
  const rows=setupPanel(draft).components[0].toJSON().components;
  assert.ok(rows.some(row=>row.type===1&&row.components[0].type===8));assert.ok(rows.some(row=>row.type===1&&row.components[0].type===6));
  assert.equal(rows.at(-1).components.at(-1).disabled,true);
  assert.equal(setupModal(draft,'text').toJSON().components.length,3);
  assert.equal(setupModal(draft,'appearance').toJSON().components.length,4);
  assert.equal(setupModal(draft,'image').toJSON().components[1].component.type,19);
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
  let serverStatus='pending',grants=0,privateResult,privatePrompt,editor;
  const guild={id:guildId,name:'DEVIL HUB',ownerId:'owner',channels:{fetch:async()=>channel},roles:{fetch:async()=>role},members:{fetchMe:async()=>me,fetch:async memberId=>memberId===userId?member:actor}};
  const role={id:options.roleId,name:'Verified',guild,managed:false,permissions:{has:()=>false},comparePositionTo:()=>-1};
  const me={permissions:{has:()=>true},roles:{highest:{position:10}}},actor={id:'owner',roles:{highest:{position:10}}},member={roles:{add:async()=>{grants++;}}};
  const channel={id:channelId,guildId,type:ChannelType.GuildText,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async()=>({id:'panel'}),messages:{}};
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
    const admin={guild,guildId,user:{id:'owner'},memberPermissions:{has:()=>true},reply:async payload=>{editor=payload;},deferUpdate:async()=>{},editReply:async payload=>{editor=payload;},followUp:async()=>{throw new Error('Unexpected setup failure');}};
    await verifier.handle({...admin,isChatInputCommand:()=>true,commandName:'set-verify'});
    assert.equal(editor.flags,MessageFlags.IsComponentsV2|MessageFlags.Ephemeral);
    const controls=editor.components[0].toJSON().components;
    const channelControl=controls.find(row=>row.type===1&&row.components[0].type===8).components[0].custom_id;
    const roleControl=controls.find(row=>row.type===1&&row.components[0].type===6).components[0].custom_id;
    const publishControl=controls.at(-1).components.at(-1).custom_id;
    for(const [customId,value]of [[channelControl,channelId],[roleControl,role.id],[publishControl,null]])await verifier.handle({...admin,isChatInputCommand:()=>false,customId,values:value?[value]:[]});
    const click={isChatInputCommand:()=>false,isButton:()=>true,customId:verifyIds.verify,channelId,guildId,guild,message:{id:'panel'},user:{id:userId},id:'723456789012345678',token:'private-interaction-token',deferReply:async payload=>assert.equal(payload.flags,MessageFlags.Ephemeral),editReply:async payload=>{privatePrompt=payload;}};
    await verifier.handle(click);assert.ok(privatePrompt);await verifier.poll();assert.equal(grants,0);
    serverStatus='approved';await verifier.poll();assert.equal(grants,1);assert.equal(privateResult.auth,false);assert.match(JSON.stringify(privateResult.body),/Verification Successful/);
    await verifier.poll();assert.equal(grants,1);verifier.stop();
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('setup panel edits drafts through private controls, validates input and isolates administrators before publishing',async()=>{
  const guildId='423456789012345678',channelId='523456789012345678',roleId='623456789012345678';
  let editor,shownModal,preview,errors=[],published;
  const guild={id:guildId,ownerId:'owner',channels:{fetch:async()=>({id:channelId,guildId,type:ChannelType.GuildText})},roles:{fetch:async()=>role},members:{fetchMe:async()=>({permissions:{has:()=>true},roles:{highest:{}}}),fetch:async()=>({id:'owner'})}};
  const role={id:roleId,guild,managed:false,permissions:{has:()=>false},comparePositionTo:()=>-1};
  const client={user:{displayAvatarURL:()=>avatar}};
  const setup=createVerifySetup({client,config:{guildId,website:'https://devil-hub.dev'},getPanel:()=>null,publish:async(_i,draft)=>{published=structuredClone(draft);}});
  const base={guild,guildId,user:{id:'owner'},memberPermissions:{has:()=>true},reply:async payload=>{editor=payload;},deferUpdate:async()=>{},editReply:async payload=>{editor=payload;},followUp:async payload=>{errors.push(payload);},showModal:async modal=>{shownModal=modal;}};
  await setup.handle({...base,isChatInputCommand:()=>true,commandName:'set-verify'});
  const raw=editor.components[0].toJSON();const prefix=raw.components.at(-1).components[0].custom_id.replace(/text$/,'');
  const control=(action,extra={})=>({...base,isChatInputCommand:()=>false,customId:prefix+action,...extra});
  await setup.handle(control('channel',{values:[channelId]}));await setup.handle(control('role',{values:[roleId]}));
  await setup.handle(control('text'));assert.equal(shownModal.toJSON().custom_id,prefix+'text-save');
  const fields=values=>({getTextInputValue:name=>values[name]||'',getUploadedFiles:()=>null});
  await setup.handle(control('text-save',{fields:fields({title:'Custom title',description:'> Custom description', 'info-text':'Custom help'})}));
  await setup.handle(control('appearance-save',{fields:fields({label:'Verify me','info-label':'Help',emoji:'<:verify:1546638487845867550>',color:'#123abc'})}));
  await setup.handle(control('image-save',{fields:fields({'image-url':'https://example.test/image.png'})}));
  await setup.handle(control('style',{values:['blue']}));
  await setup.handle(control('preview',{reply:async payload=>{preview=payload;}}));assert.equal(preview.flags,MessageFlags.IsComponentsV2|MessageFlags.Ephemeral);
  assert.ok(preview.components[0].components.at(-1).components.every(button=>button.disabled));assert.equal(published,undefined);
  let blocked;await setup.handle(control('publish',{user:{id:'another-admin'},reply:async payload=>{blocked=payload;}}));assert.ok(blocked);assert.equal(published,undefined);
  await setup.handle(control('appearance-save',{fields:fields({label:'Bad','info-label':'Help',emoji:'not emoji',color:'#123abc'}),reply:async payload=>errors.push(payload)}));
  assert.equal(errors.length,1);
  await setup.handle(control('publish'));assert.equal(published.channelId,channelId);assert.equal(published.roleId,roleId);assert.equal(published.options.title,'Custom title');assert.equal(published.options.label,'Verify me');assert.equal(published.options.color,0x123abc);assert.equal(published.options.style,'blue');assert.equal(published.options.image,'https://example.test/image.png');
});
