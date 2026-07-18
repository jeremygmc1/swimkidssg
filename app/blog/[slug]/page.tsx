import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import { getAllPosts, getPostBySlug } from '@/lib/mdx'
import Carousel from '@/components/Carousel'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  return { title: post.title, description: post.excerpt }
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params

  let post
  try {
    post = getPostBySlug(slug)
  } catch {
    notFound()
  }

  return (
    <article className="max-w-2xl mx-auto px-6 py-16">
      <p className="text-sm text-gray-400 mb-2">
        {new Date(post.date).toLocaleDateString('en-SG', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
      <h1 className="text-3xl font-bold text-brand-700 mb-8">{post.title}</h1>
      <div className="prose prose-lg max-w-none prose-headings:text-brand-700 prose-headings:font-bold prose-a:text-cyan-500 prose-a:no-underline hover:prose-a:underline prose-strong:text-brand-700 prose-li:marker:text-cyan-500 prose-hr:border-gray-200">
        <MDXRemote source={post.content} components={{ Carousel }} />
      </div>
    </article>
  )
}
