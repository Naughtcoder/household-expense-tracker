'use server'
import { supabaseServer } from '../../lib/supabase/server'
import { revalidatePath } from 'next/cache'

/** Say how many months one payment for this plan covers. 1 removes the entry. */
export async function setPlanMonths(form: FormData) {
  const merchant = String(form.get('merchant') ?? '').trim()
  const months = Number(form.get('months'))
  if (!merchant || !Number.isInteger(months) || months < 1 || months > 36) return
  const supabase = await supabaseServer()
  if (months === 1) await supabase.from('plan_periods').delete().eq('merchant', merchant)
  else await supabase.from('plan_periods').upsert({ merchant, months })
  revalidatePath('/subscriptions')
}
