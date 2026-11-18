// Splitting one payment into parts, and plans for a split made before the
// payment arrives. Pure functions only, so the website, the phone and the
// tests all use the same rules. The storing is done by split_payment() in
// db/036_splits.sql, which checks the same sum again.
//
// How a split is stored: the payment's own row becomes the first part (its
// amount is that part's amount), each other part is a row pointing at it
// (split_of), and the bank's amount is kept as split_total. So every total in
// the app, which adds up rows, is right with no change.

import { isScope, type Scope } from './scope.ts'

export type Part = { amount: number; category_id: number | null; scope: Scope; note?: string | null }

/** Rupees as whole paise, so 0.1 + 0.2 sums exactly. */
export const paise = (n: number | string) => Math.round(Number(n) * 100)

/** What is left to place: the payment less the parts so far, in rupees. */
export const remainder = (total: number, parts: { amount: number | string }[]) =>
  (paise(total) - parts.reduce((s, p) => s + paise(p.amount || 0), 0)) / 100

/** Why these parts cannot be saved, or null when they can. */
export function checkParts(total: number, parts: Part[]): string | null {
  if (!Array.isArray(parts) || parts.length < 2) return 'A split needs at least two parts.'
  for (const [i, p] of parts.entries()) {
    if (!Number.isFinite(Number(p.amount)) || paise(p.amount) === 0) return `Part ${i + 1} has no amount.`
    if (!isScope(p.scope)) return `Part ${i + 1} has an unknown "for".`
    if (!p.category_id && p.scope !== 'transfer' && p.scope !== 'investment') return `Part ${i + 1} needs a category.`
  }
  const left = remainder(total, parts)
  if (left !== 0) {
    const sum = (paise(total) - paise(left)) / 100
    return `The parts add up to ${sum.toFixed(2)}, not the payment's ${Number(total).toFixed(2)}.`
  }
  return null
}

/** Parts as the database takes them: amounts rounded to the paisa, empty notes dropped. */
export const cleanParts = (parts: Part[]): Part[] => parts.map(p => ({
  amount: paise(p.amount) / 100,
  category_id: p.category_id ? Number(p.category_id) : null,
  scope: p.scope,
  note: p.note?.trim() || null,
}))

export type Plan = {
  id: string
  paid_by: string
  payee_hint: string | null
  expected_amount: number | string
  tolerance: number | string
  window_from: string
  window_to: string
  parts: Part[]
  status: string
  created_at?: string
}

export type Incoming = {
  amount: number
  paid_by: string
  occurred_on: string
  direction: string
  merchant_key?: string | null
  merchant_raw?: string | null
  merchant?: string | null
}

/** The words a plan's payee hint names, any of which is enough: "SHARMA | 1234". */
export const hintsOf = (hint: string | null | undefined) =>
  (hint ?? '').split(/[|,]/).map(h => h.trim().toUpperCase()).filter(h => h.length >= 3)

/** True when the payee matches one of the plan's words. A number ("1234")
 *  must stand alone, so it never matches inside a longer reference number. */
export function payeeMatches(hint: string | null | undefined, p: Pick<Incoming, 'merchant_key' | 'merchant_raw' | 'merchant'>) {
  const text = [p.merchant_key, p.merchant_raw, p.merchant].filter(Boolean).join(' ').toUpperCase()
  if (!text) return false
  return hintsOf(hint).some(h => /^\d+$/.test(h) ? new RegExp(`(^|\\D)${h}(\\D|$)`).test(text) : text.includes(h))
}

const day = (s: string) => s.slice(0, 10)

/**
 * Which open plan a new payment belongs to, if any.
 *
 * A plan is a candidate when it is open, for the same person, its window
 * covers the day, and either the payee matches or the amount is exactly the
 * one expected. A candidate whose amount is within the tolerance is applied
 * by itself ('apply'); one that matched on the payee alone at a different
 * amount is only pointed out ('differs'), for a person to decide. When
 * several fit, an apply beats a differs, then the nearest amount, then the
 * oldest plan.
 */
export function matchPlan(p: Incoming, plans: Plan[]): { plan: Plan; kind: 'apply' | 'differs'; diff: number } | null {
  if (p.direction !== 'debit' || !(Number(p.amount) > 0)) return null
  const hits: { plan: Plan; kind: 'apply' | 'differs'; diff: number }[] = []
  for (const plan of plans) {
    if (plan.status !== 'open' || plan.paid_by !== p.paid_by) continue
    if (day(p.occurred_on) < day(plan.window_from) || day(p.occurred_on) > day(plan.window_to)) continue
    const diff = (paise(p.amount) - paise(plan.expected_amount)) / 100
    const exact = diff === 0
    const payee = payeeMatches(plan.payee_hint, p)
    if (!exact && !payee) continue
    const within = Math.abs(paise(diff)) <= paise(plan.tolerance || 0)
    hits.push({ plan, kind: within ? 'apply' : 'differs', diff })
  }
  hits.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'apply' ? -1 : 1)
    || Math.abs(a.diff) - Math.abs(b.diff)
    || String(a.plan.created_at ?? '').localeCompare(String(b.plan.created_at ?? '')))
  return hits[0] ?? null
}

/** A plan's parts made to fit a payment within its leeway: the first part
 *  takes the difference, so the parts still add up to what the bank took. */
export const fitParts = (parts: Part[], diff: number): Part[] =>
  parts.map((p, i) => (i === 0 ? { ...p, amount: (paise(p.amount) + paise(diff)) / 100 } : p))

/** The rows of a list with a split payment shown once. Where the whole
 *  payment and all its parts are in the list, the first part stands for the
 *  payment, at the bank's amount, carrying its parts; the other parts are not
 *  listed separately. Where a list holds only some parts (a category page),
 *  each part shows on its own. Totals must still be added up from the rows
 *  given, not from what this returns. */
export function collapseSplits<T extends { id: string; amount: number | string; split_of?: string | null; split_total?: number | string | null }>(rows: T[]): (T & { parts?: T[]; shown: number })[] {
  const kids = new Map<string, T[]>()
  for (const r of rows) if (r.split_of) kids.set(r.split_of, [...(kids.get(r.split_of) ?? []), r])
  const whole = new Set<string>()
  for (const r of rows) {
    if (r.split_total == null) continue
    const parts = [r, ...(kids.get(r.id) ?? [])]
    if (paise(r.split_total) === parts.reduce((s, x) => s + paise(x.amount), 0)) whole.add(r.id)
  }
  const out: (T & { parts?: T[]; shown: number })[] = []
  for (const r of rows) {
    if (r.split_of && whole.has(r.split_of)) continue
    if (whole.has(r.id)) out.push({ ...r, parts: [r, ...(kids.get(r.id) ?? [])], shown: Number(r.split_total) })
    else out.push({ ...r, shown: Number(r.amount) })
  }
  return out
}

export type PlanInput = {
  paidBy: string
  payeeHint: string | null
  expected: number
  tolerance?: number | null
  from: string
  to: string
  parts: Part[]
  note?: string | null
}

const isDay = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** Why a plan cannot be saved, or null when it can. Its parts must add up to
 *  the amount expected, the same rule as a split made after the fact. */
export function checkPlan(p: PlanInput): string | null {
  if (!p.paidBy) return 'Say who will pay.'
  if (!(Number(p.expected) > 0)) return 'Give the amount you expect to pay.'
  if (Number(p.tolerance ?? 0) < 0) return 'The leeway cannot be below zero.'
  if (!isDay(p.from) || !isDay(p.to)) return 'Give the first and last day it may arrive.'
  if (p.to < p.from) return 'The last day is before the first.'
  return checkParts(Number(p.expected), p.parts)
}
