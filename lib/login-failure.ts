// Only fixed diagnostic categories may reach redirects or logs. Never expose OAuth data.
const codes = new Set([
  "LOGIN_CONFIG", "LOGIN_COOKIE_MISSING", "LOGIN_STATE_MISMATCH", "LOGIN_STATE_EXPIRED",
  "LOGIN_CANCELLED", "DISCORD_CLIENT_INVALID", "DISCORD_GRANT_INVALID", "DISCORD_RATE_LIMIT",
  "DISCORD_TOKEN_FAILED", "DISCORD_IDENTITY_FAILED", "DISCORD_NETWORK_FAILED",
  "DB_DAILY_LIMIT", "DB_BINDING_MISSING", "DB_SCHEMA_MISSING", "DB_UNAVAILABLE",
  "KEY_SECRET_MISSING", "LOGIN_UNAVAILABLE",
  "GOOGLE_CLIENT_INVALID", "GOOGLE_GRANT_INVALID", "GOOGLE_RATE_LIMIT", "GOOGLE_TOKEN_FAILED",
  "GOOGLE_IDENTITY_FAILED", "GOOGLE_NETWORK_FAILED", "GOOGLE_TOKEN_INVALID",
]);
export function loginFailureCode(value: unknown) {
  return typeof value === "string" && codes.has(value) ? value : "LOGIN_UNAVAILABLE";
}
export class DiscordLoginError extends Error {
  code: string;
  constructor(code: string) { super("Discord sign-in failed"); this.code = loginFailureCode(code); }
}
export class GoogleLoginError extends Error {
  code: string;
  constructor(code: string) { super("Google sign-in failed");this.code = loginFailureCode(code); }
}
