import type { Metadata, Viewport } from 'next'
import { Nunito } from 'next/font/google'
import './globals.css'
import { RegisterSW } from './sw-register'
import { themeScript } from './theme'
import { Freshen } from './freshen'

// Rounded, like the iPhone's own rounded system font, which iPhones use first.
const nunito = Nunito({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })

export const metadata: Metadata = {
  title: 'Household',
  description: 'Shared expense tracker',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Household' },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0C1A24' },
    { media: '(prefers-color-scheme: light)', color: '#E9F1F4' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Stops iOS zooming when a form field is tapped, and respects the notch.
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={nunito.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}<RegisterSW /><Freshen /></body>
    </html>
  )
}
