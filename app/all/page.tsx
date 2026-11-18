import Link from 'next/link'
import { WhoToggle } from '../whotoggle'
import { PEOPLE } from '../../lib/drill'
import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { inr, dayLabel, timeLabel, monthRange, rowTitle, categoryIsRedundant } from '../../lib/format'
import { isFixed } from '../../lib/insights'
import { countsAsIncome, countsAsSpend } from '../../lib/scope'
import { CatIcon } from '../caticon'
import { PeriodNav } from '../periodnav'
import { catTree } from '../../lib/cats'
import { collapseSplits } from '../../lib/splits'
import { SplitParts } from '../splitparts'
import { Fragment } from 'react'

export const dynamic = 'force-dynamic'

type Row = {
  id: string; amount: number; direction: 'debit' | 'credit'; occurred_on: string; occurred_at?: string | null
  merchant: string | null; merchant_key: string | null; scope: string; status: string
  category_id: number | null; bank: string | null
  paid: { name: string } | null
  split_of?: string | null; split_total?: number | null
}

const SCOPES = [
  { v: '', label: 'Everything' },
  { v: 'household', label: 'Household' },
  { v: 'claimable', label: 'Claimable' },
  { v: 'investment', label: 'Investments' },
  { v: 'transfer', label: 'Own transfers' },
]

export default async function All({ searchParams }: {
  searchParams: Promise<{ m?: string; scope?: string; cat?: string; dir?: string; kind?: string; who?: string }>
}) {
  const sp = await searchParams
  const month = monthRange(sp.m)
  const supabase = await supabaseServer()

  let query = supabase.from('transactions')
    .select('id, amount, direction, occurred_on, occurred_at, merchant, merchant_key, scope, status, category_id, bank, split_of, split_total, paid:people!transactions_paid_by_fkey(name)')
    .gte('occurred_on', month.from).lte('occurred_on', month.to)
    .neq('status', 'duplicate').neq('status', 'ignored')
    .order('occurred_on', { ascending: false }).order('occurred_at', { ascending: false, nullsFirst: false }).limit(500)

  if (sp.scope) query = query.eq('scope', sp.scope)
  if (sp.dir) query = query.eq('direction', sp.dir)
  if (sp.cat) query = query.eq('category_id', Number(sp.cat))
  const who = sp.who && PEOPLE[sp.who] ? sp.who : null
  if (who) query = query.eq('paid_by', who)

  const [{ data }, { data: cats }, { count: reviewCount }] = await Promise.all([
    query,
    supabase.from('categories').select('id, name, parent_id').order('name'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])

  const all = cats ?? []
  const tree = catTree(all)
  const nameOf = (cid: number | null) => tree.name(cid)
  const topOf = (cid: number | null) => tree.root(cid)?.name ?? null
  // Fixed and variable are the Month screen's split: spending only, sorted by
  // whether the category comes round every month.
  const rows = ((data ?? []) as unknown as Row[]).filter(r => {
    // 'chosen' was the old name for variable; old links still work.
    if (sp.kind !== 'fixed' && sp.kind !== 'variable' && sp.kind !== 'chosen') return true
    if (!countsAsSpend(r)) return false
    return isFixed(nameOf(r.category_id), topOf(r.category_id)) === (sp.kind === 'fixed')
  })
  const label = (cid: number | null) => tree.label(cid) || 'Uncategorised'

  // Money moving between the two of them, or between one person's own
  // accounts, is listed but never added into money out or money in.
  const out = rows.filter(r => countsAsSpend(r)).reduce((s, r) => s + Number(r.amount), 0)
  const inn = rows.filter(r => countsAsIncome(r)).reduce((s, r) => s + Number(r.amount), 0)

  const withParam = (k: string, v: string) => {
    const next = new URLSearchParams({ m: month.key })
    for (const [key, val] of Object.entries(sp)) if (val && key !== 'm') next.set(key, String(val))
    v ? next.set(k, v) : next.delete(k)
    return `/all?${next.toString()}`
  }

  // One entry per day, newest first, each holding that day's rows in order.
  // A split payment shows once, at what the bank took, its parts folded under
  // it. The day's total still adds up the parts themselves.
  const byDay = new Map<string, ReturnType<typeof collapseSplits<Row>>>()
  for (const r of collapseSplits(rows)) {
    const list = byDay.get(r.occurred_on) ?? []
    list.push(r)
    byDay.set(r.occurred_on, list)
  }
  const days = [...byDay.entries()]

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 14 }}>
        <WhoToggle path="/all" params={{ m: sp.m, scope: sp.scope, cat: sp.cat, dir: sp.dir, kind: sp.kind }} who={who} />
        <div>
          <h1>Everything</h1>
          <p className="sub" style={{ marginTop: 4 }}>
            {rows.length} row{rows.length === 1 ? '' : 's'} · {inr(out)} out
            {inn > 0 && ` · ${inr(inn)} in`}
          </p>
        </div>

        <section className="card">
          <PeriodNav label={month.label} prevHref={withParam('m', month.prev)} nextHref={month.isCurrent ? null : withParam('m', month.next)}
            jump={{ template: withParam('m', '__K__'), mode: 'month', current: month.key, format: 'ym' }} />

          <div className="label" style={{ marginTop: 16 }}>Scope</div>
          <div className="chips">
            {SCOPES.map(s => (
              <Link key={s.v} href={withParam('scope', s.v)}
                className={`chip${(sp.scope ?? '') === s.v ? ' sel' : ''}`}>{s.label}</Link>
            ))}
          </div>

          <div className="label" style={{ marginTop: 16 }}>Direction</div>
          <div className="chips">
            {[{ v: '', label: 'Both' }, { v: 'debit', label: 'Out' }, { v: 'credit', label: 'In' }].map(d => (
              <Link key={d.v} href={withParam('dir', d.v)}
                className={`chip${(sp.dir ?? '') === d.v ? ' sel' : ''}`}>{d.label}</Link>
            ))}
          </div>

          {sp.kind && (
            <>
              <div className="label" style={{ marginTop: 16 }}>Showing</div>
              <div className="chips">
                <Link href={withParam('kind', '')} className="chip sel">{sp.kind === 'fixed' ? 'Fixed costs' : 'Variable spend'} ✕</Link>
              </div>
            </>
          )}

          {sp.cat && (
            <>
              <div className="label" style={{ marginTop: 16 }}>Category</div>
              <div className="chips">
                <Link href={withParam('cat', '')} className="chip sel">{label(Number(sp.cat))} ✕</Link>
              </div>
            </>
          )}
        </section>

        <section className="card">
          {/* Grouped by day. The date was repeated on every single row, which is
              most of what made a long list hard to read, and it carries the
              day's total for free. */}
          {days.map(([date, ofDay]) => (
            <div className="day" key={date}>
              <div className="dayhead">
                <span>{dayLabel(date)}</span>
                {(() => {
                  // Net for the day: what went out, and what came in if anything did.
                  const each = ofDay.flatMap(r => r.parts ?? [r])
                  const out = each.reduce((s, r) => s + (countsAsSpend(r) ? Number(r.amount) : 0), 0)
                  const inn = each.reduce((s, r) => s + (countsAsIncome(r) ? Number(r.amount) : 0), 0)
                  return <span className="num">{out ? `−${inr(out)}` : ''}{out && inn ? '  ' : ''}{inn ? <span className="credit">+{inr(inn)}</span> : ''}</span>
                })()}
              </div>
              <div className="rows">
                {ofDay.map(r => {
                  const cat = label(r.category_id)
                  return (
                    <Fragment key={r.id}>
                    <Link className="row rowlink" href={`/t/${r.id}`}>
                      <div className="withicon">
                        <CatIcon name={nameOf(r.category_id) ?? 'Uncategorised'} group={topOf(r.category_id) ?? 'Uncategorised'} />
                        <div>
                        <div className="name">{rowTitle(r.merchant ?? r.merchant_key, cat)}</div>
                        <div className="who">
                          {r.occurred_at && <>{timeLabel(r.occurred_at)} · </>}
                          {!categoryIsRedundant(r.merchant ?? r.merchant_key, cat) && <>{cat} · </>}
                          {r.paid?.name ?? '?'}
                          {r.scope === 'claimable' && <span className="tag claim">claimable</span>}
                          {r.scope === 'investment' && <span className="tag">investment</span>}
                          {r.scope === 'transfer' && <span className="tag">transfer, not spending</span>}
                          {r.status === 'review' && ' · in Review'}
                        </div>
                        </div>
                      </div>
                      <div className={`amt num${r.scope === 'transfer' ? ' xfer' : r.direction === 'credit' ? ' credit' : ''}`}>
                        {r.scope === 'transfer' ? '⇄ ' : r.direction === 'credit' ? '+' : ''}{inr(r.shown)}
                      </div>
                    </Link>
                    {r.parts && <SplitParts parts={r.parts} label={label} month={month.key} />}
                    </Fragment>
                  )
                })}
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="empty">Nothing matches.</div>}
        </section>
      </main>
    </>
  )
}
