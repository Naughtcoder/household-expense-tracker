import type { SupabaseClient } from '@supabase/supabase-js'

/** Trip tags are named "Place, Mon YYYY". Other tags (Holiday, ExpenseCard) are not trips. */
export const isTripTag = (name: string) => /, [A-Z][a-z]{2} \d{4}/.test(name)

/** Charges that bill from abroad wherever you are, so never mean you travelled. */
const NOT_TRAVEL = /UBER INDIA|PAY\*UBER IN|PADDLE|GOOGLE WORK|SQSP|NOTION|CLAUDE|OPENAI|LINKEDI|CANVA|PHANTOM|APPLESERV|NETFLIX|SPOTIFY/i

/**
 * The BankB card is the one used abroad, so a BankB payment that is not a
 * subscription is almost always spent on a trip. If payments from the same
 * few days already carry a trip tag, this one joins that trip.
 */
export async function tagWithTrip(supabase: SupabaseClient, t: { id: string; date: string; bank: string | null; raw: string | null; categoryId: number | null }) {
  if (!/^BankB/i.test(t.bank ?? '') || NOT_TRAVEL.test(t.raw ?? '') || t.categoryId === 14 || t.categoryId === 36) return
  const day = (n: number) => new Date(new Date(t.date + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10)
  const { data } = await supabase.from('transaction_tags')
    .select('tag_id, tags!inner(name), transactions!inner(occurred_on)')
    .gte('transactions.occurred_on', day(-3)).lte('transactions.occurred_on', day(3)).limit(500)
  const counts = new Map<number, number>()
  for (const r of (data ?? []) as unknown as { tag_id: number; tags: { name: string } }[])
    if (isTripTag(r.tags.name)) counts.set(r.tag_id, (counts.get(r.tag_id) ?? 0) + 1)
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (best) await supabase.from('transaction_tags').upsert({ transaction_id: t.id, tag_id: best[0] }, { ignoreDuplicates: true })
}

/**
 * Every payment on a trip, with the trip's name. In the summaries a trip's
 * food, taxis and shopping count as Travel, because the trip is why they
 * were spent; the category on each payment is left as it is.
 */
export async function tripOf(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await supabase.from('transaction_tags').select('transaction_id, tags!inner(name)').limit(5000)
  const out = new Map<string, string>()
  for (const r of (data ?? []) as unknown as { transaction_id: string; tags: { name: string } }[])
    if (isTripTag(r.tags.name)) out.set(r.transaction_id, r.tags.name)
  return out
}

export const TRAVEL_ID = 9
