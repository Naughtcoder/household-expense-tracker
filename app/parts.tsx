'use client'
import { CatSelect } from './catselect'
import type { Cat } from '../lib/cats'
import { remainder, type Part } from '../lib/splits'
import { SCOPES, type Scope } from '../lib/scope'

/** One part as typed: strings, so a half-typed amount is not lost. */
export type PartRow = { amount: string; cat: string; scope: Scope; note: string }

export const inrSigned = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
export const toRow = (p: { amount: number | string; category_id: number | null; scope: string; note?: string | null }): PartRow =>
  ({ amount: String(p.amount), cat: p.category_id ? String(p.category_id) : '', scope: (p.scope as Scope) || 'household', note: p.note ?? '' })
export const toPart = (r: PartRow): Part => ({ amount: Number(r.amount), category_id: r.cat ? Number(r.cat) : null, scope: r.scope, note: r.note || null })
export const blankRow = (amount = ''): PartRow => ({ amount, cat: '', scope: 'household', note: '' })

/** The rows of a split, each an amount, a category, who it is for and a
 *  note, with what is left to place against `total` kept in view. Shared by
 *  "Split this payment" and "Plan a payment". */
export function PartsEditor({ total, rows, onChange, categories }: {
  total: number
  rows: PartRow[]
  onChange: (rows: PartRow[]) => void
  categories: Cat[]
}) {
  const set = (i: number, patch: Partial<PartRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const left = remainder(total || 0, rows.map(r => ({ amount: Number(r.amount) || 0 })))
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className="grid" style={{ gap: 8, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="label" style={{ minWidth: 52 }}>Part {i + 1}</span>
            <input className="input num" type="number" step="0.01" inputMode="decimal" aria-label={`Amount of part ${i + 1}`}
              value={r.amount} onChange={e => set(i, { amount: e.target.value })} style={{ flex: 1 }} />
            {rows.length > 2 && (
              <button type="button" className="chip" aria-label={`Remove part ${i + 1}`}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}>×</button>
            )}
          </div>
          <CatSelect categories={categories} value={r.cat} onChange={v => set(i, { cat: v })} ariaLabel={`Category of part ${i + 1}`} />
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <select className="input" aria-label={`Who part ${i + 1} is for`} value={r.scope} onChange={e => set(i, { scope: e.target.value as Scope })}>
              {SCOPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input className="input" placeholder="Note" aria-label={`Note for part ${i + 1}`} value={r.note} onChange={e => set(i, { note: e.target.value })} />
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="chip" onClick={() => onChange([...rows, blankRow(left ? String(left) : '')])}>Add a part</button>
        <span className="sub" style={{ marginLeft: 'auto', color: left === 0 ? 'var(--credit)' : 'var(--warn)' }}>
          {left === 0 ? 'Adds up' : `Left to place: ${inrSigned(left)}`}
        </span>
      </div>
    </>
  )
}
