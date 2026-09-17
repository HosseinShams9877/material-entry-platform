// ─────────────────────────── Rate Limiter (in-memory) ───────────────────────────

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// پاک‌سازی دوره‌ای برای جلوگیری از نشت حافظه
let lastSweep = Date.now()
function sweepIfNeeded() {
  const now = Date.now()
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key)
  }
}

/**
 * محدودسازی نرخ درخواست. true یعنی مجاز.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  sweepIfNeeded()
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= limit) return false
  bucket.count++
  return true
}
