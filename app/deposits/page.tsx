import Link from 'next/link'
import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { Crumbs } from '../crumbs'
import { inr, dayLabel } from '../../lib/format'
import { IconChevronRight } from '@tabler/icons-react'

export const dynamic = 'force-dynamic'

const DEPOSIT_ID = 18

type Row = { id: string; amount: number; direction: 'debit' | 'credit'; occurred_on: string; merchant: string | null; note: string | null; claim_settled_on: string | null }

/** "Maple Court deposit (A. Landlord)" belongs to "Maple Court". */
const propertyOf = (m: string | null) => (m ?? 'Other').split(/ deposit/i)[0].trim() || 'Other'

/**
 * Money parked as deposits: what is still with a landlord, what came back,
 * and what was kept. Deposits are never spending or income, so they only
 * show here. A deposit marked settled came back (or was written off) even
 * where the refund itself is not in the bank records.
 */
export default async function Deposits() {
  const supabase = await supabaseServer()
  const [{ data }, { count: reviewCount }] = await Promise.all([
    supabase.from('transactions').select('id, amount, direction, occurred_on, merchant, note, claim_settled_on')
      .eq('category_id', DEPOSIT_ID).neq('status', 'duplicate').neq('status', 'ignored').order('occurred_on', { ascending: true }),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])
  const rows = (data ?? []) as Row[]
  const byProp = new Map<string, Row[]>()
  for (const r of rows) byProp.set(propertyOf(r.merchant), [...(byProp.get(propertyOf(r.merchant)) ?? []), r])

  const props = [...byProp.entries()].map(([name, list]) => {
    const paid = list.filter(r => r.direction === 'debit').reduce((s, r) => s + Number(r.amount), 0)
    const back = list.filter(r => r.direction === 'credit').reduce((s, r) => s + Number(r.amount), 0)
    const closed = list.filter(r => r.direction === 'debit').every(r => r.claim_settled_on) || back >= paid
    const held = closed ? 0 : paid - back
    const last = list[list.length - 1].occurred_on
    return { name, list, paid, back, held, closed, last }
  }).sort((a, b) => (b.held - a.held) || b.last.localeCompare(a.last))
  const heldTotal = props.reduce((s, p) => s + p.held, 0)

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 16 }}>
        <Crumbs fallback="/" trail={[{ label: 'Home', href: '/' }, { label: 'Deposits' }]} />
        <section className="heroblock" style={{ paddingTop: 0 }}>
          <div className="sub">Held as deposits</div>
          <div className="big num"><span className="cur">₹</span>{Math.round(heldTotal).toLocaleString('en-IN')}</div>
          <div className="sub">Not spending: this money comes back when you move out</div>
        </section>

        {props.map(p => (
          <section className="card" key={p.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2>{p.name}</h2>
              <div className="num" style={{ fontWeight: 700, color: p.held ? 'var(--page-text)' : 'var(--page-text-muted)' }}>
                {p.held ? `${inr(p.held)} held` : 'Closed'}
              </div>
            </div>
            <div className="sub" style={{ marginTop: 2 }}>
              Paid {inr(p.paid)} · back {inr(p.back)}
              {p.closed && p.paid > p.back && <> · {inr(p.paid - p.back)} kept or not traced</>}
            </div>
            <div className="rows" style={{ marginTop: 8 }}>
              {p.list.map(r => (
                <Link className="irow" key={r.id} href={`/t/${r.id}`}>
                  <div className="mid">
                    <div className="name">{r.direction === 'credit' ? 'Returned' : 'Paid'}{r.merchant && r.merchant.includes('(') ? ` · ${r.merchant.slice(r.merchant.indexOf('(') + 1, r.merchant.lastIndexOf(')'))}` : ''}</div>
                    <div className="who">{dayLabel(r.occurred_on)}</div>
                  </div>
                  <div className={`amt num${r.direction === 'credit' ? ' credit' : ''}`}>{r.direction === 'credit' ? '+' : ''}{inr(Number(r.amount))}</div>
                  <IconChevronRight size={18} className="chev" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  )
}
