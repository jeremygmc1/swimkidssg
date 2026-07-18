'use client'

import { Children, isValidElement, useRef, useState } from 'react'
import Image from 'next/image'

type CarouselImage = {
  src: string
  alt: string
  caption?: string
}

/**
 * Usage in MDX (string attributes only — expression props are not
 * supported by next-mdx-remote/rsc):
 *
 * <Carousel>
 *   <img src="/blog/my-post/photo.jpg" alt="Required alt text" caption="Optional caption" />
 *   <img src="/blog/my-post/photo-2.jpg" alt="Another photo" />
 * </Carousel>
 *
 * The child <img> tags are never rendered — Carousel reads their
 * attributes and renders optimized next/image slides instead.
 */
export default function Carousel({ children }: { children?: React.ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  const images: CarouselImage[] = Children.toArray(children)
    .filter(isValidElement)
    .map((el) => {
      const props = el.props as Record<string, string | undefined>
      return { src: props.src ?? '', alt: props.alt ?? '', caption: props.caption }
    })
    .filter((img) => img.src)

  function scrollToSlide(i: number) {
    const track = trackRef.current
    if (!track) return
    const clamped = Math.max(0, Math.min(images.length - 1, i))
    setIndex(clamped)
    const target = clamped * track.clientWidth
    const start = track.scrollLeft
    track.scrollTo({ left: target, behavior: 'smooth' })
    // Some browsers ignore smooth programmatic scrolls (e.g. reduced-motion,
    // snap-container quirks) — fall back to an instant jump if nothing moved.
    window.setTimeout(() => {
      if (track.scrollLeft === start && start !== target) track.scrollTo({ left: target })
    }, 150)
  }

  function handleScroll() {
    const track = trackRef.current
    if (!track) return
    setIndex(Math.round(track.scrollLeft / track.clientWidth))
  }

  if (!images.length) return null

  return (
    <figure className="not-prose my-8">
      <div className="relative">
        <div
          ref={trackRef}
          onScroll={handleScroll}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((img) => (
            <div key={img.src} className="relative aspect-video w-full shrink-0 snap-center bg-black">
              <Image
                src={img.src}
                alt={img.alt}
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 672px"
              />
            </div>
          ))}
        </div>

        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={() => scrollToSlide(index - 1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={() => scrollToSlide(index + 1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition"
            >
              ›
            </button>
          </>
        )}
      </div>

      {images[index]?.caption && (
        <figcaption className="mt-2 text-center text-sm italic text-gray-500">
          {images[index].caption}
        </figcaption>
      )}

      {images.length > 1 && (
        <div className="mt-3 flex justify-center gap-2">
          {images.map((img, i) => (
            <button
              key={img.src}
              type="button"
              aria-label={`Go to image ${i + 1}`}
              onClick={() => scrollToSlide(i)}
              className={`h-2 w-2 rounded-full transition ${i === index ? 'bg-cyan-500' : 'bg-gray-300 hover:bg-gray-400'}`}
            />
          ))}
        </div>
      )}
    </figure>
  )
}
