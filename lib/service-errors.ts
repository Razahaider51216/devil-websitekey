// Public responses expose only stable categories, never SQL, secrets or stack traces.
export function serviceErrorCode(error: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current && !seen.has(current) && messages.length < 8) {
    seen.add(current);
    if (current instanceof Error) messages.push(current.message);
    current = typeof current === "object" && "cause" in current ? current.cause : null;
  }
  const text = messages.join("\n");
  if (/exceeded.*D1.*daily.*(?:read|write).*limit/i.test(text)) return "DB_DAILY_LIMIT";
  if (/D1 binding .*unavailable/.test(text)) return "DB_BINDING_MISSING";
  if (/no such table|no such column/i.test(text)) return "DB_SCHEMA_MISSING";
  if (/KEY_SECRET must contain/.test(text)) return "KEY_SECRET_MISSING";
  if (/D1_ERROR|D1_EXEC_ERROR|SQLITE_/i.test(text)) return "DB_UNAVAILABLE";
  return "SERVICE_UNAVAILABLE";
}
