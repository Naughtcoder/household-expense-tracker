'use server'
import { supabaseServer } from '../../lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type Result = { error?: string; ok?: boolean }

/** Money back in hand. Settled claims stop counting as owed. */
export async function markSettled(ids: string[], payoutId?: string | null): Promise<Result> {
  if (!ids.length) return { error: 'Nothing selected.' }
  const supabase = await supabaseServer()
  // Settled by a payout that arrived: dated that day and linked to it, so the
  // payout can list what it paid. Without one, today and no link.
  let on = new Date().toISOString().slice(0, 10)
  if (payoutId) {
    const { data: p } = await supabase.from('transactions').select('occurred_on').eq('id', payoutId).maybeSingle()
    if (p?.occurred_on) on = p.occurred_on
  }
  const { data, error } = await supabase.from('transactions')
    .update({ claim_settled_on: on, settled_by: payoutId ?? null })
    .in('id', ids).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Nothing changed. An access rule may be blocking it.' }
  revalidatePath('/claimable'); revalidatePath('/')
  return { ok: true }
}

export async function unsettle(id: string): Promise<Result> {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('transactions')
    .update({ claim_settled_on: null, settled_by: null }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/claimable')
  return { ok: true }
}

/** Wrongly marked claimable. Put it back into household spending. */
export async function notClaimable(id: string): Promise<Result> {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('transactions')
    .update({ scope: 'household', claim_settled_on: null, settled_by: null }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/claimable'); revalidatePath('/')
  return { ok: true }
}
