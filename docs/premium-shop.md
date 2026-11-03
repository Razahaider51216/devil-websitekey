# Premium key shop

- Storefront: `/buy`.
- Transfer and slip upload: `/buy/<order-id>`.
- Management: Admin → Premium shop → Products / Orders / Payment settings.
- No products or prices are seeded. The administrator creates and publishes them.

The existing blue DEVIL HUB theme and logo are retained. The storefront, exact-
amount PromptPay QR, slip upload, issued key and admin controls support Thai and
English. The QR can be saved to the buyer's device. Monetag is absent from Buy.

## Configuration

Cloudflare Worker secrets:

```
SLIPOK_API_KEY=<SlipOK API key>
SLIPOK_BRANCH_ID=<numeric SlipOK branch ID>
```

Set the receiver's PromptPay ID, full account name, optional English/name aliases,
payment window (15–60 minutes) and new-purchase availability in Payment settings.
The recipient must be the same primary account registered with that SlipOK branch.
Secrets are never returned in API responses, HTML, client bundles or admin inputs.
The secret is not stored in D1. Existing KEY_SECRET and private SCRIPT_FILES R2
bindings remain required. Disabling new purchases preserves existing orders.

The QR embeds the server-quoted total. Some banking apps may allow amount edits;
the server accepts only the exact integer-satang amount from the order snapshot.

## Payment processing

1. Login is mandatory, including when public Free Get Key login is disabled.
2. Order creation snapshots product name, price, duration and payment recipient.
   Changes/deletion of a product do not rewrite already-created invoices.
3. Each order is bound to its Google or Discord identity, has an expiry and a
   client idempotency key. At most five unexpired unpaid orders exist per buyer.
4. A bounded PNG/JPEG/WebP upload is sent server-side to the fixed SlipOK API
   using `files`, `log=true` and `amount`, with a 30-second timeout and no redirects.
5. Approval requires both SlipOK success flags, real bank reference, exact THB
   amount, transfer time within the invoice, matching recipient name/alias and
   matching visible PromptPay digits when returned. SlipOK `log=true` also checks
   its registered recipient. Provider errors, including duplicate-slip payloads
   containing `data.success=true`, are never treated as approval.
6. Verified proof and the verified slip image are saved privately in R2. The
   same order/image can resume after a D1 outage without paying for another check.
7. Bank-reference ownership, key issuance and Paid are committed in one D1 batch.
   Unique bank references prevent reusing a transfer across orders/concurrent
   submissions. A paid retry returns the same deterministic key.
8. Keys use source `purchase`, the existing HMAC format and HWID validation.
   Purchased and admin-created keys receive premium runtime/Finder permissions.
   Free keys remain nonpremium. Key duration starts at successful issuance.

Private R2 objects use `shop/slips/` and are separate from Lua runtime files and
support-chat images. Only authenticated Discord admins can retrieve slip images.
The order owner can retrieve their key; other accounts receive Not Found.
Google and Discord identities are never silently linked. Discord bot HWID reset
continues to require a matching Discord key owner; Google buyers should contact
support if they need a reset.

If the bank delays verification, show its retry timer and reuse the same slip.
If the payment window expires after transfer, or the first successful provider
check cannot be durably recorded, direct the buyer to support with the order ID;
never ask them to pay again. There is no unchecked manual approval endpoint.

## Deployment and checks

Migration `0010_premium_shop.sql` adds only shop/order/receipt tables and indexes.
Existing keys, devices, missions, chat and runtime pointers are preserved.

```sh
npm test
npx tsc --noEmit
npm run build:cf
python tests/shop-browser.py # local Wrangler on 127.0.0.1:5184; API fixtures only
npm run deploy:cf            # applies D1 migrations before Worker deployment
```

Local tests cover product CRUD/versions, owner and admin isolation, CSRF, integer
amounts, QR payloads, native bank response validation, upload bounds, repeat and
concurrent verification, duplicate references, provider rejection, D1 recovery,
Google ownership and real runtime premium entitlement. Browser checks cover
desktop/mobile products, QR rendering, slip upload, key display and admin CRUD.

Official protocol references:

- https://slipok.com/check-slip/
- https://slipok.com/api-documentation/error-status-code/
- https://slipok.com/api-documentation/request-response-example/
- https://github.com/dtinth/promptpay-qr

Mocked successful transfers do not prove a live bank transfer or the exact
recipient naming returned by each bank. No real transfer is made during QA.
