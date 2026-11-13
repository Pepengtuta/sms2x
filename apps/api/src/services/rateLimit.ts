interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Fixed-window rate limit, counted in memory.
 *
 * Counters reset when the API restarts, which is acceptable for a
 * single-user LAN service. Swap for a table if the API ever runs
 * multi-instance or behind a load balancer.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Drops expired buckets so the map cannot grow without bound. */
export function sweepRateLimits(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Number of live buckets — exposed for tests and diagnostics. */
export function rateLimitBucketCount(): number {
  return buckets.size;
}

setInterval(sweepRateLimits, 60_000).unref();

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 60_000 },
  register: { limit: 5, windowMs: 60_000 },
  send: { limit: 60, windowMs: 60_000 },
  otpSend: { limit: 30, windowMs: 60_000 },
  otpSendPerPhone: { limit: 3, windowMs: 60 * 60_000 },
  pairingToken: { limit: 10, windowMs: 60_000 },
};
