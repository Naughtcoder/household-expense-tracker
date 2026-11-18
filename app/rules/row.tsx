'use client'
import { useActionState, useState } from 'react'
import { CatOptions } from '../catoptions'
import { updateRule, deleteRule, type Result } from './actions'
import { describeRule, type Rule as RuleRowData } from '../../lib/rules'

type Cat = { id: number; name: string; parent_id: number | null }
type Rule = RuleRowData

export function RuleRow({ rule, categories, label }: { rule: Rule; categories: Cat[]; label: string }) {
  const [open, setOpen] = useState(false)
  const [state, act, pending] = useActionState<Result, FormData>(updateRule, {})
  const [delState, delAct, deleting] = useActionState<Result, FormData>(deleteRule, {})

  return (
    <div className="row" style={{ display: 'block' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div className="name">{rule.merchant || rule.match_key}</div>
          <div className="who" style={{ wordBreak: 'break-word' }}>{describeRule(rule, label)}</div>
        </div>
        <button className="chip" onClick={() => setOpen(o => !o)}>{open ? 'Close' : 'Change'}</button>
      </div>

      {open && (
        <>
          <form action={act} style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            <input type="hidden" name="id" value={rule.id} />
            <select name="category_id" className="input" defaultValue={rule.category_id ?? ''}>
              <option value="">Uncategorised</option>
              <CatOptions categories={categories} />
            </select>
            <select name="default_scope" className="input" defaultValue={rule.default_scope}>
              <option value="household">Household</option>
              <option value="claimable">Claim from Employer</option>
              <option value="investment">Investment</option>
            </select>
            <button className="btn" disabled={pending}>{pending ? 'Saving' : 'Save rule'}</button>
            {state.error && <p className="sub" style={{ color: 'var(--warn)' }}>{state.error}</p>}
            {state.ok && <p className="sub" style={{ color: 'var(--credit)' }}>Saved.</p>}
          </form>
          <form action={delAct} style={{ marginTop: 8 }}>
            <input type="hidden" name="id" value={rule.id} />
            <button className="chip" disabled={deleting} style={{ opacity: .7 }}>Delete this rule</button>
            {delState.error && <p className="sub" style={{ color: 'var(--warn)' }}>{delState.error}</p>}
          </form>
        </>
      )}
    </div>
  )
}
