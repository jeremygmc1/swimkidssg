import Link from 'next/link'

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-brand-900 text-white py-24 px-6 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Swimming Lessons for Kids in Singapore
        </h1>
        <p className="text-lg md:text-xl text-brand-100 mb-8 max-w-2xl mx-auto">
          Building confidence, water safety, and proper technique — from beginner splashes to advanced strokes.
        </p>
        <Link
          href="/contact"
          className="inline-block bg-white text-brand-900 font-semibold px-8 py-3 rounded-full hover:bg-brand-50 transition"
        >
          Enquire Now
        </Link>
      </section>

      {/* Latest Posts placeholder */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold mb-8 text-gray-900">Latest from the Blog</h2>
        <p className="text-gray-500">Blog posts coming in Stage 2.</p>
        <div className="mt-4">
          <Link href="/blog" className="text-brand-600 font-medium hover:underline">
            View all posts &rarr;
          </Link>
        </div>
      </section>
    </>
  )
}
