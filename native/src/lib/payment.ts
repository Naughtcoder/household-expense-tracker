import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { PEOPLE } from './data'

// Everything around one payment that the website's payment page shows: its
// tags, who paid it back, what it paid back, and the employer's repayment.

export type Line = { id: string; amount: number; occurred_on: string; merchant: string | null }
const plus = (iso: string, d: number) => new Date(Date.parse(iso.slice(0, 10)) + d * 86400000).toISOString().slice(0, 10)
const other = (id: string) => Object.keys(PEOPLE).find(p => p !== id)!

export type Around = {
  tags: { id: number; name: string }[]
  allTags: { id: number; name: string }[]
  /** On a payment the other one paid back, or a transfer that paid for things. */
  partner: { mode: 'payment' | 'transfer'; linked: Line[]; choices: Line[]; other: string } | null
  /** A friend's pay-back: the payment it repays, or ones it could. */
  paysBack: { linked: Line | null; choices: Line[] } | null
  /** Friends' pay-backs pointing at this payment. */
  friendBacks: Line[]
  /** The Employer payout that repaid this claim, and claims a payout repaid. */
  payout: Line | null
  paidCount: number
}

type P = { id: string; amount: number; direction: string; occurred_on: string; scope: string; merchant: string | null; paid_by: string; category_id: number | null; covered_by?: string | null; pays_back?: string | null; settled_by?: string | null }

export const useAround = (p: P | null | undefined) => useQuery({
  queryKey: ['around', p?.id, p?.paid_by, p?.covered_by, p?.pays_back, p?.category_id],
  enabled: !!p,
  queryFn: async (): Promise<Around> => {
    const t = p!
    const [{ data: chosen }, { data: allTags }] = await Promise.all([
      supabase.from('transaction_tags').select('tag_id, tags(id, name)').eq('transaction_id', t.id),
      supabase.from('tags').select('id, name').eq('archived', false).order('name'),
    ])
    const tags = ((chosen ?? []) as unknown as { tags: { id: number; name: string } }[]).map(r => r.tags).filter(Boolean)

    const ourTransfer = t.scope === 'transfer' && (t.merchant === 'Sam' || t.merchant === 'Alex')
    const spendable = t.direction === 'debit' && !['transfer', 'claimable', 'investment'].includes(t.scope)
    let partner: Around['partner'] = null
    if (spendable && t.covered_by) {
      const { data: x } = await supabase.from('transactions').select('id, amount, occurred_on, merchant').eq('id', t.covered_by).maybeSingle()
      partner = { mode: 'payment', linked: x ? [{ ...x, amount: Number(x.amount), merchant: `Transfer from ${PEOPLE[t.paid_by]}` }] : [], choices: [], other: PEOPLE[t.paid_by] }
    } else if (spendable && Number(t.amount) > 0) {
      const o = other(t.paid_by)
      const [{ data: inn }, { data: out }] = await Promise.all([
        supabase.from('transactions').select('id, amount, occurred_on, merchant').eq('scope', 'transfer').eq('paid_by', t.paid_by).eq('direction', 'credit')
          .eq('merchant', PEOPLE[o]).gte('occurred_on', t.occurred_on.slice(0, 10)).lte('occurred_on', plus(t.occurred_on, 30)),
        supabase.from('transactions').select('id, amount, occurred_on, merchant').eq('scope', 'transfer').eq('paid_by', o).eq('direction', 'debit')
          .eq('merchant', PEOPLE[t.paid_by]).gte('occurred_on', t.occurred_on.slice(0, 10)).lte('occurred_on', plus(t.occurred_on, 30)),
      ])
      const seen = new Set((inn ?? []).map(r => `${Number(r.amount)}|${r.occurred_on.slice(0, 10)}`))
      const all = [...(inn ?? []), ...(out ?? []).filter(r => !seen.has(`${Number(r.amount)}|${r.occurred_on.slice(0, 10)}`))]
        .map(r => ({ ...r, amount: Number(r.amount), merchant: `Transfer from ${PEOPLE[o]}` }))
        .sort((a, b) => Math.abs(a.amount - Number(t.amount)) - Math.abs(b.amount - Number(t.amount))).slice(0, 8)
      partner = { mode: 'payment', linked: [], choices: all, other: PEOPLE[o] }
    } else if (ourTransfer) {
      const { data: linked } = await supabase.from('transactions').select('id, amount, occurred_on, merchant').eq('covered_by', t.id)
      partner = { mode: 'transfer', linked: (linked ?? []).map(r => ({ ...r, amount: Number(r.amount) })), choices: [], other: t.merchant ?? '' }
    }

    // A friend's pay-back (money in, or filed as a negative payment out).
    const isPayback = !ourTransfer && !['transfer', 'claimable', 'investment'].includes(t.scope) && ((t.direction === 'debit' && Number(t.amount) < 0) || t.direction === 'credit')
    let paysBack: Around['paysBack'] = null
    if (isPayback) {
      const back = Math.abs(Number(t.amount))
      const { data: linked } = t.pays_back ? await supabase.from('transactions').select('id, amount, occurred_on, merchant').eq('id', t.pays_back).maybeSingle() : { data: null }
      let choices: Line[] = []
      if (!linked) {
        const { data } = await supabase.from('transactions').select('id, amount, occurred_on, merchant, category_id')
          .eq('paid_by', t.paid_by).eq('direction', 'debit').gt('amount', back)
          .not('scope', 'in', '(transfer,claimable,investment)').not('status', 'in', '(duplicate,ignored)')
          .gte('occurred_on', plus(t.occurred_on, -30)).lte('occurred_on', t.occurred_on.slice(0, 10)).order('occurred_on', { ascending: false }).limit(60)
        // Same category first, then a bill this is an even share of, then the latest.
        const score = (r: { amount: number; category_id: number | null }) => {
          const ratio = Number(r.amount) / back
          return (r.category_id && r.category_id === t.category_id ? 0 : 2) + Math.min(1, Math.abs(ratio - Math.round(ratio)) * 4)
        }
        choices = (data ?? []).map((r, i) => ({ r, i })).sort((a, b) => score(a.r) - score(b.r) || a.i - b.i).slice(0, 8)
          .map(({ r }) => ({ id: r.id, amount: Number(r.amount), occurred_on: r.occurred_on, merchant: r.merchant }))
      }
      paysBack = { linked: linked ? { ...linked, amount: Number(linked.amount) } : null, choices }
    }
    const { data: fb } = spendable && Number(t.amount) > 0
      ? await supabase.from('transactions').select('id, amount, occurred_on, merchant').eq('pays_back', t.id).order('occurred_on')
      : { data: null }

    const { data: po } = t.settled_by ? await supabase.from('transactions').select('id, amount, occurred_on, merchant').eq('id', t.settled_by).maybeSingle() : { data: null }
    const { count } = t.direction === 'credit' && t.scope === 'claimable'
      ? await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('settled_by', t.id) : { count: 0 }

    return {
      tags, allTags: (allTags ?? []) as Around['allTags'], partner, paysBack,
      friendBacks: (fb ?? []).map(r => ({ ...r, amount: Number(r.amount) })),
      payout: po ? { ...po, amount: Number(po.amount) } : null, paidCount: count ?? 0,
    }
  },
})
