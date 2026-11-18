import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { act } from './api'
import { refreshAll } from './data'

/** One claimable payment, or a repayment coming in (direction credit). */
export type ClaimRow = {
  id: string; amount: number; occurred_on: string; merchant: string | null; merchant_key: string | null
  bank: string | null; account_tail: string | null; claim_settled_on: string | null
  category_id: number | null; direction: 'debit' | 'credit'
}

export type Payout = { id: string; amount: number; occurred_on: string; merchant: string | null }

/** The first day of the month after yyyy-mm, as the website computes it. */
const nextMonthStart = (key: string) => {
  const [y, mo] = key.split('-').map(Number)
  return new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10)
}

/** Every claimable row (all months, or one), with the same filters as
 *  app/claimable/page.tsx, paged past Supabase's 1000-row cap. */
export const useClaims = (month: string | null, who: string | null) => useQuery({
  queryKey: ['claims', month, who],
  queryFn: async () => {
    const all: ClaimRow[] = []
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('transactions')
        .select('id, amount, occurred_on, merchant, merchant_key, bank, account_tail, claim_settled_on, category_id, direction')
        .eq('scope', 'claimable').neq('status', 'duplicate').neq('status', 'ignored')
      if (who) q = q.eq('paid_by', who)
      if (month) q = q.gte('occurred_on', `${month}-01`).lt('occurred_on', nextMonthStart(month))
      const { data, error } = await q.order('occurred_on', { ascending: false }).order('id').range(from, from + 999)
      if (error) throw error
      all.push(...((data ?? []) as ClaimRow[]))
      if ((data ?? []).length < 1000) break
    }
    return all
  },
})

/** The six latest payouts, offered when marking claims settled. Not limited
 *  to the month or person, the same as the website. */
export const useRecentPayouts = () => useQuery({
  queryKey: ['claims', 'payouts'],
  queryFn: async () => {
    const { data, error } = await supabase.from('transactions').select('id, amount, occurred_on, merchant')
      .eq('scope', 'claimable').eq('direction', 'credit').neq('status', 'duplicate')
      .order('occurred_on', { ascending: false }).limit(6)
    if (error) throw error
    return (data ?? []) as Payout[]
  },
})

export type TraceClaim = { id: string; amount: number; occurred_on: string; merchant: string | null; merchant_key: string | null }

/** One repayment and the claims it paid back (app/claimable/r/[id]/page.tsx). */
export const useRepayment = (id: string) => useQuery({
  queryKey: ['claims', 'repayment', id],
  enabled: !!id,
  queryFn: async () => {
    const [pay, claims] = await Promise.all([
      supabase.from('transactions').select('id, amount, occurred_on, merchant, raw_text').eq('id', id).maybeSingle(),
      supabase.from('transactions').select('id, amount, occurred_on, merchant, merchant_key')
        .eq('settled_by', id).neq('status', 'duplicate').order('occurred_on', { ascending: true }),
    ])
    if (pay.error) throw pay.error
    if (claims.error) throw claims.error
    return {
      pay: pay.data as { id: string; amount: number; occurred_on: string; merchant: string | null; raw_text: string | null } | null,
      claims: (claims.data ?? []) as TraceClaim[],
    }
  },
})

export const DEPOSIT_ID = 18

export type DepositRow = { id: string; amount: number; direction: 'debit' | 'credit'; occurred_on: string; merchant: string | null; note: string | null; claim_settled_on: string | null }

/** Every row in the Deposit category, oldest first (app/deposits/page.tsx). */
export const useDeposits = () => useQuery({
  queryKey: ['deposits'],
  queryFn: async () => {
    const all: DepositRow[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('transactions').select('id, amount, direction, occurred_on, merchant, note, claim_settled_on')
        .eq('category_id', DEPOSIT_ID).neq('status', 'duplicate').neq('status', 'ignored')
        .order('occurred_on', { ascending: true }).order('id').range(from, from + 999)
      if (error) throw error
      all.push(...((data ?? []) as DepositRow[]))
      if ((data ?? []).length < 1000) break
    }
    return all
  },
})

export type ClaimAction =
  | { name: 'markSettled'; args: { ids: string[]; payoutId?: string } }
  | { name: 'unsettle'; args: { id: string } }
  | { name: 'notClaimable'; args: { id: string } }

/** Writes go through the website's actions only, never straight to the table. */
export function useClaimAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: ClaimAction) => act(a.name, a.args),
    onSettled: () => {
      refreshAll(qc)
      qc.invalidateQueries({ queryKey: ['claims'] })
      qc.invalidateQueries({ queryKey: ['deposits'] })
    },
  })
}
