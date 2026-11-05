Admin key categories

The existing key manager defaults to Admin-created keys. The category selector
also provides Free keys from steps, purchased Premium keys, and all keys.
Creating an admin key returns to the Admin category and clears the search.
The created-key banner is shown only in the Admin and All categories.

GET /api/admin/keys accepts source=admin|steps|purchase|all. Missing source keeps
the previous all-keys behavior. Filtering happens before the latest-200 limit,
so older admin keys are available even when newer Free keys fill that limit.
categoryTotal counts the whole selected category; overview statistics remain
global. Existing authorization, key issuance, revocation and countdown behavior
are retained. No key records, entitlements or Script code are migrated.

Validation: 106 automated tests, TypeScript, Cloudflare build, and fixture-based
production-bundle browser checks on mobile Thai and desktop English, covering
category changes, search, creation, revocation and layout. No real keys are
created or revoked by browser QA.
