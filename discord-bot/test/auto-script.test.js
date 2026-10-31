import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ChannelType,MessageFlags} from 'discord.js';
import {createAutoScript} from '../src/auto-script.js';
import {scriptResult,channelPreview} from '../src/auto-script-ui.js';
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
    const edits=[],dms=[],publicReplies=[],publicEdits=[];
    const msg={id:String(423456789012345678n+BigInt(serial++)),guildId:config.guildId,channelId,content:'Create a fly GUI',
      author:{id:'123456789012345678',bot:false,send:async p=>{dms.push(p);return{edit:async p=>edits.push(p)};}},reply:async p=>{publicReplies.push(p);return{edit:async p=>publicEdits.push(p)};},...extra};
    return{msg,edits,dms,publicReplies,publicEdits};
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
    assert.match(JSON.stringify(enabled.dms),/```lua/);
    assert.match(JSON.stringify(enabled.publicEdits.at(-1)),/Lua preview/);
    assert.equal(enabled.publicReplies.length,1);
    assert.deepEqual(enabled.publicReplies[0].allowedMentions,{parse:[],users:[enabled.msg.author.id],repliedUser:false});
    assert.equal(enabled.dms[0].files[0].attachment.toString('utf8'),result.code);
    await f.command('remove-autocreate-script');await f.reopen();const removed=f.message();await f.bot.onMessage(removed.msg);assert.equal(removed.dms.length,0);
    for(const c of[autoScriptCommand,removeAutoScriptCommand])assert.equal(c.toJSON().options[0].required,true);
  }finally{await f.cleanup();}
});
test('channel shows a bounded preview, requester and timing; complete txt stays in DM; blocked DMs are reported honestly',async()=>{
  const code='-- '+ 'long'.repeat(1500),f=await setup({generate:async()=>({...result,code})});try{
    await f.command();const m=f.message();await f.bot.onMessage(m.msg);
    assert.equal(m.dms[0].files.length,1);assert.equal(m.dms[0].files[0].attachment.toString('utf8'),code);
    const publicResult=m.publicEdits.at(-1);
    assert.match(publicResult.content,/complete `.txt` file has been sent/);
    const embed=publicResult.embeds[0].toJSON();assert.equal(embed.thumbnail.url,avatar);assert.ok(embed.timestamp);assert.ok(embed.fields.some(x=>x.name.endsWith('Timeout')));
    assert.ok(embed.fields.some(x=>x.name.endsWith('Requested by')&&x.value.includes(m.msg.author.id)));
    assert.ok(embed.fields.some(x=>x.name.endsWith('System')&&x.value.includes(result.name)));
    assert.ok(embed.fields.some(x=>x.name.endsWith('Elapsed')));
    assert.ok(embed.description.startsWith('<a:emoji_25:1540658596487102464>'));
    assert.match(embed.description,/```lua/);assert.ok(embed.description.length<1500);
    assert.ok(!JSON.stringify(publicResult).includes(code));assert.equal(publicResult.files,undefined);
    const closed=f.message({author:{id:'999999999999999999',bot:false,send:async()=>{throw Object.assign(new Error(),{code:50007});}}});
    await f.bot.onMessage(closed.msg);assert.match(closed.publicEdits.at(-1).content,/could not send/);
    assert.ok(closed.publicEdits.at(-1).embeds[0].toJSON().description.startsWith('<:ojic_018:1546638491478265946>'));
    assert.match(JSON.stringify(closed.publicEdits.at(-1)),/DM delivery failed/);
    assert.ok(!closed.publicEdits.at(-1).content.includes('has been sent'));
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
    assert.equal(m.dms.length,0);
    assert.ok(!JSON.stringify(m.publicEdits).includes('print('));assert.match(JSON.stringify(m.publicEdits),/Cancelled/);
  }finally{await f.cleanup();}
});
test('code blocks obey embed limits; unsafe fences use attachments; syntax checking compiles without running',async()=>{
  const small=scriptResult(result,avatar,{checked:true});assert.equal(small.long,false);assert.ok(small.embeds[0].toJSON().description.length<=4096);
  assert.equal(scriptResult({...result,code:'-- ``` comment'},avatar).long,true);
  const preview=channelPreview({...result,code:'-- ``` comment\n'+'print("hi")\n'.repeat(200)},avatar,{userId:'123456789012345678',request:'@everyone',delivered:true});
  assert.equal(preview.embeds[0].toJSON().description.match(/```/g).length,2);
  assert.ok(preview.embeds[0].toJSON().description.length<1500);
  assert.deepEqual(preview.allowedMentions.parse,[]);
  assert.deepEqual(await checkLua('error("This code must never run")'),{checked:true,valid:true});
  assert.deepEqual(await checkLua('local = syntax error'),{checked:true,valid:false});
  assert.deepEqual(await checkLua('print("ok")','does-not-exist'),{checked:false,valid:true});
  let captured;const response=await generateLua(config,{prompt:'GUI'},new AbortController().signal,async(url,options)=>{captured={url,options};return Response.json({ok:true,...result});});
  assert.equal(response.code,result.code);assert.equal(captured.options.redirect,'error');assert.equal(captured.options.headers.Authorization,'Bearer '+config.apiSecret);
});

test('public progress starts before generation and refreshes elapsed time until the final preview',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  let entered,release,time=0;
  const started=new Promise(resolve=>{entered=resolve;}),waiting=new Promise(resolve=>{release=resolve;});
  const f=await setup({now:()=>time,generate:async()=>{entered();await waiting;return result;}});
  try{
    await f.command();const m=f.message(),running=f.bot.onMessage(m.msg);await started;
    assert.match(JSON.stringify(m.publicReplies),/Writing your Lua system/);assert.equal(m.dms.length,0);
    assert.equal(m.publicReplies[0].embeds[0].toJSON().description,'<a:emoji_12:1537864050254422138> Writing your Lua system…');
    time=5000;t.mock.timers.tick(5000);await new Promise(resolve=>setImmediate(resolve));
    assert.match(JSON.stringify(m.publicEdits),/5.0s/);
    release();await running;
    const edits=m.publicEdits.length;t.mock.timers.tick(10000);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(m.publicEdits.length,edits);assert.match(JSON.stringify(m.publicEdits.at(-1)),/Lua preview/);
  }finally{release();await f.cleanup();t.mock.timers.reset();}
});

test('failed checks and refusals never expose generated code or claim DM success',async()=>{
  for(const overrides of[
    {check:async()=>({checked:true,valid:false})},
    {generate:async()=>({...result,code:'',refusal:'Unable to create this system.'})},
  ]){
    const f=await setup(overrides);try{
      await f.command();const m=f.message();await f.bot.onMessage(m.msg);
      assert.ok(!JSON.stringify(m.publicEdits).includes(result.code));
      assert.ok(!m.publicEdits.at(-1).content.includes('has been sent'));
      assert.match(JSON.stringify(m.publicEdits.at(-1)),/Not completed/);
      for(const dm of m.dms)assert.ok(!dm.files?.length);
    }finally{await f.cleanup();}
  }
});
