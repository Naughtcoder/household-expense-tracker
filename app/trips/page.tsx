import Link from 'next/link'
import { supabaseServer } from '../../lib/supabase/server'
import { catTree } from '../../lib/cats'
import { Nav } from '../nav'
import { Crumbs } from '../crumbs'
import { inr } from '../../lib/format'
import { DEPOSIT_CATEGORY } from '../../lib/scope'
import { isTripTag } from '../../lib/trips'
import { IconChevronRight, IconPlane, IconTag } from '@tabler/icons-react'

export const dynamic = 'force-dynamic'

/** What a trip or tag cost: every payment out, employer-claimable ones included,
 *  but never money moved to your own account, invested, or put down as a deposit. */
const costs = (t: { direction: string; scope: string; category_id: number | null }) =>
  t.direction === 'debit' && t.scope !== 'transfer' && t.scope !== 'investment' && t.category_id !== DEPOSIT_CATEGORY

type Tagged = { tag_id: number; t: { amount: number; direction: string; scope: string; category_id: number | null; occurred_on: string; status: string } | null }
type Cat = { id: number; name: string; parent_id: number | null }

/** The few things a trip's money goes on, in one fixed order and colour. */
const PARTS = [
  { key: 'Flights', color: 'var(--hue-1)' },
  { key: 'Stays', color: 'var(--hue-4)' },
  { key: 'Food', color: 'var(--hue-2)' },
  { key: 'Getting around', color: 'var(--hue-6)' },
  { key: 'Activities', color: 'var(--hue-8)' },
  { key: 'Shopping', color: 'var(--hue-7)' },
  { key: 'Cash', color: 'var(--hue-14)' },
  { key: 'Health', color: 'var(--hue-9)' },
  { key: 'Visas', color: 'var(--hue-5)' },
  { key: 'Other', color: 'var(--hue-16)' },
] as const
type Part = typeof PARTS[number]['key']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const tripWhen = (name: string) => { const m = name.match(/, ([A-Z][a-z]{2}) (\d{4})/); return m ? { y: Number(m[2]), m: MONTHS.indexOf(m[1]) } : null }
const place = (name: string) => name.split(',')[0].trim()
const extra = (name: string) => (name.match(/\(([^)]+)\)\s*$/)?.[1] ?? null)
const short = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MONTHS[d.getMonth()]}` }

/**
 * Trips, grouped by year, newest first: what each cost and what it went on
 * (flights, stays, food, getting around, shopping), with the dates you were
 * away. Other tags (Holiday, ExpenseCard, Moving house) are listed apart, below.
 */
export default async function Trips() {
  const supabase = await supabaseServer()
  const [{ data: tags }, { data: links }, { data: cats }, { count: reviewCount }] = await Promise.all([
    supabase.from('tags').select('id, name').eq('archived', false),
    supabase.from('transaction_tags').select('tag_id, t:transactions(amount, direction, scope, category_id, occurred_on, status)').limit(10000),
    supabase.from('categories').select('id, name, parent_id'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])
  const all = (cats ?? []) as Cat[]
  const byId = new Map(all.map(c => [c.id, c]))
  const tree = catTree(all)
  const top = (id: number | null) => tree.root(id)
  const partOf = (id: number | null): Part => {
    const c = id ? byId.get(id) : null
    const n = c?.name ?? '', t = top(id)?.name ?? ''
    if (n === 'Flights') return 'Flights'
    if (['Hotels', 'Hotel'].includes(n) || t === 'Hotel') return 'Stays'
    if (t === 'Food') return 'Food'
    if (['Transportation', 'Taxi', 'Local Transport', 'Car', 'Fuel', 'Parking', 'Toll'].includes(n) || t === 'Transportation') return 'Getting around'
    if (t === 'Apparel' || ['Electronics', 'Gifts'].includes(n)) return 'Shopping'
    if (n === 'Forex') return 'Cash'
    if (n === 'Visas') return 'Visas'
    if (t === 'Health') return 'Health'
    if (n === 'Travel' || t === 'Entertainment' || t === 'Culture' || n === 'Entertainment' || n === 'Culture') return 'Activities'
    return 'Other'
  }

  type Agg = { total: number; n: number; first: string; last: string; awayFirst: string; awayLast: string; parts: Record<Part, number> }
  const blank = (): Agg => ({ total: 0, n: 0, first: '', last: '', awayFirst: '', awayLast: '', parts: Object.fromEntries(PARTS.map(p => [p.key, 0])) as Record<Part, number> })
  const byTag = new Map<number, Agg>()
  for (const l of (links ?? []) as unknown as Tagged[]) {
    const t = l.t
    if (!t || t.status === 'duplicate' || t.status === 'ignored' || !costs(t)) continue
    const e = byTag.get(l.tag_id) ?? blank()
    const a = Number(t.amount), part = partOf(t.category_id)
    e.total += a; e.n += 1; e.parts[part] += a
    if (!e.first || t.occurred_on < e.first) e.first = t.occurred_on
    if (!e.last || t.occurred_on > e.last) e.last = t.occurred_on
    // The days away: everything but tickets and bookings made in advance.
    if (part !== 'Flights' && part !== 'Stays') {
      if (!e.awayFirst || t.occurred_on < e.awayFirst) e.awayFirst = t.occurred_on
      if (!e.awayLast || t.occurred_on > e.awayLast) e.awayLast = t.occurred_on
    }
    byTag.set(l.tag_id, e)
  }

  const items = (tags ?? []).map(t => ({ ...t, ...(byTag.get(t.id) ?? blank()) }))
  const trips = items.filter(t => isTripTag(t.name)).sort((a, b) => {
    const x = tripWhen(a.name)!, y = tripWhen(b.name)!
    return (y.y * 12 + y.m) - (x.y * 12 + x.m)
  })
  const others = items.filter(t => !isTripTag(t.name)).sort((a, b) => b.total - a.total)
  const years = [...new Set(trips.map(t => tripWhen(t.name)!.y))].sort((a, b) => b - a)
  const thisYear = new Date().getFullYear()
  const yearTotal = trips.filter(t => tripWhen(t.name)!.y === thisYear).reduce((s, t) => s + t.total, 0)
  const yearCount = trips.filter(t => tripWhen(t.name)!.y === thisYear).length

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 16 }}>
        <Crumbs fallback="/" trail={[{ label: 'Home', href: '/' }, { label: 'Trips' }]} />

        <section className="heroblock" style={{ paddingTop: 0 }}>
          <div className="sub">Trips in {thisYear}</div>
          <div className="big num"><span className="cur">₹</span>{Math.round(yearTotal).toLocaleString('en-IN')}</div>
          <div className="sub">{yearCount} trip{yearCount === 1 ? '' : 's'} · flights, stays and everything spent while away</div>
          <div className="chips" style={{ justifyContent: 'center', marginTop: 10 }}>
            {PARTS.map(p => <span key={p.key} className="who" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 8, height: 8, borderRadius: 4, background: p.color, display: 'inline-block' }} />{p.key}</span>)}
          </div>
        </section>

        {years.map(y => {
          const list = trips.filter(t => tripWhen(t.name)!.y === y)
          const sum = list.reduce((s, t) => s + t.total, 0)
          return (
            <section key={y} className="grid" style={{ gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px' }}>
                <h2>{y}</h2>
                <span className="num sub">{inr(sum)}</span>
              </div>
              {list.map(t => {
                const who = extra(t.name)
                const s = t.awayFirst || t.first, e = t.awayLast || t.last
                return (
                  <Link key={t.id} href={`/trips/${t.id}`} className="card" style={{ display: 'block', color: 'inherit' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--surface-raised)', flex: 'none' }}><IconPlane size={20} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="name" style={{ fontSize: 16 }}>{place(t.name)}{who && <span className="who"> · {who}</span>}</div>
                        <div className="who">{t.n ? `${short(s)}${s !== e ? ` to ${short(e)}` : ''} · ${t.n} payment${t.n === 1 ? '' : 's'}` : 'Nothing tagged yet'}</div>
                      </div>
                      <div className="num" style={{ fontWeight: 700, fontSize: 16 }}>{inr(t.total)}</div>
                      <IconChevronRight size={18} className="chev" />
                    </div>
                    {t.total > 0 && (
                      <>
                        <div className="split" style={{ marginTop: 12 }}>
                          {PARTS.map(p => t.parts[p.key] > 0 && <i key={p.key} style={{ width: `${(t.parts[p.key] / t.total) * 100}%`, background: p.color }} />)}
                        </div>
                        <div className="who" style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                          {PARTS.filter(p => t.parts[p.key] > 0).map(p => <span key={p.key}>{p.key} {inr(t.parts[p.key])}</span>)}
                        </div>
                      </>
                    )}
                  </Link>
                )
              })}
            </section>
          )
        })}

        {others.length > 0 && (
          <section className="card">
            <h2>Other tags</h2>
            <div className="rows" style={{ marginTop: 6 }}>
              {others.map(t => (
                <Link className="irow" key={t.id} href={`/trips/${t.id}`}>
                  <IconTag size={18} />
                  <div className="mid">
                    <div className="name">{t.name}</div>
                    <div className="who">{t.n ? `${t.n} payment${t.n === 1 ? '' : 's'}` : 'Nothing tagged yet'}</div>
                  </div>
                  <div className="amt num">{inr(t.total)}</div>
                  <IconChevronRight size={18} className="chev" />
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  )
}
