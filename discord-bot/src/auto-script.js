import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {ChannelType,MessageFlags,PermissionFlagsBits} from 'discord.js';
import {generateLua,checkLua} from './lua-generator.js';
import {generationTimeout,progress,scriptError,scriptResult} from './auto-script-ui.js';

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
    if(enabled&&!channel.permissionsFor(client.user)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages])){
      await interaction.editReply('The bot needs View Channel and Send Messages in that channel.');return true;
    }
    const change=configuring.then(async()=>{
      const previous=channels[channel.id];
      if(enabled)channels[channel.id]={guildId:config.guildId,revision:crypto.randomUUID()};else delete channels[channel.id];
      try{await save();}catch(error){if(previous)channels[channel.id]=previous;else delete channels[channel.id];throw error;}
      for(const job of active.values())if(job.channelId===channel.id)job.controller.abort();
    });configuring=change.catch(()=>{});await change;
    await interaction.editReply({content:enabled?`Enabled in <#${channel.id}>. Type a Lua feature request there; replies are sent privately in DM.\nเปิดแล้ว พิมพ์ระบบที่ต้องการในช่องนี้ บอทจะส่งผลลัพธ์ทาง DM`
      :`Disabled in <#${channel.id}>. / ปิดระบบสร้างสคริปต์ในช่องนี้แล้ว`,allowedMentions:{parse:[]}});
    return true;
  }
  async function notice(message,content){try{await message.reply({content,allowedMentions:{parse:[],repliedUser:false}});}catch{/* No code or prompts are sent to the public channel. */}}
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
        try{await message.author.send(scriptError('The generator is busy or you recently sent a request. Please wait 30 seconds and try again. / กรุณารอ 30 วินาทีแล้วลองใหม่',avatar()));}catch{/* No public code fallback. */}
      }
      return;
    }
    // Reserve before awaiting Discord so simultaneous DM openings cannot exceed
    // the user/global concurrency limits.
    const controller=new AbortController(),job={controller,channelId:message.channelId};active.set(userId,job);cooldown.set(userId,time+30_000);
    const timer=setTimeout(()=>controller.abort(),generationTimeout);const started=now();
    const valid=()=>!closing&&!controller.signal.aborted&&channels[message.channelId]===setting;
    let pending;
    try{
      try{pending=await message.author.send(progress(avatar()));}
      catch{await notice(message,'I could not send you a DM. Enable direct messages for this server and try again. / กรุณาเปิดรับ DM จากเซิร์ฟเวอร์แล้วลองใหม่');return;}
      if(message.content.length>2000)throw new Error('Keep the request under 2,000 characters. / กรุณาใช้คำขอไม่เกิน 2,000 ตัวอักษร');
      if(!valid())throw new Error('Generation was cancelled because this channel was disabled.');
      const result=await generate(config,{prompt:message.content.trim(),userId,guildId:message.guildId,channelId:message.channelId,messageId:message.id},controller.signal);
      if(!valid())throw new Error('Generation was cancelled or timed out. Please try again.');
      let syntax={checked:false,valid:true};if(!result.refusal)syntax=await check(result.code);
      if(!valid())throw new Error('Generation was cancelled or timed out. Please try again.');
      if(!syntax.valid)throw new Error('The generated code failed syntax checks. Please request a smaller system and try again. / โค้ดไม่ผ่านการตรวจไวยากรณ์ กรุณาลองขอระบบที่เล็กลง');
      const {long,...payload}=scriptResult(result,avatar(),{elapsed:now()-started,checked:syntax.checked,requestId:message.id});
      await pending.edit(payload);
      if(long)await notice(message,'The code is too long for an embed. I sent the complete .txt file in DM. / โค้ดยาวเกินกรอบข้อความ ส่งไฟล์ .txt ฉบับเต็มให้ทาง DM แล้ว');
      else await notice(message,'Your private reply is in DM. / ส่งคำตอบส่วนตัวให้ทาง DM แล้ว');
    }catch(error){
      try{await pending.edit(scriptError(error.message?.slice(0,400)||'Generation failed. Please try again.',avatar(),now()-started));}catch{/* DMs may have been disabled while generating. */}
    }finally{clearTimeout(timer);if(active.get(userId)===job)active.delete(userId);for(const map of[cooldown,notified])for(const[id,expiry]of map)if(expiry<=now())map.delete(id);}
  }
  function stop(){closing=true;for(const job of active.values())job.controller.abort();}
  return{handle,onMessage,stop};
}
