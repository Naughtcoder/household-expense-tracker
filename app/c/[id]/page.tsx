import Link from 'next/link'
import { supabaseServer } from '../../../lib/supabase/server'
import { Nav } from '../../nav'
import { inr, inrShort, dayLabel, monthRange, pct } from '../../../lib/format'
import { notFound } from 'next/navigation'
import { countsAsSpend } from '../../../lib/scope'
import { CatIcon } from '../../caticon'
import { IconChevronRight } from '@tabler/icons-react'
import { PeriodNav } from '../../periodnav'
import { Crumbs } from '../../crumbs'
import { WhoToggle } from '../../whotoggle'
import { tripOf, TRAVEL_ID } from '../../../lib/trips'
import { ctxQuery, periodCrumb, pretty, personNote, PEOPLE } from '../../../lib/drill'
import { hueFor } from '../../../lib/caticons'
import { catTree } from '../../../lib/cats'
import { ScrollEnd } from '../../scrollend'

export const dynamic = 'force-dynamic'

type Row = {
  id: string; amount: number; direction: 'debit' | 'credit'; occurred_on: string
  merchant: string | null; merchant_key: string | null; scope: string; category_id: number | null; bank?: string | null; note?: string | null
}

/**
 * One category, one month: the deep dive behind every category row.
 *
 * It always has a month (this one if none is given), because "Food" on its
 * own over five years answers nothing. The month's payments are read with a
 * date range; the old page read the latest 1,000 Food rows of all time and
 * filtered those, which came up short for any older month. The trend comes
 * from the database totals for the same reason.
 */
export default async function Category({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ m?: string; y?: string; who?: string; trips?: string }>
}) {
  const { id } = await params
  const { m, y: yParam, who, trips: tripsParam } = await searchParams
  const tripsOwn = tripsParam === 'own'
  // A year asked for from the year view: the whole year, and the bars end at
  // its last month so far. Otherwise one month, as before.
  const yearMode = /^\d{4}$/.test(yParam ?? '')
  const thisYear = new Date().getFullYear()
  const month = yearMode
    ? (() => {
        const yy = Number(yParam)
        const lastKey = yy === thisYear ? undefined : `${yy}-12`
        const r = monthRange(lastKey)
        return { ...r, from: `${yy}-01-01`, label: String(yy), prev: String(yy - 1), next: String(yy + 1), isCurrent: yy >= thisYear }
      })()
    : monthRange(m)
  const catId = Number(id)
  const supabase = await supabaseServer()

  const [y, mo] = month.key.split('-').map(Number)
  const trendFrom = new Date(Date.UTC(y, mo - 24, 1)).toISOString().slice(0, 10)

  const [{ data: cats }, { count: reviewCount }, { data: trendRows }] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
    supabase.rpc('spend_by_category', { p_from: trendFrom, p_to: month.to }),
  ])
  const all = cats ?? []
  const me = all.find(c => c.id === catId)
  if (!me) notFound()

  // A parent covers everything under it, at any depth, otherwise tapping Food
  // from the month breakdown would show almost nothing.
  const tree = catTree(all)
  const family = tree.family(catId)
  const children = tree.children(catId)
  const ancestors = tree.path(catId).slice(0, -1)
  const parent = ancestors[ancestors.length - 1] ?? null
  const rootName = tree.root(catId)?.name ?? me.name

  let q = supabase.from('transactions')
    .select('id, amount, direction, occurred_on, merchant, merchant_key, scope, category_id, bank, note')
    .in('category_id', family).gte('occurred_on', month.from).lte('occurred_on', month.to)
    .neq('status', 'duplicate').neq('status', 'ignored')
  if (who) q = q.eq('paid_by', who)
  const { data } = await q.order('occurred_on', { ascending: false }).limit(5000)

  // Trips: in the summaries a trip's food and taxis count as Travel. So Travel
  // takes in every payment made on a trip, whatever its category, and every
  // other category leaves its trip payments out, saying how much moved.
  const trips = await tripOf(supabase)
  const own = ((data ?? []) as Row[]).filter(r => countsAsSpend(r))
  let spend = own
  let movedToTravel = 0
  if (tripsOwn) {
    // Trips by category: every category keeps its own trip payments.
  } else if (catId === TRAVEL_ID) {
    let tq = supabase.from('transactions')
      .select('id, amount, direction, occurred_on, merchant, merchant_key, scope, category_id, bank, note')
      .in('id', [...trips.keys()]).gte('occurred_on', month.from).lte('occurred_on', month.to)
      .neq('status', 'duplicate').neq('status', 'ignored')
    if (who) tq = tq.eq('paid_by', who)
    const { data: tripRows } = await tq
    const seen = new Set(own.map(r => r.id))
    spend = [...own, ...((tripRows ?? []) as Row[]).filter(r => !seen.has(r.id) && countsAsSpend(r))]
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
  } else {
    spend = own.filter(r => !trips.has(r.id))
    movedToTravel = own.filter(r => trips.has(r.id)).reduce((s, r) => s + Number(r.amount), 0)
  }
  const { data: tagRows } = await supabase.from('tags').select('id, name')
  const tagIdByName = new Map((tagRows ?? []).map(t => [t.name as string, t.id as number]))
  const byTrip = new Map<string, number>()
  if (catId === TRAVEL_ID && !tripsOwn) for (const r of spend) { const n = trips.get(r.id) ?? 'Not on a tagged trip'; byTrip.set(n, (byTrip.get(n) ?? 0) + Number(r.amount)) }
  const total = spend.reduce((s, r) => s + Number(r.amount), 0)

  // Twelve months to this one, for the bars and the comparisons.
  const fam = new Set(family)
  const byMonth = new Map<string, number>()
  for (const r of (trendRows ?? []) as { month: string; category_id: number | null; total: number }[])
    if (r.category_id !== null && fam.has(r.category_id)) byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + Number(r.total))
  // One person's view: the bars are that person's too, read from their rows,
  // because the database totals are for the household.
  if (who) {
    const { data: theirs } = await supabase.from('transactions')
      .select('amount, direction, scope, category_id, occurred_on')
      .in('category_id', family).eq('paid_by', who).gte('occurred_on', trendFrom).lte('occurred_on', month.to)
      .neq('status', 'duplicate').neq('status', 'ignored').limit(5000)
    byMonth.clear()
    for (const r of (theirs ?? []) as Row[]) if (countsAsSpend(r)) byMonth.set(r.occurred_on.slice(0, 7), (byMonth.get(r.occurred_on.slice(0, 7)) ?? 0) + Number(r.amount))
  }
  const months: { key: string; label: string; value: number }[] = []
  // Two years, so the chart scrolls back; the comparisons use the last twelve.
  for (let i = 23; i >= 0; i--) {
    const d = new Date(y, mo - 1 - i, 1)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    months.push({ key: k, label: d.toLocaleDateString('en-IN', { month: 'short' }), value: byMonth.get(k) ?? 0 })
  }
  const peak = Math.max(1, ...months.map(x => x.value))
  const recent = months.slice(-12)
  const before = recent.slice(0, -1).filter(x => x.value > 0)
  const average = before.length ? before.reduce((s, x) => s + x.value, 0) / before.length : 0
  const last = recent[recent.length - 2]?.value ?? 0
  const diff = (a: number, b: number) => (b > 0 ? `${a >= b ? 'up' : 'down'} ${inr(Math.abs(a - b))}` : null)

  // The overview: each of the last twelve months split by who paid, whatever
  // person the page is set to, so one screen answers "who spends on this, and
  // is it going up". Read a page at a time, because the database hands back
  // at most 1,000 rows per ask.
  const split: { occurred_on: string; amount: number; direction: 'debit' | 'credit'; scope: string; paid_by: string }[] = []
  const splitFrom = recent[0].key + '-01'
  for (let from = 0; ; from += 1000) {
    const { data: page } = await supabase.from('transactions')
      .select('occurred_on, amount, direction, scope, paid_by')
      .in('category_id', family).gte('occurred_on', splitFrom).lte('occurred_on', month.to)
      .neq('status', 'duplicate').neq('status', 'ignored')
      .order('occurred_on').range(from, from + 999)
    split.push(...((page ?? []) as typeof split))
    if ((page ?? []).length < 1000) break
  }
  const people = Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1]))
  const cell = new Map<string, number>()
  for (const r of split) {
    if (!countsAsSpend(r)) continue
    const k = r.occurred_on.slice(0, 7)
    cell.set(`${k}|${r.paid_by}`, (cell.get(`${k}|${r.paid_by}`) ?? 0) + Number(r.amount))
    cell.set(`${k}|all`, (cell.get(`${k}|all`) ?? 0) + Number(r.amount))
  }
  const sumOf = (who: string) => recent.reduce((s, x) => s + (cell.get(`${x.key}|${who}`) ?? 0), 0)
  const monthHref = (k: string, w: string | null) => {
    const qs = new URLSearchParams({ m: k })
    if (w) qs.set('who', w)
    return `/c/${catId}?${qs.toString()}`
  }

  // One row per payee as people know it. The bank's key for Swiggy differs by
  // card and UPI app (SWIGGY, SWIGGY LTD, BUNDL TECH...), so rows are grouped
  // by the name shown, and the payee page is opened by that name.
  const byMerchant = new Map<string, { name: string; key: string; byName: boolean; byHand?: boolean; total: number; count: number }>()
  for (const r of spend) {
    const k = r.merchant_key ?? 'unknown'
    const name = (r.merchant ?? k).trim()
    // Money Manager rows logged by hand often carry a note ("Lunch") where a
    // payee would be. Kept apart from real payees and labelled as such.
    const byHand = /^money manager/i.test(r.bank ?? '')
    const g = (byHand ? 'hand|' : '') + name.toLowerCase()
    const e = byMerchant.get(g) ?? { name, key: k, byName: true, byHand, total: 0, count: 0 }
    e.total += Number(r.amount); e.count += 1
    byMerchant.set(g, e)
  }
  const merchants = [...byMerchant.values()].sort((a, b) => b.total - a.total)
  const biggest = merchants[0]?.total || 1

  const byChild = new Map<number | null, number>()
  // Rolled up to the direct child each payment sits under, so Car shows
  // Parking and Toll, and Transportation shows Car as one line.
  for (const r of spend) {
    const k = tree.branchOf(catId, r.category_id)?.id ?? catId
    byChild.set(k, (byChild.get(k) ?? 0) + Number(r.amount))
  }
  const childRows = children.map(c => ({ ...c, v: byChild.get(c.id) ?? 0 })).filter(c => c.v !== 0).sort((a, b) => b.v - a.v)

  const byDay = new Map<string, Row[]>()
  for (const r of spend) byDay.set(r.occurred_on, [...(byDay.get(r.occurred_on) ?? []), r])
  const here = yearMode ? month.label : month.key
  const ctx = yearMode ? { y: month.label, who } : { m: month.key, who }
  const href = (k: string) => {
    const qs = new URLSearchParams(yearMode ? { y: k } : { m: k })
    if (who) qs.set('who', who)
    if (tripsOwn) qs.set('trips', 'own')
    return `/c/${catId}?${qs.toString()}`
  }

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 16 }}>
        <Crumbs
          fallback={parent ? href(here).replace(`/c/${catId}`, `/c/${parent.id}`) : (periodCrumb(ctx)?.href ?? '/')}
          trail={[
            periodCrumb(ctx)!,
            ...ancestors.map(a => ({ label: a.name, href: href(here).replace(`/c/${catId}`, `/c/${a.id}`) })),
            { label: me.name },
          ]} />
        <WhoToggle path={`/c/${catId}`} params={{ ...(yearMode ? { y: month.label } : { m: month.key }), trips: tripsOwn ? 'own' : undefined }} who={who} />
        <PeriodNav label={month.label} prevHref={href(month.prev)} nextHref={month.isCurrent ? null : href(month.next)}
          jump={{ template: href('__K__'), mode: yearMode ? 'year' : 'month', current: yearMode ? month.label : month.key, format: yearMode ? 'y' : 'ym' }} />

        <div className="irow" style={{ justifyContent: 'center' }}>
          <CatIcon name={me.name} group={parent ? rootName : undefined} size={40} />
          <h1 style={{ fontSize: 20 }}>
            {ancestors.map(a => <span key={a.id}><Link href={href(here).replace(`/c/${catId}`, `/c/${a.id}`)} style={{ color: 'var(--page-text-subdued)' }}>{a.name}</Link> · </span>)}{me.name}
          </h1>
        </div>

        <section className="heroblock" style={{ paddingTop: 0 }}>
          <div className="big num"><span className="cur">₹</span>{Math.round(total).toLocaleString('en-IN')}</div>
          <div className="sub">
            {spend.length} payment{spend.length === 1 ? '' : 's'}
            {yearMode
              ? <> · about {inr(total / Math.max(1, months.filter(x => x.key.startsWith(month.label)).length))} a month</>
              : <>
                  {diff(total, last) && <> · {diff(total, last)} on last month</>}
                  {average > 0 && <> · usually {inr(average)}</>}
                </>}
          </div>
        </section>

        {movedToTravel > 0 && (
          <Link className="stat" href={href(here).replace(`/c/${catId}`, `/c/${TRAVEL_ID}`)} style={{ display: 'block' }}>
            <div className="k">Spent on trips, counted under Travel</div>
            <div className="v" style={{ fontSize: 15 }}>{inr(movedToTravel)} more {me.name.toLowerCase()} · see Travel ›</div>
          </Link>
        )}

        {byTrip.size > 0 && (
          <section className="card">
            <h2>By trip</h2>
            <div className="rows" style={{ marginTop: 6 }}>
              {[...byTrip.entries()].sort((a, b) => b[1] - a[1]).map(([name, v]) => {
                const tagId = tagIdByName.get(name)
                const inner = (
                  <>
                    <div className="mid">
                      <div className="name">{name}</div>
                      <div className="thin"><i style={{ width: `${(v / ([...byTrip.values()].reduce((a, b) => Math.max(a, b), 1))) * 100}%`, background: hueFor('Travel') }} /></div>
                    </div>
                    <div className="amt num">{inr(v)}<div className="who" style={{ textAlign: 'right' }}>{pct(v, [...byTrip.values()].reduce((a, b) => a + b, 0))}</div></div>
                  </>
                )
                return tagId
                  ? <Link className="irow" key={name} href={`/trips/${tagId}`}>{inner}<IconChevronRight size={18} className="chev" /></Link>
                  : <div className="irow" key={name}>{inner}</div>
              })}
            </div>
          </section>
        )}

        <section className="card">
          <ScrollEnd>
          <div className="bars wide" style={{ height: 120, marginTop: 0, width: months.length * 30 }}>
            {months.map(x => (
              <Link key={x.key} href={href(x.key)} title={`${x.key}: ${inr(x.value)}`}>
                <span className="col"><i style={{ height: `${(x.value / peak) * 100}%`, opacity: (yearMode ? x.key.startsWith(month.label) : x.key === month.key) ? 1 : 0.3, background: hueFor(rootName) }} /></span>
                <b className="cap" style={{ color: x.key === month.key ? 'var(--page-text)' : undefined, fontWeight: x.key === month.key ? 700 : 400 }}>
                  {x.key.endsWith('-01') ? `’${x.key.slice(2, 4)}` : x.label.slice(0, 1)}
                </b>
              </Link>
            ))}
          </div>
          </ScrollEnd>
        </section>

        <section className="card">
          <h2>Month by month, by who paid</h2>
          <div className="ctable">
            <div className="ctr head"><span>Month</span>{people.map(([, n]) => <span key={n}>{n}</span>)}<span>Household</span></div>
            {[...recent].reverse().map(x => (
              <div className="ctr" key={x.key} style={{ fontWeight: x.key === month.key ? 700 : 400 }}>
                <Link href={monthHref(x.key, null)} style={{ color: 'inherit' }}>{new Date(x.key + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}</Link>
                {people.map(([pid]) => <Link key={pid} className="num" href={monthHref(x.key, pid)} style={{ textAlign: 'right', color: 'inherit' }}>{inr(cell.get(`${x.key}|${pid}`) ?? 0)}</Link>)}
                <Link className="num" href={monthHref(x.key, null)} style={{ textAlign: 'right', color: 'inherit' }}>{inr(cell.get(`${x.key}|all`) ?? 0)}</Link>
              </div>
            ))}
            <div className="ctr" style={{ fontWeight: 700 }}>
              <span>12 months</span>
              {people.map(([pid]) => <span key={pid} className="num">{inr(sumOf(pid))}</span>)}
              <span className="num">{inr(sumOf('all'))}</span>
            </div>
          </div>
        </section>

        {childRows.length > 0 && (
          <section>
            <div className="section-h"><h2>Inside {me.name}</h2></div>
            <div className="card" style={{ paddingBlock: 4 }}>
              {childRows.map(c => (
                <Link className="irow" key={c.id} href={href(here).replace(`/c/${catId}`, `/c/${c.id}`)}>
                  <CatIcon name={c.name} group={me.name} />
                  <div className="mid">
                    <div className="t">{c.name}</div>
                    <div className="thin"><i style={{ width: `${total ? (c.v / total) * 100 : 0}%`, background: hueFor(c.name) }} /></div>
                  </div>
                  <div className="a">{inr(c.v)}</div>
                </Link>
              ))}
              {(byChild.get(catId) ?? 0) > 0 && (
                <div className="irow">
                  <CatIcon name={me.name} />
                  <div className="mid"><div className="t">{me.name}, not split further</div></div>
                  <div className="a">{inr(byChild.get(catId) ?? 0)}</div>
                </div>
              )}
            </div>
          </section>
        )}

        <section>
          <div className="section-h"><h2>Who you paid</h2></div>
          <div className="card" style={{ paddingBlock: 4 }}>
            {merchants.map(x => (
              <Link className="irow" key={`${x.key}|${x.name}`} href={`/m/${encodeURIComponent(x.key)}${ctxQuery(ctx, { c: String(catId), n: x.byName ? x.name : undefined })}`}>
                <div className="mid">
                  <div className="t">{pretty(x.name)}{x.byHand && <span className="who"> · logged by hand</span>}</div>
                  <div className="thin"><i style={{ width: `${(x.total / biggest) * 100}%`, background: hueFor(rootName) }} /></div>
                </div>
                <div className="a">{inr(x.total)}<small>{x.count}×</small></div>
              </Link>
            ))}
            {merchants.length === 0 && <div className="empty">Nothing in {me.name} in {month.label}.</div>}
          </div>
        </section>

        {byDay.size > 0 && (
          <section>
            <div className="section-h"><h2>Day by day</h2></div>
            <div className="card" style={{ paddingBlock: 4 }}>
              {[...byDay.entries()].map(([d, list]) => (
                <div key={d}>
                  <div className="dayhead" style={{ position: 'static', background: 'transparent', backdropFilter: 'none' }}><span>{dayLabel(d)}</span><span className="num">{inr(list.reduce((s, r) => s + Number(r.amount), 0))}</span></div>
                  {list.map(r => (
                    <Link className="irow" key={r.id} href={`/t/${r.id}${ctxQuery(ctx, { c: String(catId) })}`}>
                      <CatIcon name={all.find(c => c.id === r.category_id)?.name} group={rootName} />
                      <div className="mid"><div className="t">{pretty(r.merchant ?? r.merchant_key ?? 'Unknown')}</div>{personNote(r.note) && <div className="s">{personNote(r.note)}</div>}</div>
                      <div className="a">{inr(Number(r.amount))}</div>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  )
}
