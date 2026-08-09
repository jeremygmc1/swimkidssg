'use client'

import { useRef, useState } from 'react'
import { upload } from '@vercel/blob/client'
import type { FieldConfig } from '@/lib/fields'

type Item = { pathname: string; name: string }

type Props = {
  field: FieldConfig
  value: string
  onChange: (name: string, value: string) => void
}

export default function FileUploadField({ field, value, onChange }: Props) {
  const { name, accept, multiple } = field
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // Clear the displayed files when the form resets the value externally.
  // Adjusting state during render (React's recommended pattern) rather than in
  // an effect avoids an extra render pass on reset.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    if (!value) setItems([])
  }

  function commit(next: Item[]) {
    setItems(next)
    onChange(name, next.map((i) => i.pathname).join('\n'))
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setError('')
    setUploading(true)
    try {
      const uploaded: Item[] = []
      for (const file of files) {
        const blob = await upload(file.name, file, {
          access: 'private',
          handleUploadUrl: '/api/blob-upload',
        })
        uploaded.push({ pathname: blob.pathname, name: file.name })
      }
      commit(multiple ? [...items, ...uploaded] : uploaded.slice(-1))
    } catch {
      setError('Upload failed. Check the file type and size (max 8 MB each).')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function remove(pathname: string) {
    commit(items.filter((i) => i.pathname !== pathname))
  }

  const showInput = multiple || items.length === 0

  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 && (
        <ul className="flex flex-col gap-1">
          {items.map((i) => (
            <li
              key={i.pathname}
              className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm"
            >
              <span className="truncate text-green-700">✓ {i.name}</span>
              <button
                type="button"
                onClick={() => remove(i.pathname)}
                className="shrink-0 font-medium text-gray-500 hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {showInput && (
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={uploading}
          onChange={handleFiles}
          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-full file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100 disabled:opacity-50"
        />
      )}
      {uploading && <p className="text-xs text-gray-500">Uploading…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
