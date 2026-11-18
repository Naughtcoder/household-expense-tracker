'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { IconMessage2, IconChevronRight } from '@tabler/icons-react'

/**
 * On the Android app only, until this phone is linked: a card on the Month
 * screen that leads to the SMS reader setup. Tucked under More, it was found
 * by nobody.
 */
export function PhoneBanner() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: Record<string, { status?: () => Promise<{ linked: boolean; permission: string }> }> } }).Capacitor
    if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== 'android') return
    const b = cap.Plugins?.SmsBridge
    if (!b?.status) { setShow(true); return }
    b.status().then(s => setShow(!s.linked || s.permission !== 'granted')).catch(() => setShow(true))
  }, [])
  if (!show) return null
  return (
    <Link href="/phone" className="stat" style={{ display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'inset 0 0 0 2px var(--accent)' }}>
      <IconMessage2 size={26} />
      <div style={{ flex: 1 }}>
        <div className="v" style={{ fontSize: 16 }}>Read bank texts on this phone</div>
        <div className="k">Two taps. Only bank payment texts are read.</div>
      </div>
      <IconChevronRight size={20} />
    </Link>
  )
}
