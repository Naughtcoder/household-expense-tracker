import Link from 'next/link'
import { Crumbs } from '../crumbs'
import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { inr, dayLabel } from '../../lib/format'
import { findSubscriptions, type Charge } from '../../lib/insights'
import { allRows } from '../../lib/pages'

export const dynamic = 'force-dynamic'

/**
 * Anything that charges about once a month for about the same amount, found
 * from the payments themselves rather than a list someone has to keep. The
 * yearly figure is the point: 649 a month reads as nothing, 7,788 a year
 * reads as a decision.
 */
export default async function Subscriptions() {
  const supabase = await supabaseServer()
  const now = new Date()
  const since = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10)

  const [raw, { count: reviewCount }] = await Promise.all([
    allRows<Charge & { cat: { name: string } | null }>((a, b) => (supabase.from('transactions')
      .select('merchant_key, merchant, amount, occurred_on, cat:categories(name)')
      .gte('occurred_on', since).eq('direction', 'debit')
      .not('scope', 'in', '(claimable,investment,transfer)')
      .neq('status', 'duplicate').neq('status', 'ignored')
      .order('occurred_on').range(a, b)) as unknown as PromiseLike<{ data: (Charge & { cat: { name: string } | null })[] | null; error: { message: string } | null }>),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])
  const charges = raw.map(r => ({ ...r, category: r.cat?.name ?? null }))
  const subs = findSubscriptions(charges, now)
  const monthly = subs.reduce((s, x) => s + x.monthly, 0)
  const rose = subs.filter(s => s.rose)

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 14 }}>
        <Crumbs fallback="/" trail={[{ label: 'Home', href: '/' }, { label: 'Repeat charges' }]} />
        <section className="card hero">
          <div className="label">Repeat charges</div>
          <div className="big num" style={{ marginTop: 6 }}>{inr(monthly * 12)}</div>
          <div className="sub">
            a year, {inr(monthly)} a month across {subs.length} payee{subs.length === 1 ? '' : 's'}
            {rose.length > 0 && <>, {rose.length} went up last time</>}
          </div>
        </section>

        <section className="card">
          <div className="rows">
            {subs.map(s => (
              <Link className="row rowlink" key={s.key} href={`/m/${encodeURIComponent(s.key)}`}>
                <div>
                  <div className="name">{s.name}</div>
                  <div className="who">
                    {inr(s.monthly)} a month · charged in {s.months} of the last 6 months · last {dayLabel(s.last)}
                    {s.rose && s.previousAmount !== null && (
                      <span style={{ color: 'var(--caution)' }}> · up from {inr(s.previousAmount)} to {inr(s.lastAmount)}</span>
                    )}
                  </div>
                </div>
                <div className="amt num">{inr(s.yearly)}<div className="who" style={{ textAlign: 'right' }}>a year</div></div>
              </Link>
            ))}
            {subs.length === 0 && <div className="empty">Nothing charges you every month yet.</div>}
          </div>
          <p className="sub" style={{ marginTop: 12 }}>
            Found from the payments: a payee that charged in at least 3 of the last 6 months, about once a month, for about the same amount. Rent and staff count too, because they repeat the same way.
          </p>
        </section>
      </main>
    </>
  )
}
