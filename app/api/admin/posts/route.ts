import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/admin-auth'
import { listPosts } from '@/lib/github'

// Dashboard data source. Reads from GitHub (not the runtime filesystem) so the
// listing is authoritative and never stale (publishing plan, fix #2).
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await guardAdmin(request)
  if (denied) return denied

  try {
    const posts = await listPosts()
    return NextResponse.json({ posts })
  } catch (err) {
    console.error('admin/posts error:', err)
    return NextResponse.json({ error: 'Could not load posts from GitHub.' }, { status: 502 })
  }
}
