import type { Metadata } from 'next'
import ContactForm from '@/components/ContactForm'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Enquire about swimming lessons for your child at SwimKidsSG.',
}

export default function ContactPage() {
  return (
    <section className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Get in Touch</h1>
      <p className="text-gray-500 mb-10">
        Fill in the form below and we'll get back to you within 24 hours to discuss the best programme for your child.
      </p>
      <ContactForm />
    </section>
  )
}
