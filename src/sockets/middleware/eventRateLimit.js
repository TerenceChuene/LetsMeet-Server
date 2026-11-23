const buckets = new WeakMap();

/**
 * Simple per-socket sliding window throttle for inbound events.
 * @param {{ limit?: number, windowMs?: number }} [options]
 */
export function createEventRateLimiter({ limit = 40, windowMs = 10_000 } = {}) {
  return (socket, next) => {
    const now = Date.now();
    let bucket = buckets.get(socket);

    if (!bucket || now - bucket.windowStart >= windowMs) {
      bucket = { windowStart: now, count: 0 };
      buckets.set(socket, bucket);
    }

    bucket.count += 1;

    if (bucket.count > limit) {
      const error = new Error('RATE_LIMITED');
      error.data = { retryAfterMs: windowMs - (now - bucket.windowStart) };
      return next(error);
    }

    return next();
  };
}

export default createEventRateLimiter;
