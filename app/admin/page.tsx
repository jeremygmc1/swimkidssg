'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/AdminGate'
import { adminFetch } from '@/lib/admin-client'

type Post = {
  slug: string
  title: string
  date: string
  excerpt: string
  author?: string
  lastEdited?: string
}

function Dashboard() {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  // Mount fetch — state is set lexically inside the async IIFE, after an await.
  useEffect(() => {
    let active = true
    ;(async () => {
      const res = await adminFetch('/api/admin/posts')
      if (!active) return
      if (!res.ok) {
        setError('Could not load posts from GitHub. Try again in a moment.')
        return
      }
      const data = await res.json()
      setError('')
      setPosts(data.posts as Post[])
    })()
    return () => {
      active = false
    }
  }, [])

  // Reload after an event (unpublish) — an event handler, not an effect.
  async function refresh() {
    const res = await adminFetch('/api/admin/posts')
    if (!res.ok) {
      setError('Could not load posts from GitHub. Try again in a moment.')
      return
    }
    const data = await res.json()
    setError('')
    setPosts(data.posts as Post[])
  }

  async function unpublish(slug: string, title: string) {
    if (!window.confirm(`Unpublish "${title}"? It will be removed from the live site.`)) return
    setBusy(slug)
    const res = await adminFetch('/api/admin/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
    setBusy('')
    if (res.ok) {
      refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      window.alert(data.error ?? 'Delete failed.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-700">Articles</h1>
        <Link href="/admin/editor" className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
          + New article
        </Link>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {posts === null && !error && <p className="text-sm text-gray-400">Loading…</p>}

      {posts !== null && posts.length === 0 && (
        <p className="text-sm text-gray-500">No articles yet. Create the first one.</p>
      )}

      {posts !== null && posts.length > 0 && (
        <ul className="flex flex-col divide-y divide-gray-100 rounded-lg border border-gray-200">
          {posts.map((post) => (
            <li key={post.slug} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">{post.title}</p>
                <p className="truncate text-xs text-gray-400">
                  {post.date}
                  {post.author ? ` · ${post.author}` : ''} · /blog/{post.slug}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <Link href={`/admin/editor/${post.slug}`} className="font-medium text-brand-700 hover:underline">
                  Edit
                </Link>
                <button
                  type="button"
                  disabled={busy === post.slug}
                  onClick={() => unpublish(post.slug, post.title)}
                  className="font-medium text-gray-500 hover:text-red-600 disabled:opacity-50"
                >
                  {busy === post.slug ? 'Removing…' : 'Unpublish'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function AdminPage() {
  return (
    <AdminGate>
      <Dashboard />
    </AdminGate>
  )
}
