import { GoogleLoginError } from "./login-failure";

function encode(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new GoogleLoginError("GOOGLE_TOKEN_INVALID");
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
}
export async function googlePkce() {
  const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}
export function googleAuthorizationUrl(clientId: string, redirect: string, state: string, nonce: string, challenge: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", scope: "openid profile", state, nonce, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" }).toString();
  return url.href;
}
type GoogleJwk = JsonWebKey & { kid?: string };
let cached: { keys: GoogleJwk[]; expiresAt: number; send: typeof fetch } | undefined;
async function signingKeys(send: typeof fetch, refresh = false) {
  if (!refresh && cached && cached.expiresAt > Date.now() && cached.send === send) return cached.keys;
  let response: Response;
  try { response = await send("https://www.googleapis.com/oauth2/v3/certs", { signal: AbortSignal.timeout(10000) }); }
  catch { throw new GoogleLoginError("GOOGLE_NETWORK_FAILED"); }
  if (!response.ok) throw new GoogleLoginError("GOOGLE_IDENTITY_FAILED");
  const body = await response.json() as { keys?: GoogleJwk[] };
  if (!Array.isArray(body.keys) || !body.keys.length || body.keys.length > 20) throw new GoogleLoginError("GOOGLE_IDENTITY_FAILED");
  const age = Math.min(3600, Math.max(30, Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1]) || 300));
  cached = { keys: body.keys, expiresAt: Date.now() + age * 1000, send };return body.keys;
}
export function googleAvatar(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try { const url = new URL(value);return url.protocol === "https:" && !url.username && !url.password && !url.port && (url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com")) ? url.href : undefined; } catch { return undefined; }
}
export async function verifyGoogleIdToken(token: string, clientId: string, nonce: string, send: typeof fetch = fetch) {
  try {
    if (!token || token.length > 16384) throw 0;
    const parts = token.split(".");if (parts.length !== 3) throw 0;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0]))) as { alg?: string; kid?: string };
    if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid || header.kid.length > 256) throw 0;
    let keys = await signingKeys(send), jwk = keys.find(key => key.kid === header.kid);
    if (!jwk) { keys = await signingKeys(send, true);jwk = keys.find(key => key.kid === header.kid); }
    if (!jwk || jwk.kty !== "RSA" || jwk.alg && jwk.alg !== "RS256" || jwk.use && jwk.use !== "sig") throw 0;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]))) throw 0;
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1]))) as Record<string, unknown>, now = Math.floor(Date.now() / 1000);
    if (!["https://accounts.google.com", "accounts.google.com"].includes(claims.iss as string) || claims.aud !== clientId || claims.azp !== undefined && claims.azp !== clientId
      || claims.nonce !== nonce || !Number.isSafeInteger(claims.exp) || (claims.exp as number) <= now || !Number.isSafeInteger(claims.iat) || (claims.iat as number) > now + 60 || (claims.iat as number) < now - 3600
      || (claims.exp as number) <= (claims.iat as number) || (claims.exp as number) - (claims.iat as number) > 86400
      || typeof claims.sub !== "string" || !/^[A-Za-z0-9_-]{1,255}$/.test(claims.sub)) throw 0;
    return { id: "google:" + claims.sub, name: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 80) : "Google user", avatarUrl: googleAvatar(claims.picture) };
  } catch (error) {
    if (error instanceof GoogleLoginError) throw error;
    throw new GoogleLoginError("GOOGLE_TOKEN_INVALID");
  }
}
export async function googleIdentity(code: string, clientId: string, secret: string, redirect: string, verifier: string, nonce: string, send: typeof fetch = fetch) {
  if (!code || code.length > 2048) throw new GoogleLoginError("GOOGLE_GRANT_INVALID");
  let response: Response;
  try { response = await send("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: secret, redirect_uri: redirect, code_verifier: verifier }), signal: AbortSignal.timeout(10000) }); }
  catch { throw new GoogleLoginError("GOOGLE_NETWORK_FAILED"); }
  if (!response.ok) {
    let error: unknown;try { error = ((await response.json()) as { error?: unknown }).error; } catch { /* No upstream response bodies in logs or redirects. */ }
    throw new GoogleLoginError(error === "invalid_client" || response.status === 401 ? "GOOGLE_CLIENT_INVALID" : error === "invalid_grant" ? "GOOGLE_GRANT_INVALID" : response.status === 429 ? "GOOGLE_RATE_LIMIT" : "GOOGLE_TOKEN_FAILED");
  }
  const body = await response.json() as { id_token?: unknown };
  if (typeof body.id_token !== "string") throw new GoogleLoginError("GOOGLE_TOKEN_INVALID");
  return verifyGoogleIdToken(body.id_token, clientId, nonce, send);
}
