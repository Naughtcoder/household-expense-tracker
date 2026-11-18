'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setSalary } from './actions'
import { PEOPLE } from '../../lib/drill'
import { inr } from '../../lib/format'
import { monthlyTaxOn, rateFor, type SalaryRate } from '../../lib/tax'

const thisMonth = new Date().toISOString().slice(0, 7)
const lakh = (n: number) => `Rs ${(n / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })}L`

/** Each person's salary and the tax taken from it, with a form to change it from any month on. */
export function SalaryEditor({ rates }: { rates: SalaryRate[] }) {
  const people = Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1]))
  const [open, setOpen] = useState<string | null>(null)
  const [salary, setSal] = useState('')
  const [from, setFrom] = useState(thisMonth)
  const [payslip, setPayslip] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const annual = Number(salary.replace(/[^\d.]/g, ''))
  const begin = (pid: string) => {
    const r = rateFor(rates, pid, thisMonth)
    setOpen(open === pid ? null : pid); setSal(r?.annual_salary ? String(Number(r.annual_salary)) : ''); setFrom(thisMonth); setPayslip(''); setMsg(null)
  }
  const save = () => start(async () => {
    if (!open) return
    const r = await setSalary({ personId: open, fromMonth: from, annualSalary: annual, monthlyTax: payslip.trim() === '' ? null : Number(payslip.replace(/[^\d.]/g, '')) })
    if (r.error) { setMsg(r.error); return }
    setOpen(null); router.refresh()
  })
  return (
    <div style={{ marginTop: 8 }}>
      {people.map(([pid, name]) => {
        const r = rateFor(rates, pid, thisMonth)
        return (
          <div key={pid} className="row" style={{ display: 'block' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="name" style={{ fontWeight: 600 }}>{name}{r?.annual_salary ? ` · ${lakh(Number(r.annual_salary))} a year` : ''}</div>
                <div className="sub" style={{ fontSize: 12 }}>{r ? `${inr(Number(r.monthly_tax))} tax a month · ${r.basis} · from ${r.from_month}` : 'No salary set'}</div>
              </div>
              <button className="chip" onClick={() => begin(pid)}>{open === pid ? 'Close' : 'Update'}</button>
            </div>
            {open === pid && (
              <div className="grid" style={{ gap: 8, marginTop: 10 }}>
                <label className="sub">Yearly salary before tax, in rupees
                  <input className="input" inputMode="numeric" value={salary} onChange={e => setSal(e.target.value)} placeholder="8100000" /></label>
                <label className="sub">From which month
                  <input className="input" type="month" value={from} onChange={e => setFrom(e.target.value)} /></label>
                <label className="sub">Tax on the payslip a month, if you have it (leave empty to work it out)
                  <input className="input" inputMode="numeric" value={payslip} onChange={e => setPayslip(e.target.value)} placeholder={annual > 0 ? String(monthlyTaxOn(annual)) : ''} /></label>
                {annual > 0 && payslip.trim() === '' && <p className="sub">Worked out: {inr(monthlyTaxOn(annual))} a month under the new regime.</p>}
                <button className="btn" disabled={pending} onClick={save}>{pending ? 'Saving' : 'Save'}</button>
                {msg && <p className="sub" style={{ color: 'var(--warn)' }}>{msg}</p>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
