'use server'
import { revalidatePath } from 'next/cache'
import { supabaseServer } from '../../lib/supabase/server'
import { PEOPLE } from '../../lib/drill'
import { monthlyTaxOn } from '../../lib/tax'

/**
 * A new salary for one person from a month on. The monthly tax is worked out
 * from the yearly salary by the new-regime maths, unless the payslip's own
 * figure is given, which wins because it knows the tax-free allowances.
 */
export async function setSalary(a: { personId: string; fromMonth: string; annualSalary: number; monthlyTax?: number | null }): Promise<{ ok?: boolean; error?: string; monthlyTax?: number }> {
  if (!PEOPLE[a.personId]) return { error: 'Whose salary?' }
  if (!/^\d{4}-\d{2}$/.test(a.fromMonth)) return { error: 'Which month does it start?' }
  const annual = Number(a.annualSalary)
  if (!(annual > 0)) return { error: 'Give the yearly salary before tax.' }
  const fromPayslip = a.monthlyTax != null && Number(a.monthlyTax) >= 0 && String(a.monthlyTax) !== ''
  const monthly = fromPayslip ? Math.round(Number(a.monthlyTax)) : monthlyTaxOn(annual)
  const lakh = (annual / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })
  const basis = fromPayslip ? `Payslip TDS, Rs ${lakh}L salary` : `Worked out: Rs ${lakh}L salary, new regime`
  const supabase = await supabaseServer()
  const { data, error } = await supabase.from('salary_tax_rates')
    .upsert({ person_id: a.personId, from_month: a.fromMonth, monthly_tax: monthly, annual_salary: annual, basis }, { onConflict: 'person_id,from_month' })
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Nothing was saved. An access rule is blocking it.' }
  revalidatePath('/tax'); revalidatePath('/insights')
  return { ok: true, monthlyTax: monthly }
}
