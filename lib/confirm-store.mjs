import crypto from "crypto";

const pendingWrites = new Map();
const TTL_MS = 5 * 60 * 1000;

function pruneExpired() {
  const now = Date.now();
  for (const [token, entry] of pendingWrites) {
    if (entry.expiresAt <= now) pendingWrites.delete(token);
  }
}

export function createPendingWrite(toolName, args) {
  pruneExpired();
  const token = crypto.randomBytes(3).toString("hex").toUpperCase();
  pendingWrites.set(token, {
    toolName,
    args,
    expiresAt: Date.now() + TTL_MS,
  });
  return token;
}

export function consumePendingWrite(token) {
  pruneExpired();
  const entry = pendingWrites.get(token?.toUpperCase());
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    pendingWrites.delete(token.toUpperCase());
    return null;
  }
  pendingWrites.delete(token.toUpperCase());
  return entry;
}