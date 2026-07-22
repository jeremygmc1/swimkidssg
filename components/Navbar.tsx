'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'

const links = [
  { href: '/', label: 'Home' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
  { href: '/coaches', label: 'For Coaches' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center">
          <Image
            src="/SwimKids SG logo.svg"
            alt="SwimKidsSG"
            width={160}
            height={48}
            className="h-16 w-auto object-contain"
            priority
          />
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-brand-700 hover:text-cyan-500 font-medium transition text-sm"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/contact"
            className="bg-brand-700 text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-brand-900 transition"
          >
            Enquire Now
          </Link>
        </div>

        <button
          className="md:hidden text-brand-700"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {open
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            }
          </svg>
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-gray-100 px-6 py-4 flex flex-col gap-4 bg-white">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-brand-700 font-medium"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/contact"
            className="bg-brand-700 text-white text-sm font-semibold px-5 py-2 rounded-full text-center hover:bg-brand-900 transition"
            onClick={() => setOpen(false)}
          >
            Enquire Now
          </Link>
        </div>
      )}
    </nav>
  )
}
