'use client'
import { useEffect, useState } from 'react'
import { reloadOnce } from '../lib/recover'
import './globals.css'

// Replaces the whole layout when the layout itself fails, so it brings its own
// html, body and stylesheet.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const [shown, setShown] = useState(false)
  useEffect(() => { if (!reloadOnce()) setShown(true) }, [])
  return (
    <html lang="en">
      <body>
        {shown && (
          <main className="wrap grid" style={{ gap: 14, paddingTop: 68 }}>
            <section className="card grid" style={{ gap: 10 }}>
              <h1>The app could not load</h1>
              <p className="sub">Reloading did not fix it. Send me a screenshot of this card.</p>
              <div className="raw">{error.message || 'No message'}{error.digest ? ` (ref ${error.digest})` : ''}</div>
              <button className="btn" onClick={() => window.location.reload()}>Reload</button>
            </section>
          </main>
        )}
      </body>
    </html>
  )
}
