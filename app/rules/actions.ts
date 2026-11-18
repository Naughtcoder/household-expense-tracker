'use server'
import { supabaseServer } from '../../lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { catTree } from '../../lib/cats'
import { INCOME } from '../../lib/income'
import { checkRule, ruleMatches, type Rule, type RuleFields } from '../../lib/rules'

export type Result = { error?: string; ok?: boolean }

export async function updateRule(_prev: Result, formData: FormData): Promise<Result> {
  const id = Number(formData.get('id'))
  const categoryId = Number(formData.get('category_id')) || null
  const scope = String(formData.get('default_scope') || 'household')
  const supabase = await supabaseServer()
  const { error, count } = await supabase.from('merchant_rules')
    .update({ category_id: categoryId, default_scope: scope }, { count: 'exact' }).eq('id', id)
  if (error) return { error: error.message }
  if (!count) return { error: 'That rule was not found.' }
  revalidatePath('/rules')
  return { ok: true }
}

/** Deleting a rule leaves everything already filed with it alone. */
export async function deleteRule(_prev: Result, formData: FormData): Promise<Result> {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('merchant_rules').delete().eq('id', Number(formData.get('id')))
  if (error) return { error: error.message }
  revalidatePath('/rules')
  return { ok: true }
}

async function me() {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  const { data: person } = await supabase.from('people')
    .select('id').eq('auth_uid', data.user?.id ?? '').maybeSingle()
  return { supabase, person }
}

const taken = 'There is already a rule with this payee text and these conditions. Open that one and change it instead.'
const refresh = () => { revalidatePath('/rules'); revalidatePath('/review'); revalidatePath('/') }

/** A new rule from the builder. */
export async function createRule(fields: Partial<RuleFields>): Promise<Result & { id?: number }> {
  const checked = checkRule(fields)
  if ('error' in checked) return { error: checked.error }
  const { supabase, person } = await me()
  if (!person) return { error: 'Your login is not linked to a person row.' }
  const { data, error } = await supabase.from('merchant_rules')
    .insert({ ...checked.row, created_by: person.id }).select('id').single()
  if (error?.code === '23505') return { error: taken }
  if (error) return { error: error.message }
  refresh()
  return { ok: true, id: data.id as number }
}

/** Every field of an existing rule, from the builder. */
export async function saveRule(id: number, fields: Partial<RuleFields>): Promise<Result & { id?: number }> {
  const checked = checkRule(fields)
  if ('error' in checked) return { error: checked.error }
  const { supabase } = await me()
  const { data, error } = await supabase.from('merchant_rules').update(checked.row).eq('id', id).select('id')
  if (error?.code === '23505') return { error: taken }
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'That rule was not found. It may have been deleted.' }
  refresh()
  return { ok: true, id }
}

type Past = {
  id: string; merchant: string | null; merchant_key: string | null; merchant_raw: string | null
  occurred_on: string; amount: number; direction: string; paid_by: string; category_id: number | null
  scope: string; status: string; possible_duplicate_of: string | null
}

/** Past payments the rule's WHEN matches, newest first. The payee text is
 *  matched in the database; the other conditions here, with the same code
 *  that files new payments, so the preview cannot disagree with it. */
async function pastMatches(supabase: Awaited<ReturnType<typeof supabaseServer>>, rule: Omit<Rule, 'id'>) {
  const rows: Past[] = []
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.rpc('rule_text_matches', { p_text: rule.match_key, p_type: rule.match_type ?? 'exact' })
      .select('id, merchant, merchant_key, merchant_raw, occurred_on, amount, direction, paid_by, category_id, scope, status, possible_duplicate_of')
      .not('status', 'in', '(duplicate,ignored)')
      // A split payment's parts were filed by hand, one by one. A rule must
      // not file them all as one thing.
      .is('split_of', null).is('split_total', null)
      .order('occurred_on', { ascending: false }).order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as Past[]
    rows.push(...page)
    if (page.length < 1000) break
  }
  const full = { ...rule, id: 0 }
  return rows.filter(r => ruleMatches(full, {
    key: r.merchant_key, raw: r.merchant_raw, amount: Number(r.amount), paidBy: r.paid_by, direction: r.direction,
  }))
}

/** Which of the matches applying a rule may change. Never a transfer, a
 *  Employer claim or an investment unless the rule itself files as that; never
 *  a possible twin still waiting to be checked; and, unless asked, only ones
 *  still in Review or with no category. */
const changeable = (rule: Omit<Rule, 'id'>, includeFiled: boolean) => (r: Past) =>
  (!['transfer', 'claimable', 'investment'].includes(r.scope) || r.scope === rule.default_scope)
  && !r.possible_duplicate_of
  && (includeFiled || r.status === 'review' || r.category_id == null)

export type RulePreview = {
  error?: string
  /** Past payments the rule matches. */
  count: number
  /** Of those, the ones still in Review or with no category. */
  waiting: number
  examples: { id: string; merchant: string | null; occurred_on: string; amount: number; direction: string; category_id: number | null; status: string }[]
}

/** How many past payments a rule (saved or not) would match, with a few. */
export async function previewRule(fields: Partial<RuleFields>): Promise<RulePreview> {
  // A preview needs only the WHEN half, so any category will do for the check.
  const checked = checkRule({ ...fields, categoryId: 1, scope: 'household' })
  if ('error' in checked) return { error: checked.error, count: 0, waiting: 0, examples: [] }
  const { supabase } = await me()
  try {
    const rows = await pastMatches(supabase, checked.row)
    return {
      count: rows.length,
      waiting: rows.filter(changeable({ ...checked.row, default_scope: String(fields.scope ?? 'household') }, false)).length,
      examples: rows.slice(0, 5).map(r => ({
        id: r.id, merchant: r.merchant ?? r.merchant_key, occurred_on: r.occurred_on, amount: Number(r.amount),
        direction: r.direction, category_id: r.category_id, status: r.status,
      })),
    }
  } catch (e) {
    return { error: (e as Error).message, count: 0, waiting: 0, examples: [] }
  }
}

/** Files past payments by a saved rule. Only ones still waiting (in Review or
 *  with no category) unless `includeFiled`; see `changeable` for what is
 *  never touched. A rule that still asks sets the category and leaves each
 *  one where it was. */
export async function applyRuleToPast(id: number, includeFiled = false): Promise<Result & { changed?: number }> {
  const { supabase } = await me()
  const { data: rule, error } = await supabase.from('merchant_rules').select('*').eq('id', id).maybeSingle()
  if (error) return { error: error.message }
  if (!rule) return { error: 'That rule was not found.' }
  const r = rule as Rule
  let rows: Past[]
  try { rows = (await pastMatches(supabase, r)).filter(changeable(r, includeFiled)) }
  catch (e) { return { error: (e as Error).message } }
  if (!rows.length) return { ok: true, changed: 0 }

  const patch: Record<string, unknown> = { category_id: r.category_id, scope: r.default_scope }
  if (r.merchant) patch.merchant = r.merchant
  if (!r.ask) patch.status = 'confirmed'
  const ids = rows.map(x => x.id)
  for (let i = 0; i < ids.length; i += 200) {
    const { error: e } = await supabase.from('transactions').update(patch).in('id', ids.slice(i, i + 200))
    if (e) return { error: `Changed ${i} of ${ids.length}, then: ${e.message}` }
  }

  // Money in filed under a spending category is someone paying their share
  // back, stored as a negative payment out, the same as filing it in Review.
  if (r.category_id && !r.ask) {
    const { data: cats } = await supabase.from('categories').select('id, name, parent_id')
    const isIncome = catTree(cats ?? []).root(r.category_id)?.id === INCOME
    if (cats?.length && !isIncome && !['transfer', 'investment', 'claimable'].includes(r.default_scope)) {
      for (const c of rows.filter(x => x.direction === 'credit')) {
        await supabase.from('transactions').update({ direction: 'debit', amount: -Math.abs(Number(c.amount)) }).eq('id', c.id)
      }
    }
  }
  refresh(); revalidatePath('/insights')
  return { ok: true, changed: rows.length }
}
