import { env } from "cloudflare:workers";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { limits } from "../db/schema";
import { hash } from "./domain";
import { authorizationUrl, discordIdentity, discordMedia } from "./discord-domain";
import { cookie, cookieName, cookieValue, readJson, RequestError, requireOrigin, seal, unseal } from "./security";
import { verifyTurnstile } from "./turnstile";
import { DiscordLoginError, loginFailureCode } from "./login-failure";
import { serviceErrorCode } from "./service-errors";
import { googleConfigured, googleUser, handleGoogle } from "./google-auth";

const v = () => env as unknown as Record<string, string>;
export function discordRequired() { return v().DISCORD_LOGIN_REQUIRED === "1"; }
const configured = () => /^\d{15,22}$/.test(v().DISCORD_CLIENT_ID || "") && !!v().DISCORD_CLIENT_SECRET && !!v().TURNSTILE_SITE_KEY && !!v().TURNSTILE_SECRET_KEY;
const secret = () => v().KEY_SECRET || "";
const read = (req: Request, name: string, purpose: string) => unseal(cookieValue(req, cookieName(req, name)), purpose, secret());
export type DiscordUser = { id: string; name: string; session: string; avatar?: unknown; decoration?: unknown; discriminator?: unknown; provider: "discord" };
export function isDiscordAdmin(id: string) {
  return (v().DISCORD_ADMIN_USER_IDS || "").split(/[\s,]+/).filter(value => /^\d{15,22}$/.test(value)).includes(id);
}
export async function requireDiscordAdmin(req: Request) {
  const user = await discordUser(req);
  if (!user && await googleUser(req)) throw new RequestError(403, "Use an authorized Discord administrator account for admin access.");
  if (!user) throw new RequestError(401, "Please sign in with Discord first");
  if (!isDiscordAdmin(user.id)) throw new RequestError(403, "Only authorized administrators can access this page.");
  return user;
}
export async function discordUser(req: Request): Promise<DiscordUser | null> {
  const data = await read(req, "devil_auth", "discord-session");
  if (!data || typeof data.id !== "string" || !/^\d{15,22}$/.test(data.id) || typeof data.name !== "string" || typeof data.session !== "string") return null;
  const record = await getDb().select().from(limits).where(eq(limits.id, "discord-session:" + await hash(data.session))).get();
  return record && record.hits === 0 && record.expiresAt > Date.now() ? { id: data.id, name: data.name, session: data.session, avatar: data.avatar, decoration: data.decoration, discriminator: data.discriminator, provider: "discord" } : null;
}
export async function requireLogin(req: Request) {
  if (!discordRequired()) return null;
  if (!configured() && !googleConfigured()) throw new RequestError(503, "Login is not configured. Please contact the administrator.");
  const user = await discordUser(req) || await googleUser(req);
  if (!user) throw new RequestError(401, "Please sign in with Google or Discord first");
  return user;
}
export const requireDiscord = requireLogin;
export async function flowOwner(req: Request, flowId: string, userId: string) {
  const data = await read(req, "devil_flow_owner", "flow-owner");
  return data?.flowId === flowId && data?.userId === userId;
}
export async function flowOwnerCookie(req: Request, flowId: string, userId: string) {
  return cookie(req, "devil_flow_owner", await seal({ flowId, userId }, "flow-owner", secret(), 86_400_000), 86400);
}
function response(data: unknown, cookies: string[] = [], status = 200, headers: Record<string, string> = {}) {
  const result = new Response(status === 302 ? null : JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...headers } });
  for (const value of cookies) result.headers.append("Set-Cookie", value);
  return result;
}
const redirectUri = (req: Request) => new URL("/api/auth/discord/callback", req.url).href;
export async function handleDiscord(req: Request, route: string, rate: (req: Request, kind: string, max: number) => Promise<void>) {
  if (route.startsWith("auth/google/")) return handleGoogle(req, route, rate);
  if (route === "auth/session" && req.method === "GET") {
    if (!discordRequired()) return response({ required: false, user: null });
    const providers = { discord: configured(), google: googleConfigured() }, ready = providers.discord || providers.google;
    const user = ready ? await discordUser(req) || await googleUser(req) : null;
    if (user) return response({ required: true, configured: true, providers, user: user.provider === "google"
      ? { id: user.id, name: user.name, provider: "google", isAdmin: false, avatarUrl: user.avatarUrl, decorationUrl: null }
      : { id: user.id, name: user.name, provider: "discord", isAdmin: isDiscordAdmin(user.id), ...discordMedia(user.id, user.avatar, user.decoration, user.discriminator) } });
    await rate(req, "login-page", 60);
    let pending = await read(req, "devil_login", "login-captcha"); const cookies: string[] = [];
    if (!pending || typeof pending.nonce !== "string") {
      pending = { nonce: crypto.randomUUID() };
      cookies.push(cookie(req, "devil_login", await seal(pending, "login-captcha", secret(), 600_000), 600));
    }
    return response({ required: true, configured: ready, providers, user: null, siteKey: v().TURNSTILE_SITE_KEY || "", challenge: await hash("discord-login:" + pending.nonce) }, cookies);
  }
  if (route === "auth/discord/start" && req.method === "POST") {
    requireOrigin(req); await rate(req, "discord-start", 10);
    if (!discordRequired() || !configured()) throw new RequestError(503, "Discord login is not configured");
    const pending = await read(req, "devil_login", "login-captcha");
    if (!pending || typeof pending.nonce !== "string") throw new RequestError(401, "Login expired. Please reload the page.");
    const input = await readJson(req);
    const verified = await verifyTurnstile(v().TURNSTILE_SECRET_KEY, input.token, new URL(req.url).hostname, await hash("discord-login:" + pending.nonce), fetch, "devil-key-login");
    if (!verified) throw new RequestError(400, "Please complete the human verification again");
    const state = crypto.randomUUID(); const now = Date.now();
    await getDb().insert(limits).values({ id: "discord-state:" + await hash(state), hits: 0, expiresAt: now + 600_000 });
    const signed = await seal({ state, ...(input.returnTo === "/verify" ? { returnTo: "/verify" } : {}) }, "discord-state", secret(), 600_000);
    return response({ url: authorizationUrl(v().DISCORD_CLIENT_ID, redirectUri(req), state) }, [cookie(req, "devil_oauth", signed, 600), cookie(req, "devil_login", "", 0)]);
  }
  if (route === "auth/discord/callback" && req.method === "GET") {
    await rate(req, "discord-callback", 20);
    const clear = cookie(req, "devil_oauth", "", 0);
    let destination = "/";
    let failure = "LOGIN_CONFIG";
    try {
      if (!discordRequired() || !configured()) throw 0;
      const url = new URL(req.url), data = await read(req, "devil_oauth", "discord-state");
      if (data?.returnTo === "/verify") destination = "/verify";
      const state = url.searchParams.get("state"), code = url.searchParams.get("code");
      if (url.searchParams.has("error")) { failure = "LOGIN_CANCELLED"; throw 0; }
      if (!data) { failure = "LOGIN_COOKIE_MISSING"; throw 0; }
      if (typeof state !== "string" || state !== data.state || !code) { failure = "LOGIN_STATE_MISMATCH"; throw 0; }
      failure = "LOGIN_UNAVAILABLE";
      // Consume the state atomically before talking to Discord; replay/races lose.
      const consumed = await getDb().update(limits).set({ hits: 1 }).where(and(eq(limits.id, "discord-state:" + await hash(state)), eq(limits.hits, 0), gt(limits.expiresAt, Date.now()))).returning({ id: limits.id });
      if (consumed.length !== 1) { failure = "LOGIN_STATE_EXPIRED"; throw 0; }
      const user = await discordIdentity(code, v().DISCORD_CLIENT_ID, v().DISCORD_CLIENT_SECRET, redirectUri(req));
      const session = crypto.randomUUID();
      await getDb().insert(limits).values({ id: "discord-session:" + await hash(session), hits: 0, expiresAt: Date.now() + 28_800_000 });
      const token = await seal({ ...user, session }, "discord-session", secret(), 28_800_000);
      return response(null, [clear, cookie(req, "devil_auth", token, 28800)], 302, { Location: destination });
    } catch (error) {
      const category = error instanceof DiscordLoginError ? error.code : error instanceof Error ? serviceErrorCode(error) : failure;
      const reason = loginFailureCode(category === "SERVICE_UNAVAILABLE" ? failure : category);
      console.warn("DEVIL KEY Discord login failed", reason);
      return response(null, [clear], 302, { Location: destination + "?login=failed&reason=" + reason });
    }
  }
  if (route === "auth/logout" && req.method === "POST") {
    requireOrigin(req); await rate(req, "logout", 20); const user = await discordUser(req) || await googleUser(req);
    if (user) await getDb().update(limits).set({ hits: 1 }).where(eq(limits.id, user.provider + "-session:" + await hash(user.session)));
    return response({ ok: true }, [cookie(req, "devil_auth", "", 0), cookie(req, "devil_flow_owner", "", 0), cookie(req, "devil_google_oauth", "", 0), cookie(req, "devil_oauth", "", 0), cookie(req, "devil_login", "", 0), "devil_flow=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" + (new URL(req.url).protocol === "https:" ? "; Secure" : "")]);
  }
  throw new RequestError(404, "Not found");
}
