'use server'
import { ALEX_ID } from '../../lib/household'
import { SAM_ID } from '../../lib/payback'
import { OTHER_INCOME } from '../../lib/income'
import { supabaseServer } from '../../lib/supabase/server'
import { ingestText } from '../../lib/ingest'
import { readHistoryShot as readShot, historyText, type OcrLine, type ShotRow } from '../../lib/history-shot'
import { revalidatePath } from 'next/cache'

async function me() {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  const { data: person } = await supabase.from('people')
    .select('id').eq('auth_uid', data.user?.id ?? '').maybeSingle()
  return { supabase, person }
}

/** Paste a bank message, or several. Same rules the Shortcut goes through. */
export async function paste(_prev: unknown, formData: FormData) {
  const text = String(formData.get('text') ?? '')
  if (!text.trim()) return { message: 'Nothing pasted.' }
  const { supabase, person } = await me()
  if (!person) return { message: 'Your login is not linked to a person row yet.' }
  try {
    const r = await ingestText(supabase, text, person.id)
    revalidatePath('/'); revalidatePath('/review')
    return { message: r.saved || r.duplicates ? r.message : `Nothing readable found. ${r.refused} message(s) were recognised and skipped.` }
  } catch (e) {
    return { message: (e as Error).message }
  }
}

/** Cash, which no bank will ever text you about. direction 'credit' is cash received: it files as income. */
export async function addCash(_prev: unknown, formData: FormData) {
  const amount = Number(formData.get('amount'))
  const merchant = String(formData.get('merchant') ?? '').trim()
  const occurred = String(formData.get('occurred_on') ?? '')
  const money_in = String(formData.get('direction') ?? '') === 'credit'
  // Cash received with no category named is Other income, so it counts as income at once.
  const categoryId = Number(formData.get('category_id')) || (money_in ? OTHER_INCOME : null)
  const scope = String(formData.get('scope') ?? 'household') as 'household' | 'personal' | 'claimable' | 'investment' | 'transfer'
  if (!amount || !merchant || !occurred) return { message: 'Amount, what it was, and a date.' }

  const { supabase, person } = await me()
  if (!person) return { message: 'Your login is not linked to a person row yet.' }

  // Either of the two may be named as the payer (the phone's Paid by sheet);
  // anyone else, or nothing, means whoever is signed in.
  const asked = String(formData.get('paid_by') ?? '')
  const paidBy = asked === ALEX_ID || asked === SAM_ID ? asked : person.id

  const { error } = await supabase.from('transactions').insert({
    amount, direction: money_in ? 'credit' : 'debit', occurred_on: occurred,
    merchant, merchant_key: merchant.toUpperCase(), merchant_raw: merchant,
    category_id: categoryId, paid_by: paidBy, entered_by: person.id,
    scope, status: categoryId || scope === 'investment' ? 'confirmed' : 'review', bank: 'cash', raw_text: null,
  })
  if (error?.code === '23505') return { message: 'Already logged.' }
  if (error) return { message: error.message }
  revalidatePath('/'); revalidatePath('/review')
  return { message: `${merchant} ₹${amount.toLocaleString('en-IN')} added.` }
}

/**
 * A payment app's history screenshot, as the lines the phone read off it
 * (lib/history-shot.ts). Returns the rows for the person to check, each
 * marked when a payment of that amount on that day is already in the books.
 */
export async function readHistoryShot(args: { lines: OcrLine[]; takenAt?: string; paidBy?: string }) {
  const { supabase, person } = await me()
  if (!person) return { error: 'Your login is not linked to a person row yet.' }
  const paidBy = args.paidBy === ALEX_ID || args.paidBy === SAM_ID ? args.paidBy : person.id
  const taken = args.takenAt && !isNaN(Date.parse(args.takenAt)) ? new Date(args.takenAt) : new Date()
  const { rows, unread } = readShot(Array.isArray(args.lines) ? args.lines : [], taken)
  const days = [...new Set(rows.map(r => r.date))]
  const { data: have } = days.length
    ? await supabase.from('transactions').select('amount, occurred_on').eq('paid_by', paidBy).in('occurred_on', days).not('status', 'in', '(duplicate,ignored)')
    : { data: [] }
  const seen = new Set((have ?? []).map(t => `${Number(t.amount)}|${t.occurred_on}`))
  return { paidBy, unread, rows: rows.map(r => ({ ...r, inBooks: seen.has(`${r.amount}|${r.date}`) })) }
}

/** Files the rows the person ticked, through the same reading as any payment screen. */
export async function addHistoryRows(args: { rows: ShotRow[]; app?: string; paidBy?: string }) {
  const { supabase, person } = await me()
  if (!person) return { error: 'Your login is not linked to a person row yet.' }
  const paidBy = args.paidBy === ALEX_ID || args.paidBy === SAM_ID ? args.paidBy : person.id
  const app = /^[A-Za-z ]{2,20}$/.test(String(args.app ?? '')) ? String(args.app) : 'PhonePe'
  let saved = 0, duplicates = 0
  for (const r of (args.rows ?? []).slice(0, 50)) {
    if (r.direction !== 'debit' || !(Number(r.amount) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !r.payee) continue
    const row = { ...r, amount: Number(r.amount), payee: String(r.payee).replace(/\|/g, ' ').slice(0, 80) }
    const res = await ingestText(supabase, historyText(app, row), paidBy, false,
      `history:${paidBy.slice(0, 8)}:${row.date}:${row.amount}:${row.payee.toUpperCase()}`, true)
    saved += res.saved; duplicates += res.duplicates
  }
  revalidatePath('/'); revalidatePath('/review')
  return { saved, duplicates }
}

/** "Nothing else is missing": closes a gap alarm (lib/alarms.ts). */
export async function closeGap(id: number) {
  const { supabase, person } = await me()
  if (!person) return { error: 'Your login is not linked to a person row yet.' }
  const { error } = await supabase.from('alarms').update({ cleared_at: new Date().toISOString() }).eq('id', id).eq('kind', 'gap')
  revalidatePath('/')
  return error ? { error: error.message } : { ok: true }
}
