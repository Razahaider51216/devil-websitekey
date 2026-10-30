import { MessageFlags,PermissionFlagsBits,Routes } from 'discord.js';
import { mkdir,readFile,rename,writeFile } from 'node:fs/promises';
import { imageUrl,parseButtonEmoji,validateGrantRole,verifyIds,verifyPanel,verifyPrompt,verifyResult,verifyInfo } from './verify-ui.js';

export async function verificationApi(config,action,input,send=fetch) {
  const response=await send(config.website+'/api/bot/verify/'+action,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.apiSecret},body:JSON.stringify(input)});
  if(!response.ok)throw new Error('VERIFICATION_API_UNAVAILABLE');return response.json();
}
export async function createVerifier(client,config,options={}) {
  const directory=options.directory||new URL('../data/',import.meta.url);
  const stateFile=new URL('verify.json',directory),temporary=new URL('verify.tmp',directory);
  let state={panels:{},jobs:{}};
  try { state=JSON.parse(await readFile(stateFile,'utf8'));if(!state.panels||!state.jobs)throw new Error('Invalid verification state'); }
  catch(error){if(error.code!=='ENOENT')throw new Error('Verification state file is invalid');}
  let saves=Promise.resolve(),polling=false,timer;
  function save() {
    const data=JSON.stringify(state);const task=saves.catch(()=>{}).then(async()=>{await mkdir(directory,{recursive:true});await writeFile(temporary,data,'utf8');await rename(temporary,stateFile);});saves=task;return task;
  }
  const avatar=()=>client.user.displayAvatarURL({size:128,extension:'png'});
  const api=(action,input)=>verificationApi(config,action,input,options.send);
  async function respond(job,ok,message) {
    const result=verifyResult(ok,avatar(),message);
    await client.rest.patch(Routes.webhookMessage(job.applicationId,job.token,'@original'),{auth:false,body:{flags:MessageFlags.IsComponentsV2,components:result.components.map(c=>c.toJSON()),allowed_mentions:{parse:[]}}});
  }
  async function poll() {
    if(polling||!client.isReady())return;polling=true;
    try {
      const ids=Object.keys(state.jobs);
      for(let offset=0;offset<ids.length;offset+=50){
        const batch=ids.slice(offset,offset+50);let rows;
        try { rows=(await api('poll',{ids:batch})).jobs; }catch{continue;}
        for(const id of batch){
          const job=state.jobs[id],row=rows.find(item=>item.id===id);if(!job)continue;
          let terminal=row?.status,ok=terminal==='done';
          if(row?.status==='approved'){
            let granted=false;
            try {
              if(row.userId!==job.userId||row.guildId!==job.guildId||row.roleId!==job.roleId)throw new Error('VERIFICATION_IDENTITY_MISMATCH');
              const guild=await client.guilds.fetch(job.guildId),role=await guild.roles.fetch(job.roleId),me=await guild.members.fetchMe();
              validateGrantRole(guild,role,me);const member=await guild.members.fetch(job.userId);
              await member.roles.add(role,'DEVIL HUB website verification');granted=true;
            }catch(error){console.error('Verification role assignment failed:',error.code||error.name);}
            try { const result=await api('finish',{id,ok:granted});terminal=result.status;ok=terminal==='done'; }catch{continue;}
          }
          if(!row||Date.now()>=job.expiresAt||['done','failed','expired'].includes(terminal)){
            try{await respond(job,ok,terminal==='expired'||!row?'Your verification link expired. Press Verify again to create a new private link.':undefined);}
            catch(error){if(Date.now()<job.expiresAt+60000&&!['10015','10008','50027'].includes(String(error.code)))continue;}
            delete state.jobs[id];await save();
          }
        }
      }
    }catch(error){console.error('Verification worker failed:',error.code||error.name);}finally{polling=false;}
  }
  async function handle(interaction) {
    if(interaction.isChatInputCommand()&&interaction.commandName==='set-verify'){
      if(!interaction.memberPermissions?.has([PermissionFlagsBits.ManageGuild,PermissionFlagsBits.ManageRoles]))throw new Error('Manage Server and Manage Roles permissions are required.');
      await interaction.deferReply({flags:MessageFlags.Ephemeral});
      const channel=interaction.options.getChannel('channel',true),role=interaction.options.getRole('role',true);
      if(channel.guildId!==config.guildId||!channel.isTextBased()||typeof channel.send!=='function')throw new Error('Choose a server text channel.');
      if(!channel.permissionsFor(client.user)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.ReadMessageHistory]))throw new Error('The bot needs View Channel, Send Messages, Embed Links and Read Message History.');
      const [me,actor]=await Promise.all([interaction.guild.members.fetchMe(),interaction.guild.members.fetch(interaction.user.id)]);
      validateGrantRole(interaction.guild,role,me,actor);
      const string=name=>interaction.options.getString(name),color=string('color'),upload=interaction.options.getAttachment('image');
      if(color&&!/^#?[a-f0-9]{6}$/i.test(color))throw new Error('Use a hex color such as #38bdf8.');
      if(upload&&(!upload.contentType?.startsWith('image/')||upload.size>10*1024*1024))throw new Error('Upload an image no larger than 10 MB.');
      const options={title:string('title')||'DEVIL HUB',description:string('description')||'> Verify your identity to unlock your server role.',
        label:string('button-label')||'Verify',style:string('button-color')||'green',emoji:string('emoji')||null,color:color?parseInt(color.replace('#',''),16):0x38bdf8,
        image:imageUrl(upload?.url||string('image-url')||config.website+'/devilhubv3.png'),infoLabel:string('info-label')||'Info',
        infoText:string('info-text')||'Press Verify, open your private website link, sign in with the same Discord account and complete the human verification. Your role will be assigned automatically.',roleId:role.id};
      parseButtonEmoji(options.emoji);
      const old=state.panels[channel.id];let message;
      if(old){try{message=await channel.messages.fetch(old.messageId);}catch(error){if(error.code!==10008)throw error;}}
      if(message&&message.author.id!==client.user.id)throw new Error('The previous panel does not belong to this bot.');
      const payload=verifyPanel(options,avatar());message=message?await message.edit(payload):await channel.send(payload);
      state.panels[channel.id]={messageId:message.id,...options};await save();
      await interaction.editReply({content:`Verification panel published in <#${channel.id}>. Successful verification awards <@&${role.id}>.`,allowedMentions:{parse:[]}});return true;
    }
    if(!interaction.isButton()||![verifyIds.verify,verifyIds.info].includes(interaction.customId))return false;
    const panel=state.panels[interaction.channelId];
    if(!panel||panel.messageId!==interaction.message.id)throw new Error('This panel is no longer active. Ask an administrator to run /set-verify again.');
    if(interaction.customId===verifyIds.info){await interaction.reply({...verifyInfo(panel.infoText,avatar()),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});return true;}
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    if(Object.values(state.jobs).some(job=>job.userId===interaction.user.id&&job.expiresAt>Date.now())){
      await interaction.editReply(verifyResult(false,avatar(),'You already have a verification in progress. Open your existing private link, or wait for it to expire.'));return true;
    }
    const [role,me]=await Promise.all([interaction.guild.roles.fetch(panel.roleId),interaction.guild.members.fetchMe()]);validateGrantRole(interaction.guild,role,me);
    const job=await api('start',{userId:interaction.user.id,guildId:interaction.guildId,channelId:interaction.channelId,roleId:role.id,roleName:role.name,guildName:interaction.guild.name,interactionId:interaction.id});
    const url=config.website+'/verify#ticket='+job.ticket;
    state.jobs[job.id]={userId:interaction.user.id,guildId:interaction.guildId,roleId:role.id,applicationId:config.applicationId,token:interaction.token,expiresAt:job.expiresAt};
    await save();await interaction.editReply(verifyPrompt(url,avatar()));return true;
  }
  return {handle,poll,start(){timer=setInterval(()=>void poll(),3000);void poll();},stop(){clearInterval(timer);},
    async error(interaction,error){const payload=verifyResult(false,avatar(),interaction.commandName==='set-verify'?error.message:undefined);if(interaction.deferred||interaction.replied)await interaction.editReply(payload);else await interaction.reply({...payload,flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});}};
}
