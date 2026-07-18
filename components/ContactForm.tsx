'use client'

import { useState } from 'react'
import FormField from './FormField'
import { FIELDS } from '@/lib/fields'

type FormState = Record<string, string>

function buildInitialState(): FormState {
  const state: FormState = {}
  for (const f of FIELDS) {
    state[f.name] = ''
    if (f.type === 'phone') state[`${f.name}_code`] = '+65'
  }
  state.company = '' // honeypot — hidden from humans, bots fill it
  return state
}

export default function ContactForm() {
  const [values, setValues] = useState<FormState>(buildInitialState)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  function handleChange(name: string, value: string) {
    setValues((prev) => {
      const next = { ...prev, [name]: value }
      // Clear any field whose showIf condition no longer holds
      for (const f of FIELDS) {
        if (f.showIf?.field === name && value !== f.showIf.value) next[f.name] = ''
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })

    if (res.ok) {
      setStatus('success')
      setValues(buildInitialState())
    } else {
      const data = await res.json().catch(() => ({}))
      setErrorMsg(data.error ?? 'Something went wrong.')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 p-8 text-center">
        <p className="text-green-700 font-semibold text-lg">Thank you for your enquiry!</p>
        <p className="text-green-600 text-sm mt-1">We'll get back to you within 24 hours.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {FIELDS.filter((f) => !f.showIf || values[f.showIf.field] === f.showIf.value).map((field) => (
        <FormField
          key={field.name}
          field={field}
          value={values[field.name]}
          phoneCode={values[`${field.name}_code`]}
          onChange={handleChange}
        />
      ))}

      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input
          id="company"
          type="text"
          name="company"
          value={values.company}
          tabIndex={-1}
          autoComplete="off"
          onChange={(e) => handleChange('company', e.target.value)}
        />
      </div>

      {status === 'error' && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="mt-2 bg-brand-600 text-white font-semibold px-6 py-3 rounded-full hover:bg-brand-700 transition disabled:opacity-50"
      >
        {status === 'loading' ? 'Sending…' : 'Send Enquiry'}
      </button>
    </form>
  )
}
