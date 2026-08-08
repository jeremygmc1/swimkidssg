'use client'

import { useEffect, useRef } from 'react'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id?: string) => void
  remove: (id?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
    onloadTurnstileCallback?: () => void
  }
}

type Props = {
  /** Called with the token when solved, or '' when it expires/errors. */
  onVerify: (token: string) => void
  /** Bump this to force the widget to reset (e.g. after a submit). */
  resetKey?: number
}

// Renders the Cloudflare Turnstile widget and reports its token to the parent.
// Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset.
export default function Turnstile({ onVerify, resetKey = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  // Hold the latest onVerify in a ref so the render effect runs only once.
  const onVerifyRef = useRef(onVerify)
  useEffect(() => {
    onVerifyRef.current = onVerify
  }, [onVerify])

  useEffect(() => {
    if (!SITE_KEY) return

    function render() {
      if (!containerRef.current || !window.turnstile || widgetIdRef.current) return
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (token: string) => onVerifyRef.current(token),
        'expired-callback': () => onVerifyRef.current(''),
        'error-callback': () => onVerifyRef.current(''),
      })
    }

    if (window.turnstile) {
      render()
    } else {
      window.onloadTurnstileCallback = render
      if (!document.getElementById('cf-turnstile-script')) {
        const script = document.createElement('script')
        script.id = 'cf-turnstile-script'
        script.src =
          'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback'
        script.async = true
        script.defer = true
        document.head.appendChild(script)
      }
    }

    const widgetId = widgetIdRef
    return () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current)
        widgetId.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (resetKey > 0 && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current)
    }
  }, [resetKey])

  if (!SITE_KEY) return null
  return <div ref={containerRef} className="mt-1" />
}
