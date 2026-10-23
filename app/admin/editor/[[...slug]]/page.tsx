'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import AdminGate from '@/components/AdminGate'
import ArticleEditor, { type EditorInitial } from '@/components/ArticleEditor'
import { adminFetch } from '@/lib/admin-client'

type Screen = 'new' | 'loading' | 'edit' | 'blocked' | 'error'

function EditorScreen() {
  const params = useParams<{ slug?: string[] }>()
  const slug = Array.isArray(params.slug) ? params.slug[0] : undefined

  const [screen, setScreen] = useState<Screen>(slug ? 'loading' : 'new')
  const [initial, setInitial] = useState<EditorInitial | undefined>(undefined)

  useEffect(() => {
    if (!slug) return
    let active = true
    ;(async () => {
      const res = await adminFetch(`/api/admin/post/${slug}`)
      if (!active) return
      if (!res.ok) {
        setScreen('error')
        return
      }
      const data = await res.json()
      if (data.hasJsx) {
        setScreen('blocked')
        return
      }
      setInitial({
        slug: data.slug,
        title: data.title,
        date: data.date,
        author: data.author,
        excerpt: data.excerpt,
        coverImage: data.coverImage,
        body: data.body,
        baseSha: data.sha,
      })
      setScreen('edit')
    })()
    return () => {
      active = false
    }
  }, [slug])

  if (screen === 'loading') {
    return <p className="mx-auto max-w-3xl px-6 py-24 text-center text-sm text-gray-400">Loading…</p>
  }

  if (screen === 'error') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="mb-4 text-sm text-red-600">Could not load this post.</p>
        <Link href="/admin" className="text-sm text-brand-700 hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    )
  }

  if (screen === 'blocked') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="mb-3 text-xl font-bold text-brand-700">This post has a photo gallery</h1>
        <p className="mb-6 text-sm text-gray-600">
          It uses a layout feature that must be edited by a developer, so it can’t be opened in the
          editor. New articles and text-only posts work as usual.
        </p>
        <Link href="/admin" className="text-sm text-brand-700 hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    )
  }

  return <ArticleEditor mode={slug ? 'edit' : 'new'} initial={initial} />
}

export default function EditorPage() {
  return (
    <AdminGate>
      <EditorScreen />
    </AdminGate>
  )
}
