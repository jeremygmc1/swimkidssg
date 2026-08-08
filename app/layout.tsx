import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import FloatingCTA from '@/components/FloatingCTA'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: {
    default: 'SwimKidsSG — Swimming Lessons for Kids in Singapore',
    template: '%s | SwimKidsSG',
  },
  description: 'Expert swimming lessons for kids in Singapore. Build confidence, water safety, and stroke technique from beginner to advanced.',
  metadataBase: new URL('https://www.swimkidssg.com'),
  icons: {
    icon: '/SwimKids SG logo (Circle).svg',
    apple: '/SwimKids SG logo (Circle).svg',
  },
  openGraph: {
    type: 'website',
    url: 'https://www.swimkidssg.com',
    siteName: 'SwimKidsSG',
    title: 'SwimKidsSG — Swimming Lessons for Kids in Singapore',
    description: 'Expert swimming lessons for kids in Singapore. Build confidence, water safety, and stroke technique from beginner to advanced.',
    images: [
      {
        url: '/SwimKids SG logo (Circle).svg',
        width: 1080,
        height: 1080,
        alt: 'SwimKidsSG',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'SwimKidsSG — Swimming Lessons for Kids in Singapore',
    description: 'Expert swimming lessons for kids in Singapore.',
    images: ['/SwimKids SG logo (Circle).svg'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
        <FloatingCTA />
        <Analytics />
      </body>
    </html>
  )
}
