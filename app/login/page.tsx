'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { supabaseBrowser } from '../../lib/supabase/client'

// For "Forgot password" only. The reset link carries its token in the address
// itself, so it works in whichever browser the email opens in, which is
// rarely the app the request came from. The usual sign-in flow ties the link
// to the browser that asked, and would fail there.
const resetClient = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: false },
})

// Email and password, not a magic link.
//
// Three reasons. An installed home screen app on iOS keeps its own cookie
// store, so a link opened in Safari or Chrome can never create a session
// inside the app. Magic links are single use and mail scanners consume them
// before you click. And Supabase's free tier caps sign-in emails at two an
// hour, which two people across four devices hit immediately.
//
// The two accounts are created by hand in the Supabase dashboard. Nobody signs
// up here, so there is no sign-up form.
export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  // Arrived from a reset email: the address ends #...type=recovery.
  const [resetting, setResetting] = useState(false)
  const [fresh, setFresh] = useState('')
  const rcRef = useRef<ReturnType<typeof resetClient> | null>(null)

  useEffect(() => {
    // Read the link before the client is made: making it consumes the token
    // and wipes it from the address, which hid this screen in testing.
    const hash = window.location.hash
    if (hash.includes('type=recovery')) setResetting(true)
    if (hash.includes('error_description')) {
      setNote(decodeURIComponent(hash.split('error_description=')[1]?.split('&')[0] ?? '').replace(/\+/g, ' '))
    }
    rcRef.current = resetClient()
  }, [])
  const rc = () => rcRef.current ?? (rcRef.current = resetClient())

  async function forgot() {
    setNote('')
    if (!email.trim()) { setNote('Type your email above first.'); return }
    setBusy(true)
    const { error } = await rc().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/login` })
    setBusy(false)
    setNote(error ? error.message : 'Check your email for a link to choose a password. Open it on any device.')
  }

  async function setPassword2(e: React.FormEvent) {
    e.preventDefault()
    if (fresh.length < 8) { setNote('Use at least 8 characters.'); return }
    setBusy(true); setNote('')
    const { data } = await rc().auth.getSession()
    if (!data.session) { setBusy(false); setNote('That link has expired. Ask for a new one.'); setResetting(false); return }
    const { error } = await rc().auth.updateUser({ password: fresh })
    setBusy(false)
    if (error) { setNote(error.message); return }
    await rc().auth.signOut()
    history.replaceState(null, '', '/login')
    setResetting(false); setFresh('')
    setNote('Password set. Sign in with it below, here or in the app.')
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setNote('')
    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (error) {
      setNote(error.message.toLowerCase().includes('invalid')
        ? 'That email and password do not match an account.'
        : error.message)
      return
    }
    router.push('/')
    router.refresh()
  }

  if (resetting) {
    return (
      <main className="wrap" style={{ maxWidth: 380, paddingTop: '14vh' }}>
        <form onSubmit={setPassword2} className="card grid" style={{ gap: 12 }}>
          <h2>Choose a password</h2>
          <input className="input" type="password" required placeholder="New password, at least 8 characters" autoComplete="new-password"
            value={fresh} onChange={e => setFresh(e.target.value)} />
          <button className="btn" disabled={busy}>{busy ? 'Saving' : 'Save password'}</button>
          {note && <p className="sub" style={{ color: 'var(--warn)' }}>{note}</p>}
        </form>
      </main>
    )
  }

  return (
    <main className="wrap" style={{ maxWidth: 380, paddingTop: '14vh' }}>
      <div className="brand" style={{ marginBottom: 26, fontSize: 18 }}><span className="dot" />Household</div>
      <form onSubmit={signIn} className="card grid" style={{ gap: 12 }}>
        <div>
          <h2>Sign in</h2>
          <p className="sub" style={{ marginTop: 6 }}>Alex and Sam.</p>
        </div>
        <input className="input" type="email" required placeholder="Email" autoComplete="username"
          value={email} onChange={e => setEmail(e.target.value)} />
        <input className="input" type="password" required placeholder="Password" autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)} />
        <button className="btn" disabled={busy}>{busy ? 'Signing in' : 'Sign in'}</button>
        <button type="button" className="linkish" disabled={busy} onClick={forgot} style={{ justifySelf: 'start' }}>
          Forgot or never set a password?
        </button>
        {note && <p className="sub" style={{ color: 'var(--page-text)' }}>{note}</p>}
      </form>
    </main>
  )
}
