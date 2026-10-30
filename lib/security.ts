const encoder = new TextEncoder();
const MAX_BODY = 16_384;
export class RequestError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export async function readJson(req: Request, maximum = MAX_BODY) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || "")) throw new RequestError(415, "JSON request required");
  const size = Number(req.headers.get("content-length"));
  if (size > maximum) throw new RequestError(413, "Request too large");
  const reader = req.body?.getReader();
  if (!reader) throw new RequestError(400, "JSON object required");
  const chunks: Uint8Array[] = []; let total = 0;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new RequestError(408, "Request timed out")); void reader.cancel().catch(() => {}); }, 15_000);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]); if (done) break;
      total += value.byteLength;
      if (total > maximum) { await reader.cancel(); throw new RequestError(413, "Request too large"); }
      chunks.push(value);
    }
  } finally { clearTimeout(timer!); reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw 0;
    return value as Record<string, unknown>;
  } catch { throw new RequestError(400, "JSON object required"); }
}
function encode(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
function decode(value: string) { return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0)); }
async function signingKey(secret: string) {
  if (secret.length < 32) throw new Error("KEY_SECRET must contain at least 32 characters");
  return crypto.subtle.importKey("raw", encoder.encode("DEVIL-WEB-AUTH:v1:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function seal(data: Record<string, unknown>, purpose: string, secret: string, ttl: number, now = Date.now()) {
  const payload = encode(encoder.encode(JSON.stringify({ ...data, purpose, iat: now, exp: now + ttl })));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(payload));
  return payload + "." + encode(new Uint8Array(signature));
}
export async function unseal(value: string | undefined, purpose: string, secret: string, now = Date.now()) {
  if (!value || value.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const [payload, signature] = value.split(".");
    if (!await crypto.subtle.verify("HMAC", await signingKey(secret), decode(signature), encoder.encode(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(decode(payload)));
    if (data.purpose !== purpose || !Number.isSafeInteger(data.iat) || !Number.isSafeInteger(data.exp)
      || data.iat > now + 30_000 || data.exp <= now || data.exp <= data.iat || data.exp - data.iat > 86_400_000) return null;
    return data as Record<string, unknown>;
  } catch { return null; }
}
export function cookieName(req: Request, name: string) { return (new URL(req.url).protocol === "https:" ? "__Host-" : "") + name; }
export function cookieValue(req: Request, name: string) {
  const values = (req.headers.get("cookie") || "").split(";").map(s => s.trim()).filter(s => s.startsWith(name + "="));
  return values.length === 1 ? values[0].slice(name.length + 1) : undefined;
}
export function cookie(req: Request, name: string, value: string, seconds: number) {
  return `${cookieName(req, name)}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function requireOrigin(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin || req.headers.get("sec-fetch-site") === "cross-site") throw new RequestError(403, "Please use the DEVIL KEY website");
}
