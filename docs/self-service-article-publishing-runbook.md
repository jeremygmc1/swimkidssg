# Phase 4 Runbook — Going Live with Self-Service Publishing

**Who runs this:** Jeremy (needs Vercel + GitHub access).
**Goal:** verify the `/admin` publishing flow on a real deploy, safely, then switch it to
publish straight to `main`.
**Time:** ~15 minutes. **Prerequisite:** the feature branch is deployed to a Vercel Preview (the
PR creates one automatically).

The design intentionally lets you test against a **scratch branch first**, so the very first real
commit can't touch the live site. You only point it at `main` once you've seen it work.

---

## Step 0 — Create the GitHub token (once)

GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token:

- **Repository access:** Only select repositories → `jeremygmc1/swimkidssg`
- **Permissions:** Repository permissions → **Contents: Read and write** (that one only)
- **Expiration:** your choice
- Generate → copy the token (starts with `github_pat_…`). You won't see it again.

---

## Step 1 — Create the scratch branch (safety net for the test)

So the first publish commits somewhere harmless. In GitHub:

- Branches → New branch → name it `publish-test`, based on `main`.

(Or locally: `git branch publish-test main && git push origin publish-test`.)

---

## Step 2 — Set env vars on the Preview deployment

Vercel → Project → Settings → **Environment Variables**. Add these for the **Preview**
environment (you can scope them to Preview only for now):

| Variable | Value |
|---|---|
| `ADMIN_PASSWORD` | a strong password you choose |
| `POSTS_GITHUB_TOKEN` | the token from Step 0 |
| `POSTS_TARGET_BRANCH` | `publish-test` &nbsp;← **makes publishing go to the scratch branch** |
| `GITHUB_REPO` | `jeremygmc1/swimkidssg` (optional; this is the default) |

`TELEGRAM_*` and `UPSTASH_*` are already set and reused.

Then **redeploy the Preview** so it picks up the new vars (Deployments → ⋯ → Redeploy, or push
any commit).

---

## Step 3 — Smoke-test on the Preview (nothing hits the live site yet)

Open the Preview URL + `/admin` (e.g. `https://<preview>.vercel.app/admin`).

1. **Sign in** — wrong password is rejected; your `ADMIN_PASSWORD` gets in.
2. **Dashboard loads** and lists the 7 existing posts (proves the GitHub *read* path + token).
3. **Create a test article:**
   - Title `Publishing Test` (slug auto-fills `publishing-test`), pick a date, add an author.
   - Write a short body with a heading and a bullet list.
   - **Deliberately try to break it:** type `kids under < 5` and `save {money}` and a `#` heading.
     → The editor/publish should *not* silently fail; the `#`/short-excerpt cases show validation
     errors, and the `<`/`{` text publishes as literal text (the guard escapes it).
   - Add a cover image (PNG/JPG/WebP).
4. **Publish.** You should get the success screen with a **"View commit"** link.
5. **Check the commit** (it's on `publish-test`, not `main`):
   - One commit contains `content/posts/publishing-test.mdx` **and** the image under
     `public/blog/publishing-test/`.
   - Open the `.mdx` and diff it against an existing post
     (`content/posts/welcome-to-swimkidssg.mdx`) — frontmatter shape should match
     (title/date/author/lastEdited/excerpt), body is clean Markdown, and any `<`/`{` you typed
     appears backslash-escaped (`\<`, `\{`).
6. **Edit test:** back to dashboard → Edit `Publishing Test` → change a word → Update.
   Confirm a second commit on `publish-test` updates the same file (no duplicate) and bumps
   `lastEdited`.
7. **Legacy-post guard:** click Edit on one of the four Carousel posts (e.g.
   `9-signs-your-child-may-be-afraid-of-water`). It should show "This post has a photo gallery…"
   and refuse to open — expected (Option A).
8. **Unpublish test:** dashboard → Unpublish `Publishing Test`. Confirm a commit on
   `publish-test` removes the `.mdx` and the image folder.
9. **Telegram:** confirm you got a ping for the publish/update/unpublish.

If anything fails here, nothing on the live site changed — the scratch branch absorbed it.
Note what failed and stop; it's fixable before go-live.

### Clean up the scratch branch
Delete the `publish-test` branch in GitHub (it only holds test commits).

---

## Step 4 — Go live

Once Step 3 is clean:

1. **Merge the PR** into `main` (this ships the `/admin` code to production).
2. In Vercel, set the same env vars for the **Production** environment:
   - `ADMIN_PASSWORD`, `POSTS_GITHUB_TOKEN` (and optionally `GITHUB_REPO`).
   - **Do _not_ set `POSTS_TARGET_BRANCH`** in Production — leaving it unset makes publishing
     target `main` (which is what you want live).
3. Redeploy Production if needed.
4. **One real publish:** open `https://swimkidssg.com/admin`, publish a genuine short post →
   after the auto-deploy (~1 min) confirm it appears at `/blog/<slug>` and you got the Telegram
   ping. Edit or unpublish it if it was only a test.

That's go-live. From here the author publishes on their own; your only ongoing involvement is the
optional Telegram heads-up.

---

## Rollback / kill switch

Everything is additive and isolated — the public blog never imports any of it.

- **Turn the feature off:** remove `ADMIN_PASSWORD` (locks the admin) or `POSTS_GITHUB_TOKEN`
  (publishing fails safe with a clear message) in Vercel. The public site is unaffected.
- **Undo a bad post fast:** use **Unpublish** in `/admin`, or revert the post's commit on `main`.
- **Undo the whole feature:** revert the merge PR. The public blog keeps working because it never
  depended on the admin code.

---

## What to watch on the first few real publishes

- A publish triggers a normal Vercel build. If a build ever fails, the site **freezes on the last
  good deploy** (stays up, stops updating). The MDX guard prevents the common cause, but watch the
  first deploys in Vercel to be sure they go green.
- Images are committed into the repo (fine for now). If the blog gets image-heavy later, switching
  to the existing Vercel Blob flow is a contained change.
- Token hygiene: `POSTS_GITHUB_TOKEN` grants repo write — it lives only in Vercel env (server-side),
  never in the client bundle. Rotate it if it's ever exposed; set a calendar reminder if you chose
  an expiry.
