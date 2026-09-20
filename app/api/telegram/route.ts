import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { sendTelegramMessage } from '@/lib/notify'
import { snapshotLimiter, isRateLimited } from '@/lib/ratelimit'

// Inbound Telegram webhook. Telegram POSTs every update for the bot here once
// the webhook is registered (see docs/telegram-analytics-snapshot.md).
//
// Only the `/analytics` command from the owner chat does anything: it triggers
// the always-on snapshot worker, which screenshots the Vercel Analytics
// dashboard and sends it back via the bot. Everything else is acknowledged and
// ignored so Telegram stops retrying.
//
// The heavy work (headless browser) lives on the worker, not here — this route
// only needs to ack fast, which keeps it well within the Hobby function budget.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Telegram sends this header on every webhook call when a secret_token was set
// via setWebhook. Reject anything that doesn't match — it isn't from Telegram.
function hasValidSecret(request: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected) return false
  const provided = request.headers.get('x-telegram-bot-api-secret-token') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

type TelegramUpdate = {
  message?: {
    text?: string
    chat?: { id?: number | string }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasValidSecret(request)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  let update: TelegramUpdate
  try {
    update = (await request.json()) as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: true }) // Malformed body — ack and drop.
  }

  const text = update.message?.text?.trim() ?? ''
  const chatId = update.message?.chat?.id
  const ownerChatId = process.env.TELEGRAM_CHAT_ID

  // Only the owner chat may drive the bot. Silently ack anyone else so Telegram
  // doesn't retry and we don't reveal the command to strangers.
  if (!chatId || !ownerChatId || String(chatId) !== ownerChatId) {
    return NextResponse.json({ ok: true })
  }

  // Match `/analytics` and `/analytics@YourBot` (group-style addressing).
  const command = text.split(/\s+/)[0]?.split('@')[0]
  if (command !== '/analytics') {
    return NextResponse.json({ ok: true })
  }

  // 1 request/minute per chat — each run spins up a browser on the worker.
  if (await isRateLimited(snapshotLimiter, String(chatId))) {
    await sendTelegramMessage('⏳ Just a moment — one snapshot per minute. Try again shortly.')
    return NextResponse.json({ ok: true })
  }

  const workerUrl = process.env.SNAPSHOT_WORKER_URL
  const workerSecret = process.env.SNAPSHOT_WORKER_SECRET
  if (!workerUrl || !workerSecret) {
    await sendTelegramMessage('⚠️ Snapshot worker is not configured.')
    return NextResponse.json({ ok: true })
  }

  await sendTelegramMessage('📸 Generating your analytics snapshot…')

  // Kick off the worker and return. The worker responds 202 immediately, then
  // does the screenshot and delivers the photo itself, so this function does not
  // wait on the browser. A short timeout guards against an unreachable worker.
  try {
    const res = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: String(chatId), secret: workerSecret }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      await sendTelegramMessage(`⚠️ Snapshot worker returned ${res.status}. Try again later.`)
    }
  } catch (err) {
    console.error('Snapshot worker trigger failed:', err)
    await sendTelegramMessage('⚠️ Could not reach the snapshot worker. Try again later.')
  }

  return NextResponse.json({ ok: true })
}
