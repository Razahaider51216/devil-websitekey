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
    if (!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url) + ".ts")) return next(url.href + ".ts", context);
  }
  return next(specifier, context);
} });
const { GET } = await import("../app/test/throw-food/route.ts");
const request = () => new Request("https://devil-hub.dev/test/throw-food");
test("test entry fails closed when storage is missing or content is corrupt", async () => {
  assert.equal((await GET(request())).status, 503);
  settings.SCRIPT_FILES = { get: async () => ({ size: 425442, arrayBuffer: async () => new ArrayBuffer(425442) }) };
  assert.equal((await GET(request())).status, 503);
});
test("browser document navigation does not expose the prototype", async () => {
  const response = await GET(new Request(request(), { headers: { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } }));
  assert.equal(response.status, 403);
  assert.match(await response.text(), /Huh/);
});
