import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/admin-auth'
import { commitFiles, listDirFiles } from '@/lib/github'
import { isValidSlug } from '@/lib/post-validation'
import { notifyNewLead } from '@/lib/notify'
import { formLimiter, isRateLimited, clientIp } from '@/lib/ratelimit'

// Unpublish: removes the post and its image folder in one commit, so an author
// can pull a post down without a git operation (publishing plan, §7).

type DeleteBody = { slug?: string; branch?: string }

export async function POST(request: Request) {
  const denied = await guardAdmin(request)
  if (denied) return denied

  if (await isRateLimited(formLimiter, clientIp(request))) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
  }

  let payload: DeleteBody
  try {
    payload = (await request.json()) as DeleteBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const slug = payload.slug?.trim() ?? ''
  const branch = payload.branch?.trim() || 'main'
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'Invalid slug.' }, { status: 400 })
  }

  try {
    const images = await listDirFiles(`public/blog/${slug}`)
    const commit = await commitFiles({
      deletions: [`content/posts/${slug}.mdx`, ...images],
      message: `Unpublish "${slug}"`,
      branch,
    })
    await notifyNewLead('Article unpublished', { Slug: slug, Commit: commit.url })
    return NextResponse.json({ success: true, commitUrl: commit.url })
  } catch (err) {
    console.error('admin/delete error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }
}
