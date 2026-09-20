// Always-on snapshot worker.
//
// Exposes POST /snapshot. The Vercel /api/telegram route calls it (with a shared
// secret) when the owner sends /analytics. This worker keeps a headless browser
// warm, loads a stored Vercel session, screenshots the Analytics dashboard, and
// delivers the image straight to Telegram via sendPhoto.
//
// Why a separate always-on service instead of doing this in the Vercel function:
// Hobby functions cap at ~10s and cold-start Chromium, which is too tight for a
// reliable login + render + screenshot. Here the browser stays warm and there is
// no per-request time limit.

import { timingSafeEqual } from 'node:crypto'
import express from 'express'
import { chromium } from 'playwright-core'

const PORT = Number(process.env.PORT) || 8080
const WORKER_SECRET = process.env.SNAPSHOT_WORKER_SECRET
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ANALYTICS_URL = process.env.VERCEL_ANALYTICS_URL
// Path to the Chromium binary. On the provided Docker image Playwright's browser
// is installed at build time; leave unset to use playwright-core's default.
const EXECUTABLE_PATH = process.env.CHROMIUM_EXECUTABLE_PATH || undefined
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT_MS) || 45000

// Playwright storageState (cookies + localStorage) captured by capture-session.js,
// supplied as base64-encoded JSON so it fits in a single env var / secret.
function loadStorageState() {
  const b64 = process.env.VERCEL_STORAGE_STATE_B64
  if (!b64) return null
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  } catch (err) {
    console.error('Failed to parse VERCEL_STORAGE_STATE_B64:', err)
    return null
  }
}

function requiredEnvMissing() {
  const missing = []
  if (!WORKER_SECRET) missing.push('SNAPSHOT_WORKER_SECRET')
  if (!BOT_TOKEN) missing.push('TELEGRAM_BOT_TOKEN')
  if (!ANALYTICS_URL) missing.push('VERCEL_ANALYTICS_URL')
  if (!process.env.VERCEL_STORAGE_STATE_B64) missing.push('VERCEL_STORAGE_STATE_B64')
  return missing
}

function secretMatches(provided) {
  if (!WORKER_SECRET || typeof provided !== 'string') return false
  const a = Buffer.from(provided)
  const b = Buffer.from(WORKER_SECRET)
  return a.length === b.length && timingSafeEqual(a, b)
}

// --- Telegram delivery ---------------------------------------------------------

async function telegramSendMessage(chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
  } catch (err) {
    console.error('telegramSendMessage error:', err)
  }
}

async function telegramApi(method, form) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${method} failed: ${res.status} ${body}`)
  }
}

// Deliver the screenshot as a photo. A full-page dashboard can be tall enough
// that Telegram rejects sendPhoto on its dimension/ratio limits, so fall back to
// sendDocument (no such limits) which still shows inline on mobile.
async function deliverImage(chatId, pngBuffer, caption) {
  const photo = new FormData()
  photo.append('chat_id', String(chatId))
  if (caption) photo.append('caption', caption)
  photo.append('photo', new Blob([pngBuffer], { type: 'image/png' }), 'analytics.png')
  try {
    await telegramApi('sendPhoto', photo)
    return
  } catch (err) {
    console.warn('sendPhoto failed, falling back to sendDocument:', err.message)
  }
  const doc = new FormData()
  doc.append('chat_id', String(chatId))
  if (caption) doc.append('caption', caption)
  doc.append('document', new Blob([pngBuffer], { type: 'image/png' }), 'analytics.png')
  await telegramApi('sendDocument', doc)
}

// --- Browser (kept warm across requests) --------------------------------------

let browserPromise = null

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        executablePath: EXECUTABLE_PATH,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      })
      .catch((err) => {
        browserPromise = null // allow a later retry
        throw err
      })
  }
  return browserPromise
}

// True when the page has been bounced to a Vercel login / SSO screen, meaning
// the stored session has expired. We check the URL and for a password field.
async function looksLikeLogin(page) {
  const url = page.url()
  if (/\/(login|sso)(\b|\/|\?)/.test(url)) return true
  if (/^https:\/\/vercel\.com\/(login|sso)/.test(url)) return true
  const passwordField = await page.$('input[type="password"]')
  return Boolean(passwordField)
}

async function captureAndSend(chatId) {
  const storageState = loadStorageState()
  if (!storageState) {
    await telegramSendMessage(chatId, '⚠️ No stored Vercel session on the worker. Run capture-session to set one.')
    return
  }

  const browser = await getBrowser()
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1280, height: 1400 },
    deviceScaleFactor: 2, // sharper text for phone viewing
  })
  const page = await context.newPage()
  try {
    await page.goto(ANALYTICS_URL, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT })

    if (await looksLikeLogin(page)) {
      await telegramSendMessage(
        chatId,
        '🔒 Vercel session expired. Re-run capture-session to refresh VERCEL_STORAGE_STATE_B64, then redeploy the worker.',
      )
      return
    }

    // Give charts a beat to finish drawing after network goes idle.
    await page.waitForTimeout(2500)

    const png = await page.screenshot({ type: 'png', fullPage: true })
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    await deliverImage(chatId, png, `Vercel Analytics — ${stamp}`)
  } catch (err) {
    console.error('captureAndSend error:', err)
    await telegramSendMessage(chatId, '⚠️ Failed to capture the analytics snapshot. Check the worker logs.')
  } finally {
    await context.close().catch(() => {})
  }
}

// --- HTTP ---------------------------------------------------------------------

const app = express()
app.use(express.json({ limit: '64kb' }))

app.get('/healthz', (_req, res) => {
  const missing = requiredEnvMissing()
  res.status(missing.length ? 503 : 200).json({ ok: missing.length === 0, missing })
})

app.post('/snapshot', (req, res) => {
  if (!secretMatches(req.body?.secret)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }
  const chatId = req.body?.chatId
  if (!chatId) {
    return res.status(400).json({ ok: false, error: 'chatId required' })
  }
  const missing = requiredEnvMissing()
  if (missing.length) {
    return res.status(503).json({ ok: false, error: 'worker not configured', missing })
  }

  // Ack immediately; the browser work + delivery happen after the response so the
  // caller (a Vercel function on a tight budget) never waits on the screenshot.
  res.status(202).json({ ok: true })
  captureAndSend(String(chatId)).catch((err) => console.error('captureAndSend rejected:', err))
})

app.listen(PORT, () => {
  const missing = requiredEnvMissing()
  console.log(`analytics-snapshot worker listening on :${PORT}`)
  if (missing.length) console.warn('Missing required env:', missing.join(', '))
})
