import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { inr, dayLabel } from '../../lib/format'

export const dynamic = 'force-dynamic'

type Row = {
  bank: string | null; account_tail: string | null
  balance: number | null; occurred_on: string; created_at: string
  amount: number; direction: 'debit' | 'credit'
}

export default async function Accounts() {
  const supabase = await supabaseServer()
  const [{ data }, { count: reviewCount }] = await Promise.all([
    supabase.from('transactions')
      .select('bank, account_tail, balance, occurred_on, created_at, amount, direction')
      .not('account_tail', 'is', null)
      .order('occurred_on', { ascending: false }).limit(2000),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])
  const rows = (data ?? []) as Row[]

  // One entry per bank and account. The newest message carrying a balance wins,
  // because that is the last time the bank told us where the account stood.
  type Acc = { bank: string; tail: string; balance: number | null; asOf: string | null; seen: number; moved: number }
  const accounts = new Map<string, Acc>()
  for (const r of rows) {
    const key = `${r.bank ?? 'Unknown'}::${r.account_tail}`
    const a = accounts.get(key) ?? { bank: r.bank ?? 'Unknown', tail: r.account_tail!, balance: null, asOf: null, seen: 0, moved: 0 }
    a.seen += 1
    a.moved += r.direction === 'debit' ? -Number(r.amount) : Number(r.amount)
    if (a.balance === null && r.balance !== null) { a.balance = Number(r.balance); a.asOf = r.occurred_on }
    accounts.set(key, a)
  }
  const list = [...accounts.values()].sort((a, b) => (b.balance ?? -1) - (a.balance ?? -1))
  const known = list.filter(a => a.balance !== null)
  const total = known.reduce((s, a) => s + (a.balance ?? 0), 0)

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 18 }}>
        <section className="card hero">
          <div className="label">Across {known.length} account{known.length === 1 ? '' : 's'}</div>
          <div className="big num" style={{ marginTop: 6 }}>{known.length ? inr(total) : '—'}</div>
          <div className="sub">
            {known.length
              ? 'Last balance each bank reported, not a live figure.'
              : 'No balance has come through yet. Most Indian banks include one in their alerts.'}
          </div>
        </section>

        <section className="card">
          <h2>Accounts</h2>
          <div className="rows" style={{ marginTop: 10 }}>
            {list.map(a => (
              <div className="row" key={`${a.bank}${a.tail}`}>
                <div>
                  <div className="name">{a.bank} ···{a.tail}</div>
                  <div className="who">
                    {a.asOf ? `as at ${dayLabel(a.asOf)}` : 'no balance reported'} · {a.seen} transaction{a.seen === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="amt num">{a.balance === null ? '—' : inr(a.balance)}</div>
              </div>
            ))}
            {list.length === 0 && <div className="empty">Nothing yet. Accounts appear as messages arrive.</div>}
          </div>
        </section>

        <section className="card">
          <div className="label">Why this screen exists</div>
          <p className="sub" style={{ marginTop: 8 }}>
            If a balance falls further than the transactions here explain, something was
            missed: a payment made in an app that does not text, or a message never shared.
            No other screen can tell you that.
          </p>
        </section>
      </main>
    </>
  )
}
