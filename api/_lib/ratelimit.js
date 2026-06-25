// In-memory rate limiter — IP per minute.
// Vercel serverless reuses the warm container, so this is best-effort
// (resets per cold start). Production-grade limiter would need Upstash/Redis.

const LIMIT = 30;
const WINDOW_MS = 60_000;
const buckets = new Map();

export function rateLimit(ip, limit = LIMIT) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const arr = (buckets.get(ip) || []).filter((t) => t > cutoff);
  arr.push(now);
  buckets.set(ip, arr);
  if (arr.length > limit) {
    return { ok: false, retryAfter: Math.ceil((arr[0] + WINDOW_MS - now) / 1000) };
  }
  // periodic cleanup
  if (Math.random() < 0.01) {
    for (const [k, v] of buckets.entries()) {
      const fresh = v.filter((t) => t > cutoff);
      if (fresh.length === 0) buckets.delete(k); else buckets.set(k, fresh);
    }
  }
  return { ok: true };
}
