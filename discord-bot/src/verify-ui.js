import { ActionRowBuilder,ButtonBuilder,ButtonStyle,ContainerBuilder,MediaGalleryBuilder,MediaGalleryItemBuilder,
  MessageFlags,SectionBuilder,SeparatorBuilder,TextDisplayBuilder,ThumbnailBuilder } from 'discord.js';

export const verifyIds={verify:'devilhub:verify:start',info:'devilhub:verify:info'};
export const legacyVerificationInfo='Press Verify, open your private website link, sign in with the same Discord account and complete the human verification. Your role will be assigned automatically.';
export const defaultVerificationInfo=[
  '**ภาษาไทย — วิธีรับยศ**',
  '> 1. กดปุ่ม Verify แล้วกด Continue Verification ในข้อความส่วนตัวของบอท',
  '> 2. ลงชื่อเข้าเว็บด้วยบัญชี Discord เดียวกับที่กดปุ่ม',
  '> 3. ผ่านการยืนยันว่าไม่ใช่บอท แล้วกด Confirm Verification',
  '> 4. เมื่อสำเร็จ บอทจะมอบยศและแจ้งผลให้คุณโดยเฉพาะ',
  '> ลิงก์มีอายุ 10 นาที หากหมดอายุให้กด Verify ใหม่ หากไม่ได้รับยศให้ติดต่อแอดมิน',
  '',
  '**English — How to receive your role**',
  '> 1. Press Verify, then Continue Verification in the bot\'s private reply.',
  '> 2. Sign in on the website with the same Discord account.',
  '> 3. Complete the human check, then press Confirm Verification.',
  '> 4. The bot will assign your role and privately confirm the result.',
  '> Links expire after 10 minutes. Press Verify again if yours expires. Contact an administrator if the role cannot be assigned.',
].join('\n');
const styles={blue:ButtonStyle.Primary,gray:ButtonStyle.Secondary,green:ButtonStyle.Success,red:ButtonStyle.Danger};
export function parseButtonEmoji(value) {
  if(!value)return undefined;
  const text=value.trim().replace(/^\\(?=<)/,'');
  const custom=text.match(/^<(a?):([A-Za-z0-9_]{2,32}):(\d{17,22})>$/);
  if(custom)return {id:custom[3],name:custom[2],animated:custom[1]==='a'};
  if(text.length<=32&&/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(text)&&!/[<>\r\n]/.test(text))return text;
  throw new Error('Use a Unicode emoji or <:name:id> / <a:name:id>.');
}
export function imageUrl(value) {
  const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||value.length>2048)throw new Error('Use an HTTPS image URL.');return url.href;
}
function section(title,description,avatar) {
  return new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('# '+title),new TextDisplayBuilder().setContent(description))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar).setDescription('DEVIL HUB bot'));
}
const payload=container=>({flags:MessageFlags.IsComponentsV2,components:[container],allowedMentions:{parse:[]}});
export function verifyPanel(options,avatar) {
  const container=new ContainerBuilder();if(options.color!==null)container.setAccentColor(options.color);
  if(options.image)container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(options.image).setDescription('DEVIL HUB verification')));
  container.addSectionComponents(section(options.title,options.description,avatar)).addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  const button=new ButtonBuilder().setCustomId(verifyIds.verify).setLabel(options.label).setStyle(styles[options.style]);
  if(options.emoji)button.setEmoji(parseButtonEmoji(options.emoji));
  const info=new ButtonBuilder().setCustomId(verifyIds.info).setLabel(options.infoLabel).setStyle(ButtonStyle.Secondary);
  if(options.infoEmoji)info.setEmoji(parseButtonEmoji(options.infoEmoji));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(button,info));
  return payload(container);
}
export function verifyPrompt(url,avatar) {
  const container=new ContainerBuilder().setAccentColor(0x38bdf8).addSectionComponents(section('Identity Verification','> Verify your identity to receive your role.\n\nComplete the security check on the DEVIL HUB website. This private link expires in 10 minutes.',avatar))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true)).addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Continue Verification').setURL(url).setStyle(ButtonStyle.Link)));
  return payload(container);
}
export function verifyResult(ok,avatar,message) {
  const emoji=ok?'<:ojic_017:1546638487845867550>':'<:ojic_018:1546638491478265946>';
  return payload(new ContainerBuilder().setAccentColor(ok?0x38bdf8:0xed4245).addSectionComponents(section(ok?'Verification Successful':'Verification Failed',
    `${emoji} ${message||(ok?'Your identity has been verified successfully. Your role has been assigned.':'We could not complete your verification. Please press Verify again or contact an administrator.')}`,avatar)));
}
export function verifyInfo(message,avatar) {
  const text=!message||message===legacyVerificationInfo||message===defaultVerificationInfo?defaultVerificationInfo:message+'\n\n'+defaultVerificationInfo;
  return payload(new ContainerBuilder().setAccentColor(0x38bdf8).addSectionComponents(section('Verification Info / วิธีรับยศ',text,avatar)));
}
export function validateGrantRole(guild,role,botMember,actorMember) {
  if(!role||role.guild.id!==guild.id||role.id===guild.id||role.managed||role.permissions.has('Administrator'))throw new Error('Choose a normal, non-administrator role.');
  if(!botMember.permissions.has('ManageRoles')||role.comparePositionTo(botMember.roles.highest)>=0)throw new Error('Move the bot role above the selected role and grant Manage Roles.');
  if(actorMember&&actorMember.id!==guild.ownerId&&role.comparePositionTo(actorMember.roles.highest)>=0)throw new Error('The selected role must be below your highest role.');
}
