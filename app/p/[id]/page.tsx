import Link from 'next/link'
import { supabaseServer } from '../../../lib/supabase/server'
import { catTree } from '../../../lib/cats'
import { Nav } from '../../nav'
import { inr, dayLabel, monthRange, pct } from '../../../lib/format'
import { notFound } from 'next/navigation'
import { countsAsSpend } from '../../../lib/scope'

export const dynamic = 'force-dynamic'

type Row = {
  id: string; amount: number; direction: 'debit' | 'credit'; occurred_on: string
  merchant: string | null; merchant_key: string | null; scope: string; category_id: number | null
}

export default async function Person({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ m?: string }>
}) {
  const { id } = await params
  const { m } = await searchParams
  const month = monthRange(m)
  const supabase = await supabaseServer()

  const [{ data: person }, { data }, { data: cats }, { count: reviewCount }] = await Promise.all([
    supabase.from('people').select('id, name').eq('id', id).maybeSingle(),
    supabase.from('transactions')
      .select('id, amount, direction, occurred_on, merchant, merchant_key, scope, category_id')
      .eq('paid_by', id).gte('occurred_on', month.from).lte('occurred_on', month.to)
      .neq('status', 'duplicate').neq('status', 'ignored')
      .order('occurred_on', { ascending: false }),
    supabase.from('categories').select('id, name, parent_id'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])
  if (!person) notFound()

  const all = cats ?? []
  const tree = catTree(all)
  const topOf = (cid: number | null) => tree.root(cid)?.name ?? 'Uncategorised'

  const rows = (data ?? []) as Row[]
  const spend = rows.filter(r => countsAsSpend(r))
  const total = spend.reduce((s, r) => s + Number(r.amount), 0)
  const claimable = rows.filter(r => r.scope === 'claimable').reduce((s, r) => s + Number(r.amount), 0)
  const cameIn = rows.filter(r => r.direction === 'credit').reduce((s, r) => s + Number(r.amount), 0)

  // Name back to id, so a row can link to its own category. Without this the
  // breakdown was a dead end: you could see Rent was the biggest and had no way
  // to ask what was in it.
  const topIdByName = new Map<string, number>()
  for (const c of tree.roots()) topIdByName.set(c.name, c.id)

  const byCat = new Map<string, number>()
  for (const r of spend) byCat.set(topOf(r.category_id), (byCat.get(topOf(r.category_id)) ?? 0) + Number(r.amount))
  const cats2 = [...byCat.entries()].sort((a, b) => b[1] - a[1])
  const biggest = cats2[0]?.[1] || 1

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 18 }}>
        <section className="card hero">
          <div className="monthnav">
            <Link className="chip" href={`/p/${id}?m=${month.prev}`}>‹</Link>
            <span className="label" style={{ margin: 0 }}>{person.name} · {month.label}</span>
            {month.isCurrent
              ? <span className="chip" style={{ opacity: .3 }}>›</span>
              : <Link className="chip" href={`/p/${id}?m=${month.next}`}>›</Link>}
          </div>
          <div className="big num" style={{ marginTop: 6 }}>{inr(total)}</div>
          <div className="sub">
            {spend.length} transaction{spend.length === 1 ? '' : 's'} paid
            {claimable > 0 && `, plus ${inr(claimable)} claimable`}
            {cameIn > 0 && `, and ${inr(cameIn)} in`}
          </div>
        </section>

        <section className="card">
          <h2>What they paid for</h2>
          <div className="rows" style={{ marginTop: 8 }}>
            {cats2.map(([name, v]) => {
              const cid = topIdByName.get(name)
              const inner = (
                <>
                  <div>
                    <div className="name">{name}</div>
                    <div className="meter"><i style={{ width: `${(v / biggest) * 100}%` }} /></div>
                  </div>
                  <div className="amt num">{inr(v)}<div className="who" style={{ textAlign: 'right' }}>{pct(v, cats2.reduce((s, [, x]) => s + x, 0))}</div></div>
                </>
              )
              return cid
                ? <Link className="row rowlink" key={name} href={`/c/${cid}?m=${month.key}`}>{inner}</Link>
                : <div className="row" key={name}>{inner}</div>
            })}
            {cats2.length === 0 && <div className="empty">Nothing in {month.label}.</div>}
          </div>
        </section>

        <section className="card">
          <h2>Every one</h2>
          <div className="rows" style={{ marginTop: 6 }}>
            {rows.map(r => (
              <Link className="row rowlink" key={r.id} href={`/t/${r.id}`}>
                <div>
                  <div className="name">{r.merchant ?? r.merchant_key ?? 'Unknown'}</div>
                  <div className="who">
                    {dayLabel(r.occurred_on)} · {r.scope === 'transfer' ? 'Transfer, not spending' : topOf(r.category_id)}
                    {r.scope === 'claimable' && <span className="tag claim" style={{ marginLeft: 8 }}>claimable</span>}
                  </div>
                </div>
                <div className={`amt num${r.scope === 'transfer' ? ' xfer' : r.direction === 'credit' ? ' credit' : ''}`}>
                  {r.scope === 'transfer' ? '⇄ ' : r.direction === 'credit' ? '+' : ''}{inr(Number(r.amount))}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
