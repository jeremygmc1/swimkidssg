import { NextRequest, NextResponse } from 'next/server'
import { appendRow } from '@/lib/sheets'
import { notifyNewLead } from '@/lib/notify'
import { verifyTurnstile } from '@/lib/turnstile'
import { formLimiter, isRateLimited, clientIp } from '@/lib/ratelimit'
import { COACH_FIELDS } from '@/lib/fields'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  if (await isRateLimited(formLimiter, ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a moment.' },
      { status: 429 }
    )
  }

  const body = await req.json()

  // Honeypot: humans never see this field; if it's filled, a bot did it.
  // Pretend success so bots don't learn to skip it.
  if (body.company?.toString().trim()) {
    return NextResponse.json({ success: true })
  }

  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    return NextResponse.json(
      { error: 'Verification failed. Please try again.' },
      { status: 400 }
    )
  }

  const missing = COACH_FIELDS.filter((f) => f.required && !body[f.name]?.toString().trim())
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.map((f) => f.label).join(', ')}` },
      { status: 400 }
    )
  }

  const tooLong = COACH_FIELDS.filter(
    (f) => f.maxLength && (body[f.name]?.toString().length ?? 0) > f.maxLength
  )
  const otherTooLong = COACH_FIELDS.some(
    (f) => f.type === 'multiselect' && (body[`${f.name}_other`]?.toString().length ?? 0) > 100
  )
  if (tooLong.length > 0 || otherTooLong || (body.phone_code?.toString().length ?? 0) > 5) {
    return NextResponse.json(
      { error: `Field too long: ${tooLong.map((f) => f.label).join(', ') || 'phone code'}` },
      { status: 400 }
    )
  }

  const row: Record<string, string> = {
    'Date Submitted': new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }),
  }

  const SITE = 'https://www.swimkidssg.com'

  for (const field of COACH_FIELDS) {
    if (field.type === 'phone') {
      row[field.label] = `${body[`${field.name}_code`] ?? ''} ${body[field.name] ?? ''}`.trim()
    } else if (field.type === 'file') {
      row[field.label] = (body[field.name] ?? '')
        .split('\n')
        .map((p: string) => p.trim())
        .filter(Boolean)
        .map((p: string) => `${SITE}/api/coach-file?path=${encodeURIComponent(p)}`)
        .join('\n')
    } else if (field.type === 'multiselect') {
      const other = body[`${field.name}_other`]?.toString().trim()
      row[field.label] = (body[field.name] ?? '')
        .split(',')
        .filter(Boolean)
        .map((item: string) => (item === 'Others' && other ? `Others: ${other}` : item))
        .join(', ')
    } else {
      row[field.label] = body[field.name] ?? ''
    }
  }

  try {
    await appendRow(row, 'Coaches')
    await notifyNewLead('New coach enquiry', row)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Sheets error:', err)
    return NextResponse.json({ error: 'Failed to submit. Please try again.' }, { status: 500 })
  }
}
