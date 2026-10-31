import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
export const command = new SlashCommandBuilder().setName('setdevilhub')
  .setDescription('ลงแผง DEVIL HUB / Reset HWID และ Get Key ในช่องที่เลือก')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false)
  .addChannelOption(option => option.setName('channel').setDescription('ช่องสำหรับลงแผง DEVIL HUB')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true));
export const verifyCommand = new SlashCommandBuilder().setName('set-verify')
  .setDescription('Open the private DEVIL HUB verification setup panel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageRoles).setDMPermission(false);
function scriptChannelCommand(name,description){return new SlashCommandBuilder().setName(name).setDescription(description)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false)
  .addChannelOption(option=>option.setName('channel').setDescription('Channel for Lua feature requests')
    .addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement).setRequired(true));}
export const autoScriptCommand=scriptChannelCommand('auto-create-script','Enable private Lua script generation for messages in a channel');
export const removeAutoScriptCommand=scriptChannelCommand('remove-autocreate-script','Disable automatic Lua script generation in a channel');
