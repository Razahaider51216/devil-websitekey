// Privileged, local-only import through Wrangler's authenticated remote bindings.
// Never reads/prints website secrets or changes keys, devices, or mission settings.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { createHash } from "node:crypto";

const manifestPath = resolve(process.argv[2] || "");
const activate = process.argv.includes("--activate");
const expectedAccount = "9507af231005e5cfc8290675b502c50e";
const configuration = JSON.parse(readFileSync("cloudflare.config.json", "utf8"));
const sha = value => createHash("sha256").update(value).digest("hex");
const source = readFileSync(manifestPath), manifest = JSON.parse(source);
if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(manifest.release) || manifest.maps !== 12 || !manifest.files?.[manifest.root]) throw new Error("Invalid runtime manifest");
const blobs = new Map();
for (const [name, record] of Object.entries(manifest.files)) {
  if (!/^[a-f0-9]{40}\/[a-zA-Z0-9_./-]+$/.test(name) || name.split("/").some(x => x === "..") || !/^[a-f0-9]{64}$/.test(record.sha256)) throw new Error("Invalid runtime file");
  const bytes = readFileSync(join(dirname(manifestPath), "blobs", record.sha256));
  let checksum = 0; for (const byte of bytes) checksum = (checksum * 33 + byte) >>> 0;
  if (sha(bytes) !== record.sha256 || bytes.length !== record.bytes || checksum !== record.checksum) throw new Error("Local file integrity mismatch: " + name);
  blobs.set(record.sha256, bytes);
}
const tokenPath = resolve(".env.cloudflare.local");
if (existsSync(tokenPath)) {
  const match = readFileSync(tokenPath, "utf8").match(/^\s*CLOUDFLARE_API_TOKEN\s*=\s*(.+?)\s*$/m);
  if (match) process.env.CLOUDFLARE_API_TOKEN = match[1].replace(/^(["'])(.*)\1$/, "$2");
}
if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error("Set CLOUDFLARE_API_TOKEN in .env.cloudflare.local");
const accountApi = `https://api.cloudflare.com/client/v4/accounts/${expectedAccount}/`;
async function api(path, options = {}) {
  const response = await fetch(accountApi + path, { ...options, headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, ...options.headers } });
  if (!response.ok && response.status !== 404) {
    let codes = [];
    try { codes = (await response.json()).errors?.map(e => e.code) || []; } catch { /* Do not log response bodies or credentials. */ }
    throw new Error(`Cloudflare ${response.status}; error codes ${codes.join(",")}`);
  }
  return response;
}
const objectPath = key => `r2/buckets/${configuration.scripts_bucket}/objects/${key}`;
{
  for (const [hash, bytes] of blobs) {
    const key = "runtime/blobs/" + hash, previous = await api(objectPath(key));
    let uploaded = previous;
    if (previous.status === 404) {
      await api(objectPath(key), { method: "PUT", headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store" }, body: bytes });
      uploaded = await api(objectPath(key));
    }
    if (!uploaded.ok || sha(Buffer.from(await uploaded.arrayBuffer())) !== hash) throw new Error("Remote file integrity mismatch");
    console.log("Verified private blob", hash.slice(0, 12), bytes.length);
  }
  const key = `runtime/releases/${manifest.release}/manifest.json`, previous = await api(objectPath(key));
  if (previous.ok && sha(Buffer.from(await previous.arrayBuffer())) !== sha(source)) throw new Error("Release already exists with different content");
  if (previous.status === 404) await api(objectPath(key), { method: "PUT", headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" }, body: source });
  const pointer = { release: manifest.release, sha256: sha(source) };
  if (activate) {
    const response = await api(`d1/database/${configuration.database_id}/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      sql: "INSERT INTO site_settings (id,value,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
      params: ["runtime:active", JSON.stringify(pointer), Date.now()],
    }) });
    if (!(await response.json()).success) throw new Error("Runtime activation failed");
  }
  console.log(JSON.stringify({ ...pointer, files: Object.keys(manifest.files).length, blobs: blobs.size, activated: activate }));
}
