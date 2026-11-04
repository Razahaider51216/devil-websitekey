DEVIL KEY 1.1.2

Authenticated users can delete their own Free key from the key ticket. Deletion
revokes the key and expires all old account mission sessions in one D1 batch.
The next flow starts without a plan, progress or CAPTCHA proof. A repeated delete
does not reset new progress. Premium, another user's key and anonymous requests
cannot use this endpoint.

Active purchased/assigned Premium takes priority in the account portal, including
Google and Discord identities. It is restored without requiring the old flow
cookie. The portal shows the Premium key and no Free missions or delete button.
Free issuance checks Premium absence within the same SQL statement, so a purchase
committed after the eligibility snapshot cannot issue a new Free key.

Automatic payment and direct administrator approval expire the buyer's existing
Free keys in the same transaction as Premium issuance. Validation also enforces
active account Premium before its first HWID binding, retaining the prior HWID
policy. Inactive/revoked Premium does not block future Free missions. The public
validation API never returns a Premium key secret.

The shared Script bootstrap clears rejected Free caches, stops current automation
and opens a replacement key prompt. Its nominal check interval is 15 seconds.
Server invalidation is immediate; running scripts stop at the next successful
validation check, not through a server push.

Validation: real SQLite handler/security tests, payment transaction tests, TSC,
Cloudflare build and production-bundle browser checks at 390px Thai and 1440px
English. Browser checks use fixture APIs and issue no real keys or payments.
No database migration is required. Existing login, payment verification, HWID
binding and supported-game gameplay remain in place.
