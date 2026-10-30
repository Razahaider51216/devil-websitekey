# DEVIL KEY 1.1.0: private admin support

- The bottom-right chat button opens a conversation for the signed-in Google or Discord account.
- Sender names, avatars and provider labels come from verified login profiles, never upload fields.
  Old messages remain readable; user profile fallbacks refresh when that account returns to chat.
  Compact message bubbles keep sender identity and timestamps outside their border.
- Admin → Support inbox lists conversations, unread indicators and replies. Only Discord IDs in
  `DISCORD_ADMIN_USER_IDS` can use admin routes. Google identities do not inherit admin access.
- Text supports 2,000 characters. Each message can include a PNG, JPEG or WebP image up to 4 MiB.
  The browser reduces large images where supported. Pictures remain in the private `SCRIPT_FILES`
  R2 bucket under a separate `support/` prefix and require authentication when viewed.
- Messages use client UUIDs to deduplicate send retries. Read positions cannot mark future messages
  as read. Older messages are paginated; the inbox and history queries use dedicated indexes.
- Open conversations poll every four seconds; the admin list polls every ten seconds. Hidden tabs
  pause polling. Closing the user widget stops its polling. This is asynchronous support, not a bot.
- Apply migrations `0007_support_chat.sql` and `0008_support_profiles.sql` before deploying. They add two tables
  and their indexes. Existing keys, devices, login flows, mission settings and runtime pointers stay intact.
- No additional environment variables or public R2 bucket are required.

Validation: `npm test`, `npx tsc --noEmit`, `npm run build:cf`; real-handler SQLite integration covers
account isolation, Google/Discord separation, administrator authorization, private images, unsafe uploads,
CSRF, unread markers and duplicate sends. Browser checks cover desktop/mobile layout, user/admin text
and image sends, Escape, image decoding and client errors using mocked local conversations.
