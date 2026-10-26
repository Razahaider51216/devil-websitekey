// Always derive from the issued timestamp; refreshing or a sleeping tab cannot reset a key.
export function remainingKeyTime(expiresAt: number | null, status: string, now: number) {
  if (status === "revoked") return { state: "revoked", seconds: 0 } as const;
  if (status === "expired" || (expiresAt !== null && expiresAt <= now)) return { state: "expired", seconds: 0 } as const;
  if (expiresAt === null) return { state: "permanent", seconds: 0 } as const;
  return { state: "active", seconds: Math.max(0, Math.ceil((expiresAt - now) / 1000)) } as const;
}
