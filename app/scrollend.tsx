'use client'
import { useEffect, useRef } from 'react'

/** A chart wider than the screen: scrolls sideways, and opens at the latest
 *  month on the right so older months are a swipe back. */
export function ScrollEnd({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const el = ref.current; if (el) el.scrollLeft = el.scrollWidth }, [])
  return <div ref={ref} className="hscroll">{children}</div>
}
