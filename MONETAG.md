# Mission OnClick advertising

The original supplied tag is loaded once per document on the authenticated Free Get Key mission page for 6H, 12H and 24H: `https://al5sm.com/tag.min.js`, zone `12144051`. There is no SmartLink, per-button restriction, custom frequency cap, popup override, synthetic click, automatic retry or ad-completion requirement. Monetag controls ad delivery.

The script is not loaded in the root layout, Login, Admin, Supported Games, the plan picker or the issued-key view. Leaving missions for the plan picker performs a full navigation. Receiving a key reloads the document once, so script-installed listeners do not persist on the key view. Existing navigation links and logout use full document navigation. Removing a script element alone cannot remove its third-party event listeners.

Mission links and server-side key eligibility are unchanged. Ads can be blocked without preventing mission completion or key issuance. The provider script may intercept page clicks; actual popup delivery and first-click mission behavior depend on Monetag and the browser. These cannot be guaranteed without controlling the third-party script. No changes to login handlers, key verification, flow APIs or database schema are required.

`tests/mission-ad-browser.py` mocks the tag and all APIs, covers all three plans on desktop and mobile, and never generates real ad traffic. It verifies one tag per document, Step/claim flow, blocked script behavior and clean document transitions. It does not certify behavior of Monetag's live obfuscated script.

Validation: `npx tsc --noEmit`, `npm test`, `python tests/mission-ad-browser.py` against a local dev server, then `npm run build:cf`.

Deployment authorized and completed on 2026-10-29: Cloudflare Worker version `dab12c95-bbc2-4757-ba38-7b9554cc54ee`. The production home, auth session and games APIs returned HTTP 200; the unauthenticated home had no ad tag. Production UI checks use the same mocked tag/API browser fixture and do not verify actual provider ad delivery.
