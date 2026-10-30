import { randomBytes } from 'node:crypto';
import { ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelSelectMenuBuilder,ChannelType,ContainerBuilder,FileUploadBuilder,
  LabelBuilder,MessageFlags,ModalBuilder,PermissionFlagsBits,RoleSelectMenuBuilder,SeparatorBuilder,StringSelectMenuBuilder,
  TextDisplayBuilder,TextInputBuilder,TextInputStyle } from 'discord.js';
import { imageUrl,parseButtonEmoji,validateGrantRole,verifyPanel,verifyResult } from './verify-ui.js';

export const setupPrefix='devilhub:verify:setup:';
export function defaultVerifyOptions(website){return {title:'DEVIL HUB',description:'> Verify your identity to unlock your server role.',label:'Verify',style:'green',emoji:null,
  color:0x38bdf8,image:website+'/devilhubv3.png',infoLabel:'Info',infoText:'Press Verify, open your private website link, sign in with the same Discord account and complete the human verification. Your role will be assigned automatically.'};}
const id=(draft,action)=>setupPrefix+draft.id+':'+action;
const privateFlags=MessageFlags.IsComponentsV2|MessageFlags.Ephemeral;
export function setupPanel(draft,note='Changes stay private until you press Publish.'){
  const channel=new ChannelSelectMenuBuilder().setCustomId(id(draft,'channel')).setPlaceholder('Select the channel for this panel')
    .setChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1);
  const role=new RoleSelectMenuBuilder().setCustomId(id(draft,'role')).setPlaceholder('Select the role to award').setMinValues(1).setMaxValues(1);
  if(draft.channelId)channel.setDefaultChannels(draft.channelId);if(draft.roleId)role.setDefaultRoles(draft.roleId);
  const style=new StringSelectMenuBuilder().setCustomId(id(draft,'style')).setPlaceholder('Verify button color').addOptions(
    ...['blue','gray','green','red'].map(value=>({label:'Button color: '+value,value,default:draft.options.style===value})));
  const button=(action,label,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId(id(draft,action)).setLabel(label).setStyle(style);
  const container=new ContainerBuilder().setAccentColor(0x38bdf8)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Verification Setup'),new TextDisplayBuilder().setContent(
      'Choose a channel and role below. Use the buttons to edit your message, style and image. Selecting a channel loads its existing panel settings, if available.'))
    .addActionRowComponents(new ActionRowBuilder().addComponents(channel),new ActionRowBuilder().addComponents(role),new ActionRowBuilder().addComponents(style))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Channel:** ${draft.channelId?'<#'+draft.channelId+'>':'Not selected'}\n**Role:** ${draft.roleId?'<@&'+draft.roleId+'>':'Not selected'}\n**Title:** ${draft.options.title.replace(/[\r\n]/g,' ')}\n**Image:** ${draft.options.image?'Enabled':'Disabled'}\n\n${note}`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(button('text','Edit Text'),button('appearance','Buttons & Color'),button('image','Image'),button('preview','Preview'),button('publish','Publish',ButtonStyle.Success).setDisabled(!draft.channelId||!draft.roleId)));
  return {flags:MessageFlags.IsComponentsV2,components:[container],allowedMentions:{parse:[]}};
}
function field(customId,label,value,maxLength,paragraph=false,required=true){
  const input=new TextInputBuilder().setCustomId(customId).setStyle(paragraph?TextInputStyle.Paragraph:TextInputStyle.Short).setMaxLength(maxLength).setRequired(required);
  if(value)input.setValue(value);
  return new LabelBuilder().setLabel(label).setTextInputComponent(input);
}
export function setupModal(draft,kind){
  const o=draft.options,modal=new ModalBuilder().setCustomId(id(draft,kind+'-save'));
  if(kind==='text')return modal.setTitle('Edit Verification Text').addLabelComponents(field('title','Panel title',o.title,120),field('description','Panel description',o.description,2000,true),field('info-text','Private Info instructions',o.infoText,2000,true));
  if(kind==='appearance')return modal.setTitle('Buttons & Panel Color').addLabelComponents(field('label','Verify button text',o.label,80),field('info-label','Info button text',o.infoLabel,80),
    field('emoji','Button emoji: Unicode or <:name:id>',o.emoji,100,false,false),field('color','Panel hex color (blank = no accent)',o.color===null?'':'#'+o.color.toString(16).padStart(6,'0'),7,false,false));
  if(kind==='image')return modal.setTitle('Panel Image').addLabelComponents(field('image-url','HTTPS image URL (blank = no image)',o.image,2048,false,false),
    new LabelBuilder().setLabel('Or upload an image (up to 10 MB)').setFileUploadComponent(new FileUploadBuilder().setCustomId('image-upload').setMinValues(0).setMaxValues(1).setRequired(false)));
  throw new Error('Unknown editor.');
}
function textValue(interaction,name,maxLength,required=true){
  const value=interaction.fields.getTextInputValue(name).trim();if((required&&!value)||value.length>maxLength)throw new Error('Please enter valid text for '+name+'.');return value;
}
export function createVerifySetup({client,config,getPanel,publish}){
  const drafts=new Map();const avatar=()=>client.user.displayAvatarURL({size:128,extension:'png'});
  async function run(interaction){
    const command=interaction.isChatInputCommand()&&interaction.commandName==='set-verify';
    if(!command&&!interaction.customId?.startsWith(setupPrefix))return false;
    if(interaction.guildId!==config.guildId||!interaction.memberPermissions?.has([PermissionFlagsBits.ManageGuild,PermissionFlagsBits.ManageRoles]))throw new Error('Manage Server and Manage Roles permissions are required.');
    for(const [key,draft]of drafts)if(draft.expiresAt<=Date.now())drafts.delete(key);
    if(command){
      const draft={id:randomBytes(12).toString('hex'),ownerId:interaction.user.id,guildId:interaction.guildId,channelId:null,roleId:null,options:defaultVerifyOptions(config.website),expiresAt:Date.now()+1800000,busy:false};
      drafts.set(draft.id,draft);await interaction.reply({...setupPanel(draft),flags:privateFlags});return true;
    }
    const match=interaction.customId.slice(setupPrefix.length).match(/^([a-f0-9]{24}):([a-z-]+)$/),draft=match&&drafts.get(match[1]);
    if(!draft||draft.ownerId!==interaction.user.id||draft.guildId!==interaction.guildId)throw new Error('This private setup panel expired or belongs to another administrator. Run /set-verify again.');
    if(draft.busy)throw new Error('Your panel is being published. Please wait.');
    draft.expiresAt=Date.now()+1800000;
    const action=match[2];
    if(['text','appearance','image'].includes(action)){await interaction.showModal(setupModal(draft,action));return true;}
    if(action==='preview'){
      const preview=verifyPanel(draft.options,avatar());const component=preview.components[0].toJSON();
      for(const child of component.components)if(child.type===1)for(const button of child.components)button.disabled=true;
      await interaction.reply({...preview,components:[component],flags:privateFlags});return true;
    }
    if(action==='channel'){
      await interaction.deferUpdate();const channel=await interaction.guild.channels.fetch(interaction.values[0]);
      if(!channel||channel.guildId!==config.guildId||![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type))throw new Error('Choose a server text channel.');
      const existing=getPanel(channel.id);draft.channelId=channel.id;
      if(existing){draft.options={...defaultVerifyOptions(config.website),...existing};delete draft.options.messageId;delete draft.options.roleId;draft.roleId=existing.roleId;}
    }else if(action==='role'){
      await interaction.deferUpdate();const [role,me,actor]=await Promise.all([interaction.guild.roles.fetch(interaction.values[0]),interaction.guild.members.fetchMe(),interaction.guild.members.fetch(interaction.user.id)]);
      validateGrantRole(interaction.guild,role,me,actor);draft.roleId=role.id;
    }else if(action==='style'){
      await interaction.deferUpdate();if(!['blue','gray','green','red'].includes(interaction.values[0]))throw new Error('Invalid button color.');draft.options.style=interaction.values[0];
    }else if(action==='text-save'){
      const values={title:textValue(interaction,'title',120),description:textValue(interaction,'description',2000),infoText:textValue(interaction,'info-text',2000)};
      await interaction.deferUpdate();Object.assign(draft.options,values);
    }else if(action==='appearance-save'){
      const values={label:textValue(interaction,'label',80),infoLabel:textValue(interaction,'info-label',80),emoji:textValue(interaction,'emoji',100,false)||null};
      const color=textValue(interaction,'color',7,false);if(color&&!/^#?[a-f0-9]{6}$/i.test(color))throw new Error('Use a hex color such as #38bdf8.');
      parseButtonEmoji(values.emoji);await interaction.deferUpdate();Object.assign(draft.options,values,{color:color?parseInt(color.replace('#',''),16):null});
    }else if(action==='image-save'){
      const url=textValue(interaction,'image-url',2048,false),upload=interaction.fields.getUploadedFiles('image-upload')?.first();
      if(upload&&(!upload.contentType?.startsWith('image/')||upload.size>10*1024*1024))throw new Error('Upload an image no larger than 10 MB.');
      const image=upload?imageUrl(upload.url):url?imageUrl(url):null;await interaction.deferUpdate();draft.options.image=image;
    }else if(action==='publish'){
      if(!draft.channelId||!draft.roleId)throw new Error('Choose a channel and role first.');
      draft.busy=true;
      try{await interaction.deferUpdate();await publish(interaction,draft);await interaction.editReply(setupPanel(draft,'**Published successfully.** You can keep editing and publish again to update the same panel.'));}finally{draft.busy=false;}return true;
    }else throw new Error('Unknown setup action.');
    await interaction.editReply(setupPanel(draft));return true;
  }
  return {async handle(interaction){
    try{return await run(interaction);}catch(error){
      const payload={...verifyResult(false,avatar(),error.message),flags:privateFlags};
      if(interaction.deferred||interaction.replied)await interaction.followUp(payload);else await interaction.reply(payload);return true;
    }
  }};
}
