import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Rate limiting is enabled only when the Upstash env vars are present. Without
// them (e.g. local dev, or before you've provisioned a store) the limiters are
// null and every check is a no-op, so the app keeps working unthrottled.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null

// Public form submissions (contact + coach): 5 per minute per IP.
export const formLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '1 m'), prefix: 'rl:form' })
  : null

// Blob upload-token minting: 10 per hour per IP — the tightest limit, since
// abuse here costs storage.
export const uploadLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 h'), prefix: 'rl:upload' })
  : null

// Failed coach-file auth attempts: 10 per minute per IP, to slow brute forcing.
export const authLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m'), prefix: 'rl:auth' })
  : null

// Analytics snapshot command: 1 per minute (keyed by chat, not IP), since each
// run spins up a headless browser on the worker — the expensive path.
export const snapshotLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(1, '1 m'), prefix: 'rl:snapshot' })
  : null

// Best-effort client IP from the proxy headers Vercel sets.
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  return xff?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
}

// Returns true when the request should be blocked. Fails open (returns false)
// when rate limiting is disabled or the store is unreachable — a Redis blip must
// not take down the forms.
export async function isRateLimited(limiter: Ratelimit | null, key: string): Promise<boolean> {
  if (!limiter) return false
  try {
    const { success } = await limiter.limit(key)
    return !success
  } catch (err) {
    console.error('Rate limit check failed:', err)
    return false
  }
}
