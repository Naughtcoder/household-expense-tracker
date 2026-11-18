'use client'
import { useState } from 'react'
import { supabaseBrowser } from '../../lib/supabase/client'
import { Crumbs } from '../crumbs'
import { Nav } from '../nav'

/**
 * A new password while signed in. The emailed reset link is single-use and
 * short-lived, and mail scanners can spend it before you tap it, so the
 * reliable way to change a password is from inside the app.
 */
export default function ChangePassword() {
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  // Seeing both helps when iPhone fills a suggested password into only one.
  const [show, setShow] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (pw.length < 8) return setMsg({ ok: false, text: 'Use at least 8 characters.' })
    if (pw !== again) return setMsg({ ok: false, text: 'The two do not match.' })
    setBusy(true); setMsg(null)
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setMsg({ ok: false, text: error.message })
    else { setPw(''); setAgain(''); setMsg({ ok: true, text: 'Password changed. Use it next time you sign in.' }) }
  }

  return (
    <>
    <Nav reviewCount={0} />
    <main className="wrap grid" style={{ gap: 16 }}>
      <Crumbs fallback="/" trail={[{ label: 'Home', href: '/' }, { label: 'Change password' }]} />
      <section className="card">
        <h2>Change password</h2>
        <form onSubmit={save} className="grid" style={{ gap: 12, marginTop: 12 }}>
          <input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" placeholder="New password" value={pw} onChange={e => setPw(e.target.value)} />
          <input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" placeholder="The same again" value={again} onChange={e => setAgain(e.target.value)} />
          <button type="button" className="chip" style={{ justifySelf: 'start' }} onClick={() => setShow(s => !s)}>{show ? 'Hide' : 'Show'} what I typed</button>
          <button className="btn" disabled={busy || !pw || !again}>{busy ? 'Saving' : 'Save new password'}</button>
          {msg && <p className="sub" style={{ color: msg.ok ? 'var(--positive)' : 'var(--hue-9)' }}>{msg.text}</p>}
        </form>
      </section>
    </main>
    </>
  )
}
