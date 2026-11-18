import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { IS_DEMO } from './variant'
import { catTree, type Cat } from '@lib/cats.ts'
import { countsAsSpend } from '@lib/scope.ts'
import { SALARY_CATEGORY, SALARY_KIND, SALARY_KIND_NAME, TAX_GROUP, loadSalaryTax, type TaxRow } from '@lib/tax.ts'

export type Txn = {
  id: string; amount: number; direction: string; occurred_on: string; occurred_at: string | null
  merchant: string | null; merchant_key: string | null; scope: string; status: string
  category_id: number | null; paid_by: string; note?: string | null; bank?: string | null
  account_tail?: string | null; raw_text?: string | null; paid?: { name: string } | null
  covered_by?: string | null; pays_back?: string | null; settled_by?: string | null
  /** A split payment: the parts point at the first one (split_of), which holds the bank's amount as split_total. */
  split_of?: string | null; split_total?: number | null; flags?: string[] | null; merchant_raw?: string | null
}

export const PEOPLE: Record<string, string> = IS_DEMO
  ? { '00000000-0000-4000-8000-dead00000001': 'Rohan', '00000000-0000-4000-8000-dead00000002': 'Meera' }
  : { '00000000-0000-4000-8000-dead00000001': 'Alex', '00000000-0000-4000-8000-dead00000002': 'Sam' }

export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}

export const useCategories = () => useQuery({
  queryKey: ['categories'],
  queryFn: async () => {
    const { data, error } = await supabase.from('categories').select('id, name, parent_id').order('name')
    if (error) throw error
    return (data ?? []) as Cat[]
  },
  staleTime: 5 * 60_000,
  // The list is small and the other phone can add to it at any time. Every
  // screen that shows it asks again, so a category added on one phone is
  // never missing from the other's sheet (Sam could not find Auto, 10 Oct).
  refetchOnMount: 'always',
})

/** yyyy-mm for a date, in India time. */
export const monthKeyOf = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7)

export function monthBounds(key: string) {
  const [y, m] = key.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, '0')}` }
}

export const useMonth = (key: string) => useQuery({
  queryKey: ['month', key],
  queryFn: async () => {
    const { from, to } = monthBounds(key)
    const { data, error } = await supabase.from('transactions')
      .select('id, amount, direction, occurred_on, occurred_at, merchant, merchant_key, scope, status, category_id, paid_by, note, split_of, split_total, paid:people!transactions_paid_by_fkey(name)')
      .gte('occurred_on', from).lte('occurred_on', to)
      .neq('status', 'duplicate').neq('status', 'ignored')
      .order('occurred_on', { ascending: false }).order('occurred_at', { ascending: false, nullsFirst: false })
      .limit(2000)
    if (error) throw error
    return (data ?? []) as unknown as Txn[]
  },
})

export const useReviewCount = () => useQuery({
  queryKey: ['review-count'],
  queryFn: async () => {
    const { count } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review')
    return count ?? 0
  },
})

export const useTxn = (id: string) => useQuery({
  queryKey: ['txn', id],
  enabled: !!id,
  queryFn: async () => {
    const { data, error } = await supabase.from('transactions')
      .select('id, amount, direction, occurred_on, occurred_at, merchant, merchant_key, merchant_raw, scope, status, category_id, paid_by, note, bank, account_tail, raw_text, covered_by, pays_back, settled_by, split_of, split_total, flags')
      .eq('id', id).maybeSingle()
    if (error) throw error
    return data as Txn | null
  },
})

/** Saves a payment's category, who it is for, and note. Shows the change at
 *  once and puts it back if the database refuses. */
export function useSaveTxn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { id: string; category_id: number | null; scope: string; note: string | null; merchant: string | null; paid_by?: string; occurred_on?: string }) => {
      const { data, error } = await supabase.from('transactions')
        .update({
          category_id: p.category_id, scope: p.scope, note: p.note, merchant: p.merchant, status: 'confirmed',
          ...(p.paid_by ? { paid_by: p.paid_by } : {}),
          // A new day makes the stored time of day wrong, so it goes.
          ...(p.occurred_on ? { occurred_on: p.occurred_on, occurred_at: null } : {}),
        })
        .eq('id', p.id).select('id')
      if (error?.code === '23505') throw new Error('There is already a payment like this on that day.')
      if (error) throw error
      if (!data?.length) throw new Error('Nothing changed. An access rule is blocking it.')
    },
    onMutate: async p => {
      const prev = qc.getQueryData<Txn | null>(['txn', p.id])
      if (prev) qc.setQueryData(['txn', p.id], { ...prev, ...p, status: 'confirmed' })
      return { prev }
    },
    onError: (_e, p, ctx) => { if (ctx?.prev) qc.setQueryData(['txn', p.id], ctx.prev) },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['month'] }); qc.invalidateQueries({ queryKey: ['review-count'] }) },
  })
}

export type ReviewRow = Txn & { possible_duplicate_of: string | null; twin?: { amount: number; occurred_on: string; merchant: string | null } | null }

/** What is waiting in Review, oldest first, with the twin it may duplicate. */
export const useReview = () => useQuery({
  queryKey: ['review'],
  queryFn: async () => {
    const { data, error } = await supabase.from('transactions')
      .select('id, amount, direction, occurred_on, occurred_at, merchant, merchant_key, merchant_raw, scope, status, category_id, paid_by, note, bank, account_tail, raw_text, flags, possible_duplicate_of, paid:people!transactions_paid_by_fkey(name)')
      .eq('status', 'review').order('occurred_on', { ascending: false }).limit(300)
    if (error) throw error
    const rows = (data ?? []) as unknown as ReviewRow[]
    const twinIds = rows.map(r => r.possible_duplicate_of).filter(Boolean) as string[]
    if (twinIds.length) {
      const { data: twins } = await supabase.from('transactions').select('id, amount, occurred_on, merchant').in('id', twinIds)
      const byId = new Map((twins ?? []).map(t => [t.id, t]))
      for (const r of rows) r.twin = r.possible_duplicate_of ? (byId.get(r.possible_duplicate_of) as ReviewRow['twin']) ?? null : null
    }
    return rows
  },
})

/** Messages a bank sent that nothing could read yet. */
export const useUnparsed = () => useQuery({
  queryKey: ['unparsed'],
  queryFn: async () => {
    const { data } = await supabase.from('unparsed').select('id, raw_text, created_at').eq('resolved', false).order('created_at', { ascending: false }).limit(50)
    return (data ?? []) as { id: string; raw_text: string; created_at: string }[]
  },
})

/** After any change made through the website's actions. */
export function refreshAll(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ['review', 'review-count', 'month', 'unparsed', 'txn', 'insights', 'cat', 'payee', 'trips', 'trip', 'claims', 'claim', 'deposits', 'around', 'search', 'budgets', 'recurring', 'rules', 'subscriptions', 'merchants', 'accounts', 'people', 'summary', 'person', 'all-range', 'all-acct', 'investments', 'split', 'plans', 'tax', 'alarms']) qc.invalidateQueries({ queryKey: [k] })
}

export type Period = 'week' | 'month' | 'year'
const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

/** The span a period covers, and the ones either side. */
export function periodOf(p: Period, at: Date) {
  const y = at.getFullYear(), m = at.getMonth()
  if (p === 'year') return { from: new Date(y, 0, 1), to: new Date(y, 11, 31), prev: new Date(y - 1, 0, 1), next: new Date(y + 1, 0, 1), label: String(y) }
  if (p === 'month') return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0), prev: new Date(y, m - 1, 1), next: new Date(y, m + 1, 1),
    label: at.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) }
  const dow = (at.getDay() + 6) % 7
  const from = new Date(y, m, at.getDate() - dow)
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6)
  return { from, to, prev: new Date(from.getFullYear(), from.getMonth(), from.getDate() - 7), next: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7),
    label: `${from.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} to ${to.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` }
}

/** Every payment in a period, and which of them were on a trip. */
export const useInsights = (p: Period, at: Date) => {
  const per = periodOf(p, at)
  return useQuery({
    queryKey: ['insights', p, iso(per.from)],
    queryFn: async () => {
      const all: Txn[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('transactions')
          .select('id, amount, direction, occurred_on, occurred_at, merchant, merchant_key, scope, status, category_id, paid_by, paid:people!transactions_paid_by_fkey(name)')
          .gte('occurred_on', iso(per.from)).lte('occurred_on', iso(per.to)).neq('status', 'duplicate').neq('status', 'ignored')
          .order('occurred_on', { ascending: false }).range(from, from + 999)
        if (error) throw error
        all.push(...((data ?? []) as unknown as Txn[]))
        if ((data ?? []).length < 1000) break
      }
      const { data: tags } = await supabase.from('transaction_tags').select('transaction_id, tags!inner(name)').limit(5000)
      // A plain object, not a Map: this result is saved on the phone as JSON,
      // and a Map comes back from that as an empty {}.
      const trips: Record<string, string> = {}
      for (const r of (tags ?? []) as unknown as { transaction_id: string; tags: { name: string } }[])
        if (/, [A-Z][a-z]{2} \d{4}/.test(r.tags.name)) trips[r.transaction_id] = r.tags.name // isTripTag in lib/trips.ts
      return { rows: all, trips }
    },
  })
}

/** Money out or in per month, for one person or the household (the year chart). */
export const useMonthTotals = (fromY: number, toY: number, who: string | null, incoming: boolean) => useQuery({
  queryKey: ['month-totals', fromY, toY, who, incoming],
  queryFn: async () => {
    const { data } = await supabase.rpc('month_totals', { p_from: `${fromY}-01-01`, p_to: `${toY}-12-31`, p_who: who, p_in: incoming })
    return (data ?? []) as { month: string; total: number }[]
  },
})

/** Spending by top group, last twelve whole months against the twelve before. */
export const useYearOnYear = () => useQuery({
  queryKey: ['yoy'],
  queryFn: async () => {
    const now = new Date()
    const end = new Date(now.getFullYear(), now.getMonth(), 0)            // last whole month
    const start = new Date(end.getFullYear(), end.getMonth() - 23, 1)
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const { data } = await supabase.rpc('spend_by_top', { p_from: iso(start), p_to: iso(end) })
    const split = `${new Date(end.getFullYear(), end.getMonth() - 11, 1).getFullYear()}-${String(new Date(end.getFullYear(), end.getMonth() - 11, 1).getMonth() + 1).padStart(2, '0')}`
    // Plain objects (saved on the phone as JSON, where a Map does not survive).
    const now12: Record<number, number> = {}, prev12: Record<number, number> = {}
    for (const r of (data ?? []) as { month: string; top_id: number | null; total: number }[]) {
      if (r.top_id == null) continue
      const m = r.month >= split ? now12 : prev12
      m[r.top_id] = (m[r.top_id] ?? 0) + Number(r.total)
    }
    return { now12, prev12 }
  },
  staleTime: 60 * 60_000,
})

/** Every payment in the Tax group, all years, plus the TDS paid on the rent
 *  (the landlord's tax, filed under Rent), for the tax view. A few rows a year. */
export const useTax = () => useQuery({
  queryKey: ['tax'],
  queryFn: async () => {
    const { data: cats, error: e1 } = await supabase.from('categories').select('id, name, parent_id')
    if (e1) throw e1
    const tree = catTree((cats ?? []) as Cat[])
    const root = tree.roots().find(c => c.name === TAX_GROUP)
    const family = root ? tree.family(root.id) : []
    const cols = 'id, amount, direction, occurred_on, paid_by, category_id, scope, status, merchant'
    const [{ data: tax, error: e2 }, { data: rent, error: e3 }] = await Promise.all([
      supabase.from('transactions').select(cols).in('category_id', family.length ? family : [-1]).neq('status', 'duplicate').neq('status', 'ignored'),
      supabase.from('transactions').select(cols).ilike('merchant', 'TDS on%').neq('status', 'duplicate').neq('status', 'ignored'),
    ])
    if (e2) throw e2
    if (e3) throw e3
    const famSet = new Set(family)
    const salaryCat = (cats ?? []).find(c => c.name === SALARY_CATEGORY)
    const salary = await loadSalaryTax(supabase, salaryCat ? tree.family(salaryCat.id) : [])
    return {
      rootId: root?.id ?? null,
      names: { ...Object.fromEntries(family.map(id => [id, tree.get(id)?.name ?? 'Tax'])), [SALARY_KIND]: SALARY_KIND_NAME } as Record<number, string>,
      rates: salary.rates,
      rows: [...((tax ?? []) as unknown as TaxRow[]).filter(r => countsAsSpend(r as unknown as Txn)), ...salary.rows],
      rentTds: ((rent ?? []) as unknown as (TaxRow & Txn)[]).filter(r => !famSet.has(r.category_id ?? -1) && countsAsSpend(r)),
    }
  },
})

type Alarm = { id: number; kind: string; person_id: string | null; message: string }

/** Open alarms (a phone gone quiet, a bank text nobody could read), shown as
 *  a banner on Month. Raised by the website's alarm job (lib/alarms.ts). */
export const useAlarms = () => useQuery({
  queryKey: ['alarms'],
  queryFn: async () => {
    if (IS_DEMO) return [] as Alarm[]
    const { data, error } = await supabase.from('alarms').select('id, kind, person_id, message').is('cleared_at', null).order('raised_at')
    if (error) throw error
    return (data ?? []) as Alarm[]
  },
})
