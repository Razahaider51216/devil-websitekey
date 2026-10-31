import {AttachmentBuilder,EmbedBuilder} from 'discord.js';
export const generationTimeout=90_000;
const noMentions={parse:[]};
function base(avatar,now=new Date()){
  const embed=new EmbedBuilder().setColor(0x38bdf8).setTitle('DEVIL HUB • Lua Studio')
    .setFooter({text:'DEVIL HUB • Lua Studio'}).setTimestamp(now);
  if(avatar)embed.setThumbnail(avatar);
  return embed;
}
export function progress(avatar){return{embeds:[base(avatar).setDescription('Creating your Lua system…\nกำลังสร้างระบบ Lua ให้คุณ…')
  .addFields({name:'Timeout',value:'`90 seconds`',inline:true})],allowedMentions:noMentions};}
export function scriptError(message,avatar,elapsed=0){return{embeds:[base(avatar).setDescription(message)
  .addFields({name:'Time',value:'`'+(elapsed/1000).toFixed(1)+'s`',inline:true},{name:'Timeout',value:'`90 seconds`',inline:true})],allowedMentions:noMentions};}
export function scriptResult(result,avatar,{elapsed=0,checked=false,requestId='script',now=new Date()}={}){
  if(result.refusal)return{...scriptError(result.refusal,avatar,elapsed),long:false};
  const long=result.code.length>3600||result.code.includes('```');
  const system=result.name.replace(/[`\r\n]/g,' ').slice(0,96);
  const embed=base(avatar,now).setDescription(long?'Your complete Lua code is attached as a `.txt` file.\nโค้ด Lua ฉบับเต็มอยู่ในไฟล์ `.txt` ที่แนบมา':`\`\`\`lua\n${result.code}\n\`\`\``)
    .addFields({name:'System / ระบบ',value:'`'+system+'`',inline:false},
      {name:'Placement / ตำแหน่งสคริปต์',value:result.placement.slice(0,500),inline:false},
      {name:'Generation time',value:'`'+(elapsed/1000).toFixed(1)+'s`',inline:true},
      {name:'Timeout',value:'`90 seconds`',inline:true},
      {name:'Syntax check',value:checked?'`Passed`':'`Not available`',inline:true});
  if(result.notes)embed.addFields({name:'Usage / วิธีใช้',value:result.notes.slice(0,700)});
  const files=long?[new AttachmentBuilder(Buffer.from(result.code,'utf8'),{name:'devilhub-lua-'+String(requestId).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,32)+'.txt'})]:[];
  return{embeds:[embed],files,allowedMentions:noMentions,long};
}
