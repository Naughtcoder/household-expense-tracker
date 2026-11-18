// A made-up household for the demo app: Rohan and Meera, two years of
// payments ending today. Every name, payee, amount and salary is invented.
// The random numbers come from a fixed seed, so the demo looks the same each
// time it opens, only moved along to the current date.

import { monthlyTaxOn } from '@lib/tax.ts'

type Row = Record<string, unknown>

// The person ids the shared code already knows (pay-backs, transfers, rules),
// shown under made-up names in the demo.
export const ROHAN = '00000000-0000-4000-8000-dead00000001'
export const MEERA = '00000000-0000-4000-8000-dead00000002'
export const DEMO_NAMES: Record<string, string> = { [ROHAN]: 'Rohan', [MEERA]: 'Meera' }

/** The same tree as the real app, so the ids the code relies on (Deposit 18, Travel 9, Salary 68) hold. */
const CATEGORIES: [number, string, number | null][] = [
  [1, 'Rent', null], [16, 'Rent', 1], [17, 'Maintenance', 1], [18, 'Deposit', 1],
  [2, 'Food', null], [19, 'Groceries', 2], [20, 'Delivery', 2], [21, 'Eating Out', 2], [22, 'Indulgence', 2], [75, 'Beverages', 2],
  [3, 'Transportation', null], [28, 'Taxi', 3], [29, 'Fuel', 3], [30, 'Car', 3], [31, 'Parking', 30], [77, 'Toll', 30],
  [4, 'Utilities', null], [32, 'Power', 4], [33, 'Internet', 4], [34, 'Mobile', 4], [35, 'Gas', 4], [36, 'Subscriptions', 4],
  [5, 'Household', null], [23, 'Electronics', 5], [24, 'Furniture', 5], [25, 'Appliances', 5], [26, 'Repairs', 5], [27, 'Supplies', 5],
  [6, 'Health', null], [37, 'Pharmacy', 6], [38, 'Doctor', 6], [39, 'Hospital', 6], [40, 'Gym', 6], [41, 'Insurance', 6],
  [7, 'Apparel', null], [42, 'Clothing', 7], [43, 'Footwear', 7], [44, 'Accessories', 7],
  [8, 'Entertainment', null], [45, 'Going Out', 8], [46, 'Events', 8], [47, 'Streaming', 8],
  [9, 'Travel', null], [48, 'Flights', 9], [49, 'Hotels', 9], [50, 'Local Transport', 9], [51, 'Visas', 9], [63, 'Forex', 9],
  [11, 'Salaries', null], [52, 'Maid', 11], [53, 'Cook', 11], [54, 'Driver', 11],
  [12, 'Beauty', null], [55, 'Haircut', 12], [56, 'Self-care', 12],
  [13, 'Culture', null], [78, 'Books', 13],
  [15, 'Other', null], [57, 'Gifts', 15], [58, 'Charity', 15],
  [60, 'Social Life', null], [64, 'Friends', 60], [65, 'Dues', 60],
  [61, 'Tax', null], [84, 'Income Tax', 61], [85, 'Filing Fees', 61],
  [66, 'Miscellaneous', null],
  [67, 'Income', null], [68, 'Salary', 67], [69, 'Interest', 67], [70, 'Paid Back', 67], [71, 'Refunds', 67], [72, 'Other Income', 67],
  [79, 'Investments', null],
]

function rng(seedValue: number) {
  let a = seedValue
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function seed(): Record<string, Row[]> {
  const r = rng(20261008)
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const between = (lo: number, hi: number, step = 1) => Math.round((lo + r() * (hi - lo)) / step) * step
  let n = 0
  const id = () => `00000000-0000-4000-a000-${String(++n).padStart(12, '0')}`

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = new Date(today.getFullYear(), today.getMonth() - 23, 1)
  const tx: Row[] = []
  const tags: Row[] = []
  const links: Row[] = []

  const add = (o: {
    on: Date; amount: number; merchant: string; cat: number | null; who: string; dir?: 'debit' | 'credit'
    scope?: string; status?: string; note?: string; tag?: number; bank?: string; tail?: string
  }) => {
    if (o.on > today) return null
    const t = id()
    const hh = between(8, 22), mm = between(0, 59)
    const card = o.who === ROHAN ? pick([['BankA', '1234'], ['BankA Card', '5678']]) : pick([['SBI', '4321'], ['ICICI Card', '8765']])
    tx.push({
      id: t, amount: Math.round(o.amount * 100) / 100, direction: o.dir ?? 'debit', occurred_on: iso(o.on),
      occurred_at: `${iso(o.on)}T${pad(hh)}:${pad(mm)}:00+05:30`, merchant_raw: o.merchant.toUpperCase(),
      merchant_key: o.merchant.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim(), merchant: o.merchant,
      category_id: o.cat, paid_by: o.who, entered_by: o.who, scope: o.scope ?? 'household', status: o.status ?? 'confirmed',
      bank: o.bank ?? card[0], account_tail: o.tail ?? card[1], pattern_id: null, flags: [], raw_text: null,
      duplicate_of: null, created_at: `${iso(o.on)}T${pad(hh)}:${pad(mm)}:00+05:30`, currency: 'INR', balance: null,
      recurring_id: null, recurring_period: null, claim_settled_on: null, possible_duplicate_of: null, source_key: null,
      note: o.note ?? null, original_amount: null, original_currency: null, settled_by: null, covered_by: null,
      pays_back: null, split_of: null, split_total: null, split_restore: null,
    })
    if (o.tag) links.push({ transaction_id: t, tag_id: o.tag })
    return t
  }

  const day = (y: number, m: number, d: number) => new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate()))
  const someDay = (y: number, m: number) => day(y, m, between(1, 28))

  // Trips, as tags named the way the real app names them.
  const trips = [
    { name: 'Goa, Dec 2025', from: new Date(2025, 11, 20), days: 5, flights: 18400, hotel: 9800 },
    { name: 'Kyoto, Apr 2026', from: new Date(2026, 3, 4), days: 8, flights: 92000, hotel: 21000 },
    { name: 'Coorg, Aug 2026', from: new Date(2026, 7, 14), days: 3, flights: 0, hotel: 12500 },
  ].filter(t => t.from <= today && t.from >= start)
  trips.forEach((t, i) => tags.push({ id: i + 1, name: t.name, colour: null, archived: false, created_at: iso(t.from) }))

  for (let d = new Date(start); d <= today; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const y = d.getFullYear(), m = d.getMonth()
    const raised = d >= new Date(2026, 3, 1)

    // Money in.
    add({ on: day(y, m, 1), amount: raised ? 4_38_000 : 4_10_000, merchant: 'Salary (Northwind Labs)', cat: 68, who: ROHAN, dir: 'credit' })
    add({ on: day(y, m, 30), amount: raised ? 3_72_000 : 3_55_000, merchant: 'Salary (Bluefin Health)', cat: 68, who: MEERA, dir: 'credit' })
    if (m % 3 === 2) add({ on: day(y, m, 30), amount: between(3800, 6200), merchant: 'Savings interest', cat: 69, who: pick([ROHAN, MEERA]), dir: 'credit' })

    // The home and the people who work in it.
    add({ on: day(y, m, 5), amount: 58_000, merchant: 'Kavita Rao (rent)', cat: 16, who: ROHAN })
    if (m % 3 === 0) add({ on: day(y, m, 8), amount: 7_500, merchant: 'Lakeview Residents Association', cat: 17, who: ROHAN })
    add({ on: day(y, m, 1), amount: 7_000, merchant: 'Sunita (maid)', cat: 52, who: MEERA })
    add({ on: day(y, m, 2), amount: 9_000, merchant: 'Ramesh (cook)', cat: 53, who: MEERA })

    // Bills and plans.
    add({ on: day(y, m, 12), amount: between(1600, 3600, 10), merchant: 'BESCOM', cat: 32, who: ROHAN })
    add({ on: day(y, m, 9), amount: 1_179, merchant: 'ACT Fibernet', cat: 33, who: ROHAN })
    add({ on: day(y, m, 14), amount: 399, merchant: 'Jio', cat: 34, who: ROHAN })
    add({ on: day(y, m, 17), amount: 599, merchant: 'Airtel', cat: 34, who: MEERA })
    add({ on: day(y, m, 3), amount: 649, merchant: 'Netflix', cat: 47, who: MEERA })
    add({ on: day(y, m, 11), amount: 119, merchant: 'Spotify', cat: 36, who: ROHAN })
    add({ on: day(y, m, 20), amount: 219, merchant: 'iCloud storage', cat: 36, who: MEERA })
    add({ on: day(y, m, 6), amount: 1_999, merchant: 'Cult.fit', cat: 40, who: MEERA })
    if (m === 6) add({ on: day(y, m, 18), amount: 24_800, merchant: 'Star Health insurance', cat: 41, who: ROHAN })

    // Food.
    for (let i = 0; i < between(10, 16); i++) {
      const who = pick([ROHAN, MEERA, MEERA])
      const [shop, lo, hi] = pick<[string, number, number]>([['Zepto', 180, 1400], ['Blinkit', 150, 1200], ['BigBasket', 900, 3200], ['Nature\'s Basket', 600, 2600], ['Fresh Mart', 80, 650]])
      add({ on: someDay(y, m), amount: between(lo, hi), merchant: shop, cat: 19, who })
    }
    for (let i = 0; i < between(6, 12); i++) add({ on: someDay(y, m), amount: between(260, 980), merchant: pick(['Swiggy', 'Zomato']), cat: 20, who: pick([ROHAN, MEERA]) })
    for (let i = 0; i < between(3, 6); i++) add({ on: someDay(y, m), amount: between(900, 5200, 10), merchant: pick(['Toit', 'Truffles', 'Meghana Foods', 'The Fatty Bao', 'Byg Brewski', 'Glen\'s Bakehouse']), cat: 21, who: pick([ROHAN, MEERA]) })
    for (let i = 0; i < between(6, 12); i++) add({ on: someDay(y, m), amount: between(40, 420, 5), merchant: pick(['Third Wave Coffee', 'Blue Tokai', 'Chai Point', 'Corner tea stall']), cat: 75, who: pick([ROHAN, MEERA]) })
    for (let i = 0; i < between(1, 3); i++) add({ on: someDay(y, m), amount: between(150, 700), merchant: pick(['Corner House', 'Theobroma', 'Naturals Ice Cream']), cat: 22, who: pick([ROHAN, MEERA]) })

    // Getting around.
    for (let i = 0; i < between(12, 22); i++) add({ on: someDay(y, m), amount: between(90, 650), merchant: pick(['Uber', 'Ola', 'Rapido', 'Namma Yatri']), cat: 28, who: pick([ROHAN, MEERA]) })
    for (let i = 0; i < 2; i++) add({ on: someDay(y, m), amount: between(2200, 3600, 10), merchant: pick(['Indian Oil', 'HP Petrol']), cat: 29, who: ROHAN })
    for (let i = 0; i < between(1, 4); i++) add({ on: someDay(y, m), amount: between(40, 160, 10), merchant: 'UB City parking', cat: 31, who: ROHAN })

    // The rest of life.
    for (let i = 0; i < between(1, 3); i++) add({ on: someDay(y, m), amount: between(250, 2400), merchant: pick(['Apollo Pharmacy', 'MedPlus']), cat: 37, who: pick([ROHAN, MEERA]) })
    if (r() < 0.35) add({ on: someDay(y, m), amount: between(800, 1500, 100), merchant: 'Dr. Iyer clinic', cat: 38, who: pick([ROHAN, MEERA]) })
    for (let i = 0; i < between(1, 3); i++) add({ on: someDay(y, m), amount: between(300, 2800), merchant: 'Amazon', cat: 27, who: pick([ROHAN, MEERA]) })
    if (r() < 0.5) add({ on: someDay(y, m), amount: between(1200, 6500, 10), merchant: pick(['Uniqlo', 'Zara', 'Myntra', 'FabIndia']), cat: 42, who: pick([ROHAN, MEERA]) })
    if (r() < 0.6) add({ on: someDay(y, m), amount: between(400, 2400, 10), merchant: 'BookMyShow', cat: 46, who: pick([ROHAN, MEERA]) })
    add({ on: someDay(y, m), amount: pick([450, 650]), merchant: 'Bounce Salon', cat: 55, who: ROHAN })
    if (r() < 0.6) add({ on: someDay(y, m), amount: between(1200, 3500, 50), merchant: 'Toni&Guy', cat: 55, who: MEERA })
    if (r() < 0.4) add({ on: someDay(y, m), amount: between(350, 1800), merchant: 'Blossom Book House', cat: 78, who: pick([ROHAN, MEERA]) })
    if (r() < 0.3) add({ on: someDay(y, m), amount: between(1500, 6000, 100), merchant: pick(['Gift for Asha', 'Gift for Dev']), cat: 57, who: pick([ROHAN, MEERA]) })

    // Money that is not spending.
    add({ on: day(y, m, 7), amount: 25_000, merchant: 'Zerodha SIP', cat: 79, who: ROHAN, scope: 'investment' })
    add({ on: day(y, m, 10), amount: 20_000, merchant: 'Groww SIP', cat: 79, who: MEERA, scope: 'investment' })
    add({ on: day(y, m, 15), amount: 30_000, merchant: 'Meera', cat: null, who: ROHAN, scope: 'transfer' })
    let claims = 0
    const claimIds: string[] = []
    for (let i = 0; i < between(2, 5); i++) {
      const a = between(400, 6500, 10)
      claims += a
      const c = add({ on: someDay(y, m), amount: a, merchant: pick(['Client lunch', 'Uber (client visit)', 'WeWork day pass', 'Courier']), cat: pick([21, 28, 66]), who: ROHAN, scope: 'claimable' })
      if (c) claimIds.push(c)
    }
    // Work repays a month's claims on the 12th of the next month, and each
    // claim points at the payout that settled it, as the real app links them.
    const paidOn = day(y, m + 1, 12)
    const payout = add({ on: paidOn, amount: claims, merchant: 'Work claims repaid', cat: 68, who: ROHAN, dir: 'credit', scope: 'claimable' })
    if (payout) for (const c of tx.filter(t => claimIds.includes(t.id as string))) Object.assign(c, { claim_settled_on: iso(paidOn), settled_by: payout })
  }

  // One-offs.
  add({ on: new Date(2025, 0, 18), amount: 52_990, merchant: 'Croma', cat: 23, who: ROHAN })
  add({ on: new Date(2025, 5, 9), amount: 38_500, merchant: 'Urban Ladder', cat: 24, who: MEERA })
  add({ on: new Date(2025, 6, 28), amount: 1_499, merchant: 'ClearTax', cat: 85, who: ROHAN })
  add({ on: new Date(2026, 2, 12), amount: 21_400, merchant: 'Advance tax challan', cat: 84, who: ROHAN })
  add({ on: new Date(2026, 6, 25), amount: 1_799, merchant: 'ClearTax', cat: 85, who: MEERA })
  add({ on: new Date(2025, 10, 22), amount: 8_000, merchant: 'Wedding gift, Priya', cat: 57, who: MEERA })

  // Trips: flights before, the stay and the days while there.
  trips.forEach((t, i) => {
    const tag = i + 1
    if (t.flights) add({ on: new Date(t.from.getTime() - 30 * 864e5), amount: t.flights, merchant: 'IndiGo', cat: 48, who: ROHAN, tag })
    add({ on: new Date(t.from.getTime() - 20 * 864e5), amount: t.hotel, merchant: pick(['Airbnb', 'Booking.com']), cat: 49, who: MEERA, tag })
    for (let k = 0; k < t.days; k++) {
      const on = new Date(t.from.getTime() + k * 864e5)
      add({ on, amount: between(900, 4200, 10), merchant: pick(['Local cafe', 'Beach shack', 'Market stall', 'Ramen bar']), cat: 21, who: pick([ROHAN, MEERA]), tag })
      add({ on, amount: between(200, 1800, 10), merchant: pick(['Local taxi', 'Scooter rental', 'Metro card']), cat: 50, who: pick([ROHAN, MEERA]), tag })
    }
  })

  // A few new payees waiting in Review, as the real app shows them.
  const recent = (back: number) => new Date(today.getTime() - back * 864e5)
  for (const [back, amt, payee, who] of [[0, 340, 'SRI SAI ENTERPRISES', MEERA], [1, 1250, 'MANJUNATHA STORES', ROHAN], [1, 89, 'PAYU*MERCHANT 4471', ROHAN], [2, 2600, 'GREEN LEAF NURSERY', MEERA], [3, 760, 'K R BAKERY', MEERA]] as [number, number, string, string][])
    add({ on: recent(back), amount: amt, merchant: payee, cat: null, who, status: 'review' })

  const people = [{ id: ROHAN, name: 'Rohan', auth_uid: 'demo-user', key_hash: null }, { id: MEERA, name: 'Meera', auth_uid: null, key_hash: null }]
  const lastMonth = (() => { const d = new Date(today.getFullYear(), today.getMonth(), 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}` })()
  return {
    people,
    categories: CATEGORIES.map(([cid, name, parent_id]) => ({ id: cid, name, parent_id })),
    transactions: tx,
    tags,
    transaction_tags: links,
    budgets: [{ category_id: 2, monthly: 45_000 }, { category_id: 3, monthly: 14_000 }, { category_id: 8, monthly: 5_000 }, { category_id: 7, monthly: 6_000 }].map(b => ({ ...b, updated_at: iso(today) })),
    settings: [{ key: 'monthly_take_home', value: String(4_38_000 + 3_72_000) }],
    salary_tax_rates: [
      { id: 1, person_id: ROHAN, from_month: '2024-04', monthly_tax: monthlyTaxOn(68_00_000), annual_salary: 68_00_000, basis: 'Worked out: Rs 68L salary, new regime' },
      { id: 2, person_id: ROHAN, from_month: '2026-04', monthly_tax: monthlyTaxOn(73_00_000), annual_salary: 73_00_000, basis: 'Worked out: Rs 73L salary, new regime' },
      { id: 3, person_id: MEERA, from_month: '2024-04', monthly_tax: monthlyTaxOn(58_00_000), annual_salary: 58_00_000, basis: 'Worked out: Rs 58L salary, new regime' },
      { id: 4, person_id: MEERA, from_month: '2026-04', monthly_tax: monthlyTaxOn(62_00_000), annual_salary: 62_00_000, basis: 'Worked out: Rs 62L salary, new regime' },
    ],
    recurring: [
      { id: 1, label: 'Rent', amount: 58_000, day_of_month: 5, category_id: 16, paid_by: ROHAN, scope: 'household', active: true, last_amount: 58_000, note: null },
      { id: 2, label: 'Maid', amount: 7_000, day_of_month: 1, category_id: 52, paid_by: MEERA, scope: 'household', active: true, last_amount: 7_000, note: null },
    ],
    merchant_rules: [
      { id: 1, match_key: 'ZEPTO', merchant: 'Zepto', category_id: 19, default_scope: 'household', created_by: null, created_at: iso(start), ask: false, match_type: 'exact', min_amount: null, max_amount: null, paid_by: null, direction: null, rule_shape: 'exact||||' },
      { id: 2, match_key: 'SWIGGY', merchant: 'Swiggy', category_id: 20, default_scope: 'household', created_by: null, created_at: iso(start), ask: false, match_type: 'exact', min_amount: null, max_amount: null, paid_by: null, direction: null, rule_shape: 'exact||||' },
      { id: 3, match_key: 'UBER', merchant: 'Uber', category_id: 28, default_scope: 'household', created_by: null, created_at: iso(start), ask: false, match_type: 'contains', min_amount: null, max_amount: null, paid_by: null, direction: null, rule_shape: 'contains||||' },
    ],
    planned_splits: [],
    unparsed: [],
    category_hints: [],
    fx_rates: [],
    device_keys: [],
    intake_log: [],
    push_config: [],
    push_subscriptions: [],
    _meta: [{ key: 'last_month', value: lastMonth }],
  }
}
