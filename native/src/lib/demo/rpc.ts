// The database functions the app calls, worked out in the demo's memory
// with the same rules as the SQL in db/.

import { countsAsSpend } from '@lib/scope.ts'
import { db, newId, type Row } from './store'

const live = (t: Row) => t.status !== 'duplicate' && t.status !== 'ignored'
const inRange = (t: Row, from: unknown, to: unknown) => String(t.occurred_on) >= String(from) && String(t.occurred_on) <= String(to)

function topOf(id: number | null) {
  if (id == null) return null
  let c = db.categories.find(x => x.id === id)
  while (c && c.parent_id != null) c = db.categories.find(x => x.id === c!.parent_id)
  return (c?.id as number) ?? id
}

/** Split a payment into parts, as split_payment() does. */
export function splitPayment(id: string, parts: { amount: number; category_id?: number | null; scope?: string; note?: string | null }[]) {
  const t = db.transactions.find(x => x.id === id)
  if (!t) throw new Error('That payment was not found.')
  if (t.split_of) throw new Error('That is one part of a split payment. Open the whole payment to change it.')
  if (t.direction !== 'debit') throw new Error('Only money out can be split.')
  if (parts.length < 2) throw new Error('A split needs at least two parts.')
  const total = Number(t.split_total ?? t.amount)
  const sum = Math.round(parts.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100
  if (sum !== total) throw new Error(`The parts add up to ${sum}, not the payment's ${total}.`)
  db.transactions = db.transactions.filter(x => x.split_of !== id)
  const [first, ...rest] = parts
  t.split_restore ??= { amount: t.amount, category_id: t.category_id, scope: t.scope, note: t.note }
  Object.assign(t, { amount: Number(first.amount), category_id: first.category_id ?? null, scope: first.scope ?? 'household', note: first.note || null, split_total: total, status: t.status === 'review' ? 'confirmed' : t.status })
  for (const p of rest) {
    db.transactions.push({ ...t, id: newId('transactions'), amount: Number(p.amount), category_id: p.category_id ?? null, scope: p.scope ?? 'household', note: p.note || null, split_of: id, split_total: null, split_restore: null })
  }
  return id
}

export function rpc(name: string, a: Record<string, unknown>): unknown {
  switch (name) {
    case 'month_totals': {
      const by: Record<string, number> = {}
      for (const t of db.transactions) {
        if (!live(t) || !inRange(t, a.p_from, a.p_to)) continue
        if (t.direction !== (a.p_in ? 'credit' : 'debit')) continue
        if (['claimable', 'investment', 'transfer'].includes(String(t.scope)) || t.category_id === 18) continue
        if (a.p_who && t.paid_by !== a.p_who) continue
        const k = String(t.occurred_on).slice(0, 7)
        by[k] = (by[k] ?? 0) + Number(t.amount)
      }
      return Object.entries(by).map(([month, total]) => ({ month, total }))
    }
    case 'spend_by_top':
    case 'spend_by_category': {
      const by: Record<string, { month: string; category_id: number | null; top_id: number | null; n: number; total: number }> = {}
      for (const t of db.transactions) {
        if (!live(t) || !inRange(t, a.p_from, a.p_to) || !countsAsSpend(t as never)) continue
        const month = String(t.occurred_on).slice(0, 7)
        const top = topOf(t.category_id as number | null)
        const k = name === 'spend_by_top' ? `${month}|${top}` : `${month}|${t.category_id}`
        const e = (by[k] ??= { month, category_id: t.category_id as number | null, top_id: top, n: 0, total: 0 })
        e.n += 1; e.total += Number(t.amount)
      }
      return Object.values(by).map(e => (name === 'spend_by_top' ? { month: e.month, top_id: e.top_id, n: e.n, total: e.total } : e))
    }
    case 'possible_duplicates': {
      const amt = Number(a.p_amount), on = new Date(String(a.p_date)).getTime()
      return db.transactions.filter(t => live(t) && t.direction === a.p_direction && !t.split_of
        && Math.abs(new Date(String(t.occurred_on)).getTime() - on) <= 2 * 864e5
        && Math.abs(Number(t.split_total ?? t.amount) - amt) <= Math.max(amt * 0.01, 1)
        && String(t.merchant_key ?? '').slice(0, 6) === String(a.p_merchant ?? '').slice(0, 6)).slice(0, 3)
    }
    case 'closest_merchant': return []
    case 'apply_planned_split': {
      const plan = db.planned_splits.find(p => p.id === a.p_plan)
      if (!plan) throw new Error('That plan was not found.')
      if (plan.status !== 'open') throw new Error('That plan has already been used or was cancelled.')
      splitPayment(String(a.p_txn), (a.p_parts ?? plan.parts) as never)
      Object.assign(plan, { status: 'applied', applied_to: a.p_txn, applied_at: new Date().toISOString() })
      return a.p_txn
    }
    default: throw new Error(`${name} is not in the demo.`)
  }
}
