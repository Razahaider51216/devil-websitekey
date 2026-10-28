import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { createHash } from "node:crypto";
const file = resolve(process.argv[2]);
const bytes = readFileSync(file), audit = JSON.parse(readFileSync(join(dirname(file), "bootstrap-audit.json"), "utf8"));
const digest = createHash("sha256").update(bytes).digest("hex");
if (digest !== audit.sha256 || bytes.length !== audit.bytes || audit.release !== "private-runtime-domain-20261028-5") throw new Error("Bootstrap build audit does not match");
const configuration = JSON.parse(readFileSync("cloudflare.config.json", "utf8"));
const value = readFileSync(".env.cloudflare.local", "utf8").match(/^\s*CLOUDFLARE_API_TOKEN\s*=\s*(.+?)\s*$/m)?.[1];
if (!value) throw new Error("Missing Cloudflare token");
const token = value.replace(/^(["'])(.*)\1$/, "$2");
const base = "https://api.cloudflare.com/client/v4/accounts/9507af231005e5cfc8290675b502c50e/";
async function api(path, options = {}) {
  const response = await fetch(base + path, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  if (!response.ok) throw new Error("Cloudflare request failed: HTTP " + response.status);
  return response;
}
const object = `r2/buckets/${configuration.scripts_bucket}/objects/runtime/bootstrap/${digest}.lua`;
await api(object, { method: "PUT", headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }, body: bytes });
const downloaded = Buffer.from(await (await api(object)).arrayBuffer());
if (createHash("sha256").update(downloaded).digest("hex") !== digest) throw new Error("Bootstrap read-back mismatch");
const pointer = { sha256: digest, bytes: bytes.length, release: audit.release };
const response = await api(`d1/database/${configuration.database_id}/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
  sql: "INSERT INTO site_settings (id,value,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
  params: ["runtime:bootstrap", JSON.stringify(pointer), Date.now()],
}) });
if (!(await response.json()).success) throw new Error("Bootstrap pointer update failed");
console.log(JSON.stringify({ published: true, url: "https://devil-hub.dev/loader", ...pointer }));
