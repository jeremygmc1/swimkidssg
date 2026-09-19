// Shared post validator — safe to import from BOTH client and server (no Node
// or server-only imports). Encodes the conventions visible across
// content/posts/*.mdx so a non-technical author gets the same verdict in the
// editor (instant feedback) and in the publish route (authoritative).

export type PostValidationInput = {
  title: string
  slug: string
  date: string
  excerpt: string
  body: string
  author?: string
  coverImage?: string
}

export type ValidationResult = { ok: boolean; errors: string[] }

export type ValidateOptions = {
  // Slugs already taken in the repo (from lib/github.ts listPosts()).
  existingSlugs?: string[]
  // When editing, the post's current slug — allowed to "collide" with itself.
  originalSlug?: string
}

const TITLE_MAX = 120
const EXCERPT_MIN = 30
const EXCERPT_MAX = 200
// kebab-case: lowercase words joined by single hyphens, no leading/trailing/double hyphen.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// A real calendar date in YYYY-MM-DD — rejects values JS silently rolls over
// (e.g. 2026-02-30 → Mar 2).
export function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return false
  return value === d.toISOString().slice(0, 10)
}

// Derive a kebab-case slug from a title. Editor default; the author can override.
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['‘’]/g, '') // drop straight/curly apostrophes
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function validatePost(
  input: PostValidationInput,
  options: ValidateOptions = {}
): ValidationResult {
  const errors: string[] = []
  const { existingSlugs = [], originalSlug } = options

  const title = input.title?.trim() ?? ''
  if (!title) {
    errors.push('Title is required.')
  } else if (title.length > TITLE_MAX) {
    errors.push(`Title is too long (${title.length}/${TITLE_MAX} characters).`)
  }

  const slug = input.slug?.trim() ?? ''
  if (!slug) {
    errors.push('Slug is required.')
  } else if (!SLUG_RE.test(slug)) {
    errors.push(
      'Slug must be lowercase words separated by single hyphens (e.g. "water-safety-tips").'
    )
  } else if (slug !== originalSlug && existingSlugs.includes(slug)) {
    errors.push(`A post with the slug "${slug}" already exists — choose a different one.`)
  }

  if (!isValidDate(input.date?.trim() ?? '')) {
    errors.push('Date must be a real calendar date in YYYY-MM-DD format.')
  }

  const excerpt = input.excerpt?.trim() ?? ''
  if (!excerpt) {
    errors.push('Excerpt is required.')
  } else if (excerpt.length < EXCERPT_MIN || excerpt.length > EXCERPT_MAX) {
    errors.push(
      `Excerpt should be ${EXCERPT_MIN}–${EXCERPT_MAX} characters (currently ${excerpt.length}).`
    )
  }

  const body = input.body?.trim() ?? ''
  if (!body) {
    errors.push('Article body is required.')
  } else if (/^#\s/m.test(body)) {
    errors.push(
      'Use "##" or "###" for section headings — a single "#" (H1) clashes with the article title.'
    )
  }

  return { ok: errors.length === 0, errors }
}
