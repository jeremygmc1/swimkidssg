// One-time helper — run this LOCALLY to capture a logged-in Vercel session for
// the worker. It opens a real browser so you can log in by hand (including
// 2FA / SSO, which cannot be scripted), then saves the session as base64 you
// paste into the worker's VERCEL_STORAGE_STATE_B64 secret.
//
//   cd worker/analytics-snapshot
//   npm install
//   npx playwright install chromium   # first time only
//   VERCEL_ANALYTICS_URL="https://vercel.com/<team>/<project>/analytics" npm run capture-session
//
// The session cookie expires after a while; re-run this and redeploy the worker
// when the bot tells you the session has expired.

import { writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { chromium } from 'playwright'

const ANALYTICS_URL = process.env.VERCEL_ANALYTICS_URL || 'https://vercel.com/dashboard'
const OUT_FILE = 'vercel-session.json'

function waitForEnter(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(prompt, () => { rl.close(); resolve() }))
}

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext()
const page = await context.newPage()

console.log(`\nOpening ${ANALYTICS_URL}`)
console.log('Log in to Vercel in the browser window (complete any 2FA/SSO).')
console.log('Navigate until you can SEE the Analytics dashboard you want captured.\n')

await page.goto(ANALYTICS_URL, { waitUntil: 'domcontentloaded' }).catch(() => {})

await waitForEnter('When the analytics page is fully visible, press Enter here to save the session… ')

const state = await context.storageState()
writeFileSync(OUT_FILE, JSON.stringify(state))
const b64 = Buffer.from(JSON.stringify(state)).toString('base64')

console.log(`\nSaved session to ${OUT_FILE} (git-ignored — do not commit).`)
console.log('\nSet this as the worker secret VERCEL_STORAGE_STATE_B64:\n')
console.log(b64)
console.log('\nExample (Fly.io):')
console.log(`  fly secrets set VERCEL_STORAGE_STATE_B64="${b64.slice(0, 24)}…"\n`)

await browser.close()
process.exit(0)
