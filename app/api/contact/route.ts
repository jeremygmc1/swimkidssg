import { NextRequest, NextResponse } from 'next/server'
import { appendRow } from '@/lib/sheets'
import { FIELDS } from '@/lib/fields'

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Honeypot: humans never see this field; if it's filled, a bot did it.
  // Pretend success so bots don't learn to skip it.
  if (body.company?.toString().trim()) {
    return NextResponse.json({ success: true })
  }

  const missing = FIELDS.filter((f) => f.required && !body[f.name]?.toString().trim())
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.map((f) => f.label).join(', ')}` },
      { status: 400 }
    )
  }

  const tooLong = FIELDS.filter(
    (f) => f.maxLength && (body[f.name]?.toString().length ?? 0) > f.maxLength
  )
  if (tooLong.length > 0 || (body.phone_code?.toString().length ?? 0) > 5) {
    return NextResponse.json(
      { error: `Field too long: ${tooLong.map((f) => f.label).join(', ') || 'phone code'}` },
      { status: 400 }
    )
  }

  const row: Record<string, string> = {
    'Date Submitted': new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }),
  }

  for (const field of FIELDS) {
    if (field.type === 'phone') {
      row[field.label] = `${body[`${field.name}_code`] ?? ''} ${body[field.name] ?? ''}`.trim()
    } else {
      row[field.label] = body[field.name] ?? ''
    }
  }

  try {
    await appendRow(row)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Sheets error:', err)
    return NextResponse.json({ error: 'Failed to submit. Please try again.' }, { status: 500 })
  }
}
