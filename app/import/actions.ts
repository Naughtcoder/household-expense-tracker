'use server'
import { supabaseServer } from '../../lib/supabase/server'
import { parseStatement } from '../../lib/csv-import'
import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { findRule } from '../../lib/rule-lookup'
import { matchRule, type Rule } from '../../lib/rules'

export type Preview = {
  format: string
  total: number
  debits: number
  credits: number
  from: string | null
  to: string | null
  recognised: number
  unknownMerchants: string[]
  skipped: string[]
}

export type ImportResult = {
  error?: string
  saved?: number
  duplicates?: number
  toReview?: number
  message?: string
}

export async function previewStatement(text: string): Promise<Preview | { error: string }> {
  const { rows, format, skipped } = parseStatement(text)
  if (rows.length === 0) {
    return { error: skipped[0] ?? 'Nothing in that file looked like a transaction.' }
  }
  const debits = rows.filter(r => r.direction === 'debit')
  const dates = rows.map(r => r.date).sort()
  return {
    format,
    total: rows.length,
    debits: debits.reduce((s, r) => s + r.amount, 0),
    credits: rows.filter(r => r.direction === 'credit').reduce((s, r) => s + r.amount, 0),
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    recognised: debits.filter(r => r.clean.known).length,
    unknownMerchants: [...new Set(debits.filter(r => !r.clean.known).map(r => r.clean.cleaned))].slice(0, 20),
    skipped,
  }
}

export async function importStatement(text: string): Promise<ImportResult> {
  const { rows } = parseStatement(text)
  if (!rows.length) return { error: 'Nothing to import.' }

  const supabase = await supabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  const { data: person } = await supabase.from('people')
    .select('id').eq('auth_uid', auth.user?.id ?? '').maybeSingle()
  if (!person) return { error: 'Your login is not linked to a person row.' }

  // Money Manager rows arrive already categorised. Match those names to ours
  // so a month of work done on the phone is not thrown away.
  const { data: cats } = await supabase.from('categories').select('id, name, parent_id')
  const byName = new Map((cats ?? []).map(c => [c.name.toLowerCase(), c]))
  const resolveNamed = (child?: string | null, parent?: string | null) => {
    const c = child ? byName.get(child.toLowerCase()) : null
    if (c) return c.id
    const p = parent ? byName.get(parent.toLowerCase()) : null
    return p ? p.id : null
  }

  let saved = 0, duplicates = 0, toReview = 0
  const ruleCache: { loose?: Rule[] } = {}

  for (const r of rows) {
    // Card bill payments, GST lines and reversals are not spending.
    if (r.clean.flags.includes('card_payment') || r.clean.flags.includes('tax')) {
      continue
    }

    const key = r.clean.cleaned || null

    let rule = await findRule(supabase,
      { key, raw: r.description, amount: r.amount, paidBy: person.id, direction: r.direction }, ruleCache)
    if (!rule && key) {
      const { data } = await supabase.rpc('closest_merchant', { probe: key })
      rule = data?.[0] ?? null
    }

    const { data: maybe } = await supabase.rpc('possible_duplicates', {
      p_amount: r.amount, p_date: r.date,
      p_account: r.accountTail, p_merchant: key, p_direction: r.direction,
    })
    const twin = Array.isArray(maybe) && maybe.length > 0 ? maybe[0].id : null

    const namedCategory = resolveNamed(r.categoryName, r.parentName)
    const categoryId = rule?.category_id ?? namedCategory
    const known = Boolean(rule) || r.clean.known || Boolean(namedCategory)
    const status = twin ? 'review' : (known && r.amount < 25000 ? 'confirmed' : 'review')

    const { error } = await supabase.from('transactions').insert({
      amount: r.amount,
      currency: 'INR',
      direction: r.direction,
      occurred_on: r.date,
      merchant_raw: r.description,
      merchant_key: key,
      merchant: rule?.merchant ?? (r.clean.known ? r.clean.merchant : (r.note || r.clean.merchant)) ?? null,
      category_id: categoryId,
      paid_by: person.id,
      entered_by: person.id,
      scope: rule?.default_scope ?? 'household',
      status,
      bank: `${r.bank} statement`,
      account_tail: r.accountTail,
      pattern_id: 'statement-import',
      flags: r.clean.flags,
      raw_text: r.description,
      possible_duplicate_of: twin,
    })

    if (error?.code === '23505') { duplicates++; continue }
    if (error) return { error: error.message }
    saved++
    if (status === 'review') toReview++
  }

  revalidatePath('/'); revalidatePath('/review'); revalidatePath('/all')
  return {
    saved, duplicates, toReview,
    message: `${saved} added, ${duplicates} already there, ${toReview} waiting in Review.`,
  }
}


/**
 * Bulk path, for a file with thousands of rows.
 *
 * The per-row importer above makes three database calls per transaction, which
 * is fine for a statement of seventy and hopeless for six thousand. This loads
 * the rules and categories once, resolves everything in memory, and writes in
 * chunks. The unique index on the database is what stops repeats, so no
 * duplicate lookup is needed per row.
 */
export async function importBulk(text: string, offset = 0, chunk = 800): Promise<ImportResult & { done?: boolean; next?: number; total?: number }> {
  const { rows } = parseStatement(text)
  if (!rows.length) return { error: 'Nothing to import.' }

  const supabase = await supabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  const { data: person } = await supabase.from('people')
    .select('id').eq('auth_uid', auth.user?.id ?? '').maybeSingle()
  if (!person) return { error: 'Your login is not linked to a person row.' }

  const [{ data: cats }, { data: rules }] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id'),
    supabase.from('merchant_rules').select('*'),
  ])
  const byName = new Map((cats ?? []).map(c => [c.name.toLowerCase(), c]))
  const allRules = (rules ?? []) as Rule[]

  // A stable identity per row, so importing the same file twice changes
  // nothing, while genuine same-day repeats stay separate. The counter runs
  // over the whole file, not the slice, so it does not restart per chunk.
  const nth = new Map<string, number>()
  const sourceKeys = rows.map(r => {
    const base = [r.date, r.amount, r.direction, r.description, r.bank].join('|')
    const n = (nth.get(base) ?? 0) + 1
    nth.set(base, n)
    return 'file:' + createHash('sha1').update(base).digest('hex').slice(0, 20) + ':' + n
  })

  const slice = rows.slice(offset, offset + chunk)
  const payload = slice.flatMap((r, i) => {
    // Paying a card bill or a tax line is not spending.
    if (r.clean.flags.includes('card_payment') || r.clean.flags.includes('tax')) return []

    const key = r.clean.cleaned || null
    const rule = matchRule(allRules, { key, raw: r.description, amount: r.amount, paidBy: person.id, direction: r.direction })
    const named = (r.categoryName && byName.get(r.categoryName.toLowerCase())?.id)
      ?? (r.parentName && byName.get(r.parentName.toLowerCase())?.id)
      ?? null
    const categoryId = rule?.category_id ?? named
    const known = Boolean(rule) || r.clean.known || Boolean(categoryId)

    return [{
      amount: r.amount,
      currency: 'INR',
      direction: r.direction,
      occurred_on: r.date,
      merchant_raw: r.description,
      merchant_key: key,
      merchant: rule?.merchant ?? (r.clean.known ? r.clean.merchant : (r.note || r.clean.merchant)) ?? null,
      category_id: categoryId,
      paid_by: person.id,
      entered_by: person.id,
      scope: rule?.default_scope ?? 'household',
      status: known ? 'confirmed' : 'review',
      bank: r.bank,
      account_tail: r.accountTail,
      pattern_id: 'bulk-import',
      flags: r.clean.flags,
      raw_text: r.description,
      source_key: sourceKeys[offset + i],
    }]
  })

  // ignoreDuplicates leans on the unique index on source_key, so a re-run is safe.
  const { data, error } = await supabase.from('transactions')
    .upsert(payload, { onConflict: 'source_key', ignoreDuplicates: true })
    .select('id')
  if (error) return { error: error.message }

  const saved = data?.length ?? 0
  const next = offset + chunk
  const done = next >= rows.length
  if (done) { revalidatePath('/'); revalidatePath('/review'); revalidatePath('/all'); revalidatePath('/insights') }

  return {
    saved,
    duplicates: payload.length - saved,
    total: rows.length,
    next: done ? undefined : next,
    done,
    message: `${offset + slice.length} of ${rows.length} read.`,
  }
}
