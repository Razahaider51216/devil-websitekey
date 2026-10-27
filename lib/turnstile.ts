export async function verifyTurnstile(secret: string, token: unknown, hostname: string, challenge: string, send: typeof fetch = fetch) {
  if (!secret || typeof token !== "string" || !token.trim() || token.length > 2048) return false;
  const response = await send("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", body: new URLSearchParams({ secret, response: token }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Turnstile verification unavailable");
  const result = await response.json() as { success?: boolean; hostname?: string; action?: string; cdata?: string };
  return result.success === true && result.hostname === hostname && result.action === "devil-key-claim" && result.cdata === challenge;
}
