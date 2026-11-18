import { supabaseServer } from '../lib/supabase/server'
import { Nav } from './nav'
import { inr, monthRange, dayLabel, timeLabel } from '../lib/format'
import { MonthNav } from './monthnav'
import { WhoToggle } from './whotoggle'
import { PEOPLE } from '../lib/drill'
import { tripOf } from '../lib/trips'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PhoneBanner } from './phone/banner'
import { IconArrowDownLeft, IconReceipt2, IconHome, IconSparkles, IconChevronRight } from '@tabler/icons-react'
import Link from 'next/link'
import { countsAsSpend, countsAsIncome, invested } from '../lib/scope'
import { isFixed, summaryLine } from '../lib/insights'
import { hueFor } from '../lib/caticons'
import { paceOf, budgetState } from '../lib/pace'
import { CatIcon } from './caticon'
import { catTree } from '../lib/cats'
import { collapseSplits } from '../lib/splits'
import { SplitParts } from './splitparts'
import { Fragment } from 'react'
import { closeGap } from './add/actions'

export const dynamic = 'force-dynamic'

type Txn = {
  id: string; amount: number; direction: 'debit' | 'credit'; occurred_on: string; occurred_at?: string | null
  merchant: string | null; merchant_key: string | null; scope: string; status: string
  category_id: number | null
  paid_by: string | null
  paid: { name: string } | null
  split_of?: string | null; split_total?: number | null
}

export default async function Month({ searchParams }: { searchParams: Promise<{ m?: string; who?: string }> }) {
  const { m, who: whoParam } = await searchParams
  const who = whoParam && PEOPLE[whoParam] ? whoParam : null
  const w = who ? `&who=${who}` : ''
  const supabase = await supabaseServer()
  const month = monthRange(m)
  const { from, to } = month

  // Both at once. Sequentially this was two round trips to a far-away server.
  // The six months before this one, as totals per top category, for the
  // average in the summary line and the change against last month.
  const [y, mo] = month.key.split('-').map(Number)
  const histFrom = new Date(Date.UTC(y, mo - 7, 1)).toISOString().slice(0, 10)
  const histTo = new Date(Date.UTC(y, mo - 1, 0)).toISOString().slice(0, 10)

  const { data: alarms } = await supabase.from('alarms').select('id, kind, message').is('cleared_at', null).order('raised_at')
  const [{ data }, { count: reviewCount }, { data: catRows0, error: catErr0 }, { data: household }, { data: hist }, { data: budgetRows }, trips] = await Promise.all([
    supabase.from('transactions')
      .select('id, amount, direction, occurred_on, occurred_at, merchant, merchant_key, scope, status, category_id, paid_by, split_of, split_total, paid:people!transactions_paid_by_fkey(name)')
      .gte('occurred_on', from).lte('occurred_on', to)
      .neq('status', 'duplicate').neq('status', 'ignored')
      .in('paid_by', who ? [who] : Object.keys(PEOPLE))
      .order('occurred_on', { ascending: false }).order('occurred_at', { ascending: false, nullsFirst: false }),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
    supabase.from('categories').select('id, name, parent_id'),
    supabase.from('people').select('id, name').order('name'),
    who ? personHistory(supabase, who, histFrom, histTo) : supabase.rpc('spend_by_top', { p_from: histFrom, p_to: histTo }),
    supabase.from('budgets').select('category_id, monthly'),
    tripOf(supabase),
  ])

  // Resolved here rather than with a nested join. PostgREST cannot reliably
  // walk a self-referencing foreign key, and when it fails it returns nothing
  // rather than an error, which looks exactly like having no transactions.
  // One retry. Sam's phone showed this read failing once while every other
  // read on the page worked, so a single blip blanked every category.
  let catRows = catRows0
  let catErr = catErr0
  if (!catRows?.length) {
    const again = await supabase.from('categories').select('id, name, parent_id')
    catRows = again.data
    catErr = again.error
  }
  const tree = catTree(catRows ?? [])
  const catById = tree.byId
  const categoriesUnreadable = (catRows ?? []).length === 0
  // Name back to id, so a bar or a row can link to its own page.
  const topIdByName = new Map<string, number>()
  for (const c of tree.roots()) topIdByName.set(c.name, c.id)
  const nameOf = (id: number | null) => tree.name(id)
  const topNameOf = (id: number | null) => tree.root(id)?.name ?? null

  const txns = (data ?? []) as unknown as Txn[]

  const spend = txns.filter(t => countsAsSpend(t))
  const total = spend.reduce((s, t) => s + Number(t.amount), 0)
  const claimable = txns.filter(t => t.scope === 'claimable' && t.direction !== 'credit').reduce((s, t) => s + Number(t.amount), 0)
  const investedTotal = invested(txns)
  // Money in: salary, interest, refunds, people paying back. Not his own
  // money moving between his accounts, which is neither in nor out.
  const moneyIn = txns.filter(t => countsAsIncome(t))
    .reduce((s, t) => s + Number(t.amount), 0)

  // Totals roll up to the top-level category. Groceries and Delivery both
  // land under Food, because that is the number any decision turns on.
  // Anything spent on a trip counts as Travel here: the trip is why it was
  // spent. Each payment keeps its own category (Italy food is Eating out).
  const topOf = (t: Txn) => (trips.has(t.id) ? 'Travel' : topNameOf(t.category_id) ?? 'Uncategorised')
  const byCat = new Map<string, number>()
  for (const t of spend) byCat.set(topOf(t), (byCat.get(topOf(t)) ?? 0) + Number(t.amount))
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1])
  const countByCat = new Map<string, number>()
  for (const t of spend) countByCat.set(topOf(t), (countByCat.get(topOf(t)) ?? 0) + 1)

  // Fixed costs come round whatever you do. Variable spend is the rest.
  const fixedTotal = spend.filter(t => isFixed(nameOf(t.category_id), topNameOf(t.category_id)))
    .reduce((s, t) => s + Number(t.amount), 0)
  const variableTotal = total - fixedTotal

  const histRows = (hist ?? []) as { month: string; top_id: number | null; total: number }[]
  const histByMonth = new Map<string, number>()
  const prevByCat = new Map<string, number>()
  for (const r of histRows) {
    histByMonth.set(r.month, (histByMonth.get(r.month) ?? 0) + Number(r.total))
    if (r.month === month.prev) {
      const name = (r.top_id && catById.get(r.top_id)?.name) || 'Uncategorised'
      prevByCat.set(name, (prevByCat.get(name) ?? 0) + Number(r.total))
    }
  }
  const histMonths = [...histByMonth.values()].filter(v => v > 0)
  const average = histMonths.length ? histMonths.reduce((a, b) => a + b, 0) / histMonths.length : 0
  // A month still running is compared on what it has so far, which reads
  // as under average until the month is out. Said plainly in the line.
  const summary = total > 0 ? summaryLine({ total, average, byNow: byCat, byPrev: prevByCat }) : null

  const budgetByName = new Map<string, number>()
  for (const b of budgetRows ?? []) {
    const n = catById.get(b.category_id)?.name
    if (n) budgetByName.set(n, Number(b.monthly))
  }

  // Seeded from the household, not from who happens to have spent. Someone
  // who has logged nothing this month is a fact worth showing, and the old
  // version simply left them out, so the screen looked like a one-person app.
  const byPerson = new Map<string, { total: number; id: string | null }>()
  for (const p of household ?? []) byPerson.set(p.name, { total: 0, id: p.id })
  for (const t of spend) {
    const name = t.paid?.name ?? 'Unknown'
    const e = byPerson.get(name) ?? { total: 0, id: t.paid_by }
    e.total += Number(t.amount)
    byPerson.set(name, e)
  }
  const people = [...byPerson.entries()].sort((a, b) => b[1].total - a[1].total)
  const share = (n: number) => (total > 0 ? (n / total) * 100 : 0)

  // One short line under the total: against the usual month, nothing more.
  const vsAvg = average > 0 && !month.isCurrent ? total - average : null
  // A split payment shows once, at what the bank took, with its parts folded under it.
  const recentDays = new Map<string, ReturnType<typeof collapseSplits<Txn>>>()
  for (const t of collapseSplits(txns).slice(0, 30)) recentDays.set(t.occurred_on, [...(recentDays.get(t.occurred_on) ?? []), t])
  const pace = paceOf(month.key)

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 16 }}>
        {/* Silent failures the alarm job found (lib/alarms.ts), until they clear. */}
        {(alarms ?? []).map(a => (
          <section key={a.id} className="card" style={{ background: 'var(--warn)', color: '#fff' }}>
            <strong>Needs a look</strong>
            <p style={{ marginTop: 4 }}>{a.message}</p>
            {a.kind === 'gap' && (
              <form action={async () => { 'use server'; await closeGap(a.id) }} style={{ marginTop: 8 }}>
                <button type="submit" className="btn">Done, nothing else is missing</button>
              </form>
            )}
          </section>
        ))}
        <WhoToggle path="/" params={{ m }} who={who} />
        <MonthNav label={month.label} prev={month.prev} next={month.next} isCurrent={month.isCurrent} who={who} current={month.key} />
        <PhoneBanner />

        {categoriesUnreadable && (
          <section className="card" style={{ color: 'var(--caution)' }}>
            Categories did not load, so everything reads as Uncategorised.{' '}
            {catErr ? `The database said: ${catErr.message}` : 'The read came back empty, which usually means the session expired. Sign out and back in.'}
          </section>
        )}

        <section className="heroblock">
          <Link href={`/all?m=${month.key}${w}`} style={{ color: 'inherit' }}>
            <div className="big num"><span className="cur">₹</span>{Math.round(total).toLocaleString('en-IN')}</div>
          </Link>
          <div className="sub">
            spent{vsAvg !== null && <> · <b style={{ color: vsAvg <= 0 ? 'var(--positive)' : 'var(--caution)' }}>{inr(Math.abs(vsAvg))} {vsAvg <= 0 ? 'under' : 'over'}</b> your average</>}
            {month.isCurrent && ` · ${pace.daysLeft} day${pace.daysLeft === 1 ? '' : 's'} to go`}
          </div>
          {total > 0 && (
            <div className="bar" style={{ gap: 2, background: 'transparent' }}>
              {cats.map(([name, v]) => (
                <i key={name} style={{ width: `${(v / total) * 100}%`, background: hueFor(name), borderRadius: 3 }} />
              ))}
            </div>
          )}
        </section>

        <section className="stats">
          <Link prefetch className="stat" href={`/all?m=${month.key}&dir=credit${w}`}>
            <div className="k"><IconArrowDownLeft size={15} stroke={2} /> Came in</div>
            <div className="v" style={{ color: moneyIn ? 'var(--positive)' : undefined }}>{moneyIn ? `+${inr(moneyIn)}` : inr(0)}</div>
          </Link>
          <Link prefetch className="stat" href={`/claimable?m=${month.key}${w}`}>
            <div className="k"><IconReceipt2 size={15} stroke={2} /> Claimable</div>
            <div className="v">{inr(claimable)}</div>
          </Link>
          <Link prefetch className="stat" href={`/all?m=${month.key}&kind=fixed${w}`}>
            <div className="k"><IconHome size={15} stroke={2} /> Fixed</div>
            <div className="v">{inr(fixedTotal)}</div>
          </Link>
          <Link prefetch className="stat" href={`/all?m=${month.key}&kind=variable${w}`}>
            <div className="k"><IconSparkles size={15} stroke={2} /> Variable</div>
            <div className="v">{inr(variableTotal)}</div>
          </Link>
        </section>

        {investedTotal !== 0 && (
          <Link prefetch className="stat" href={`/investments?m=${month.key}${w}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CatIcon name="Investments" size={30} />
            <div style={{ flex: 1 }}>
              <div className="k">Invested, not spending</div>
              <div className="v">{inr(investedTotal)}</div>
            </div>
            <IconChevronRight size={20} />
          </Link>
        )}

        <section>
          <div className="section-h">
            <h2>Categories</h2>
            <Link href="/budgets">{budgetByName.size ? 'Budgets' : 'Set budgets'}</Link>
          </div>
          <div className="card" style={{ paddingBlock: 6 }}>
            {cats.map(([name, v]) => {
              const id = topIdByName.get(name)
              const limit = budgetByName.get(name)
              const { used, state } = budgetState(v, limit ?? 0, pace.share)
              const tone = state === 'over' ? 'var(--negative)' : state === 'ahead' ? 'var(--caution)' : hueFor(name)
              const n = countByCat.get(name) ?? 0
              const inner = (
                <>
                  <CatIcon name={name} />
                  <div className="mid">
                    <div className="t">{name}</div>
                    {limit ? (
                      <>
                        <div className="s" style={{ color: state !== 'fine' ? tone : undefined }}>
                          {state === 'over' ? `${inr(v - limit)} over budget` : `${inr(limit - v)} left of ${inr(limit)}`}
                        </div>
                        <div className="thin"><i style={{ width: `${Math.min(100, used * 100)}%`, background: tone }} />{month.isCurrent && <b style={{ left: `${pace.share * 100}%` }} />}</div>
                      </>
                    ) : <div className="s">{n} payment{n === 1 ? '' : 's'}</div>}
                  </div>
                  <div className="a">{inr(v)}</div>
                </>
              )
              return id
                ? <Link prefetch className="irow" key={name} href={`/c/${id}?m=${month.key}${w}`}>{inner}</Link>
                : <div className="irow" key={name}>{inner}</div>
            })}
            {cats.length === 0 && <div className="empty">Nothing spent in {month.label} yet.</div>}
          </div>
        </section>

        {!who && people.length > 1 && total > 0 && (
          <section className="card">
            <div className="label">Who paid</div>
            <div className="split" style={{ marginTop: 10 }}>
              {people.map(([name, e], i) => <i key={name} style={{ width: `${share(e.total)}%`, background: i === 0 ? 'var(--hue-1)' : 'var(--hue-7)' }} />)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
              {people.map(([name, e], i) => (
                e.id
                  ? <Link key={name} href={`/p/${e.id}?m=${month.key}`} style={{ color: 'inherit' }}>
                      <div className="s" style={{ fontSize: 12, fontWeight: 600, color: i === 0 ? 'var(--hue-1)' : 'var(--hue-7)' }}>{name}</div>
                      <div className="num" style={{ fontWeight: 700, color: 'var(--page-text)' }}>{inr(e.total)}</div>
                    </Link>
                  : <div key={name}><div style={{ fontSize: 12 }}>{name}</div><div className="num">{inr(e.total)}</div></div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="section-h">
            <h2>Recent</h2>
            <Link href={`/all?m=${month.key}${w}`}>See all</Link>
          </div>
          <div className="card" style={{ paddingBlock: 6 }}>
            {[...recentDays.entries()].map(([d, list]) => (
              <div key={d}>
                <div className="dayhead" style={{ background: 'transparent', backdropFilter: 'none', position: 'static' }}><span>{dayLabel(d)}</span></div>
                {list.map(t => (
                  <Fragment key={t.id}>
                  <Link className="irow" href={`/t/${t.id}`}>
                    <CatIcon name={nameOf(t.category_id) ?? 'Uncategorised'} group={topNameOf(t.category_id)} />
                    <div className="mid">
                      <div className="t">{t.merchant ?? t.merchant_key ?? 'Unknown'}</div>
                      <div className="s">
                        {t.scope === 'transfer' ? 'Between your accounts' : nameOf(t.category_id) ?? 'No category'}{t.paid?.name ? ` · ${t.paid.name}` : ''}
                        {t.scope === 'claimable' && ' · claimable'}{t.scope === 'investment' && ' · investment'}{t.scope === 'transfer' && ' · transfer, not spending'}
                      </div>
                    </div>
                    <div className={`a${t.scope === 'transfer' ? ' xfer' : t.direction === 'credit' ? ' in' : ''}`}>{t.scope === 'transfer' ? '⇄ ' : t.direction === 'credit' ? '+' : ''}{inr(t.shown)}{t.occurred_at && <small>{timeLabel(t.occurred_at)}</small>}</div>
                  </Link>
                  {t.parts && <SplitParts parts={t.parts} label={id => nameOf(id) ?? 'No category'} month={month.key} />}
                  </Fragment>
                ))}
              </div>
            ))}
            {txns.length === 0 && <div className="empty">Nothing logged in {month.label}.</div>}
          </div>
        </section>

        {month.isCurrent && new Date().getDate() <= 7 && (
          <Link prefetch className="stat" href={`/summary/${month.prev}`} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}><div className="k">{monthRange(month.prev).label}</div><div className="v" style={{ fontSize: 16 }}>Read the month summary</div></div>
            <IconChevronRight size={20} />
          </Link>
        )}
      </main>
    </>
  )
}

/** One person's spending by month and top category, in the same shape as the
 *  household totals the database gives, so the averages work the same way. */
async function personHistory(supabase: SupabaseClient, who: string, from: string, to: string) {
  const [{ data: rows }, { data: cats }] = await Promise.all([
    supabase.from('transactions').select('amount, direction, scope, category_id, occurred_on')
      .eq('paid_by', who).gte('occurred_on', from).lte('occurred_on', to)
      .neq('status', 'duplicate').neq('status', 'ignored').limit(10000),
    supabase.from('categories').select('id, name, parent_id'),
  ])
  const tree = catTree(cats ?? [])
  const parent = new Map((cats ?? []).map(c => [c.id, tree.root(c.id)?.id ?? c.id]))
  const sums = new Map<string, { month: string; top_id: number | null; total: number }>()
  for (const r of (rows ?? []) as { amount: number; direction: string; scope: string; category_id: number | null; occurred_on: string }[]) {
    if (!countsAsSpend(r)) continue
    const top = r.category_id ? parent.get(r.category_id) ?? r.category_id : null
    const k = `${r.occurred_on.slice(0, 7)}|${top}`
    const e = sums.get(k) ?? { month: r.occurred_on.slice(0, 7), top_id: top, total: 0 }
    e.total += Number(r.amount); sums.set(k, e)
  }
  return { data: [...sums.values()] }
}
