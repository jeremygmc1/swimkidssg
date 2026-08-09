# CI/CD Implementation Plan — Security Scanning (SAST + DAST)

**Project:** swimkidssg — Next.js 16 / React 19 / TypeScript marketing site with lead-capture
API routes, deployed on Vercel.
**Status:** No CI exists today. This plan defines a phased rollout of an industry-standard
pipeline centred on SAST and DAST.

---

## 1. Why this shape of pipeline

The app is small but its risk profile is not trivial:

| Attribute | Security implication |
|---|---|
| API routes (`/api/contact`, `/api/coach`, `/api/blob-upload`, `/api/coach-file`) | Live attack surface → **DAST** and route-level SAST matter most |
| Handles PII (parent/child leads, coach uploads) | Injection, IDOR, and data-exposure bugs carry real cost |
| Many secrets (Google service account key, blob token, Turnstile secret, Telegram token, Upstash token) | **Secret scanning** is non-negotiable |
| File upload path (`/api/blob-upload` → Vercel Blob) | Upload-type/size abuse, SSRF surface |
| HTTP Basic Auth on `/api/coach-file` | Auth-logic and brute-force testing |
| ~10 runtime deps incl. `googleapis`, `next`, `next-mdx-remote` | **SCA / dependency scanning** |
| Vercel preview deployments per PR | Free, isolated, ephemeral target for **DAST** |

The pipeline therefore layers five industry-standard controls, mapped to OWASP DevSecOps
and the OWASP Top 10:

1. **SAST** — static analysis of first-party TS/React code.
2. **SCA** — third-party dependency vulnerability scanning.
3. **Secret scanning** — prevent committed credentials.
4. **IaC / config scanning** — Next.js config, headers, workflow hardening.
5. **DAST** — runtime scanning of the deployed app against real HTTP.

Plus the table-stakes CI gates (typecheck, lint, build) that everything else depends on.

---

## 2. Tooling decisions (all free for this repo)

> **Cost note.** This repository is **public**, so the whole stack below — CodeQL,
> Secret Scanning, and Push Protection included — is **free**. Those three GitHub-native
> features are free only on public repos; on a **private** repo they require **GitHub
> Advanced Security** (unless already licensed). (The `"private": true` in `package.json`
> is unrelated — that's npm's *publish guard* to stop accidental `npm publish`, not the
> repo's GitHub visibility.) If this repo ever goes private, either enable GHAS or drop
> CodeQL/native secret scanning and lean on the CI-based Semgrep + Gitleaks jobs, which
> are free regardless of visibility.

| Layer | Tool | Why this one |
|---|---|---|
| Base CI | GitHub Actions | Native, free for the repo, integrates with branch protection |
| Typecheck / Lint / Build | `tsc`, ESLint (`eslint-config-next`), `next build` | Already configured; make them gates |
| **SAST** | **CodeQL** (`javascript-typescript`) | GitHub-native, free on public repos (private needs GHAS), best-in-class JS/TS taint analysis, results in the Security tab |
| **SAST (supplementary)** | **Semgrep** (`p/javascript`, `p/react`, `p/nextjs`, `p/owasp-top-ten`) | Fast, framework-aware rules; catches Next-specific patterns CodeQL misses |
| **SCA** | **Dependabot** + **`npm audit`** (+ optional **Trivy fs**) | Dependabot for automated PRs; audit as a gate; Trivy for a second opinion + license view |
| **Secret scanning** | **GitHub Secret Scanning + Push Protection** (free on public repos; private needs GHAS), plus **Gitleaks** in CI | Native push protection blocks secrets pre-merge; Gitleaks scans full history/diffs and is free either way |
| **IaC / config** | **Trivy config** / **Checkov** (light) | Scans workflow + config; low volume here but cheap to add |
| **DAST** | **OWASP ZAP** (Baseline + optional Full/API scan) against the Vercel preview URL | The industry-standard free DAST; Baseline is passive & PR-safe, API scan drives the OpenAPI-less routes |

> Paid alternatives (Snyk, Checkmarx, Burp Suite Enterprise, StackHawk) map cleanly onto the
> same stages if a budget appears — the workflow structure below does not change.

---

## 3. Pipeline architecture

Three triggers, three intents:

```
                        ┌─────────────────────────────────────────────┐
  Pull request  ───────▶│  Fast gates (blocking, < 5 min)             │
                        │  typecheck · lint · build                   │
                        │  Semgrep (diff) · Gitleaks · npm audit      │
                        │  CodeQL (JS/TS)                             │
                        └───────────────┬─────────────────────────────┘
                                        │ (Vercel builds preview in parallel)
                                        ▼
                        ┌─────────────────────────────────────────────┐
  PR (preview ready) ──▶│  DAST — ZAP Baseline vs preview URL         │
                        │  (non-blocking → warning at first)          │
                        └─────────────────────────────────────────────┘

  Push to main  ───────▶  Full CodeQL + full ZAP scan + Trivy (report to Security tab)

  Weekly cron   ───────▶  Full SCA + secret history + ZAP Full scan (catch drift & new CVEs)
```

Design principles:
- **Fast feedback on PRs, deep scans off the hot path.** Heavy/slow scans (ZAP Full,
  weekly SCA) run on schedule or on `main`, not on every push.
- **Fail the build only on high-confidence, high-severity findings.** Start scanners in
  *report/warn* mode, then ratchet to *blocking* once the baseline is clean (see §6).
- **Everything reports SARIF to the GitHub Security tab** so findings are deduplicated,
  triaged, and tracked in one place.

---

## 4. Files to add

```
.github/
  dependabot.yml                 # SCA: weekly npm + actions updates
  workflows/
    ci.yml                       # gates: typecheck, lint, build
    codeql.yml                   # SAST: CodeQL JS/TS (PR + main + weekly)
    sast.yml                     # SAST: Semgrep + Gitleaks (PR)
    sca.yml                      # SCA: npm audit + Trivy fs (PR + weekly)
    dast.yml                     # DAST: ZAP against Vercel preview (PR + main)
  ZAP/
    rules.tsv                    # ZAP alert tuning (false-positive suppression)
.zap/
  api-scan.conf                  # optional: contexts/auth for authenticated API scan
```

Also add `"typecheck": "tsc --noEmit"` to `package.json` scripts.

---

## 5. Stage detail & acceptance criteria

### Stage 0 — Base gates (`ci.yml`)
- Node 20, `npm ci`, cache npm.
- Run `npm run typecheck`, `npm run lint`, `npm run build`.
- **Gate:** any failure blocks merge. This is the foundation the scanners build on.

### Stage 1 — SAST
- **CodeQL** (`github/codeql-action`), language `javascript-typescript`, `security-extended`
  query suite. Runs on PR, push to `main`, and weekly cron. Uploads SARIF.
- **Semgrep** with `p/javascript p/react p/nextjs p/owasp-top-ten`. On PRs use
  `--baseline-commit` (diff-aware) so devs only see *new* findings. Uploads SARIF.
- **Focus areas for this repo:** the four API route handlers — unvalidated `req.json()`
  bodies, the Basic-Auth compare in `coach-file`, upload content-type/size handling in
  `blob-upload`, SSRF/`fetch` surfaces, and any `dangerouslySetInnerHTML` in MDX rendering.
- **Acceptance:** zero *new* High/Critical findings on a PR.

### Stage 2 — SCA (`sca.yml` + `dependabot.yml`)
- **Dependabot:** weekly PRs for `npm` and `github-actions` ecosystems, grouped minor/patch.
- **`npm audit --audit-level=high`** as a PR gate (start non-blocking, then block).
- **Trivy `fs`** for a second scanner and SBOM/license visibility; SARIF to Security tab.
- **Acceptance:** no High/Critical advisories without a documented, time-boxed exception.

### Stage 3 — Secret scanning
- Enable **GitHub Secret Scanning + Push Protection** in repo settings (blocks pushes
  containing known credential formats — directly relevant given the `.env` surface here).
- **Gitleaks** in CI to scan the PR diff (and full history on the weekly run).
- **Acceptance:** no verified secrets; `.env.local` stays git-ignored (already is).

### Stage 4 — IaC / config scanning
- **Trivy `config`** over `.github/workflows`, `next.config.ts`, and Dockerfiles (none today).
- Pin every GitHub Action to a commit SHA; set least-privilege `permissions:` per workflow.
- Verify security headers/CSP posture (the `next.config.ts` image CSP is a good start;
  consider a global CSP + security headers and let DAST confirm them).

### Stage 5 — DAST (`dast.yml`)
- **Target:** the per-PR **Vercel preview deployment** (isolated, disposable, no prod data).
  Resolve the preview URL from the Vercel deployment (GitHub deployment status API or the
  Vercel action) and wait for it to be ready.
- **ZAP Baseline scan** (`zaproxy/action-baseline`) — passive, spiders + AJAX-spiders the
  public pages, checks headers/cookies/CSP/info-leaks. Safe to run on every PR.
- **ZAP Full / API scan** on `main` and weekly — active scanning of the API routes
  (`/api/contact`, `/api/coach`, `/api/blob-upload`, `/api/coach-file`) for injection, auth
  bypass, and error-handling issues. Feed it the route list via `.zap/api-scan.conf`.
- **Guardrails:** never point active scans at production or third-party services (Google
  Sheets, Upstash, Telegram); scan preview only. Tune false positives in `.github/ZAP/rules.tsv`.
  Respect the existing rate limiters — configure ZAP threads/delay so scans aren't self-throttled.
- **Acceptance:** no High-risk ZAP alerts on the baseline; triage Medium alerts (missing
  headers, verbose errors) into follow-up issues.

---

## 6. Rollout phases (recommended order)

**Phase 1 — Foundation (day 1).** Add `ci.yml` (typecheck/lint/build) + `dependabot.yml`.
Turn on GitHub Secret Scanning + Push Protection. Enable branch protection requiring these
checks. *Low risk, immediate value.*

**Phase 2 — SAST + secrets in CI (week 1).** Add CodeQL, Semgrep (diff mode), Gitleaks.
Run in **report-only** first; fix the initial backlog; then flip High/Critical to **blocking**.

**Phase 3 — SCA hardening (week 1–2).** Add `npm audit` gate + Trivy. Clear the current
advisory backlog, then make High/Critical blocking.

**Phase 4 — DAST (week 2–3).** Add ZAP Baseline against previews (non-blocking → warning).
Once alerts are tuned and clean, promote High alerts to blocking. Add the Full/API scan on
`main` + weekly cron.

**Phase 5 — Steady state.** Weekly scheduled deep scans, Dependabot auto-merge for green
patch updates, quarterly review of scanner rules and severity thresholds.

---

## 7. Governance & operations

- **Single source of truth:** all SARIF flows into the **GitHub Security tab** (Code
  scanning + Dependabot alerts + Secret scanning). Triage there, not in raw logs.
- **Severity policy:** block on **High/Critical**; warn on Medium; log Low/Info. New code
  is held to a stricter bar than the legacy baseline (diff-aware scanning).
- **Exceptions:** documented, owner-assigned, time-boxed (e.g. `.semgrepignore`, suppression
  comments, or a tracked issue) — never silent.
- **Least privilege:** minimal `permissions:` per workflow; Actions pinned to SHAs;
  `GITHUB_TOKEN` scoped read-only except where SARIF upload needs `security-events: write`.
- **Secrets in CI:** any tokens the DAST/preview steps need live in GitHub Actions secrets,
  never in the repo. Scans run against preview envs with dummy/no real third-party creds.
- **Runtime cost:** PR path stays under ~5 min (parallel jobs); deep scans are async on
  `main`/cron so they never block developers.

---

## 8. What this deliberately excludes (and why)

- **Container/K8s scanning** — no Dockerfile; app runs on Vercel's platform. Add Trivy
  `image` only if containerisation is introduced.
- **License-compliance enforcement** — out of scope for a small marketing site; Trivy
  surfaces licenses if needed later.
- **Load/perf testing** — not a security control; separate concern.
- **Paid DAST/pentest** — the free ZAP + CodeQL stack is sufficient at this scale; revisit
  before handling payments or accounts.

---

## 9. Next step

On approval, implement **Phase 1** (base CI + Dependabot + secret push protection) as the
first PR, then layer Phases 2–4 in subsequent PRs so each scanner's baseline can be cleaned
before it becomes a merge gate.
