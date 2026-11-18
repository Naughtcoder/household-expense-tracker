'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { catTree, type Cat } from '../../../lib/cats'
import { checkParts, remainder, type Part } from '../../../lib/splits'
import { SCOPES } from '../../../lib/scope'
import { PartsEditor, toRow, toPart, blankRow, inrSigned as inr, type PartRow as Row } from '../../parts'
import { splitPayment, unsplitPayment, applyPlan } from './actions'

export type ShownPart = { id: string; amount: number; category_id: number | null; scope: string; note: string | null }
export type PlanOffer = { id: string; expected: number; diff: number; payee: string | null; parts: Part[] }


/**
 * On a payment page: the parts of a split payment, with Edit and Put back as
 * one; or "Split this payment", and a planned split that matches it. The
 * editor keeps a running "left to place" so the parts always add up to what
 * the bank took before Save is allowed.
 */
export function Split({ id, total, month, current, parts, categories, plans }: {
  id: string
  total: number
  month: string
  current: { category_id: number | null; scope: string; note: string | null }
  parts: ShownPart[]
  categories: Cat[]
  plans: PlanOffer[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const tree = catTree(categories)
  const split = parts.length > 1

  const run = (fn: () => Promise<{ error?: string }>) => start(async () => {
    const r = await fn()
    if (r.error) setNote(r.error); else { setNote(null); setRows(null); setPlanId(null); router.refresh() }
  })
  const edit = (from: Row[], plan: string | null = null) => { setRows(from); setPlanId(plan); setNote(null) }

  if (rows) {
    const left = remainder(total, rows.map(r => ({ amount: Number(r.amount) || 0 })))
    const wrong = checkParts(total, rows.map(toPart))
    return (
      <section className="card grid" style={{ gap: 12 }}>
        <div className="label">{planId ? 'Apply the planned split' : split ? 'Edit the split' : 'Split this payment'}</div>
        <p className="sub">The parts must add up to {inr(total)}. A part can be below zero, for money the payee paid back.</p>
        <PartsEditor total={total} rows={rows} onChange={setRows} categories={categories} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={pending || !!wrong}
            onClick={() => run(() => planId ? applyPlan(planId, id, rows.map(toPart)) : splitPayment(id, rows.map(toPart)))}>
            {pending ? 'Saving' : 'Save'}
          </button>
          <button type="button" className="chip" onClick={() => { setRows(null); setPlanId(null); setNote(null) }}>Cancel</button>
        </div>
        {wrong && left === 0 && <p className="sub" style={{ color: 'var(--warn)' }}>{wrong}</p>}
        {note && <p className="sub" style={{ color: 'var(--warn)' }}>{note}</p>}
      </section>
    )
  }

  if (split) {
    return (
      <section className="card">
        <div className="label">Split into {parts.length}</div>
        {parts.map(p => (
          <div key={p.id} className="row" style={{ alignItems: 'center' }}>
            <Link href={`/t/${p.id}`} style={{ minWidth: 0, flex: 1 }}>
              <div className="name">{tree.label(p.category_id) || (p.scope === 'transfer' ? 'Transfer' : 'No category')}</div>
              <div className="who">{p.note ?? ''}{p.scope !== 'household' ? `${p.note ? ' · ' : ''}${SCOPES.find(s => s.value === p.scope)?.label ?? p.scope}` : ''}</div>
            </Link>
            {p.category_id
              ? <Link className="num" href={`/c/${p.category_id}?m=${month}`}>{inr(p.amount)}</Link>
              : <span className="num">{inr(p.amount)}</span>}
          </div>
        ))}
        <p className="sub" style={{ marginTop: 8 }}>Each part counts in its own category. Together they are the {inr(total)} the bank took.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="chip" disabled={pending} onClick={() => edit(parts.map(toRow))}>Edit the split</button>
          <button className="chip" disabled={pending} onClick={() => run(() => unsplitPayment(id))}>Put back as one</button>
        </div>
        {note && <p className="sub" style={{ color: 'var(--warn)' }}>{note}</p>}
      </section>
    )
  }

  return (
    <>
      {plans.map(pl => (
        <section key={pl.id} className="card">
          <div className="label">Planned split{pl.payee ? ` for ${pl.payee}` : ''}</div>
          <p className="sub" style={{ marginTop: 4 }}>
            {pl.diff === 0
              ? `You planned this payment of ${inr(pl.expected)}.`
              : `Matches your planned split, but the amount differs: planned ${inr(pl.expected)}, paid ${inr(total)} (${pl.diff > 0 ? 'more' : 'less'} by ${inr(Math.abs(pl.diff))}). Change the parts to fit.`}
          </p>
          {pl.parts.map((p, i) => (
            <div key={i} className="row">
              <div className="name">{tree.label(p.category_id) || 'No category'}{p.note ? <span className="who"> · {p.note}</span> : null}</div>
              <span className="num">{inr(Number(p.amount))}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {pl.diff === 0
              ? <button className="btn" disabled={pending} onClick={() => run(() => applyPlan(pl.id, id, null))}>Apply the plan</button>
              : <button className="btn" disabled={pending} onClick={() => edit(pl.parts.map(toRow), pl.id)}>Apply with changed parts</button>}
          </div>
          {note && <p className="sub" style={{ color: 'var(--warn)' }}>{note}</p>}
        </section>
      ))}
      <section className="card">
        <button className="chip" onClick={() => edit([
          toRow({ amount: total, category_id: current.category_id, scope: current.scope, note: current.note }),
          blankRow(),
        ])}>Split this payment</button>
        <p className="sub" style={{ marginTop: 6 }}>One payment that paid for more than one thing, such as rent and maintenance together.</p>
      </section>
    </>
  )
}
