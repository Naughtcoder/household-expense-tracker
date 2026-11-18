'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** A phone keeps the app's last page in memory and shows it again when you
 *  come back, figures and all. Sam's showed a total from hours earlier.
 *  Coming back after more than half a minute away fetches the page again. */
export function Freshen() {
  const router = useRouter()
  useEffect(() => {
    let hiddenAt = 0
    const onChange = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > 30_000) router.refresh()
    }
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) router.refresh() }
    document.addEventListener('visibilitychange', onChange)
    window.addEventListener('pageshow', onShow)
    return () => {
      document.removeEventListener('visibilitychange', onChange)
      window.removeEventListener('pageshow', onShow)
    }
  }, [router])
  return null
}
