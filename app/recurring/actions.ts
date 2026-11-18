'use server'
import { supabaseServer } from '../../lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type Result = { error?: string; ok?: boolean; note?: string }

export async function saveRecurring(input: {
  id?: number; label: string; amount: number | null; dayOfMonth: number
  categoryId: number | null; scope: 'household' | 'claimable'; paidBy: string; active: boolean
}): Promise<Result> {
  if (!input.label.trim()) return { error: 'It needs a name.' }
  if (input.dayOfMonth < 1 || input.dayOfMonth > 28) return { error: 'Pick a day between 1 and 28.' }

  const supabase = await supabaseServer()
  const row = {
    label: input.label.trim(), amount: input.amount, day_of_month: input.dayOfMonth,
    category_id: input.categoryId, scope: input.scope, paid_by: input.paidBy, active: input.active,
  }
  const { error } = input.id
    ? await supabase.from('recurring').update(row).eq('id', input.id)
    : await supabase.from('recurring').insert(row)
  if (error) return { error: error.message }
  revalidatePath('/recurring')
  return { ok: true }
}

export async function removeRecurring(id: number): Promise<Result> {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('recurring').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/recurring')
  return { ok: true }
}

/** Post anything due now rather than waiting for tomorrow's job. */
export async function runNow(): Promise<Result> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const res = await fetch(`${base}/api/cron/recurring`, {
    headers: process.env.CRON_SECRET ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {},
    cache: 'no-store',
  })
  const body = await res.json().catch(() => ({}))
  revalidatePath('/recurring'); revalidatePath('/')
  const posted: string[] = body.posted ?? []
  const skipped: string[] = body.skipped ?? []
  return {
    ok: res.ok,
    note: posted.length
      ? `Posted ${posted.join(', ')}.`
      : `Nothing posted. ${skipped.join('. ') || 'Nothing was due.'}`,
  }
}
