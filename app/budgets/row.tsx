'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { setBudget } from './actions'
import { inr } from '../../lib/format'

export function BudgetRow({ id, name, average, current, thisMonth }: {
  id: number; name: string; average: number; current: number | null; thisMonth: number
}) {
  const [value, setValue] = useState(current ? String(Math.round(current)) : '')
  const [saved, setSaved] = useState(current)
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const n = Number(value.replace(/[^\d.]/g, '')) || null
  const dirty = (n ?? null) !== (saved ? Math.round(saved) : null)

  function save(next: number | null) {
    setProblem(null)
    start(async () => {
      const res = await setBudget(id, next)
      if (res.error) { setProblem(res.error); return }
      setSaved(next); setValue(next ? String(next) : '')
    })
  }

  return (
    <div className="row" style={{ alignItems: 'center' }}>
      <div>
        <Link className="name" href={`/c/${id}`} style={{ color: 'inherit' }}>{name} ›</Link>
        <div className="who">
          averages {inr(average)} a month · {inr(thisMonth)} so far this month
          {problem && <span style={{ color: 'var(--negative)' }}> · {problem}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input className="input num" inputMode="numeric" aria-label={`${name} monthly budget`}
          value={value} onChange={e => setValue(e.target.value)} placeholder="No limit"
          style={{ width: 110, textAlign: 'right' }} />
        {dirty
          ? <button className="btn" type="button" disabled={pending} onClick={() => save(n)}>{pending ? '…' : 'Save'}</button>
          : !saved && average > 0
            ? <button className="chip" type="button" disabled={pending} onClick={() => save(Math.round(average / 500) * 500 || 500)}>Use average</button>
            : null}
      </div>
    </div>
  )
}
