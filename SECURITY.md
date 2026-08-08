# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in the SwimKidsSG website, please report
it **privately** — do not open a public issue.

- Preferred: use GitHub **Private Vulnerability Reporting**
  (repository → *Security* tab → *Report a vulnerability*).
- Alternatively, email the maintainer at `<SECURITY_CONTACT_EMAIL>`.

Please include steps to reproduce, affected endpoint(s), and any relevant
request/response details. We aim to acknowledge reports within **3 business
days**.

## Scope

This site collects personal data via its contact and coaching-application forms
and handles file uploads. We are particularly interested in reports concerning:

- The API routes: `/api/blob-upload`, `/api/coach-file`, `/api/contact`,
  `/api/coach`.
- Authentication / authorization on `/api/coach-file`.
- File-upload handling and stored-file access.
- Exposure of secrets or personal data (parent/child contact details).

## Supported versions

Only the currently deployed production version (`main` branch, deployed on
Vercel) is supported.

## Data protection

The site processes personal data of Singapore residents and is subject to the
**Personal Data Protection Act (PDPA)**. Reports involving potential personal-
data exposure will be prioritized.
