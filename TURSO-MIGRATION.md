# Preserve existing keys when switching D1 to Turso

The application defaults to D1. Setting Turso credentials alone does not switch databases.
Never change `KEY_SECRET`: existing key strings are derived from it and the stored IDs.
Keep `ADMIN_ACCESS_KEY`, Turnstile keys, hostname, and cookie configuration unchanged.

## Preparation

Create an empty **libSQL** database in Turso. Set Worker runtime values
`TURSO_DATABASE_URL=libsql://...` and `TURSO_AUTH_TOKEN` (Secret).
Do **not** set `DATABASE_PROVIDER=turso` yet.
Credentials must not enter git, screenshots, or chat. Backups go in ignored `backups/`.

This checkout includes a provider selector and a maintenance gate. Deploy that code
on D1 before the final export, when D1 migration queries are available again.
Do not bypass a failed migration against an unknown schema.

## Freeze, export, import, verify

1. Set Worker runtime `KEY_MAINTENANCE=1`. Confirm API requests return 503 before
   exporting; this blocks issuance, revocation, steps, and new HWID bindings.
   Existing script sessions may stop after their normal validation retries, so
   schedule a short maintenance window. Do not disable script key checks.
2. Authenticate Wrangler with the correct Cloudflare account. Export the production
   D1 database while writes are paused:

   ```powershell
   npx wrangler d1 export DB --remote --config dist/server/wrangler.json --output backups/d1.sql
   python scripts/snapshot-d1.py backups/d1.sql backups/snapshot.json
   ```

   If export is blocked by quota, wait for reset or use an existing complete backup.
   Never substitute an empty/local development database for production data.
3. Put Turso credentials into this terminal's environment securely. Run:

   ```powershell
   node scripts/turso-transfer.mjs import backups/snapshot.json
   node scripts/turso-transfer.mjs verify backups/snapshot.json
   ```

   The importer requires an empty target, creates schema/indexes, imports all seven
   tables, compares every field and checks foreign keys before committing. It
   refuses to overwrite an existing target. The separate verification repeats the
   comparison after commit. Both must succeed.
4. After verification, set `database_provider` to `turso` and
   `turso_import_verified` to `true` in `cloudflare.config.json`. This records the
   verified cutover for subsequent GitHub builds. A build-only environment override
   `DATABASE_PROVIDER` also exists; remove any stale override from Cloudflare Builds.
   Keep maintenance enabled. Rebuild/deploy the current commit. The deployment
   skips D1 migrations only for this explicit Turso setting and retains D1 binding.
   The built Worker explicitly selects Turso; other runtime values/secrets remain
   preserved. The verification flag is an operator assertion, not an automatic
   remote verification. Future schema changes require Turso migrations separately.
5. Set `KEY_MAINTENANCE=0`, then test a known existing key on its original device,
   a mismatched device rejection, a revoked key, expiry, and a fresh step claim.
   Existing key strings, timestamps, revocations, HWID hashes and admin settings
   remain identical; ongoing flows are transferred too.

## Rollback

Before accepting writes in Turso, reverting runtime `DATABASE_PROVIDER=d1` is safe.
After accepting writes, D1 is stale: freeze again and reconcile/export those changes
before reverting, otherwise new keys/revocations/HWID bindings can disappear.
Never delete the source D1 database as part of cutover.

Local tests exercise permanent/revoked keys, expiry and HWID field preservation,
repeat-import refusal and changed-data detection. They are not a production import.
