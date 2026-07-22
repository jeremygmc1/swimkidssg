import type { Metadata } from 'next'
import ContactForm from '@/components/ContactForm'
import { COACH_FIELDS } from '@/lib/fields'

export const metadata: Metadata = {
  title: 'For Coaches',
  description:
    'Join the SwimKidsSG network of swim coaches. Leave your name and number and we\'ll be in touch.',
}

export default function CoachesPage() {
  return (
    <section className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Coach with SwimKidsSG</h1>
      <p className="text-gray-500 mb-6">
        Are you a swim coach who loves helping kids build confidence in the water? We&apos;re
        growing our network of coaches across Singapore and connecting them with families
        looking for lessons.
      </p>
      <p className="text-gray-500 mb-10">
        Leave your name and number below and we&apos;ll reach out to tell you more about joining.
      </p>
      <ContactForm
        fields={COACH_FIELDS}
        endpoint="/api/coach"
        submitLabel="Join Our Network"
        successTitle="Thanks for reaching out!"
        successBody="We'll be in touch soon about joining our network of coaches."
      />
    </section>
  )
}
