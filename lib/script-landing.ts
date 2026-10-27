// Navigation presentation is not authorization: runtime downloads still require
// a signed, unexpired ticket, an active key and its device binding.
export function documentRequest(req: Request) {
  return req.headers.get("sec-fetch-mode") === "navigate" ||
    req.headers.get("sec-fetch-dest") === "document" ||
    (req.headers.get("accept") || "").toLowerCase().includes("text/html");
}
export function scriptLanding() {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Nice try · DEVIL HUB</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:#06090f;color:#eaf1ff;font-family:ui-monospace,monospace;padding:24px;background-image:linear-gradient(#12305122 1px,transparent 1px),linear-gradient(90deg,#12305122 1px,transparent 1px);background-size:42px 42px}main{width:min(100%,680px);border:1px solid #247bc2;border-radius:20px;padding:clamp(28px,7vw,64px);background:#0b1320ee;box-shadow:0 0 80px #0878db22}.tag{color:#59baff;letter-spacing:.2em;font-size:12px}h1{font-size:clamp(30px,6vw,50px);line-height:1.15;letter-spacing:-.04em}p{color:#97adc7;line-height:1.8}a{display:inline-block;color:#80cbff;text-decoration:none;border:1px solid #244d75;border-radius:10px;padding:14px 20px;margin-top:18px}a:hover{background:#123051}.face{font-size:48px;color:#59baff;margin:32px 0 0}</style><main><span class="tag">DEVIL HUB // ACCESS DENIED</span><div class="face">[ &gt;_&lt; ]</div><h1>Huh, what are you doing here?</h1><p>Looking for the source? Cute.<br>This door leads nowhere. Your key portal is over there.</p><a href="/">Back to DEVIL KEY →</a></main></html>`, {
    status: 403, headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow", "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
