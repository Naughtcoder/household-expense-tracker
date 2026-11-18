import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { ClaimList, type Claim } from './list'
import Link from 'next/link'
import { inr, dayLabel, pct } from '../../lib/format'
import { EXPENSECARD_CARD } from '../../lib/card-rules'
import { Crumbs } from '../crumbs'
import { monthLabel, PEOPLE } from '../../lib/drill'
import { WhoToggle } from '../whotoggle'
import { IconChevronRight } from '@tabler/icons-react'
import { CatIcon } from '../caticon'
import { hueFor } from '../../lib/caticons'
import { catTree } from '../../lib/cats'

export const dynamic = 'force-dynamic'

type Row = Claim & { account_tail: string | null; category_id: number | null; direction: 'debit' | 'credit' }

/**
 * Money spent for someone else that comes back.
 *
 * Three kinds, kept apart because only one of them is owed to you:
 * - paid with your own money and not yet repaid: Employer owes you this;
 * - paid on the ExpenseCard card: the employer's own card, Employer pays it, nothing comes
 *   back to you (it only needs its receipts closed);
 * - repaid.
 * Counting the ExpenseCard card as owed once showed "Employer owes you Rs 9.5L" when
 * the real figure was about Rs 32,000.
 *
 * With ?m= it is that month, opened from the month's Claimable tile.
 */
export default async function Claimable({ searchParams }: { searchParams: Promise<{ m?: string; cat?: string; who?: string }> }) {
  const { m, cat: catParam, who: whoParam } = await searchParams
  const who = whoParam && PEOPLE[whoParam] ? whoParam : null
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : null
  const supabase = await supabaseServer()
  let q = supabase.from('transactions')
    .select('id, amount, occurred_on, merchant, merchant_key, bank, account_tail, claim_settled_on, category_id, direction')
    .eq('scope', 'claimable').neq('status', 'duplicate').neq('status', 'ignored')
  if (who) q = q.eq('paid_by', who)
  if (month) {
    const [y, mo] = month.split('-').map(Number)
    q = q.gte('occurred_on', `${month}-01`).lt('occurred_on', new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10))
  }
  const [{ data }, { count: reviewCount }, { data: cats }, { data: payoutRows }] = await Promise.all([
    q.order('occurred_on', { ascending: false }),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
    supabase.from('categories').select('id, name, parent_id'),
    supabase.from('transactions').select('id, amount, occurred_on, merchant')
      .eq('scope', 'claimable').eq('direction', 'credit').neq('status', 'duplicate')
      .order('occurred_on', { ascending: false }).limit(6),
  ])
  const recentPayouts = (payoutRows ?? []) as { id: string; amount: number; occurred_on: string; merchant: string | null }[]

  // Claims are money paid out. A repayment coming in (the employer's payout, a
  // refund) is the other side of a claim, not another claim, so it is shown
  // separately and never added to the claimed total.
  const fetched = (data ?? []) as Row[]
  const repayments = fetched.filter(r => r.direction === 'credit')
  const rows = fetched.filter(r => r.direction !== 'credit')
  const onCard = rows.filter(r => r.account_tail === EXPENSECARD_CARD)
  const mine = rows.filter(r => r.account_tail !== EXPENSECARD_CARD)
  const owedRows = mine.filter(r => !r.claim_settled_on)
  const backRows = mine.filter(r => r.claim_settled_on)
  const sum = (l: Row[]) => l.reduce((s, r) => s + Number(r.amount), 0)
  const owed = sum(owedRows)
  const oldest = owedRows.length ? owedRows[owedRows.length - 1].occurred_on : null
  const days = oldest ? Math.floor((Date.now() - new Date(oldest).getTime()) / 86400000) : 0

  // The month's total split three ways (whose money, and whether it is back)
  // and by category, the way a month's spending is split on the home page.
  const total = sum(rows)
  const kinds = [
    { label: 'Owed to you', v: owed, color: 'var(--hue-6)' },
    { label: 'Repaid', v: sum(backRows), color: 'var(--positive)' },
    { label: "On the employer's card", v: sum(onCard), color: 'var(--hue-1)' },
  ].filter(k => k.v > 0)
  const allCats = cats ?? []
  const tree = catTree(allCats)
  const topName = (id: number | null) => tree.root(id)?.name ?? 'Uncategorised'
  const byCat = new Map<string, number>()
  for (const r of rows) byCat.set(topName(r.category_id), (byCat.get(topName(r.category_id)) ?? 0) + Number(r.amount))
  const catRows = [...byCat.entries()].sort((a, b) => b[1] - a[1])

  const byMonth = new Map<string, { mine: number; back: number; owed: number; card: number }>()
  if (!month) for (const r of rows) {
    const k = r.occurred_on.slice(0, 7)
    const e = byMonth.get(k) ?? { mine: 0, back: 0, owed: 0, card: 0 }
    const a = Number(r.amount)
    if (r.account_tail === EXPENSECARD_CARD) e.card += a
    else { e.mine += a; if (r.claim_settled_on) e.back += a; else e.owed += a }
    byMonth.set(k, e)
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12)

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 16 }}>
        <Crumbs fallback={month ? `/?m=${month}` : '/'}
          trail={month ? [{ label: monthLabel(month), href: `/?m=${month}` }, { label: 'Claims' }] : [{ label: 'Home', href: '/' }, { label: 'Claims' }]} />

        <WhoToggle path="/claimable" params={{ m: month ?? undefined, cat: catParam }} who={who} />

        {month ? (
          <>
            <section className="heroblock" style={{ paddingTop: 0 }}>
              <div className="sub">Claimable, {monthLabel(month)}{who ? `, ${PEOPLE[who]}` : ''}</div>
              <div className="big num"><span className="cur">₹</span>{Math.round(total).toLocaleString('en-IN')}</div>
              <div className="sub">{rows.length} payment{rows.length === 1 ? '' : 's'}</div>
            </section>

            <section className="card">
              <div className="split">
                {kinds.map(k => <i key={k.label} style={{ width: `${(k.v / (total || 1)) * 100}%`, background: k.color }} />)}
              </div>
              <div className="rows" style={{ marginTop: 10 }}>
                {kinds.map(k => (
                  <a key={k.label} className="irow" href={`#${k.label.replace(/\W+/g, '-').toLowerCase()}`}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: k.color, flex: 'none' }} />
                    <div className="mid"><div className="name">{k.label}</div></div>
                    <div className="amt num">{inr(k.v)}<div className="who" style={{ textAlign: 'right' }}>{pct(k.v, total)}</div></div>
                  </a>
                ))}
              </div>
            </section>

            <Link className="btn" href={`/claimable${who ? `?who=${who}` : ''}`} style={{ textAlign: 'center' }}>Claims, month by month</Link>

            {catRows.length > 0 && (
              <section className="card">
                <h2>By category</h2>
                <div className="rows" style={{ marginTop: 6 }}>
                  {catRows.map(([name, v]) => (
                    <Link replace className="irow" key={name} href={`/claimable?m=${month}${who ? `&who=${who}` : ''}${catParam === name ? '' : `&cat=${encodeURIComponent(name)}`}#cat-list`}
                      style={catParam === name ? { background: 'var(--surface-raised)', borderRadius: 12, padding: '9px 8px', margin: '0 -8px' } : undefined}>
                      <CatIcon name={name} />
                      <div className="mid">
                        <div className="name">{name}</div>
                        <div className="thin"><i style={{ width: `${(v / (catRows[0][1] || 1)) * 100}%`, background: hueFor(name) }} /></div>
                      </div>
                      <div className="amt num">{inr(v)}<div className="who" style={{ textAlign: 'right' }}>{pct(v, catRows.reduce((s, [, x]) => s + x, 0))}</div></div>
                      <IconChevronRight size={18} className="chev" />
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            <section className="heroblock" style={{ paddingTop: 0 }}>
              <div className="sub">Employer owes you{month ? `, from ${monthLabel(month)}` : ''}</div>
              <div className="big num" style={{ color: owed ? 'var(--hue-6)' : 'var(--page-text)' }}>
                <span className="cur">₹</span>{Math.round(owed).toLocaleString('en-IN')}
              </div>
              <div className="sub">
                {owedRows.length ? `${owedRows.length} not yet repaid${month ? '' : `, oldest ${days} day${days === 1 ? '' : 's'} ago`}` : 'Nothing waiting'}
              </div>
            </section>

            <div className="stats">
              <div className="stat"><div className="k">Repaid</div><div className="v">{inr(sum(backRows))}</div></div>
              <div className="stat"><div className="k">On the employer&apos;s card</div><div className="v">{inr(sum(onCard))}</div></div>
            </div>

          </>
        )}

        {months.length > 0 && (
          <section className="card">
            <h2>By month</h2>
            <div className="rows" style={{ marginTop: 6 }}>
              {months.map(([k, e]) => (
                <Link key={k} className="irow" href={`/claimable?m=${k}${who ? `&who=${who}` : ''}`}>
                  <div className="mid">
                    <div className="name">{monthLabel(k)}</div>
                    <div className="who">
                      {e.mine ? `${inr(e.mine)} yours` : 'nothing yours'}{e.card ? ` · ${inr(e.card)} on the card` : ''}
                    </div>
                  </div>
                  <div className="amt num" style={{ color: e.owed ? 'var(--claimable)' : 'var(--page-text-muted)' }}>
                    {e.owed ? `${inr(e.owed)} owed` : 'settled'}
                  </div>
                  <IconChevronRight size={18} className="chev" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {month && catParam && (
          <section className="card" id="cat-list" style={{ scrollMarginTop: 12 }}>
            <h2>{catParam}, {monthLabel(month)}</h2>
            <div className="rows" style={{ marginTop: 8 }}>
              {rows.filter(r => topName(r.category_id) === catParam).map(r => (
                <Link className="irow" key={r.id} href={`/t/${r.id}?m=${month}&from=claims`}>
                  <div className="mid">
                    <div className="name">{r.merchant ?? r.merchant_key ?? 'Unknown'}</div>
                    <div className="who">{dayLabel(r.occurred_on)} · {r.account_tail === EXPENSECARD_CARD ? "the employer's card" : r.claim_settled_on ? 'repaid' : 'owed to you'}</div>
                  </div>
                  <div className="amt num">{inr(Number(r.amount))}</div>
                  <IconChevronRight size={18} className="chev" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {month && repayments.length > 0 && (
          <section className="card">
            <h2>Money that came back</h2>
            <div className="rows" style={{ marginTop: 8 }}>
              {repayments.map(r => (
                <Link className="irow" key={r.id} href={`/claimable/r/${r.id}`}>
                  <div className="mid">
                    <div className="name">{r.merchant ?? r.merchant_key ?? 'Unknown'}</div>
                    <div className="who">{dayLabel(r.occurred_on)}</div>
                  </div>
                  <div className="amt num credit">+{inr(Number(r.amount))}</div>
                  <IconChevronRight size={18} className="chev" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {month && <div id="owed-to-you" />}
        {month && <ClaimList open={owedRows} settled={backRows} payouts={recentPayouts} />}

        {month && onCard.length > 0 && (
          <section className="card" id="on-employer-s-card">
            <h2>On the employer&apos;s card</h2>
            <p className="sub" style={{ marginTop: 4 }}>Paid on the ExpenseCard card. Employer pays the card, so nothing comes back to you.</p>
            <div className="rows" style={{ marginTop: 8 }}>
              {onCard.map(r => (
                <Link className="irow" key={r.id} href={`/t/${r.id}?m=${month}&from=claims`}>
                  <div className="mid">
                    <div className="name">{r.merchant ?? r.merchant_key ?? 'Unknown'}</div>
                    <div className="who">{dayLabel(r.occurred_on)}</div>
                  </div>
                  <div className="amt num">{inr(Number(r.amount))}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  )
}
