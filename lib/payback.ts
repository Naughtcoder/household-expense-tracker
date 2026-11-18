import type { SupabaseClient } from '@supabase/supabase-js'
import { ALEX_ID } from './household.ts'

// When one of them pays for something and the other sends the same amount
// back, the cost is the other one's. Alex buys shoes, Sam transfers the
// price: the shoes count as hers. The household total never moves, only whose
// spending it is. Ruled by Alex, 4 Oct 2026.
//
// The payment keeps a link to the transfer (covered_by), so it can be undone
// and so the same transfer never covers two things.

export const SAM_ID = '00000000-0000-4000-8000-dead00000002'
export const otherOf = (id: string) => (id === ALEX_ID ? SAM_ID : ALEX_ID)

/** How far back a pay-back looks for what it pays for. */
export const WINDOW_DAYS = 30
/** Below this, a transfer is a test or small change and never matched on its
 *  own. The manual button still works at any amount. */
export const MIN_AUTO = 100

export type Transfer = { id: string; amount: number; direction: string; paid_by: string; occurred_on: string }
export type Payment = { id: string; amount: number; occurred_on: string; paid_by: string }

/** Who sent the money and who got it, from either side's record of it. */
export function partiesOf(t: Transfer): { from: string; to: string } {
  return t.direction === 'credit'
    ? { from: otherOf(t.paid_by), to: t.paid_by }
    : { from: t.paid_by, to: otherOf(t.paid_by) }
}

const day = (s: string) => Date.parse(s.slice(0, 10))

/** The payment a transfer pays back, when exactly one fits: paid by the one
 *  who received the money, the same amount to the rupee, within the window
 *  before it (or on the same day). Two or more fits is a question, not an
 *  answer, so nothing is matched. */
export function pickPayment(t: Transfer, candidates: Payment[]): Payment | null {
  const { to } = partiesOf(t)
  const fits = candidates.filter(p =>
    p.paid_by === to
    && Math.abs(Number(p.amount) - Number(t.amount)) < 1
    && day(p.occurred_on) <= day(t.occurred_on)
    && day(t.occurred_on) - day(p.occurred_on) <= WINDOW_DAYS * 86400000)
  return fits.length === 1 ? fits[0] : null
}

const shiftDate = (iso: string, days: number) => new Date(day(iso) + days * 86400000).toISOString().slice(0, 10)

/** The same transfer as the other side saw it (her debit, his credit), so a
 *  transfer recorded twice is only ever used once. */
async function twinIds(supabase: SupabaseClient, t: Transfer): Promise<string[]> {
  const { data } = await supabase.from('transactions').select('id')
    .eq('scope', 'transfer').eq('amount', t.amount)
    .eq('paid_by', otherOf(t.paid_by)).neq('direction', t.direction)
    .gte('occurred_on', shiftDate(t.occurred_on, -2)).lte('occurred_on', shiftDate(t.occurred_on, 2))
  return (data ?? []).map(r => r.id)
}

/** Payments the transfer could pay back, nearest amount first, for the
 *  manual picker. */
export async function candidatesFor(supabase: SupabaseClient, t: Transfer) {
  const { to } = partiesOf(t)
  const { data } = await supabase.from('transactions')
    .select('id, amount, occurred_on, paid_by, merchant, category_id')
    .eq('paid_by', to).eq('direction', 'debit').is('covered_by', null)
    .not('scope', 'in', '(transfer,claimable,investment)').not('status', 'in', '(duplicate,ignored)')
    // A split payment is offered once, as its first part; covering it covers every part.
    .is('split_of', null)
    .gte('occurred_on', shiftDate(t.occurred_on, -WINDOW_DAYS)).lte('occurred_on', t.occurred_on.slice(0, 10))
    .order('occurred_on', { ascending: false }).limit(200)
  return (data ?? []).sort((a, b) => Math.abs(Number(a.amount) - t.amount) - Math.abs(Number(b.amount) - t.amount))
}

/** Moves the payment to the one who paid it back, and links the two. */
export async function cover(supabase: SupabaseClient, paymentId: string, t: Transfer) {
  const { from } = partiesOf(t)
  const { data, error } = await supabase.from('transactions')
    .update({ paid_by: from, covered_by: t.id }).eq('id', paymentId).is('covered_by', null).select('id')
  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

/** Puts the payment back with the one who first paid for it. */
export async function uncover(supabase: SupabaseClient, paymentId: string) {
  const { data: p } = await supabase.from('transactions').select('covered_by').eq('id', paymentId).maybeSingle()
  if (!p?.covered_by) return false
  const { data: t } = await supabase.from('transactions').select('id, amount, direction, paid_by, occurred_on').eq('id', p.covered_by).maybeSingle()
  if (!t) return false
  const { to } = partiesOf(t as Transfer)
  const { data } = await supabase.from('transactions').update({ paid_by: to, covered_by: null }).eq('id', paymentId).select('id')
  return (data ?? []).length > 0
}

/** Run on every new transfer between the two of them. Matches only when
 *  exactly one payment fits and neither record of the transfer is used yet. */
export async function autoCover(supabase: SupabaseClient, t: Transfer): Promise<string | null> {
  if (Number(t.amount) < MIN_AUTO) return null
  const used = [t.id, ...(await twinIds(supabase, t))]
  const { count } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).in('covered_by', used)
  if (count) return null
  const { to } = partiesOf(t)
  const { data } = await supabase.from('transactions')
    .select('id, amount, split_total, occurred_on, paid_by')
    .eq('paid_by', to).eq('direction', 'debit').is('covered_by', null)
    // A split payment is matched on what the bank took, not on its first part.
    .or(`and(amount.eq.${t.amount},split_total.is.null),split_total.eq.${t.amount}`).is('split_of', null)
    .not('scope', 'in', '(transfer,claimable,investment)').not('status', 'in', '(duplicate,ignored)')
    .gte('occurred_on', shiftDate(t.occurred_on, -WINDOW_DAYS)).lte('occurred_on', t.occurred_on.slice(0, 10))
  const hit = pickPayment(t, (data ?? []).map(r => ({ ...r, amount: Number(r.split_total ?? r.amount) })) as Payment[])
  if (!hit) return null
  return (await cover(supabase, hit.id, t)) ? hit.id : null
}
