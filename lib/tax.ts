/**
 * Tax paid, by Indian financial year (April to March), the year every tax
 * figure is filed in. Shared by the website and the phone app so both show
 * the same numbers.
 *
 * What counts: everything filed under the Tax group (challans, filing fees).
 * Tax taken out of a salary before it reaches the bank never shows up in a
 * bank message, so it cannot be here. TDS paid on the rent is the landlord's
 * tax and stays in Rent; the page shows it apart.
 */

export const TAX_GROUP = 'Tax'

export type TaxRow = { id: string; amount: number | string; occurred_on: string; paid_by: string; category_id: number | null }

/** The financial year a date falls in, by its starting year: 2026-05-01 is 2026, 2026-02-01 is 2025. */
export const fyOf = (iso: string) => {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7))
  return m >= 4 ? y : y - 1
}
/** "FY 2026-27" */
export const fyLabel = (fy: number) => `FY ${fy}-${String((fy + 1) % 100).padStart(2, '0')}`
export const fyRange = (fy: number) => ({ from: `${fy}-04-01`, to: `${fy + 1}-03-31` })
/** The twelve month keys of a financial year, April first. */
export const fyMonths = (fy: number) =>
  Array.from({ length: 12 }, (_, i) => { const m = (i + 3) % 12 + 1; return `${m >= 4 ? fy : fy + 1}-${String(m).padStart(2, '0')}` })

export function summarise(rows: TaxRow[], fy: number, who: string | null) {
  const mine = rows.filter(r => !who || r.paid_by === who)
  const inYear = mine.filter(r => fyOf(r.occurred_on) === fy)
  const total = inYear.reduce((s, r) => s + Number(r.amount), 0)
  const byMonth: Record<string, number> = {}
  const byKind: Record<string, number> = {}
  for (const r of inYear) {
    const k = r.occurred_on.slice(0, 7)
    byMonth[k] = (byMonth[k] ?? 0) + Number(r.amount)
    const c = String(r.category_id ?? 'none')
    byKind[c] = (byKind[c] ?? 0) + Number(r.amount)
  }
  // Every year with any tax, newest first, split by who paid. Always both
  // people, whatever the page is set to, so the split is visible.
  const years: Record<number, Record<string, number>> = {}
  for (const r of rows) {
    const y = fyOf(r.occurred_on)
    const e = years[y] ?? (years[y] = { all: 0 })
    e[r.paid_by] = (e[r.paid_by] ?? 0) + Number(r.amount)
    e.all += Number(r.amount)
  }
  const yearList = Object.keys(years).map(Number).sort((a, b) => b - a).map(y => ({ fy: y, split: years[y] }))
  return { total, count: inYear.length, byMonth, byKind, yearList }
}

// ---------- Tax taken from salaries ----------

/** The pseudo category the salary tax files under in the tax view. */
export const SALARY_KIND = -2
export const SALARY_KIND_NAME = 'Taken from salary'
/** Income > Salary: a credit here marks a month that person was paid. */
export const SALARY_CATEGORY = 'Salary'

export type SalaryRate = { person_id: string; from_month: string; monthly_tax: number | string; basis: string; annual_salary: number | string | null }

/**
 * Income tax on a yearly salary under the new regime (FY 2025-26 onward):
 * Rs 75,000 standard deduction, slabs of Rs 4L, the section 87A rebate up to
 * Rs 12L taxable, surcharge (10% over Rs 50L, 15% over Rs 1cr, 25% over
 * Rs 2cr, the new regime's cap), then 4% cess. Marginal relief is left out;
 * it only matters within a few thousand rupees of a threshold.
 * Allowances made tax-free by bills (driver, fuel, gadget...) are not known
 * here, so a payslip's own figure is better whenever there is one.
 */
export function newRegimeTax(annualSalary: number) {
  const taxable = Math.max(0, annualSalary - 75000)
  if (taxable <= 1200000) return 0
  let tax = 0
  const slabs: [number, number, number][] = [[400000, 800000, 0.05], [800000, 1200000, 0.10], [1200000, 1600000, 0.15], [1600000, 2000000, 0.20], [2000000, 2400000, 0.25], [2400000, Infinity, 0.30]]
  for (const [lo, hi, r] of slabs) if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * r
  const surcharge = taxable > 20000000 ? 0.25 : taxable > 10000000 ? 0.15 : taxable > 5000000 ? 0.10 : 0
  return Math.round(tax * (1 + surcharge) * 1.04)
}
export const monthlyTaxOn = (annualSalary: number) => Math.round(newRegimeTax(annualSalary) / 12)

/** The rate in force for a person in a month: the latest one starting on or before it. */
export function rateFor(rates: SalaryRate[], person: string, month: string) {
  return rates.filter(r => r.person_id === person && r.from_month <= month).sort((a, b) => b.from_month.localeCompare(a.from_month))[0] ?? null
}

/**
 * One row of tax per person per month their salary arrived, at the rate in
 * force then. Shaped like a payment so the tax view sums it with the rest.
 */
export function salaryTaxRows(rates: SalaryRate[], salaryCredits: { paid_by: string; occurred_on: string }[]): TaxRow[] {
  const seen = new Set<string>()
  const out: TaxRow[] = []
  for (const c of salaryCredits) {
    const month = c.occurred_on.slice(0, 7)
    const key = `${c.paid_by}|${month}`
    if (seen.has(key)) continue
    seen.add(key)
    const r = rateFor(rates, c.paid_by, month)
    if (!r || Number(r.monthly_tax) <= 0) continue
    out.push({ id: `salary:${key}`, amount: Number(r.monthly_tax), occurred_on: `${month}-01`, paid_by: c.paid_by, category_id: SALARY_KIND })
  }
  return out
}

/**
 * The salary tax rows and the rates behind them, read with whichever Supabase
 * client the caller has (the website's or the phone's). Salary credits are
 * read from the first rate's month on, a few a month.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadSalaryTax(supabase: any, salaryCategoryIds: number[]) {
  const { data: rates, error } = await supabase.from('salary_tax_rates').select('person_id, from_month, monthly_tax, basis, annual_salary').order('from_month')
  if (error) throw error
  const list = (rates ?? []) as SalaryRate[]
  if (!list.length || !salaryCategoryIds.length) return { rates: list, rows: [] as TaxRow[] }
  const { data: credits, error: e2 } = await supabase.from('transactions').select('paid_by, occurred_on')
    .eq('direction', 'credit').in('category_id', salaryCategoryIds).gte('occurred_on', `${list[0].from_month}-01`)
    .neq('status', 'duplicate').neq('status', 'ignored')
  if (e2) throw e2
  return { rates: list, rows: salaryTaxRows(list, (credits ?? []) as { paid_by: string; occurred_on: string }[]) }
}
