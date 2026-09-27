'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { adminFetch, getAuth, setAuth, clearAuth } from '@/lib/admin-client'

const inputBase =
  'w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

// Wraps admin screens: renders children only once a valid password is stored,
// otherwise a login form. Auth is checked against /api/admin/session (no GitHub
// call), so it works even if GitHub is briefly unreachable.
export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      if (!getAuth()) {
        if (active) setReady(true)
        return
      }
      const res = await adminFetch('/api/admin/session')
      if (!active) return
      if (res.ok) setAuthed(true)
      else clearAuth()
      setReady(true)
    })()
    return () => {
      active = false
    }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setChecking(true)
    setError('')
    setAuth(password)
    const res = await adminFetch('/api/admin/session')
    setChecking(false)
    if (res.ok) {
      setAuthed(true)
      setPassword('')
    } else {
      clearAuth()
      setError(res.status === 429 ? 'Too many attempts — wait a minute.' : 'Incorrect password.')
    }
  }

  if (!ready) {
    return <p className="mx-auto max-w-md px-6 py-24 text-center text-sm text-gray-400">Loading…</p>
  }

  if (authed) return <>{children}</>

  return (
    <div className="mx-auto max-w-sm px-6 py-24">
      <h1 className="mb-2 text-2xl font-bold text-brand-700">Admin sign in</h1>
      <p className="mb-6 text-sm text-gray-500">Enter the article publishing password.</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className={inputBase}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={checking || !password}
          className="rounded-full bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
