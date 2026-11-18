'use client'
import { catTree } from '../../lib/cats'
import { CatOptions } from '../catoptions'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveRecurring, removeRecurring, runNow } from './actions'
import { inr } from '../../lib/format'

type Cat = { id: number; name: string; parent_id: number | null }
type Person = { id: string; name: string }
type Entry = {
  id: number; label: string; amount: number | null; last_amount: number | null
  day_of_month: number; category_id: number | null; scope: string; paid_by: string | null; active: boolean
}

export function Manager({ entries, categories, people }: { entries: Entry[]; categories: Cat[]; people: Person[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const tree = catTree(categories)
  const label = (id: number | null) => tree.label(id) || 'Uncategorised'

  function Form({ entry }: { entry?: Entry }) {
    return (
      <form className="grid" style={{ gap: 10, marginTop: 12 }}
        onSubmit={e => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          const raw = String(f.get('amount') ?? '').trim()
          setNote(null)
          start(async () => {
            const res = await saveRecurring({
              id: entry?.id,
              label: String(f.get('label') ?? ''),
              amount: raw === '' ? null : Number(raw),
              dayOfMonth: Number(f.get('day_of_month')),
              categoryId: Number(f.get('category_id')) || null,
              scope: (String(f.get('scope')) as 'household' | 'claimable') || 'household',
              paidBy: String(f.get('paid_by')),
              active: f.get('active') === 'on',
            })
            if (res.error) setNote(res.error)
            else { setEditing(null); router.refresh() }
          })
        }}>
        <input name="label" className="input" placeholder="What is it" defaultValue={entry?.label ?? ''} required />
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input name="amount" className="input num" type="number" step="0.01" placeholder="Amount, blank if it varies"
            defaultValue={entry?.amount ?? ''} />
          <input name="day_of_month" className="input num" type="number" min={1} max={28} placeholder="Day"
            defaultValue={entry?.day_of_month ?? 1} required />
        </div>
        <select name="category_id" className="input" defaultValue={entry?.category_id ?? ''}>
          <option value="">Uncategorised</option>
          <CatOptions categories={categories} />
        </select>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <select name="paid_by" className="input" defaultValue={entry?.paid_by ?? people[0]?.id}>
            {people.map(p => <option key={p.id} value={p.id}>{p.name} pays</option>)}
          </select>
          <select name="scope" className="input" defaultValue={entry?.scope ?? 'household'}>
            <option value="household">Household</option>
            <option value="claimable">Claim from Employer</option>
          </select>
        </div>
        <label className="chip" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', width: 'fit-content' }}>
          <input type="checkbox" name="active" defaultChecked={entry?.active ?? true} style={{ accentColor: 'var(--violet)' }} />
          Active
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={pending}>{pending ? 'Saving' : 'Save'}</button>
          <button type="button" className="chip" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </form>
    )
  }

  return (
    <>
      <section className="card">
        <div className="rows">
          {entries.map(e => (
            <div className="row" key={e.id} style={{ display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center' }}>
                <div>
                  <div className="name" style={{ opacity: e.active ? 1 : .5 }}>{e.label}</div>
                  <div className="who">
                    day {e.day_of_month} · {label(e.category_id)}
                    {e.amount === null && <> · varies{e.last_amount ? `, last ${inr(e.last_amount)}` : ', no amount yet'}</>}
                    {!e.active && ' · paused'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="amt num">{e.amount === null ? '—' : inr(e.amount)}</span>
                  <button className="chip" onClick={() => setEditing(editing === e.id ? null : e.id)}>
                    {editing === e.id ? 'Close' : 'Change'}
                  </button>
                </div>
              </div>
              {editing === e.id && <Form entry={e} />}
              {editing === e.id && (
                <button className="chip" style={{ marginTop: 8, opacity: .7 }} disabled={pending}
                  onClick={() => start(async () => { await removeRecurring(e.id); setEditing(null); router.refresh() })}>
                  Delete
                </button>
              )}
            </div>
          ))}
          {entries.length === 0 && <div className="empty">Nothing set up yet.</div>}
        </div>
      </section>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="chip" onClick={() => setEditing(editing === 'new' ? null : 'new')}>
          {editing === 'new' ? 'Cancel' : 'Add one'}
        </button>
        <button className="chip" disabled={pending}
          onClick={() => start(async () => { const r = await runNow(); setNote(r.note ?? null); router.refresh() })}>
          {pending ? 'Running' : 'Post anything due now'}
        </button>
      </div>

      {editing === 'new' && <section className="card"><Form /></section>}
      {note && <div className="raw">{note}</div>}
    </>
  )
}
