import { env } from "cloudflare:workers";
import { eq, like } from "drizzle-orm";
import { getDb } from "../db";
import { siteSettings } from "../db/schema";
import { readJson, RequestError, requireOrigin } from "./security";

// R2 is private. Only this authenticated Worker reads its objects.
export const MAX_SCRIPT_BYTES = 8 * 1024 * 1024;
export type ScriptRevision = { revision: string; bytes: number; sha256: string; createdAt: number };
export type ScriptRecord = { slug: string; enabled: boolean; active: ScriptRevision | null };
type Dependencies = {
  admin: (req: Request) => Promise<void>;
  rate: (req: Request, kind: string, max: number) => Promise<void>;
  validate: (req: Request, input: Record<string, unknown>) => Promise<Response>;
};
const settingsId = (slug: string) => "script:" + slug;
// R2 lists keys ascending; reverse time places the newest revisions on page one.
const objectKey = (slug: string, revision: string) => `scripts/${slug}/${String(9_999_999_999_999 - Number(revision.slice(0, 13))).padStart(13, "0")}-${revision.slice(14)}.lua`;
function slugValue(value: unknown) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value)) throw new RequestError(400, "Invalid script ID");
  return value;
}
function revisionValue(value: unknown) {
  if (typeof value !== "string" || !/^\d{13}-[a-f0-9-]{36}$/.test(value)) throw new RequestError(400, "Invalid revision");
  return value;
}
function bucket() {
  const store = (env as unknown as { SCRIPT_FILES?: R2Bucket }).SCRIPT_FILES;
  if (!store) throw new RequestError(503, "Connect private R2 binding SCRIPT_FILES before uploading scripts");
  return store;
}
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
async function record(slug: string): Promise<ScriptRecord | null> {
  const row = await getDb().select().from(siteSettings).where(eq(siteSettings.id, settingsId(slug))).get();
  return row ? JSON.parse(row.value) : null;
}
function metadata(object: R2Object): ScriptRevision {
  const m = object.customMetadata;
  if (!m || !/^[a-f0-9]{64}$/.test(m.sha256 || "")) throw new RequestError(503, "Script metadata is unavailable");
  return { revision: revisionValue(m.revision), bytes: object.size, sha256: m.sha256, createdAt: Number(m.createdAt) };
}
async function uploadBytes(req: Request) {
  if (!/^(text\/plain|application\/octet-stream)(;|$)/i.test(req.headers.get("content-type") || "")) throw new RequestError(415, "Upload a UTF-8 Lua file");
  if (Number(req.headers.get("content-length")) > MAX_SCRIPT_BYTES) throw new RequestError(413, "Lua file exceeds 8 MiB");
  const reader = req.body?.getReader();
  if (!reader) throw new RequestError(400, "Lua file is empty");
  const chunks: Uint8Array[] = []; let size = 0;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new RequestError(408, "Upload timed out")); void reader.cancel().catch(() => {}); }, 30_000); });
  try {
    while (true) {
      const item = await Promise.race([reader.read(), deadline]);
      if (item.done) break;
      size += item.value.byteLength;
      if (size > MAX_SCRIPT_BYTES) { await reader.cancel(); throw new RequestError(413, "Lua file exceeds 8 MiB"); }
      chunks.push(item.value);
    }
  } finally { clearTimeout(timer!); reader.releaseLock(); }
  if (!size) throw new RequestError(400, "Lua file is empty");
  const result = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { result.set(part, offset); offset += part.byteLength; }
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(result); }
  catch { throw new RequestError(400, "Lua must be a UTF-8 text file"); }
  if (text.includes("\0")) throw new RequestError(400, "Binary uploads are not supported");
  return result;
}
async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
export async function handleScripts(req: Request, path: string[], deps: Dependencies): Promise<Response> {
  const route = path.join("/");
  if (route === "scripts/download" && req.method === "POST") {
    const input = await readJson(req), slug = slugValue(input.script);
    // Reuse the same server validator as /api/validate, including atomic device binding,
    // expiry/revocation and rate limits. Never put keys in URLs or object metadata.
    const checked = await deps.validate(req, { key: input.key, hwid: input.hwid });
    if (!checked.ok) return checked;
    const verdict = await checked.json() as { valid: boolean; status: string };
    if (verdict.valid !== true) return json({ error: "Script access denied", status: verdict.status }, 403);
    await deps.rate(req, "script-download", 120);
    const item = await record(slug);
    if (!item?.enabled || !item.active) throw new RequestError(404, "Script is not published");
    const object = await bucket().get(objectKey(slug, item.active.revision));
    if (!object) throw new RequestError(503, "Published script is unavailable");
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength !== item.active.bytes || await sha256(bytes) !== item.active.sha256) throw new RequestError(503, "Script integrity check failed");
    return new Response(bytes, { headers: {
      "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "X-Devil-Revision": item.active.revision,
      "X-Devil-SHA256": item.active.sha256, "Content-Disposition": `attachment; filename="${slug}.lua"`,
    } });
  }
  if (path[0] !== "admin" || path[1] !== "scripts") throw new RequestError(404, "Not found");
  await deps.admin(req);
  if (req.method !== "GET") requireOrigin(req);
  if (path.length === 2 && req.method === "GET") {
    const rows = await getDb().select().from(siteSettings).where(like(siteSettings.id, "script:%")).limit(200);
    return json({ configured: !!(env as unknown as { SCRIPT_FILES?: R2Bucket }).SCRIPT_FILES,
      scripts: rows.map(row => JSON.parse(row.value)), maxBytes: MAX_SCRIPT_BYTES });
  }
  if (path.length !== 3) throw new RequestError(404, "Not found");
  const slug = slugValue(path[2]), store = bucket();
  if (req.method === "GET") {
    const cursor = new URL(req.url).searchParams.get("cursor") || undefined;
    const options: R2ListOptions & { include: string[] } = { prefix: `scripts/${slug}/`, include: ["customMetadata"], limit: 50, cursor };
    const listed = await store.list(options);
    return json({ script: await record(slug), revisions: listed.objects.map(metadata).sort((a, b) => b.createdAt - a.createdAt), cursor: listed.truncated ? listed.cursor : null });
  }
  if (req.method === "POST") {
    await deps.rate(req, "script-upload", 30);
    const bytes = await uploadBytes(req), createdAt = Date.now(), revision = `${createdAt}-${crypto.randomUUID()}`;
    const digest = await sha256(bytes);
    const uploaded = await store.put(objectKey(slug, revision), bytes, {
      httpMetadata: { contentType: "text/plain; charset=utf-8", cacheControl: "private, no-store" },
      customMetadata: { revision, sha256: digest, createdAt: String(createdAt) },
      onlyIf: { etagDoesNotMatch: "*" },
    });
    if (!uploaded) throw new RequestError(409, "Revision already exists");
    const initial: ScriptRecord = { slug, enabled: false, active: null };
    await getDb().insert(siteSettings).values({ id: settingsId(slug), value: JSON.stringify(initial), updatedAt: createdAt }).onConflictDoNothing();
    return json({ slug, revision, sha256: digest, bytes: bytes.byteLength, createdAt, published: false }, 201);
  }
  if (req.method === "PUT") {
    await deps.rate(req, "script-publish", 30);
    const input = await readJson(req), current = await record(slug);
    if (!current) throw new RequestError(404, "Script does not exist");
    if (input.enabled === false) current.enabled = false;
    else {
      const revision = revisionValue(input.revision), object = await store.head(objectKey(slug, revision));
      if (!object) throw new RequestError(404, "Revision does not exist");
      current.active = metadata(object); current.enabled = true;
    }
    await getDb().update(siteSettings).set({ value: JSON.stringify(current), updatedAt: Date.now() }).where(eq(siteSettings.id, settingsId(slug)));
    return json(current);
  }
  throw new RequestError(405, "Method not allowed");
}
