import { env } from "cloudflare:workers";
import { documentRequest, scriptLanding } from "./script-landing";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { keys, keyDevices, siteSettings } from "../db/schema";
import { hash, status } from "./domain";
import { readJson, RequestError, requireOrigin, seal, unseal } from "./security";
import { recordGameLaunch } from "./game-usage";

type FileRecord = { sha256: string; bytes: number; checksum: number; entitlement?: "break-x2" };
export type RuntimeManifest = { release: string; root: string; files: Record<string, FileRecord>; maps: number };
type Pointer = { release: string; sha256: string };
type Dependencies = {
  admin: (req: Request) => Promise<void>;
  rate: (req: Request, kind: string, max: number) => Promise<void>;
  validate: (req: Request, input: Record<string, unknown>) => Promise<Response>;
};
const vars = () => env as unknown as { SCRIPT_FILES?: R2Bucket; KEY_SECRET?: string };
function fail(code: number, message: string): never { throw new RequestError(code, message); }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
export const releaseName = (value: unknown): string => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value) ? value : fail(400, "Invalid runtime release");
export const manifestKey = (release: string) => `runtime/releases/${release}/manifest.json`;
export const blobKey = (sha: string) => `runtime/blobs/${sha}`;
async function digest(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), b => b.toString(16).padStart(2, "0")).join("");
}
function bucket() { return vars().SCRIPT_FILES || fail(503, "Connect private R2 binding SCRIPT_FILES"); }
export function validateManifest(value: unknown): RuntimeManifest {
  if (!value || typeof value !== "object") fail(503, "Runtime manifest is invalid");
  const m = value as RuntimeManifest;
  releaseName(m.release);
  if (![12, 13, 14].includes(m.maps) || !m.files || typeof m.files !== "object" || Array.isArray(m.files)) fail(503, "Runtime manifest is incomplete");
  const rows = Object.entries(m.files);
  if (!rows.length || rows.length > 150 || !Object.hasOwn(m.files, m.root)) fail(503, "Runtime entry is missing");
  for (const [name, file] of rows) {
    if (file?.entitlement !== undefined && file.entitlement !== "break-x2") fail(503, "Unknown runtime entitlement");
    if (!/^[a-f0-9]{40}\/[a-zA-Z0-9_./-]+$/.test(name) || name.split("/").some(part => part === ".." || part === "." || !part)
      || !file || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > 8 * 1024 * 1024
      || !Number.isSafeInteger(file.checksum) || file.checksum < 0 || file.checksum > 4294967295) fail(503, "Runtime file metadata is invalid");
  }
  return m;
}
async function readManifest(pointer: Pointer) {
  releaseName(pointer.release);
  if (!/^[a-f0-9]{64}$/.test(pointer.sha256)) fail(503, "Runtime manifest checksum is invalid");
  const object = await bucket().get(manifestKey(pointer.release));
  if (!object || object.size > 1024 * 1024) fail(503, "Runtime manifest is unavailable");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await digest(bytes) !== pointer.sha256) fail(503, "Runtime manifest integrity check failed");
  const manifest = validateManifest(JSON.parse(new TextDecoder().decode(bytes)));
  if (manifest.release !== pointer.release) fail(503, "Runtime release mismatch");
  return manifest;
}
async function active(): Promise<Pointer | null> {
  const row = await getDb().select().from(siteSettings).where(eq(siteSettings.id, "runtime:active")).get();
  return row ? JSON.parse(row.value) : null;
}
export async function handleRuntime(req: Request, path: string[], deps: Dependencies): Promise<Response> {
  const route = path.join("/");
  if (path[0] === "runtime" && path[1] === "files" && (documentRequest(req) || path.length < 5)) return scriptLanding();
  if (route === "runtime/session" && req.method === "POST") {
    const input = await readJson(req);
    if (input.bootstrap !== "private-runtime-domain-20261028-2") return json({ error: "This loader is retired. Run https://devil-hub.dev/loader", code: "LOADER_UPDATE_REQUIRED" }, 426);
    const checked = await deps.validate(req, { key: input.key, hwid: input.hwid });
    if (!checked.ok) return checked;
    const verdict = await checked.json() as { valid: boolean; status: string; expiresAt: number | null };
    if (verdict.valid !== true) return json({ error: "Runtime access denied", status: verdict.status }, 403);
    await deps.rate(req, "runtime-session", 20);
    const pointer = await active(); if (!pointer) fail(503, "Private runtime is not published yet");
    const manifest = await readManifest(pointer), now = Date.now();
    const keyRow = await getDb().select().from(keys).where(eq(keys.keyHash, await hash(String(input.key).trim()))).get();
    const premium = keyRow?.source === "admin" && status(keyRow, now) === "active";
    const ttl = Math.min(86_400_000, verdict.expiresAt === null ? 86_400_000 : verdict.expiresAt - now);
    if (ttl <= 0) fail(403, "Key expired");
    const ticket = await seal({ ...pointer, keyHash: await hash(String(input.key).trim()), hwidHash: await hash("DEVIL-HWID:v1:" + String(input.hwid).trim()) }, "runtime-delivery", vars().KEY_SECRET || "", ttl);
    const prefix = new URL(`/api/runtime/files/${ticket}/`, req.url).href;
    const premiumFile = premium ? Object.keys(manifest.files).find(name => manifest.files[name].entitlement === "break-x2") : undefined;
    // Statistics must never prevent an otherwise valid Key from opening the script.
    try { await recordGameLaunch(input, keyRow!.keyHash, manifest.maps); } catch { console.warn("Game launch statistics unavailable"); }
    return json({ release: pointer.release, prefix, features: { premium, breakAutoX2: !!premiumFile }, premiumEntry: premiumFile ? prefix + premiumFile : null, entry: prefix + manifest.root, bytes: manifest.files[manifest.root].bytes,
      checksum: manifest.files[manifest.root].checksum, expiresAt: now + ttl });
  }
  if (path[0] === "runtime" && path[1] === "files" && req.method === "GET" && path.length >= 5) {
    const data = await unseal(path[2], "runtime-delivery", vars().KEY_SECRET || "");
    if (!data || typeof data.keyHash !== "string" || typeof data.hwidHash !== "string" || typeof data.release !== "string" || typeof data.sha256 !== "string") return scriptLanding();
    await deps.rate(req, "runtime-file", 300);
    const row = await getDb().select().from(keys).where(eq(keys.keyHash, data.keyHash)).get();
    if (!row || status(row, Date.now()) !== "active") fail(403, "Key expired or revoked");
    const device = await getDb().select().from(keyDevices).where(eq(keyDevices.keyId, row.id)).get();
    if (!device || device.hwidHash !== data.hwidHash) fail(403, "Device binding no longer matches");
    const manifest = await readManifest({ release: data.release, sha256: data.sha256 });
    let name = path.slice(3).join("/");
    // Legacy libraries reference main assets. Resolve them within this immutable
    // release's original root commit, never against a moving Git branch.
    const rootRef = manifest.root.split("/")[0];
    if (name.startsWith("main/")) name = rootRef + "/" + name.slice(5);
    else if (name.startsWith("refs/heads/main/")) name = rootRef + "/" + name.slice(16);
    if (!Object.hasOwn(manifest.files, name)) fail(404, "File is not in this runtime release");
    if (manifest.files[name].entitlement === "break-x2" && row.source !== "admin") return scriptLanding();
    const metadata = manifest.files[name], object = await bucket().get(blobKey(metadata.sha256));
    if (!object || object.size !== metadata.bytes) fail(503, "Runtime file is unavailable");
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.length !== metadata.bytes || await digest(bytes) !== metadata.sha256) fail(503, "Runtime file integrity check failed");
    return new Response(bytes, { headers: { "Content-Type": name.endsWith(".png") ? "image/png" : "text/plain; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Devil-SHA256": metadata.sha256 } });
  }
  if (route === "admin/runtime") {
    await deps.admin(req);
    if (req.method === "GET") {
      const pointer = await active();
      return json({ configured: !!vars().SCRIPT_FILES, active: pointer, files: pointer ? Object.keys((await readManifest(pointer)).files).length : 0 });
    }
    if (req.method === "POST") {
      requireOrigin(req); const input = await readJson(req);
      const pointer = { release: releaseName(input.release), sha256: typeof input.sha256 === "string" ? input.sha256 : "" };
      const manifest = await readManifest(pointer);
      for (const file of Object.values(manifest.files)) {
        const object = await bucket().head(blobKey(file.sha256));
        if (!object || object.size !== file.bytes) fail(409, "Upload all runtime dependencies before publishing");
      }
      await getDb().insert(siteSettings).values({ id: "runtime:active", value: JSON.stringify(pointer), updatedAt: Date.now() })
        .onConflictDoUpdate({ target: siteSettings.id, set: { value: JSON.stringify(pointer), updatedAt: Date.now() } });
      return json({ active: pointer, files: Object.keys(manifest.files).length });
    }
  }
  fail(404, "Not found");
}
export async function serveBootstrap(): Promise<Response> {
  const row = await getDb().select().from(siteSettings).where(eq(siteSettings.id, "runtime:bootstrap")).get();
  if (!row) fail(503, "Domain loader is not published yet");
  const pointer = JSON.parse(row.value) as { sha256: string; bytes: number };
  if (!/^[a-f0-9]{64}$/.test(pointer.sha256) || !Number.isSafeInteger(pointer.bytes) || pointer.bytes > 1024 * 1024) fail(503, "Invalid domain loader metadata");
  const object = await bucket().get(`runtime/bootstrap/${pointer.sha256}.lua`);
  if (!object || object.size !== pointer.bytes) fail(503, "Domain loader is unavailable");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await digest(bytes) !== pointer.sha256) fail(503, "Domain loader integrity check failed");
  return new Response(bytes, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
