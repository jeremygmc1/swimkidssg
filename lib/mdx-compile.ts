// Server-only. The build-break guard (publishing plan, fix #1).
//
// Posts are `.mdx` compiled as JSX and the blog is fully static
// (generateStaticParams), so a SINGLE post that fails MDX compilation fails
// `next build` for the whole blog — Vercel then freezes on the last good
// deploy while the author sees "published". This module stops a bad post
// before it can be committed.
//
// Two layers, because neither alone is enough:
//   1. neutralizeMdx — escape the characters that let plain prose be misread
//      as MDX: `{`/`}` (expressions) and `<` (JSX tags), OUTSIDE code spans.
//   2. assertCompiles — compile with the same @mdx-js/mdx that next-mdx-remote
//      uses, as an authoritative backstop.
//
// Why both: `@mdx-js/mdx` compile throws on `<30C` / `<b` (syntax errors) but
// NOT on `{money}` or `<Carousel>` — those compile and only throw at prerender
// (undefined reference / undefined component). Escaping removes that entire
// class up front. The neutralized body is what gets committed.

import { compile } from '@mdx-js/mdx'

// Escape `{`, `}`, `<` unless already backslash-escaped.
function escapeProse(text: string): string {
  return text.replace(/(?<!\\)[{}<]/g, (c) => `\\${c}`)
}

// Escape a single line while leaving inline code spans (`like this`) untouched —
// inside code these characters are already literal to MDX.
function escapeInlineAware(line: string): string {
  let out = ''
  let i = 0
  while (i < line.length) {
    if (line[i] === '`') {
      let j = i
      while (line[j] === '`') j++
      const ticks = line.slice(i, j)
      const close = line.indexOf(ticks, j)
      if (close !== -1) {
        out += line.slice(i, close + ticks.length) // code span, verbatim
        i = close + ticks.length
        continue
      }
      // Unmatched backtick run (no closing span): emit it verbatim and advance
      // past it. Backticks aren't MDX-significant, and this guarantees progress —
      // otherwise indexOf('`', i) below would return i and loop forever.
      out += ticks
      i = j
      continue
    }
    let next = line.indexOf('`', i)
    if (next === -1) next = line.length
    out += escapeProse(line.slice(i, next))
    i = next
  }
  return out
}

// Escape MDX-significant characters throughout a Markdown body, skipping fenced
// code blocks (``` / ~~~) and inline code, where the characters are literal.
export function neutralizeMdx(body: string): string {
  let fenceChar: string | null = null
  let fenceLen = 0

  return body
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*(`{3,}|~{3,})(.*)$/)
      if (m) {
        const marker = m[1]
        if (fenceChar === null) {
          fenceChar = marker[0]
          fenceLen = marker.length
        } else if (marker[0] === fenceChar && marker.length >= fenceLen && m[2].trim() === '') {
          fenceChar = null
          fenceLen = 0
        }
        return line
      }
      if (fenceChar !== null) return line
      return escapeInlineAware(line)
    })
    .join('\n')
}

export type MdxCheck = { ok: boolean; body: string; error?: string }

// Neutralize, then compile. Returns the neutralized body to commit when ok,
// or a one-line author-facing error when the body still won't build.
export async function validateMdxBody(rawBody: string): Promise<MdxCheck> {
  const body = neutralizeMdx(rawBody)
  try {
    await compile(body, { outputFormat: 'function-body' })
    return { ok: true, body }
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\n')[0] : 'The article body could not be processed.'
    return { ok: false, body, error: message }
  }
}
