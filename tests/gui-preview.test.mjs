import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { guiPreviewResponse, guiPreview } from "../lib/gui-preview-delivery.ts";

test("GUI preview fails closed on missing storage or mismatched bytes", async () => {
  for (const bucket of [undefined, { get: async () => null }, { get: async () => ({ size: 1 }) }]) {
    assert.equal((await guiPreviewResponse(bucket)).status, 503);
  }
});
test("GUI preview rejects corrupt data with the correct length", async () => {
  let requested;
  const response = await guiPreviewResponse({ get: async key => {
    requested = key;
    return { size: guiPreview.bytes, arrayBuffer: async () => new Uint8Array(guiPreview.bytes).buffer };
  } });
  assert.equal(requested, guiPreview.key);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("GUI preview route does not call key or runtime APIs", async () => {
  const source = await readFile(new URL("../app/test/gui/route.ts", import.meta.url), "utf8");
  assert.match(source, /documentRequest\(req\)/);
  assert.doesNotMatch(source, /runtime:active|generateKey|verifyKey|site_settings/);
});
