import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const settings = globalThis.__d1BindingEnv = {
  // A stale dashboard variable must never silently reconnect to the old database.
  DATABASE_PROVIDER: "turso",
  TURSO_DATABASE_URL: "libsql://unused.example",
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env=globalThis.__d1BindingEnv", shortCircuit: true };
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const url = new URL(specifier, context.parentURL);
    if (!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url) + ".ts")) {
      return next(pathToFileURL(fileURLToPath(url) + ".ts").href, context);
    }
  }
  return next(specifier, context);
} });
const { getDb } = await import("../db/index.ts");
test("D1 binding is required instead of falling back to Turso", () => {
  assert.throws(() => getDb(), /Cloudflare D1 binding `DB` is unavailable/);
});
test("database requests use the D1 binding even with stale Turso variables", async () => {
  let sql;
  settings.DB = { prepare(query) {
    sql = query;
    return { bind() { return this; }, async raw() { return [["fixture"]]; } };
  } };
  const { keys } = await import("../db/schema.ts");
  await getDb().select({ id: keys.id }).from(keys).all();
  assert.match(sql, /access_keys/);
  delete settings.DB;
});
