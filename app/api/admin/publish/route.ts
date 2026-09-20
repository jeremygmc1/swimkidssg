import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/admin-auth'
import { commitFiles, listPosts, type CommitFile } from '@/lib/github'
import { validatePost, isValidSlug } from '@/lib/post-validation'
import { validateMdxBody } from '@/lib/mdx-compile'
import { buildPostFile } from '@/lib/frontmatter'
import { notifyNewLead } from '@/lib/notify'
import { formLimiter, isRateLimited, clientIp } from '@/lib/ratelimit'

// Authoritative publish path: validate → neutralize+compile the MDX (fix #1) →
// serialize → single atomic commit of the post plus any images (fix: one deploy,
// no orphans) → Telegram ping. Straight to `main` unless a branch is given
// (Phase 4 tests against a scratch branch first).

type StagedImage = { path: string; base64: string }

type PublishBody = {
  title?: string
  slug?: string
  date?: string
  author?: string
  excerpt?: string
  coverImage?: string
  body?: string
  images?: StagedImage[]
  originalSlug?: string
  branch?: string
}

export async function POST(request: Request) {
  const denied = await guardAdmin(request)
  if (denied) return denied

  if (await isRateLimited(formLimiter, clientIp(request))) {
    return NextResponse.json(
      { error: 'Too many publishes in a short time. Please wait a moment.' },
      { status: 429 }
    )
  }

  let payload: PublishBody
  try {
    payload = (await request.json()) as PublishBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const input = {
    title: payload.title ?? '',
    slug: payload.slug ?? '',
    date: payload.date ?? '',
    author: payload.author ?? '',
    excerpt: payload.excerpt ?? '',
    coverImage: payload.coverImage ?? '',
    body: payload.body ?? '',
  }
  const originalSlug = payload.originalSlug?.trim() || undefined
  const branch = payload.branch?.trim() || 'main'

  // Offline validation first, so field/body errors surface instantly and don't
  // depend on GitHub being reachable. Uniqueness (which needs the live list) is
  // checked separately below.
  const result = validatePost(input, { originalSlug })
  if (!result.ok) {
    return NextResponse.json({ error: 'Please fix these fields.', errors: result.errors }, { status: 400 })
  }

  // Build guard: reject anything that would break `next build`, and get the
  // neutralized body that is safe to commit.
  const mdx = await validateMdxBody(input.body)
  if (!mdx.ok) {
    return NextResponse.json(
      { error: 'The article body could not be published.', errors: [mdx.error ?? 'MDX compile failed.'] },
      { status: 400 }
    )
  }

  // Validate staged images defensively (they come from our own upload route,
  // but never trust the client blindly).
  const images = payload.images ?? []
  for (const img of images) {
    if (typeof img?.path !== 'string' || typeof img?.base64 !== 'string') {
      return NextResponse.json({ error: 'A staged image was malformed.' }, { status: 400 })
    }
    if (!img.path.startsWith(`public/blog/${input.slug}/`)) {
      return NextResponse.json({ error: 'A staged image had an unexpected path.' }, { status: 400 })
    }
  }

  // Live slug list (source of truth) for the uniqueness check.
  let existingSlugs: string[]
  try {
    existingSlugs = (await listPosts()).map((p) => p.slug)
  } catch (err) {
    console.error('admin/publish listPosts error:', err)
    return NextResponse.json({ error: 'Could not reach GitHub to validate the post.' }, { status: 502 })
  }
  if (input.slug !== originalSlug && existingSlugs.includes(input.slug)) {
    return NextResponse.json(
      { error: 'Please fix these fields.', errors: [`A post with the slug "${input.slug}" already exists — choose a different one.`] },
      { status: 400 }
    )
  }

  const fileText = buildPostFile(
    {
      title: input.title.trim(),
      date: input.date.trim(),
      excerpt: input.excerpt.trim(),
      author: input.author.trim() || undefined,
      coverImage: input.coverImage.trim() || undefined,
    },
    mdx.body
  )

  const files: CommitFile[] = [
    { path: `content/posts/${input.slug}.mdx`, content: fileText, encoding: 'utf-8' },
    ...images.map((img) => ({ path: img.path, content: img.base64, encoding: 'base64' as const })),
  ]

  // On a slug rename, remove the old post file in the same commit.
  const deletions =
    originalSlug && originalSlug !== input.slug && isValidSlug(originalSlug)
      ? [`content/posts/${originalSlug}.mdx`]
      : undefined

  const editing = Boolean(originalSlug)
  const verb = editing ? 'Update' : 'Publish'
  const message = `${verb} "${input.title.trim()}" (${input.slug})`

  let commit
  try {
    commit = await commitFiles({ files, deletions, message, branch })
  } catch (err) {
    console.error('admin/publish commit error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }

  await notifyNewLead(`Article ${editing ? 'updated' : 'published'}`, {
    Title: input.title.trim(),
    Slug: input.slug,
    Author: input.author.trim(),
    Link: `https://swimkidssg.com/blog/${input.slug}`,
    Commit: commit.url,
  })

  return NextResponse.json({ success: true, slug: input.slug, commitUrl: commit.url })
}
