import Link from 'next/link'
import Image from 'next/image'
import { getAllPosts } from '@/lib/mdx'
import BlogCard from '@/components/BlogCard'

export default function HomePage() {
  const latestPosts = getAllPosts().slice(0, 3)

  return (
    <>
      {/* Hero */}
      <section className="bg-brand-900 text-white py-24 px-6 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
          Swimming Lessons for Kids<br className="hidden md:block" /> in Singapore
        </h1>
        <p className="text-lg md:text-xl text-brand-100 mb-10 max-w-2xl mx-auto">
          Building confidence, water safety, and proper technique — from beginner splashes to advanced strokes.
        </p>
        <Link
          id="hero-cta"
          href="/contact"
          className="inline-block bg-highlight-500 text-white font-bold px-10 py-4 rounded-full hover:bg-highlight-600 transition text-lg shadow-lg"
        >
          Enquire Now
        </Link>
      </section>

      {/* Photo band */}
      <section className="relative h-64 md:h-96 w-full">
        <Image
          src="/home-banner.jpg"
          alt="A swim instructor guiding a young child during a lesson at an outdoor pool"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </section>

      {/* Why SwimKidsSG */}
      <section className="bg-brand-50 py-12 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          {[
            { title: 'Small Class Sizes', desc: 'Every child gets personal attention from a certified instructor.' },
            { title: 'All Levels Welcome', desc: 'From first splash to advanced strokes — we have a programme for your child.' },
            { title: 'Water Safety First', desc: 'We build life-saving skills alongside swim technique from day one.' },
          ].map((item) => (
            <div key={item.title} className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-brand-700 font-bold text-lg mb-2">{item.title}</h3>
              <p className="text-gray-500 text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Latest Posts */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold mb-8 text-brand-700">Latest from the Blog</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {latestPosts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
        <div className="mt-8">
          <Link href="/blog" className="text-cyan-500 font-medium hover:underline">
            View all posts →
          </Link>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="bg-cyan-500 text-white py-16 px-6 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to make a splash?</h2>
        <p className="text-white/80 mb-8 max-w-xl mx-auto">
          Spots fill up fast. Get in touch today and we'll find the right programme for your child.
        </p>
        <Link
          href="/contact"
          className="inline-block bg-white text-cyan-600 font-bold px-10 py-4 rounded-full hover:bg-brand-50 transition text-lg shadow"
        >
          Book a Spot
        </Link>
      </section>
    </>
  )
}
