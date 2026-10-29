export function readConfig(env = process.env) {
  const token = env.DISCORD_BOT_TOKEN?.trim();
  const applicationId = env.DISCORD_APPLICATION_ID?.trim();
  const guildId = env.DISCORD_GUILD_ID?.trim();
  const apiSecret = env.DISCORD_BOT_API_SECRET?.trim();
  if (!token || !/^\d{17,22}$/.test(applicationId || '') || !/^\d{17,22}$/.test(guildId || '')) {
    throw new Error('Set DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID and DISCORD_GUILD_ID in discord-bot/.env');
  }
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(apiSecret || '')) throw new Error('Set DISCORD_BOT_API_SECRET in the bot and Worker');
  const website = new URL(env.DEVIL_WEBSITE_URL || 'https://devil-hub.dev');
  if (website.origin !== 'https://devil-hub.dev' || website.username || website.password) throw new Error('Website must be https://devil-hub.dev');
  return { token, applicationId, guildId, apiSecret, website: website.origin };
}
