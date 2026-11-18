'use client'
import { useActionState, useState } from 'react'
import { CatSelect } from '../../catselect'
import { saveTransaction, deleteTransaction, createTag, type Result } from './actions'

type Cat = { id: number; name: string; parent_id: number | null }
type Tag = { id: number; name: string }

export function EditForm({ txn, categories, tags, chosen, split = false }: {
  txn: { id: string; amount: number; merchant: string | null; occurred_on: string
         category_id: number | null; scope: string; direction: string; note?: string | null }
  categories: Cat[]; tags: Tag[]; chosen: number[]
  /** Split into parts: the amount and direction change only through the split. */
  split?: boolean
}) {
  const [state, act, pending] = useActionState<Result, FormData>(saveTransaction, {})
  // Held in state, not left to the browser: iPhone Safari sometimes showed a
  // different category than the one saved, and one Save would then write it.
  const [cat, setCat] = useState<string>(txn.category_id ? String(txn.category_id) : '')
  // Tags: the ones on this payment as removable chips, the rest in a picker,
  // trips first and newest first, instead of every tag as a checkbox.
  const [picked, setPicked] = useState<number[]>(chosen)
  const [allTags, setAllTags] = useState<Tag[]>(tags)
  const [tagNote, setTagNote] = useState<string | null>(null)
  async function newTag() {
    const name = window.prompt('New tag. For a trip, use "Place, Mon YYYY", for example "Goa, Dec 2026".')
    if (!name) return
    const res = await createTag(name)
    if (res.error || !res.id) { setTagNote(res.error ?? 'Could not make that tag.'); return }
    setTagNote(null)
    if (!allTags.some(t => t.id === res.id)) setAllTags([...allTags, { id: res.id, name: res.name! }])
    if (!picked.includes(res.id)) setPicked([...picked, res.id])
  }
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const when = (n: string) => { const m = n.match(/, ([A-Z][a-z]{2}) (\d{4})/); return m ? Number(m[2]) * 12 + MONTHS.indexOf(m[1]) : -1 }
  const trips = allTags.filter(t => when(t.name) >= 0).sort((a, b) => when(b.name) - when(a.name))
  const others = allTags.filter(t => when(t.name) < 0)

  return (
    <>
      {/* React resets a form after its action runs, back to the values the
          fields were first drawn with. Keying the form on the saved values
          redraws it from what was just saved, so a second Save cannot quietly
          write the old category back. */}
      <form key={[txn.category_id, txn.scope, txn.amount, txn.occurred_on, txn.merchant, txn.direction, txn.note].join('|')}
        action={act} className="card grid" style={{ gap: 12 }}>
        <input type="hidden" name="id" value={txn.id} />

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div className="label">{split ? 'This part' : 'Amount'}</div>
            <input name="amount" className="input num" type="number" step="0.01" defaultValue={txn.amount} required readOnly={split}
              title={split ? 'Change the amounts with Edit the split' : undefined} />
          </div>
          <div>
            <div className="label">Date</div>
            <input name="occurred_on" className="input" type="date" defaultValue={txn.occurred_on} required />
          </div>
        </div>

        <div>
          <div className="label">Merchant</div>
          <input name="merchant" className="input" defaultValue={txn.merchant ?? ''} />
        </div>

        <div>
          <div className="label">Note</div>
          <textarea name="note" className="input" rows={2} defaultValue={txn.note ?? ''}
            placeholder="What it was for, who it was with, anything to remember" />
        </div>

        <div>
          <div className="label">Category</div>
          <CatSelect name="category_id" categories={categories} value={cat} onChange={setCat} />
          {tagNote && <p className="sub" style={{ marginTop: 6, color: 'var(--warn)' }}>{tagNote}</p>}
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div className="label">Who it is for</div>
            <select name="scope" className="input" defaultValue={txn.scope}>
              <option value="household">Household</option>
              <option value="claimable">Claim from Employer</option>
              <option value="investment">Investment</option>
              <option value="transfer">Own account transfer</option>
            </select>
          </div>
          <div>
            <div className="label">Direction</div>
            {split && <input type="hidden" name="direction" value={txn.direction} />}
            <select name={split ? undefined : 'direction'} className="input" defaultValue={txn.direction} disabled={split}>
              <option value="debit">Money out</option>
              <option value="credit">Money in</option>
            </select>
          </div>
        </div>

        <div>
          <div className="label">Tags</div>
          {picked.length > 0 && (
            <div className="chips" style={{ marginBottom: 8 }}>
              {picked.map(id => {
                const t = allTags.find(x => x.id === id)
                return t ? (
                  <span key={id} className="chip sel" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <input type="hidden" name="tag_id" value={id} />
                    {t.name}
                    <button type="button" aria-label={`Remove ${t.name}`} onClick={() => setPicked(picked.filter(x => x !== id))}
                      style={{ background: 'none', border: 0, color: 'inherit', padding: 0, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </span>
                ) : null
              })}
            </div>
          )}
          <select className="input" value="" aria-label="Add a tag"
            onChange={e => {
              if (e.target.value === 'new') { void newTag(); return }
              const v = Number(e.target.value); if (v && !picked.includes(v)) setPicked([...picked, v])
            }}>
            <option value="">Add a tag</option>
            <option value="new">+ New tag…</option>
            {trips.length > 0 && (
              <optgroup label="Trips">
                {trips.filter(t => !picked.includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Other">
                {others.filter(t => !picked.includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            )}
          </select>
        </div>

        <button className="btn" disabled={pending}>{pending ? 'Saving' : 'Save'}</button>
        {state.error && <p className="sub" style={{ color: 'var(--warn)' }}>{state.error}</p>}
        {state.ok && !state.error && <p className="sub" style={{ color: 'var(--credit)' }}>Saved.</p>}
      </form>

      {split && <p className="sub" style={{ marginTop: 8 }}>Category, for and note here are this part&apos;s. The date, payee and who paid are the whole payment&apos;s.</p>}
      <form action={deleteTransaction} style={{ marginTop: 12 }}>
        <input type="hidden" name="id" value={txn.id} />
        <button className="chip" style={{ opacity: .7 }}>Delete this transaction</button>
      </form>
    </>
  )
}
