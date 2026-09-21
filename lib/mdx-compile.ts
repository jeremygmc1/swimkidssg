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

// Split a line into code / prose segments, preserving inline code spans
// (`like this`) verbatim. Guarantees forward progress even on an unmatched
// backtick run (which is emitted verbatim as a prose segment) — a lone backtick
// once looped here forever.
function splitLineByCode(line: string): { text: string; code: boolean }[] {
  const segments: { text: string; code: boolean }[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '`') {
      let j = i
      while (line[j] === '`') j++
      const ticks = line.slice(i, j)
      const close = line.indexOf(ticks, j)
      if (close !== -1) {
        segments.push({ text: line.slice(i, close + ticks.length), code: true })
        i = close + ticks.length
        continue
      }
      // Unmatched backtick run: not a code span. Emit verbatim (backticks aren't
      // MDX-significant) and advance past it.
      segments.push({ text: ticks, code: false })
      i = j
      continue
    }
    let next = line.indexOf('`', i)
    if (next === -1) next = line.length
    segments.push({ text: line.slice(i, next), code: false })
    i = next
  }
  return segments
}

// Classify each body line as prose (outside any fenced code block, and not a
// fence delimiter itself) or not. Shared by neutralizeMdx and containsJsx so the
// fence tracking lives in one place.
function classifyLines(body: string): { line: string; prose: boolean }[] {
  let fenceChar: string | null = null
  let fenceLen = 0
  return body.split('\n').map((line) => {
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
      return { line, prose: false }
    }
    return { line, prose: fenceChar === null }
  })
}

// Escape MDX-significant characters throughout a Markdown body, skipping fenced
// code blocks (``` / ~~~) and inline code, where the characters are literal.
export function neutralizeMdx(body: string): string {
  return classifyLines(body)
    .map(({ line, prose }) =>
      prose
        ? splitLineByCode(line)
            .map((seg) => (seg.code ? seg.text : escapeProse(seg.text)))
            .join('')
        : line
    )
    .join('\n')
}

// True when the body contains a JSX/HTML tag the Markdown editor can't
// round-trip (e.g. <Carousel>, <img ... />) — used to keep legacy component
// posts developer-only. Ignores backslash-escaped `\<` (what neutralizeMdx
// emits for literal `<` in prose) and anything inside code, so a normal
// text post that merely mentions `<` or shows `<html>` in inline code is NOT
// flagged and stays editable.
export function containsJsx(body: string): boolean {
  for (const { line, prose } of classifyLines(body)) {
    if (!prose) continue
    for (const seg of splitLineByCode(line)) {
      if (seg.code) continue
      if (/(?<!\\)<[A-Za-z/]/.test(seg.text)) return true
    }
  }
  return false
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
