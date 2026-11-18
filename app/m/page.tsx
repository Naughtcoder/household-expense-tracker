import Link from 'next/link'
import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { inr, dayLabel } from '../../lib/format'
import { countsAsSpend } from '../../lib/scope'

export const dynamic = 'force-dynamic'

type Row = {
  merchant_key: string | null; merchant: string | null
  amount: number; direction: 'debit' | 'credit'; occurred_on: string; scope: string
}

export default async function Merchants() {
  const supabase = await supabaseServer()
  const [{ data }, { count: reviewCount }] = await Promise.all([
    supabase.from('transactions')
      .select('merchant_key, merchant, amount, direction, occurred_on, scope')
      .neq('status', 'duplicate').neq('status', 'ignored')
      .not('merchant_key', 'is', null)
      .order('occurred_on', { ascending: false }).limit(4000),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])
  const rows = (data ?? []) as Row[]

  type M = { key: string; name: string; total: number; count: number; last: string }
  const byMerchant = new Map<string, M>()
  for (const r of rows) {
    if (!countsAsSpend(r)) continue
    const k = r.merchant_key!
    const m = byMerchant.get(k) ?? { key: k, name: r.merchant ?? k, total: 0, count: 0, last: r.occurred_on }
    m.total += Number(r.amount); m.count += 1
    if (r.occurred_on > m.last) m.last = r.occurred_on
    byMerchant.set(k, m)
  }
  const list = [...byMerchant.values()].sort((a, b) => b.total - a.total)
  const biggest = list[0]?.total || 1

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 14 }}>
        <div>
          <h1>Merchants</h1>
          <p className="sub" style={{ marginTop: 4 }}>
            Where the money actually goes. Claimable spend is left out, since it comes back.
          </p>
        </div>
        <section className="card">
          <div className="rows">
            {list.map(m => (
              <Link className="row rowlink" key={m.key} href={`/m/${encodeURIComponent(m.key)}`}>
                <div>
                  <div className="name">{m.name}</div>
                  <div className="who">{m.count} time{m.count === 1 ? '' : 's'} · last {dayLabel(m.last)}</div>
                  <div className="meter"><i style={{ width: `${(m.total / biggest) * 100}%` }} /></div>
                </div>
                <div className="amt num">{inr(m.total)}</div>
              </Link>
            ))}
            {list.length === 0 && <div className="empty">Nothing yet.</div>}
          </div>
        </section>
      </main>
    </>
  )
}
