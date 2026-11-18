'use server'
import { catTree } from '../../lib/cats'
import { supabaseServer } from '../../lib/supabase/server'
import { ingestText } from '../../lib/ingest'
import { revalidatePath } from 'next/cache'
import { isScope, type Scope } from '../../lib/scope'
import { INCOME } from '../../lib/income'
import { findRule } from '../../lib/rule-lookup'
import { isPlain } from '../../lib/rules'

export type Result = { error?: string; ok?: boolean; filed?: number }

async function me() {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  const { data: person } = await supabase.from('people')
    .select('id, name').eq('auth_uid', data.user?.id ?? '').maybeSingle()
  return { supabase, person }
}

/**
 * Takes plain arguments rather than a FormData.
 *
 * The category used to ride along as the clicked submit button's value, and
 * React does not carry the submitter through to a server action, so it arrived
 * empty every time. An explicit argument cannot go missing.
 */
export async function fileTransaction(input: {
  id: string
  /** Null only for an investment, which is not spending and has no category. */
  categoryId: number | null
  scope: Scope
  merchantKey: string | null
  merchant: string | null
  /** File every other waiting row from the same merchant at the same time. */
  applyToAll?: boolean
  /** His own line about this payment. Saved on this row only. */
  note?: string
}): Promise<Result> {
  // Money moved into a fund or to his own account is not spending and needs no category.
  if (!input.categoryId && input.scope !== 'investment' && input.scope !== 'transfer') return { error: 'Pick a category first.' }
  if (!isScope(input.scope)) return { error: `Unknown scope ${input.scope}.` }

  const { supabase, person } = await me()
  if (!person) return { error: 'Your login is not linked to a person row. Run the auth_uid update in Supabase.' }

  const merchant = input.merchant || input.merchantKey || null

  const patch = { category_id: input.categoryId, scope: input.scope, status: 'confirmed' as const, merchant }
  // What this payment looked like before filing, to see which rule it falls under.
  const { data: facts } = input.merchantKey
    ? await supabase.from('transactions').select('merchant_key, merchant_raw, amount, paid_by, direction').eq('id', input.id).maybeSingle()
    : { data: null }

  // With applyToAll, every waiting row from the same merchant goes at once.
  // Twenty Zepto orders arriving before a rule existed should cost one tap.
  const query = input.applyToAll && input.merchantKey
    ? supabase.from('transactions').update(patch).eq('status', 'review').eq('merchant_key', input.merchantKey)
    : supabase.from('transactions').update(patch).eq('id', input.id)

  const { data: updated, error } = await query.select('id, status')
  if (error) return { error: `${error.code ?? ''} ${error.message}`.trim() }
  if (input.note !== undefined) {
    const { error: noteError } = await supabase.from('transactions').update({ note: input.note.trim() || null }).eq('id', input.id)
    if (noteError) return { ok: true, error: `Filed, but the note was not saved: ${noteError.message}` }
  }
  if (!updated?.length) {
    return { error: 'The database accepted the request and changed nothing. An access rule is blocking the update.' }
  }
  const filed = updated.length

  // Money in filed under a spending category is someone paying back their
  // share, so it comes off that cost. It is stored the way a refund is, as a
  // negative payment out, so every total already treats it correctly.
  // Ruled by Alex, 3 Oct 2026. Income categories stay as money in.
  if (input.categoryId) {
    // Income at any depth: walk up to the top of the branch.
    const { data: allCats } = await supabase.from('categories').select('id, name, parent_id')
    const isIncome = catTree(allCats ?? []).root(input.categoryId)?.id === INCOME
    if (allCats?.length && !isIncome) {
      const { data: credits } = await supabase.from('transactions').select('id, amount')
        .in('id', updated.map(u => u.id)).eq('direction', 'credit')
      for (const c of credits ?? []) {
        const { error: flipError } = await supabase.from('transactions')
          .update({ direction: 'debit', amount: -Math.abs(Number(c.amount)) }).eq('id', c.id)
        if (flipError) return { ok: true, error: `Filed, but the payback was not taken off the cost: ${flipError.message}` }
      }
    }
  }

  // A vendor that always asks (Swiggy, Zepto) keeps its broad category. One
  // pick of Indulgence must not become the answer for every later order.
  // A rule built by hand ("contains ZEPTO", "over Rs 500") that covers this
  // payment is left to do its job: filing one payment does not write a plain
  // rule over it.
  const covering = input.merchantKey
    ? await findRule(supabase, {
        key: facts?.merchant_key ?? input.merchantKey, raw: facts?.merchant_raw ?? null,
        amount: Number(facts?.amount ?? 0), paidBy: facts?.paid_by ?? person.id, direction: facts?.direction ?? 'debit',
      }, {})
    : null
  const builtByHand = !!covering && !isPlain(covering)
  if (input.merchantKey && !covering?.ask && !builtByHand) {
    const { error: ruleError } = await supabase.from('merchant_rules').upsert({
      match_key: input.merchantKey, merchant, category_id: input.categoryId,
      default_scope: input.scope, created_by: person.id,
    }, { onConflict: 'match_key,rule_shape' })
    if (ruleError) return { ok: true, error: `Filed, but the rule was not saved: ${ruleError.message}` }
  }

  revalidatePath('/review'); revalidatePath('/'); revalidatePath('/insights'); revalidatePath('/rules')
  return { ok: true, filed }
}

export async function ignoreTransaction(id: string): Promise<Result> {
  const { supabase, person } = await me()
  if (!person) return { error: 'Your login is not linked to a person row.' }
  const { data: updated, error } = await supabase.from('transactions')
    .update({ status: 'ignored' }).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!updated?.length) return { error: 'The database changed nothing. An access rule is blocking the update.' }
  revalidatePath('/review'); revalidatePath('/')
  return { ok: true }
}

/** Retry a message the parser could not read, after a new pattern ships. */
export async function retryUnparsed(id: string, text: string): Promise<Result> {
  const { supabase, person } = await me()
  if (!person) return { error: 'Your login is not linked to a person row.' }
  try {
    const r = await ingestText(supabase, text, person.id)
    if (r.saved > 0) await supabase.from('unparsed').update({ resolved: true }).eq('id', id)
    revalidatePath('/review'); revalidatePath('/')
    return { ok: true, error: r.saved ? undefined : 'Still unreadable. No pattern matches it yet.' }
  } catch (e) {
    return { error: (e as Error).message }
  }
}


/** Confirmed a twin. Keeps the row so nothing is lost, and stops it counting. */
export async function markAsDuplicate(id: string): Promise<Result> {
  const { supabase, person } = await me()
  if (!person) return { error: 'Your login is not linked to a person row.' }
  const { data, error } = await supabase.from('transactions')
    .update({ status: 'duplicate' }).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Nothing changed. An access rule may be blocking it.' }
  revalidatePath('/review'); revalidatePath('/')
  return { ok: true }
}

/** Genuinely two purchases. Clears the flag and sends it back through Review. */
export async function keepBoth(id: string): Promise<Result> {
  const { supabase, person } = await me()
  if (!person) return { error: 'Your login is not linked to a person row.' }
  const { data, error } = await supabase.from('transactions')
    .update({ possible_duplicate_of: null }).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Nothing changed.' }
  revalidatePath('/review')
  return { ok: true }
}

/** Not a payment (an offer, a receipt, a notice). Out of the list for good. */
export async function dismissUnparsed(id: string): Promise<Result> {
  const { supabase } = await me()
  const { error } = await supabase.from('unparsed').update({ resolved: true }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/review')
  return { ok: true }
}
