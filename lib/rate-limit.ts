type Bucket = { count: number; resetAt: number };

const globalBuckets = globalThis as unknown as {
  requestBuckets?: Map<string, Bucket>;
};

const buckets = globalBuckets.requestBuckets ?? new Map<string, Bucket>();
globalBuckets.requestBuckets = buckets;

export function checkRateLimit(key: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  return { allowed: true, remaining: limit - current.count, resetAt: current.resetAt };
}

export class RequestThrottle {
  private nextAllowedAt = 0;

  constructor(private readonly requestsPerSecond: number) {}

  async wait() {
    const spacing = Math.ceil(1_000 / Math.max(1, this.requestsPerSecond));
    const waitMs = Math.max(0, this.nextAllowedAt - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.nextAllowedAt = Date.now() + spacing;
  }
}
