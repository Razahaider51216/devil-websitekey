import { env } from "cloudflare:workers";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { limits } from "../db/schema";
import { hash } from "./domain";
import { cookie, cookieName, cookieValue, readJson, RequestError, requireOrigin, seal, unseal } from "./security";
import { googleAuthorizationUrl, googleAvatar, googleIdentity, googlePkce } from "./google-domain";
import { GoogleLoginError, loginFailureCode } from "./login-failure";
import { serviceErrorCode } from "./service-errors";
import { verifyTurnstile } from "./turnstile";

const v = () => env as unknown as Record<string, string>;
const secret = () => v().KEY_SECRET || "";
const read = (req: Request, name: string, purpose: string) => unseal(cookieValue(req, cookieName(req, name)), purpose, secret());
export const googleConfigured = () => /^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/.test(v().GOOGLE_CLIENT_ID || "") && !!v().GOOGLE_CLIENT_SECRET && !!v().TURNSTILE_SITE_KEY && !!v().TURNSTILE_SECRET_KEY;
export type GoogleUser = { id: string; name: string; session: string; avatarUrl?: string; provider: "google" };
export async function googleUser(req: Request): Promise<GoogleUser | null> {
  const data = await read(req, "devil_auth", "google-session");
  if (!data || typeof data.id !== "string" || !/^google:[A-Za-z0-9_-]{1,255}$/.test(data.id) || typeof data.name !== "string" || data.name.length > 80 || typeof data.session !== "string") return null;
  const row = await getDb().select().from(limits).where(eq(limits.id, "google-session:" + await hash(data.session))).get();
  return row && row.hits === 0 && row.expiresAt > Date.now() ? { id: data.id, name: data.name, session: data.session, avatarUrl: googleAvatar(data.avatarUrl), provider: "google" } : null;
}
function response(data: unknown, cookies: string[] = [], status = 200, location?: string) {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  if (location) headers.set("Location", location);
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(status === 302 ? null : JSON.stringify(data), { status, headers });
}
export async function handleGoogle(req: Request, route: string, rate: (req: Request, kind: string, max: number) => Promise<void>) {
  const redirect = new URL("/api/auth/google/callback", req.url).href;
  if (route === "auth/google/start" && req.method === "POST") {
    requireOrigin(req);await rate(req, "google-start", 10);
    if (v().DISCORD_LOGIN_REQUIRED !== "1" || !googleConfigured()) throw new RequestError(503, "Google login is not configured");
    const pending = await read(req, "devil_login", "login-captcha");
    if (!pending || typeof pending.nonce !== "string") throw new RequestError(401, "Login expired. Please reload the page.");
    const input = await readJson(req);
    if (!await verifyTurnstile(v().TURNSTILE_SECRET_KEY, input.token, new URL(req.url).hostname, await hash("discord-login:" + pending.nonce), fetch, "devil-key-login")) throw new RequestError(400, "Please complete the human verification again");
    const state = crypto.randomUUID(), nonce = crypto.randomUUID(), pkce = await googlePkce();
    await getDb().insert(limits).values({ id: "google-state:" + await hash(state), hits: 0, expiresAt: Date.now() + 600_000 });
    const signed = await seal({ state, nonce, verifier: pkce.verifier }, "google-state", secret(), 600_000);
    return response({ url: googleAuthorizationUrl(v().GOOGLE_CLIENT_ID, redirect, state, nonce, pkce.challenge) }, [cookie(req, "devil_google_oauth", signed, 600), cookie(req, "devil_login", "", 0)]);
  }
  if (route === "auth/google/callback" && req.method === "GET") {
    await rate(req, "google-callback", 20);
    const clear = cookie(req, "devil_google_oauth", "", 0);let failure = "LOGIN_CONFIG";
    try {
      if (v().DISCORD_LOGIN_REQUIRED !== "1" || !googleConfigured()) throw 0;
      const url = new URL(req.url), data = await read(req, "devil_google_oauth", "google-state"), state = url.searchParams.get("state"), code = url.searchParams.get("code");
      if (url.searchParams.has("error")) { failure = "LOGIN_CANCELLED";throw 0; }
      if (!data) { failure = "LOGIN_COOKIE_MISSING";throw 0; }
      if (!state || state !== data.state || !code || typeof data.nonce !== "string" || typeof data.verifier !== "string") { failure = "LOGIN_STATE_MISMATCH";throw 0; }
      failure = "LOGIN_UNAVAILABLE";
      const consumed = await getDb().update(limits).set({ hits: 1 }).where(and(eq(limits.id, "google-state:" + await hash(state)), eq(limits.hits, 0), gt(limits.expiresAt, Date.now()))).returning({ id: limits.id });
      if (consumed.length !== 1) { failure = "LOGIN_STATE_EXPIRED";throw 0; }
      const identity = await googleIdentity(code, v().GOOGLE_CLIENT_ID, v().GOOGLE_CLIENT_SECRET, redirect, data.verifier, data.nonce);
      const session = crypto.randomUUID();
      await getDb().insert(limits).values({ id: "google-session:" + await hash(session), hits: 0, expiresAt: Date.now() + 28_800_000 });
      const token = await seal({ ...identity, session }, "google-session", secret(), 28_800_000);
      return response(null, [clear, cookie(req, "devil_auth", token, 28800)], 302, "/");
    } catch (error) {
      const category = error instanceof GoogleLoginError ? error.code : error instanceof Error ? serviceErrorCode(error) : failure;
      const reason = loginFailureCode(category === "SERVICE_UNAVAILABLE" ? failure : category);
      console.warn("DEVIL KEY Google login failed", reason);
      return response(null, [clear], 302, "/?login=failed&reason=" + reason);
    }
  }
  throw new RequestError(404, "Not found");
}
