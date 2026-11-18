import Link from 'next/link'
import { Crumbs } from '../crumbs'
import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { inr, monthRange } from '../../lib/format'
import { paceOf, budgetState } from '../../lib/pace'
import { hueFor } from '../../lib/caticons'
import { CatIcon } from '../caticon'
import { BudgetRow } from './row'

export const dynamic = 'force-dynamic'

/**
 * Budgets as a place to look, not only a form. The gauge is everything with a
 * limit; each tile is one category with what is left, the days left, and a
 * marker for where it should be by today. Setting limits is below.
 */
export default async function Budgets({ searchParams }: { searchParams: Promise<{ m?: string; edit?: string }> }) {
  const sp = await searchParams
  const supabase = await supabaseServer()
  const month = monthRange(sp.m)
  const [y, mo] = month.key.split('-').map(Number)
  const from = new Date(Date.UTC(y, mo - 7, 1)).toISOString().slice(0, 10)
  const to = new Date(Date.UTC(y, mo - 1, 0)).toISOString().slice(0, 10)

  const [{ data: cats }, { data: budgets }, { data: hist }, { data: now }, { count: reviewCount }] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id').is('parent_id', null).order('name'),
    supabase.from('budgets').select('category_id, monthly'),
    supabase.rpc('spend_by_top', { p_from: from, p_to: to }),
    supabase.rpc('spend_by_top', { p_from: month.from, p_to: month.to }),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])
  const sum = (rows: { top_id: number | null; total: number }[] | null) => {
    const m = new Map<number, number>()
    for (const r of rows ?? []) if (r.top_id) m.set(r.top_id, (m.get(r.top_id) ?? 0) + Number(r.total))
    return m
  }
  const six = sum(hist), cur = sum(now)
  const limit = new Map((budgets ?? []).map(b => [b.category_id, Number(b.monthly)]))
  const pace = paceOf(month.key)

  const tiles = (cats ?? []).filter(c => limit.has(c.id)).map(c => {
    const spent = cur.get(c.id) ?? 0, lim = limit.get(c.id)!
    return { ...c, spent, lim, left: lim - spent, ...budgetState(spent, lim, pace.share) }
  }).sort((a, b) => b.used - a.used)
  const totalLimit = tiles.reduce((s, t) => s + t.lim, 0)
  const totalSpent = tiles.reduce((s, t) => s + t.spent, 0)
  const overall = budgetState(totalSpent, totalLimit, pace.share)
  const editing = sp.edit === '1' || tiles.length === 0

  const list = (cats ?? []).map(c => ({ ...c, average: (six.get(c.id) ?? 0) / 6 })).sort((a, b) => b.average - a.average)
  const tone = (s: string) => (s === 'over' ? 'var(--negative)' : s === 'ahead' ? 'var(--caution)' : 'var(--positive)')

  // Half-circle gauge: an arc from left to right, filled to the share spent.
  const r = 80, len = Math.PI * r, filled = Math.min(1, overall.used) * len
  const marker = Math.PI * (1 - pace.share)

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 14 }}>
        <Crumbs fallback={`/?m=${month.key}`} trail={[{ label: month.label, href: `/?m=${month.key}` }, { label: 'Budgets' }]} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h1>Budgets</h1>
          {tiles.length > 0 && <Link className="chip" href={editing ? `/budgets?m=${month.key}` : `/budgets?m=${month.key}&edit=1`}>{editing ? 'Done' : 'Set limits'}</Link>}
        </div>

        {tiles.length > 0 && (
          <section className="card hero" style={{ textAlign: 'center' }}>
            <div className="monthnav" style={{ justifyContent: 'center' }}>
              <Link className="chip" href={`/budgets?m=${month.prev}`}>‹</Link>
              <span className="label" style={{ margin: 0 }}>{month.label}</span>
              {month.isCurrent ? <span className="chip" style={{ opacity: .3 }}>›</span> : <Link className="chip" href={`/budgets?m=${month.next}`}>›</Link>}
            </div>
            <svg viewBox="0 0 200 112" className="gauge" role="img" aria-label={`${Math.round(overall.used * 100)}% of all budgets spent`}>
              <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--surface-raised)" strokeWidth="16" strokeLinecap="round" />
              <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke={tone(overall.state)} strokeWidth="16" strokeLinecap="round"
                strokeDasharray={`${filled} ${len}`} />
              {month.isCurrent && (
                <line x1={100 + 64 * Math.cos(marker)} y1={100 - 64 * Math.sin(marker)} x2={100 + 96 * Math.cos(marker)} y2={100 - 96 * Math.sin(marker)}
                  stroke="var(--page-text)" strokeWidth="2.5" strokeLinecap="round" />
              )}
            </svg>
            <div className="big num" style={{ marginTop: -46 }}>{inr(Math.abs(totalLimit - totalSpent))}</div>
            <div className="sub">
              {totalSpent <= totalLimit ? 'left' : 'over'} {month.isCurrent ? 'this month' : `in ${month.label}`} · {Math.round(overall.used * 100)}% of {inr(totalLimit)} spent
              {month.isCurrent && `, ${pace.daysLeft} day${pace.daysLeft === 1 ? '' : 's'} to go`}
            </div>
          </section>
        )}

        {tiles.length > 0 && (
          <section className="btiles">
            {tiles.map(t => (
              <Link key={t.id} className="card btile" href={`/c/${t.id}?m=${month.key}`}>
                <div className="withicon"><CatIcon name={t.name} size={24} /><span className="name">{t.name}</span></div>
                <div className="who" style={{ color: tone(t.state), marginTop: 8 }}>{Math.round(t.used * 100)}% spent</div>
                <div className="num" style={{ fontSize: 20 }}>{inr(Math.abs(t.left))}</div>
                <div className="who">{t.left >= 0 ? 'left' : 'over'}{month.isCurrent ? `, ${pace.daysLeft}d to go` : ''}</div>
                <div className="pacebar">
                  <i style={{ width: `${Math.min(100, t.used * 100)}%`, background: t.state === 'fine' ? hueFor(t.name) : tone(t.state) }} />
                  {month.isCurrent && <b style={{ left: `${pace.share * 100}%` }} title="Where it should be by today" />}
                </div>
              </Link>
            ))}
          </section>
        )}
        {tiles.length > 0 && month.isCurrent && (
          <p className="sub">The line on each bar is where spending should be by today if the month is spread evenly. Amber means ahead of it, red means over the limit.</p>
        )}

        {editing && (
          <section className="card">
            <h2>Set limits</h2>
            <p className="sub" style={{ marginTop: 4 }}>A monthly limit per category. Leave one blank for no limit. The average is the last six whole months.</p>
            <div className="rows" style={{ marginTop: 8 }}>
              {list.map(c => (
                <BudgetRow key={c.id} id={c.id} name={c.name} average={c.average}
                  current={limit.get(c.id) ?? null} thisMonth={cur.get(c.id) ?? 0} />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  )
}
