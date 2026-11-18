import { useQuery } from '@tanstack/react-query'
import { catTree, type Cat } from '@lib/cats.ts'
import { DEPOSIT_CATEGORY } from '@lib/scope.ts'
import { isTripTag } from '@lib/trips.ts'
import { supabase } from './supabase'
import { HUES } from '@/theme'

// The phone's copy of the website's Trips pages (app/trips/page.tsx and
// app/trips/[id]/page.tsx). Same filters, same parts, same order, so the
// numbers match what the website shows.

/** What a trip or tag cost: every payment out, employer-claimable ones included,
 *  but never money moved to your own account, invested, or put down as a deposit. */
export const costs = (t: { direction: string; scope: string; category_id: number | null }) =>
  t.direction === 'debit' && t.scope !== 'transfer' && t.scope !== 'investment' && t.category_id !== DEPOSIT_CATEGORY

const counted = (t: { direction: string; scope: string; category_id: number | null; status: string }) =>
  t.status !== 'duplicate' && t.status !== 'ignored' && costs(t)

/** The few things a trip's money goes on, in one fixed order and colour. */
export const PARTS = [
  { key: 'Flights', color: HUES[1] },
  { key: 'Stays', color: HUES[4] },
  { key: 'Food', color: HUES[2] },
  { key: 'Getting around', color: HUES[6] },
  { key: 'Activities', color: HUES[8] },
  { key: 'Shopping', color: HUES[7] },
  { key: 'Cash', color: HUES[14] },
  { key: 'Health', color: HUES[9] },
  { key: 'Visas', color: HUES[5] },
  { key: 'Other', color: HUES[16] },
] as const
export type Part = typeof PARTS[number]['key']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Goa, Sep 2026 (with Sam)" is September 2026. */
export const tripWhen = (name: string) => { const m = name.match(/, ([A-Z][a-z]{2}) (\d{4})/); return m ? { y: Number(m[2]), m: MONTHS.indexOf(m[1]) } : null }
export const place = (name: string) => name.split(',')[0].trim()
export const extra = (name: string) => (name.match(/\(([^)]+)\)\s*$/)?.[1] ?? null)
export const short = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MONTHS[d.getMonth()]}` }

export function partOf(tree: ReturnType<typeof catTree>, id: number | null): Part {
  const n = tree.name(id) ?? '', t = tree.root(id)?.name ?? ''
  if (n === 'Flights') return 'Flights'
  if (['Hotels', 'Hotel'].includes(n) || t === 'Hotel') return 'Stays'
  if (t === 'Food') return 'Food'
  if (['Transportation', 'Taxi', 'Local Transport', 'Car', 'Fuel', 'Parking', 'Toll'].includes(n) || t === 'Transportation') return 'Getting around'
  if (t === 'Apparel' || ['Electronics', 'Gifts'].includes(n)) return 'Shopping'
  if (n === 'Forex') return 'Cash'
  if (n === 'Visas') return 'Visas'
  if (t === 'Health') return 'Health'
  if (n === 'Travel' || t === 'Entertainment' || t === 'Culture' || n === 'Entertainment' || n === 'Culture') return 'Activities'
  return 'Other'
}

export type TagSummary = {
  id: number; name: string
  total: number; n: number; first: string; last: string
  /** The days away: every payment but flights and stays, which are booked ahead. */
  awayFirst: string; awayLast: string
  parts: Record<Part, number>
}

type Linked = { tag_id: number; t: { amount: number; direction: string; scope: string; category_id: number | null; occurred_on: string; status: string } | null }

const blank = (): Omit<TagSummary, 'id' | 'name'> => ({
  total: 0, n: 0, first: '', last: '', awayFirst: '', awayLast: '',
  parts: Object.fromEntries(PARTS.map(p => [p.key, 0])) as Record<Part, number>,
})

async function categories() {
  const { data, error } = await supabase.from('categories').select('id, name, parent_id')
  if (error) throw error
  return (data ?? []) as Cat[]
}

/** Every trip and other tag with what it cost. Trips newest first, other tags
 *  biggest first. */
export const useTrips = () => useQuery({
  queryKey: ['trips'],
  queryFn: async () => {
    const [tagsRes, cats] = await Promise.all([
      supabase.from('tags').select('id, name').eq('archived', false),
      categories(),
    ])
    if (tagsRes.error) throw tagsRes.error
    // PostgREST hands back at most 1000 rows at a time.
    const links: Linked[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('transaction_tags')
        .select('tag_id, t:transactions(amount, direction, scope, category_id, occurred_on, status)')
        .order('tag_id').order('transaction_id').range(from, from + 999)
      if (error) throw error
      links.push(...((data ?? []) as unknown as Linked[]))
      if ((data ?? []).length < 1000) break
    }

    const tree = catTree(cats)
    const byTag = new Map<number, ReturnType<typeof blank>>()
    for (const l of links) {
      const t = l.t
      if (!t || !counted(t)) continue
      const e = byTag.get(l.tag_id) ?? blank()
      const a = Number(t.amount), part = partOf(tree, t.category_id)
      e.total += a; e.n += 1; e.parts[part] += a
      if (!e.first || t.occurred_on < e.first) e.first = t.occurred_on
      if (!e.last || t.occurred_on > e.last) e.last = t.occurred_on
      if (part !== 'Flights' && part !== 'Stays') {
        if (!e.awayFirst || t.occurred_on < e.awayFirst) e.awayFirst = t.occurred_on
        if (!e.awayLast || t.occurred_on > e.awayLast) e.awayLast = t.occurred_on
      }
      byTag.set(l.tag_id, e)
    }

    const items: TagSummary[] = ((tagsRes.data ?? []) as { id: number; name: string }[]).map(t => ({ ...t, ...(byTag.get(t.id) ?? blank()) }))
    const trips = items.filter(t => isTripTag(t.name)).sort((a, b) => {
      const x = tripWhen(a.name)!, y = tripWhen(b.name)!
      return (y.y * 12 + y.m) - (x.y * 12 + x.m)
    })
    const others = items.filter(t => !isTripTag(t.name)).sort((a, b) => b.total - a.total)
    return { trips, others }
  },
})

export type TripRow = {
  id: string; amount: number; direction: string; scope: string; category_id: number | null
  occurred_on: string; status: string; merchant: string | null; merchant_key: string | null; bank: string | null; note: string | null
}

/** One tag: its name, every payment that counts (newest first), and the total
 *  by top category. Null when the tag does not exist or is not visible. */
export const useTrip = (tagId: number) => useQuery({
  queryKey: ['trip', tagId],
  enabled: Number.isFinite(tagId),
  queryFn: async () => {
    const [tagRes, cats] = await Promise.all([
      supabase.from('tags').select('id, name').eq('id', tagId).maybeSingle(),
      categories(),
    ])
    if (tagRes.error) throw tagRes.error
    if (!tagRes.data) return null
    const links: { t: TripRow | null }[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('transaction_tags')
        .select('t:transactions(id, amount, direction, scope, category_id, occurred_on, status, merchant, merchant_key, bank, note)')
        .eq('tag_id', tagId).order('transaction_id').range(from, from + 999)
      if (error) throw error
      links.push(...((data ?? []) as unknown as { t: TripRow | null }[]))
      if ((data ?? []).length < 1000) break
    }
    const rows = links.map(l => l.t).filter((t): t is TripRow => !!t && counted(t))
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
    const total = rows.reduce((s, r) => s + Number(r.amount), 0)
    const tree = catTree(cats)
    const byCat = new Map<string, number>()
    for (const r of rows) {
      const k = tree.root(r.category_id)?.name ?? 'Uncategorised'
      byCat.set(k, (byCat.get(k) ?? 0) + Number(r.amount))
    }
    return {
      tag: tagRes.data as { id: number; name: string },
      rows, total,
      byTop: [...byCat.entries()].sort((a, b) => b[1] - a[1]),
      first: rows.at(-1)?.occurred_on ?? null,
      last: rows[0]?.occurred_on ?? null,
    }
  },
})
