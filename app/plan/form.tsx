'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { catTree, type Cat } from '../../lib/cats'
import { checkPlan, type Part, type PlanInput } from '../../lib/splits'
import { PartsEditor, toRow, toPart, blankRow, inrSigned, type PartRow } from '../parts'
import { createPlan, updatePlan, cancelPlan } from './actions'

export type PlanRow = {
  id: string; paid_by: string; payee_hint: string | null; expected_amount: number | string; tolerance: number | string
  window_from: string; window_to: string; parts: Part[]; note: string | null; status: string
  applied_to: string | null; applied_at: string | null
}

type Draft = { paidBy: string; payee: string; expected: string; tolerance: string; from: string; to: string; note: string; rows: PartRow[] }

const plus = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86400000).toISOString().slice(0, 10)
const day = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/** The open plans, each with Edit and Cancel, and the form for a new one. */
export function Plans({ plans, categories, people, me, today }: {
  plans: PlanRow[]; categories: Cat[]; people: Record<string, string>; me: string; today: string
}) {
  const router = useRouter()
  const tree = catTree(categories)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const fresh = (): Draft => ({ paidBy: me, payee: '', expected: '', tolerance: '0', from: today, to: plus(today, 14), note: '', rows: [blankRow(), blankRow()] })
  const from = (p: PlanRow): Draft => ({
    paidBy: p.paid_by, payee: p.payee_hint ?? '', expected: String(Number(p.expected_amount)), tolerance: String(Number(p.tolerance)),
    from: p.window_from.slice(0, 10), to: p.window_to.slice(0, 10), note: p.note ?? '', rows: p.parts.map(toRow),
  })
  const input = (d: Draft): PlanInput => ({
    paidBy: d.paidBy, payeeHint: d.payee || null, expected: Number(d.expected), tolerance: Number(d.tolerance || 0),
    from: d.from, to: d.to, parts: d.rows.map(toPart), note: d.note || null,
  })
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => {
    const r = await fn()
    if (r.error) setNote(r.error); else { setNote(null); setDraft(null); setEditing(null); router.refresh() }
  })

  if (draft) {
    const wrong = checkPlan(input(draft))
    const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
    return (
      <section className="card grid" style={{ gap: 12 }}>
        <div className="label">{editing ? 'Change the plan' : 'A new plan'}</div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div className="label">Amount you will pay</div>
            <input className="input num" type="number" step="0.01" inputMode="decimal" value={draft.expected} onChange={e => set({ expected: e.target.value })} />
          </div>
          <div>
            <div className="label">Leeway, rupees</div>
            <input className="input num" type="number" step="0.01" min="0" inputMode="decimal" value={draft.tolerance} onChange={e => set({ tolerance: e.target.value })} />
          </div>
        </div>
        <div>
          <div className="label">Payee</div>
          <input className="input" value={draft.payee} onChange={e => set({ payee: e.target.value })} placeholder="Words in the payee's name or account, split by |, for example SHARMA | 1234" />
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <div className="label">Who pays</div>
            <select className="input" value={draft.paidBy} onChange={e => set({ paidBy: e.target.value })}>
              {Object.entries(people).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
          <div>
            <div className="label">From</div>
            <input className="input" type="date" value={draft.from} onChange={e => set({ from: e.target.value })} />
          </div>
          <div>
            <div className="label">To</div>
            <input className="input" type="date" value={draft.to} onChange={e => set({ to: e.target.value })} />
          </div>
        </div>
        <div className="label">Parts</div>
        <PartsEditor total={Number(draft.expected) || 0} rows={draft.rows} onChange={rows => set({ rows })} categories={categories} />
        <div>
          <div className="label">Note</div>
          <input className="input" value={draft.note} onChange={e => set({ note: e.target.value })} placeholder="Anything to remember about it" />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={pending || !!wrong}
            onClick={() => run(() => editing ? updatePlan(editing, input(draft)) : createPlan(input(draft)))}>{pending ? 'Saving' : 'Save the plan'}</button>
          <button type="button" className="chip" onClick={() => { setDraft(null); setEditing(null); setNote(null) }}>Cancel</button>
        </div>
        {wrong && <p className="sub" style={{ color: 'var(--warn)' }}>{wrong}</p>}
        {note && <p className="sub" style={{ color: 'var(--warn)' }}>{note}</p>}
      </section>
    )
  }

  return (
    <>
      <section className="card">
        <div className="label">Waiting for the payment</div>
        {plans.length === 0 && <div className="empty">No plans open.</div>}
        {plans.map(p => (
          <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div className="name">{p.payee_hint ?? 'Any payee'}</div>
              <div className="num">{inrSigned(Number(p.expected_amount))}{Number(p.tolerance) ? ` ± ${inrSigned(Number(p.tolerance))}` : ''}</div>
            </div>
            <div className="who">{people[p.paid_by] ?? ''} · {day(p.window_from)} to {day(p.window_to)}</div>
            {p.parts.map((x, i) => (
              <div key={i} className="splitpart">
                <span>{tree.label(x.category_id) || 'No category'}{x.note ? ` · ${x.note}` : ''}</span>
                <span className="num">{inrSigned(Number(x.amount))}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="chip" disabled={pending} onClick={() => { setEditing(p.id); setDraft(from(p)); setNote(null) }}>Edit</button>
              <button className="chip" disabled={pending} onClick={() => run(() => cancelPlan(p.id))}>Cancel the plan</button>
            </div>
          </div>
        ))}
        {note && <p className="sub" style={{ color: 'var(--warn)' }}>{note}</p>}
      </section>
      <button className="btn" onClick={() => { setEditing(null); setDraft(fresh()); setNote(null) }}>Plan a payment</button>
    </>
  )
}
