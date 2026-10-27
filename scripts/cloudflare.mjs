import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { mayDeferIndexes } from "./d1-index-policy.mjs";
const action = process.argv[2];
const config = "dist/server/wrangler.json";
const sourceConfig = JSON.parse(readFileSync("cloudflare.config.json", "utf8"));
function run(args, extra = {}) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: { ...process.env, ...extra } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (action === "build") {
  run(["scripts/run-framework.mjs", "build"], { DEVIL_CLOUDFLARE: "1" });
  const built = JSON.parse(readFileSync(config, "utf8"));
  // The Vite output config lives two directories below the source migrations.
  for (const binding of built.d1_databases || []) binding.migrations_dir = "../../drizzle";
  // Keep links and other runtime values configured in the Cloudflare dashboard.
  built.keep_vars = true;
  writeFileSync(config, JSON.stringify(built, null, 2) + "\n");
} else if (action === "deploy") {
  const built = JSON.parse(readFileSync(config, "utf8"));
  if (built.name !== "devil-websitekey" || built.d1_databases?.[0]?.database_id === "00000000-0000-4000-8000-000000000000") {
    throw new Error("Run npm run build:cf with a configured Database ID before deploy:cf.");
  }
  const provider = built.vars?.DATABASE_PROVIDER || "d1";
  if (provider === "d1") {
    const migration = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "migrations", "apply", "DB", "--remote", "--config", config], { encoding: "utf8", env: process.env });
    if (migration.error) throw migration.error;
    process.stdout.write(migration.stdout || ""); process.stderr.write(migration.stderr || "");
    if (migration.status !== 0) {
      const files = Object.fromEntries(readdirSync("drizzle").filter(n => n.endsWith(".sql")).map(n => [n, readFileSync("drizzle/" + n, "utf8")]));
      if (!mayDeferIndexes((migration.stdout || "") + (migration.stderr || ""), built.d1_databases?.[0]?.database_id, files)) process.exit(migration.status ?? 1);
      console.warn("D1 daily quota exceeded. Deferring only nonunique indexes after verified deployed schema 0003; migration history is unchanged.");
    }
  } else if (provider === "turso" && (process.env.TURSO_MIGRATION_VERIFIED === "1" || sourceConfig.turso_import_verified === true)) {
    console.log("Turso data import verified by operator; retaining D1 binding for rollback. No D1 migrations run.");
  } else throw new Error("Turso deployment requires verified import and TURSO_MIGRATION_VERIFIED=1 in build variables.");
  run(["node_modules/wrangler/bin/wrangler.js", "deploy", "--config", config]);
} else throw new Error("Expected build or deploy");
