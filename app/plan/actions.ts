'use server'
import { supabaseServer } from '../../lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkPlan, cleanParts, type PlanInput } from '../../lib/splits'

export type Result = { error?: string; ok?: boolean; id?: string }

const row = (p: PlanInput) => ({
  paid_by: p.paidBy,
  payee_hint: p.payeeHint?.trim() || null,
  expected_amount: Math.round(Number(p.expected) * 100) / 100,
  tolerance: Math.round(Number(p.tolerance ?? 0) * 100) / 100,
  window_from: p.from,
  window_to: p.to,
  parts: cleanParts(p.parts),
  note: p.note?.trim() || null,
})

/** A split planned before the payment happens. Applied by itself when the
 *  payment arrives (lib/ingest.ts applyPlans). */
export async function createPlan(p: PlanInput): Promise<Result> {
  const wrong = checkPlan(p)
  if (wrong) return { error: wrong }
  const supabase = await supabaseServer()
  const { data: u } = await supabase.auth.getUser()
  const { data: me } = await supabase.from('people').select('id').eq('auth_uid', u.user?.id ?? '').maybeSingle()
  const { data, error } = await supabase.from('planned_splits').insert({ ...row(p), created_by: me?.id ?? null }).select('id').single()
  if (error) return { error: error.message }
  revalidatePath('/plan')
  return { ok: true, id: data.id }
}

/** Changes a plan that has not been used yet. */
export async function updatePlan(id: string, p: PlanInput): Promise<Result> {
  const wrong = checkPlan(p)
  if (wrong) return { error: wrong }
  const supabase = await supabaseServer()
  const { data, error } = await supabase.from('planned_splits').update(row(p)).eq('id', id).eq('status', 'open').select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'That plan was not found, or it has already been used.' }
  revalidatePath('/plan')
  return { ok: true, id }
}

/** Stops a plan from applying. Kept, marked cancelled, not deleted. */
export async function cancelPlan(id: string): Promise<Result> {
  const supabase = await supabaseServer()
  const { data, error } = await supabase.from('planned_splits').update({ status: 'cancelled' }).eq('id', id).eq('status', 'open').select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'That plan was not found, or it has already been used.' }
  revalidatePath('/plan')
  return { ok: true }
}
