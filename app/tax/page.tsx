import Link from 'next/link'
import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { Crumbs } from '../crumbs'
import { WhoToggle } from '../whotoggle'
import { CatIcon } from '../caticon'
import { PeriodNav } from '../periodnav'
import { inr, dayLabel, pct } from '../../lib/format'
import { PEOPLE, pretty } from '../../lib/drill'
import { countsAsSpend } from '../../lib/scope'
import { catTree } from '../../lib/cats'
import { hueFor } from '../../lib/caticons'
import { SALARY_CATEGORY, SALARY_KIND, SALARY_KIND_NAME, TAX_GROUP, fyOf, fyLabel, fyMonths, loadSalaryTax, summarise, type TaxRow } from '../../lib/tax'
import { SalaryEditor } from './salaries'

export const dynamic = 'force-dynamic'

type Row = TaxRow & { direction: 'debit' | 'credit'; scope: string; merchant: string | null }

/**
 * Tax paid, by financial year (April to March): the total, month by month,
 * by kind, every year split by who paid, and the payments themselves. The
 * same numbers as the phone's Tax paid screen, from lib/tax.ts.
 */
export default async function Tax({ searchParams }: { searchParams: Promise<{ fy?: string; who?: string }> }) {
  const sp = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const thisFy = fyOf(today)
  const fy = /^\d{4}$/.test(sp.fy ?? '') ? Math.min(Number(sp.fy), thisFy) : thisFy
  const who = sp.who && PEOPLE[sp.who] ? sp.who : null
  const supabase = await supabaseServer()

  const [{ data: cats }, { count: reviewCount }] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])
  const tree = catTree(cats ?? [])
  const root = tree.roots().find(c => c.name === TAX_GROUP)
  const family = root ? tree.family(root.id) : []
  const cols = 'id, amount, direction, occurred_on, paid_by, category_id, scope, merchant'
  const [{ data: taxRows }, { data: rentRows }] = await Promise.all([
    supabase.from('transactions').select(cols).in('category_id', family.length ? family : [-1]).neq('status', 'duplicate').neq('status', 'ignored'),
    supabase.from('transactions').select(cols).ilike('merchant', 'TDS on%').neq('status', 'duplicate').neq('status', 'ignored'),
  ])
  const fam = new Set(family)
  const salaryCat = (cats ?? []).find(c => c.name === SALARY_CATEGORY)
  const salary = await loadSalaryTax(supabase, salaryCat ? tree.family(salaryCat.id) : [])
  const paid = ((taxRows ?? []) as Row[]).filter(r => countsAsSpend(r))
  const rows: TaxRow[] = [...paid, ...salary.rows]
  const fromSalary = salary.rows.filter(r => fyOf(r.occurred_on) === fy && (!who || r.paid_by === who)).reduce((a, r) => a + Number(r.amount), 0)
  const s = summarise(rows, fy, who)
  const payments = paid.filter(r => fyOf(r.occurred_on) === fy && (!who || r.paid_by === who)).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
  const rentTds = ((rentRows ?? []) as Row[]).filter(r => !fam.has(r.category_id ?? -1) && countsAsSpend(r) && fyOf(r.occurred_on) === fy && (!who || r.paid_by === who))
  const rentTdsTotal = rentTds.reduce((a, r) => a + Number(r.amount), 0)
  const people = Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1]))
  const months = fyMonths(fy)
  const peak = Math.max(1, ...months.map(k => s.byMonth[k] ?? 0))
  const href = (y: number, w: string | null = who) => `/tax?fy=${y}${w ? `&who=${w}` : ''}`

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 16 }}>
        <Crumbs fallback="/insights" trail={[{ label: 'Insights', href: '/insights' }, { label: 'Tax paid' }]} />
        <WhoToggle path="/tax" params={{ fy: String(fy) }} who={who} />
        <PeriodNav label={fyLabel(fy)} prevHref={href(fy - 1)} nextHref={fy >= thisFy ? null : href(fy + 1)} />

        <section className="heroblock" style={{ paddingTop: 0 }}>
          <div className="big num"><span className="cur">₹</span>{Math.round(s.total).toLocaleString('en-IN')}</div>
          <div className="sub"><a href="#salaries" style={{ color: 'inherit' }}>{inr(fromSalary)} taken from salaries</a> · <a href="#payments" style={{ color: 'inherit' }}>{inr(s.total - fromSalary)} paid from your accounts ›</a></div>
        </section>

        <section className="card">
          <div className="bars wide" style={{ height: 120, marginTop: 0 }}>
            {months.map(k => (
              <a key={k} href="#payments" title={`${k}: ${inr(s.byMonth[k] ?? 0)}`}>
                <span className="col"><i style={{ height: `${((s.byMonth[k] ?? 0) / peak) * 100}%`, background: hueFor(TAX_GROUP), opacity: `${k}-01` > today ? 0.3 : 1 }} /></span>
                <b className="cap">{'JFMAMJJASOND'[Number(k.slice(5, 7)) - 1]}</b>
              </a>
            ))}
          </div>
        </section>

        {Object.keys(s.byKind).length > 0 && (
          <section>
            <div className="section-h"><h2>By kind</h2></div>
            <div className="card" style={{ paddingBlock: 4 }}>
              {Object.entries(s.byKind).sort((a, b) => b[1] - a[1]).map(([id, v]) => {
                const name = Number(id) === SALARY_KIND ? SALARY_KIND_NAME : tree.get(Number(id))?.name ?? TAX_GROUP
                return (
                  <a className="irow" key={id} href={Number(id) === SALARY_KIND ? '#salaries' : '#payments'}>
                    <CatIcon name={name} group={TAX_GROUP} />
                    <div className="mid"><div className="t">{name}</div></div>
                    <div className="a">{inr(v)}<small>{pct(v, s.total)}</small></div>
                  </a>
                )
              })}
            </div>
          </section>
        )}

        <section className="card">
          <h2>Year by year, by who paid</h2>
          <div className="ctable">
            <div className="ctr head"><span>Year</span>{people.map(([, n]) => <span key={n}>{n}</span>)}<span>Household</span></div>
            {s.yearList.map(({ fy: y, split }) => (
              <div className="ctr" key={y} style={{ fontWeight: y === fy ? 700 : 400 }}>
                <Link href={href(y, null)} style={{ color: 'inherit' }}>{fyLabel(y).slice(3)}</Link>
                {people.map(([pid]) => <Link key={pid} className="num" href={href(y, pid)} style={{ textAlign: 'right', color: 'inherit' }}>{inr(split[pid] ?? 0)}</Link>)}
                <Link className="num" href={href(y, null)} style={{ textAlign: 'right', color: 'inherit' }}>{inr(split.all)}</Link>
              </div>
            ))}
          </div>
        </section>

        <section className="card" id="salaries">
          <h2>Salaries</h2>
          <SalaryEditor rates={salary.rates.map(r => ({ ...r, monthly_tax: Number(r.monthly_tax), annual_salary: r.annual_salary == null ? null : Number(r.annual_salary) }))} />
        </section>

        {rentTdsTotal > 0 && (
          <section className="card">
            <h2>Also sent to the tax office: {inr(rentTdsTotal)}</h2>
            <p className="sub" style={{ marginTop: 4 }}>TDS on the rent. It is the landlord's tax, paid out of the rent, so it counts in Rent, not above.</p>
            {rentTds.map(r => <Link className="irow" key={r.id} href={`/t/${r.id}`}><div className="mid"><div className="t">{pretty(r.merchant ?? 'TDS')}</div></div><div className="a">{inr(Number(r.amount))}</div></Link>)}
          </section>
        )}

        {payments.length > 0 && (
          <section id="payments">
            <div className="section-h"><h2>Payments</h2></div>
            <div className="card" style={{ paddingBlock: 4 }}>
              {payments.map(r => (
                <Link className="irow" key={r.id} href={`/t/${r.id}`}>
                  <CatIcon name={tree.get(r.category_id ?? -1)?.name} group={TAX_GROUP} />
                  <div className="mid"><div className="t">{pretty(r.merchant ?? 'Tax')}</div><div className="s">{dayLabel(r.occurred_on)} · {PEOPLE[r.paid_by] ?? ''}</div></div>
                  <div className="a">{inr(Number(r.amount))}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <p className="sub">Tax taken from salaries is counted for each month a salary arrived, at the rate under Salaries: the payslip's figure where there is one, otherwise worked out from the yearly salary under the new regime. Tax paid from your accounts is advance tax, self-assessment and filing fees.</p>
      </main>
    </>
  )
}
