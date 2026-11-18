// What a payee rule is, which rule a payment falls under, and how to say a
// rule in one plain line. Pure: no database, so the website, the phone app
// and the tests all use the same copy.
//
// A rule is WHEN the payee text matches (and any extra conditions hold)
// THEN file it this way.

export type MatchType = 'exact' | 'contains' | 'starts'
export const MATCH_TYPES: MatchType[] = ['exact', 'starts', 'contains']

export interface Rule {
  id: number
  match_key: string
  match_type?: MatchType | string | null
  min_amount?: number | string | null
  max_amount?: number | string | null
  paid_by?: string | null
  direction?: 'debit' | 'credit' | string | null
  /** The "show it as" name. Empty leaves the payment's own name. */
  merchant: string | null
  category_id: number | null
  default_scope: string
  ask?: boolean | null
}

/** What a rule is matched against. */
export interface PaymentFacts {
  /** The cleaned payee key, e.g. ZEPTO MARKETPLACE. */
  key: string | null
  /** The payee as the bank wrote it. */
  raw?: string | null
  amount: number
  paidBy?: string | null
  direction?: string | null
}

/** A plain rule: "is exactly", nothing else. What Review writes. */
export const PLAIN_SHAPE = 'exact||||'

const num = (v: number | string | null | undefined) => (v == null || v === '' ? null : Number(v))
export const matchTypeOf = (r: Pick<Rule, 'match_type'>): MatchType =>
  r.match_type === 'contains' || r.match_type === 'starts' ? r.match_type : 'exact'

/** How many of the optional conditions a rule carries. */
export function conditionCount(r: Rule) {
  return (num(r.min_amount) != null ? 1 : 0) + (num(r.max_amount) != null ? 1 : 0)
    + (r.paid_by ? 1 : 0) + (r.direction ? 1 : 0)
}

export const isPlain = (r: Rule) => matchTypeOf(r) === 'exact' && conditionCount(r) === 0

/** Does the payee text match? "Is exactly" compares the cleaned key as it is,
 *  the way rules always have. The other two ignore case and look at both the
 *  cleaned key and the bank's own wording. */
export function textMatches(r: Rule, p: PaymentFacts) {
  const text = (r.match_key ?? '').trim()
  if (!text) return false
  const type = matchTypeOf(r)
  if (type === 'exact') return p.key != null && p.key === r.match_key
  const t = text.toUpperCase()
  const fields = [p.key, p.raw].filter((s): s is string => !!s).map(s => s.toUpperCase())
  return type === 'starts' ? fields.some(f => f.startsWith(t)) : fields.some(f => f.includes(t))
}

/** Do the optional conditions hold? Amounts compare the size of the payment,
 *  so a refund of Rs 600 counts as Rs 600. */
export function conditionsHold(r: Rule, p: PaymentFacts) {
  const size = Math.abs(Number(p.amount) || 0)
  const min = num(r.min_amount), max = num(r.max_amount)
  if (min != null && size < min) return false
  if (max != null && size > max) return false
  if (r.paid_by && p.paidBy !== r.paid_by) return false
  if (r.direction && (p.direction ?? 'debit') !== r.direction) return false
  return true
}

export const ruleMatches = (r: Rule, p: PaymentFacts) => textMatches(r, p) && conditionsHold(r, p)

const RANK: Record<MatchType, number> = { exact: 0, starts: 1, contains: 2 }

/** Which of two matching rules wins: "is exactly" before "starts with"
 *  before "contains"; then the one with more conditions; then the longer
 *  text; then the older rule, so the answer never flips between runs. */
export function compareRules(a: Rule, b: Rule) {
  return RANK[matchTypeOf(a)] - RANK[matchTypeOf(b)]
    || conditionCount(b) - conditionCount(a)
    || (b.match_key ?? '').trim().length - (a.match_key ?? '').trim().length
    || a.id - b.id
}

/** The one rule this payment falls under, or null. */
export function matchRule<R extends Rule>(rules: readonly R[], p: PaymentFacts): R | null {
  let best: R | null = null
  for (const r of rules) {
    if (!ruleMatches(r, p)) continue
    if (!best || compareRules(r, best) < 0) best = r
  }
  return best
}

export const ALEX = '00000000-0000-4000-8000-dead00000001'
export const SAM = '00000000-0000-4000-8000-dead00000002'
const PERSON: Record<string, string> = { [ALEX]: 'Alex', [SAM]: 'Sam' }

const MATCH_WORDS: Record<MatchType, string> = { exact: 'is', starts: 'starts with', contains: 'contains' }
export const matchLabel = (t: MatchType) => ({ exact: 'Is exactly', starts: 'Starts with', contains: 'Contains' })[t]

const rupees = (n: number) => `Rs ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const SCOPE_WORDS: Record<string, string> = {
  claimable: 'Employer claim', investment: 'Investment', transfer: 'Transfer',
}

/** The WHEN half in plain words: "Payee contains ZEPTO, over Rs 500, paid by Sam". */
export function describeWhen(r: Rule) {
  const parts = [`Payee ${MATCH_WORDS[matchTypeOf(r)]} ${(r.match_key ?? '').trim()}`]
  const min = num(r.min_amount), max = num(r.max_amount)
  if (min != null && max != null) parts.push(`${rupees(min)} to ${rupees(max)}`)
  else if (min != null) parts.push(`${rupees(min)} or more`)
  else if (max != null) parts.push(`up to ${rupees(max)}`)
  if (r.paid_by) parts.push(`paid by ${PERSON[r.paid_by] ?? 'someone else'}`)
  if (r.direction === 'credit') parts.push('money in')
  else if (r.direction === 'debit') parts.push('money out')
  return parts.join(', ')
}

/** The THEN half: "Groceries", "Groceries, Employer claim, ask me". */
export function describeThen(r: Rule, categoryLabel: string) {
  const parts: string[] = []
  if (r.category_id || !['investment', 'transfer'].includes(r.default_scope)) parts.push(categoryLabel || 'No category')
  if (SCOPE_WORDS[r.default_scope]) parts.push(SCOPE_WORDS[r.default_scope])
  if (r.ask) parts.push('ask me')
  return parts.join(', ')
}

/** The whole rule on one line. */
export const describeRule = (r: Rule, categoryLabel: string) => `${describeWhen(r)} → ${describeThen(r, categoryLabel)}`

/** The fields the builder edits, as it sends them. */
export interface RuleFields {
  text: string
  matchType: MatchType
  minAmount: number | null
  maxAmount: number | null
  paidBy: string | null
  direction: 'debit' | 'credit' | null
  categoryId: number | null
  scope: string
  showAs: string | null
  ask: boolean
}

const SCOPES = ['household', 'claimable', 'investment', 'transfer']

/** Checks a rule before it is saved. Returns the row to write, or the first
 *  thing wrong in plain words. */
export function checkRule(f: Partial<RuleFields>): { error: string } | { row: Omit<Rule, 'id'> } {
  const text = String(f.text ?? '').trim().toUpperCase()
  const matchType: MatchType = f.matchType === 'contains' || f.matchType === 'starts' ? f.matchType : 'exact'
  if (!text) return { error: 'Type the payee text the rule looks for.' }
  if (matchType !== 'exact' && text.length < 3) return { error: 'Use at least 3 letters, or the rule would catch almost every payment.' }
  const amt = (v: unknown) => (v == null || v === '' ? null : Number(v))
  const minAmount = amt(f.minAmount), maxAmount = amt(f.maxAmount)
  if (minAmount != null && (!isFinite(minAmount) || minAmount < 0)) return { error: 'The lowest amount must be a number of rupees.' }
  if (maxAmount != null && (!isFinite(maxAmount) || maxAmount < 0)) return { error: 'The highest amount must be a number of rupees.' }
  if (minAmount != null && maxAmount != null && minAmount > maxAmount) return { error: 'The lowest amount is more than the highest.' }
  const paidBy = f.paidBy && PERSON[f.paidBy] ? f.paidBy : null
  if (f.paidBy && !paidBy) return { error: 'Paid by must be Alex, Sam or either.' }
  const direction = f.direction === 'credit' || f.direction === 'debit' ? f.direction : null
  const scope = SCOPES.includes(String(f.scope)) ? String(f.scope) : 'household'
  const categoryId = f.categoryId ? Number(f.categoryId) : null
  if (!categoryId && scope !== 'investment' && scope !== 'transfer') return { error: 'Pick a category. Only investments and transfers can go without one.' }
  return {
    row: {
      match_key: text, match_type: matchType, min_amount: minAmount, max_amount: maxAmount,
      paid_by: paidBy, direction, category_id: categoryId, default_scope: scope,
      merchant: f.showAs?.trim() || null, ask: !!f.ask,
    },
  }
}
