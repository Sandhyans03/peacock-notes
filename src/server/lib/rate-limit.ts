import { createMiddleware } from "hono/factory";

// Simple in-memory limiter: max `limit` requests per `windowMs` per IP per URL path.
// The path contains the share token, so this is effectively "per IP, per link".
// Note: memory is per server instance. For many instances / serverless at scale, use Redis or Upstash.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(opts: { limit: number; windowMs: number }) {
  return createMiddleware(async (c, next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
    const key = `${c.req.path}|${ip}`;
    const now = Date.now();

    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k); // stop unbounded growth
    }

    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, b);
    }
    b.count++;

    if (b.count > opts.limit) {
      c.header("Retry-After", String(Math.ceil((b.resetAt - now) / 1000)));
      return c.json({ error: "rate_limited" }, 429);
    }
    await next();
  });
}
