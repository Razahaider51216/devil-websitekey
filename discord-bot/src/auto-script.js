import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {ChannelType,MessageFlags,PermissionFlagsBits} from 'discord.js';
import {generateLua,checkLua} from './lua-generator.js';
import {generationTimeout,scriptResult,channelProgress,channelPreview,channelFailure} from './auto-script-ui.js';

export async function createAutoScript(client,config,{directory=new URL('../data/',import.meta.url),generate=generateLua,check=checkLua,now=Date.now}={}){
  const file=new URL('auto-script.json',directory);let channels={};
  try{channels=JSON.parse(await readFile(file,'utf8')).channels||{};}catch(error){if(error.code!=='ENOENT')throw new Error('Auto-script channel state is invalid.');}
  const active=new Map(),cooldown=new Map(),seen=new Map(),notified=new Map();let writing=Promise.resolve(),configuring=Promise.resolve();let closing=false;
  const avatar=()=>client.user.displayAvatarURL({size:128,extension:'png'});
  const save=()=>{const body=JSON.stringify({channels});const next=writing.then(async()=>{
    await mkdir(directory,{recursive:true});await writeFile(new URL('auto-script.tmp',directory),body,'utf8');await rename(new URL('auto-script.tmp',directory),file);
  });writing=next.catch(()=>{});return next;};
  async function handle(interaction){
    if(!interaction.isChatInputCommand()||!['auto-create-script','remove-autocreate-script'].includes(interaction.commandName))return false;
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    if(interaction.guildId!==config.guildId||!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)){
      await interaction.editReply('This command requires Manage Server. / คำสั่งนี้สำหรับผู้ดูแลเซิร์ฟเวอร์');return true;
    }
    const channel=interaction.options.getChannel('channel',true);
    if(channel.guildId!==config.guildId||![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type)){
      await interaction.editReply('Choose a text channel in this server.');return true;
    }
    const enabled=interaction.commandName==='auto-create-script';
    if(enabled&&!channel.permissionsFor(client.user)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks])){
      await interaction.editReply('The bot needs View Channel, Send Messages and Embed Links in that channel.');return true;
    }
    const change=configuring.then(async()=>{
      const previous=channels[channel.id];
      if(enabled)channels[channel.id]={guildId:config.guildId,revision:crypto.randomUUID()};else delete channels[channel.id];
      try{await save();}catch(error){if(previous)channels[channel.id]=previous;else delete channels[channel.id];throw error;}
      for(const job of active.values())if(job.channelId===channel.id)job.controller.abort();
    });configuring=change.catch(()=>{});await change;
    await interaction.editReply({content:enabled?`Enabled in <#${channel.id}>. Progress and a code preview appear here; the complete file is sent by DM.\nเปิดแล้ว แสดงสถานะและตัวอย่างโค้ดในช่องนี้ ส่งไฟล์ฉบับเต็มทาง DM`
      :`Disabled in <#${channel.id}>. / ปิดระบบสร้างสคริปต์ในช่องนี้แล้ว`,allowedMentions:{parse:[]}});
    return true;
  }
  async function onMessage(message){
    const setting=channels[message.channelId];
    if(closing||!setting||message.guildId!==config.guildId||message.author.bot||message.webhookId)return;
    const time=now();for(const[id,expiry]of seen)if(expiry<=time)seen.delete(id);
    if(seen.has(message.id))return;seen.set(message.id,time+15*60_000);
    if(!message.content?.trim())return;
    const userId=message.author.id;
    if(active.has(userId)||active.size>=2||(cooldown.get(userId)||0)>time){
      if((notified.get(userId)||0)<=time){
        notified.set(userId,time+30_000);
        try{await message.reply(channelFailure('The generator is busy or you recently sent a request. Please wait 30 seconds and try again. / กรุณารอ 30 วินาทีแล้วลองใหม่',avatar(),{userId,request:message.content}));}catch{/* The channel may be unavailable. */}
      }
      return;
    }
    // Reserve before awaiting Discord so simultaneous requests cannot exceed
    // the user/global concurrency limits.
    const controller=new AbortController(),job={controller,channelId:message.channelId};active.set(userId,job);cooldown.set(userId,time+30_000);
    const timer=setTimeout(()=>controller.abort(),generationTimeout);const started=now();
    const valid=()=>!closing&&!controller.signal.aborted&&channels[message.channelId]===setting;
    let pending,heartbeat,stage='Writing your Lua system…',updates=Promise.resolve();
    const options=()=>({userId,request:message.content,elapsed:now()-started,stage});
    // Serialize edits so a delayed progress update cannot overwrite the result.
    const update=payload=>{updates=updates.then(()=>pending.edit(payload)).catch(()=>{});return updates;};
    const stopProgress=()=>clearInterval(heartbeat);
    controller.signal.addEventListener('abort',stopProgress,{once:true});
    try{
      pending=await message.reply(channelProgress(avatar(),options()));
      if(message.content.length>2000)throw new Error('Keep the request under 2,000 characters. / กรุณาใช้คำขอไม่เกิน 2,000 ตัวอักษร');
      if(!valid())throw new Error('Generation was cancelled because this channel was disabled.');
      heartbeat=setInterval(()=>{if(valid())void update(channelProgress(avatar(),options()));},5000);
      const result=await generate(config,{prompt:message.content.trim(),userId,guildId:message.guildId,channelId:message.channelId,messageId:message.id},controller.signal);
      if(!valid())throw new Error('Generation was cancelled or timed out. Please try again.');
      stage='Checking Lua syntax…';await update(channelProgress(avatar(),options()));
      let syntax={checked:false,valid:true};if(!result.refusal)syntax=await check(result.code);
      if(!valid())throw new Error('Generation was cancelled or timed out. Please try again.');
      if(!syntax.valid)throw new Error('The generated code failed syntax checks. Please request a smaller system and try again. / โค้ดไม่ผ่านการตรวจไวยากรณ์ กรุณาลองขอระบบที่เล็กลง');
      const {long,...payload}=scriptResult(result,avatar(),{elapsed:now()-started,checked:syntax.checked,requestId:message.id});
      stage='Sending the complete file by DM…';await update(channelProgress(avatar(),options()));
      let delivered=false;
      if(valid())try{await message.author.send(payload);delivered=true;}catch{/* Report failed DM delivery in the channel without publishing the full file. */}
      stopProgress();
      if(!valid())throw new Error('Generation was cancelled or timed out. Please try again.');
      await update(channelPreview(result,avatar(),{...options(),delivered,checked:syntax.checked}));
    }catch(error){
      stopProgress();
      if(pending)await update(channelFailure(error.message?.slice(0,400)||'Generation failed. Please try again.',avatar(),options()));
    }finally{stopProgress();controller.signal.removeEventListener('abort',stopProgress);clearTimeout(timer);if(active.get(userId)===job)active.delete(userId);for(const map of[cooldown,notified])for(const[id,expiry]of map)if(expiry<=now())map.delete(id);}
  }
  function stop(){closing=true;for(const job of active.values())job.controller.abort();}
  return{handle,onMessage,stop};
}
