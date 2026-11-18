'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { fileTransaction, ignoreTransaction } from './actions'
import { CategoryPicker, type Cat } from './picker'
import { inrExact, dayLabel } from '../../lib/format'
import { SCOPES, isScope, type Scope } from '../../lib/scope'

export type ReviewRow = {
  id: string; amount: number; occurred_on: string; merchant: string | null
  merchant_key: string | null; merchant_raw: string | null; bank: string | null
  scope: string; currency?: string | null
  entered: { name: string } | null
  payer?: { name: string } | null
}

export function ReviewCard({ row, categories, suggested, sameMerchant }: {
  row: ReviewRow
  categories: Cat[]
  suggested: Cat[]
  /** How many other rows are waiting from this same merchant. */
  sameMerchant: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [problem, setProblem] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope>(isScope(row.scope) ? row.scope : 'household')
  const [applyToAll, setApplyToAll] = useState(sameMerchant > 0)

  function file(categoryId: number | null) {
    setProblem(null)
    start(async () => {
      const res = await fileTransaction({
        id: row.id, categoryId, scope,
        merchantKey: row.merchant_key, merchant: row.merchant,
        applyToAll: applyToAll && sameMerchant > 0,
      })
      if (res.error) setProblem(res.error)
      if (res.ok) router.refresh()
    })
  }

  return (
    <section className="card" style={{ opacity: pending ? 0.55 : 1 }}>
      <div className="row" style={{ borderBottom: 0, paddingTop: 0 }}>
        <div>
          <div className="name" style={{ fontSize: 16 }}>{row.merchant ?? row.merchant_key ?? 'Unknown merchant'}</div>
          <div className="who">
            {dayLabel(row.occurred_on)} · {row.bank ?? 'unknown bank'} · entered by {row.entered?.name ?? '?'}
          </div>
        </div>
        <div className="amt num" style={{ fontSize: 18 }}>{inrExact(Number(row.amount))}</div>
      </div>

      {row.merchant_raw && row.merchant_raw !== row.merchant_key && (
        <div className="raw">{row.merchant_raw}</div>
      )}

      <div className="label" style={{ marginTop: 16 }}>Whose spend</div>
      <div className="chips">
        {SCOPES.map(s => (
          <button key={s.value} type="button" onClick={() => setScope(s.value)}
            className={`chip${scope === s.value ? ' sel' : ''}`} aria-pressed={scope === s.value}>
            {s.label}
          </button>
        ))}
      </div>

      {sameMerchant > 0 && (
        <label className={`chip${applyToAll ? ' sel' : ''}`}
          style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <input type="checkbox" checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)}
            style={{ accentColor: 'var(--violet)' }} />
          File all {sameMerchant + 1} from this merchant
        </label>
      )}

      {scope === 'investment' ? (
        // Money moved into a fund is not spending, so it needs no category.
        <button className="btn" type="button" disabled={pending} style={{ marginTop: 16 }}
          onClick={() => file(null)}>
          {applyToAll && sameMerchant > 0 ? `File all ${sameMerchant + 1} as investments` : 'File as investment'}
        </button>
      ) : (
        <>
          <div className="label" style={{ marginTop: 16 }}>
            {applyToAll && sameMerchant > 0
              ? `Pick a category and all ${sameMerchant + 1} file at once`
              : 'Pick a category and this files'}
          </div>

          <CategoryPicker categories={categories} suggested={suggested} onPick={file} disabled={pending} />
        </>
      )}

      <button className="chip" type="button" disabled={pending}
        style={{ opacity: .7, marginTop: 16 }}
        onClick={() => {
          setProblem(null)
          start(async () => {
            const res = await ignoreTransaction(row.id)
            if (res.error) setProblem(res.error)
            if (res.ok) router.refresh()
          })
        }}>
        Not a real expense, ignore
      </button>

      {problem && <div className="raw" style={{ marginTop: 12, color: 'var(--warn)' }}>{problem}</div>}
    </section>
  )
}
