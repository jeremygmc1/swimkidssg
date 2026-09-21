import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/admin-auth'

// Lightweight auth probe for the client gate — runs the Basic-auth check with no
// GitHub call, so verifying a stored credential never depends on GitHub being up.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await guardAdmin(request)
  if (denied) return denied
  return NextResponse.json({ ok: true })
}
