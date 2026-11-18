import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseServer } from '../../../../lib/supabase/server'
import { Nav } from '../../../nav'
import { Crumbs } from '../../../crumbs'
import { inr, inrExact, dayLabel } from '../../../../lib/format'
import { monthLabel } from '../../../../lib/drill'
import { IconChevronRight } from '@tabler/icons-react'

export const dynamic = 'force-dynamic'

type Claim = { id: string; amount: number; occurred_on: string; merchant: string | null; merchant_key: string | null }

/**
 * One repayment, traced to the claims it paid back. A payout in September
 * often repays spending from July and August, so the claims are grouped by
 * the month they were spent, and the payout is checked against their sum.
 */
export default async function Repayment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await supabaseServer()
  const [{ data: pay }, { data: claims }, { count: reviewCount }] = await Promise.all([
    supabase.from('transactions').select('id, amount, occurred_on, merchant, raw_text').eq('id', id).maybeSingle(),
    supabase.from('transactions').select('id, amount, occurred_on, merchant, merchant_key')
      .eq('settled_by', id).neq('status', 'duplicate').order('occurred_on', { ascending: true }),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])
  if (!pay) notFound()

  const list = (claims ?? []) as Claim[]
  const covered = list.reduce((s, c) => s + Number(c.amount), 0)
  const gap = Number(pay.amount) - covered
  const byMonth = new Map<string, Claim[]>()
  for (const c of list) byMonth.set(c.occurred_on.slice(0, 7), [...(byMonth.get(c.occurred_on.slice(0, 7)) ?? []), c])
  const payMonth = pay.occurred_on.slice(0, 7)

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 16 }}>
        <Crumbs fallback={`/claimable?m=${payMonth}`} trail={[
          { label: monthLabel(payMonth), href: `/?m=${payMonth}` },
          { label: 'Claims', href: `/claimable?m=${payMonth}` },
          { label: pay.merchant ?? 'Repayment' },
        ]} />

        <section className="heroblock" style={{ paddingTop: 0 }}>
          <div className="sub">{pay.merchant ?? 'Repayment'}, {dayLabel(pay.occurred_on)}</div>
          <div className="big num credit"><span className="cur">+₹</span>{Math.round(Number(pay.amount)).toLocaleString('en-IN')}</div>
          <div className="sub">
            {list.length
              ? <>Pays back {list.length} claim{list.length === 1 ? '' : 's'} from {[...byMonth.keys()].map(k => monthLabel(k).split(' ')[0]).join(', ')}</>
              : 'Not yet matched to any claims'}
          </div>
        </section>

        <div className="stats">
          <div className="stat"><div className="k">Claims covered</div><div className="v">{inr(covered)}</div></div>
          <div className="stat">
            <div className="k">{Math.abs(gap) < 1 ? 'Difference' : gap > 0 ? 'Paid but not matched' : 'Claimed but not paid'}</div>
            <div className="v" style={{ color: Math.abs(gap) < 1 ? 'var(--positive)' : 'var(--hue-6)' }}>{Math.abs(gap) < 1 ? 'Exact' : inrExact(Math.abs(gap))}</div>
          </div>
        </div>

        {[...byMonth.entries()].map(([k, rows]) => (
          <section className="card" key={k}>
            <div className="dayhead" style={{ position: 'static', background: 'transparent', backdropFilter: 'none' }}>
              <span>Spent in {monthLabel(k)}</span><span className="num">{inr(rows.reduce((s, r) => s + Number(r.amount), 0))}</span>
            </div>
            <div className="rows">
              {rows.map(r => (
                <Link className="irow" key={r.id} href={`/t/${r.id}?m=${k}&from=claims`}>
                  <div className="mid">
                    <div className="name">{r.merchant ?? r.merchant_key ?? 'Unknown'}</div>
                    <div className="who">{dayLabel(r.occurred_on)}</div>
                  </div>
                  <div className="amt num">{inr(Number(r.amount))}</div>
                  <IconChevronRight size={18} className="chev" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  )
}
