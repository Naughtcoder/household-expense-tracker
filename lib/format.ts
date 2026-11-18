/** Indian grouping, no decimals. 164009.85 becomes 1,64,010. */
export const inr = (n: number) =>
  (Math.round(n) < 0 ? '−₹' : '₹') + Math.abs(Math.round(n)).toLocaleString('en-IN')

/**
 * Short enough to sit above a bar. Lakh and crore, because that is how the
 * amounts are read here: 1191654 becomes 11.9L, not 1.2M.
 *
 * A chart with seven bars gives each label about forty pixels. The full
 * grouping needs three times that, and a flex item will not shrink below its
 * text, so the chart pushed the card wide and dragged everything beside it
 * off the screen.
 */
export function inrShort(n: number) {
  const a = Math.abs(n)
  // One decimal, dropped when it is a zero. 99.9L is still only six
  // characters, so there is no width to save by rounding 11.9L up to 12L.
  if (a >= 1e7) return '₹' + (n / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr'
  if (a >= 1e5) return '₹' + (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L'
  if (a >= 1e3) return '₹' + (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k'
  return '₹' + Math.round(n)
}

/**
 * What to show as the title of a transaction row.
 *
 * Money Manager rows carry the category as their description, so a list reads
 * GROCERIES above "Groceries, Alex" and INDULGENCE above "Indulgence,
 * Alex". Shouted, and said twice.
 *
 * Matching the name against its own category is exact, so no guessing about
 * which capitals are a word and which are initials. ASSPL and BankA are never
 * touched, because no category is called that.
 */
export function rowTitle(merchant: string | null, category: string | null) {
  const name = merchant?.trim()
  if (!name) return category ?? 'Unknown'
  if (category && name.toUpperCase() === category.toUpperCase()) return category
  return name
}

/** True when the category would only repeat the title, so the row can drop it. */
export const categoryIsRedundant = (merchant: string | null, category: string | null) =>
  Boolean(category && merchant && merchant.trim().toUpperCase() === category.toUpperCase())

export const inrExact = (n: number) =>
  (n < 0 ? '−₹' : '₹') + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const monthLabel = (d = new Date()) =>
  d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

/**
 * "3 Oct" this year, "3 Oct 2024" any other year. Without the year, three
 * October payments from three different years read as one month.
 */
export const dayLabel = (iso: string, today = new Date()) => {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', d.getFullYear() === today.getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' })
}

const iso = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`

/** 'YYYY-MM' for a date, which is how a month is addressed in a URL. */
export const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Accepts 'YYYY-MM'. Anything unparseable falls back to the current month. */
export function monthRange(key?: string) {
  const now = new Date()
  const m = key?.match(/^(\d{4})-(\d{2})$/)
  const year = m ? Number(m[1]) : now.getFullYear()
  const month = m ? Number(m[2]) - 1 : now.getMonth()
  const from = new Date(year, month, 1)
  const to = new Date(year, month + 1, 0)
  return {
    from: iso(from), to: iso(to),
    key: monthKey(from),
    label: from.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    prev: monthKey(new Date(year, month - 1, 1)),
    next: monthKey(new Date(year, month + 1, 1)),
    isCurrent: monthKey(from) === monthKey(now),
  }
}

// Category colours live in the theme, not here, so they change with it. This
// used to be seven violet hexes, which is why they were the one thing on the
// Month screen still wearing the old palette after the repaint.
const RAMP_SIZE = 7
export const colourFor = (i: number) => `var(--cat-${(i % RAMP_SIZE) + 1})`

/** "2:03 pm" in India time, or '' when the time is not known. */
export const timeLabel = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).toLowerCase() : ''

/** A part's share of the whole, for breakdown lists ("21%", "<1%").
 *  Ruled by Alex, 4 Oct 2026: show the mix everywhere it applies. */
export const pct = (v: number, of: number) => {
  if (!of) return ''
  const p = (v / of) * 100
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`
}
