import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { matchPlan, fitParts, type Part, type Plan } from '@lib/splits.ts'
import type { Txn } from './data'

// A split payment's parts, and the planned splits, for the phone. Plain
// arrays and objects only: react-query results are saved on the phone as
// JSON, where a Map, Set or Date does not survive.

export type ShownPart = { id: string; amount: number; category_id: number | null; scope: string; note: string | null }
export type PlanRow = Plan & { note: string | null; applied_to: string | null; applied_at: string | null }
export type Offer = { id: string; expected: number; diff: number; payee: string | null; parts: Part[]; kind: 'apply' | 'differs' }

/** The whole of a split payment (whichever part `p` is), or the planned
 *  split that fits `p` when it is not split. */
export const useSplit = (p: Txn | null | undefined) => useQuery({
  queryKey: ['split', p?.id, p?.split_of, p?.split_total, p?.amount],
  enabled: !!p,
  queryFn: async (): Promise<{ rootId: string; total: number; parts: ShownPart[]; offer: Offer | null }> => {
    const t = p!
    const rootId = t.split_of ?? t.id
    if (t.split_of || t.split_total != null) {
      const { data, error } = await supabase.from('transactions').select('id, amount, category_id, scope, note, split_of, split_total, created_at')
        .or(`id.eq.${rootId},split_of.eq.${rootId}`).order('created_at')
      if (error) throw error
      const rows = data ?? []
      const root = rows.find(r => r.id === rootId)
      const parts = [root, ...rows.filter(r => r.split_of === rootId)].filter(Boolean)
        .map(r => ({ id: r!.id, amount: Number(r!.amount), category_id: r!.category_id, scope: r!.scope, note: r!.note }))
      return { rootId, total: Number(root?.split_total ?? t.amount), parts, offer: null }
    }
    let offer: Offer | null = null
    if (t.direction === 'debit' && Number(t.amount) > 0) {
      const day = t.occurred_on.slice(0, 10)
      const { data } = await supabase.from('planned_splits')
        .select('id, paid_by, payee_hint, expected_amount, tolerance, window_from, window_to, parts, status, created_at')
        .eq('status', 'open').eq('paid_by', t.paid_by).lte('window_from', day).gte('window_to', day)
      const hit = matchPlan({ amount: Number(t.amount), paid_by: t.paid_by, occurred_on: day, direction: t.direction,
        merchant_key: t.merchant_key, merchant_raw: t.merchant_raw ?? null, merchant: t.merchant }, (data ?? []) as Plan[])
      if (hit) offer = { id: hit.plan.id, expected: Number(hit.plan.expected_amount), diff: hit.diff, payee: hit.plan.payee_hint, parts: hit.kind === 'apply' && hit.diff !== 0 ? fitParts(hit.plan.parts, hit.diff) : hit.plan.parts, kind: hit.kind }
    }
    return { rootId, total: Number(t.amount), parts: [], offer }
  },
})

/** Open plans, soonest first, and the last ten used or cancelled. */
export const usePlans = () => useQuery({
  queryKey: ['plans'],
  queryFn: async () => {
    const [{ data: open, error }, { data: done }] = await Promise.all([
      supabase.from('planned_splits').select('*').eq('status', 'open').order('window_from'),
      supabase.from('planned_splits').select('*').neq('status', 'open').order('created_at', { ascending: false }).limit(10),
    ])
    if (error) throw error
    return { open: (open ?? []) as PlanRow[], done: (done ?? []) as PlanRow[] }
  },
})

/** Signed amount with paise, for parts (a part can be below zero). */
export const inrSigned = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
