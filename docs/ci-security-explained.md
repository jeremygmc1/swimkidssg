# CI Security, Explained — A Teaching Companion

This is the "why" behind [`ci-security-plan.md`](./ci-security-plan.md). The plan tells you
*what* to build; this document teaches *what each piece means* and *why it belongs in the
pipeline*. Read it top to bottom the first time — each section builds on the last. No prior
security background assumed.

---

## 0. First principle: shift left

Bugs are cheapest to fix the moment they're written and most expensive after they ship.
A security hole caught in a pull request costs a code review comment; the same hole caught
in production costs an incident, leaked data, and lost trust.

**"Shift left"** means moving security checks *earlier* — leftward on the timeline from
`write code → review → merge → deploy → run`. CI/CD is where we do it, because CI runs
automatically on every change, so nobody has to *remember* to run the checks.

The whole plan is one idea applied five ways: **let a robot look for a specific class of
problem on every change, before a human is on the hook for it.**

---

## 1. The vocabulary (say these out loud once)

| Term | Plain meaning | The one-line intuition |
|---|---|---|
| **CI** | Continuous Integration | "Every change gets built and checked automatically." |
| **CD** | Continuous Delivery/Deployment | "Every change that passes can be shipped automatically." |
| **SAST** | Static Application Security Testing | "Read the source code and spot dangerous patterns — *without running it*." |
| **DAST** | Dynamic Application Security Testing | "Poke the *running* app over HTTP like an attacker would." |
| **SCA** | Software Composition Analysis | "Check the third-party libraries you didn't write for known holes." |
| **Secret scanning** | — | "Catch passwords/keys accidentally committed to git." |
| **IaC scanning** | Infrastructure-as-Code scanning | "Check config files (workflows, deploy config) for insecure settings." |
| **SARIF** | Static Analysis Results Interchange Format | "A standard JSON format so every scanner's findings land in one inbox." |
| **Gate** | — | "A check that can *block* a merge if it fails." |

### The core distinction: SAST vs DAST

This trips up everyone at first, so here it is concretely.

- **SAST is white-box, from the inside.** It has your source code but the app isn't
  running. Think of it as a **spell-checker for security** — it reads
  `app/api/contact/route.ts` and reasons: "this value came from `req.json()` (attacker
  controlled) and flows into a database query with no validation → possible injection."
  - *Strength:* sees every code path, points at the exact file and line, runs in seconds.
  - *Blind spot:* doesn't know what actually happens at runtime, so it can raise
    **false positives** (flags something that's actually safe) and can't see config/deploy issues.

- **DAST is black-box, from the outside.** It doesn't read your code; it sends real HTTP
  requests to the *deployed* app and watches the responses. Think of it as an
  **automated intruder** — it hits `/api/coach-file` with no password, sends weird payloads
  to `/api/contact`, and checks whether security headers are present.
  - *Strength:* tests the *real* running system — the actual server, headers, auth, and config.
    If it finds a hole, the hole is genuinely reachable (few false positives).
  - *Blind spot:* only sees what it can reach by crawling; can't tell you the exact line to fix.

> **They're complementary, not redundant.** SAST finds the bug in the code; DAST proves
> whether it's exploitable in the deployed reality. Industry-standard pipelines run both.
> Everything else in the plan (SCA, secret scanning, IaC) covers the gaps *neither* of them
> looks at: your dependencies, your credentials, and your configuration.

---

## 2. The layers, one at a time

### 2.1 Base gates — typecheck, lint, build (Phase 1, shipped)

Not "security" tools, but the floor everything else stands on. If code doesn't compile,
a security scanner's output is meaningless. They also catch a surprising share of real bugs.

- **Typecheck** (`tsc --noEmit`) — TypeScript verifies types line up. `--noEmit` means
  "check, but don't produce output files." Catches whole categories of bugs (a `null` where
  a string was expected) before runtime.
- **Lint** (`eslint`) — enforces code-quality and correctness rules. `eslint-config-next`
  adds React/Next-specific rules, some security-adjacent (e.g. flagging risky patterns).
- **Build** (`next build`) — proves the app actually assembles into something deployable.

**Why they're a *gate*:** there's no point running a 10-minute security suite on code that
doesn't even build. Fail fast, fail cheap.

### 2.2 SAST — CodeQL + Semgrep

Two SAST tools because they have different strengths:

- **CodeQL** treats your code as a *database you can query*. GitHub wrote deep security
  queries ("find data flowing from user input to a dangerous sink") that run against it.
  It's slower but does real **taint tracking** — following an attacker-controlled value
  across functions and files. GitHub-native, free for public repos, results in the Security tab.
- **Semgrep** is pattern-matching on steroids — fast, and its community rule packs
  (`p/nextjs`, `p/react`, `p/owasp-top-ten`) know framework-specific footguns. We run it
  **diff-aware** on PRs (`--baseline-commit`) so developers only see problems *their* change
  introduced, not the whole backlog — this is what keeps the tool from being ignored.

**For this repo specifically**, SAST is aimed at the four API routes: unvalidated
`req.json()` bodies, the Basic-Auth comparison in `coach-file`, upload handling in
`blob-upload`, and any `dangerouslySetInnerHTML` in the MDX rendering.

### 2.3 SCA — Dependabot + npm audit + Trivy

You wrote maybe 2,000 lines; you *shipped* hundreds of thousands via `node_modules`. Most
real-world breaches ride in through a vulnerable dependency, not your own code. SCA watches
that surface.

- **Dependabot** (shipped in Phase 1) — GitHub cross-references your `package-lock.json`
  against a vulnerability advisory database and opens PRs to bump vulnerable/outdated
  packages. We **group** patch/minor updates to reduce noise and let CI prove each bump builds.
- **npm audit** — the same idea as a CI *gate*: fail the build on a High/Critical advisory.
- **Trivy** — a second scanner (defence in depth; scanners disagree) that also surfaces an
  SBOM (Software Bill of Materials — the full inventory of what you ship) and licenses.

**Key idea — the lockfile is the source of truth.** `npm ci` (which CI uses) installs
*exactly* what `package-lock.json` pins, so scans are reproducible and an update can't
sneak in unpinned.

### 2.4 Secret scanning — Push Protection + Gitleaks

The `.env.local.example` in this repo lists a Google service-account private key, a blob
token, a Turnstile secret, a Telegram token, and an Upstash token. If any real value lands
in git, **it's compromised forever** — git history is permanent, and deleting the file later
doesn't remove it from past commits. Rotating the leaked credential is the only true fix.

- **GitHub Secret Scanning + Push Protection** (a repo *setting*, not a file) — GitHub
  recognises the *shape* of known credentials (e.g. a Google key) and **blocks the push
  before it lands**. This is the strongest control because it prevents the leak rather than
  reporting it after the fact.
- **Gitleaks** — a CI scanner that checks diffs (and full history on the weekly run) with
  regex/entropy rules, catching custom secret formats GitHub's patterns might miss.

The existing `.gitignore` already excludes `.env.local` / `.env*.local` — this layer is the
safety net for when someone bypasses that.

### 2.5 IaC / config scanning — Trivy config

Your *configuration* can be insecure even when your code is perfect: an over-privileged
workflow token, an unpinned action, a missing security header.

- **Trivy config** reads `.github/workflows/*`, `next.config.ts`, etc. and flags risky settings.
- Two habits matter most here:
  - **Pin actions to a commit SHA** (`uses: actions/checkout@<sha>`) — a mutable tag like
    `@v4` could be repointed at malicious code; a SHA can't.
  - **Least-privilege `permissions:`** — give each workflow the *minimum* token scope. Our
    `ci.yml` declares `permissions: contents: read` for exactly this reason: even if a
    dependency in the build were malicious, the token can't write to the repo.

### 2.6 DAST — OWASP ZAP against the Vercel preview

**ZAP** (Zed Attack Proxy) is the industry-standard free DAST. The clever part is *what* we
point it at: **Vercel builds a fresh preview deployment for every PR** — a real, running,
isolated copy of the app at its own URL. That's a perfect DAST target: real runtime, zero
risk to production or real user data.

- **Baseline scan** (every PR) — *passive*. It crawls the public pages and inspects
  responses: missing/weak security headers, cookie flags, information leaks, CSP issues.
  It doesn't attack, so it's safe to run constantly.
- **Full / API scan** (on `main` + weekly) — *active*. It sends crafted payloads at the API
  routes to probe for injection, auth bypass, and bad error handling. More aggressive, so we
  keep it off the every-PR path.

**Guardrails that matter for this app:**
- Only ever scan the **preview** — never production, and never the third-party services it
  talks to (Google Sheets, Upstash, Telegram).
- The app has **rate limiters** (Upstash) on its routes. If ZAP fires too fast it'll just get
  `429`s and the scan is worthless — so tune ZAP's thread/delay settings to stay under them.
- Tune false positives in `.github/ZAP/rules.tsv` so the report stays trustworthy.

---

## 3. How the pieces fit together in time

The same finding shouldn't nag you five times, and slow scans shouldn't block your PR. So
each tool runs where it pays off:

| When | What runs | Why there |
|---|---|---|
| **Every PR** (fast, blocking) | typecheck · lint · build · Semgrep (diff) · Gitleaks · npm audit · CodeQL | Immediate feedback while the author still has context. Kept under ~5 min via parallel jobs. |
| **PR, preview ready** (non-blocking at first) | ZAP Baseline | Needs the deployed preview to exist first. |
| **Push to `main`** | Full CodeQL · ZAP Full/API · Trivy | Deeper, slower scans off the developer hot path. |
| **Weekly cron** | Full SCA · secret history · ZAP Full | Catches *drift*: a dependency with a CVE **newly disclosed** since you last touched the code. |

That last row is the subtle one: **a dependency you never changed can become vulnerable
overnight** when a new CVE is published. The scheduled scan is how you find out.

---

## 4. Two ideas that make or break adoption

**1. Report first, then gate.** Turn a new scanner on in *warn* mode, clean up the initial
backlog, *then* make it blocking. Flip it to blocking on day one and the first PR drowns in
100 pre-existing findings, everyone learns to click "merge anyway," and the tool is dead.

**2. Hold new code to a higher bar than old code.** Diff-aware scanning ("only show me
what *this change* introduced") means the pipeline stays green on legacy issues while
preventing *new* ones — so the codebase gets strictly better over time without a big-bang
cleanup blocking everyone first.

Both are really the same lesson: **a security tool only works if developers don't route
around it.** Signal-to-noise is the whole game.

---

## 5. Where every finding goes: the Security tab

Every scanner emits **SARIF**, the standard results format, and uploads it to GitHub's
**Security tab**. That gives you one inbox where findings are **deduplicated** (CodeQL and
Semgrep flagging the same line show once), tracked (open/fixed/dismissed), and triaged with
an audit trail — instead of scattered across raw CI logs nobody re-reads.

**Severity policy:** block on **High/Critical**, warn on Medium, log Low/Info. Exceptions
are allowed but must be **documented, owned, and time-boxed** — never a silent suppression.

---

## 6. What Phase 1 (shipped) gives you today

The first PR implements the foundation — deliberately the low-risk, high-value slice:

| File | Layer | What it does |
|---|---|---|
| `.github/workflows/ci.yml` | Base gates | typecheck + lint + build on every PR and push to main, with a read-only token and auto-cancel of superseded runs |
| `.github/dependabot.yml` | SCA (automated) | Weekly PRs to patch vulnerable/outdated npm packages **and** the GitHub Actions themselves |
| `package.json` `typecheck` script | Base gates | Wires `tsc --noEmit` so CI (and you) can run it by name |

**Two manual steps** complete Phase 1 — they're repo *settings*, not files, so they can't be
committed:
1. **Settings → Code security:** enable **Secret Scanning** and **Push Protection**.
2. **Settings → Branches:** add a branch-protection rule on `main` requiring the CI check to
   pass before merge. (Without this, the gate reports but can't actually *block* — this is
   the step that turns CI from advisory into enforced.)

From here, Phases 2–5 layer on the SAST, SCA-gating, and DAST described above — each turned
on in warn mode, cleaned up, then promoted to a gate.
