'use client'
import { useEffect, useState } from 'react'

/** The app's public key arrives as base64url; the browser wants raw bytes. */
function bytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

async function save(sub: PushSubscription) {
  const r = await fetch('/api/push', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub.toJSON()),
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? 'not saved')
}

/**
 * Asks once for permission to notify this phone when a payment needs a
 * category. On an iPhone this only works in the app opened from the home
 * screen, so in Safari it says that instead of offering a button that fails.
 */
export function NotifyToggle() {
  const [state, setState] = useState<'checking' | 'off' | 'on' | 'blocked' | 'unsupported' | 'busy' | 'native'>('checking')
  const [error, setError] = useState('')

  useEffect(() => {
    // Inside the phone app the web's notifications do not exist; the app
    // gets its own. Say nothing rather than "open it from the home screen".
    if ((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
      setState('native'); return
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported'); return
    }
    if (Notification.permission === 'denied') { setState('blocked'); return }
    navigator.serviceWorker.ready.then(async reg => {
      const sub = await reg.pushManager.getSubscription()
      // Re-send on every visit, so the server never holds a stale one.
      if (sub && Notification.permission === 'granted') { await save(sub).catch(() => {}); setState('on') }
      else setState('off')
    })
  }, [])

  async function turnOn() {
    setState('busy'); setError('')
    try {
      if ((await Notification.requestPermission()) !== 'granted') { setState('blocked'); return }
      const { key } = await fetch('/api/push').then(r => r.json())
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(key) })
      await save(sub)
      setState('on')
    } catch (e) {
      setError((e as Error).message); setState('off')
    }
  }

  if (state === 'checking' || state === 'on' || state === 'native') return null
  return (
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      {state === 'unsupported' && <p className="sub">To get a notification for each payment that needs a category, open this app from your home screen icon, not from Safari.</p>}
      {state === 'blocked' && <p className="sub">Notifications are switched off for this app. Turn them on in your phone's Settings, under Notifications, then come back here.</p>}
      {(state === 'off' || state === 'busy') && (
        <>
          <p className="sub">Get a notification on this phone whenever a payment needs a category. Tap it to file the payment straight away.</p>
          <button className="btn" onClick={turnOn} disabled={state === 'busy'}>{state === 'busy' ? 'Turning on…' : 'Turn on notifications'}</button>
        </>
      )}
      {error && <p className="sub">Could not turn on: {error}</p>}
    </div>
  )
}
