import { inr } from './format.ts'

/**
 * Costs that come round every month whatever you do: the home, the people who
 * work in it, the bills and the subscriptions. Everything else is what you
 * chose to spend, which is the half a month actually turns on.
 */
export const FIXED = new Set([
  'Rent', 'Maintenance', 'Salaries', 'Maid', 'Cook', 'Driver',
  'Utilities', 'Power', 'Internet', 'Mobile', 'Phone', 'Gas',
  'Subscriptions', 'Streaming', 'Insurance', 'Gym', 'Dues',
])
export const isFixed = (leaf: string | null, top: string | null) =>
  Boolean((leaf && FIXED.has(leaf)) || (top && FIXED.has(top)))

export const pctChange = (now: number, then: number) => (then > 0 ? Math.round(((now - then) / then) * 100) : null)

/** One plain sentence about the month: the total against the usual, and the biggest move. */
export function summaryLine(o: { total: number; average: number; byNow: Map<string, number>; byPrev: Map<string, number> }) {
  const parts: string[] = [`${inr(o.total)} spent`]
  const p = pctChange(o.total, o.average)
  if (p !== null && Math.abs(p) >= 1) parts[0] += `, ${Math.abs(p)}% ${p < 0 ? 'under' : 'over'} your 6-month average`
  let best: { name: string; d: number } | null = null
  for (const name of new Set([...o.byNow.keys(), ...o.byPrev.keys()])) {
    const d = (o.byNow.get(name) ?? 0) - (o.byPrev.get(name) ?? 0)
    if (!best || Math.abs(d) > Math.abs(best.d)) best = { name, d }
  }
  const s = parts.join('') + '.'
  if (!best || Math.abs(best.d) < 1000) return s
  return `${s} Biggest change from last month: ${best.name}, ${best.d > 0 ? 'up' : 'down'} ${inr(Math.abs(best.d))}.`
}

export type Charge = { merchant_key: string | null; merchant: string | null; amount: number; occurred_on: string; category?: string | null }

/** Categories that are plans by nature, so a busy payee in them still counts. */
const PLAN_CATEGORIES = new Set(['Subscriptions', 'Streaming', 'Internet', 'Mobile', 'Phone', 'Insurance', 'Gym', 'Consulting Tools'])
export type Subscription = {
  key: string; name: string; monthly: number; yearly: number
  months: number; last: string; lastAmount: number; previousAmount: number | null; rose: boolean
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/**
 * A subscription is a run of charges from one payee at one price, about a
 * month apart, in at least three of the last six months.
 *
 * One payee can hold several plans (Apple bills iCloud and Apple One
 * separately), so charges are first grouped by price, within 12%. Two price
 * groups from the same payee that follow each other without overlapping are
 * one plan whose price changed, which is the price rise worth flagging.
 * Delivery apps and the tea shop fail the about-a-month-apart test.
 */
export function findSubscriptions(charges: Charge[], today = new Date()): Subscription[] {
  const since = new Date(today.getFullYear(), today.getMonth() - 5, 1).toISOString().slice(0, 10)
  const byKey = new Map<string, Charge[]>()
  for (const c of charges) {
    const amount = Number(c.amount)
    if (!c.merchant_key || c.occurred_on < since || amount < 50) continue
    if (/^(ACCOUNT|A\/C|UPI|NEFT|IMPS)$/.test(c.merchant_key)) continue
    // One payee can carry several plans that a rule has named apart (Apple:
    // Claude Pro, YouTube Premium, Apple One), so the name splits the payee.
    const group = `${c.merchant_key}\u0000${c.merchant ?? ''}`
    const l = byKey.get(group) ?? []; l.push({ ...c, amount }); byKey.set(group, l)
  }
  const out: Subscription[] = []
  for (const [group, list] of byKey) {
    const key = group.split('\u0000')[0]
    // Price groups, cheapest first.
    const groups: Charge[][] = []
    for (const c of [...list].sort((a, b) => a.amount - b.amount)) {
      const g = groups.at(-1)
      if (g && c.amount <= g[0].amount * 1.12) g.push(c); else groups.push([c])
    }
    for (const g of groups) g.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
    // Join a group to an earlier one it follows without overlap: a price change.
    const plans: { charges: Charge[]; rose: boolean }[] = []
    for (const g of [...groups].sort((a, b) => a[0].occurred_on.localeCompare(b[0].occurred_on))) {
      const before = plans.find(p => p.charges.at(-1)!.occurred_on < g[0].occurred_on
        && g[0].amount <= p.charges.at(-1)!.amount * 1.6 && g[0].amount >= p.charges.at(-1)!.amount / 1.6)
      if (before) { before.rose = before.rose || g[0].amount > before.charges.at(-1)!.amount; before.charges.push(...g) }
      else plans.push({ charges: g, rose: false })
    }
    for (const p of plans) {
      const cs = p.charges
      const months = new Set(cs.map(c => c.occurred_on.slice(0, 7)))
      if (months.size < 3 || cs.length / months.size > 1.3) continue
      const gaps = cs.slice(1).map((c, i) => (Date.parse(c.occurred_on) - Date.parse(cs[i].occurred_on)) / 86400000)
      // Every gap, not just the typical one: a shop visited three times a
      // month apart by chance has one long or short gap somewhere.
      if (gaps.some(g => g < 20 || g > 45) || median(gaps) < 25 || median(gaps) > 35) continue
      const days = cs.map(c => Number(c.occurred_on.slice(8, 10)))
      if (Math.max(...days) - Math.min(...days) > 8 && gaps.some(g => g < 25 || g > 36)) continue
      // A shop you visit every few days will have some price that recurs
      // monthly by chance. Unless the payee is filed as a plan, a price group
      // swamped by the payee's other charges is a habit, not a subscription.
      const others = list.length - cs.length
      const isPlan = cs.some(c => c.category && PLAN_CATEGORIES.has(c.category))
      if (!isPlan && others > cs.length) continue
      const last = cs.at(-1)!, prev = cs.at(-2) ?? null
      const monthly = last.amount
      out.push({
        key, name: last.merchant ?? key, monthly, yearly: monthly * 12, months: months.size,
        last: last.occurred_on, lastAmount: last.amount, previousAmount: prev ? prev.amount : null,
        rose: p.rose && prev !== null && last.amount > prev.amount * 1.05,
      })
    }
  }
  return out.sort((a, b) => b.yearly - a.yearly)
}

/**
 * The Monday message. Short enough to read on a lock screen: last week's
 * spend against a usual week, what is waiting, and any budget past 80%.
 */
export function digestText(o: {
  week: number; usualWeek: number; waiting: number
  budgets: { name: string; used: number }[]
}) {
  const p = pctChange(o.week, o.usualWeek)
  const lines = [`${inr(o.week)} spent last week${p !== null && Math.abs(p) >= 5 ? `, ${Math.abs(p)}% ${p < 0 ? 'under' : 'over'} a usual week` : ''}.`]
  const hot = o.budgets.filter(b => b.used >= 0.8).sort((a, b) => b.used - a.used)
  if (hot.length) lines.push(hot.slice(0, 2).map(b => `${b.name} at ${Math.round(b.used * 100)}% of budget`).join(', ') + '.')
  if (o.waiting > 0) lines.push(`${o.waiting} payment${o.waiting === 1 ? '' : 's'} waiting for a category.`)
  return lines.join(' ')
}
