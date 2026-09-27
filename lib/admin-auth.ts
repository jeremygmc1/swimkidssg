// Server-only. HTTP Basic-auth gate for the admin surface, mirroring the
// constant-time compare in app/api/coach-file/route.ts but against
// ADMIN_PASSWORD. Applied inside each /api/admin/* route handler (Node runtime)
// rather than in middleware, so it never touches the Edge runtime where
// node:crypto is unavailable (publishing plan, fix #3).

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { authLimiter, isRateLimited, clientIp } from '@/lib/ratelimit'

function safeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // Length check first: timingSafeEqual throws on unequal lengths.
  return a.length === b.length && timingSafeEqual(a, b)
}

// True when the request carries the correct Basic-auth password. Fails closed
// when ADMIN_PASSWORD is unset, so an unconfigured deploy keeps admin locked.
export function isAuthorized(request: Request): boolean {
  const password = process.env.ADMIN_PASSWORD
  if (!password) return false
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Basic ')) return false
  const decoded = Buffer.from(header.slice(6), 'base64').toString() // "user:pass"
  const provided = decoded.slice(decoded.indexOf(':') + 1)
  return safeEqual(provided, password)
}

// Returns a Response to short-circuit the handler with (401 challenge, or 429
// when the IP is guessing too fast), or null when the request is authorized.
export async function guardAdmin(request: Request): Promise<NextResponse | null> {
  if (isAuthorized(request)) return null
  // Throttle repeated failures (incl. the credential-less first hit) per IP.
  if (await isRateLimited(authLimiter, clientIp(request))) {
    return new NextResponse('Too many attempts. Please try again later.', { status: 429 })
  }
  // NOTE: deliberately NO `WWW-Authenticate` header. The admin UI drives Basic
  // auth itself through a login form (lib/admin-client), so the credential is
  // sent as an Authorization header we build. Sending the challenge header would
  // make the browser pop its own native username/password dialog over our form.
  return new NextResponse('Authentication required', { status: 401 })
}
