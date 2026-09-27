# Self-Service Article Publishing — In-App Admin

**Project:** swimkidssg — Next.js 16 / React 19 / TypeScript marketing site, deployed on Vercel.
**Status:** Plan. Revised to fold in three correctness fixes (MDX build-break guard, GitHub-API
reads for admin, route-handler auth) identified during codebase review.

---

## 1. Context

Today a blog article only appears on swimkidssg.com when a new `.mdx` file lands in
`content/posts/` in the git repo. Posts are read from the filesystem at build time
(`lib/mdx.ts` → `getAllPosts`/`getPostBySlug`, rendered `force-static` in `app/blog/`). Every
new article therefore requires a git commit/PR by Jeremy.

**Goal:** let a non-technical author create and edit articles themselves — signing into an
admin page, writing in a rich-text editor, adding images, and publishing — without Jeremy
making a PR. A new/edited post commits straight to `main`, which triggers Vercel's auto-deploy,
so the article goes live on its own in ~1 minute. Jeremy's only involvement is one-time setup
(a token + env vars) and an optional Telegram heads-up when something publishes.

**Key architectural fact:** the deployed app cannot run git, and the Vercel filesystem is
read-only at runtime. So "write to the repo" is done by calling the GitHub API from a server
route, using a repo-scoped token. The repo already has every other building block we need
(Vercel Blob, Basic-auth pattern, rate limiting, Turnstile, Telegram notify).

---

## 2. Three fixes folded into this revision

These are correctness issues that a naïve version of this plan would hit in production. Each is
now part of the design below, not an afterthought.

| # | Problem | Why it bites | Fix (in this plan) |
|---|---|---|---|
| **1** | A single invalid post breaks the **entire** static build | Posts are `.mdx` compiled as JSX. Author text with `{`, or a stray `<` (e.g. `kids < 5`, `I <3 swimming`, `save {money}`) throws at `next build`. Because the blog is `force-static` with `generateStaticParams`, one bad post fails the whole build → Vercel keeps the last good deploy → author sees "Published ✓" but nothing goes live, and every later post is blocked too. | **Preflight-compile the MDX in the publish route** and reject on failure, before any commit. Plus escape/neutralize MDX-significant characters. This is the authoritative guardrail; heading/slug checks are secondary. |
| **2** | Admin `getAllPosts()`/`getPostBySlug()` at runtime is unreliable on Vercel | Those helpers do `fs.readdirSync(process.cwd()/content/posts)`. Fine for the static blog (read at build). But the admin dashboard/editor call them at **runtime** (`force-dynamic`). Next.js output-file-tracing is static; a computed `readdirSync` path is often **not** bundled into the serverless function → throws in prod (works locally). Also stale: the bundle reflects the last deploy, so a just-published post won't appear for ~1 min. | **Admin listing and edit-load read from the GitHub API** (the real source of truth), not `lib/mdx`. Slug-uniqueness checks then hit live data. `lib/mdx` stays untouched for the public blog. |
| **3** | `timingSafeEqual` in `middleware.ts` won't run on the Edge runtime | `node:crypto` (`timingSafeEqual`, `Buffer`) isn't available in Edge middleware, which is Next's default. Node middleware exists in Next 16 but is finicky. | **No middleware.** Gate each `/api/admin/*` Node route handler with the exact `isAuthorized` from `app/api/coach-file/route.ts`, plus a server-side auth check in the `/admin` page. Same protection, no Edge-crypto risk, reuses the proven pattern. |

---

## 3. Approach

A password-protected `/admin` dashboard inside the existing Next app:

- **Auth** — Basic-auth gate reusing the constant-time-compare `isAuthorized` pattern from
  `app/api/coach-file/route.ts`, applied **inside each Node route handler and the `/admin`
  server page** (fix #3 — no middleware). New env `ADMIN_PASSWORD`. Failed attempts throttled
  with the existing `authLimiter`.
- **Dashboard** — lists existing posts (create new / edit existing), reading metadata **via the
  GitHub Contents API** (fix #2), not `getAllPosts()`.
- **Editor** — a rich-text (WYSIWYG) editor whose output is Markdown matching the existing
  `.mdx` body format, plus metadata fields (title, author, date, excerpt, cover image).
- **Format + compile check layer** — a shared validator run client-side (instant feedback) and
  server-side (authoritative), **plus a server-side MDX compile** (fix #1) that must succeed
  before publish.
- **Images into the repo** — uploaded images committed to `public/blog/<slug>/` in the same
  commit as the post, referenced by `/blog/<slug>/<file>` paths.
- **Publish** — a server route validates, compiles, then makes a single commit to `main` via
  the GitHub Git Data API (post + images atomically → one deploy). Optional Telegram ping.

Publishing straight to `main` (not a PR) is the deliberate choice that removes Jeremy from the
loop; the Telegram notice + an in-app unpublish (see §7) let a post be pulled without a git op.

---

## 4. Files to create

### `lib/github.ts` — GitHub API helper (fetch, no new SDK dep)
- `listPosts()` — GET `content/posts/` via the Contents API; parse frontmatter for the
  dashboard. **Source of truth for the admin UI** (fix #2).
- `getPostRaw(slug)` — GET one file's raw content (frontmatter + body + blob SHA) for the edit
  screen (fix #2). Returns the SHA needed for a correct update commit.
- `getFileSha(path)` — current blob SHA for edits.
- `commitFiles({ files, message, baseSha? })` — atomic multi-file commit via Git Data API:
  get ref → get base commit/tree → create blobs (utf-8 for `.mdx`, base64 for images) →
  create tree → create commit → update `refs/heads/main`. **Handles the non-fast-forward 409**
  (re-fetch head, retry once) so two authors — or an author racing Jeremy — don't clobber.
  Uses `POSTS_GITHUB_TOKEN` and `GITHUB_REPO` (`jeremygmc1/swimkidssg`).

### `lib/post-validation.ts` — shared validator (client + server)
Checks: title non-empty & ≤ ~120 chars; slug kebab-case, unique (or unchanged when editing —
uniqueness checked against `listPosts()`, i.e. live GitHub data, fix #2); date `YYYY-MM-DD`;
excerpt present (~30–200 chars); body non-empty; body headings use `##`/`###` not `#`. Returns
`{ ok, errors[] }`. Derived from the conventions across `content/posts/*.mdx`.

### `lib/mdx-compile.ts` — publish-time compile guard (fix #1)
- `assertCompiles(body, components)` — compiles the post body with the **same** MDX pipeline the
  blog uses (`compileMDX` from `next-mdx-remote/rsc`, or `@mdx-js/mdx`'s `compile`) against the
  known components (`{ Carousel }`). Throws a structured error (line/column, message) if it fails.
- `neutralizeMdx(body)` — escape or reject MDX-hostile input: bare `{` not part of a known
  expression, and stray `<` that isn't a known component tag. Run before compile so the common
  cases (`< 5`, `I <3`, `{money}`) never reach the build. Author-created posts are Markdown-only;
  MDX components like `<Carousel>` stay a developer feature.

### `lib/frontmatter.ts`
Build the post file string from fields using gray-matter's `matter.stringify` (already a
dependency) so serialization matches how posts are parsed; auto-set `lastEdited` on edits.

### `app/admin/page.tsx` — dashboard
Server component. **Auth-gates via `isAuthorized`** (fix #3). Lists posts via `lib/github.ts`
`listPosts()` (fix #2). "New article" button + edit links. `export const dynamic = 'force-dynamic'`.

### `app/admin/editor/[[...slug]]/page.tsx` — editor screen
Client component wrapper. Loads existing content when editing via the GET admin route
(`getPostRaw`, fix #2), never `getPostBySlug` at runtime.

### `components/ArticleEditor.tsx` — client editor
Metadata inputs + WYSIWYG body + image upload + live validation (`lib/post-validation.ts`) +
Publish button (POSTs to `/api/admin/publish`). Reuses `FileUploadField`/blob patterns as
reference; here uploads target the repo-image flow.

### `app/api/admin/publish/route.ts` — Node route handler
1. **`isAuthorized`** gate + `authLimiter` (fix #3).
2. Authoritative `lib/post-validation.ts`.
3. **`neutralizeMdx` + `assertCompiles`** — reject with a clear author-facing error if the body
   won't build (fix #1). *No commit happens unless the MDX compiles.*
4. `matter.stringify` → `lib/github.ts` `commitFiles` (post + any images in one commit).
5. `notifyNewLead`-style Telegram ping via `lib/notify.ts`.

### `app/api/admin/upload-image/route.ts` — Node route handler
`isAuthorized` gate. Accepts an image, enforces type (png/jpg/webp) and size (~8 MB, matching
the blob-upload limit), returns its intended repo path (`public/blog/<slug>/<file>`) + base64
payload staged for the single publish commit.

### `app/api/admin/post/[slug]/route.ts` — Node route handler
`isAuthorized` gate. GET raw post (frontmatter + body + SHA) for the edit screen via
`getPostRaw` (fix #2).

### `app/api/admin/delete/route.ts` — Node route handler (unpublish; see §7)
`isAuthorized` gate. Removes `content/posts/<slug>.mdx` (and its `public/blog/<slug>/` images)
in one commit so an author can pull a post without a git op.

---

## 5. Editor choice

Use a WYSIWYG that serializes to Markdown so output stays identical in shape to the hand-written
`.mdx` files.

- **Recommended: TipTap** (`@tiptap/react` + `@tiptap/starter-kit` + `tiptap-markdown`) —
  toolbar for bold/headings/lists/links, `.storage.markdown.getMarkdown()` yields the body.
- **Lighter alternative: `@uiw/react-md-editor`** (toolbar + live preview, markdown-native).

Either way the compile guard (fix #1) is the real safety net, not the editor. A pure WYSIWYG
cannot emit MDX components like `<Carousel>`; those stay developer-only — acceptable for a
non-technical author, and consistent with the Markdown-only publish path.

---

## 6. Images

Uploaded during editing; committed to `public/blog/<slug>/<filename>` in the **same commit** as
the post (via `commitFiles`), so no orphaned assets and one deploy. Cover image → frontmatter
`coverImage: /blog/<slug>/<file>`; inline images referenced by the same path in the Markdown
body. Enforce type (png/jpg/webp) and size (~8 MB, matching the blob-upload limit). Deleting a
post also deletes its image folder (§4, delete route).

---

## 7. Rollback / unpublish

The Telegram ping tells Jeremy when something publishes, but "pull it down" must not require a
git op he alone can do — that would reintroduce him into the loop the goal removes. So the admin
dashboard exposes **delete/unpublish** (`app/api/admin/delete/route.ts`), which commits the file
removal and its images. Preview before publish (render `MDXRemote` from the draft) is a
recommended add so authors catch render issues before going live, not after.

---

## 8. Env vars Jeremy sets once (his only per-setup involvement)

| Var | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Shared password the author signs in with. |
| `POSTS_GITHUB_TOKEN` | Fine-grained PAT scoped to `jeremygmc1/swimkidssg`, **Contents: Read and write** only. Server-only; never shipped to the client. |
| `GITHUB_REPO=jeremygmc1/swimkidssg` | Target repo (or hardcode as default). |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | *(already present)* reused for the publish ping. |
| `UPSTASH_*` | *(already present)* reused for rate limiting. |

Add the new vars to `.env.local.example` too, matching the existing explicit-naming convention.

---

## 9. Verification

1. `npm run dev`, visit `/admin` → Basic-auth prompt; wrong password rejected, right password
   admits (**auth enforced in the route/page, not middleware — fix #3**).
2. Dashboard lists posts **fetched from GitHub** (fix #2); confirm it works when run as a
   built/served app, not just `next dev`.
3. Create a new article: the validation layer blocks a bad slug / missing excerpt / `#` H1 and
   explains why. **Type `kids < 5` and `{money}` in the body → publish is rejected with a clear
   message, not a broken build (fix #1).**
4. Publish a valid post (against a scratch branch first — point `commitFiles` at it) → one commit
   lands with the `.mdx` under `content/posts/` and the image under `public/blog/<slug>/`,
   correctly formatted (diff against `content/posts/welcome-to-swimkidssg.mdx`).
5. Edit an existing post → the update commit carries the right SHA (from `getPostRaw`), bumps
   `lastEdited`, and doesn't duplicate the file.
6. Two rapid publishes / a concurrent push → `commitFiles` resolves the 409 and both land.
7. Delete a post from the dashboard → file and its image folder removed in one commit.
8. `npm run build` / `npm run typecheck` / `npm run lint` pass.
9. On the real Vercel deploy: publish once → article appears at `/blog/<slug>` after auto-deploy,
   and Jeremy gets the Telegram ping.

---

## 10. Notes / trade-offs

- **Direct-to-main is intentional** (no PR, no Jeremy). If a review step is ever wanted,
  `commitFiles` can target a branch + open a PR instead — a one-line change to the commit target.
- **The compile guard (fix #1) is non-negotiable.** It's a property of `.mdx` + static
  generation, not of the editor — any tool that writes MDX carries the same build-break risk. The
  alternative structural fix is a Markdown-only render path for author posts; the compile guard is
  the lower-effort route that keeps one rendering pipeline.
- **Committing images into git** is fine for now; if the blog grows image-heavy, switching
  cover/inline images to the existing Vercel Blob flow later is a contained change.
- **The GitHub token grants repo write** — keep it server-only, behind the rate limiter, and keep
  `ADMIN_PASSWORD` strong.
- **Alternative worth weighing before building:** a git-based CMS (Sveltia, the modern lighter
  Decap) delivers the same outcome via a config file instead of ~10 files of bespoke,
  security-sensitive code — cost is a one-time GitHub OAuth proxy and less control over
  validation. Fix #1 still applies there, since it's about MDX, not the editor.

---

## 11. Risk of breaking the currently-deployed app

The current site keeps serving throughout — **the only way this work takes the public site down is
a failed `next build`, and Vercel freezes on the last good deploy when a build fails** (site stays
up, but stops updating and the author sees no error). So the risks below are ranked by likelihood
of a broken or frozen deploy, with the mitigation that keeps each contained.

| Risk | How it breaks things | Likelihood | Mitigation |
|---|---|---|---|
| **New editor deps incompatible with React 19 / Next 16** | TipTap or `@uiw/react-md-editor` peer-dep conflict → `npm install`/`npm run build` fails → deploy frozen | Medium | Verify the chosen editor supports React 19 **before** merging; pin exact versions; confirm `npm run build` is green in CI on the feature branch. This is the single most likely breakage. |
| **Type/lint error in the ~10 new files** | `next build` runs `tsc`/eslint → any error fails the whole build → deploy frozen | Medium | The existing CI gates (typecheck/lint/build) catch this on the PR before it reaches `main`. Do not bypass them. |
| **Secret read at module scope** | `const token = process.env.POSTS_GITHUB_TOKEN!` evaluated at import time can fail the build or crash a shared chunk | Low–Med | Read env **inside** the request handler, mirror the fail-soft pattern in `lib/ratelimit.ts`/`lib/notify.ts`. Never `!`-assert at module top level. |
| **A published post compiles but renders wrong** | Cosmetic only — live, ugly, not "broken." No build failure. | Medium | Preview-before-publish (§7). Not a deploy risk; a quality risk. |
| **`next.config.ts` image config touched** | It currently sets `dangerouslyAllowSVG` + a strict CSP. Editing it for editor image previews could weaken CSP site-wide or break `next/image` on public pages | Low | Author images are local `/blog/...` paths → **no `remotePatterns` change needed**. Leave `next.config.ts` alone. |
| **Global layout/nav edited to add an `/admin` link** | A change to `app/layout.tsx` / `Navbar` touches every page | Low | Don't add a public nav link. Reach `/admin` by direct URL. Zero change to shared layout. |
| **Basic-auth on the `/admin` *page* (not just APIs)** | With middleware dropped (fix #3), a server component can't cleanly emit a 401 + `WWW-Authenticate` challenge, so naïve gating either fails to prompt or leaks a rendered shell | Med (impl. correctness) | Make `/admin` a shell that renders nothing sensitive and fetches all data/actions from **authed `/api/admin/*` route handlers** — the browser's Basic-auth prompt fires on the first 401 from those. Secrets and post content never live in the page payload. |
| **Concurrent publish races a Jeremy push to `main`** | Non-fast-forward ref update → lost write or failed publish | Low | `commitFiles` 409 retry (already in §4). |
| **Runtime `fs` reads in admin** | Covered by fix #2 — admin reads via GitHub API, not `fs` | — | Already designed out. |

**What is _not_ at risk:** the public blog rendering path (`lib/mdx.ts`, `app/blog/**`,
`Carousel`) is untouched by this feature. All new code lives under `/admin`, `/api/admin`, and new
`lib/*` modules imported only by those. Route-level code-splitting keeps the editor bundle off
public pages. **Not using middleware (fix #3) also removes the highest-blast-radius failure mode** —
a broad middleware `matcher` mistakenly 401-ing `/` and static assets.

### Pre-cutover gate (all must pass on the feature branch before merge to `main`)
1. `npm run build` green **with the new editor dep installed** (proves peer-dep + bundle).
2. `npm run typecheck` and `npm run lint` green.
3. A test publish pointed at a **scratch branch** (not `main`) lands a correct commit and the
   resulting build is green.
4. Visit `/blog` and 2–3 existing posts on the branch preview → byte-for-byte identical to prod
   (proves the public path is untouched).

---

## 12. Migrating the 7 existing articles into the new system

### 12.1 What migrates cleanly, and what doesn't

| Posts | Body | New system fit |
|---|---|---|
| `welcome-to-swimkidssg`, `water-safety-tips-for-kids`, `swimming-levels-explained` | Pure Markdown, no MDX | **Fully editable as-is.** Open, edit, publish — no conversion. |
| `9-signs…`, `confident-in-water…`, `private-vs-group…`, `why-your-child-isnt-progressing…` | Each has one `<Carousel><img …/></Carousel>` at the top | **Will not round-trip.** A Markdown-only editor can't emit `<Carousel>`; `neutralizeMdx` (fix #1) would reject/strip the JSX, silently dropping the image on save. |

Facts that make migration easy either way: all four images already live at `/blog/<slug>/<file>`
(the exact convention the new system uses), each Carousel holds **exactly one** image, and
frontmatter is already uniform (`title/date/author/lastEdited/excerpt`, all quoted → no
MDX-hostile characters). No `coverImage` field is in use yet, and the blog template does not
render one today.

### 12.2 Two migration strategies (ranked)

**Option A — Additive, no content migration (recommended for launch).**
The new system only *creates* new Markdown posts and *edits* the 3 pure-Markdown ones. The 4
Carousel posts stay developer-managed via git.
- Editor's edit-load step detects JSX (`/<[A-Z]/` or `<Carousel`) in the body and, if present,
  **blocks editing** with: "This post contains a photo gallery and is edited by a developer."
  The 3 clean posts open normally.
- Risk to live content: **zero** — nothing about the existing posts changes.
- Cost: the author can't self-edit 4 legacy posts. Acceptable, since the goal is *new* articles.

**Option B — Full unification (do later, only if author must own all 7).**
Convert the 4 Carousels to a first-class cover-image model so every post is editable through one
path.
- Add a `coverImage` (+ optional `coverCaption`) render block to `app/blog/[slug]/page.tsx`
  (an optimized `next/image` + `<figcaption>`), rendered above the body.
- Rewrite each of the 4 posts: move the single image to `coverImage:` / `coverCaption:` in
  frontmatter and delete the `<Carousel>` block from the body. Bodies become pure Markdown.
- The editor's image field then reads/writes `coverImage`; `<Carousel>` remains a
  developer-only tool for genuine multi-image galleries (unchanged, still supported).
- Risk: touches the **live** blog template and 4 **live** posts. Visual diff required — the
  captioned single image should look equivalent to today's one-slide carousel; the arrows/dots
  simply disappear (there was only ever one slide).
- Cost/benefit: modest effort, and it removes the "some posts are magic" split. Not needed to
  hit the stated goal.

**Recommendation:** ship **Option A** with the new system; schedule **Option B** as a follow-up
only if self-editing the legacy 4 becomes a real need.

### 12.3 Execution — Option A (safe, no live-content change)
1. Ship the admin feature (passing the §11 pre-cutover gate).
2. Confirm the JSX-detection guard blocks the 4 Carousel posts and opens the 3 clean ones.
3. Author test: edit `swimming-levels-explained` (clean) end-to-end → one commit, correct
   frontmatter, `lastEdited` bumped, no duplicate file, deploy green, live page correct.
4. Done. Existing content is byte-identical; only editability is added.

### 12.4 Execution — Option B (if/when chosen), each step reversible
1. On a feature branch, add `coverImage`/`coverCaption` rendering to `app/blog/[slug]/page.tsx`.
2. Convert **one** post first (e.g. `9-signs…`): image → frontmatter, remove `<Carousel>`.
3. Preview the branch: the converted post vs prod — confirm visual equivalence and that the
   image still optimizes via `next/image`.
4. If good, convert the remaining 3 in the same PR; diff each.
5. Merge → one deploy re-renders all four. **Rollback** = revert the PR (posts and template move
   back together; images never moved, so nothing to clean up).
6. `<Carousel>` component stays in the repo for future multi-image posts.

### 12.5 Rollback for the whole feature
Because the feature is additive and isolated (§11), disabling it is: unset `ADMIN_PASSWORD` /
`POSTS_GITHUB_TOKEN` (admin routes then refuse — fail-soft), or revert the feature PR. Neither
affects the public blog, which never depended on any of it.
