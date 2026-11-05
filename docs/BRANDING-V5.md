DEVIL HUB v5 logo — 2026-11-05

The supplied devilhubv5.png is published unchanged. Its SHA-256 is
5811a965bb5551f05e6801ae53681cae1ad7ff766bba20772d2f84bcf472f332.

Brand header, favicon/apple icon, support chat header, admin message avatars and
the private Discord Verify page use /devilhubv5.png. The legacy /devilhubv3.png
path serves those exact new bytes. The old red favicon SVG is replaced by a
307 redirect to the new PNG. Logo sizing preserves the aspect ratio.

Dump delivery records point to an immutable new entry and logo in R2. The entry's
outer and two nested image caches have new filenames. GUI/controller payloads
and dump features are preserved. The staged R2 objects must exist before deploy.

The companion script release runtime-brand-v5-20261105-1 updates all fifteen
supported maps, four image aliases and every changed GUI integrity dependency.
It is activated only after the new public website image is verified. No Key,
mission, login, shop/payment or API authorization logic changes are included.

Validation: 106 automated web tests, TypeScript, Cloudflare production build,
and production-bundle browser checks at 390px and 1440px. Browser checks cover
home, Buy, Support Games, Admin, Verify, chat, icons, image dimensions, legacy
image byte identity, no horizontal overflow and no page errors. Screenshots and
logs are under .sites-runtime/branding-v5*. Script runtime checks and release
audits are in devil-scripthub/tools/branding-v5 and its release metadata.

Deployed Worker: c40ecd7d-2df0-4557-9ce0-2418bca2feb7. The browser checks
also pass against https://devil-hub.dev using fixture API responses, with real
production HTML, JavaScript and images. Actual login/payment mutations and live
Roblox gameplay are not performed by these branding checks.
