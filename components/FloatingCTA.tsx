'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function FloatingCTA() {
  const pathname = usePathname()
  const isHome = pathname === '/'
  const [pastHeroCta, setPastHeroCta] = useState(false)

  useEffect(() => {
    if (!isHome) return
    const heroCta = document.getElementById('hero-cta')
    if (!heroCta) return

    // "Scrolled past" = the hero button has left the viewport upwards
    const onScroll = () => setPastHeroCta(heroCta.getBoundingClientRect().bottom < 0)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isHome])

  if (pathname === '/contact') return null
  if (isHome && !pastHeroCta) return null

  return (
    <Link
      href="/contact"
      className="fixed bottom-6 right-6 z-50 origin-bottom-right scale-110 rounded-full bg-highlight-500 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-highlight-600 transition"
    >
      Enquire Now
    </Link>
  )
}
