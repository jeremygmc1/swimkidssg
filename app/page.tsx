import Link from 'next/link'
import Image from 'next/image'
import { getAllPosts } from '@/lib/mdx'
import BlogCard from '@/components/BlogCard'
import heroBanner from '@/assets/home-banner-2.jpg'

export default function HomePage() {
  const latestPosts = getAllPosts().slice(0, 3)

  return (
    <>
      {/* Hero over photo */}
      <section className="bg-brand-900">
        <div className="relative mx-auto max-w-6xl">
          <Image
            src={heroBanner}
            alt="A swim coach guiding two children with a kickboard during a swimming lesson in a lane pool"
            priority
            placeholder="blur"
            sizes="100vw"
            className="h-[26rem] w-full object-cover object-left md:h-auto md:object-center"
          />
          <div className="absolute inset-0 flex items-center justify-center p-4 md:justify-end md:p-0 md:pr-[6%]">
            <div className="w-full max-w-[15rem] rounded-2xl bg-brand-900/85 px-5 py-5 text-center text-white shadow-xl backdrop-blur-sm md:max-w-sm md:rounded-3xl md:px-7 md:py-8">
              <h1 className="mb-2 text-lg font-bold leading-tight md:mb-3 md:text-3xl">
                Swimming Lessons for Kids in Singapore
              </h1>
              <p className="mb-4 text-xs text-brand-100 md:mb-6 md:text-sm">
                Building confidence, water safety, and proper technique — from beginner splashes to advanced strokes.
              </p>
              <Link
                id="hero-cta"
                href="/contact"
                className="inline-block rounded-full bg-highlight-500 px-6 py-2.5 text-sm font-bold text-brand-900 shadow-lg transition hover:bg-highlight-600 md:px-8 md:py-3 md:text-base"
              >
                Enquire Now
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Why SwimKidsSG */}
      <section className="bg-brand-50 py-12 px-6">
        <h2 className="sr-only">Why choose SwimKidsSG</h2>
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
          <Link href="/blog" className="text-brand-700 font-medium hover:underline">
            View all posts →
          </Link>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="bg-cyan-500 text-brand-900 py-16 px-6 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to make a splash?</h2>
        <p className="text-brand-900/90 mb-8 max-w-xl mx-auto">
          Spots fill up fast. Get in touch today and we'll find the right programme for your child.
        </p>
        <Link
          href="/contact"
          className="inline-block bg-white text-brand-700 font-bold px-10 py-4 rounded-full hover:bg-brand-50 transition text-lg shadow"
        >
          Book a Spot
        </Link>
      </section>
    </>
  )
}
