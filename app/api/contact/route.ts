import { NextRequest, NextResponse } from 'next/server'
import { appendRow } from '@/lib/sheets'
import { FIELDS } from '@/components/ContactForm'

export async function POST(req: NextRequest) {
  const body = await req.json()

  const missing = FIELDS.filter((f) => f.required && !body[f.name]?.toString().trim())
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.map((f) => f.label).join(', ')}` },
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
