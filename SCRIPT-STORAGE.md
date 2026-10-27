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

## Main loader delivery

The main runtime uses an immutable release manifest covering all 12 maps and
their dependencies, including branding images and vendored libraries. It is
separate from individually uploaded drafts: activating a draft does not silently
change a dependency whose size/checksum is pinned by another file.

`POST /api/runtime/session` accepts the same key/HWID JSON as `/api/validate`.
After verification it issues a signed delivery ticket pinned to the active
release. The ticket lasts at most 24 hours and never beyond the key's expiry.
Every file request rechecks the key's current status and stored device binding.
Tickets are bearer credentials: do not share private download URLs. Client-side
HWIDs and downloaded code cannot provide absolute protection against extraction.

The Git bootstrap retains the existing blue key panel. It downloads the original
main loader and scopes compilation so own-repository dependency URLs point to
`/api/runtime/files/<ticket>/<original-commit>/<original-path>`. Bytes downloaded
from R2 remain identical; existing size/checksum tests still see the originals.
The real `game` instance and executor globals are preserved. Queued re-execution
uses `https://devil-hub.dev/loader`, so a rejoin does not reuse an expired private
ticket. The previous Git main entry is retired. The website's copyable launch
code also uses the domain entry. Runtime sessions require the current bootstrap
release; the previous Git bootstrap cannot open a new delivery session.

Privileged imports run locally with `node scripts/import-runtime.mjs <absolute
runtime-manifest.json>` and verify every uploaded content hash by reading it
back. Add `--activate` only after the complete upload verifies. Credentials are
read from the ignored `.env.cloudflare.local`; account, bucket and database are
explicitly selected. The importer changes only the `runtime:active` setting;
it never changes existing keys, devices or mission progress. A previous manifest
can be activated to roll back. The admin vault shows the active runtime release.
# Account issuance and browser navigation

Mission keys are limited to one active key per Discord account across plans,
flows and browser sessions. Eligibility and the account lock are checked in the
same SQLite insertion statement; repeated claims return the existing key without
changing its expiry. Admin-created keys are separate from mission issuance.

Migration 0006 adds nullable account ownership fields and an indexed lookup;
existing keys, device bindings and expiry values are preserved. A legacy flow
is attached to an account only after checking its signed flow-owner cookie.
Old keys without any stored account association cannot be attributed after
that cookie has been lost; the system does not guess ownership.

Browser document requests for `/loader` and runtime file URLs display an access
denied page. This is presentation, not proof of client identity. Runtime files
still require signed tickets and active key/device checks. A client authorized
to execute downloaded code can also save that code; browser headers cannot
provide absolute source secrecy. Keep R2 private and do not publish source in Git.
