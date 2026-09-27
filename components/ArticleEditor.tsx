'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { Markdown } from 'tiptap-markdown'
import { validatePost, slugify } from '@/lib/post-validation'
import { adminFetch } from '@/lib/admin-client'

export type EditorInitial = {
  slug: string
  title: string
  date: string
  author: string
  excerpt: string
  coverImage: string
  body: string
  baseSha: string
}

type StagedImage = { path: string; base64: string; url: string }

const inputBase =
  'w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

const todayISO = () => new Date().toISOString().slice(0, 10)

// tiptap-markdown augments editor.storage at runtime; the Storage type doesn't
// know about it, so read it through a narrow cast.
function getMarkdown(editor: Editor): string {
  const storage = editor.storage as { markdown?: { getMarkdown: () => string } }
  return storage.markdown?.getMarkdown() ?? ''
}

function ToolbarButton({
  onClick,
  active,
  children,
  title,
}: {
  onClick: () => void
  active?: boolean
  children: React.ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`h-8 min-w-8 rounded px-2 text-sm font-medium ${
        active ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor, onInsertImage }: { editor: Editor; onInsertImage: () => void }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 p-2">
      <ToolbarButton title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        B
      </ToolbarButton>
      <ToolbarButton title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        H2
      </ToolbarButton>
      <ToolbarButton title="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        H3
      </ToolbarButton>
      <ToolbarButton title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        • List
      </ToolbarButton>
      <ToolbarButton title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        1. List
      </ToolbarButton>
      <ToolbarButton
        title="Link"
        active={editor.isActive('link')}
        onClick={() => {
          if (editor.isActive('link')) {
            editor.chain().focus().unsetLink().run()
            return
          }
          const url = window.prompt('Link URL (e.g. /contact or https://…)')
          if (url) editor.chain().focus().setLink({ href: url }).run()
        }}
      >
        Link
      </ToolbarButton>
      <ToolbarButton title="Insert image" onClick={onInsertImage}>
        Image
      </ToolbarButton>
    </div>
  )
}

export default function ArticleEditor({
  mode,
  initial,
}: {
  mode: 'new' | 'edit'
  initial?: EditorInitial
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(mode === 'edit')
  const [date, setDate] = useState(initial?.date || todayISO())
  const [author, setAuthor] = useState(initial?.author ?? '')
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '')
  const [coverImage, setCoverImage] = useState(initial?.coverImage ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [staged, setStaged] = useState<StagedImage[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [serverErrors, setServerErrors] = useState<string[]>([])
  const [done, setDone] = useState<{ slug: string; commitUrl: string } | null>(null)
  const [uploading, setUploading] = useState(false)

  const coverInputRef = useRef<HTMLInputElement>(null)
  const inlineInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [StarterKit, Image, Markdown.configure({ html: false, breaks: false })],
    content: initial?.body ?? '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none min-h-[320px] px-4 py-3 focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => setBody(getMarkdown(editor)),
  })

  const validation = validatePost({ title, slug, date, excerpt, body, author, coverImage })
  const canPublish = validation.ok && !submitting && !uploading

  function onTitle(value: string) {
    setTitle(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  async function uploadImage(file: File): Promise<StagedImage | null> {
    if (!slug) {
      window.alert('Add a title (which sets the slug) before uploading images.')
      return null
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('slug', slug)
      const res = await adminFetch('/api/admin/upload-image', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        window.alert(data.error ?? 'Upload failed.')
        return null
      }
      const img = data as StagedImage
      setStaged((prev) => [...prev.filter((x) => x.path !== img.path), img])
      return img
    } finally {
      setUploading(false)
    }
  }

  async function onCoverPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      const img = await uploadImage(file)
      if (img) setCoverImage(img.url)
    }
    if (coverInputRef.current) coverInputRef.current.value = ''
  }

  async function onInlinePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file && editor) {
      const img = await uploadImage(file)
      if (img) editor.chain().focus().setImage({ src: img.url, alt: file.name }).run()
    }
    if (inlineInputRef.current) inlineInputRef.current.value = ''
  }

  async function publish() {
    setSubmitting(true)
    setServerErrors([])
    try {
      const res = await adminFetch('/api/admin/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          slug,
          date,
          author,
          excerpt,
          coverImage,
          body,
          images: staged.map(({ path, base64 }) => ({ path, base64 })),
          originalSlug: mode === 'edit' ? initial?.slug : undefined,
          baseSha: mode === 'edit' ? initial?.baseSha : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setDone({ slug: data.slug, commitUrl: data.commitUrl })
      } else {
        setServerErrors(data.errors ?? [data.error ?? 'Publish failed.'])
      }
    } catch {
      setServerErrors(['Network error — please try again.'])
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="mb-3 text-2xl font-bold text-brand-700">
          {mode === 'edit' ? 'Article updated' : 'Article published'}
        </h1>
        <p className="mb-6 text-sm text-gray-600">
          It will be live at{' '}
          <a className="text-cyan-600 underline" href={`/blog/${done.slug}`} target="_blank" rel="noreferrer">
            /blog/{done.slug}
          </a>{' '}
          once the site finishes rebuilding (about a minute).
        </p>
        <div className="flex gap-3">
          <Link href="/admin" className="rounded-full bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
            Back to dashboard
          </Link>
          <a href={done.commitUrl} target="_blank" rel="noreferrer" className="rounded-full bg-gray-100 px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200">
            View commit
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-700">
          {mode === 'edit' ? 'Edit article' : 'New article'}
        </h1>
        <Link href="/admin" className="text-sm text-gray-500 hover:text-brand-700">
          ← Dashboard
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Title</span>
          <input className={inputBase} value={title} onChange={(e) => onTitle(e.target.value)} placeholder="Article title" />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Slug</span>
            <input
              className={inputBase}
              value={slug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(e.target.value)
              }}
              placeholder="url-friendly-slug"
            />
            <span className="text-xs text-gray-400">/blog/{slug || '…'}</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Date</span>
            <input type="date" className={inputBase} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Author</span>
          <input className={inputBase} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="e.g. Priya Nair, Swim Instructor" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">
            Excerpt <span className="font-normal text-gray-400">({excerpt.trim().length}/200)</span>
          </span>
          <textarea className={inputBase} rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="One or two sentences shown on the blog list and in search results." />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Cover image</span>
          {coverImage && (
            <div className="mb-1 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverImage} alt="cover preview" className="h-16 w-24 rounded object-cover" />
              <button type="button" className="text-sm text-gray-500 hover:text-red-600" onClick={() => setCoverImage('')}>
                Remove
              </button>
            </div>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onCoverPick}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-full file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Article body</span>
          <div className="rounded-lg border border-gray-200">
            {editor && <Toolbar editor={editor} onInsertImage={() => inlineInputRef.current?.click()} />}
            <EditorContent editor={editor} />
            <input ref={inlineInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onInlinePick} className="hidden" />
          </div>
        </div>

        {!validation.ok && (
          <ul className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {validation.errors.map((err) => (
              <li key={err}>• {err}</li>
            ))}
          </ul>
        )}
        {serverErrors.length > 0 && (
          <ul className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {serverErrors.map((err) => (
              <li key={err}>• {err}</li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={publish}
            disabled={!canPublish}
            className="rounded-full bg-brand-500 px-8 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {submitting ? 'Publishing…' : mode === 'edit' ? 'Update & publish' : 'Publish'}
          </button>
          {uploading && <span className="text-xs text-gray-400">Uploading image…</span>}
        </div>
        <p className="text-xs text-gray-400">
          Publishing commits straight to the live site — it appears at /blog/{slug || '…'} after a short rebuild.
        </p>
      </div>
    </div>
  )
}
