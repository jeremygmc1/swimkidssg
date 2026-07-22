'use client'

import { useState } from 'react'
import FormField from './FormField'
import { FIELDS, type FieldConfig } from '@/lib/fields'

type FormState = Record<string, string>

type Props = {
  fields?: FieldConfig[]
  endpoint?: string
  submitLabel?: string
  successTitle?: string
  successBody?: string
}

function buildInitialState(fields: FieldConfig[]): FormState {
  const state: FormState = {}
  for (const f of fields) {
    state[f.name] = ''
    if (f.type === 'phone') state[`${f.name}_code`] = '+65'
  }
  state.company = '' // honeypot — hidden from humans, bots fill it
  return state
}

export default function ContactForm({
  fields = FIELDS,
  endpoint = '/api/contact',
  submitLabel = 'Send Enquiry',
  successTitle = 'Thank you for your enquiry!',
  successBody = "We'll get back to you within 24 hours.",
}: Props) {
  const [values, setValues] = useState<FormState>(() => buildInitialState(fields))
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  function handleChange(name: string, value: string) {
    setValues((prev) => {
      const next = { ...prev, [name]: value }
      // Clear any field whose showIf condition no longer holds
      for (const f of fields) {
        if (f.showIf?.field === name && value !== f.showIf.value) next[f.name] = ''
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })

    if (res.ok) {
      setStatus('success')
      setValues(buildInitialState(fields))
    } else {
      const data = await res.json().catch(() => ({}))
      setErrorMsg(data.error ?? 'Something went wrong.')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 p-8 text-center">
        <p className="text-green-700 font-semibold text-lg">{successTitle}</p>
        <p className="text-green-600 text-sm mt-1">{successBody}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {fields.filter((f) => !f.showIf || values[f.showIf.field] === f.showIf.value).map((field) => (
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
        {status === 'loading' ? 'Sending…' : submitLabel}
      </button>
    </form>
  )
}
