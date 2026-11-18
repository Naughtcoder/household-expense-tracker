import { useQuery, useQueryClient } from '@tanstack/react-query'
import { countsAsSpend } from '@lib/scope.ts'
import { findSubscriptions, type Charge } from '@lib/insights.ts'
import { allRows } from '@lib/pages.ts'
import { supabase } from './supabase'
import { refreshAll } from './data'

// Reads for the setup and money screens (Budgets, Repeat charges, Recurring,
// Accounts, Merchants, Rules). Each asks the database exactly what the
// website's page asks, so the numbers match. Writes go through act().

const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The month's span, as the website's monthRange() works it out. */
export function monthOf(key: string) {
  const [y, m] = key.split('-').map(Number)
  const from = new Date(y, m - 1, 1), to = new Date(y, m, 0)
  const k = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return {
    key, from: isoLocal(from), to: isoLocal(to),
    label: from.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    prev: k(new Date(y, m - 2, 1)), next: k(new Date(y, m, 1)),
    isCurrent: key === k(new Date()),
  }
}

// Plain objects, not Maps: every query result is saved on the phone as JSON
// (lib/query.tsx), and a Map comes back from that as {}.
const sumTop = (rows: { top_id: number | null; total: number }[] | null) => {
  const m: Record<number, number> = {}
  for (const r of rows ?? []) if (r.top_id) m[r.top_id] = (m[r.top_id] ?? 0) + Number(r.total)
  return m
}

/** Top groups, their limits, the six whole months before, and this month. */
export const useBudgets = (key: string) => useQuery({
  queryKey: ['budgets', key],
  queryFn: async () => {
    const month = monthOf(key)
    const [y, mo] = key.split('-').map(Number)
    const from = new Date(Date.UTC(y, mo - 7, 1)).toISOString().slice(0, 10)
    const to = new Date(Date.UTC(y, mo - 1, 0)).toISOString().slice(0, 10)
    const [cats, budgets, hist, now] = await Promise.all([
      supabase.from('categories').select('id, name, parent_id').is('parent_id', null).order('name'),
      supabase.from('budgets').select('category_id, monthly'),
      supabase.rpc('spend_by_top', { p_from: from, p_to: to }),
      supabase.rpc('spend_by_top', { p_from: month.from, p_to: month.to }),
    ])
    for (const r of [cats, budgets, hist, now]) if (r.error) throw r.error
    return {
      cats: (cats.data ?? []) as { id: number; name: string; parent_id: number | null }[],
      limit: Object.fromEntries(((budgets.data ?? []) as { category_id: number; monthly: number }[]).map(b => [b.category_id, Number(b.monthly)])) as Record<number, number>,
      six: sumTop(hist.data as { top_id: number | null; total: number }[] | null),
      cur: sumTop(now.data as { top_id: number | null; total: number }[] | null),
    }
  },
})

type ChargeRow = Charge & { cat: { name: string } | null }

/** Payees that charge about once a month, found from six months of payments. */
export const useSubscriptions = () => useQuery({
  queryKey: ['subscriptions'],
  queryFn: async () => {
    const now = new Date()
    // The first of the month five months back, in the phone's own calendar.
    const since = isoLocal(new Date(now.getFullYear(), now.getMonth() - 5, 1))
    const raw = await allRows<ChargeRow>((a, b) => (supabase.from('transactions')
      .select('merchant_key, merchant, amount, occurred_on, cat:categories(name)')
      .gte('occurred_on', since).eq('direction', 'debit')
      .not('scope', 'in', '(claimable,investment,transfer)')
      .neq('status', 'duplicate').neq('status', 'ignored')
      .order('occurred_on').range(a, b)) as unknown as PromiseLike<{ data: ChargeRow[] | null; error: { message: string } | null }>)
    return findSubscriptions(raw.map(r => ({ ...r, category: r.cat?.name ?? null })), now)
  },
})

export type Recurring = {
  id: number; label: string; amount: number | null; last_amount: number | null
  day_of_month: number; category_id: number | null; scope: string; paid_by: string | null; active: boolean
}

export const useRecurring = () => useQuery({
  queryKey: ['recurring'],
  queryFn: async () => {
    const { data, error } = await supabase.from('recurring').select('id, label, amount, last_amount, day_of_month, category_id, scope, paid_by, active').order('day_of_month')
    if (error) throw error
    return (data ?? []) as Recurring[]
  },
})

export const usePeople = () => useQuery({
  queryKey: ['people'],
  queryFn: async () => {
    const { data, error } = await supabase.from('people').select('id, name').order('name')
    if (error) throw error
    return (data ?? []) as { id: string; name: string }[]
  },
  staleTime: 60 * 60_000,
})

export type Account = { bank: string; tail: string; balance: number | null; asOf: string | null; seen: number; moved: number }

/** One entry per bank and account; the newest message carrying a balance wins. */
export const useAccounts = () => useQuery({
  queryKey: ['accounts'],
  queryFn: async () => {
    const { data, error } = await supabase.from('transactions')
      .select('bank, account_tail, balance, occurred_on, created_at, amount, direction')
      .not('account_tail', 'is', null)
      .order('occurred_on', { ascending: false }).limit(2000)
    if (error) throw error
    const accounts = new Map<string, Account>()
    for (const r of (data ?? []) as { bank: string | null; account_tail: string; balance: number | null; occurred_on: string; amount: number; direction: string }[]) {
      const key = `${r.bank ?? 'Unknown'}::${r.account_tail}`
      const a = accounts.get(key) ?? { bank: r.bank ?? 'Unknown', tail: r.account_tail, balance: null, asOf: null, seen: 0, moved: 0 }
      a.seen += 1
      a.moved += r.direction === 'debit' ? -Number(r.amount) : Number(r.amount)
      if (a.balance === null && r.balance !== null) { a.balance = Number(r.balance); a.asOf = r.occurred_on }
      accounts.set(key, a)
    }
    return [...accounts.values()].sort((a, b) => (b.balance ?? -1) - (a.balance ?? -1))
  },
})

export type Merchant = { key: string; name: string; total: number; count: number; last: string }

/** Spending per payee, biggest first. Claimable, investment and transfers are left out. */
export const useMerchants = () => useQuery({
  queryKey: ['merchants'],
  queryFn: async () => {
    const { data, error } = await supabase.from('transactions')
      .select('merchant_key, merchant, amount, direction, occurred_on, scope')
      .neq('status', 'duplicate').neq('status', 'ignored')
      .not('merchant_key', 'is', null)
      .order('occurred_on', { ascending: false }).limit(4000)
    if (error) throw error
    const by = new Map<string, Merchant>()
    for (const r of (data ?? []) as { merchant_key: string; merchant: string | null; amount: number; direction: string; occurred_on: string; scope: string }[]) {
      if (!countsAsSpend(r)) continue
      const m = by.get(r.merchant_key) ?? { key: r.merchant_key, name: r.merchant ?? r.merchant_key, total: 0, count: 0, last: r.occurred_on }
      m.total += Number(r.amount); m.count += 1
      if (r.occurred_on > m.last) m.last = r.occurred_on
      by.set(r.merchant_key, m)
    }
    return [...by.values()].sort((a, b) => b.total - a.total)
  },
})

/** A payee rule with its conditions. Plain fields only, so it caches cleanly. */
export type Rule = {
  id: number; match_key: string; match_type: 'exact' | 'contains' | 'starts'; merchant: string | null
  category_id: number | null; default_scope: string; ask: boolean
  min_amount: number | null; max_amount: number | null; paid_by: string | null; direction: 'debit' | 'credit' | null
}

export const useRules = () => useQuery({
  queryKey: ['rules'],
  queryFn: async () => {
    const { data, error } = await supabase.from('merchant_rules').select('id, match_key, match_type, merchant, category_id, default_scope, ask, min_amount, max_amount, paid_by, direction').order('merchant')
    if (error) throw error
    return (data ?? []).map(r => ({
      ...r,
      min_amount: r.min_amount == null ? null : Number(r.min_amount),
      max_amount: r.max_amount == null ? null : Number(r.max_amount),
    })) as Rule[]
  },
})

/** After a write on one of these screens: its own list, and every total. */
export function refreshSetup(qc: ReturnType<typeof useQueryClient>, ...keys: string[]) {
  for (const k of keys) qc.invalidateQueries({ queryKey: [k] })
  refreshAll(qc)
}

export { useCategoryChoice } from './choice'

