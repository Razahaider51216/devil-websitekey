import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const settings = globalThis.__throwFoodEnv = {};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env=globalThis.__throwFoodEnv", shortCircuit: true };
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const url = new URL(specifier, context.parentURL);
    if (existsSync(fileURLToPath(url) + "/index.ts")) return next(url.href + "/index.ts", context);
    if (!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url) + ".ts")) return next(url.href + ".ts", context);
  }
  return next(specifier, context);
} });
const { GET } = await import("../app/test/throw-food/route.ts");
const { validateManifest } = await import("../lib/runtime-storage.ts");
const request = () => new Request("https://devil-hub.dev/test/throw-food");
test("previous prototype link delegates to the key-protected domain loader", async () => {
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'return loadstring(game:HttpGet("https://devil-hub.dev/loader"))()\n');
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("runtime supports the thirteenth map while retaining the old release and metadata checks", () => {
  const root = "a".repeat(40) + "/loader";
  const manifest = { release: "runtime-throw-food-20261029-2", maps: 13, root, files: { [root]: { sha256: "b".repeat(64), bytes: 100, checksum: 123 } } };
  assert.equal(validateManifest(manifest).maps, 13);
  assert.equal(validateManifest({ ...manifest, maps: 12 }).maps, 12);
  for (const maps of [0, 11, 14, "13"]) assert.throws(() => validateManifest({ ...manifest, maps }));
  assert.throws(() => validateManifest({ ...manifest, files: { [root]: { ...manifest.files[root], bytes: 0 } } }));
});
test("browser document navigation does not expose the prototype", async () => {
  const response = await GET(new Request(request(), { headers: { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } }));
  assert.equal(response.status, 403);
  assert.match(await response.text(), /Huh/);
});
