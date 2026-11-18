import Link from 'next/link'
import { supabaseServer } from '../../../lib/supabase/server'
import { catTree } from '../../../lib/cats'
import { Nav } from '../../nav'
import { inr, inrShort, dayLabel } from '../../../lib/format'
import { notFound } from 'next/navigation'
import { countsAsSpend } from '../../../lib/scope'
import { CatIcon } from '../../caticon'
import { Crumbs, type Crumb } from '../../crumbs'
import { WhoToggle } from '../../whotoggle'
import { ctxQuery, periodCrumb, personNote, type Ctx } from '../../../lib/drill'
import { IconChevronRight } from '@tabler/icons-react'
import { collapseSplits } from '../../../lib/splits'
import { SplitParts } from '../../splitparts'
import { Fragment } from 'react'

export const dynamic = 'force-dynamic'

type Row = {
  id: string; amount: number; direction: 'debit' | 'credit'; occurred_on: string
  merchant: string | null; scope: string; status: string; category_id: number | null; paid_by?: string | null; note?: string | null
  split_of?: string | null; split_total?: number | null
}

/**
 * One payee: what it has cost in total, the last twelve months as bars, how it
 * files itself, and every payment grouped by month with the year shown, so
 * three Octobers from three years can no longer read as one.
 */
export default async function Merchant({ params, searchParams }: {
  params: Promise<{ key: string }>
  searchParams: Promise<Ctx>
}) {
  const { key } = await params
  const ctx = await searchParams
  const merchantKey = decodeURIComponent(key)
  const supabase = await supabaseServer()

  // Opened by name: every payment shown under that name, whatever key the
  // bank used. Opened by key alone: that key.
  const base = supabase.from('transactions')
    .select('id, amount, direction, occurred_on, merchant, scope, status, category_id, paid_by, note, split_of, split_total')
  const [{ data }, { data: cats }, { data: rule }, { count: reviewCount }] = await Promise.all([
    (ctx.n ? base.ilike('merchant', ctx.n.replace(/[%_\\]/g, c => '\\' + c)) : base.eq('merchant_key', merchantKey)).neq('status', 'duplicate').neq('status', 'ignored')
      .order('occurred_on', { ascending: false }),
    supabase.from('categories').select('id, name, parent_id'),
    supabase.from('merchant_rules').select('id, merchant, category_id, default_scope').eq('match_key', merchantKey).eq('rule_shape', 'exact||||').maybeSingle(),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])

  // A generic key ("ACCOUNT") covers many people; the name says which one.
  const rows = ((data ?? []) as Row[]).filter(r => (!ctx.who || r.paid_by === ctx.who))
  if ((data ?? []).length === 0) notFound()

  const all = cats ?? []
  const cat = (id: number | null) => (id ? all.find(x => x.id === id) ?? null : null)
  const tree = catTree(all)
  const top = (id: number | null) => tree.root(id)
  const label = (id: number | null) => tree.label(id) || 'No category'

  const spend = rows.filter(r => countsAsSpend(r))
  const total = spend.reduce((s, r) => s + Number(r.amount), 0)
  // A split payment is one payment, however many parts it has.
  const paymentCount = collapseSplits(spend).length
  const average = paymentCount ? total / paymentCount : 0
  const first = rows[rows.length - 1]?.occurred_on
  const name = rows.find(r => r.merchant)?.merchant ?? merchantKey
  // The category most of these are filed under, for the header icon.
  const commonCat = rows.map(r => r.category_id).filter(Boolean).sort((a, b) =>
    rows.filter(r => r.category_id === b).length - rows.filter(r => r.category_id === a).length)[0] ?? null

  // The trail up: the period it was opened from (this month if none), the
  // category it was opened from (else the one it is mostly filed under), and
  // that category's group above it.
  const period: Ctx = ctx.y || ctx.m ? { y: ctx.y, m: ctx.m, who: ctx.who } : { m: new Date().toISOString().slice(0, 7) }
  const trailCat = cat(ctx.c ? Number(ctx.c) : commonCat)
  const trailUp = tree.path(trailCat?.id).slice(0, -1)
  const catLink = (id: number | null) => (id ? `/c/${id}${ctxQuery(period)}` : null)
  const trail: Crumb[] = [
    periodCrumb(period)!,
    ...trailUp.map(a => ({ label: a.name, href: catLink(a.id)! })),
    ...(trailCat ? [{ label: trailCat.name, href: catLink(trailCat.id)! }] : []),
    { label: name },
  ]

  const now = new Date()
  const months: { key: string; label: string; value: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-IN', { month: 'narrow' }), value: 0 })
  }
  for (const r of spend) { const m = months.find(x => x.key === r.occurred_on.slice(0, 7)); if (m) m.value += Number(r.amount) }
  const peak = Math.max(1, ...months.map(m => m.value))
  const yearTotal = months.reduce((s, m) => s + m.value, 0)

  const byMonth = new Map<string, ReturnType<typeof collapseSplits<Row>>>()
  for (const r of collapseSplits(rows)) byMonth.set(r.occurred_on.slice(0, 7), [...(byMonth.get(r.occurred_on.slice(0, 7)) ?? []), r])
  const monthName = (k: string) => new Date(k + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 16 }}>
        <Crumbs fallback={catLink(trailCat?.id ?? null) ?? '/'} trail={trail} />
        <WhoToggle path={`/m/${encodeURIComponent(merchantKey)}`} params={{ y: ctx.y, m: ctx.m, c: ctx.c, n: ctx.n }} who={ctx.who} />
        <div className="irow" style={{ paddingTop: 0 }}>
          <CatIcon name={cat(commonCat)?.name ?? 'Uncategorised'} group={top(commonCat)?.name} size={44} />
          <div className="mid"><h1 style={{ fontSize: 22 }}>{name}</h1></div>
        </div>

        <section className="heroblock" style={{ paddingTop: 4 }}>
          <div className="big num"><span className="cur">₹</span>{Math.round(total).toLocaleString('en-IN')}</div>
          <div className="sub">
            {paymentCount} payment{paymentCount === 1 ? '' : 's'}{first && ` since ${dayLabel(first)}`}
            {paymentCount > 1 && ` · about ${inr(average)} each`}
          </div>
        </section>

        {yearTotal > 0 && (
          <section className="card">
            <div className="label">Last 12 months · {inr(yearTotal)}</div>
            <div className="bars" style={{ height: 120 }}>
              {months.map(m => (
                <div key={m.key} title={`${m.key}: ${inr(m.value)}`}>
                  <span className="col"><i style={{ height: `${(m.value / peak) * 100}%`, opacity: m.value ? 1 : .25 }} /></span>
                  <b className="cap">{m.label}</b>
                </div>
              ))}
            </div>
            <div className="sub" style={{ marginTop: 6 }}>Highest month {inrShort(peak)}</div>
          </section>
        )}

        <Link className="stat" href="/rules" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="k">Files itself as</div>
            <div className="v" style={{ fontSize: 16 }}>
              {rule ? `${label(rule.category_id)}${rule.default_scope === 'claimable' ? ' · claimable' : ''}` : 'Not set yet, file one in Review'}
            </div>
          </div>
          <IconChevronRight size={20} />
        </Link>

        {[...byMonth.entries()].map(([k, list]) => (
          <section key={k}>
            <div className="section-h">
              <span className="label">{monthName(k)}</span>
              <span className="label">{inr(list.flatMap(r => r.parts ?? [r]).filter(r => countsAsSpend(r)).reduce((s, r) => s + Number(r.amount), 0))}</span>
            </div>
            <div className="card" style={{ paddingBlock: 4 }}>
              {list.map(r => (
                <Fragment key={r.id}>
                <Link className="irow" href={`/t/${r.id}${ctxQuery({ ...period, c: trailCat ? String(trailCat.id) : undefined, k: merchantKey } as Ctx)}`}>
                  <CatIcon name={cat(r.category_id)?.name ?? 'Uncategorised'} group={top(r.category_id)?.name} />
                  <div className="mid">
                    <div className="t">{dayLabel(r.occurred_on)}</div>
                    <div className="s">
                      {label(r.category_id)}{r.scope === 'claimable' && ' · claimable'}{r.status === 'review' && ' · in Review'}{personNote(r.note) && ` · ${personNote(r.note)}`}
                    </div>
                  </div>
                  <div className={`a${r.direction === 'credit' ? ' in' : ''}`}>{r.direction === 'credit' ? '+' : ''}{inr(r.shown)}</div>
                </Link>
                {r.parts && <SplitParts parts={r.parts} label={label} month={k} />}
                </Fragment>
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  )
}
