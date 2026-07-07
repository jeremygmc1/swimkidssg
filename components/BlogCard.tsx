'use client'

import { memo } from 'react'
import Link from 'next/link'
import type { PostMeta } from '@/lib/mdx'

function BlogCardComponent({ post }: { post: PostMeta }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group block bg-white border border-gray-100 rounded-xl p-6 hover:shadow-md transition">
      <p className="text-xs text-gray-400 mb-2">
        {new Date(post.date).toLocaleDateString('en-SG', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
      <h2 className="text-lg font-bold text-gray-900 group-hover:text-brand-700 transition mb-2">
        {post.title}
      </h2>
      <p className="text-sm text-gray-500 line-clamp-3">{post.excerpt}</p>
      <span className="mt-4 inline-block text-sm font-medium text-brand-600 group-hover:underline">
        Read more →
      </span>
    </Link>
  )
}

export default memo(BlogCardComponent)
