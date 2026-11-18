'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconChevronLeft } from '@tabler/icons-react'

/**
 * Back to the screen you came from. The period arrows replace the page rather
 * than add to history, so flipping through six months and pressing Back
 * leaves the screen instead of stepping back through the months. With no
 * history (opened from a link or a fresh app start) it goes to `href`, the
 * screen that contains this one.
 */
export function BackLink({ href, label = 'Back' }: { href: string; label?: string }) {
  const router = useRouter()
  return (
    <Link href={href} className="backlink" onClick={e => {
      if (window.history.length > 1) { e.preventDefault(); router.back() }
    }}><IconChevronLeft size={18} stroke={2.2} />{label}</Link>
  )
}
