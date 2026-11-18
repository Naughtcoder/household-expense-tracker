'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markSettled, unsettle, notClaimable } from './actions'
import { inr, dayLabel } from '../../lib/format'

export type Claim = {
  id: string; amount: number; occurred_on: string; merchant: string | null
  merchant_key: string | null; bank: string | null; claim_settled_on: string | null
}

export type Payout = { id: string; amount: number; occurred_on: string; merchant: string | null }

export function ClaimList({ open, settled, payouts = [] }: { open: Claim[]; settled: Claim[]; payouts?: Payout[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [note, setNote] = useState<string | null>(null)
  const [payout, setPayout] = useState<string>(payouts[0]?.id ?? '')

  const toggle = (id: string) => setPicked(s => {
    const next = new Set(s)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const chosenTotal = open.filter(c => picked.has(c.id)).reduce((s, c) => s + Number(c.amount), 0)

  function run(fn: () => Promise<{ error?: string }>) {
    setNote(null)
    start(async () => {
      const res = await fn()
      if (res.error) setNote(res.error)
      else { setPicked(new Set()); router.refresh() }
    })
  }

  return (
    <>
      <section className="card">
        <h2>Waiting to come back</h2>
        <div className="rows" style={{ marginTop: 8 }}>
          {open.map(c => (
            <div className="row" key={c.id}>
              <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)}
                  style={{ accentColor: 'var(--accent)', marginTop: 4 }} />
                <span>
                  <span className="name" style={{ display: 'block' }}>{c.merchant ?? c.merchant_key ?? 'Unknown'}</span>
                  <span className="who">
                    {dayLabel(c.occurred_on)}{c.bank ? ` · ${c.bank}` : ''} ·{' '}
                    <Link href={`/t/${c.id}?m=${c.occurred_on.slice(0, 7)}&from=claims`}>open</Link> ·{' '}
                    <button className="linkish" onClick={e => { e.preventDefault(); run(() => notClaimable(c.id)) }}>
                      not claimable
                    </button>
                  </span>
                </span>
              </label>
              <div className="amt num">{inr(Number(c.amount))}</div>
            </div>
          ))}
          {open.length === 0 && <div className="empty">Nothing outstanding.</div>}
        </div>

        {picked.size > 0 && payouts.length > 0 && (
          <select className="input" style={{ marginTop: 16 }} value={payout} onChange={e => setPayout(e.target.value)} aria-label="Repaid by">
            {payouts.map(p => <option key={p.id} value={p.id}>Repaid by {p.merchant ?? 'payout'}, {dayLabel(p.occurred_on)}, {inr(Number(p.amount))}</option>)}
            <option value="">Repaid, payout not in the app</option>
          </select>
        )}
        {picked.size > 0 && (
          <button className="btn" style={{ marginTop: 10 }} disabled={pending}
            onClick={() => run(() => markSettled([...picked], payout || null))}>
            {pending ? 'Marking' : `Mark ${picked.size} settled, ${inr(chosenTotal)}`}
          </button>
        )}
        {note && <div className="raw" style={{ color: 'var(--claimable)' }}>{note}</div>}
      </section>

      {settled.length > 0 && (
        <section className="card">
          <div className="label">Already back</div>
          <div className="rows" style={{ marginTop: 8 }}>
            {settled.map(c => (
              <div className="row" key={c.id}>
                <div>
                  <div className="name">{c.merchant ?? c.merchant_key ?? 'Unknown'}</div>
                  <div className="who">
                    spent {dayLabel(c.occurred_on)}, settled {dayLabel(c.claim_settled_on!)} ·{' '}
                    <button className="linkish" onClick={() => run(() => unsettle(c.id))}>undo</button>
                  </div>
                </div>
                <div className="amt num" style={{ opacity: .6 }}>{inr(Number(c.amount))}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
