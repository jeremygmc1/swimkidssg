# Phase 0 — Repository Hardening Runbook

Repo: `jeremygmc1/swimkidssg` · **Private** · personal account · default branch `main`

Phase 0 has two kinds of tasks:

1. **Config-as-code** — committed to the repo (done in this branch).
2. **Console/API toggles** — repository *settings* an admin must apply. Commands
   below use the `gh` CLI (run as a repo admin); REST equivalents in the docs
   links.

> **Licensing note (private repo).** GitHub-native **Secret Scanning + Push
> Protection** and **CodeQL code scanning / SARIF upload to the Security tab**
> are free on *public* repos but require paid add-ons on *private* repos
> (**GitHub Secret Protection** and **Code Security**, billed per active
> committer). Everything marked **FREE** below works on this private repo today.
> Items marked **PAID (private)** need a license decision — see "Decision needed".

---

## 1. Config-as-code — committed ✅

| File | Purpose |
|------|---------|
| `.github/dependabot.yml` | Weekly npm + github-actions dependency update PRs (grouped). |
| `SECURITY.md` | Vulnerability-disclosure policy + PDPA note. |

After merge, set the `<SECURITY_CONTACT_EMAIL>` placeholder in `SECURITY.md`.

---

## 2. Console/API toggles

### 2a. Least-privilege Actions token — **FREE** ⬅ do this first
Default `GITHUB_TOKEN` to read-only; workflows opt into more via per-job
`permissions:` blocks.

```bash
gh api -X PUT repos/jeremygmc1/swimkidssg/actions/permissions/workflow \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=false
```
UI: *Settings → Actions → General → Workflow permissions → Read repository
contents and packages permissions*.

### 2b. Dependabot alerts + security updates — **FREE**
```bash
gh api -X PUT repos/jeremygmc1/swimkidssg/vulnerability-alerts
gh api -X PUT repos/jeremygmc1/swimkidssg/automated-security-fixes
```
UI: *Settings → Advanced Security → Dependabot alerts* (enable) and *Dependabot
security updates* (enable).

### 2c. Branch protection on `main` — **FREE** (rulesets)
Require a PR, require the CI status checks to pass, block force-pushes/deletes.
Add required status-check names as each CI workflow lands (Phase 1+).

```bash
gh api -X PUT repos/jeremygmc1/swimkidssg/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": [] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```
UI: *Settings → Rules → Rulesets* (or *Branches → Add branch protection rule*).
Start with `contexts: []`; later set e.g. `["build","zap-baseline"]`.

### 2d. Secret Scanning + Push Protection — **PAID (private)**
```bash
gh api -X PATCH repos/jeremygmc1/swimkidssg \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```
Returns `422` if no GitHub Secret Protection license. **FREE alternative**
covered in Phase 2: run **Gitleaks** in Actions and fail the job on findings
(no Security-tab integration, but blocks leaks in CI).

---

## Decision needed

For this **private** repo, choose the security-findings surface:

- **A) Free-tier path.** Skip GitHub Secret Protection + Code Security. Run all
  scanners (Semgrep, Gitleaks, CodeQL-via-CLI, OSV, ZAP) as Actions jobs that
  **fail the build** and upload HTML/artifact reports. No Security-tab
  aggregation/history.
- **B) Licensed path.** Enable **Code Security + Secret Protection** add-ons.
  Get native CodeQL, push protection, and SARIF → Security tab with dedup and
  history (the experience the main plan assumes).
- **C) Make the repo public.** Unlocks all native features free — **not advised**
  here: the repo contains API logic and the site handles personal/child data.

The rest of the CI plan works under either A or B; only the *reporting surface*
differs. Recommendation: **A now** (zero cost, still blocks issues in CI),
revisit **B** if the project grows or a team forms.

---

## Phase 0 checklist

- [x] `.github/dependabot.yml` committed
- [x] `SECURITY.md` committed
- [ ] Set default workflow token to read-only (2a)
- [ ] Enable Dependabot alerts + security updates (2b)
- [ ] Add branch protection on `main` (2c)
- [ ] Fill `<SECURITY_CONTACT_EMAIL>` in `SECURITY.md`
- [ ] Decide free-tier (A) vs licensed (B) — see "Decision needed"
