import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, EmbedBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, ModalBuilder,
  SeparatorBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { fileURLToPath } from 'node:url';

export const ids = { reset: 'devilhub:hwid:reset', modal: 'devilhub:hwid:submit', info: 'devilhub:key:info' };
export function resetResult(result, botAvatar) {
  const emoji = result.ok ? '<a:emoji_25:1540658596487102464>' : '<:ojic_018:1546638491478265946>';
  const heading = result.ok ? 'ดำเนินการสำเร็จ / Success' : 'รีเซ็ตไม่สำเร็จ / Failed';
  const embed = new EmbedBuilder().setTitle('DEVIL HUB • Reset HWID')
    .setDescription(`${emoji} **${heading}**\n\n${result.message}`);
  if (botAvatar) embed.setThumbnail(botAvatar);
  return { content: '', embeds: [embed], allowedMentions: { parse: [] } };
}
export function panel(website) {
  const container = new ContainerBuilder()
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('attachment://devilhub.png').setDescription('DEVIL HUB')))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# DEVIL HUB'),
      new TextDisplayBuilder().setContent('> `Reset HWID` For Key Premium\n> `Get Key` Free to Website'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(ids.reset).setLabel('Reset Hwid')
        .setEmoji({ id: '1565299333794889778', name: 'watergear', animated: false }).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setURL(website).setLabel('Get Key').setEmoji('🔑').setStyle(ButtonStyle.Link),
      new ButtonBuilder().setCustomId(ids.info).setLabel('Info')
        .setEmoji({ id: '1565299349099909120', name: 'jungwad_', animated: true }).setStyle(ButtonStyle.Secondary)));
  return { flags: MessageFlags.IsComponentsV2, components: [container],
    files: [new AttachmentBuilder(fileURLToPath(new URL('../assets/devilhub.png', import.meta.url)), { name: 'devilhub.png' })],
    allowedMentions: { parse: [] } };
}
export function resetModal() {
  return new ModalBuilder().setCustomId(ids.modal).setTitle('Reset Premium Key HWID')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('premium_key').setLabel('Premium Key / คีย์ที่แอดมินสร้าง')
      .setPlaceholder('DEVIL-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX')
      .setStyle(TextInputStyle.Short).setMinLength(41).setMaxLength(100).setRequired(true)));
}
export function info(website) {
  return [
    '**🇹🇭 ภาษาไทย**',
    '**วิธีรับและใช้ Key**',
    `> 1. กด \`Get Key\` เพื่อเปิด ${website}`,
    '> 2. เข้าสู่ระบบ เลือกโหมด และทำภารกิจให้ครบ',
    '> 3. คัดลอกคีย์ไปใส่ในสคริปต์ DEVIL HUB',
    '**วิธีรีเซ็ต HWID**',
    '> ปิดสคริปต์เครื่องเก่าก่อน กด `Reset Hwid` แล้วใส่คีย์ Premium ที่แอดมินสร้างและยังใช้งานได้',
    '> เมื่อสำเร็จ ใช้คีย์เดิมบนเครื่องใหม่เพื่อผูก HWID ใหม่ วันหมดอายุคงเดิม',
    '> คีย์ Free รีเซ็ตไม่ได้ รอ 5 นาทีระหว่างการรีเซ็ต เครื่องเก่าจะผูกกลับไม่ได้ 10 นาที',
    '> คีย์และผลการรีเซ็ตแสดงเฉพาะคุณ อย่าแชร์คีย์ให้ผู้อื่น',
    '',
    '**🇬🇧 English**',
    '**Get and use your key**',
    `> 1. Click \`Get Key\` to open ${website}`,
    '> 2. Sign in, choose a plan and complete its tasks.',
    '> 3. Copy your key into the DEVIL HUB script.',
    '**Reset your HWID**',
    '> Close the script on your old device. Click `Reset Hwid` and enter an active, admin-created Premium key.',
    '> After a successful reset, use the same key on your new device to bind it. The expiry date stays the same.',
    '> Free keys cannot reset. Wait 5 minutes between resets. The old device cannot rebind for 10 minutes.',
    '> Your key and reset result are visible only to you. Never share your key.',
  ].join('\n');
}
