# Private Lua storage

The script vault is a staged replacement for public GitHub runtime files. Adding
this feature does **not** move the production loader or remove its dependencies.
Do not make GitHub private until the entire migrated dependency chain has been
tested with each supported executor/game. Code downloaded to a client can still
be extracted by that client; this controls distribution, not absolute secrecy.

## Cloudflare setup

1. Create R2 bucket `devil-scripts`. Leave both public `r2.dev` access and public
   custom-domain access disabled. Do not attach `devil-hub.dev` directly to R2;
   the domain stays attached to the Worker that checks access.
2. The direct Cloudflare build config binds `SCRIPT_FILES` to the bucket named in
   `cloudflare.config.json` (`scripts_bucket`). Optional build variable
   `CF_R2_BUCKET_NAME` overrides it. No R2 API key is needed in the browser.
3. Build with `npm run build:cf`, deploy with `npm run deploy:cf` as before.
   Existing D1 bindings, keys, Discord login and step settings are retained.

## Admin workflow

Open `/admin`, sign in with a Discord ID listed in `DISCORD_ADMIN_USER_IDS`, then
scroll to **SCRIPT VAULT**. Load the catalog, select one or multiple `.lua` files,
and upload. Each file can be at most 8 MiB of UTF-8 text. Script IDs use lowercase
letters, numbers and hyphens. A multi-file upload derives IDs from filenames.

Uploads are immutable drafts. They never replace a live revision automatically.
Open **Versions** and activate a revision to make that script available through
the test API. Activate an older revision to roll back, or disable downloads.
No source content or credentials are returned by the catalog/history API.
Bulk uploads run sequentially; if one fails, the UI reports the completed count
and leaves successful drafts intact. Retry only the remaining files to avoid
unnecessary duplicate versions.

## Download API

`POST https://devil-hub.dev/api/scripts/download`, JSON:

```json
{ "script": "anime-dice", "key": "DEVIL-...", "hwid": "executor:device-id" }
```

Use exactly the same HWID string as the existing key gate. The endpoint reuses
the current validator, including first-use device binding, expiry, revocation
and rate limits. Disabled scripts and drafts are unavailable. Failed validation
never reads file content from R2. Each successful response checks SHA-256 and
returns Lua text with `Cache-Control: private, no-store`, `X-Devil-Revision` and
`X-Devil-SHA256`. No keys are accepted in query strings; GET cannot fetch code.
An executor must use its HTTP **request** function for this POST, not HttpGet.

The bootstrap and all nested runtime dependencies must be adapted and tested
before changing the existing main loader. Merely uploading a top-level script
does not hide nested URLs or erase past public GitHub history.
