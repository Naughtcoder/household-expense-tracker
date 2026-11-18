/**
 * The context a drill-down carries with it: which period and whose money.
 * Passed along in the query string so a payee or a payment opened from
 * "Food, 2026, Sam" can show that trail and go back up it.
 */
export type Ctx = { y?: string; m?: string; who?: string; c?: string; k?: string; from?: string; n?: string }

export const ctxQuery = (c: Ctx, extra: Record<string, string | undefined> = {}) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...c, ...extra })) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `?${s}` : ''
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
export const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/** The top of a trail: the year view or the month page. */
export const PEOPLE: Record<string, string> = {
  '00000000-0000-4000-8000-dead00000001': 'Alex',
  '00000000-0000-4000-8000-dead00000002': 'Sam',
}
const whose = (c: Ctx) => (c.who && PEOPLE[c.who] ? ` · ${PEOPLE[c.who]}` : '')

export const periodCrumb = (c: Ctx) =>
  c.y ? { label: c.y + whose(c), href: `/insights?p=year&at=${c.y}-01-01&show=out${c.who ? `&who=${c.who}` : ''}` }
  : c.m ? { label: monthLabel(c.m) + whose(c), href: c.who ? `/insights?p=month&at=${c.m}-01&show=out&who=${c.who}` : `/?m=${c.m}` }
  : null

/** Bank wording that names no one ("to ACCOUNT *******", "Other"). Payments
 *  under one of these keys belong to different people, so they are told
 *  apart by the name written on each row instead. */
export const genericKey = (k: string | null | undefined) =>
  !k || /^(ACCOUNT|A\/C|BANK ACCOUNT|OTHER|RENT|UPI|TRANSFER|NEFT|IMPS)\b/i.test(k)

/** Bank text arrives in capitals ("SAMPLE STORE"). Shown as a name, it reads
 *  better in title case; mixed-case names someone typed are left alone. */
export const pretty = (s: string) =>
  s === s.toUpperCase() && /[A-Z]{3}/.test(s)
    ? s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\bWww\.?/g, '')
    : s

/** A note someone wrote, not one the app wrote while filing. Only these are
 *  shown under a payment in lists; the app's own notes stay on the payment. */
export const personNote = (n: string | null | undefined) =>
  n && !/^(Guessed|Classified|Employer claim|From |Added |Untraced|BankA 2222|Same as|Approved claim|Business cost|Likely|Bank Account|A business cost|Weekday was|Sam paying|Brokerage balance|Filed as)/.test(n) ? n : null
