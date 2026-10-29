# DEVIL HUB HWID bot

New, independent Discord bot. Uses the DEVIL KEY website database rather than
creating another key store. Gateway client requires Node 24+ and a running host.
It is not a Cloudflare Worker process; only the authenticated reset API runs there.

## Setup

1. Create a new application at https://discord.com/developers/applications.
2. General Information: copy Application ID. Bot: create/reset the bot token.
3. Copy `.env.example` to `.env` if an environment file has not been prepared.
   Set `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, `DISCORD_GUILD_ID`.
   Never paste tokens into chat, screenshots, Git or logs.
4. Keep the same random `DISCORD_BOT_API_SECRET` in the bot `.env` and as a
   Cloudflare Worker Secret. It must be at least 32 characters. This is separate
   from the bot token, Discord OAuth Client Secret, and website KEY_SECRET.
5. OAuth2 → URL Generator: select `bot` + `applications.commands`. Select View
   Channels, Send Messages, Read Message History, Attach Files; invite to the
   configured server. No privileged intents or Administrator permission required.
6. In this directory run `npm ci`, `npm run check`, then `npm start`.
   The bot upserts `/setdevilhub` on ready; `npm run register` also registers it.
7. A server member with Manage Server runs `/setdevilhub channel:#your-channel`.
   Repeating it updates this bot's existing panel in the same channel.

## Panel

Components V2 container with no accent color or legacy embed. Image comes from
`assets/devilhub.png` (copied from the supplied Downloads image), then:

```
# DEVIL HUB
> `Reset HWID` For Key Premium
> `Get Key` Free to Website
────────────────────────
[Reset Hwid] [Get Key ↗] [Info]
```

Get Key opens https://devil-hub.dev. Info is visible only to the clicker. Reset
opens a modal; key input/results are never posted publicly or logged.
Reset Hwid is a green Success button with `watergear` (`1565299333794889778`).
Get Key uses 🔑. Info is a Secondary button with the animated `jungwad_`
emoji (`1565299349099909120`).
Info displays both Thai and English instructions in the same private message.
Reset results are separate ephemeral, colorless embeds. They show the bot's own
avatar as a thumbnail, with `<a:emoji_25:1540658596487102464>` on success or
`<:ojic_018:1546638491478265946>` on failure, including API/network failures.
The main Components V2 panel and Info message do not get this avatar thumbnail.

## Reset rules

`POST /api/bot/reset-hwid` requires the bot secret. Actor and interaction IDs come
from Discord's authenticated gateway events. The API validates everything again:

- Only active, non-revoked `source=admin` keys; all free/step keys are rejected.
- If an admin key has an assigned account owner, Discord user ID must match.
- Clear only the device binding. Keep the key value, expiry and premium status.
- At most 5 attempts/minute per Discord user; one successful reset/key/5 minutes.
- A transactional cooldown claim prevents concurrent resets and immediate replay.
- The old HWID cannot reclaim the unbound key for 10 minutes. Close the old script
  before resetting, then use the same key on the new machine to bind it there.
- Existing private runtime file tickets require the current binding and stop
  working when that binding is removed.
- Audit metadata contains account/interaction IDs and HWID hashes, never raw keys.

No new DB tables or migrations. The website's existing `site_settings` and
`rate_limits` tables store reset audit/cooldown information.

`npm test` tests serialized Discord components and reset HTTP behavior without
logging in or posting messages. Website tests cover real SQLite transactions,
premium eligibility, concurrency, duplicate requests and the old-device barrier.

Discord documentation: https://docs.discord.com/developers/components/overview
and https://discord.js.org/docs/packages/discord.js/14.27.0/ContainerBuilder:Class
