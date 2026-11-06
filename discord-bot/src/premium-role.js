import { MessageFlags } from 'discord.js';
import { validateGrantRole } from './verify-ui.js';
import { ids, roleModal, roleResult } from './ui.js';

export const premiumRoleId = '1564302284085796925';
export async function checkPremiumRole(config, key, userId, send = fetch) {
  try {
    const response = await send(config.website + '/api/bot/claim-role', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.apiSecret },
      body: JSON.stringify({ key, discordUserId: userId }),
    });
    const data = await response.json();
    if (response.ok && data?.ok === true && data.status === 'eligible') return { ok: true };
    return { ok: false, message: response.status === 429
      ? 'กรุณารอ 1 นาทีแล้วลองใหม่ / Please wait one minute and try again.'
      : data?.error === 'premium_required'
        ? 'ใช้ Key ซื้อหรือแอดมินสร้างที่ยังไม่หมดอายุ และยังไม่ผูกกับ Discord อื่น / Enter an active purchased or admin-created key belonging to you.'
        : 'ระบบตรวจสอบยังไม่พร้อม กรุณาลองใหม่ / Verification is unavailable. Please try again.' };
  } catch { return { ok: false, message: 'เชื่อมต่อเว็บไม่สำเร็จ กรุณาลองใหม่ / Could not reach the website. Please try again.' }; }
}
export async function handlePremiumRole(interaction, client, config) {
  if (interaction.isButton() && interaction.customId === ids.role) {
    await interaction.showModal(roleModal()); return true;
  }
  if (!interaction.isModalSubmit() || interaction.customId !== ids.roleModal) return false;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const avatar = client.user.displayAvatarURL({ size: 128, extension: 'png' });
  let result;
  try {
    const guild = await client.guilds.fetch(config.guildId);
    const role = await guild.roles.fetch(premiumRoleId);
    validateGrantRole(guild, role, await guild.members.fetchMe());
    const member = await guild.members.fetch(interaction.user.id);
    result = await checkPremiumRole(config, interaction.fields.getTextInputValue('premium_key').trim(), interaction.user.id);
    if (result.ok) {
      await member.roles.add(role, 'DEVIL HUB premium key role claim');
      result.message = 'รับยศ Premium สำเร็จ / Your Premium role has been assigned.';
    }
  } catch {
    result = { ok: false, message: 'มอบยศไม่สำเร็จ กรุณาแจ้งแอดมินตรวจสิทธิ์ Manage Roles และลำดับยศบอท / Could not assign the role. Please contact an administrator.' };
  }
  await interaction.editReply(roleResult(result, avatar));
  return true;
}
