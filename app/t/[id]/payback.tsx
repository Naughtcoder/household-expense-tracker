'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { coverPayment, uncoverPayment } from './actions'

export type Line = { id: string; amount: number; occurred_on: string; merchant: string | null }

const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const day = (s: string) => new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/** On a payment: who paid it back, with undo; or a picker of the other
 *  person's transfers. On a transfer: what it paid for, or a picker of the
 *  payments it could pay for. */
export function Payback({ mode, self, linked, choices, other }: {
  mode: 'payment' | 'transfer'
  self: string
  linked: Line[]
  choices: Line[]
  other: string
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => {
    const r = await fn()
    if (r.error) setNote(r.error); else { setNote(null); setOpen(false); router.refresh() }
  })

  if (linked.length) {
    return (
      <section className="card">
        <div className="label">{mode === 'payment' ? `Paid back by ${other}` : 'Pays for'}</div>
        {linked.map(l => (
          <div key={l.id} className="row" style={{ alignItems: 'center' }}>
            <Link href={`/t/${l.id}`} style={{ minWidth: 0 }}>
              <div className="name">{l.merchant ?? 'Payment'}</div>
              <div className="who">{day(l.occurred_on)} · {inr(l.amount)}</div>
            </Link>
            <button className="chip" disabled={pending}
              onClick={() => run(() => uncoverPayment(mode === 'payment' ? self : l.id))}>Undo</button>
          </div>
        ))}
        <p className="sub" style={{ marginTop: 8 }}>
          {mode === 'payment' ? `This counts as ${other}'s spending now.` : 'Those count as spending of whoever sent this.'}
        </p>
        {note && <p className="sub" style={{ color: 'var(--warn)' }}>{note}</p>}
      </section>
    )
  }

  return (
    <section className="card">
      <button className="chip" onClick={() => setOpen(o => !o)}>
        {open ? 'Close' : mode === 'payment' ? `${other} paid me back for this` : 'This pays back a payment'}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {choices.length === 0 && <p className="sub">
            {mode === 'payment' ? `No transfer from ${other} in the 30 days after this.` : 'No payment in the 30 days before this to match.'}
          </p>}
          {choices.map(c => (
            <div key={c.id} className="row" style={{ alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div className="name">{c.merchant ?? 'Payment'}</div>
                <div className="who">{day(c.occurred_on)} · {inr(c.amount)}</div>
              </div>
              <button className="chip" disabled={pending}
                onClick={() => run(() => mode === 'payment' ? coverPayment(self, c.id) : coverPayment(c.id, self))}>This one</button>
            </div>
          ))}
          {note && <p className="sub" style={{ color: 'var(--warn)' }}>{note}</p>}
        </div>
      )}
    </section>
  )
}
