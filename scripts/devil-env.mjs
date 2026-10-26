import { existsSync, readFileSync, writeFileSync } from "node:fs";
if (existsSync(".env")) {
  const values = readFileSync(".env");
  writeFileSync(".dev.vars", values, { mode: 0o600 });
  if (existsSync("dist/server")) writeFileSync("dist/server/.dev.vars", values, { mode: 0o600 });
}
