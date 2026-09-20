import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/admin-auth'
import { getPostRaw } from '@/lib/github'
import { isValidSlug } from '@/lib/post-validation'

// Loads one post (frontmatter + body) for the editor. `hasJsx` flags posts that
// use developer-only MDX (e.g. <Carousel>) so the editor can block editing them
// — the Markdown-only editor can't round-trip JSX (Option A migration guard).
export const dynamic = 'force-dynamic'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const denied = await guardAdmin(request)
  if (denied) return denied

  const { slug } = await ctx.params
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'Invalid slug.' }, { status: 400 })
  }

  try {
    const post = await getPostRaw(slug)
    return NextResponse.json({
      slug: post.slug,
      title: str(post.data.title),
      date: str(post.data.date),
      author: str(post.data.author),
      excerpt: str(post.data.excerpt),
      coverImage: str(post.data.coverImage),
      lastEdited: str(post.data.lastEdited),
      body: post.content,
      hasJsx: /<[A-Za-z]/.test(post.content),
    })
  } catch (err) {
    console.error('admin/post error:', err)
    return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
  }
}
