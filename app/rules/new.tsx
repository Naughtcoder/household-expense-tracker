'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CatOptions } from '../catoptions'
import { createRule, applyRuleToPast } from './actions'
import { ALEX, SAM, type MatchType } from '../../lib/rules'

type Cat = { id: number; name: string; parent_id: number | null }

/** A rule made by hand: WHEN the payee matches, THEN file it this way. */
export function NewRule({ categories }: { categories: Cat[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  if (!open) return <button className="chip" style={{ justifySelf: 'start' }} onClick={() => setOpen(true)}>+ New rule</button>

  const submit = (f: FormData) => start(async () => {
    setMsg(null)
    const num = (k: string) => (String(f.get(k) ?? '').trim() === '' ? null : Number(f.get(k)))
    const r = await createRule({
      text: String(f.get('text') ?? ''),
      matchType: String(f.get('match_type')) as MatchType,
      minAmount: num('min'), maxAmount: num('max'),
      paidBy: String(f.get('paid_by') || '') || null,
      direction: (String(f.get('direction') || '') || null) as 'debit' | 'credit' | null,
      categoryId: num('category_id'),
      scope: String(f.get('scope') || 'household'),
      showAs: String(f.get('show_as') ?? ''),
      ask: f.get('ask') === 'on',
    })
    if (r.error || !r.id) { setMsg({ ok: false, text: r.error ?? 'Not saved.' }); return }
    let text = 'Saved.'
    if (f.get('apply') === 'on') {
      const a = await applyRuleToPast(r.id, false)
      text = a.error ? `Saved, but the past payments were not changed: ${a.error}` : `Saved. ${a.changed} waiting payment${a.changed === 1 ? '' : 's'} filed.`
    }
    setMsg({ ok: true, text })
    router.refresh()
  })

  return (
    <section className="card">
      <form action={submit} style={{ display: 'grid', gap: 10 }}>
        <strong>When the payee</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <select name="match_type" className="input" defaultValue="contains" style={{ maxWidth: 150 }}>
            <option value="exact">is exactly</option>
            <option value="starts">starts with</option>
            <option value="contains">contains</option>
          </select>
          <input name="text" className="input" placeholder="ZEPTO" required />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input name="min" className="input" inputMode="decimal" placeholder="Amount at least (Rs)" />
          <input name="max" className="input" inputMode="decimal" placeholder="Amount at most (Rs)" />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select name="paid_by" className="input" defaultValue="">
            <option value="">Paid by either of us</option>
            <option value={ALEX}>Paid by Alex</option>
            <option value={SAM}>Paid by Sam</option>
          </select>
          <select name="direction" className="input" defaultValue="debit">
            <option value="debit">Money out</option>
            <option value="credit">Money in</option>
            <option value="">Money in or out</option>
          </select>
        </div>
        <strong>Then file it as</strong>
        <select name="category_id" className="input" defaultValue="">
          <option value="">No category (investments and transfers only)</option>
          <CatOptions categories={categories} />
        </select>
        <select name="scope" className="input" defaultValue="household">
          <option value="household">Household</option>
          <option value="claimable">Employer claim</option>
          <option value="investment">Investment</option>
          <option value="transfer">Transfer</option>
        </select>
        <input name="show_as" className="input" placeholder="Show it as (leave blank to keep each payment's own name)" />
        <label className="sub"><input type="checkbox" name="ask" /> Still ask me in Review</label>
        <label className="sub"><input type="checkbox" name="apply" /> Also file past payments still waiting in Review</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={pending}>{pending ? 'Saving' : 'Save rule'}</button>
          <button type="button" className="chip" onClick={() => { setOpen(false); setMsg(null) }}>Close</button>
        </div>
        {msg && <p className="sub" style={{ color: msg.ok ? 'var(--credit)' : 'var(--warn)' }}>{msg.text}</p>}
      </form>
    </section>
  )
}
