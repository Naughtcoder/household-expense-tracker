'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { keepBoth, markAsDuplicate } from './actions'
import { inrExact, dayLabel } from '../../lib/format'

export type Pair = {
  id: string; amount: number; occurred_on: string; merchant: string | null
  merchant_key: string | null; bank: string | null; account_tail: string | null
  raw_text: string | null
  twin: {
    id: string; amount: number; occurred_on: string; merchant: string | null
    bank: string | null; account_tail: string | null; raw_text: string | null
  } | null
}

export function DuplicateCard({ row }: { row: Pair }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [problem, setProblem] = useState<string | null>(null)
  const t = row.twin

  function run(fn: () => Promise<{ error?: string }>) {
    setProblem(null)
    start(async () => {
      const res = await fn()
      if (res.error) setProblem(res.error)
      else router.refresh()
    })
  }

  const sameAmount = t && Number(t.amount) === Number(row.amount)
  const gap = t ? Math.abs(Number(row.amount) - Number(t.amount)) : 0

  const name = (m: string | null, k?: string | null) => m ?? k ?? 'an unknown payee'
  const other = t ? `${inrExact(Number(t.amount))} to ${name(t.merchant)} on ${dayLabel(t.occurred_on)}` : null

  // One question, two answers. The bank wording is there if you want it.
  return (
    <section className="card" style={{ borderColor: 'var(--caution)', opacity: pending ? .55 : 1 }}>
      <div className="label" style={{ color: 'var(--caution)' }}>Charged twice?</div>
      <p style={{ marginTop: 8, fontSize: 16, lineHeight: 1.45 }}>
        {inrExact(Number(row.amount))} to <b>{name(row.merchant, row.merchant_key)}</b> on {dayLabel(row.occurred_on)}
        {other ? <> looks like the same payment as {t && <Link href={`/t/${t.id}`}>{other}</Link>}.</> : ' may already be here.'}
        {t && !sameAmount && ` The amounts differ by ${inrExact(gap)}.`}
      </p>

      <div className="chips" style={{ marginTop: 12 }}>
        <button className="chip sel" disabled={pending} onClick={() => run(() => markAsDuplicate(row.id))}>
          Same payment, keep one
        </button>
        <button className="chip" disabled={pending} onClick={() => run(() => keepBoth(row.id))}>
          Two payments, keep both
        </button>
      </div>

      {(row.raw_text || t?.raw_text) && (
        <details className="rq-raw" style={{ marginTop: 10 }}>
          <summary>What the bank said</summary>
          {row.raw_text && <div className="raw">{row.raw_text}</div>}
          {t?.raw_text && <div className="raw">{t.raw_text}</div>}
        </details>
      )}

      {problem && <div className="raw" style={{ marginTop: 12, color: 'var(--caution)' }}>{problem}</div>}
    </section>
  )
}
