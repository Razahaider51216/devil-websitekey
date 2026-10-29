// Existing GUI color-only preview; independent of the production runtime manifest.
export const guiPreview = {
  release: "original-gray-preview-20261029-1",
  key: "tests/gui/original-gray-20261029-1.lua",
  bytes: 206574,
  sha256: "68eaab0fd6f18afc8c7a222e41ae7f9346085a48b2c6ac2317c9887fcdc8485e",
} as const;

export async function guiPreviewResponse(bucket: Pick<R2Bucket, "get"> | undefined) {
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    const object = await bucket?.get(guiPreview.key);
    if (!object || object.size !== guiPreview.bytes) throw new Error("Unavailable");
    const data = await object.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), b => b.toString(16).padStart(2, "0")).join("");
    if (hash !== guiPreview.sha256) throw new Error("Integrity");
    return new Response(data, { headers });
  } catch {
    return new Response("DEVIL GUI preview unavailable; try again shortly", { status: 503, headers });
  }
}
