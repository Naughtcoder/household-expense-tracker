import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseServer } from '../../../lib/supabase/server'
import { catTree } from '../../../lib/cats'
import { Nav } from '../../nav'
import { inr, inrExact, dayLabel, pct } from '../../../lib/format'
import { DEPOSIT_CATEGORY } from '../../../lib/scope'

export const dynamic = 'force-dynamic'

/** What a trip or tag cost: every payment out, employer-claimable ones included,
 *  but never money moved to your own account, invested, or put down as a deposit. */
const costs = (t: { direction: string; scope: string; category_id: number | null }) =>
  t.direction === 'debit' && t.scope !== 'transfer' && t.scope !== 'investment' && t.category_id !== DEPOSIT_CATEGORY

type Row = { id: string; amount: number; direction: string; scope: string; category_id: number | null
  occurred_on: string; status: string; merchant: string | null; merchant_key: string | null; bank: string | null; note: string | null }

/** One trip: the total, where it went by category, and every payment in it. */
export default async function Trip({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tagId = Number(id)
  const supabase = await supabaseServer()
  const [{ data: tag }, { data: links }, { data: cats }, { count: reviewCount }] = await Promise.all([
    supabase.from('tags').select('id, name').eq('id', tagId).maybeSingle(),
    supabase.from('transaction_tags').select('t:transactions(id, amount, direction, scope, category_id, occurred_on, status, merchant, merchant_key, bank, note)').eq('tag_id', tagId).limit(5000),
    supabase.from('categories').select('id, name, parent_id'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])
  if (!tag) notFound()
  const rows = ((links ?? []) as unknown as { t: Row | null }[]).map(l => l.t).filter((t): t is Row => !!t)
    .filter(t => t.status !== 'duplicate' && t.status !== 'ignored' && costs(t))
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  const all = cats ?? []
  const tree = catTree(all)
  const topOf = (cid: number | null) => tree.root(cid)?.name ?? 'Uncategorised'
  const byCat = new Map<string, number>()
  for (const r of rows) byCat.set(topOf(r.category_id), (byCat.get(topOf(r.category_id)) ?? 0) + Number(r.amount))
  const cats2 = [...byCat.entries()].sort((a, b) => b[1] - a[1])
  const first = rows.at(-1)?.occurred_on, last = rows[0]?.occurred_on

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 18 }}>
        <section className="card hero">
          <div className="label"><Link href="/trips">Trips and tags</Link> · {tag.name}</div>
          <div className="big num" style={{ marginTop: 6 }}>{inr(total)}</div>
          <div className="sub">{rows.length} payment{rows.length === 1 ? '' : 's'}{first ? ` · ${dayLabel(first)} to ${dayLabel(last!)}` : ''}</div>
        </section>
        {cats2.length > 0 && (
          <section className="card">
            <h2>Where it went</h2>
            <div className="rows" style={{ marginTop: 8 }}>
              {cats2.map(([name, v]) => (
                <div className="row" key={name}><div className="name">{name}</div><div className="amt num">{inr(v)}<div className="who" style={{ textAlign: 'right' }}>{pct(v, total)}</div></div></div>
              ))}
            </div>
          </section>
        )}
        <section className="card">
          <h2>Every payment</h2>
          <div className="rows" style={{ marginTop: 8 }}>
            {rows.map(r => (
              <Link className="row rowlink" key={r.id} href={`/t/${r.id}`}>
                <div>
                  <div className="name">{r.merchant ?? r.merchant_key ?? 'Unknown'}</div>
                  <div className="who">{dayLabel(r.occurred_on)} · {r.bank ?? ''}{r.note ? ` · ${r.note}` : ''}</div>
                </div>
                <div className="amt num">{inrExact(Number(r.amount))}</div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
