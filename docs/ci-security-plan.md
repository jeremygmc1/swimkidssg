# CI Implementation Plan — SwimKidsSG

Continuous integration for the SwimKidsSG website, with an emphasis on
industry-standard application security scanning (SAST, DAST, SCA, secret
scanning) appropriate for a **Next.js 16 / Vercel** marketing + lead-capture
site that handles file uploads and personal data.

---

## 1. Context & why this shape

| Fact | CI implication |
|------|----------------|
| Next.js 16 App Router, TypeScript, deployed on **Vercel** | Preview deployments per PR give us a live URL to point DAST at — no separate staging infra needed. |
| API routes: `/api/blob-upload`, `/api/coach-file`, `/api/contact`, `/api/coach` | Real dynamic attack surface: file upload, HTTP Basic Auth, form → Google Sheets write. DAST + API scanning matter. |
| Secrets in play: `GOOGLE_PRIVATE_KEY`, `TELEGRAM_BOT_TOKEN`, `SWIMKIDSSG_READ_WRITE_TOKEN`, `COACH_FILES_PASSWORD` | **Secret scanning is high priority** — a leaked service-account key or blob RW token is a direct compromise. |
| Collects parent + child contact details (Singapore, PDPA applies) | Personal-data handling → treat auth/upload endpoints as sensitive; keep active scans off production. |
| No CI exists today | Green-field: build the foundation and layer security on top. |

**Guiding principles**

- **Shift left**: fast checks (lint, typecheck, SAST) on every PR; heavier
  scans (DAST full, dependency review) gated or scheduled.
- **Never active-scan production.** DAST active scans run against ephemeral
  Vercel **preview** deployments only; production gets passive baseline at most.
- **Everything reports to the GitHub Security tab** via SARIF, so findings are
  triaged in one place with history and dedup.
- **Supply-chain hardening**: pin actions to SHAs, least-privilege
  `GITHUB_TOKEN`, egress-audited runners.

---

## 2. Tooling selection (industry-standard)

| Layer | Tool | Why this one |
|-------|------|--------------|
| **Build/quality** | `tsc --noEmit`, `next lint` (ESLint 9), `next build` | Baseline correctness gate. |
| **SAST** | **CodeQL** (GitHub-native) + **Semgrep** (OWASP + `nextjs`/`react`/`typescript` rulesets) | CodeQL = deep dataflow, native SARIF; Semgrep = fast, framework-aware rules (XSS, SSRF, injection, timing-unsafe auth). |
| **SAST (lint-level)** | `eslint-plugin-security` | Cheap, inline, catches obvious footguns. |
| **Secret scanning** | **Gitleaks** (CI) + **GitHub Secret Scanning + Push Protection** (repo setting) | Two layers: block on push, and full-history sweep in CI. |
| **SCA (deps)** | **GitHub Dependency Review** (PR) + `npm audit`/`osv-scanner` + **Dependabot** | Blocks new vulnerable/incompatible-license deps; Dependabot keeps them patched. |
| **DAST** | **OWASP ZAP** — baseline (passive) on PR previews, full + API scan nightly | The de-facto open-source DAST; SARIF/HTML reports; API scan mode fits our `/api/*` routes. |
| **Supply-chain** | **StepSecurity Harden-Runner** + pinned action SHAs + **SBOM** (Syft/CycloneDX) | Egress control, tamper detection, inventory. |
| **Config/headers** | Security-headers check (part of ZAP baseline) | Validates CSP / HSTS / X-Frame-Options on the deployed site. |

All security jobs upload **SARIF** → GitHub code scanning.

---

## 3. Workflow layout

```
.github/
  workflows/
    ci.yml                 # PR + push: install, typecheck, lint, build (fast gate)
    codeql.yml             # SAST: CodeQL (PR + weekly)
    security-sast.yml      # SAST: Semgrep + gitleaks + eslint-security (PR + weekly)
    dependency-review.yml  # SCA: dependency-review + osv-scanner (PR)
    dast-baseline.yml      # DAST: ZAP baseline vs Vercel preview (PR, non-blocking→blocking)
    dast-full.yml          # DAST: ZAP full + API scan vs preview (nightly schedule)
    sbom.yml               # SBOM generation (release / weekly)
  dependabot.yml           # dep + github-actions ecosystem updates
```

---

## 4. Phased rollout

### Phase 0 — Repo hardening (settings + config-as-code)
- Enable **Secret Scanning + Push Protection** and **Dependabot alerts** in
  repo Security settings.
- Set default workflow token to **read-only**; grant per-job scopes.
- Draft **branch protection** on `main` (required checks added as they go green).
- Commit `.github/dependabot.yml` + `SECURITY.md`.

> **Private-repo caveat.** This repo is **private**, so GitHub-native Secret
> Scanning/Push Protection and CodeQL SARIF-to-Security-tab require paid add-ons
> (**Secret Protection** / **Code Security**). Dependabot, read-only tokens, and
> branch protection are free. If staying free, run the scanners as Actions jobs
> that **fail the build** instead of uploading SARIF. Full breakdown and exact
> commands: **`docs/phase-0-hardening.md`**.

### Phase 1 — Foundation CI (`ci.yml`) — *blocking from day one*
Triggers: `pull_request` + `push` to `main`.
```
jobs:
  build:
    steps:
      - checkout
      - setup-node@20 (cache: npm)
      - npm ci
      - npm run lint          # next lint / eslint
      - npx tsc --noEmit      # typecheck
      - npm run build         # next build must pass
```
Node 20 LTS, npm cache. This is the gate everything else builds on.

### Phase 2 — SAST + secrets (`codeql.yml`, `security-sast.yml`)
- **CodeQL**: `javascript-typescript`, `security-extended` query suite, on PR
  + weekly cron. Autobuild works for this project.
- **Semgrep**: `p/nextjs p/react p/typescript p/owasp-top-ten p/secrets`,
  SARIF upload.
- **Gitleaks**: full-history scan; fail on any finding.
- **eslint-plugin-security**: wired into the existing ESLint config.
- Start **non-blocking (warn)** for one week to clear the backlog, then flip to
  **required**.

> Expected early hits on this codebase — good validation the scanners work:
> the `/api/coach-file` Basic-Auth check uses a **non-constant-time string
> compare** (timing side-channel), and `next.config.ts` sets
> `dangerouslyAllowSVG: true`. Both are legitimate findings to triage.

### Phase 3 — Software Composition Analysis
- **`dependency-review-action`** on PRs: fail on High/Critical CVEs and
  disallowed licenses.
- **`osv-scanner`** / `npm audit --audit-level=high` scheduled weekly.
- **`dependabot.yml`**: `npm` (weekly, grouped) + `github-actions` ecosystems.

### Phase 4 — DAST against Vercel previews (the core ask)
Vercel posts a **preview deployment URL** on every PR. We capture it and aim ZAP
at it — testing real, built, running code without touching production.

- **`dast-baseline.yml`** (PR): waits for the Vercel preview to be ready
  (`patrickedqvist/wait-for-vercel-preview` or the Vercel deployment-status
  webhook), then runs **ZAP Baseline** (passive: headers, cookies, CSP, info
  leaks, outdated JS). Non-blocking first, then blocking on High alerts.
- **`dast-full.yml`** (nightly `schedule`): **ZAP Full Scan** (active) + **ZAP
  API Scan** against a persistent preview/staging URL. The API scan is fed an
  endpoint list / OpenAPI describing `/api/blob-upload`, `/api/coach-file`
  (with Basic-Auth creds from secrets), `/api/contact`, `/api/coach` so upload
  and auth logic get exercised.
- Tune with a **ZAP rules config** (`.zap/rules.tsv`) to suppress known
  false-positives and keep signal high. Reports → SARIF + HTML artifact.

**Guardrail:** active scan runs **only** against preview/staging URLs, never
`swimkidssg`'s production domain. Enforced by a URL allowlist check in the job.

### Phase 5 — Supply-chain & governance
- **Harden-Runner** (`audit` mode → `block`) on all jobs; pin every third-party
  action to a full commit SHA.
- **SBOM** (CycloneDX via Syft) generated on release, attached as artifact.
- **Branch protection** finalized: required checks = `build`, `CodeQL`,
  `Semgrep`, `gitleaks`, `dependency-review`, `zap-baseline`.
- Weekly scheduled re-scan of `main` so new CVE disclosures surface even
  without a PR.

---

## 5. Trigger & blocking matrix

| Workflow | PR | Push `main` | Nightly | Weekly | Blocks merge? |
|----------|:--:|:-----------:|:-------:|:------:|:-------------:|
| ci (build/lint/type) | ✅ | ✅ | — | — | **Yes** |
| CodeQL | ✅ | — | — | ✅ | Yes (High) |
| Semgrep + gitleaks | ✅ | — | — | ✅ | Yes |
| Dependency review | ✅ | — | — | — | Yes (High/Crit) |
| ZAP baseline (preview) | ✅ | — | — | — | Yes (High) after bake-in |
| ZAP full + API scan | — | — | ✅ | — | No (report/alert) |
| SBOM | — | on release | — | ✅ | No |

---

## 6. Secrets required in GitHub Actions

| Secret | Used by |
|--------|---------|
| `VERCEL_TOKEN` (or deployment webhook) | Detecting/awaiting preview URL for DAST |
| `SEMGREP_APP_TOKEN` *(optional)* | Semgrep managed rules/dashboard |
| `ZAP_COACH_FILES_PASSWORD` | ZAP API scan auth against `/api/coach-file` |
| *(CodeQL, Gitleaks, Dependency Review)* | none — use `GITHUB_TOKEN` |

No app runtime secrets (Google key, Telegram, blob token) belong in CI — DAST
hits the already-deployed preview, which carries Vercel's own env.

---

## 7. Success criteria

- Every PR runs build + SAST + secret + SCA + DAST-baseline; `main` is
  protected by required checks.
- All findings land in the **Security → Code scanning** tab with SARIF history.
- Zero secrets in git history (gitleaks clean); push protection on.
- Nightly full DAST + weekly re-scan catch drift and newly disclosed CVEs.
- Mean time to a green PR stays low (fast jobs < ~3–4 min; DAST parallel/async).

---

## 8. Out of scope (future)

- Lighthouse CI (perf/SEO/a11y budgets) — valuable but not security.
- Container/IaC scanning — N/A on Vercel's managed platform.
- Pen-test / bug-bounty — human-led, complements but doesn't replace this.
- Formal PDPA data-flow review for the forms/upload pipeline.
