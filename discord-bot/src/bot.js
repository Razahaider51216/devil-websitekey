import { Client, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { readConfig } from './config.js';
import { panel, resetModal, resetResult, ids, info } from './ui.js';
import { register } from './register.js';
import { resetHwid } from './reset.js';
import { createVerifier } from './verify.js';
import { acquireBotLock,createInteractionGate } from './process-guard.js';
import {createAutoScript} from './auto-script.js';

const config = readConfig();
let processLock;
try { processLock=await acquireBotLock(config.applicationId); }
catch(error){console.error(error.message);process.exit(1);}
const acceptInteraction=createInteractionGate();
const client = new Client({ intents: [GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent] });
const verifier = await createVerifier(client,config);
const autoScript=await createAutoScript(client,config);
const panels = new Map();
const busy = new Set();
const stateFile = new URL('../data/panels.json', import.meta.url);
try { for (const [channel, id] of Object.entries(JSON.parse(await readFile(stateFile, 'utf8')))) panels.set(channel, id); }
catch (error) { if (error.code !== 'ENOENT') throw new Error('Panel state file is invalid'); }
async function publish(channel) {
  const permissions = channel.permissionsFor(client.user);
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles])) {
    throw new Error('BOT_CHANNEL_PERMISSIONS');
  }
  let message;
  const old = panels.get(channel.id);
  if (old) {
    try { message = await channel.messages.fetch(old); }
    catch (error) { if (error.code !== 10008) throw error; }
  }
  if (message && message.author.id !== client.user.id) throw new Error('PANEL_AUTHOR');
  const payload = panel(config.website);
  message = message ? await message.edit({ ...payload, attachments: [] }) : await channel.send(payload);
  panels.set(channel.id, message.id);
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(new URL('../data/panels.tmp', import.meta.url), JSON.stringify(Object.fromEntries(panels)), 'utf8');
  await rename(new URL('../data/panels.tmp', import.meta.url), stateFile);
}
client.once(Events.ClientReady, async ready => {
  if (ready.application.id !== config.applicationId) {
    console.error('Bot token does not match DISCORD_APPLICATION_ID'); client.destroy();await processLock.close();process.exitCode = 1; return;
  }
  console.log('DEVIL HUB HWID bot connected');
  verifier.start();
  try { await register(config); console.log('HWID, verification and auto-script commands ready'); }
  catch (error) { console.error('Command registration failed:', error.code || error.name); }
});
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isModalSubmit() && !interaction.isAnySelectMenu()) return;
  if (!acceptInteraction(interaction.id)) return;
  try {
    if (interaction.guildId !== config.guildId) {
      await interaction.reply({ content: 'ใช้บอทในเซิร์ฟเวอร์ DEVIL HUB ที่กำหนดเท่านั้น', flags: MessageFlags.Ephemeral }); return;
    }
    if (await verifier.handle(interaction)) return;
    if (await autoScript.handle(interaction)) return;
    if (interaction.isChatInputCommand() && interaction.commandName === 'setdevilhub') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: 'คำสั่งนี้สำหรับผู้ดูแลเซิร์ฟเวอร์เท่านั้น', flags: MessageFlags.Ephemeral }); return;
      }
      const channel = interaction.options.getChannel('channel', true);
      if (channel.guildId !== config.guildId || !channel.isTextBased() || typeof channel.send !== 'function') throw new Error('INVALID_CHANNEL');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (busy.has('publish')) { await interaction.editReply('กำลังลงแผง กรุณาลองอีกครั้ง'); return; }
      busy.add('publish');
      try { await publish(channel); } finally { busy.delete('publish'); }
      await interaction.editReply({ content: `ลงแผง DEVIL HUB ใน <#${channel.id}> เรียบร้อยแล้ว`, allowedMentions: { parse: [] } }); return;
    }
    if (interaction.isButton() && interaction.customId === ids.reset) { await interaction.showModal(resetModal()); return; }
    if (interaction.isButton() && interaction.customId === ids.info) {
      await interaction.reply({ content: info(config.website), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }); return;
    }
    if (interaction.isModalSubmit() && interaction.customId === ids.modal) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const key = interaction.fields.getTextInputValue('premium_key').trim();
      const result = await resetHwid(config, key, interaction.user.id, interaction.id);
      await interaction.editReply(resetResult(result, client.user.displayAvatarURL({ size: 128, extension: 'png' })));
    }
  } catch (error) {
    if ([10062,40060].includes(error.code)) { console.warn('Discord interaction is no longer available:',error.code);return; }
    if (interaction.commandName === 'set-verify' || interaction.customId?.startsWith('devilhub:verify:')) {
      console.error('Verification interaction failed:',error.code||error.name);
      try { await verifier.error(interaction,error); } catch { /* Interaction expired. */ }
      return;
    }
    // Never print interaction payloads, keys, tokens, HTTP bodies or private URLs.
    console.error('Discord action failed:', error.code || error.name);
    const content = 'ทำรายการไม่สำเร็จ กรุณาตรวจสิทธิ์บอทหรือลองอีกครั้ง';
    try {
      const payload = interaction.isModalSubmit() && interaction.customId === ids.modal
        ? resetResult({ ok: false, message: content }, client.user.displayAvatarURL({ size: 128, extension: 'png' }))
        : { content };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    } catch { /* Interaction may have expired. */ }
  }
});
client.on(Events.Error, error => console.error('Discord client error:', error.code || error.name));
client.on(Events.MessageCreate,message=>{void autoScript.onMessage(message).catch(error=>console.error('Auto-script delivery failed:',error.code||error.name));});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { autoScript.stop();verifier.stop();client.destroy();void processLock.close().finally(()=>process.exit(0)); });
try { await client.login(config.token); }
catch (error) { console.error('Discord connection failed:', error.code || error.name);client.destroy();await processLock.close();process.exitCode = 1; }
