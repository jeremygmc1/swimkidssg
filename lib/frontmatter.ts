// Server-only. Serializes a post's fields + Markdown body into the exact
// `.mdx` shape lib/mdx.ts parses, using gray-matter so serialization and
// parsing stay symmetric. `lineWidth: -1` stops js-yaml from folding long
// excerpts across multiple lines (its default wraps at 80 columns).

import matter from 'gray-matter'

export type PostFields = {
  title: string
  date: string
  excerpt: string
  author?: string
  coverImage?: string
  lastEdited?: string
}

// gray-matter forwards these options to js-yaml's dump at runtime; `lineWidth`
// isn't in its published option type, so cast to the parameter type.
const YAML_OPTIONS = { lineWidth: -1 } as Parameters<typeof matter.stringify>[2]

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Build the full `.mdx` file text. Frontmatter key order mirrors the
// hand-written posts: title, date, author, lastEdited, excerpt, coverImage.
export function buildPostFile(fields: PostFields, body: string): string {
  const data: Record<string, string> = {
    title: fields.title,
    date: fields.date,
  }
  if (fields.author) data.author = fields.author
  data.lastEdited = fields.lastEdited ?? todayISO()
  data.excerpt = fields.excerpt
  if (fields.coverImage) data.coverImage = fields.coverImage

  return matter.stringify(`${body.trim()}\n`, data, YAML_OPTIONS)
}
