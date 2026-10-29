import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const settings = globalThis.__petRideEnv = {};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env=globalThis.__petRideEnv", shortCircuit: true };
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const url = new URL(specifier, context.parentURL);
    if (!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url) + ".ts")) return next(url.href + ".ts", context);
  }
  return next(specifier, context);
} });
const { GET } = await import("../app/test/pet-ride/route.ts");
test("pet preview and logo use only fixed R2 keys and never arbitrary file parameters", async () => {
  const keys = [];
  settings.SCRIPT_FILES = { get: async key => { keys.push(key); return { body: "fixture" }; } };
  const response = await GET(new Request("https://devil-hub.dev/test/pet-ride?file=secrets"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), "fixture");
  const logo = await GET(new Request("https://devil-hub.dev/test/pet-ride?asset=logo"));
  assert.equal(logo.headers.get("content-type"), "image/png");
  assert.deepEqual(keys, ["tests/pet-ride/20261029-1.lua", "tests/pet-ride/20261029-1-logo.png"]);
});
test("browser navigation shows the existing script landing without fetching Lua", async () => {
  settings.SCRIPT_FILES = { get: async () => { throw new Error("must not fetch"); } };
  const response = await GET(new Request("https://devil-hub.dev/test/pet-ride", { headers: { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } }));
  assert.equal(response.status, 403);
  assert.match(await response.text(), /Huh/);
});
test("missing preview returns a recoverable 503", async () => {
  delete settings.SCRIPT_FILES;
  const response = await GET(new Request("https://devil-hub.dev/test/pet-ride"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
