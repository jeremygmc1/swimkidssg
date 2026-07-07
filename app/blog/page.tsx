import type { Metadata } from 'next'
import { getAllPosts } from '@/lib/mdx'
import BlogCard from '@/components/BlogCard'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Swimming tips, water safety guides, and updates from SwimKidsSG.',
}

export const dynamic = 'force-static'

export default function BlogPage() {
  const posts = getAllPosts()

  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Blog</h1>
      <p className="text-gray-500 mb-10">Swimming tips, water safety, and updates.</p>

      {posts.length === 0 ? (
        <p className="text-gray-400">No posts yet — check back soon.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </section>
  )
}
