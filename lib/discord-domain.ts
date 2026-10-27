export function authorizationUrl(clientId: string, redirect: string, state: string) {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", scope: "identify", state }).toString();
  return url.href;
}
const imageHash = (value: unknown) => typeof value === "string" && /^(?:a_)?[a-f0-9]{32}$/.test(value) ? value : null;
export function discordMedia(id: string, avatar: unknown, decoration: unknown, discriminator: unknown = "0") {
  const hash = imageHash(avatar), frame = imageHash(decoration);
  const index = typeof discriminator === "string" && /^\d{4}$/.test(discriminator) && discriminator !== "0000" ? Number(discriminator) % 5 : Number((BigInt(id) >> BigInt(22)) % BigInt(6));
  return {
    avatarUrl: hash ? `https://cdn.discordapp.com/avatars/${id}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=128` : `https://cdn.discordapp.com/embed/avatars/${index}.png`,
    decorationUrl: frame ? `https://cdn.discordapp.com/avatar-decoration-presets/${frame}.png?size=160` : null,
  };
}
export async function discordIdentity(code: string, clientId: string, secret: string, redirect: string, send: typeof fetch = fetch) {
  if (!code || code.length > 2048) throw new Error("Discord authorization failed");
  const token = await send("https://discord.com/api/oauth2/token", { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: secret, redirect_uri: redirect }), signal: AbortSignal.timeout(10000) });
  if (!token.ok) throw new Error("Discord authorization failed");
  const credentials = await token.json() as { access_token?: string; token_type?: string };
  if (typeof credentials.access_token !== "string" || credentials.access_token.length > 4096 || credentials.token_type?.toLowerCase() !== "bearer") throw new Error("Discord authorization failed");
  const response = await send("https://discord.com/api/v10/users/@me", { headers: { Authorization: "Bearer " + credentials.access_token }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Discord identity unavailable");
  const user = await response.json() as { id?: string; username?: string; global_name?: string; bot?: boolean; avatar?: unknown; discriminator?: unknown; avatar_decoration_data?: { asset?: unknown } | null };
  if (typeof user.id !== "string" || !/^\d{15,22}$/.test(user.id) || typeof user.username !== "string" || !user.username || user.username.length > 80 || user.bot) throw new Error("Discord identity unavailable");
  return { id: user.id, name: (typeof user.global_name === "string" ? user.global_name : user.username).slice(0, 80), avatar: imageHash(user.avatar), decoration: imageHash(user.avatar_decoration_data?.asset), discriminator: typeof user.discriminator === "string" && /^\d{1,4}$/.test(user.discriminator) ? user.discriminator : "0" };
}
