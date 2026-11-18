import Link from 'next/link'
import { supabaseServer } from '../../../lib/supabase/server'
import { catTree } from '../../../lib/cats'
import { Nav } from '../../nav'
import { inr, monthRange, dayLabel, colourFor } from '../../../lib/format'
import { countsAsSpend } from '../../../lib/scope'

export const dynamic = 'force-dynamic'

type Row = {
  id: string; amount: number; direction: 'debit' | 'credit'; occurred_on: string
  merchant: string | null; merchant_key: string | null; scope: string; status: string
  category_id: number | null
}

export default async function Summary({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params
  const m = monthRange(month)
  const prev = monthRange(m.prev)
  const supabase = await supabaseServer()

  const [{ data: cur }, { data: before }, { data: cats }, { data: settings }, { count: reviewCount }] = await Promise.all([
    supabase.from('transactions')
      .select('id, amount, direction, occurred_on, merchant, merchant_key, scope, status, category_id')
      .gte('occurred_on', m.from).lte('occurred_on', m.to).neq('status', 'duplicate').neq('status', 'ignored'),
    supabase.from('transactions')
      .select('amount, direction, scope, category_id')
      .gte('occurred_on', prev.from).lte('occurred_on', prev.to).neq('status', 'duplicate').neq('status', 'ignored'),
    supabase.from('categories').select('id, name, parent_id'),
    supabase.from('settings').select('key, value'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])

  const rows = (cur ?? []) as Row[]
  const all = cats ?? []
  const takeHome = Number(settings?.find(s => s.key === 'monthly_take_home')?.value ?? 0)

  const tree = catTree(all)
  const topOf = (id: number | null) => tree.root(id)?.name ?? 'Uncategorised'

  const spend = rows.filter(r => countsAsSpend(r))
  const total = spend.reduce((s, r) => s + Number(r.amount), 0)
  const claimable = rows.filter(r => r.scope === 'claimable').reduce((s, r) => s + Number(r.amount), 0)
  const credits = rows.filter(r => r.direction === 'credit').reduce((s, r) => s + Number(r.amount), 0)
  const stillWaiting = rows.filter(r => r.status === 'review').length

  const lastSpend = (before ?? []).filter(r => countsAsSpend(r))
  const lastTotal = lastSpend.reduce((s, r) => s + Number(r.amount), 0)
  const diff = total - lastTotal

  const bucket = (list: { category_id: number | null; amount: number }[]) => {
    const map = new Map<string, number>()
    for (const r of list) map.set(topOf(r.category_id), (map.get(topOf(r.category_id)) ?? 0) + Number(r.amount))
    return map
  }
  const nowBy = bucket(spend), thenBy = bucket(lastSpend)
  const categories = [...nowBy.entries()].sort((a, b) => b[1] - a[1])

  const biggest = [...spend].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5)
  const saved = takeHome ? takeHome - total : 0
  const rate = takeHome ? (saved / takeHome) * 100 : 0

  const movers = categories
    .map(([name, v]) => ({ name, v, was: thenBy.get(name) ?? 0 }))
    .filter(c => c.was > 0 && Math.abs(c.v - c.was) > 500)
    .sort((a, b) => Math.abs(b.v - b.was) - Math.abs(a.v - a.was))
    .slice(0, 3)

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 18 }}>
        <div>
          <h1>{m.label}</h1>
          <p className="sub" style={{ marginTop: 4 }}>
            <Link href={`/summary/${m.prev}`}>‹ {prev.label}</Link>
            {!m.isCurrent && <> · <Link href={`/summary/${m.next}`}>{monthRange(m.next).label} ›</Link></>}
          </p>
        </div>

        <section className="card hero">
          <div className="label">Household spend</div>
          <div className="big num" style={{ marginTop: 6 }}>{inr(total)}</div>
          <div className="sub">
            {spend.length} transaction{spend.length === 1 ? '' : 's'}
            {lastTotal > 0 && (
              <>, {diff >= 0 ? 'up' : 'down'} {inr(Math.abs(diff))} on {prev.label.split(' ')[0]}</>
            )}
          </div>
          {total > 0 && (
            <>
              <div className="bar">
                {categories.map(([name, v], i) => (
                  <i key={name} style={{ width: `${(v / total) * 100}%`, background: colourFor(i) }} />
                ))}
              </div>
              <div className="legend">
                {categories.slice(0, 5).map(([name, v], i) => (
                  <span key={name}>
                    <i className="swatch" style={{ background: colourFor(i) }} />
                    {name} <b className="num" style={{ color: 'var(--white)', fontWeight: 500 }}>{inr(v)}</b>
                  </span>
                ))}
              </div>
            </>
          )}
        </section>

        {takeHome > 0 && (
          <section className="grid cols-3">
            <div className="card">
              <div className="label">Take-home</div>
              <div className="num" style={{ fontSize: 24, color: 'var(--white)', marginTop: 4 }}>{inr(takeHome)}</div>
            </div>
            <div className="card">
              <div className="label">Kept</div>
              <div className="num" style={{ fontSize: 24, marginTop: 4, color: saved > 0 ? 'var(--credit)' : 'var(--warn)' }}>{inr(saved)}</div>
              <div className="sub">{rate.toFixed(0)}% of what came in</div>
            </div>
            <div className="card">
              <div className="label">Claimable</div>
              <div className="num" style={{ fontSize: 24, marginTop: 4, color: claimable ? 'var(--claimable)' : 'var(--page-text)' }}>{inr(claimable)}</div>
              <div className="sub">{claimable ? 'still to come back' : 'nothing outstanding'}</div>
            </div>
          </section>
        )}

        {movers.length > 0 && (
          <section className="card">
            <div className="label">What moved</div>
            <div className="rows" style={{ marginTop: 8 }}>
              {movers.map(c => (
                <div className="row" key={c.name}>
                  <div>
                    <div className="name">{c.name}</div>
                    <div className="who">was {inr(c.was)} in {prev.label.split(' ')[0]}</div>
                  </div>
                  <div className="amt num" style={{ color: c.v > c.was ? 'var(--warn)' : 'var(--credit)' }}>
                    {c.v > c.was ? '+' : ''}{inr(c.v - c.was)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {biggest.length > 0 && (
          <section className="card">
            <div className="label">Largest five</div>
            <div className="rows" style={{ marginTop: 8 }}>
              {biggest.map(r => (
                <Link className="row rowlink" key={r.id} href={`/t/${r.id}`}>
                  <div>
                    <div className="name">{r.merchant ?? r.merchant_key ?? 'Unknown'}</div>
                    <div className="who">{dayLabel(r.occurred_on)} · {topOf(r.category_id)}</div>
                  </div>
                  <div className="amt num">{inr(Number(r.amount))}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <div className="label">How complete this is</div>
          <p className="sub" style={{ marginTop: 8 }}>
            {stillWaiting > 0
              ? `${stillWaiting} transaction${stillWaiting === 1 ? '' : 's'} from this month still sitting in Review, so the total will move.`
              : 'Nothing from this month is waiting in Review.'}
            {credits > 0 && ` ${inr(credits)} came in and is counted separately from spending.`}
            {' '}This only covers what reached the app. Anything paid without a message, and never added by hand, is missing.
          </p>
        </section>
      </main>
    </>
  )
}
