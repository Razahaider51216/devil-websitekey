import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {MessageFlags,ChannelType} from 'discord.js';
import {createVerifier} from '../src/verify.js';
import {defaultVerifyOptions} from '../src/verify-setup.js';
import {verifyPanel,verifyInfo,legacyVerificationInfo} from '../src/verify-ui.js';
import {acquireBotLock,createInteractionGate} from '../src/process-guard.js';

test('drafts restore the previous panel, save unpublished edits to disk and recover old controls after a bot restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'devil-verify-save-')),guildId='423456789012345678',channelId='523456789012345678',roleId='623456789012345678';
 const config={guildId,applicationId:'123456789012345678',website:'https://devil-hub.dev',apiSecret:'test-only-'.repeat(5)};
 const original={...defaultVerifyOptions(config.website),title:'Published title',roleId,messageId:'public-panel',infoText:legacyVerificationInfo};
 let editor,modal;const errors=[];
 const guild={id:guildId,ownerId:'owner',channels:{fetch:async()=>({id:channelId,guildId,type:ChannelType.GuildText})}};
 const client={user:{displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'}};
 const base={guild,guildId,channelId,user:{id:'owner'},memberPermissions:{has:()=>true},deferReply:async payload=>assert.equal(payload.flags,MessageFlags.Ephemeral),deferUpdate:async()=>{},reply:async p=>errors.push(p),followUp:async p=>errors.push(p),editReply:async p=>{editor=p;},showModal:async m=>{modal=m;}};
 const command=()=>({...base,isChatInputCommand:()=>true,commandName:'set-verify'});
 const fields=values=>({getTextInputValue:key=>values[key]||'',getUploadedFiles:()=>null});
 try{
  await writeFile(join(dir,'verify.json'),JSON.stringify({panels:{[channelId]:original},jobs:{}}));
  let verifier=await createVerifier(client,config,{directory:pathToFileURL(dir+'/')});
  await verifier.handle(command());assert.match(JSON.stringify(editor),/Published title/);
  const rows=editor.components[0].toJSON().components;
  assert.equal(rows.find(r=>r.type===1&&r.components[0].type===8).components[0].default_values[0].id,channelId);
  assert.equal(rows.find(r=>r.type===1&&r.components[0].type===6).components[0].default_values[0].id,roleId);
  const prefix=rows.at(-1).components[0].custom_id.replace(/text$/,'');
  const control=(action,extra={})=>({...base,isChatInputCommand:()=>false,customId:prefix+action,...extra});
  await verifier.handle(control('text-save',{fields:fields({title:'Unpublished saved title',description:'Draft description','info-text':'Custom instructions'})}));
  await verifier.handle(control('appearance-save',{fields:fields({label:'Verify now','info-label':'Guide',emoji:'<:verify:1546638487845867550>','info-emoji':'<a:info:1565299349099909120>',color:'#123abc'})}));
  const onDisk=JSON.parse(await readFile(join(dir,'verify.json'),'utf8'));
  assert.equal(onDisk.panels[channelId].title,'Published title');assert.equal(onDisk.setupDrafts[guildId+':owner'].options.title,'Unpublished saved title');
  await verifier.handle(command());assert.match(JSON.stringify(editor),/Unpublished saved title/);
  await verifier.handle(control('channel',{values:[channelId]}));assert.match(JSON.stringify(editor),/Unpublished saved title/,'reselecting the same channel must not overwrite a draft');
  verifier=await createVerifier(client,config,{directory:pathToFileURL(dir+'/')});
  await verifier.handle(control('appearance'));const values=Object.fromEntries(modal.toJSON().components.map(c=>[c.component.custom_id,c.component.value||'']));
  assert.equal(values.label,'Verify now');assert.equal(values['info-emoji'],'<a:info:1565299349099909120>');
  await verifier.handle(command());assert.match(JSON.stringify(editor),/Unpublished saved title/);assert.deepEqual(errors,[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('both public buttons accept custom emojis and existing Info panels always include Thai and English',()=>{
 const options={...defaultVerifyOptions('https://devil-hub.dev'),emoji:'<:verify:1546638487845867550>',infoEmoji:'<a:info:1565299349099909120>'};
 const buttons=verifyPanel(options,'https://cdn.discordapp.com/embed/avatars/0.png').components[0].toJSON().components.at(-1).components;
 assert.equal(buttons[0].emoji.id,'1546638487845867550');assert.equal(buttons[1].emoji.id,'1565299349099909120');assert.equal(buttons[1].emoji.animated,true);
 for(const message of [legacyVerificationInfo,'Custom instructions']){
  const content=JSON.stringify(verifyInfo(message,'https://cdn.discordapp.com/embed/avatars/0.png').components[0].toJSON());assert.match(content,/ภาษาไทย/);assert.match(content,/English/);
 }
});
test('OS lock rejects duplicate bot processes and interaction gate rejects duplicate acknowledgements',async()=>{
 const applicationId='unit-test-'+process.pid;
 const first=await acquireBotLock(applicationId);
 try{await assert.rejects(acquireBotLock(applicationId),/already running/);}finally{await first.close();}
 const next=await acquireBotLock(applicationId);await next.close();
 let now=100;const gate=createInteractionGate(()=>now);assert.equal(gate('same-interaction'),true);assert.equal(gate('same-interaction'),false);assert.equal(gate('new-interaction'),true);now+=900001;assert.equal(gate('same-interaction'),true);
});
