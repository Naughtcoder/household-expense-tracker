import { useQuery } from '@tanstack/react-query'
import { monthRange } from '@lib/format.ts'
import { supabase } from './supabase'

// The phone's copy of the website's month summary (app/summary/[month]/page.tsx)
// and person page (app/p/[id]/page.tsx). Same filters, so the numbers match.
// Results are plain arrays and objects: the cache is saved on the phone as JSON.

export type SummaryRow = {
  id: string; amount: number; direction: 'debit' | 'credit'; occurred_on: string
  merchant: string | null; merchant_key: string | null; scope: string; status: string
  category_id: number | null
}
export type PrevRow = { amount: number; direction: 'debit' | 'credit'; scope: string; category_id: number | null }

/** Every row of a select, paged past Supabase's 1000-row cap. */
async function pages<T>(make: () => any): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999)
    if (error) throw error
    all.push(...((data ?? []) as T[]))
    if ((data ?? []).length < 1000) break
  }
  return all
}

/** One month and the month before it, plus the take-home setting. */
export const useSummary = (key: string) => useQuery({
  queryKey: ['summary', key],
  queryFn: async () => {
    const m = monthRange(key)
    const prev = monthRange(m.prev)
    const [cur, before, settings] = await Promise.all([
      pages<SummaryRow>(() => supabase.from('transactions')
        .select('id, amount, direction, occurred_on, merchant, merchant_key, scope, status, category_id')
        .gte('occurred_on', m.from).lte('occurred_on', m.to).neq('status', 'duplicate').neq('status', 'ignored')
        .order('occurred_on', { ascending: false }).order('id')),
      pages<PrevRow>(() => supabase.from('transactions')
        .select('amount, direction, scope, category_id')
        .gte('occurred_on', prev.from).lte('occurred_on', prev.to).neq('status', 'duplicate').neq('status', 'ignored')
        .order('id')),
      supabase.from('settings').select('key, value'),
    ])
    if (settings.error) throw settings.error
    const takeHome = Number((settings.data ?? []).find(s => s.key === 'monthly_take_home')?.value ?? 0)
    return { rows: cur, before, takeHome }
  },
})

export type PersonRow = {
  id: string; amount: number; direction: 'debit' | 'credit'; occurred_on: string
  merchant: string | null; merchant_key: string | null; scope: string; category_id: number | null
}

/** One person and what they paid in a month, newest first. */
export const usePerson = (id: string, key: string) => useQuery({
  queryKey: ['person', id, key],
  enabled: !!id,
  queryFn: async () => {
    const m = monthRange(key)
    const [person, rows] = await Promise.all([
      supabase.from('people').select('id, name').eq('id', id).maybeSingle(),
      pages<PersonRow>(() => supabase.from('transactions')
        .select('id, amount, direction, occurred_on, merchant, merchant_key, scope, category_id')
        .eq('paid_by', id).gte('occurred_on', m.from).lte('occurred_on', m.to)
        .neq('status', 'duplicate').neq('status', 'ignored')
        .order('occurred_on', { ascending: false }).order('id')),
    ])
    if (person.error) throw person.error
    return { person: person.data as { id: string; name: string } | null, rows }
  },
})
