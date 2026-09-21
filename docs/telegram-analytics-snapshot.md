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
                     worker/analytics-snapshot (always-on, e.g. Fly.io)
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
runs on any container host — Fly.io, Google Cloud Run, Render, Railway, or a
small VPS. It needs public HTTPS, port `8080`, and **≥1 GB RAM** for Chromium.

Capture a Vercel session first (step 2) so `VERCEL_STORAGE_STATE_B64` is ready
before you set secrets.

The four env vars every host needs:

| Var | Value |
|-----|-------|
| `SNAPSHOT_WORKER_SECRET` | random long string; must match Vercel's copy (step 3) |
| `TELEGRAM_BOT_TOKEN` | same token the site uses |
| `VERCEL_ANALYTICS_URL` | `https://vercel.com/<team>/<project>/analytics` |
| `VERCEL_STORAGE_STATE_B64` | from step 2 |

#### Option A — Fly.io (always-on)

Keeps the browser warm; `/analytics` returns in ~5–8s. A `fly.toml` is included.

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

Worker URL is e.g. `https://swimkidssg-analytics-snapshot.fly.dev`.

#### Option B — Google Cloud Run

Cheapest at low volume, but read the CPU caveat below — it dictates the
`--min-instances` / `--no-cpu-throttling` choice.

Prereqs: the `gcloud` CLI, a GCP project with billing, and the APIs enabled:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
```

Store the two real secrets in Secret Manager (keeps them out of shell history and
the service config; the other two vars are not sensitive):

```bash
printf '%s' '<random-long-string>'  | gcloud secrets create snapshot-worker-secret --data-file=-
printf '%s' '<bot token>'           | gcloud secrets create telegram-bot-token   --data-file=-
printf '%s' '<base64 from step 2>'  | gcloud secrets create vercel-storage-state  --data-file=-
```

Deploy (builds from the Dockerfile via Cloud Build — run from the worker dir):

```bash
cd worker/analytics-snapshot
gcloud run deploy swimkidssg-analytics-snapshot \
  --source . \
  --region asia-southeast1 \
  --port 8080 --memory 1Gi --cpu 1 \
  --min-instances 1 --max-instances 1 \
  --no-cpu-throttling \
  --allow-unauthenticated \
  --set-env-vars VERCEL_ANALYTICS_URL="https://vercel.com/<team>/<project>/analytics" \
  --set-secrets SNAPSHOT_WORKER_SECRET=snapshot-worker-secret:latest,TELEGRAM_BOT_TOKEN=telegram-bot-token:latest,VERCEL_STORAGE_STATE_B64=vercel-storage-state:latest
```

If deploy fails on secret access, grant the runtime service account the accessor
role (it usually offers to do this for you):

```bash
PN=$(gcloud projects describe "$(gcloud config get-value project)" --format='value(projectNumber)')
for s in snapshot-worker-secret telegram-bot-token vercel-storage-state; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${PN}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

The deploy prints a Service URL like
`https://swimkidssg-analytics-snapshot-xxxx.a.run.app`.

`--allow-unauthenticated` exposes the URL publicly, which is fine: `/snapshot` is
guarded by `SNAPSHOT_WORKER_SECRET` at the app layer, and Vercel calls it with
that secret.

> **Cloud Run CPU caveat — do not skip.** This worker returns `202` immediately
> and then does the screenshot *after* the response. Cloud Run's default gives an
> instance CPU only while a request is in flight, so that background work would be
> frozen and the photo would never send. `--no-cpu-throttling` (CPU always
> allocated) fixes it. Combined with `--min-instances 1` this is effectively
> always-on (~$10–15/mo) — at which point Fly.io is cheaper for the same warmth.
> True scale-to-zero (`--min-instances 0`) is unreliable here: the instance can
> be reclaimed before the post-`202` screenshot finishes. Only use `0` if you
> first change the worker to finish the screenshot *before* responding.

#### Any other host

Point it at `worker/analytics-snapshot/Dockerfile` with the build context set to
that folder, set the four env vars, keep one instance running, and use `/healthz`
as the health check. `fly.toml` is Fly-only; other hosts read the Dockerfile.

After deploying, confirm `GET /healthz` on the public URL returns `{"ok":true}`.
Your `SNAPSHOT_WORKER_URL` for step 3 is that URL **plus `/snapshot`**.

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
