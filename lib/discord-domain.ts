export function authorizationUrl(clientId: string, redirect: string, state: string) {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", scope: "identify", state }).toString();
  return url.href;
}
export async function discordIdentity(code: string, clientId: string, secret: string, redirect: string, send: typeof fetch = fetch) {
  if (!code || code.length > 2048) throw new Error("Discord authorization failed");
  const token = await send("https://discord.com/api/oauth2/token", { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: secret, redirect_uri: redirect }), signal: AbortSignal.timeout(10000) });
  if (!token.ok) throw new Error("Discord authorization failed");
  const credentials = await token.json() as { access_token?: string; token_type?: string };
  if (typeof credentials.access_token !== "string" || credentials.access_token.length > 4096 || credentials.token_type?.toLowerCase() !== "bearer") throw new Error("Discord authorization failed");
  const response = await send("https://discord.com/api/v10/users/@me", { headers: { Authorization: "Bearer " + credentials.access_token }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Discord identity unavailable");
  const user = await response.json() as { id?: string; username?: string; global_name?: string; bot?: boolean };
  if (typeof user.id !== "string" || !/^\d{15,22}$/.test(user.id) || typeof user.username !== "string" || !user.username || user.username.length > 80 || user.bot) throw new Error("Discord identity unavailable");
  return { id: user.id, name: (typeof user.global_name === "string" ? user.global_name : user.username).slice(0, 80) };
}
