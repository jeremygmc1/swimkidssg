import Link from 'next/link'
import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="bg-brand-900 text-white py-10 px-6 mt-16">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <Image
          src="/SwimKids SG logo.svg"
          alt="SwimKidsSG"
          width={120}
          height={36}
          className="h-10 w-auto object-contain"
        />
        <div className="flex gap-6 text-sm text-brand-100">
          <Link href="/" className="hover:text-cyan-400 transition">Home</Link>
          <Link href="/blog" className="hover:text-cyan-400 transition">Blog</Link>
          <Link href="/contact" className="hover:text-cyan-400 transition">Contact</Link>
        </div>
        <p className="text-sm text-brand-100">
          © {new Date().getFullYear()} SwimKidsSG. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
