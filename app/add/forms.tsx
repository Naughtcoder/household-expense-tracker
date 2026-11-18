'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { paste, addCash } from './actions'
import { CatIcon } from '../caticon'
import { CatSelect } from '../catselect'

type Cat = { id: number; name: string; parent_id: number | null }

// The cash payments that come up most, one tap each. Anything else is in the list.
const QUICK = ['Eating Out', 'Groceries', 'Taxi', 'Fuel', 'Gifts', 'Haircut', 'Parking', 'Supplies']
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']

/**
 * Add, keypad first. Cash is the only thing typed in by hand now that bank
 * emails arrive by themselves, so the amount comes first and big, the way a
 * phone's calculator works, then what it was and the category. The bank
 * message box is still here, folded, for a message that did not arrive.
 *
 * The same form action as before; only the way the fields are filled changed.
 */
export function AddForms({ categories, shared, today }: { categories: Cat[]; shared: string; today: string }) {
  const [pasteState, pasteAction, pastePending] = useActionState(paste, { message: '' })
  const [cashState, cashAction, cashPending] = useActionState(addCash, { message: '' })
  const ta = useRef<HTMLTextAreaElement>(null)
  const [amount, setAmount] = useState('')
  const [cat, setCat] = useState<string>('')
  const [scope, setScope] = useState('household')

  // A share from Android arrives already filled in, so submit without a tap.
  const auto = useRef(false)
  useEffect(() => {
    if (shared && !auto.current) { auto.current = true; ta.current?.form?.requestSubmit() }
  }, [shared])

  // Clear the pad once a payment is saved.
  useEffect(() => { if (cashState.message.endsWith(' added.')) { setAmount(''); setCat('') } }, [cashState])

  function press(k: string) {
    setAmount(a => {
      if (k === '⌫') return a.slice(0, -1)
      if (k === '.' && a.includes('.')) return a
      if (a.includes('.') && a.split('.')[1].length >= 2) return a
      if (a.replace('.', '').length >= 9) return a
      return a === '0' && k !== '.' ? k : a + k
    })
  }

  const quick = QUICK.map(n => categories.find(c => c.name === n)).filter(Boolean) as Cat[]
  const shown = amount ? Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + (amount.endsWith('.') ? '.' : '') : '0'

  return (
    <>
      <section className="card">
        <form action={cashAction} className="grid" style={{ gap: 14 }}>
          <input type="hidden" name="amount" value={amount} />
          <input type="hidden" name="category_id" value={cat} />
          <input type="hidden" name="scope" value={scope} />

          <div className="padamount num" aria-live="polite"><span>₹</span>{shown}</div>

          <input name="merchant" className="input" placeholder="What was it, for example Auto to office" required />

          <div className="tiles" style={{ marginTop: 0 }}>
            {quick.map(c => (
              <button key={c.id} type="button" className="tilebtn" aria-pressed={cat === String(c.id)}
                onClick={() => setCat(cat === String(c.id) ? '' : String(c.id))}
                style={cat === String(c.id) ? { background: 'var(--surface-raised)', color: 'var(--page-text)' } : undefined}>
                <CatIcon name={c.name} size={44} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
          <CatSelect categories={categories} value={cat} onChange={setCat} ariaLabel="Category"
            empty={cat ? 'Category' : 'Other category, or leave it for Review'} />

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input name="occurred_on" className="input" type="date" defaultValue={today} required aria-label="Date" />
            <select className="input" value={scope} onChange={e => setScope(e.target.value)} aria-label="Who it is for">
              <option value="household">Household</option>
              <option value="personal">Personal</option>
              <option value="claimable">Claim from Employer</option>
              <option value="investment">Investment</option>
              <option value="transfer">Own account transfer</option>
            </select>
          </div>

          <div className="keypad">
            {KEYS.map(k => (
              <button key={k} type="button" onClick={() => press(k)} aria-label={k === '⌫' ? 'Delete' : k}>{k}</button>
            ))}
          </div>
          <button className="btn" disabled={cashPending || !Number(amount)}>{cashPending ? 'Adding' : Number(amount) ? `Add ₹${shown}` : 'Type an amount'}</button>
          {cashState.message && <p className="sub" style={{ color: 'var(--lavender)' }}>{cashState.message}</p>}
        </form>
      </section>

      <details className="card" open={Boolean(shared)}>
        <summary><h2 style={{ display: 'inline' }}>Paste a bank message</h2></summary>
        <form action={pasteAction} className="grid" style={{ gap: 12, marginTop: 12 }}>
          <p className="sub">For a payment whose email never arrived. Several at once is fine. Anything unreadable is kept, not dropped.</p>
          <textarea ref={ta} name="text" className="input" rows={5} defaultValue={shared}
            placeholder="Spent Rs.245 On BankA Bank Card 1234 At ZEPTO MARKETPLACE PRIV On 2026-09-14:15:03:08" />
          <button className="btn" disabled={pastePending}>{pastePending ? 'Reading' : 'Read it'}</button>
          {pasteState.message && <p className="sub" style={{ color: 'var(--lavender)' }}>{pasteState.message}</p>}
        </form>
      </details>
    </>
  )
}
