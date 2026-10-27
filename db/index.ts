import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { drizzle as tursoDrizzle } from "drizzle-orm/libsql/web";
import { createClient } from "@libsql/client/web";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";

export function getDb(): BaseSQLiteDatabase<'async', unknown, typeof schema> {
  const settings = env as unknown as Record<string, string>;
  const provider = settings.DATABASE_PROVIDER || "d1";
  if (provider === "turso") {
    if (!settings.TURSO_DATABASE_URL?.startsWith("libsql://") || !settings.TURSO_AUTH_TOKEN) {
      throw new Error("Turso database configuration is incomplete");
    }
    return tursoDrizzle(createClient({ url: settings.TURSO_DATABASE_URL, authToken: settings.TURSO_AUTH_TOKEN }), { schema });
  }
  if (provider !== "d1") throw new Error("Unknown DATABASE_PROVIDER");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
