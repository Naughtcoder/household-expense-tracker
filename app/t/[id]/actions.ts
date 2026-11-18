'use server'
import { supabaseServer } from '../../../lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cover, uncover } from '../../../lib/payback'
import { checkParts, cleanParts, type Part } from '../../../lib/splits'

export type Result = { error?: string; ok?: boolean }

export async function saveTransaction(_prev: Result, formData: FormData): Promise<Result> {
  const id = String(formData.get('id'))
  const amount = Number(formData.get('amount'))
  const merchant = String(formData.get('merchant') ?? '').trim()
  const occurred = String(formData.get('occurred_on') ?? '')
  const categoryId = Number(formData.get('category_id')) || null
  const scope = String(formData.get('scope') || 'household')
  const direction = String(formData.get('direction') || 'debit')
  const tagIds = formData.getAll('tag_id').map(Number).filter(Boolean)
  const note = String(formData.get('note') ?? '').trim() || null

  if (!amount || !occurred) return { error: 'An amount and a date are required.' }

  const supabase = await supabaseServer()
  const { error, count } = await supabase.from('transactions')
    .update({ amount, merchant, occurred_on: occurred, category_id: categoryId,
              scope, direction, note, status: 'confirmed' }, { count: 'exact' })
    .eq('id', id)
  if (error) return { error: error.message }
  if (!count) return { error: 'That transaction was not found.' }

  // Replace the tag set wholesale. Simpler than working out the difference,
  // and there are never more than a handful.
  await supabase.from('transaction_tags').delete().eq('transaction_id', id)
  if (tagIds.length) {
    const { error: tagError } = await supabase.from('transaction_tags')
      .insert(tagIds.map(tag_id => ({ transaction_id: id, tag_id })))
    if (tagError) return { ok: true, error: `Saved, but tags failed: ${tagError.message}` }
  }

  revalidatePath('/'); revalidatePath('/review'); revalidatePath('/insights'); revalidatePath(`/t/${id}`)
  return { ok: true }
}

export async function deleteTransaction(formData: FormData) {
  const supabase = await supabaseServer()
  const id = String(formData.get('id'))
  // One part of a split is not a payment on its own. Deleting it would leave
  // the other parts short of what the bank took, so it opens the whole payment.
  const { data: row } = await supabase.from('transactions').select('split_of').eq('id', id).maybeSingle()
  if (row?.split_of) redirect(`/t/${row.split_of}`)
  await supabase.from('transactions').delete().eq('id', id)
  revalidatePath('/'); revalidatePath('/review')
  redirect('/')
}

/** A new tag, made while filing a payment. Returns the existing one if the
 *  name is already taken, so a double tap cannot make two. */
export async function createTag(name: string): Promise<{ id?: number; name?: string; error?: string }> {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 60)
  if (!clean) return { error: 'Give the tag a name.' }
  const supabase = await supabaseServer()
  const { data: found } = await supabase.from('tags').select('id, name').ilike('name', clean).maybeSingle()
  if (found) return { id: found.id, name: found.name }
  const { data, error } = await supabase.from('tags').insert({ name: clean, archived: false }).select('id, name').single()
  if (error) return { error: error.message }
  return { id: data.id, name: data.name }
}

/** Links a payment to the transfer that paid it back, moving the cost to the
 *  one who sent the money; or undoes that. */
export async function coverPayment(paymentId: string, transferId: string): Promise<Result> {
  const supabase = await supabaseServer()
  const { data: t } = await supabase.from('transactions').select('id, amount, direction, paid_by, occurred_on, scope').eq('id', transferId).maybeSingle()
  if (!t || t.scope !== 'transfer') return { error: 'That transfer was not found.' }
  const ok = await cover(supabase, paymentId, { ...t, amount: Number(t.amount) })
  if (!ok) return { error: 'Nothing changed. It may already be paid back.' }
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function uncoverPayment(paymentId: string): Promise<Result> {
  const supabase = await supabaseServer()
  const ok = await uncover(supabase, paymentId)
  if (!ok) return { error: 'Nothing changed.' }
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** A friend's pay-back points at the payment it repays and takes that
 *  payment's category, so it comes off that cost. */
export async function linkPayback(paybackId: string, paymentId: string): Promise<Result> {
  const supabase = await supabaseServer()
  const { data: p } = await supabase.from('transactions').select('id, category_id').eq('id', paymentId).maybeSingle()
  if (!p) return { error: 'That payment was not found.' }
  const { data, error } = await supabase.from('transactions')
    .update({ pays_back: paymentId, ...(p.category_id ? { category_id: p.category_id } : {}) }).eq('id', paybackId).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Nothing changed.' }
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function unlinkPayback(paybackId: string): Promise<Result> {
  const supabase = await supabaseServer()
  const { data } = await supabase.from('transactions').update({ pays_back: null }).eq('id', paybackId).select('id')
  if (!data?.length) return { error: 'Nothing changed.' }
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** The bank's amount for a payment, split or not, and whether it may be split. */
async function bankAmount(supabase: Awaited<ReturnType<typeof supabaseServer>>, id: string) {
  const { data } = await supabase.from('transactions').select('id, amount, split_total, split_of, direction').eq('id', id).maybeSingle()
  if (!data) return { error: 'That payment was not found.' }
  if (data.split_of) return { error: 'That is one part of a split payment. Open the whole payment to change it.' }
  if (data.direction !== 'debit') return { error: 'Only money out can be split.' }
  return { total: Number(data.split_total ?? data.amount) }
}

/** Splits a payment into parts, or changes the parts of one already split.
 *  The parts must add up to the bank's amount to the paisa. */
export async function splitPayment(id: string, parts: Part[]): Promise<Result> {
  const supabase = await supabaseServer()
  const b = await bankAmount(supabase, id)
  if ('error' in b) return { error: b.error }
  const wrong = checkParts(b.total, parts)
  if (wrong) return { error: wrong }
  const { error } = await supabase.rpc('split_payment', { p_id: id, p_parts: cleanParts(parts) })
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Puts a split payment back as one. Takes the payment or any of its parts. */
export async function unsplitPayment(id: string): Promise<Result> {
  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('unsplit_payment', { p_id: id })
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Applies a planned split to a payment, with the plan's own parts or with
 *  parts changed to fit a payment that came in at a different amount. */
export async function applyPlan(planId: string, paymentId: string, parts?: Part[] | null): Promise<Result> {
  const supabase = await supabaseServer()
  const b = await bankAmount(supabase, paymentId)
  if ('error' in b) return { error: b.error }
  const { data: plan } = await supabase.from('planned_splits').select('id, parts, status').eq('id', planId).maybeSingle()
  if (!plan) return { error: 'That plan was not found.' }
  if (plan.status !== 'open') return { error: 'That plan has already been used or was cancelled.' }
  const use = parts?.length ? parts : (plan.parts as Part[])
  const wrong = checkParts(b.total, use)
  if (wrong) return { error: wrong }
  const { error } = await supabase.rpc('apply_planned_split', { p_plan: planId, p_txn: paymentId, p_parts: cleanParts(use) })
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { ok: true }
}
