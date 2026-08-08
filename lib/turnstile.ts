// Verifies a Cloudflare Turnstile token server-side.
// No-ops (returns true) when TURNSTILE_SECRET_KEY is unset, so the forms keep
// working before Turnstile is configured. A missing token when Turnstile IS
// configured is rejected; a network error to Cloudflare fails open, since
// losing a genuine enquiry is worse than letting a rare bot through (the
// rate limiter and honeypot are the other layers).
export async function verifyTurnstile(token: unknown, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true
  if (typeof token !== 'string' || !token) return false

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch (err) {
    console.error('Turnstile verify error:', err)
    return true
  }
}
