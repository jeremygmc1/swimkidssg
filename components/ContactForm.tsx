'use client'

import { useState } from 'react'
import FormField from './FormField'
import Turnstile from './Turnstile'
import { FIELDS, type FieldConfig } from '@/lib/fields'

const TURNSTILE_ENABLED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

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
    if (f.type === 'multiselect') state[`${f.name}_other`] = ''
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
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileReset, setTurnstileReset] = useState(0)

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

    if (TURNSTILE_ENABLED && !turnstileToken) {
      setErrorMsg('Please complete the verification below.')
      setStatus('error')
      return
    }

    setStatus('loading')
    setErrorMsg('')

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, turnstileToken }),
    })

    if (res.ok) {
      setStatus('success')
      setValues(buildInitialState(fields))
    } else {
      const data = await res.json().catch(() => ({}))
      setErrorMsg(data.error ?? 'Something went wrong.')
      setStatus('error')
    }
    // Turnstile tokens are single-use — reset for the next attempt either way.
    setTurnstileToken('')
    setTurnstileReset((k) => k + 1)
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
          otherValue={values[`${field.name}_other`]}
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

      <Turnstile onVerify={setTurnstileToken} resetKey={turnstileReset} />

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
