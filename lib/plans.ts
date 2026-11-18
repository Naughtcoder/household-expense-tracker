// What subscriptions cost in one month, with a plan paid for a year spread
// across the twelve months it covers. Pure, so the screen and the tests agree.

export type PlanCharge = { merchant: string | null; merchant_key: string | null; amount: number; occurred_on: string }
export type PlanLine = {
  name: string
  /** This month's share: the whole payment for a monthly plan, a twelfth of a yearly one. */
  share: number
  /** Months one payment covers. 1 for monthly or anything unknown. */
  months: number
  /** The payment the share comes from, and when it was made. */
  paid: number
  paidOn: string
  /** Payments made in this month itself (a weekly plan charges several). */
  count: number
}

const ym = (iso: string) => iso.slice(0, 7)
const monthsBetween = (a: string, b: string) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7))

/** Each plan's share of `month` ('YYYY-MM'), largest first. */
export function planMonth(charges: PlanCharge[], periods: Map<string, number>, month: string): PlanLine[] {
  const lines = new Map<string, PlanLine>()
  for (const c of charges) {
    const name = c.merchant ?? c.merchant_key ?? 'Unknown'
    const months = periods.get(name) ?? 1
    const gap = monthsBetween(ym(c.occurred_on), month)
    if (gap < 0 || gap >= months) continue
    const amount = Number(c.amount)
    const l = lines.get(name) ?? { name, share: 0, months, paid: 0, paidOn: '', count: 0 }
    l.share += amount / months
    if (c.occurred_on >= l.paidOn) { l.paid = amount; l.paidOn = c.occurred_on }
    if (gap === 0) l.count += 1
    lines.set(name, l)
  }
  return [...lines.values()].filter(l => Math.round(l.share) !== 0).sort((a, b) => b.share - a.share)
}

/** The first month a share can come from, given the longest period in use. */
export function lookbackFrom(month: string, periods: Map<string, number>) {
  const longest = Math.max(1, ...periods.values())
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - longest, 1))
  return d.toISOString().slice(0, 10)
}
