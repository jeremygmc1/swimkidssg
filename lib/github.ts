// Server-only GitHub REST helper for the admin publishing flow. The deployed
// app has no git and a read-only filesystem, so reads and writes to the repo
// go through the GitHub API with a repo-scoped token. Everything here needs
// POSTS_GITHUB_TOKEN and must never be imported by client code.

import matter from 'gray-matter'

const API = 'https://api.github.com'
const POSTS_DIR = 'content/posts'

function repo(): string {
  return process.env.GITHUB_REPO || 'jeremygmc1/swimkidssg'
}

// Read env inside calls (never at module scope) so a missing token can't fail
// the build — it fails the request instead, with a clear message.
function token(): string {
  const t = process.env.POSTS_GITHUB_TOKEN
  if (!t) throw new Error('POSTS_GITHUB_TOKEN is not set — the publishing backend is unconfigured.')
  return t
}

type GhInit = { method?: string; body?: unknown; acceptRaw?: boolean }

async function gh(path: string, init: GhInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: init.acceptRaw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  })
}

async function ghJson<T>(path: string, init?: GhInit): Promise<T> {
  const res = await gh(path, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub ${init?.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Reads (source of truth for the admin UI — plan fix #2)
// ---------------------------------------------------------------------------

export type PostSummary = {
  slug: string
  title: string
  date: string
  excerpt: string
  author?: string
  coverImage?: string
  lastEdited?: string
}

export type RawPost = {
  slug: string
  data: Record<string, unknown>
  content: string
  sha: string
}

type ContentEntry = { name: string; path: string; type: string; sha: string }

async function getFileText(path: string): Promise<string> {
  const res = await gh(`/repos/${repo()}/contents/${path}`, { acceptRaw: true })
  if (!res.ok) throw new Error(`GitHub GET ${path} → ${res.status}`)
  return res.text()
}

// Just the slugs of published posts, from the directory listing alone — no
// per-file fetch/parse. Used for the publish uniqueness check.
export async function listPostSlugs(): Promise<string[]> {
  const entries = await ghJson<ContentEntry[]>(`/repos/${repo()}/contents/${POSTS_DIR}`)
  return entries
    .filter((e) => e.type === 'file' && e.name.endsWith('.mdx'))
    .map((e) => e.name.replace(/\.mdx$/, ''))
}

// List published posts with parsed frontmatter, newest first.
export async function listPosts(): Promise<PostSummary[]> {
  const entries = await ghJson<ContentEntry[]>(`/repos/${repo()}/contents/${POSTS_DIR}`)
  const files = entries.filter((e) => e.type === 'file' && e.name.endsWith('.mdx'))

  const posts = await Promise.all(
    files.map(async (e) => {
      const { data } = matter(await getFileText(e.path))
      return {
        slug: e.name.replace(/\.mdx$/, ''),
        title: typeof data.title === 'string' ? data.title : e.name.replace(/\.mdx$/, ''),
        date: typeof data.date === 'string' ? data.date : '',
        excerpt: typeof data.excerpt === 'string' ? data.excerpt : '',
        author: typeof data.author === 'string' ? data.author : undefined,
        coverImage: typeof data.coverImage === 'string' ? data.coverImage : undefined,
        lastEdited: typeof data.lastEdited === 'string' ? data.lastEdited : undefined,
      } satisfies PostSummary
    })
  )

  return posts.sort((a, b) => (a.date < b.date ? 1 : -1))
}

// Load one post (frontmatter + body + blob SHA) for the edit screen. The SHA is
// only informational here — commitFiles derives its own from the branch tree.
export async function getPostRaw(slug: string): Promise<RawPost> {
  const path = `${POSTS_DIR}/${slug}.mdx`
  const meta = await ghJson<{ sha: string; content: string; encoding: string }>(
    `/repos/${repo()}/contents/${path}`
  )
  const raw =
    meta.encoding === 'base64'
      ? Buffer.from(meta.content, 'base64').toString('utf-8')
      : meta.content
  const { data, content } = matter(raw)
  return { slug, data, content, sha: meta.sha }
}

// The files directly under a directory with their blob SHAs (empty when the
// directory does not exist). Used to delete a post's image folder on unpublish
// and to move images (by SHA) when a post is renamed.
export async function listDirFiles(dir: string): Promise<{ path: string; sha: string }[]> {
  const res = await gh(`/repos/${repo()}/contents/${dir}`)
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`GitHub GET ${dir} → ${res.status}`)
  const entries = (await res.json()) as ContentEntry[]
  return entries.filter((e) => e.type === 'file').map((e) => ({ path: e.path, sha: e.sha }))
}

// Current blob SHA for a path, or null when it does not exist.
export async function getFileSha(path: string): Promise<string | null> {
  const res = await gh(`/repos/${repo()}/contents/${path}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub GET ${path} → ${res.status}`)
  const json = (await res.json()) as { sha: string }
  return json.sha
}

// ---------------------------------------------------------------------------
// Writes (atomic multi-file commit via the Git Data API)
// ---------------------------------------------------------------------------

export type CommitFile = {
  path: string
  content: string
  encoding?: 'utf-8' | 'base64'
}

export type CommitResult = { commitSha: string; url: string }

// A move/copy: place an already-committed blob at a new path without re-uploading
// its bytes (used to relocate images when a post is renamed).
export type BlobRef = { path: string; sha: string }

// Commit any number of file writes, blob moves, and deletes as ONE commit, so a
// post and its images land together (one deploy, no orphans). Retries once on a
// non-fast-forward ref update, i.e. a concurrent push moved the branch.
export async function commitFiles(params: {
  files?: CommitFile[]
  blobRefs?: BlobRef[]
  deletions?: string[]
  message: string
  branch?: string
}): Promise<CommitResult> {
  const branch = params.branch ?? 'main'
  const r = repo()
  const files = params.files ?? []
  const blobRefs = params.blobRefs ?? []
  const deletions = params.deletions ?? []

  if (files.length === 0 && blobRefs.length === 0 && deletions.length === 0) {
    throw new Error('commitFiles called with nothing to commit.')
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const ref = await ghJson<{ object: { sha: string } }>(`/repos/${r}/git/ref/heads/${branch}`)
    const baseCommitSha = ref.object.sha
    const baseCommit = await ghJson<{ tree: { sha: string } }>(
      `/repos/${r}/git/commits/${baseCommitSha}`
    )

    const additions = await Promise.all(
      files.map(async (f) => {
        const blob = await ghJson<{ sha: string }>(`/repos/${r}/git/blobs`, {
          method: 'POST',
          body: { content: f.content, encoding: f.encoding ?? 'utf-8' },
        })
        return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha }
      })
    )
    // Existing blobs placed at new paths (moves), reusing their SHAs.
    const moves = blobRefs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha }))
    // A tree entry with sha:null removes the path.
    const removals = deletions.map((path) => ({ path, mode: '100644', type: 'blob', sha: null }))

    const tree = await ghJson<{ sha: string }>(`/repos/${r}/git/trees`, {
      method: 'POST',
      body: { base_tree: baseCommit.tree.sha, tree: [...additions, ...moves, ...removals] },
    })

    const commit = await ghJson<{ sha: string }>(`/repos/${r}/git/commits`, {
      method: 'POST',
      body: { message: params.message, tree: tree.sha, parents: [baseCommitSha] },
    })

    const update = await gh(`/repos/${r}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: { sha: commit.sha, force: false },
    })
    if (update.ok) {
      return { commitSha: commit.sha, url: `https://github.com/${r}/commit/${commit.sha}` }
    }
    // 422 == non-fast-forward: the branch moved under us. Rebuild against the
    // new head on the next pass. Any other status is a real failure.
    if (update.status !== 422) {
      const text = await update.text().catch(() => '')
      throw new Error(`GitHub update ref → ${update.status}: ${text.slice(0, 300)}`)
    }
  }

  throw new Error('Could not update the branch after a concurrent change — please retry.')
}
