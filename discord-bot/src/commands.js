import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
export const command = new SlashCommandBuilder().setName('setdevilhub')
  .setDescription('ลงแผง DEVIL HUB / Reset HWID และ Get Key ในช่องที่เลือก')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false)
  .addChannelOption(option => option.setName('channel').setDescription('ช่องสำหรับลงแผง DEVIL HUB')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true));
export const verifyCommand = new SlashCommandBuilder().setName('set-verify')
  .setDescription('Open the private DEVIL HUB verification setup panel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageRoles).setDMPermission(false);
