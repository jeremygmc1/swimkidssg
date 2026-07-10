'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function FloatingCTA() {
  const pathname = usePathname()
  if (pathname === '/contact') return null

  return (
    <Link
      href="/contact"
      className="fixed bottom-6 right-6 z-50 rounded-full bg-highlight-500 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-highlight-600 transition"
    >
      Enquire Now
    </Link>
  )
}
