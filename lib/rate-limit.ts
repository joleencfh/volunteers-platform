// Sliding-window rate limiter, kept in memory.
//
// LIMITATION: the counters live in the memory of one server instance. On Vercel every serverless
// instance has its own, and they are discarded when an instance is recycled, so the effective
// limit is "per instance" and a determined client can exceed it. It is a cheap brake against
// accidental floods and naive abuse (magic-link requests, the application form), not a security
// boundary. Move to a shared store if abuse shows up.

export interface RateLimitResult {
  allowed: boolean
  /** Requests still allowed in the current window (0 when blocked). */
  remaining: number
  /** Milliseconds until the next request would be allowed (0 when allowed). */
  retryAfterMs: number
}

export interface RateLimiterOptions {
  /** Maximum requests per key within the window. */
  limit: number
  windowMs: number
  /** Clock, replaceable in tests. */
  now?: () => number
  /** Upper bound on tracked keys, so a flood of distinct keys cannot grow memory without limit. */
  maxKeys?: number
}

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
  maxKeys = 10_000,
}: RateLimiterOptions) {
  const hits = new Map<string, number[]>()

  function prune(timestamps: number[], current: number) {
    const cutoff = current - windowMs
    let drop = 0
    while (drop < timestamps.length && timestamps[drop] <= cutoff) drop++
    if (drop > 0) timestamps.splice(0, drop)
  }

  function sweep(current: number) {
    for (const [key, timestamps] of hits) {
      prune(timestamps, current)
      if (timestamps.length === 0) hits.delete(key)
    }
  }

  return {
    /** Records a request for `key` and says whether it is allowed. Blocked requests are not counted. */
    check(key: string): RateLimitResult {
      const current = now()
      let timestamps = hits.get(key)
      if (!timestamps) {
        if (hits.size >= maxKeys) sweep(current)
        // Still full of active keys: drop the oldest key (Map keeps insertion order).
        if (hits.size >= maxKeys) hits.delete(hits.keys().next().value as string)
        timestamps = []
        hits.set(key, timestamps)
      }
      prune(timestamps, current)
      if (timestamps.length >= limit) {
        return { allowed: false, remaining: 0, retryAfterMs: timestamps[0] + windowMs - current }
      }
      timestamps.push(current)
      return { allowed: true, remaining: limit - timestamps.length, retryAfterMs: 0 }
    },
    /** Forgets everything; for tests. */
    reset() {
      hits.clear()
    },
  }
}
