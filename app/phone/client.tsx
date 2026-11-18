'use client'
import { useEffect, useState } from 'react'
import { linkThisPhone } from './actions'
import { IconMessage2, IconCheck, IconHistory, IconBatteryCharging, IconDeviceMobileCheck, IconBell } from '@tabler/icons-react'

type Status = { linked: boolean; permission: string; queued: number; lastSent: number; historyDone: boolean; screenReader?: boolean; notificationReader?: boolean }
type Bridge = {
  status(): Promise<Status>
  link(o: { key: string; url: string }): Promise<Status>
  requestSms(): Promise<Status>
  readHistory(o: { months: number }): Promise<{ found: number; queued: number }>
  openBatterySettings(): Promise<void>
  openScreenReaderSettings?(): Promise<void>
  openNotificationSettings?(): Promise<void>
}

function bridge(): Bridge | null {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: Record<string, unknown> } }).Capacitor
  if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== 'android') return null
  return (cap.Plugins?.SmsBridge as Bridge) ?? null
}

const RESTRICTED = 'Android blocked SMS access. Tap Open below, then the ⋮ at the top right, then Allow restricted settings and confirm. Then tap Permissions, SMS, Allow. Come back here and tap Read.'

/**
 * Turns on the bank SMS reader on an Android phone running the Household app.
 * Three steps, each one tap: link the phone, allow SMS, read past texts.
 */
export function PhoneSetup() {
  const [b, setB] = useState<Bridge | null | undefined>(undefined)
  const [s, setS] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const x = bridge(); setB(x)
    x?.status().then(setS).catch(e => setMsg(String(e)))
    // Coming back from Android's settings: show what changed.
    const back = () => { if (document.visibilityState === 'visible') x?.status().then(setS).catch(() => {}) }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [])

  if (b === undefined) return null
  if (!b) {
    return (
      <div className="card">
        <div className="t" style={{ fontWeight: 700, color: 'var(--page-text)' }}>Open this in the Household app on Android</div>
        <p className="sub" style={{ marginTop: 6 }}>The SMS reader runs inside the Android app. On an iPhone or in a browser there is nothing to set up here.</p>
      </div>
    )
  }

  async function run(f: () => Promise<unknown>) {
    setBusy(true); setMsg(null)
    try { await f(); setS(await b!.status()) } catch (e) { setMsg((e as Error).message ?? String(e)) }
    setBusy(false)
  }

  const step = (done: boolean, Icon: typeof IconCheck, title: string, sub: string, action: string, onClick: () => void) => (
    <div className="irow" style={{ alignItems: 'center' }}>
      <span className="caticon" style={{ width: 40, height: 40, background: 'var(--surface-raised)', color: done ? 'var(--positive)' : 'var(--page-text)' }}>
        {done ? <IconCheck size={22} /> : <Icon size={22} />}
      </span>
      <div className="mid"><div className="t">{title}</div><div className="s">{sub}</div></div>
      {!done && <button className="chip" type="button" disabled={busy} onClick={onClick}>{action}</button>}
    </div>
  )

  return (
    <>
      <div className="card" style={{ paddingBlock: 6 }}>
        {step(!!s?.linked, IconMessage2, 'Link this phone', s?.linked ? 'Linked' : 'Gives this phone its own key', 'Link', () => run(async () => {
          const r = await linkThisPhone('Android SMS reader')
          if (!r.key) throw new Error(r.error ?? 'Could not link')
          await b.link({ key: r.key, url: location.origin })
        }))}
        {step(s?.permission === 'granted', IconMessage2, 'Allow SMS', s?.permission === 'granted' ? 'Bank texts are read as they arrive' : 'Only bank texts are sent, never personal ones', 'Allow', () => run(async () => {
          const r = await b.requestSms()
          // Android blocks SMS for apps installed from a file until restricted
          // settings are allowed on the app's info page. Say how, here.
          if (r.permission !== 'granted') setMsg(RESTRICTED)
        }))}
        {step(false, IconHistory, 'Read past bank texts', s?.historyDone ? 'Done once. Safe to run again, nothing is booked twice' : 'The last 2 years, filed quietly', s?.historyDone ? 'Again' : 'Read', () => run(async () => {
          const r = await b.readHistory({ months: 24 })
          setMsg(`Found ${r.found} bank texts, sending ${r.queued}. They file in the background.`)
        }))}
        {b.openScreenReaderSettings && step(!!s?.screenReader, IconDeviceMobileCheck, 'Read payment screens',
          s?.screenReader ? 'On. PhonePe, Google Pay, Paytm, BHIM and YONO payments are recorded as you pay'
            : 'Catches UPI payments SBI sends no text for. Tap Open, then Installed apps (or Downloaded apps), Household payment reader, switch it on',
          'Open', () => run(async () => {
            setMsg('If Android says the setting is restricted: open Household in Settings › Apps, tap ⋮ at the top right, Allow restricted settings, then try again.')
            await b.openScreenReaderSettings!()
          }))}
        {b.openNotificationSettings && step(!!s?.notificationReader, IconBell, 'Read payment notifications',
          s?.notificationReader ? 'On, for the payment apps only' : 'A backup for the screen reader. Tap Open, then Household, Allow',
          'Open', () => run(() => b.openNotificationSettings!()))}
        {step(false, IconBatteryCharging, 'Keep it running', 'Turn off battery saving for Household', 'Open', () => run(() => b.openBatterySettings()))}
      </div>
      {s && <p className="sub" style={{ margin: '0 2px' }}>{s.queued ? `${s.queued} waiting to send. ` : ''}{s.lastSent ? `Last sent ${new Date(s.lastSent).toLocaleString('en-IN')}.` : ''}</p>}
      {msg && <div className="card" style={{ color: 'var(--page-text)' }}>{msg}</div>}
    </>
  )
}
