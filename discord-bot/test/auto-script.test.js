import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ChannelType,MessageFlags} from 'discord.js';
import {createAutoScript} from '../src/auto-script.js';
import {scriptResult} from '../src/auto-script-ui.js';
import {checkLua,generateLua} from '../src/lua-generator.js';
import {autoScriptCommand,removeAutoScriptCommand} from '../src/commands.js';
const config={guildId:'223456789012345678',website:'https://devil-hub.dev',apiSecret:'test-only-'.repeat(5)};
const channelId='323456789012345678',avatar='https://cdn.discordapp.com/embed/avatars/0.png';
const result={name:'Native fly',placement:'StarterPlayerScripts / LocalScript',notes:'Use the GUI.',code:'print("hello")',refusal:''};
async function setup(overrides={}){
  const dir=await mkdtemp(join(tmpdir(),'devil-auto-'));const directory=pathToFileURL(dir+'/');let generated=0;
  const client={user:{id:'bot',displayAvatarURL:()=>avatar}};
  const options={directory,generate:async()=>{generated++;return result;},check:async()=>({checked:true,valid:true}),...overrides};
  let bot=await createAutoScript(client,config,options);
  const channel={id:channelId,guildId:config.guildId,type:ChannelType.GuildText,permissionsFor:()=>({has:()=>true})};
  const command=async(name='auto-create-script',permission=true)=>{
    let output;await bot.handle({isChatInputCommand:()=>true,commandName:name,guildId:config.guildId,memberPermissions:{has:()=>permission},
      options:{getChannel:()=>channel},deferReply:async p=>assert.equal(p.flags,MessageFlags.Ephemeral),editReply:async p=>{output=p;}});return output;
  };
  let serial=0;
  const message=(extra={})=>{
    const edits=[],dms=[],publicReplies=[];
    const msg={id:String(423456789012345678n+BigInt(serial++)),guildId:config.guildId,channelId,content:'Create a fly GUI',
      author:{id:'123456789012345678',bot:false,send:async p=>{dms.push(p);return{edit:async p=>edits.push(p)};}},reply:async p=>publicReplies.push(p),...extra};
    return{msg,edits,dms,publicReplies};
  };
  return{dir,options,client,get bot(){return bot;},get generated(){return generated;},command,message,
    reopen:async()=>{bot=await createAutoScript(client,config,options);},cleanup:async()=>{bot.stop();await rm(dir,{recursive:true,force:true});}};
}
test('channel commands persist and restore, reject non-admins and stop responding after removal',async()=>{
  const f=await setup();try{
    assert.match(await f.command('auto-create-script',false),/Manage Server/);
    const ignored=f.message();await f.bot.onMessage(ignored.msg);assert.equal(ignored.dms.length,0);
    await f.command();assert.ok(JSON.parse(await readFile(join(f.dir,'auto-script.json'),'utf8')).channels[channelId]);
    await f.reopen();const enabled=f.message();await f.bot.onMessage(enabled.msg);assert.equal(f.generated,1);
    assert.match(JSON.stringify(enabled.edits),/```lua/);assert.ok(!JSON.stringify(enabled.publicReplies).includes('print('));
    await f.command('remove-autocreate-script');await f.reopen();const removed=f.message();await f.bot.onMessage(removed.msg);assert.equal(removed.dms.length,0);
    for(const c of[autoScriptCommand,removeAutoScriptCommand])assert.equal(c.toJSON().options[0].required,true);
  }finally{await f.cleanup();}
});
test('long output is a complete private txt attachment; public notice follows only successful delivery',async()=>{
  const code='-- '+ 'long'.repeat(1500),f=await setup({generate:async()=>({...result,code})});try{
    await f.command();const m=f.message();await f.bot.onMessage(m.msg);
    assert.equal(m.edits[0].files.length,1);assert.equal(m.edits[0].files[0].attachment.toString('utf8'),code);
    assert.match(m.publicReplies[0].content,/complete .txt file in DM/);assert.equal(m.publicReplies[0].embeds,undefined);
    const embed=m.edits[0].embeds[0].toJSON();assert.equal(embed.thumbnail.url,avatar);assert.ok(embed.timestamp);assert.ok(embed.fields.some(x=>x.name==='Timeout'));
    assert.ok(!m.publicReplies[0].content.includes(code));
    const closed=f.message({author:{id:'999999999999999999',bot:false,send:async()=>{throw Object.assign(new Error(),{code:50007});}}});
    await f.bot.onMessage(closed.msg);assert.match(closed.publicReplies[0].content,/could not send/);assert.ok(!closed.publicReplies[0].content.includes('sent the complete'));
  }finally{await f.cleanup();}
});
test('duplicates, bots and simultaneous jobs are bounded before generation',async()=>{
  let release;const waiting=new Promise(resolve=>{release=resolve;}),jobs=[];
  const f=await setup({generate:async(_,input)=>{jobs.push(input);await waiting;return result;}});try{
    await f.command();const a=f.message(),b=f.message({author:{id:'999999999999999999',bot:false,send:aDummy}}),c=f.message({author:{id:'888888888888888888',bot:false,send:aDummy}});
    async function aDummy(){return{edit:async()=>{}};}
    const first=f.bot.onMessage(a.msg),second=f.bot.onMessage(b.msg);await new Promise(resolve=>setImmediate(resolve));
    await f.bot.onMessage(a.msg);await f.bot.onMessage(c.msg);assert.equal(jobs.length,2);
    const robot=f.message({author:{bot:true}});await f.bot.onMessage(robot.msg);assert.equal(jobs.length,2);
    release();await Promise.all([first,second]);
  }finally{release();await f.cleanup();}
});
test('removing a configured channel cancels pending generation without delivering code',async()=>{
  let entered;const started=new Promise(resolve=>{entered=resolve;});
  const f=await setup({generate:async(_c,_i,signal)=>{entered();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('Cancelled')),{once:true}));}});try{
    await f.command();const m=f.message(),running=f.bot.onMessage(m.msg);await started;
    await f.command('remove-autocreate-script');await running;
    assert.ok(!JSON.stringify(m.edits).includes('print('));assert.match(JSON.stringify(m.edits),/Cancelled/);
  }finally{await f.cleanup();}
});
test('code blocks obey embed limits; unsafe fences use attachments; syntax checking compiles without running',async()=>{
  const small=scriptResult(result,avatar,{checked:true});assert.equal(small.long,false);assert.ok(small.embeds[0].toJSON().description.length<=4096);
  assert.equal(scriptResult({...result,code:'-- ``` comment'},avatar).long,true);
  assert.deepEqual(await checkLua('error("This code must never run")'),{checked:true,valid:true});
  assert.deepEqual(await checkLua('local = syntax error'),{checked:true,valid:false});
  assert.deepEqual(await checkLua('print("ok")','does-not-exist'),{checked:false,valid:true});
  let captured;const response=await generateLua(config,{prompt:'GUI'},new AbortController().signal,async(url,options)=>{captured={url,options};return Response.json({ok:true,...result});});
  assert.equal(response.code,result.code);assert.equal(captured.options.redirect,'error');assert.equal(captured.options.headers.Authorization,'Bearer '+config.apiSecret);
});
