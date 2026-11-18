import Link from 'next/link'
import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { inr, dayLabel } from '../../lib/format'

export const dynamic = 'force-dynamic'

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const term = (q ?? '').trim()
  const supabase = await supabaseServer()

  const { count: reviewCount } = await supabase
    .from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review')

  let rows: { id: string; amount: number; direction: string; occurred_on: string
              merchant: string | null; merchant_key: string | null; bank: string | null }[] = []

  if (term) {
    const like = `%${term.replace(/[%_]/g, m => '\\' + m)}%`
    // Merchant, the bank's own wording, and the amount. A number you half
    // remember is often the only thing you have.
    const filters = [
      `merchant.ilike.${like}`,
      `merchant_key.ilike.${like}`,
      `merchant_raw.ilike.${like}`,
      `raw_text.ilike.${like}`,
    ]
    const asNumber = Number(term.replace(/[,₹\s]/g, ''))
    if (Number.isFinite(asNumber) && asNumber > 0) filters.push(`amount.eq.${asNumber}`)

    const { data } = await supabase.from('transactions')
      .select('id, amount, direction, occurred_on, merchant, merchant_key, bank')
      .or(filters.join(','))
      .neq('status', 'duplicate').neq('status', 'ignored')
      .order('occurred_on', { ascending: false }).limit(120)
    rows = data ?? []
  }

  const total = rows.filter(r => r.direction === 'debit').reduce((s, r) => s + Number(r.amount), 0)

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 14 }}>
        <div>
          <h1>Search</h1>
          <p className="sub" style={{ marginTop: 4 }}>
            Merchant, what the bank wrote, or an amount.
          </p>
        </div>

        <form className="card" style={{ display: 'flex', gap: 10 }}>
          <input name="q" className="input" defaultValue={term} autoFocus
            placeholder="zepto, or 2340" />
          <button className="btn">Find</button>
        </form>

        {term && (
          <section className="card">
            <div className="label">
              {rows.length} result{rows.length === 1 ? '' : 's'}
              {total > 0 && `, ${inr(total)} of spending`}
            </div>
            <div className="rows" style={{ marginTop: 8 }}>
              {rows.map(r => (
                <Link className="row rowlink" key={r.id} href={`/t/${r.id}`}>
                  <div>
                    <div className="name">{r.merchant ?? r.merchant_key ?? 'Unknown'}</div>
                    <div className="who">{dayLabel(r.occurred_on)}{r.bank ? ` · ${r.bank}` : ''}</div>
                  </div>
                  <div className={`amt num${r.direction === 'credit' ? ' credit' : ''}`}>
                    {r.direction === 'credit' ? '+' : ''}{inr(Number(r.amount))}
                  </div>
                </Link>
              ))}
              {rows.length === 0 && <div className="empty">Nothing matches that.</div>}
            </div>
          </section>
        )}
      </main>
    </>
  )
}
