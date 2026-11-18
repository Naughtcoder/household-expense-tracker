import Link from 'next/link'
import { SALARY_CATEGORY, TAX_GROUP, fyOf, fyLabel, fyRange, loadSalaryTax } from '../../lib/tax'
import { NavLink } from '../navlink'
import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { inr, inrShort, dayLabel } from '../../lib/format'
import { countsAsSpend, countsAsIncome } from '../../lib/scope'
import { allRows } from '../../lib/pages'
import { hueFor } from '../../lib/caticons'
import { CatIcon } from '../caticon'
import { PeriodNav } from '../periodnav'
import { tripOf } from '../../lib/trips'
import { catTree } from '../../lib/cats'
import { TripsSwitch } from './tripsswitch'
import { ScrollEnd } from '../scrollend'

export const dynamic = 'force-dynamic'

type Row = {
  paid_by?: string | null
  id: string; amount: number; direction: 'debit' | 'credit'; occurred_on: string; scope: string
  category_id: number | null; merchant: string | null; merchant_key: string | null
  paid: { name: string } | null
}
type Period = 'week' | 'month' | 'year'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const mkey = (d: Date) => iso(d).slice(0, 7)

/** The period containing `at`, and the ones either side of it. */
function periodOf(p: Period, at: Date) {
  if (p === 'week') {
    const from = new Date(at); from.setDate(at.getDate() - ((at.getDay() + 6) % 7))
    const to = new Date(from); to.setDate(from.getDate() + 6)
    const prev = new Date(from); prev.setDate(from.getDate() - 7)
    const next = new Date(from); next.setDate(from.getDate() + 7)
    const f = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    return { from, to, prev, next, label: `${f(from)} to ${f(to)}` }
  }
  if (p === 'year') {
    const from = new Date(at.getFullYear(), 0, 1), to = new Date(at.getFullYear(), 11, 31)
    return { from, to, prev: new Date(at.getFullYear() - 1, 0, 1), next: new Date(at.getFullYear() + 1, 0, 1), label: String(at.getFullYear()) }
  }
  const from = new Date(at.getFullYear(), at.getMonth(), 1), to = new Date(at.getFullYear(), at.getMonth() + 1, 0)
  return {
    from, to, prev: new Date(at.getFullYear(), at.getMonth() - 1, 1), next: new Date(at.getFullYear(), at.getMonth() + 1, 1),
    label: from.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
  }
}

/**
 * One page that answers "how did this period go", for a week, a month or a
 * year. Everything on it follows the switch: the totals, the bars, the
 * categories and the payments underneath. Money in and money out are two
 * chips; tapping one draws that side.
 *
 * Totals come from the payments read in full (lib/pages.ts allRows), never
 * from a single read, which stops at 1,000 rows.
 */
export default async function Insights({ searchParams }: {
  searchParams: Promise<{ p?: string; at?: string; show?: string; who?: string; trips?: string }>
}) {
  const sp = await searchParams
  const p: Period = sp.p === 'week' || sp.p === 'year' ? sp.p : 'month'
  const show = sp.show === 'in' ? 'in' : 'out'
  // Trip spending in the summary: under Travel (the default; the trip is why
  // it was spent) or under its own category (Italy dinners as Food).
  const tripsAs: 'travel' | 'own' = sp.trips === 'own' ? 'own' : 'travel'
  const today = new Date()
  const at = sp.at && /^\d{4}-\d{2}-\d{2}$/.test(sp.at) ? new Date(sp.at + 'T00:00:00') : today
  const per = periodOf(p, at)
  const isCurrent = per.from <= today && today <= new Date(per.to.getTime() + 86399999)
  const supabase = await supabaseServer()

  const yoyStart = new Date(today.getFullYear(), today.getMonth() - 24, 1)
  // Everything at once: each wait is a round trip to the database.
  const [rows, { data: totals }, { count: reviewCount }, { data: cats }, trips, { data: household }] = await Promise.all([
    allRows<Row>((a, b) => supabase.from('transactions')
      .select('id, amount, direction, occurred_on, scope, category_id, merchant, merchant_key, paid_by, paid:people!transactions_paid_by_fkey(name)')
      .gte('occurred_on', iso(per.from)).lte('occurred_on', iso(per.to))
      .neq('status', 'duplicate').neq('status', 'ignored')
      .order('occurred_on', { ascending: false }).range(a, b) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>),
    supabase.rpc('spend_by_top', { p_from: iso(yoyStart), p_to: iso(today) }),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
    supabase.from('categories').select('id, name, parent_id'),
    tripOf(supabase),
    supabase.from('people').select('id, name').order('name'),
  ])

  const tree = catTree(cats ?? [])
  const catById = tree.byId
  const topName = (id: number | null) => tree.root(id)?.name ?? 'Uncategorised'
  const topIdByName = new Map<string, number>()
  for (const c of tree.roots()) topIdByName.set(c.name, c.id)

  // Household, or one person: the whole page follows. Income by person is
  // shown either way, so the three can be read side by side.
  const who = sp.who && sp.who !== 'all' ? sp.who : null
  const mine = (r: Row) => !who || r.paid_by === who
  const taxFy = fyOf(per.from.toISOString().slice(0, 10))
  const taxRoot = tree.roots().find(c => c.name === TAX_GROUP)
  const { data: taxRows } = taxRoot
    ? await supabase.from('transactions').select('amount, direction, scope, occurred_on, paid_by, category_id')
        .in('category_id', tree.family(taxRoot.id)).gte('occurred_on', fyRange(taxFy).from).lte('occurred_on', fyRange(taxFy).to)
        .neq('status', 'duplicate').neq('status', 'ignored')
    : { data: [] }
  const salaryCat = tree.roots().length ? (cats ?? []).find(c => c.name === SALARY_CATEGORY) : undefined
  const salaryTax = (await loadSalaryTax(supabase, salaryCat ? tree.family(salaryCat.id) : [])).rows
    .filter(r => fyOf(r.occurred_on) === taxFy && (!who || r.paid_by === who)).reduce((a, r) => a + Number(r.amount), 0)
  const taxPaid = salaryTax + ((taxRows ?? []) as Row[]).filter(r => countsAsSpend(r) && mine(r)).reduce((a, r) => a + Number(r.amount), 0)
  const incomeBy = new Map<string, number>()
  for (const r of rows) if (countsAsIncome(r)) incomeBy.set(r.paid?.name ?? 'Unknown', (incomeBy.get(r.paid?.name ?? 'Unknown') ?? 0) + Number(r.amount))
  const householdIncome = [...incomeBy.values()].reduce((a, b) => a + b, 0)
  const out = rows.filter(r => mine(r) && countsAsSpend(r))
  const inn = rows.filter(r => mine(r) && countsAsIncome(r))
  const outTotal = out.reduce((s, r) => s + Number(r.amount), 0)
  const inTotal = inn.reduce((s, r) => s + Number(r.amount), 0)
  const side = show === 'in' ? inn : out
  const sideTotal = show === 'in' ? inTotal : outTotal

  // Bars: days of the week, days of the month, or months of the year.
  const buckets: { key: string; label: string; value: number; future: boolean; other?: boolean }[] = []
  // The year view runs three years, two before the one picked, and scrolls
  // sideways; the picked year is lit, the others dimmed.
  const pickedYear = per.from.getFullYear()
  const back = p === 'year'
    ? (await supabase.rpc('month_totals', { p_from: `${pickedYear - 2}-01-01`, p_to: `${pickedYear}-12-31`, p_who: who, p_in: show === 'in' })).data as { month: string; total: number }[] | null
    : null
  if (p === 'year') {
    for (let m = 0; m < 36; m++) {
      const d = new Date(pickedYear - 2, m, 1)
      buckets.push({ key: mkey(d), label: d.getMonth() === 0 ? `’${String(d.getFullYear()).slice(2)}` : d.toLocaleDateString('en-IN', { month: 'narrow' }),
        value: 0, future: d > today, other: d.getFullYear() !== pickedYear })
    }
  } else {
    for (let d = new Date(per.from); d <= per.to; d.setDate(d.getDate() + 1)) {
      buckets.push({
        key: iso(d),
        label: p === 'week' ? d.toLocaleDateString('en-IN', { weekday: 'narrow' }) : (d.getDate() === 1 || d.getDate() % 5 === 0 ? String(d.getDate()) : ''),
        value: 0, future: d > today,
      })
    }
  }
  const bucketOf = (r: Row) => (p === 'year' ? r.occurred_on.slice(0, 7) : r.occurred_on)
  const idx = new Map(buckets.map((b, i) => [b.key, i]))
  if (back) { for (const r of back) { const i = idx.get(r.month); if (i !== undefined) buckets[i].value = Number(r.total) } }
  else for (const r of side) { const i = idx.get(bucketOf(r)); if (i !== undefined) buckets[i].value += Number(r.amount) }
  const elapsed = buckets.filter(b => !b.future && !b.other)
  const avg = elapsed.length ? elapsed.reduce((s, b) => s + b.value, 0) / elapsed.length : 0
  const peak = Math.max(1, ...buckets.map(b => b.value))
  const daysElapsed = Math.max(1, Math.round((Math.min(today.getTime(), per.to.getTime()) - per.from.getTime()) / 86400000) + 1)
  const perDay = sideTotal / daysElapsed

  // Categories for the period, the side being shown.
  const byCat = new Map<string, number>()
  // A trip's food and taxis count as Travel in the summary.
  // Both ways are worked out here, so the trips switch flips instantly in the
  // browser instead of rebuilding the page.
  const listFor = (asTravel: boolean) => {
    const m = new Map<string, number>()
    const sumName = (r: Row) => (show !== 'in' && asTravel && trips.has(r.id) ? 'Travel' : topName(r.category_id))
    for (const r of side) m.set(sumName(r), (m.get(sumName(r)) ?? 0) + Number(r.amount))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }
  const catTravel = listFor(true), catOwn = listFor(false)
  const catList = tripsAs === 'travel' ? catTravel : catOwn
  const tripTotal = show === 'out' ? side.filter(r => trips.has(r.id)).reduce((s, r) => s + Number(r.amount), 0) : 0
  void byCat
  const catHref = (name: string) => {
    const id = topIdByName.get(name)
    if (!id) return null
    const q = new URLSearchParams(p === 'year' ? { y: String(per.from.getFullYear()) } : { m: mkey(per.from) })
    if (who) q.set('who', who)
    if (tripsAs === 'own') q.set('trips', 'own')
    return `/c/${id}?${q.toString()}`
  }

  // Payments underneath, grouped by day.
  const byDay = new Map<string, Row[]>()
  for (const r of side.slice(0, 150)) byDay.set(r.occurred_on, [...(byDay.get(r.occurred_on) ?? []), r])

  // Who paid, for the period.
  const byPerson = new Map<string, number>()
  for (const r of out) byPerson.set(r.paid?.name ?? 'Unknown', (byPerson.get(r.paid?.name ?? 'Unknown') ?? 0) + Number(r.amount))
  const people = [...byPerson.entries()].sort((a, b) => b[1] - a[1])
  const paidTotal = people.reduce((s, [, v]) => s + v, 0) || 1

  // Year on year: the last twelve whole months against the twelve before.
  const tot = (totals ?? []) as { month: string; top_id: number | null; total: number }[]
  const monthTotal = new Map<string, number>()
  for (const r of tot) monthTotal.set(r.month, (monthTotal.get(r.month) ?? 0) + Number(r.total))
  const yr: string[] = [], yrBefore: string[] = []
  for (let i = 12; i >= 1; i--) yr.push(mkey(new Date(today.getFullYear(), today.getMonth() - i, 1)))
  for (let i = 24; i >= 13; i--) yrBefore.push(mkey(new Date(today.getFullYear(), today.getMonth() - i, 1)))
  const yrSet = new Set(yr), beforeSet = new Set(yrBefore)
  const yrCat = new Map<string, [number, number]>()
  for (const r of tot) {
    const s: 0 | 1 | null = yrSet.has(r.month) ? 0 : beforeSet.has(r.month) ? 1 : null
    if (s === null) continue
    const name = r.top_id ? catById.get(r.top_id)?.name ?? 'Uncategorised' : 'Uncategorised'
    const e: [number, number] = yrCat.get(name) ?? [0, 0]
    e[s] += Number(r.total); yrCat.set(name, e)
  }
  const yrTotal = yr.reduce((s, k) => s + (monthTotal.get(k) ?? 0), 0)
  const beforeTotal = yrBefore.reduce((s, k) => s + (monthTotal.get(k) ?? 0), 0)
  const yoyRows = [...yrCat.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 10)
  const yoyMonths = yr.map((k, i) => ({
    key: k, label: new Date(k + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'narrow' }),
    now: monthTotal.get(k) ?? 0, then: monthTotal.get(yrBefore[i]) ?? 0,
  }))
  const yoyPeak = Math.max(1, ...yoyMonths.flatMap(m => [m.now, m.then]))
  const span = (ks: string[]) => `${new Date(ks[0] + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} to ${new Date(ks[ks.length - 1] + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`

  const link = (o: { p?: Period; at?: Date; show?: string; who?: string | null; trips?: 'travel' | 'own' }) => {
    const q = new URLSearchParams({ p: o.p ?? p, at: iso(o.at ?? at), show: o.show ?? show })
    if ((o.trips ?? tripsAs) === 'own') q.set('trips', 'own')
    const w = o.who === undefined ? who : o.who
    if (w) q.set('who', w)
    return `/insights?${q.toString()}`
  }
  const net = inTotal - outTotal

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 18 }}>
        <section>
          <div className="seg" role="tablist" aria-label="Period">
            {(['week', 'month', 'year'] as Period[]).map(x => (
              <NavLink replace key={x} role="tab" aria-selected={x === p} className={x === p ? 'on' : ''} href={link({ p: x, at: today })}>
                {x[0].toUpperCase() + x.slice(1)}
              </NavLink>
            ))}
          </div>

          <div className="filters" role="tablist" aria-label="Whose">
            <NavLink replace role="tab" aria-selected={!who} className={`pill${!who ? ' on' : ''}`} href={link({ who: null })}>Household</NavLink>
            {(household ?? []).map(pp => (
              <NavLink replace key={pp.id} role="tab" aria-selected={who === pp.id} className={`pill${who === pp.id ? ' on' : ''}`} href={link({ who: pp.id })}>{pp.name}</NavLink>
            ))}
          </div>
          {show === 'out' && tripTotal > 0 && <TripsSwitch on={tripsAs === 'travel'} amount={inr(tripTotal)} />}

          <div style={{ marginTop: 14 }}>
            <PeriodNav label={per.label} prevHref={link({ at: per.prev })} nextHref={isCurrent ? null : link({ at: per.next })}
              jump={p === 'week' ? undefined : { template: link({ at: new Date(2099, 0, 1) }).replace('2099-01-01', '__K__'), mode: p === 'year' ? 'year' : 'month', current: p === 'year' ? String(per.from.getFullYear()) : mkey(per.from), format: p === 'year' ? 'y01' : 'ymd' }} />
          </div>

          <div className="heroblock">
            <div className="big num" style={{ color: net >= 0 ? 'var(--positive)' : 'var(--page-text)' }}>
              <span className="cur">{net >= 0 ? '+₹' : '−₹'}</span>{Math.round(Math.abs(net)).toLocaleString('en-IN')}
            </div>
            <div className="sub">{net >= 0 ? 'saved' : 'more out than in'} · {inr(perDay)} {show === 'in' ? 'in' : 'spent'} a day</div>
          </div>

          <div className="inout">
            <NavLink replace href={link({ show: 'in' }) + '#cats'} className={show === 'in' ? 'on' : ''}>
              <span className="who">↗ Money in</span><span className="num credit">{inr(inTotal)}</span>
            </NavLink>
            <NavLink replace href={link({ show: 'out' }) + '#cats'} className={show === 'out' ? 'on' : ''}>
              <span className="who">↘ Money out</span><span className="num">{inr(outTotal)}</span>
            </NavLink>
          </div>

          {/* Tax runs April to March: the financial year this period falls in. */}
          <Link className="stat" href={`/tax?fy=${taxFy}${who ? `&who=${who}` : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <CatIcon name="Tax" />
            <div style={{ flex: 1 }}><div className="k">Tax paid</div><div className="sub" style={{ fontSize: 12 }}>{fyLabel(taxFy)}</div></div>
            <div className="v num" style={{ fontSize: 16 }}>{inr(taxPaid)} ›</div>
          </Link>

          {householdIncome > 0 && (
            <div className="stats incomes" style={{ marginTop: 10, gridTemplateColumns: `repeat(${1 + incomeBy.size}, 1fr)` }}>
              <NavLink replace className="stat" href={link({ show: 'in', who: null }) + '#cats'}><div className="k">Household</div><div className="v" style={{ fontSize: 16 }}>{inrShort(householdIncome)}</div></NavLink>
              {[...incomeBy.entries()].sort((a, b) => b[1] - a[1]).map(([name, v]) => (
                <NavLink replace className="stat" key={name} href={link({ show: 'in', who: household?.find(h => h.name === name)?.id ?? null }) + '#cats'}><div className="k">{name}</div><div className="v" style={{ fontSize: 16 }}>{inrShort(v)}</div></NavLink>
              ))}
            </div>
          )}

          <div className="card" id="cats" style={{ marginTop: 14, scrollMarginTop: 12 }}>
          <ScrollEnd>
          <div className={`bars${p === 'year' ? ' wide' : ''}`} style={{ ['--avg' as string]: String(avg / peak), ...(p === 'year' ? { width: buckets.length * 26 } : {}) }}>
            {avg > 0 && <span className="avg" title={`Average ${inr(avg)}`}><b className="num">{inrShort(avg)}</b></span>}
            {buckets.map(b => {
              const bar = (
                <>
                  <span className="col"><i className={show === 'in' ? 'in' : ''} style={{ height: `${(b.value / peak) * 100}%`, opacity: b.other ? 0.35 : undefined }} /></span>
                  <b className="cap">{b.label}</b>
                </>
              )
              // A month in the year view opens that month.
              return p === 'year' && !b.future
                ? <Link replace key={b.key} className={b.future ? 'future' : ''} title={`${b.key}: ${inr(b.value)}`} href={link({ p: 'month', at: new Date(b.key + '-01T00:00:00') })}>{bar}</Link>
                : <div key={b.key} className={b.future ? 'future' : ''} title={`${b.key}: ${inr(b.value)}`}>{bar}</div>
            })}
          </div>
          </ScrollEnd>

          <div className="tripsview" data-trips={tripsAs}>
          {([['travel', catTravel], ['own', catOwn]] as const).map(([mode, list]) => (
          <div key={mode} className={`tripsas-${mode}`}>
          {list.length > 0 && (
            <>
              <div className="split" style={{ marginTop: 16 }}>
                {list.map(([name, v]) => <i key={name} style={{ width: `${(v / (sideTotal || 1)) * 100}%`, background: hueFor(name) }} />)}
              </div>
              <div className="rows" style={{ marginTop: 10 }}>
                {list.slice(0, 10).map(([name, v]) => {
                  const href = catHref(name)
                  const inner = (
                    <>
                      <div className="withicon"><CatIcon name={name} /><div className="name">{name}</div></div>
                      <div className="amt num">{inr(v)}<div className="who" style={{ textAlign: 'right' }}>{Math.round((v / (sideTotal || 1)) * 100)}%</div></div>
                    </>
                  )
                  return href
                    ? <Link prefetch className="row rowlink" key={name} href={href}>{inner}</Link>
                    : <div className="row" key={name}>{inner}</div>
                })}
              </div>
            </>
          )}
          </div>
          ))}
          </div>
          </div>
        </section>

        {byDay.size > 0 && (
          <section className="card">
            <h2>{show === 'in' ? 'Money in' : 'Payments'}, {per.label}</h2>
            {[...byDay.entries()].map(([d, list]) => (
              <div className="day" key={d}>
                <div className="dayhead"><span>{dayLabel(d)}</span><span className="num">{inr(list.reduce((s, r) => s + Number(r.amount), 0))}</span></div>
                <div className="rows">
                  {list.map(r => (
                    <Link className="row rowlink" key={r.id} href={`/t/${r.id}`}>
                      <div className="withicon">
                        <CatIcon name={r.category_id ? catById.get(r.category_id)?.name : 'Uncategorised'} group={topName(r.category_id)} />
                        <div className="name">{r.merchant ?? r.merchant_key ?? 'Unknown'}</div>
                      </div>
                      <div className={`amt num${r.direction === 'credit' ? ' credit' : ''}`}>{r.direction === 'credit' ? '+' : ''}{inr(Number(r.amount))}</div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {side.length > 150 && <p className="sub" style={{ marginTop: 10 }}><Link href={`/all?m=${mkey(per.from)}`}>See all {side.length}</Link></p>}
          </section>
        )}

        {people.length > 1 && (
          <section className="card">
            <div className="label">Who paid, {per.label}</div>
            <div className="split">
              {people.map(([name, v], i) => (
                <i key={name} style={{ width: `${(v / paidTotal) * 100}%`, background: i === 0 ? 'var(--violet)' : 'var(--lavender)' }} />
              ))}
            </div>
            <div className="legend" style={{ marginTop: 12 }}>
              {people.map(([name, v], i) => (
                <span key={name}>
                  <i className="swatch" style={{ background: i === 0 ? 'var(--violet)' : 'var(--lavender)' }} />
                  {name} <b className="num" style={{ color: 'var(--white)', fontWeight: 500 }}>{inr(v)}</b>
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <div className="label">Year on year, money out</div>
          <p className="sub" style={{ marginTop: 6 }}>
            {span(yr)}: <b className="num" style={{ color: 'var(--white)', fontWeight: 500 }}>{inr(yrTotal)}</b>
            {beforeTotal > 0 && <>, against {inr(beforeTotal)} the year before ({yrTotal >= beforeTotal ? 'up' : 'down'} {Math.abs(Math.round(((yrTotal - beforeTotal) / beforeTotal) * 100))}%)</>}.
          </p>
          <div className="bars pairs">
            {yoyMonths.map(m => (
              <Link key={m.key} href={`/?m=${m.key}`} title={`${m.key}: ${inr(m.now)} against ${inr(m.then)}`}>
                <span className="col">
                  <i className="then" style={{ height: `${(m.then / yoyPeak) * 100}%` }} />
                  <i style={{ height: `${(m.now / yoyPeak) * 100}%` }} />
                </span>
                <b className="cap">{m.label}</b>
              </Link>
            ))}
          </div>
          <div className="legend" style={{ marginTop: 10 }}>
            <span><i className="swatch" style={{ background: 'var(--accent)' }} />last 12 months</span>
            <span><i className="swatch" style={{ background: 'var(--border-strong)' }} />the 12 before</span>
          </div>
          <div className="rows" style={{ marginTop: 12 }}>
            {yoyRows.map(([name, [a, b]]) => {
              const cid = topIdByName.get(name)
              const pct = b > 0 ? Math.round(((a - b) / b) * 100) : null
              const inner = (
                <>
                  <div className="withicon">
                    <CatIcon name={name} />
                    <div>
                      <div className="name">{name}</div>
                      <div className="who">{pct === null ? 'nothing the year before' : `${inr(b)} the year before, ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct)}%`}</div>
                    </div>
                  </div>
                  <div className="amt num" style={{ color: pct === null ? 'var(--page-text)' : pct > 10 ? 'var(--caution)' : pct < -10 ? 'var(--positive)' : 'var(--page-text)' }}>{inr(a)}</div>
                </>
              )
              return cid
                ? <Link className="row rowlink" key={name} href={`/c/${cid}?m=${yr[yr.length - 1]}`}>{inner}</Link>
                : <div className="row" key={name}>{inner}</div>
            })}
          </div>
        </section>
      </main>
    </>
  )
}
