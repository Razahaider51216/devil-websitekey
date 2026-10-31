import { REST, Routes } from 'discord.js';
import { pathToFileURL } from 'node:url';
import { readConfig } from './config.js';
import { command, verifyCommand, autoScriptCommand, removeAutoScriptCommand } from './commands.js';
export async function register(config) {
  const rest = new REST({ version: '10' }).setToken(config.token);
  // Upsert just our command; do not bulk-delete any other commands.
  for (const item of [command,verifyCommand,autoScriptCommand,removeAutoScriptCommand]) await rest.post(Routes.applicationGuildCommands(config.applicationId, config.guildId), { body: item.toJSON() });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await register(readConfig()); console.log('Registered HWID, verification and auto-script commands'); }
  catch (error) { console.error('Command registration failed:', error.code || error.name); process.exitCode = 1; }
}
