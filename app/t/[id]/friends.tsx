'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { linkPayback, unlinkPayback } from './actions'

export type Row = { id: string; amount: number; occurred_on: string; merchant: string | null }

const inr = (n: number) => `₹${Math.abs(Number(n)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const day = (s: string) => new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/** On a friend's pay-back: the payment it repays, or a picker of his recent
 *  payments to choose it from. */
export function PaysBack({ self, linked, choices }: { self: string; linked: Row | null; choices: Row[] }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => {
    const r = await fn()
    if (r.error) setNote(r.error); else { setNote(null); setOpen(false); router.refresh() }
  })
  if (linked) return (
    <section className="card">
      <div className="label">Pays back</div>
      <div className="row" style={{ alignItems: 'center' }}>
        <Link href={`/t/${linked.id}`} style={{ minWidth: 0 }}>
          <div className="name">{linked.merchant ?? 'Payment'}</div>
          <div className="who">{day(linked.occurred_on)} · {inr(linked.amount)}</div>
        </Link>
        <button className="chip" disabled={pending} onClick={() => run(() => unlinkPayback(self))}>Undo</button>
      </div>
      {note && <p className="sub" style={{ color: 'var(--warn)' }}>{note}</p>}
    </section>
  )
  return (
    <section className="card">
      <button className="chip" onClick={() => setOpen(o => !o)}>{open ? 'Close' : 'Pays back a payment of mine'}</button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <p className="sub">Your payments from the 30 days before this, likeliest first.</p>
          {choices.length === 0 && <p className="sub">Nothing to match.</p>}
          {choices.map(c => (
            <div key={c.id} className="row" style={{ alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div className="name">{c.merchant ?? 'Payment'}</div>
                <div className="who">{day(c.occurred_on)} · {inr(c.amount)}</div>
              </div>
              <button className="chip" disabled={pending} onClick={() => run(() => linkPayback(self, c.id))}>This one</button>
            </div>
          ))}
          {note && <p className="sub" style={{ color: 'var(--warn)' }}>{note}</p>}
        </div>
      )}
    </section>
  )
}

/** On a payment: everyone who paid their share back, and what it cost him. */
export function SettledUp({ total, paybacks }: { total: number; paybacks: Row[] }) {
  const back = paybacks.reduce((s, p) => s + Math.abs(Number(p.amount)), 0)
  return (
    <section className="card">
      <div className="label">Paid back by friends</div>
      {paybacks.map(p => (
        <Link key={p.id} href={`/t/${p.id}`} className="row" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="name">{p.merchant ?? 'Pay-back'} · {day(p.occurred_on)}</span>
          <span className="num">{inr(p.amount)}</span>
        </Link>
      ))}
      <div className="row" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
        <span>Your share</span><span className="num">{inr(total - back)}</span>
      </div>
    </section>
  )
}
