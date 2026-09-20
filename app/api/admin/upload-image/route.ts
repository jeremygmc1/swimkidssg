import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/admin-auth'
import { isValidSlug } from '@/lib/post-validation'
import { uploadLimiter, isRateLimited, clientIp } from '@/lib/ratelimit'

// Stages an image for the publish commit — it does NOT touch GitHub. Validates
// type/size and returns the intended repo path, the public URL to reference in
// the post, and the base64 bytes the client passes back to /publish (so the
// image and post land in one commit). Needs no token, so it works before
// POSTS_GITHUB_TOKEN is set.

const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB, matching the blob-upload limit

function safeName(name: string, ext: string): string {
  const stem =
    name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'image'
  return `${stem}.${ext}`
}

export async function POST(request: Request) {
  const denied = await guardAdmin(request)
  if (denied) return denied

  if (await isRateLimited(uploadLimiter, clientIp(request))) {
    return NextResponse.json(
      { error: 'Too many uploads. Please try again later.' },
      { status: 429 }
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected a multipart form upload.' }, { status: 400 })
  }

  const file = form.get('file')
  const slug = String(form.get('slug') ?? '').trim()

  if (!isValidSlug(slug)) {
    return NextResponse.json(
      { error: 'Set the article slug before adding images.' },
      { status: 400 }
    )
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No image file was provided.' }, { status: 400 })
  }

  const ext = ALLOWED[file.type]
  if (!ext) {
    return NextResponse.json(
      { error: 'Unsupported image type. Use PNG, JPG, or WebP.' },
      { status: 400 }
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image is too large (max 8 MB).' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const name = safeName(file.name, ext)

  return NextResponse.json({
    path: `public/blog/${slug}/${name}`,
    url: `/blog/${slug}/${name}`,
    base64: buffer.toString('base64'),
  })
}
