// Client-only helpers for the admin UI. We drive HTTP Basic auth ourselves —
// capturing the password in a login form and attaching it as an Authorization
// header on every admin request — rather than relying on the browser's native
// 401 dialog, which browsers suppress for fetch/XHR. The credential lives in
// sessionStorage (cleared when the tab closes).

const KEY = 'swimkidssg-admin-auth'

export function getAuth(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setAuth(password: string): void {
  try {
    // Username is ignored server-side; only the password after ":" is checked.
    sessionStorage.setItem(KEY, `Basic ${btoa(`admin:${password}`)}`)
  } catch {
    // sessionStorage unavailable (private mode etc.) — auth just won't persist.
  }
}

export function clearAuth(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

// fetch() wrapper that attaches the stored Basic credential.
export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const auth = getAuth()
  const headers = new Headers(init.headers)
  if (auth) headers.set('Authorization', auth)
  return fetch(path, { ...init, headers })
}
