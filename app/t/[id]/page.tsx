import { supabaseServer } from '../../../lib/supabase/server'
import { Nav } from '../../nav'
import { EditForm } from './form'
import { inrExact, dayLabel, timeLabel } from '../../../lib/format'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Crumbs, type Crumb } from '../../crumbs'
import { ctxQuery, periodCrumb, genericKey, type Ctx } from '../../../lib/drill'
import { catTree } from '../../../lib/cats'
import { Payback, type Line } from './payback'
import { PaysBack, SettledUp, type Row as FRow } from './friends'
import { PEOPLE } from '../../../lib/drill'
import { otherOf, candidatesFor, WINDOW_DAYS } from '../../../lib/payback'
import { matchPlan, fitParts, type Plan } from '../../../lib/splits'
import { Split, type ShownPart, type PlanOffer } from './split'

export const dynamic = 'force-dynamic'

export default async function Transaction({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<Ctx>
}) {
  const { id } = await params
  const ctx = await searchParams
  const supabase = await supabaseServer()

  const [{ data: txn }, { data: cats }, { data: tags }, { data: chosen }, { count: reviewCount }] = await Promise.all([
    supabase.from('transactions')
      .select('id, amount, currency, balance, merchant, merchant_raw, merchant_key, occurred_on, occurred_at, category_id, scope, direction, bank, account_tail, status, pattern_id, raw_text, flags, settled_by, note, paid_by, covered_by, pays_back, split_of, split_total')
      .eq('id', id).maybeSingle(),
    supabase.from('categories').select('id, name, parent_id').order('name'),
    supabase.from('tags').select('id, name').eq('archived', false).order('name'),
    supabase.from('transaction_tags').select('tag_id').eq('transaction_id', id),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])
  if (!txn) notFound()

  type Payout = { id: string; amount: number; occurred_on: string; merchant: string | null }
  const payout = txn.settled_by
    ? ((await supabase.from('transactions').select('id, amount, occurred_on, merchant').eq('id', txn.settled_by).maybeSingle()).data as Payout | null)
    : null
  // A payout itself: link to the claims it paid.
  const { count: paidCount } = txn.direction === 'credit' && txn.scope === 'claimable'
    ? await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('settled_by', txn.id)
    : { count: 0 }

  // Paid back between the two of them: a payment the other one covered, or a
  // transfer that covered something.
  const plus = (iso: string, d: number) => new Date(Date.parse(iso.slice(0, 10)) + d * 86400000).toISOString().slice(0, 10)
  const ourTransfer = txn.scope === 'transfer' && (txn.merchant === 'Sam' || txn.merchant === 'Alex')
  const spendable = txn.direction === 'debit' && !['transfer', 'claimable', 'investment'].includes(txn.scope)
  let payback: { mode: 'payment' | 'transfer'; linked: Line[]; choices: Line[]; other: string } | null = null
  if (spendable && txn.covered_by) {
    const { data: t } = await supabase.from('transactions').select('id, amount, occurred_on, merchant').eq('id', txn.covered_by).maybeSingle()
    payback = { mode: 'payment', linked: t ? [{ ...t, merchant: `Transfer from ${PEOPLE[txn.paid_by] ?? 'them'}` } as Line] : [], choices: [], other: PEOPLE[txn.paid_by] ?? 'them' }
  } else if (spendable) {
    const payer = txn.paid_by as string, other = otherOf(payer)
    const [{ data: inn }, { data: out }] = await Promise.all([
      supabase.from('transactions').select('id, amount, occurred_on, merchant').eq('scope', 'transfer').eq('paid_by', payer).eq('direction', 'credit')
        .eq('merchant', PEOPLE[other]).gte('occurred_on', txn.occurred_on).lte('occurred_on', plus(txn.occurred_on, WINDOW_DAYS)),
      supabase.from('transactions').select('id, amount, occurred_on, merchant').eq('scope', 'transfer').eq('paid_by', other).eq('direction', 'debit')
        .eq('merchant', PEOPLE[payer]).gte('occurred_on', txn.occurred_on).lte('occurred_on', plus(txn.occurred_on, WINDOW_DAYS)),
    ])
    // A transfer both banks reported shows up twice, once from each side.
    // Keep the receiving side's record, which is the one money arrived on.
    const seen = new Set((inn ?? []).map(r => `${Number(r.amount)}|${r.occurred_on.slice(0, 10)}`))
    const theirs = (out ?? []).filter(r => !seen.has(`${Number(r.amount)}|${r.occurred_on.slice(0, 10)}`))
    const all = [...(inn ?? []), ...theirs].map(r => ({ ...r, amount: Number(r.amount), merchant: `Transfer from ${PEOPLE[other]}` }))
      .sort((a, b) => Math.abs(a.amount - Number(txn.amount)) - Math.abs(b.amount - Number(txn.amount))).slice(0, 8)
    payback = { mode: 'payment', linked: [], choices: all, other: PEOPLE[other] }
  } else if (ourTransfer) {
    const { data: linked } = await supabase.from('transactions').select('id, amount, occurred_on, merchant').eq('covered_by', txn.id)
    const choices = linked?.length ? [] : (await candidatesFor(supabase, { id: txn.id, amount: Number(txn.amount), direction: txn.direction, paid_by: txn.paid_by, occurred_on: txn.occurred_on })).slice(0, 8)
    payback = { mode: 'transfer', linked: (linked ?? []) as Line[], choices: choices as Line[], other: txn.merchant ?? '' }
  }

  // A friend paying back their share of something he paid for (a dinner for
  // the table): link it to that payment. And on that payment, show who paid back.
  const isPayback = !ourTransfer && !['transfer', 'claimable', 'investment'].includes(txn.scope)
    && ((txn.direction === 'debit' && Number(txn.amount) < 0) || txn.direction === 'credit')
  let paysBack: { linked: FRow | null; choices: FRow[] } | null = null
  if (isPayback) {
    const back = Math.abs(Number(txn.amount))
    const linked = txn.pays_back
      ? ((await supabase.from('transactions').select('id, amount, occurred_on, merchant').eq('id', txn.pays_back).maybeSingle()).data as FRow | null)
      : null
    let choices: FRow[] = []
    if (!linked) {
      const { data } = await supabase.from('transactions').select('id, amount, occurred_on, merchant, category_id')
        .eq('paid_by', txn.paid_by).eq('direction', 'debit').gt('amount', back)
        .not('scope', 'in', '(transfer,claimable,investment)').not('status', 'in', '(duplicate,ignored)')
        .gte('occurred_on', plus(txn.occurred_on, -30)).lte('occurred_on', txn.occurred_on.slice(0, 10))
        .order('occurred_on', { ascending: false }).limit(60)
      // Likeliest first: the same category, then a bill this is an even share
      // of (₹850 of a ₹3,400 dinner), then the most recent.
      const score = (r: { amount: number; category_id: number | null }) => {
        const ratio = Number(r.amount) / back
        return (r.category_id && r.category_id === txn.category_id ? 0 : 2) + Math.min(1, Math.abs(ratio - Math.round(ratio)) * 4)
      }
      choices = (data ?? []).map((r, i) => ({ r, i })).sort((a, b) => score(a.r) - score(b.r) || a.i - b.i).slice(0, 8)
        .map(({ r }) => ({ id: r.id, amount: Number(r.amount), occurred_on: r.occurred_on, merchant: r.merchant }))
    }
    paysBack = { linked, choices }
  }
  const { data: friendBacks } = spendable && Number(txn.amount) > 0
    ? await supabase.from('transactions').select('id, amount, occurred_on, merchant').eq('pays_back', txn.id).order('occurred_on')
    : { data: null }

  // A split payment: the whole of it and every part, whichever part this is.
  const rootId = (txn.split_of as string | null) ?? txn.id
  const isSplit = !!txn.split_of || txn.split_total != null
  const { data: family } = isSplit
    ? await supabase.from('transactions').select('id, amount, category_id, scope, note, split_of, split_total, created_at')
        .or(`id.eq.${rootId},split_of.eq.${rootId}`).order('created_at')
    : { data: null }
  const root = (family ?? []).find(r => r.id === rootId)
  const parts: ShownPart[] = isSplit && root
    ? [root, ...(family ?? []).filter(r => r.split_of === rootId)].map(r => ({ id: r.id, amount: Number(r.amount), category_id: r.category_id, scope: r.scope, note: r.note }))
    : []
  const bankTotal = Number(root?.split_total ?? txn.split_total ?? txn.amount)
  // A planned split this payment fits, by payee or by amount.
  let plans: PlanOffer[] = []
  if (!isSplit && txn.direction === 'debit' && Number(txn.amount) > 0) {
    const day = txn.occurred_on.slice(0, 10)
    const { data: open } = await supabase.from('planned_splits')
      .select('id, paid_by, payee_hint, expected_amount, tolerance, window_from, window_to, parts, status, created_at')
      .eq('status', 'open').eq('paid_by', txn.paid_by).lte('window_from', day).gte('window_to', day)
    const hit = matchPlan({ amount: Number(txn.amount), paid_by: txn.paid_by, occurred_on: day, direction: txn.direction,
      merchant_key: txn.merchant_key, merchant_raw: txn.merchant_raw, merchant: txn.merchant }, (open ?? []) as Plan[])
    if (hit) plans = [{ id: hit.plan.id, expected: Number(hit.plan.expected_amount), diff: hit.diff, payee: hit.plan.payee_hint, parts: hit.kind === 'apply' && hit.diff !== 0 ? fitParts(hit.plan.parts, hit.diff) : hit.plan.parts }]
  }

  // Up from one payment: its period (the one it was opened from, else its own
  // month), its category group, its category, its payee.
  const period: Ctx = ctx.y || ctx.m ? { y: ctx.y, m: ctx.m, who: ctx.who } : { m: txn.occurred_on.slice(0, 7) }
  const all = cats ?? []
  const own = all.find(c => c.id === txn.category_id) ?? null
  // Every level above the category: Transportation, then Car, for Toll.
  const groups = catTree(all).path(own?.id).slice(0, -1)
  const trail: Crumb[] = ctx.from === 'claims' && ctx.m ? [
    periodCrumb(period)!,
    { label: 'Claims', href: `/claimable?m=${ctx.m}` },
    { label: txn.merchant ?? 'Payment' },
  ] : [
    periodCrumb(period)!,
    ...groups.map(g => ({ label: g.name, href: `/c/${g.id}${ctxQuery(period)}` })),
    ...(own ? [{ label: own.name, href: `/c/${own.id}${ctxQuery(period)}` }] : []),
    ...(txn.merchant_key ? [{ label: txn.merchant ?? txn.merchant_key, href: `/m/${encodeURIComponent(txn.merchant_key)}${ctxQuery({ ...period, c: own ? String(own.id) : undefined, n: genericKey(txn.merchant_key) ? txn.merchant ?? undefined : undefined })}` }] : []),
    { label: 'Payment' },
  ]

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 14 }}>
        <Crumbs fallback={trail[trail.length - 2]?.href ?? '/'} trail={trail} />
        <div>
          <h1>
            {txn.merchant_key
              ? <Link href={`/m/${encodeURIComponent(txn.merchant_key)}`}>{txn.merchant ?? txn.merchant_key}</Link>
              : (txn.merchant ?? 'Transaction')}
          </h1>
          <p className="sub" style={{ marginTop: 4 }}>
            {isSplit ? inrExact(bankTotal) : inrExact(Number(txn.amount))}{txn.currency !== 'INR' ? ` ${txn.currency}` : ''} · {dayLabel(txn.occurred_on)}{txn.occurred_at ? `, ${timeLabel(txn.occurred_at)}` : ''}
            {txn.bank ? ` · ${txn.bank}` : ''}{txn.account_tail ? ` ···${txn.account_tail}` : ''}
          </p>
        </div>

        {txn.split_of && (
          <Link className="stat" href={`/t/${rootId}`} style={{ display: 'block' }}>
            <div className="k">Part of a split payment</div>
            <div className="v" style={{ fontSize: 15 }}>This part is {inrExact(Number(txn.amount))} of {inrExact(bankTotal)}. See the whole payment</div>
          </Link>
        )}
        {txn.direction === 'debit' && !txn.split_of && (
          <Split id={txn.id} total={bankTotal} month={txn.occurred_on.slice(0, 7)} parts={parts} categories={cats ?? []} plans={plans}
            current={{ category_id: txn.category_id, scope: txn.scope, note: txn.note }} />
        )}

        {!!paidCount && (
          <Link className="stat" href={`/claimable/r/${txn.id}`} style={{ display: 'block' }}>
            <div className="k">Pays back</div>
            <div className="v" style={{ fontSize: 15 }}>{paidCount} claim{paidCount === 1 ? '' : 's'}, see which</div>
          </Link>
        )}
        {payout && (
          <Link className="stat" href={`/claimable/r/${payout.id}`} style={{ display: 'block' }}>
            <div className="k">Repaid by</div>
            <div className="v" style={{ fontSize: 15 }}>{payout.merchant ?? 'Repayment'}, {dayLabel(payout.occurred_on)} · {inrExact(Number(payout.amount))}</div>
          </Link>
        )}

        {paysBack && <PaysBack self={txn.id} linked={paysBack.linked} choices={paysBack.choices} />}
        {!!friendBacks?.length && <SettledUp total={Number(txn.amount)} paybacks={friendBacks as FRow[]} />}
        {payback && <Payback mode={payback.mode} self={txn.id} linked={payback.linked} choices={payback.choices} other={payback.other} />}

        <EditForm
          split={isSplit}
          txn={txn as never}
          categories={cats ?? []}
          tags={tags ?? []}
          chosen={(chosen ?? []).map(c => c.tag_id)}
        />

        {txn.raw_text && (
          <section className="card">
            <div className="label">What the bank sent</div>
            <div className="raw" style={{ marginTop: 8 }}>{txn.raw_text}</div>
            <p className="sub" style={{ marginTop: 10 }}>
              Read by rule {txn.pattern_id ?? 'unknown'}
              {txn.balance !== null ? `, balance after: ₹${Number(txn.balance).toLocaleString('en-IN')}` : ''}
            </p>
          </section>
        )}
      </main>
    </>
  )
}
