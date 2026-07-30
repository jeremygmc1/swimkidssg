import { get } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

// Streams a private coach-uploaded file behind HTTP Basic Auth.
// The sheet/Telegram store links to this route; opening one prompts for the
// admin password (COACH_FILES_PASSWORD), then serves the file inline.
const UNAUTHORIZED = new NextResponse('Authentication required', {
  status: 401,
  headers: { 'WWW-Authenticate': 'Basic realm="SwimKidsSG coach files"' },
})

function isAuthorized(request: Request): boolean {
  const password = process.env.COACH_FILES_PASSWORD
  if (!password) return false
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Basic ')) return false
  const decoded = Buffer.from(header.slice(6), 'base64').toString() // "user:pass"
  const provided = decoded.slice(decoded.indexOf(':') + 1)
  // Constant-time compare to avoid leaking the password via timing.
  const a = Buffer.from(provided)
  const b = Buffer.from(password)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) return UNAUTHORIZED

  const path = new URL(request.url).searchParams.get('path')
  if (!path) return new NextResponse('Missing file path', { status: 400 })

  try {
    const result = await get(path, {
      access: 'private',
      token: process.env.SWIMKIDSSG_READ_WRITE_TOKEN,
    })
    if (!result?.stream) return new NextResponse('File not found', { status: 404 })
    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType ?? 'application/octet-stream',
        'Content-Disposition': result.blob.contentDisposition ?? 'inline',
      },
    })
  } catch {
    return new NextResponse('File not found', { status: 404 })
  }
}
