import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-100 py-10 px-6 mt-16">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
        <p className="font-semibold text-brand-700">SwimKidsSG</p>
        <div className="flex gap-6">
          <Link href="/" className="hover:text-brand-600 transition">Home</Link>
          <Link href="/blog" className="hover:text-brand-600 transition">Blog</Link>
          <Link href="/contact" className="hover:text-brand-600 transition">Contact</Link>
        </div>
        <p>© {new Date().getFullYear()} SwimKidsSG. All rights reserved.</p>
      </div>
    </footer>
  )
}
