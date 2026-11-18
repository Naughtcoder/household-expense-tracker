import Link from 'next/link'
import { Crumbs } from '../crumbs'
import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { PeriodNav } from '../periodnav'
import { inr, dayLabel, monthRange } from '../../lib/format'
import { catTree } from '../../lib/cats'
import { planMonth, lookbackFrom, type PlanCharge } from '../../lib/plans'
import { setPlanMonths } from './actions'

export const dynamic = 'force-dynamic'

const SUBSCRIPTIONS_ID = 36

/**
 * What subscriptions cost this month. A plan paid for a year counts one
 * twelfth in each month it covers, so a 3,799 renewal shows as 317 a month
 * for a year, not 3,799 in October and nothing after. Monthly plans count in
 * full; a weekly one adds up its charges in the month.
 */
export default async function Subscriptions({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams
  const month = monthRange(m)
  const supabase = await supabaseServer()

  const [{ data: cats }, { data: periodRows }, { count: reviewCount }] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id'),
    supabase.from('plan_periods').select('merchant, months'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])
  const periods = new Map((periodRows ?? []).map(r => [r.merchant as string, Number(r.months)]))
  const family = catTree(cats ?? []).family(SUBSCRIPTIONS_ID)

  const { data } = await supabase.from('transactions')
    .select('merchant, merchant_key, amount, occurred_on, direction')
    .in('category_id', family).gte('occurred_on', lookbackFrom(month.key, periods)).lte('occurred_on', month.to)
    .neq('status', 'duplicate').neq('status', 'ignored').not('scope', 'in', '(claimable,transfer)')
    .limit(5000)
  // A refund comes back as money in; it takes away from the plan it refunds.
  const charges: PlanCharge[] = ((data ?? []) as (PlanCharge & { direction: string })[])
    .map(r => ({ ...r, amount: (r.direction === 'credit' ? -1 : 1) * Math.abs(Number(r.amount)) }))
  const lines = planMonth(charges, periods, month.key)
  const total = lines.reduce((s, l) => s + l.share, 0)
  const spread = lines.filter(l => l.months > 1)
  const paidNow = lines.filter(l => l.count > 0).reduce((s, l) => s + (l.months > 1 ? l.paid : l.share), 0)

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 14 }}>
        <Crumbs fallback="/" trail={[{ label: 'Home', href: '/' }, { label: 'Subscriptions' }]} />
        <PeriodNav label={month.label}
          prevHref={`/subscriptions?m=${month.prev}`} nextHref={month.isCurrent ? null : `/subscriptions?m=${month.next}`}
          jump={{ template: '/subscriptions?m=__K__', mode: 'month', current: month.key, format: 'ym' }} />
        <section className="card hero">
          <div className="label">Subscriptions this month</div>
          <div className="big num" style={{ marginTop: 6 }}>{inr(total)}</div>
          <div className="sub">
            {lines.length} plan{lines.length === 1 ? '' : 's'}
            {spread.length > 0 && <>, {spread.length} paid yearly and spread across 12 months</>}
            {Math.round(paidNow) !== Math.round(total) && <>. Paid out this month: {inr(paidNow)}</>}
          </div>
        </section>

        <section className="card">
          <div className="rows">
            {lines.map(l => (
              <div className="row" key={l.name} style={{ alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="name">{l.name}</div>
                  <div className="who">
                    {l.months > 1
                      ? <>{inr(l.paid)} paid {dayLabel(l.paidOn)}, covers {l.months} months</>
                      : l.count > 1 ? <>{l.count} charges this month</> : <>paid {dayLabel(l.paidOn)}</>}
                  </div>
                  <form action={setPlanMonths} style={{ marginTop: 6 }}>
                    <input type="hidden" name="merchant" value={l.name} />
                    <input type="hidden" name="months" value={l.months > 1 ? 1 : 12} />
                    <button className="chip" type="submit">{l.months > 1 ? 'Paid monthly' : 'Paid yearly'}</button>
                  </form>
                </div>
                <div className="amt num">{inr(l.share)}<div className="who" style={{ textAlign: 'right' }}>{l.months > 1 ? 'a month' : 'this month'}</div></div>
              </div>
            ))}
            {lines.length === 0 && <div className="empty">No subscription payments cover {month.label}.</div>}
          </div>
          <p className="sub" style={{ marginTop: 12 }}>
            Everything filed under Subscriptions. Tap Paid yearly on a plan you pay for once a year, and its payment counts a twelfth in each of the next twelve months. <Link href="/repeat">Repeat charges</Link> lists every payee that bills you monthly, rent and staff included.
          </p>
        </section>
      </main>
    </>
  )
}
