import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Txn } from './data'
import { invested } from '@lib/scope.ts'

const COLS = 'id, amount, direction, occurred_on, occurred_at, merchant, merchant_key, scope, status, category_id, paid_by, bank, account_tail, paid:people!transactions_paid_by_fkey(name)'

/** Every investment payment, all time, newest first, paged past Supabase's
 *  1000-row cap. Money out is invested, money in is an investment coming
 *  back (an FD closing). Plain rows only: the cache is saved as JSON. */
export const useInvestments = () => useQuery({
  queryKey: ['investments'],
  queryFn: async () => {
    const all: Txn[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('transactions').select(COLS)
        .eq('scope', 'investment').neq('status', 'duplicate').neq('status', 'ignored')
        .order('occurred_on', { ascending: false }).order('id').range(from, from + 999)
      if (error) throw error
      all.push(...((data ?? []) as unknown as Txn[]))
      if ((data ?? []).length < 1000) break
    }
    return all
  },
})

export type InvestMonth = { key: string; out: number; in: number; net: number; count: number }
export type InvestPayee = { name: string; out: number; in: number; net: number }

const signed = (t: Txn) => (t.direction === 'debit' ? 1 : -1) * Number(t.amount)

/** Money out, money in and net for each month from the first investment to
 *  `upTo` (yyyy-mm), oldest first, so empty months show as gaps. */
export function investMonths(rows: Txn[], upTo: string): InvestMonth[] {
  if (!rows.length) return []
  const by: Record<string, InvestMonth> = {}
  for (const t of rows) {
    const k = t.occurred_on.slice(0, 7)
    const e = by[k] ?? (by[k] = { key: k, out: 0, in: 0, net: 0, count: 0 })
    if (t.direction === 'debit') e.out += Number(t.amount); else e.in += Number(t.amount)
    e.net += signed(t)
    e.count += 1
  }
  const first = Object.keys(by).sort()[0]
  const list: InvestMonth[] = []
  let [y, m] = first.split('-').map(Number)
  const last = upTo > first ? upTo : first
  for (;;) {
    const k = `${y}-${String(m).padStart(2, '0')}`
    if (k > last) break
    list.push(by[k] ?? { key: k, out: 0, in: 0, net: 0, count: 0 })
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return list
}

/** Net by payee (Zerodha (ICCL), SBI fixed deposit), biggest first. The
 *  closing of an FD files under its own payee name, so "SBI fixed deposit
 *  closed" joins "SBI fixed deposit". */
export function investPayees(rows: Txn[]): InvestPayee[] {
  const by: Record<string, InvestPayee> = {}
  for (const t of rows) {
    const name = payeeOf(t)
    const e = by[name] ?? (by[name] = { name, out: 0, in: 0, net: 0 })
    if (t.direction === 'debit') e.out += Number(t.amount); else e.in += Number(t.amount)
    e.net += signed(t)
  }
  return Object.values(by).sort((a, b) => (b.out + b.in) - (a.out + a.in))
}

export const payeeOf = (t: Txn) => (t.merchant ?? t.merchant_key ?? 'Unknown').replace(/\s+closed$/i, '')

/** Net invested, by the same rule as the website (lib/scope.ts). */
export const netOf = (rows: Txn[]) => invested(rows)
