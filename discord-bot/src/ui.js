import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, ModalBuilder,
  SeparatorBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { fileURLToPath } from 'node:url';

export const ids = { reset: 'devilhub:hwid:reset', modal: 'devilhub:hwid:submit', info: 'devilhub:key:info' };
export function panel(website) {
  const container = new ContainerBuilder()
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('attachment://devilhub.png').setDescription('DEVIL HUB')))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# DEVIL HUB'),
      new TextDisplayBuilder().setContent('Reset HWID For Key Premium\nGet Key Free to Website'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(ids.reset).setLabel('Reset Hwid').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setURL(website).setLabel('Get Key').setStyle(ButtonStyle.Link),
      new ButtonBuilder().setCustomId(ids.info).setLabel('Info').setStyle(ButtonStyle.Secondary)));
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
  return `**วิธีรับและใช้ Key**\n1. กด Get Key เพื่อเปิด ${website}\n2. เข้าสู่ระบบ เลือกโหมด และทำภารกิจบนเว็บให้ครบ\n3. คัดลอก Key ไปใส่ในสคริปต์ DEVIL HUB\n\n**วิธี Reset HWID**\nปิดสคริปต์ที่เครื่องเก่าก่อน กด Reset Hwid แล้วใส่คีย์ Premium ที่แอดมินสร้างและยังไม่หมดอายุ\nเมื่อสำเร็จ ให้นำคีย์เดิมไปรันบนเครื่องใหม่เพื่อผูก HWID ใหม่ วันหมดอายุคงเดิม\nคีย์ Free รีเซ็ตผ่านบอทไม่ได้ รีเซ็ตซ้ำได้หลัง 5 นาที และเครื่องเก่าจะผูกกลับไม่ได้ 10 นาที\nคีย์และผลการรีเซ็ตจะแสดงเฉพาะคุณ`;
}
