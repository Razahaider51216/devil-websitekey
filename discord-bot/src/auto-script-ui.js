import {AttachmentBuilder,EmbedBuilder} from 'discord.js';
export const generationTimeout=90_000;
const noMentions={parse:[]};
const writingEmoji='<a:emoji_12:1537864050254422138>';
const successEmoji='<a:emoji_25:1540658596487102464>';
const failureEmoji='<:ojic_018:1546638491478265946>';
function base(avatar,now=new Date()){
  const embed=new EmbedBuilder().setColor(0x38bdf8).setTitle('💻 DEVIL HUB • Lua Studio')
    .setFooter({text:'DEVIL HUB • Lua Studio'}).setTimestamp(now);
  if(avatar)embed.setThumbnail(avatar);
  return embed;
}
export function progress(avatar){return{embeds:[base(avatar).setDescription(writingEmoji+' Writing your Lua system…')
  .addFields({name:'⏳ Timeout',value:'`90 seconds`',inline:true})],allowedMentions:noMentions};}
export function scriptError(message,avatar,elapsed=0){return{embeds:[base(avatar).setDescription(failureEmoji+' '+message)
  .addFields({name:'⏱️ Time',value:'`'+(elapsed/1000).toFixed(1)+'s`',inline:true},{name:'⏳ Timeout',value:'`90 seconds`',inline:true})],allowedMentions:noMentions};}
export function scriptResult(result,avatar,{elapsed=0,checked=false,requestId='script',now=new Date()}={}){
  if(result.refusal)return{...scriptError(result.refusal,avatar,elapsed),long:false};
  const long=result.code.length>3600||result.code.includes('```');
  const system=result.name.replace(/[`\r\n]/g,' ').slice(0,96);
  const embed=base(avatar,now).setDescription(successEmoji+' '+(long?'Your complete Lua code is attached as a `.txt` file.\nโค้ด Lua ฉบับเต็มอยู่ในไฟล์ `.txt` ที่แนบมา':`\`\`\`lua\n${result.code}\n\`\`\``))
    .addFields({name:'⚙️ System / ระบบ',value:'`'+system+'`',inline:false},
      {name:'📂 Placement / ตำแหน่งสคริปต์',value:result.placement.slice(0,500),inline:false},
      {name:'⏱️ Generation time',value:'`'+(elapsed/1000).toFixed(1)+'s`',inline:true},
      {name:'⏳ Timeout',value:'`90 seconds`',inline:true},
      {name:'🔎 Syntax check',value:checked?'`Passed`':'`Not available`',inline:true});
  if(result.notes)embed.addFields({name:'📖 Usage / วิธีใช้',value:result.notes.slice(0,700)});
  const files=[new AttachmentBuilder(Buffer.from(result.code,'utf8'),{name:'devilhub-lua-'+String(requestId).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,32)+'.txt'})];
  return{embeds:[embed],files,allowedMentions:noMentions,long};
}

function label(value,max=160){return String(value||'Lua system').replace(/[`\r\n]/g,' ').slice(0,max);}
function channelBase(avatar,{userId,request,elapsed=0,now=new Date(),name,placement}={}){
  return base(avatar,now).addFields(
    {name:'👤 Requested by',value:`<@${userId}>`,inline:true},
    {name:'⚙️ System',value:'`'+label(name||request,96)+'`',inline:true},
    {name:'📜 Script',value:label(placement||'Luau / preparing placement',500)},
    {name:'⏱️ Elapsed',value:'`'+(elapsed/1000).toFixed(1)+'s`',inline:true},
    {name:'⏳ Timeout',value:'`90 seconds`',inline:true});
}
function channelPayload(embed,userId,notice=''){
  return{content:`<@${userId}>${notice?' '+notice:''}`,embeds:[embed],
    allowedMentions:{parse:[],users:[userId],repliedUser:false}};
}
export function channelProgress(avatar,options){
  const embed=channelBase(avatar,options).setDescription(writingEmoji+' '+(options.stage||'Writing your Lua system…'));
  return channelPayload(embed,options.userId);
}
export function channelPreview(result,avatar,options){
  if(result.refusal)return channelFailure(result.refusal,avatar,options);
  // A bounded excerpt only; the original source is preserved in the DM file.
  const excerpt=result.code.split(/\r?\n/).slice(0,18).join('\n').slice(0,1200).replace(/```/g,"'''" );
  const truncated=excerpt.length<result.code.length;
  const embed=channelBase(avatar,{...options,name:result.name,placement:result.placement})
    .setDescription((options.delivered?successEmoji:failureEmoji)+' **Lua preview / ตัวอย่างโค้ด**\n```lua\n'+excerpt+(truncated?'\n-- … full source in the DM file':'')+'\n```')
    .addFields({name:'📌 Status',value:options.delivered?successEmoji+' Completed · full source delivered by DM':failureEmoji+' Completed · DM delivery failed'},
      {name:'🔎 Syntax check',value:options.checked?'`Passed`':'`Not available`',inline:true});
  return channelPayload(embed,options.userId,options.delivered
    ?'The complete `.txt` file has been sent to your DM. / ส่งไฟล์ฉบับเต็มทาง DM แล้ว'
    :'I could not send you a DM. Enable direct messages for this server and request again. / เปิดรับ DM จากเซิร์ฟเวอร์แล้วลองใหม่');
}
export function channelFailure(message,avatar,options){
  return channelPayload(channelBase(avatar,options).setDescription(failureEmoji+' '+String(message).slice(0,700))
    .addFields({name:'📌 Status',value:failureEmoji+' Not completed'}),options.userId);
}
