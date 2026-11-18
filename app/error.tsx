'use client'
import { useEffect, useState } from 'react'
import { reloadOnce } from '../lib/recover'

export default function RouteError({ error }: { error: Error & { digest?: string } }) {
  const [shown, setShown] = useState(false)
  useEffect(() => { if (!reloadOnce()) setShown(true) }, [])
  if (!shown) return null
  return (
    <main className="wrap grid" style={{ gap: 14, paddingTop: 68 }}>
      <section className="card grid" style={{ gap: 10 }}>
        <h1>Something broke on this page</h1>
        <p className="sub">Reloading did not fix it. Send me a screenshot of this card.</p>
        <div className="raw">{error.message || 'No message'}{error.digest ? ` (ref ${error.digest})` : ''}</div>
        <button className="btn" onClick={() => window.location.reload()}>Reload</button>
      </section>
    </main>
  )
}
