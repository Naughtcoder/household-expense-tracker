import Link from 'next/link'
import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { Crumbs } from '../crumbs'
import { WhoToggle } from '../whotoggle'
import { CatIcon } from '../caticon'
import { inr, dayLabel, monthKey, monthRange, pct } from '../../lib/format'
import { PEOPLE } from '../../lib/drill'
import { invested } from '../../lib/scope'
import { IconChevronRight } from '@tabler/icons-react'

export const dynamic = 'force-dynamic'

type Row = { id: string; amount: number; direction: 'debit' | 'credit'; occurred_on: string; merchant: string | null; merchant_key: string | null; scope: string; paid: { name: string } | null }

/** inr already marks a negative with a minus sign. */
const signed = inr
/** "SBI fixed deposit closed" is the same deposit coming back. */
const payeeOf = (r: Row) => (r.merchant ?? r.merchant_key ?? 'Unknown').replace(/\s+closed$/i, '')

/**
 * Money moved into investments (Zerodha, fixed deposits), month by month.
 * Never spending: the money is still the household's. Net is money out less
 * anything that came back, by lib/scope.ts `invested`. Every figure opens the
 * payments behind it.
 */
export default async function Investments({ searchParams }: { searchParams: Promise<{ m?: string; who?: string }> }) {
  const sp = await searchParams
  const who = sp.who && PEOPLE[sp.who] ? sp.who : null
  const sel = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : null
  const w = who ? `&who=${who}` : ''
  const supabase = await supabaseServer()

  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('transactions')
      .select('id, amount, direction, occurred_on, merchant, merchant_key, scope, paid:people!transactions_paid_by_fkey(name)')
      .eq('scope', 'investment').neq('status', 'duplicate').neq('status', 'ignored')
    if (who) q = q.eq('paid_by', who)
    const { data } = await q.order('occurred_on', { ascending: false }).order('id').range(from, from + 999)
    rows.push(...((data ?? []) as unknown as Row[]))
    if ((data ?? []).length < 1000) break
  }
  const { count: reviewCount } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review')

  const now = monthKey()
  const year = now.slice(0, 4)
  const total = invested(rows)
  const yearNet = invested(rows.filter(r => r.occurred_on.slice(0, 4) === year))

  // Every month from the first investment to now, so a quiet month shows as a gap.
  const by = new Map<string, { out: number; back: number; count: number }>()
  for (const r of rows) {
    const k = r.occurred_on.slice(0, 7)
    const e = by.get(k) ?? { out: 0, back: 0, count: 0 }
    if (r.direction === 'debit') e.out += Number(r.amount); else e.back += Number(r.amount)
    e.count += 1
    by.set(k, e)
  }
  const months: { key: string; out: number; back: number; net: number; count: number }[] = []
  const first = [...by.keys()].sort()[0]
  if (first) {
    for (let k = first; k <= now; k = monthRange(k).next) {
      const e = by.get(k) ?? { out: 0, back: 0, count: 0 }
      months.push({ key: k, ...e, net: e.out - e.back })
    }
  }
  const peak = Math.max(1, ...months.map(m => m.net))

  const inSel = rows.filter(r => !sel || r.occurred_on.slice(0, 7) === sel)
  const payees = new Map<string, { out: number; back: number }>()
  for (const r of inSel) {
    const e = payees.get(payeeOf(r)) ?? { out: 0, back: 0 }
    if (r.direction === 'debit') e.out += Number(r.amount); else e.back += Number(r.amount)
    payees.set(payeeOf(r), e)
  }
  const payeeList = [...payees.entries()].map(([name, e]) => ({ name, ...e, net: e.out - e.back }))
    .sort((a, b) => (b.out + b.back) - (a.out + a.back))
  const payeeTotal = payeeList.reduce((s, p) => s + Math.max(0, p.net), 0)
  const selLabel = sel ? monthRange(sel).label : 'Every payment'
  const allHref = (m: string) => `/all?m=${m}&scope=investment${w}`

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 16 }}>
        <Crumbs fallback="/" trail={[{ label: 'Home', href: '/' }, { label: 'Investments' }]} />
        <WhoToggle path="/investments" params={{ m: sel ?? undefined }} who={who} />

        <Link href={`/investments${who ? `?who=${who}` : ''}`} className="heroblock" style={{ paddingTop: 0, color: 'inherit', display: 'block' }}>
          <div className="sub">Invested to date, net</div>
          <div className="big num">{total < 0 && '−'}<span className="cur">₹</span>{Math.round(Math.abs(total)).toLocaleString('en-IN')}</div>
          <div className="sub">Not spending: the money is still yours, in a fund or a deposit</div>
        </Link>

        <section className="stats">
          <Link className="stat" href={`/investments?m=${now}${w}`}>
            <div className="k">This month, net</div>
            <div className="v">{signed(by.get(now) ? by.get(now)!.out - by.get(now)!.back : 0)}</div>
          </Link>
          <Link className="stat" href={`/investments${who ? `?who=${who}` : ''}`}>
            <div className="k">{year} so far, net</div>
            <div className="v">{signed(yearNet)}</div>
          </Link>
        </section>

        {months.length > 0 && (
          <section className="card">
            <div className="label">Net invested each month</div>
            <div className="bars" style={{ height: 140 }}>
              {months.map(m => (
                <Link key={m.key} href={`/investments?m=${m.key}${w}`} title={`${monthRange(m.key).label}: ${signed(m.net)}`}>
                  <span className="col"><i className="in" style={{ height: `${(Math.max(0, m.net) / peak) * 100}%`, opacity: !sel || sel === m.key ? 1 : .35 }} /></span>
                  <b className="cap">{m.key.endsWith('-01') ? `’${m.key.slice(2, 4)}` : 'JFMAMJJASOND'[Number(m.key.slice(5, 7)) - 1]}</b>
                </Link>
              ))}
            </div>
            <div className="sub" style={{ marginTop: 6 }}>Pick a month to see its payments. A month where more came back than went in shows as a stub.</div>
          </section>
        )}

        {months.length > 0 && (
          <section className="card">
            <div className="label">Month by month</div>
            <div className="rows" style={{ marginTop: 4 }}>
              {[...months].reverse().filter(m => m.count).map(m => (
                <Link className="irow" key={m.key} href={`/investments?m=${m.key}${w}`}>
                  <div className="mid">
                    <div className="name" style={{ fontWeight: sel === m.key ? 800 : undefined }}>{monthRange(m.key).label}</div>
                    <div className="who">{[m.out ? `${inr(m.out)} out` : '', m.back ? `${inr(m.back)} back` : ''].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className={`amt num${m.net < 0 ? ' credit' : ''}`}>{signed(m.net)}</div>
                  <IconChevronRight size={18} className="chev" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {inSel.length > 0 && (
          <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2>{selLabel}</h2>
              {sel
                ? <Link className="num" href={allHref(sel)}>{signed(invested(inSel))} net ›</Link>
                : <span className="num">{signed(total)} net</span>}
            </div>
            <div className="label" style={{ marginTop: 10 }}>By payee</div>
            <div className="rows">
              {payeeList.map(p => (
                <Link className="irow" key={p.name} href={`/search?q=${encodeURIComponent(p.name)}`}>
                  <CatIcon name="Investments" size={30} />
                  <div className="mid">
                    <div className="name">{p.name}</div>
                    <div className="who">{[p.out ? `${inr(p.out)} out` : '', p.back ? `${inr(p.back)} back` : ''].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className={`amt num${p.net < 0 ? ' credit' : ''}`}>
                    {signed(p.net)} {p.net > 0 && <span className="sub">{pct(p.net, payeeTotal)}</span>}
                  </div>
                  <IconChevronRight size={18} className="chev" />
                </Link>
              ))}
            </div>
            <div className="label" style={{ marginTop: 10 }}>Payments</div>
            <div className="rows">
              {inSel.map(r => (
                <Link className="irow" key={r.id} href={`/t/${r.id}`}>
                  <div className="mid">
                    <div className="name">{r.merchant ?? r.merchant_key ?? 'Unknown'}</div>
                    <div className="who">{dayLabel(r.occurred_on)}{r.paid?.name ? ` · ${r.paid.name}` : ''}</div>
                  </div>
                  <div className={`amt num${r.direction === 'credit' ? ' credit' : ''}`}>{r.direction === 'credit' ? '+' : ''}{inr(Number(r.amount))}</div>
                  <IconChevronRight size={18} className="chev" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {!rows.length && <p className="sub">Nothing invested yet.</p>}
      </main>
    </>
  )
}
