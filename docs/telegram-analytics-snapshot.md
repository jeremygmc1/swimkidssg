# On-demand Vercel Analytics snapshots via Telegram

Send `/analytics` to the bot and it replies with a fresh screenshot of the
Vercel Analytics dashboard. Works on a Hobby plan (which has no analytics API)
because it screenshots the real dashboard while logged in as you.

## How it works

```
You: /analytics
      │
      ▼
Telegram ──POST──▶ app/api/telegram (Vercel function)
                     • verifies Telegram secret header
                     • owner-chat only, 1/min rate limit
                     • acks "Generating…", triggers worker, returns fast
                                   │
                                   ▼
                     worker/analytics-snapshot (always-on, e.g. Northflank)
                     • warm headless Chromium + stored Vercel session
                     • screenshots VERCEL_ANALYTICS_URL
                     • sendPhoto ──▶ Telegram ──▶ You
```

The heavy browser work is on the worker, not the Vercel function, because Hobby
functions cap at ~10s and cold-start Chromium — too tight to be reliable.

## Pieces

| Piece | Location |
|-------|----------|
| Inbound webhook (`/analytics`) | `app/api/telegram/route.ts` |
| Telegram helpers (`sendPhoto`, `sendMessage`) | `lib/notify.ts` |
| 1/min limiter (`snapshotLimiter`) | `lib/ratelimit.ts` |
| Screenshot worker | `worker/analytics-snapshot/` |

## Setup

### 1. Deploy the worker

The worker is a plain Docker service (`worker/analytics-snapshot/Dockerfile`) and
runs on any always-on container host. Capture a Vercel session first (step 2) so
`VERCEL_STORAGE_STATE_B64` is ready before you set secrets.

Whatever host you use, it needs:

- **Build**: the Dockerfile at `worker/analytics-snapshot/Dockerfile`, with the
  build context set to `worker/analytics-snapshot` (the Dockerfile `COPY`s are
  relative to that folder, not the repo root).
- **Port**: `8080`, exposed over public HTTPS.
- **Resources**: **≥1 GB RAM** and ≥0.5 vCPU — Chromium needs the headroom.
- **Always-on**: keep ≥1 instance running (disable scale-to-zero) so the browser
  stays warm and `/analytics` is snappy.
- **Health check**: HTTP `GET /healthz` → 200.
- **Env / secrets**: `SNAPSHOT_WORKER_SECRET`, `TELEGRAM_BOT_TOKEN`,
  `VERCEL_ANALYTICS_URL`, `VERCEL_STORAGE_STATE_B64` (see `.env.example`).

#### Northflank (recommended)

Via the dashboard:

1. **Create a project** (pick a region near you / your Vercel edge).
2. **Add a service → Combined service** (build + deploy from Git). Connect the
   GitHub repo and choose the `main` branch (after PR #23 is merged).
3. **Build**: select **Dockerfile** as the build type and set:
   - Dockerfile path: `worker/analytics-snapshot/Dockerfile`
   - Build context / build root: `worker/analytics-snapshot`
4. **Networking**: add port `8080` (HTTP) and enable **Public** — Northflank
   gives you a URL like `https://<service>--<project>.code.run`.
5. **Resources**: choose a plan with **≥1 GB RAM** (e.g. `nf-compute-50` or
   larger). The smallest plans will OOM Chromium.
6. **Runtime**: 1 instance, scale-to-zero **off**.
7. **Health check**: HTTP, path `/healthz`, port `8080`.
8. **Environment**: add the four variables above (use a **Secret group** so the
   session/secret values aren't shown in plaintext logs).
9. **Deploy**, then open `https://<public-url>/healthz` → expect `{"ok":true}`.

CLI alternative (`npm i -g @northflank/cli`, then `northflank login`): you can
script the same via `northflank create service` with a `--dockerfile` build, but
the dashboard is faster for a one-off.

Your worker base URL is the public URL; the Vercel side points at it **with the
`/snapshot` path** (step 3).

#### Fly.io (alternative)

A `fly.toml` is included:

```bash
cd worker/analytics-snapshot
fly launch --no-deploy
fly secrets set \
  SNAPSHOT_WORKER_SECRET="<random-long-string>" \
  TELEGRAM_BOT_TOKEN="<same token the site uses>" \
  VERCEL_ANALYTICS_URL="https://vercel.com/<team>/<project>/analytics" \
  VERCEL_STORAGE_STATE_B64="<from step 2>"
fly deploy
```

Worker URL is then `https://<app-name>.fly.dev`. `fly.toml` is Fly-only — other
hosts ignore it and read the Dockerfile directly.

Either way, confirm `GET /healthz` on the public URL returns `{"ok":true}`.

### 2. Capture a Vercel session

Run locally — it opens a browser so you can log in by hand (2FA/SSO can't be
scripted):

```bash
cd worker/analytics-snapshot
npx playwright install chromium         # first time only
VERCEL_ANALYTICS_URL="https://vercel.com/<team>/<project>/analytics" \
  npm run capture-session
```

Log in, open the analytics view, press Enter. It prints
`VERCEL_STORAGE_STATE_B64` — set it as a worker secret (step 1) and redeploy.

The session expires after a while; when it does the bot replies "session
expired" — re-run this and redeploy.

### 3. Configure the Vercel side

Set these env vars on the Vercel project (Production + Preview) and redeploy:

| Var | Value |
|-----|-------|
| `TELEGRAM_WEBHOOK_SECRET` | random string; also passed to setWebhook below |
| `SNAPSHOT_WORKER_URL` | `https://<worker-host>/snapshot` |
| `SNAPSHOT_WORKER_SECRET` | must equal the worker's `SNAPSHOT_WORKER_SECRET` |

`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` already exist (used for lead alerts).
`TELEGRAM_CHAT_ID` doubles as the owner allowlist — only that chat can run the
command. `UPSTASH_REDIS_REST_URL` / `_TOKEN` must be set for the 1/min limit to
apply (without them it fails open / unthrottled).

### 4. Register the Telegram webhook (production)

A bot has **one** webhook. Registering points it at your production site; the
outbound lead-alert flow is unaffected (that doesn't use a webhook).

Generate a strong secret and use the **same value** here and in Vercel's
`TELEGRAM_WEBHOOK_SECRET` (step 3):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Register the webhook against your **canonical production domain** (custom domain
if you have one, else the production `*.vercel.app` URL — not a preview URL):

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<your-production-domain>/api/telegram",
    "secret_token": "<same as TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["message"]
  }'
```

Expect `{"ok":true,"result":true,"description":"Webhook was set"}`.

Verify:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

- `url` should be your production URL.
- `pending_update_count` should be low / 0.
- `last_error_message` should be absent. If present it names the problem —
  usually **401** (secret mismatch between Vercel and `setWebhook`) or **404**
  (wrong URL, or the route isn't deployed yet).

Rollback / remove the webhook:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/deleteWebhook"
```

> `secret_token` must be 1–256 chars from `A–Z a–z 0–9 _ -` (a hex string
> qualifies). To test on a preview URL without disturbing production, use a
> throwaway bot token from `@BotFather` — one webhook per bot means a preview
> `setWebhook` would otherwise repoint your real bot.

### 5. Test

Send `/analytics` to the bot. You should get "Generating…" then the screenshot.

## Notes / limitations

- **1 snapshot/minute** per chat, enforced in `app/api/telegram/route.ts` via
  Upstash. Each run launches a browser context on the worker.
- **Session expiry is the main failure mode.** The worker detects a login
  redirect and tells you instead of sending a screenshot of the login page.
- **Only the owner chat** (`TELEGRAM_CHAT_ID`) is honoured; other chats are
  silently ignored.
- **The stored session grants dashboard access** — keep
  `VERCEL_STORAGE_STATE_B64`, `SNAPSHOT_WORKER_SECRET`, and
  `TELEGRAM_WEBHOOK_SECRET` secret. Rotate by re-capturing / regenerating.
- The bot token is shared with the existing lead-alert flow; no second bot
  needed.
