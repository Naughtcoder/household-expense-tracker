import { knownIncome, INCOME_IDS } from './income.ts'
import { cardRule } from './card-rules.ts'
import { inrRate } from './fx.ts'
import { betweenUs, toSelf, cardBill, sameFirstWord, looksLikeAutoFare, AUTO_ID, ALEX_ID, BUSINESS_ACCOUNTS } from './household.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import { extractAll, summarise } from './extract.ts'
import { notifyNeedsCategory } from './push.ts'
import { tagWithTrip } from './trips.ts'
import { autoCover } from './payback.ts'
import { findRule } from './rule-lookup.ts'
import type { Rule } from './rules.ts'
import { matchPlan, fitParts, type Plan, type Incoming } from './splits.ts'

/** Words worth asking about. Must match hint_stopword() in the migration, or
 *  the table is built from one vocabulary and queried with another. */
const BEVERAGES_ID = 75

const HINT_STOP = new Set(['POS','VS','UPI','ATM','VISACWD','DT','REF','CARD','BANK','BankA','ICICI',
  'SBI','KOTAK','INR','RS','THE','AND','FOR','PVT','LTD','LIMITED','PRIVATE','INDIA','COM','WWW',
  'NOT','YOU','CALL','ON','AT','TO','FROM','PAYMENT','PAY','TXN','TRANSACTION'])

export const hintTokens = (s: string) => [...new Set(
  s.toUpperCase().split(/[^A-Z]+/).filter(w => w.length >= 3 && w.length <= 18 && !HINT_STOP.has(w)))]

/** The category the words point at, or null when they disagree or say nothing.
 *  Weighted so a one-sided word seen often counts for more than a split one. */
export function scoreHints(hints: { category_id: number; seen: number; share: number }[]) {
  if (hints.length === 0) return null
  const score = new Map<number, number>()
  for (const h of hints) {
    score.set(h.category_id, (score.get(h.category_id) ?? 0) + h.share * Math.log(1 + h.seen))
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1])
  // A near tie is not a suggestion, it is a coin toss.
  if (ranked.length > 1 && ranked[0][1] < ranked[1][1] * 1.25) return null
  return ranked[0][0]
}

/** The value that appears most often. Ties go to the more recent, because the
 *  caller hands these over newest first. */
function commonest(values: number[]): number | null {
  if (values.length === 0) return null
  const count = new Map<number, number>()
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1)
  let best = values[0]
  for (const v of values) if ((count.get(v) ?? 0) > (count.get(best) ?? 0)) best = v
  return best
}

export interface IngestResult {
  saved: number; duplicates: number; refused: number; unreadable: number; message: string
}

/**
 * One code path for both doors: the Shortcut posts here with a key, and the
 * in-app paste screen calls it with a session. Neither gets its own copy of
 * the rules.
 *
 * `unattended` is the difference between a message you chose to send and one
 * an automation sent on your behalf. When you share a message by hand, keeping
 * the text we could not read is a favour: it becomes a pattern later. When a
 * rule on your phone fires at every message containing a word, the same
 * kindness would quietly file your private conversations. So an unattended
 * post that reads as nothing is dropped, and only the count is reported.
 */
export async function ingestText(
  supabase: SupabaseClient,
  text: string,
  personId: string,
  unattended = false,
  sourceKey?: string,
  // A history backfill files hundreds of old payments at once; a phone
  // notification for each would bury the ones that matter today.
  quiet = false,
  // When the message was sent or arrived, which is within a minute or so of
  // the payment. Kept only when it falls on the payment's own day.
  at: Date | null = null,
): Promise<IngestResult> {
  const istDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d)
  const timeFor = (date: string) => (at && !isNaN(at.getTime()) && istDay(at) === date ? at.toISOString() : null)
  // A text with no date of its own is dated by when it arrived, not today:
  // a history read would otherwise file last year's payments as today's.
  const found = extractAll(text, at ?? new Date())
  let saved = 0, duplicates = 0
  // Which door this came through. The same payment usually arrives twice, once
  // by text and once by email, and the two name the payee differently ("Tea
  // Shop" against "Tea Shop 2"), so the merchant cannot be what matches them.
  const channel = sourceKey?.startsWith('gmail:') ? 'email' : 'sms'

  // The "contains" and "starts with" rules, read once per message.
  const ruleCache: { loose?: Rule[] } = {}

  for (const [i, t] of found.transactions.entries()) {
    if (!t.amount || !t.date) continue
    const key = t.clean?.cleaned ?? null

    // A refund is stored as a negative spend, not as money coming in. Every
    // total in the app sums debits, so a negative one nets the purchase back
    // out wherever it is counted, with no screen needing to know refunds exist.
    // It takes its card, scope and category from the purchase it names.
    if (t.refundOf) {
      let q = supabase.from('transactions')
        .select('account_tail, scope, category_id, merchant')
        .eq('amount', t.refundOf.amount).eq('direction', 'debit').eq('merchant_key', key ?? '').is('split_of', null)
      q = t.refundOf.date ? q.eq('occurred_on', t.refundOf.date) : q.lte('occurred_on', t.date)
      const { data: orig } = await q.order('occurred_on', { ascending: false }).limit(1).maybeSingle()
      const { error } = await supabase.from('transactions').insert({
        amount: -t.amount,
        currency: t.currency ?? 'INR',
        direction: 'debit',
        occurred_on: t.date,
      occurred_at: timeFor(t.date),
        merchant_raw: t.merchantRaw ?? null,
        merchant_key: key,
        merchant: orig?.merchant ?? t.clean?.merchant ?? null,
        category_id: orig?.category_id ?? null,
        paid_by: personId,
        entered_by: personId,
        scope: orig?.scope ?? 'household',
        // Without the purchase it reverses, someone has to say what it was.
        status: orig ? 'confirmed' : 'review',
        bank: t.bank ?? null,
        account_tail: orig?.account_tail ?? t.acct ?? null,
        pattern_id: t.patternId ?? null,
        flags: ['refund', channel],
        raw_text: t.raw,
        source_key: sourceKey ? `${sourceKey}#${i}` : null,
      })
      if (error?.code === '23505') { duplicates++; continue }
      if (error) throw new Error(error.message)
      saved++
      continue
    }

    // The other door may already have this payment. Same amount, day, account
    // and direction, seen by the other channel and not yet by this one: that is
    // this payment, so mark it seen here and stop. Each row can be claimed by
    // each channel once, so two genuine Rs 25 payments on one day stay two.
    // Rows from before channels were recorded count as text messages.
    if (t.acct) {
      const { data: twins } = await supabase.from('transactions')
        .select('id, flags, occurred_at')
        .eq('occurred_on', t.date).eq('account_tail', t.acct)
        // A split payment's first row holds one part; the bank's amount is its
        // split_total. The other parts are never a bank payment's twin.
        .or(`and(amount.eq.${t.amount},split_total.is.null),split_total.eq.${t.amount}`).is('split_of', null)
        .eq('direction', t.direction ?? 'debit').limit(10)
      const seenBy = (f: string[] | null, c: string) =>
        (f ?? []).includes(c) || (c === 'sms' && !(f ?? []).includes('email'))
      const twin = (twins ?? []).find(r => !seenBy(r.flags, channel) && seenBy(r.flags, channel === 'email' ? 'sms' : 'email'))
      if (twin) {
        await supabase.from('transactions')
          .update({ flags: [...(twin.flags ?? []), channel], occurred_at: twin.occurred_at ?? timeFor(t.date) }).eq('id', twin.id)
        duplicates++
        continue
      }
    }

    // A rule written for this payee: "is exactly" its key, or a "contains" /
    // "starts with" rule, whose extra conditions (amount, who paid, money in
    // or out) hold for this payment. The most specific one wins (lib/rules.ts).
    let rule = await findRule(supabase,
      { key, raw: t.merchantRaw ?? null, amount: t.amount, paidBy: personId, direction: t.direction ?? 'debit' }, ruleCache)
    // "ACCOUNT" or "A/C 1234" names an account, not a merchant. A fuzzy match
    // filed a transfer to a stranger under the Maple Court rent rule.
    if (!rule && key && !/^(?:ACCOUNT|A\/C)\b/.test(key)) {
      const { data } = await supabase.rpc('closest_merchant', { probe: key })
      // A near match must agree on the first word. "PAT KUMAR RAO" was
      // filed under the "RAVI KUMAR RAO" tea shop rule on two shared words.
      const near = data?.[0] ?? null
      rule = near && sameFirstWord(key, near.match_key) ? near : null
    }

    // Nothing written down for this merchant. Ask the history instead: what did
    // this same merchant get filed as last time?
    //
    // There are 32 rules and 855 merchants already carrying a category, and 90
    // per cent of spending is at a merchant seen before. Without this the app
    // sends a fourth Zepto order to Review as though it had never seen one.
    //
    // The mode of the last twenty, not the most recent one, so a single
    // mis-tap does not redirect a merchant for good.
    let learned: number | null = null
    if (!rule?.category_id && key) {
      const { data } = await supabase.from('transactions')
        .select('category_id')
        .eq('merchant_key', key)
        .not('category_id', 'is', null)
        // The other parts of a split (maintenance in a rent payment) say
        // nothing about what this payee usually is.
        .is('split_of', null)
        .order('occurred_on', { ascending: false })
        .limit(20)
      learned = commonest((data ?? []).map(r => r.category_id as number))
    }

    // Still nothing. The merchant is new, but its words may not be. RAVI KUMAR
    // RAO TEA SHOP has never been seen; TEA and SHOP have.
    //
    // This is a suggestion and never more than that. It fills the category in
    // so confirming is one tap, and it always leaves the row in Review, because
    // on a merchant nobody has seen it is right about nine times in ten and
    // that is not a licence to file someone's money by itself.
    let hinted: number | null = null
    if (!rule?.category_id && !learned && key) {
      const words = hintTokens(key)
      if (words.length > 0) {
        const { data } = await supabase.from('category_hints')
          .select('category_id, seen, share').in('token', words)
        hinted = scoreHints(data ?? [])
      }
    }

    // Money in that is the same every time (salary, interest) files itself.
    const income = (t.direction ?? 'debit') === 'credit' && !rule ? knownIncome(key, t.merchantRaw) : null
    // Money between Alex and Sam, either way: recorded, never income or spending.
    // Money between Alex and Sam. From Sam's side, his name is him.
    const herName = betweenUs(key, t.merchantRaw) || betweenUs(null, t.raw)
    // From Sam's side her own name is her other account, and his name is him.
    const herOwn = personId !== ALEX_ID && herName
    // BankC cuts names to seven letters, so on her texts he is just "ALEX".
    const ours = (personId === ALEX_ID && herName) || (personId !== ALEX_ID && (toSelf(key) || /^ALEX\b/i.test(key ?? '')))
    // Money out from Alex to his own name went to another of his accounts.
    // Money in from his own UPI ID came from another of his accounts, including
    // a reversed transfer of his own. Neither is income or spending.
    const self = herOwn || (!ours && personId === ALEX_ID && (
      ((t.direction ?? 'debit') === 'debit' && toSelf(key))
      || (t.direction === 'credit' && /5000000001/.test(`${key ?? ''} ${t.merchantRaw ?? ''}`))))
    // A credit card bill: the purchases were counted when made (lib/household.ts).
    const bill = !ours && !self && (t.direction ?? 'debit') === 'debit' && cardBill(key, t.merchantRaw)
    // Which card paid can decide it outright (ExpenseCard card food orders).
    const byCard = (t.direction ?? 'debit') === 'debit' ? cardRule(t.acct, key) : null
    // A Rs 25 or Rs 50 payment to someone with no rule is tea or coffee
    // (Alex, 4 Oct 2026). Files itself as Beverages. His habit, not
    // Sam's: her ₹25 to her father was filed as tea the same evening.
    const beverage = personId === ALEX_ID && !rule && !byCard && !income && (t.direction ?? 'debit') === 'debit' && (t.amount === 25 || t.amount === 50)
      ? BEVERAGES_ID : null
    if (beverage && !learned) learned = beverage
    // Her autos: a new person at a meter amount (lib/household.ts). Only when
    // nothing else knows the payee, so her maid or her father keep theirs.
    const autoRide = personId !== ALEX_ID && !rule && !learned && !hinted && !byCard && !income && !ours && !self
      && !t.clean?.known && (t.direction ?? 'debit') === 'debit' && looksLikeAutoFare(t.amount, key)
    if (autoRide) learned = AUTO_ID
    const known = Boolean(rule) || Boolean(learned) || Boolean(t.clean?.known) || Boolean(income)

    // Look for something that already looks like this before writing. The hard
    // constraint below catches exact repeats; this catches the same purchase
    // arriving twice in different words, and pre-authorisations that settle at
    // a slightly different amount. It flags rather than refuses, because a
    // wrong merge loses a real transaction and a duplicate is one tap to fix.
    let twin: string | null = null
    const { data: maybe } = await supabase.rpc('possible_duplicates', {
      p_amount: t.amount,
      p_date: t.date,
      p_account: t.acct ?? null,
      p_merchant: key,
      p_direction: t.direction ?? 'debit',
    })
    if (Array.isArray(maybe) && maybe.length > 0) twin = maybe[0].id

    // A rule that says investment files at any size. The large-amount hold is
    // there to catch claimable spend, and an investment rule already answers it.
    // A friend paying back is filed by hand each time, because what it pays
    // back changes (one dinner, then a cab). Filing it under a spending
    // category in Review takes it off that cost.
    const payback = (t.direction ?? 'debit') === 'credit' && !income && !ours && !self
      && !(rule?.category_id && INCOME_IDS.has(rule.category_id)) && rule?.default_scope !== 'transfer'
    // The Business account's money is the business's: kept on record, set aside.
    const business = !!t.acct && BUSINESS_ACCOUNTS.has(t.acct)
    const status = business ? 'ignored' : twin || payback ? 'review' : income?.ignore ? 'ignored' : income || byCard || ours || self || bill ? 'confirmed'
      : rule?.ask || (!rule && !learned) ? 'review'
      : rule?.default_scope === 'investment' ? 'confirmed'
      : (known && t.amount < 25000 ? 'confirmed' : 'review')
    // Another currency is stored in rupees at the day's rate, the original kept
    // beside it, so every total in the app stays in one currency.
    const cur = (t.currency ?? 'INR').toUpperCase().replace(/\.$/, '')
    const foreign = cur !== 'INR' && cur !== 'RS'
    const rate = foreign ? await inrRate(supabase, cur, t.date) : 1
    const { data: inserted, error } = await supabase.from('transactions').insert({
      amount: foreign && rate ? Math.round(t.amount * rate * 100) / 100 : t.amount,
      currency: foreign && !rate ? cur : 'INR',
      original_amount: foreign ? t.amount : null,
      original_currency: foreign ? cur : null,
      balance: t.balance ?? null,
      direction: t.direction ?? 'debit',
      occurred_on: t.date,
      occurred_at: timeFor(t.date),
      merchant_raw: t.merchantRaw ?? null,
      merchant_key: key,
      merchant: ours ? (personId === ALEX_ID ? 'Sam' : 'Alex') : self ? 'Own account' : bill ? 'Credit card bill' : rule?.merchant ?? income?.merchant ?? t.clean?.merchant ?? null,
      category_id: ours || self || bill ? null : byCard?.category_id ?? rule?.category_id ?? income?.category_id ?? learned ?? hinted,
      paid_by: personId,
      entered_by: personId,
      scope: ours || self || bill ? 'transfer' : byCard?.scope ?? rule?.default_scope ?? income?.scope ?? 'household',
      // Unknown merchants get looked at. So does anything large, which is the
      // reimbursable catch.
      // Anything that looks like a twin goes to Review whatever else is true.
      // A rule that only knows the broad category asks for the exact one.
      status,
      possible_duplicate_of: twin,
      bank: t.bank ?? null,
      account_tail: t.acct ?? null,
      pattern_id: t.patternId ?? null,
      flags: [...(t.clean?.flags ?? []), channel],
      raw_text: t.raw,
      source_key: sourceKey ? `${sourceKey}#${i}` : null,
    }).select('id').single()

    if (error?.code === '23505') { duplicates++; continue }
    if (error) throw new Error(error.message)
    saved++
    // A BankB card payment on a trip joins that trip's tag.
    if (inserted && (t.direction ?? 'debit') === 'debit') {
      try {
        await tagWithTrip(supabase, { id: inserted.id, date: t.date, bank: t.bank ?? null, raw: t.raw ?? null,
          categoryId: byCard?.category_id ?? rule?.category_id ?? learned ?? null })
      } catch { /* a tag is a convenience; never fail the payment over it */ }
    }
    // Money between the two of them that matches something one of them paid
    // for moves that cost to the one who sent it.
    if (inserted && ours) {
      try {
        await autoCover(supabase, { id: inserted.id, amount: t.amount, direction: t.direction ?? 'debit', paid_by: personId, occurred_on: t.date })
      } catch { /* a convenience; never fail the payment over it */ }
    }
    // A split planned for this payment: applied now when the amount fits,
    // or pointed out in Review when only the payee does.
    let planned = false
    if (inserted && !twin && !foreign && status !== 'ignored' && (t.direction ?? 'debit') === 'debit') {
      try {
        planned = await applyPlans(supabase, { id: inserted.id, amount: t.amount, paid_by: personId, occurred_on: t.date,
          direction: 'debit', merchant_key: key, merchant_raw: t.merchantRaw ?? null,
          merchant: rule?.merchant ?? t.clean?.merchant ?? null, flags: [...(t.clean?.flags ?? []), channel] }) === 'applied'
      } catch { /* the plan stays open and can be applied by hand */ }
    }
    // Waiting for a category: tell the person who paid, with a link to it.
    if (!quiet && inserted && status === 'review' && !twin && !planned) {
      await notifyNeedsCategory(supabase, personId,
        { id: inserted.id, merchant: rule?.merchant ?? t.clean?.merchant ?? t.merchantRaw ?? null, amount: t.amount })
    }
  }

  if (!unattended) {
    for (const u of found.unrecognised) {
      await supabase.from('unparsed').insert({ raw_text: u, entered_by: personId })
    }

    // Last resort. If nothing at all came of this text, keep the text anyway.
    // A message we cannot read is a pattern to write, not a thing to discard.
    // One we read and knowingly refused (a declined autopay, an upcoming
    // mandate) is neither, so it is not kept.
    if (saved === 0 && duplicates === 0 && found.unrecognised.length === 0 && found.refused.length === 0) {
      await supabase.from('unparsed').insert({ raw_text: text.slice(0, 1000), entered_by: personId })
    }
  }

  const nothing = saved === 0 && duplicates === 0
  return {
    saved, duplicates,
    refused: found.refused.length,
    unreadable: found.unrecognised.length || (nothing && found.refused.length === 0 ? 1 : 0),
    message: nothing && found.refused.length === 0
      ? 'Could not read that. Saved it so a rule can be written.'
      : summarise(found) + (duplicates ? `, ${duplicates} already logged` : ''),
  }
}

/**
 * After a new payment out is stored: the open plans for that person whose
 * window covers its day. A plan that fits (lib/splits.ts matchPlan) is applied
 * in one step by apply_planned_split(), which refuses a plan already used, so
 * a payment arriving twice cannot use one plan twice. A plan that matches the
 * payee at a different amount leaves the payment in Review, flagged, for a
 * person to apply with the parts changed.
 */
export async function applyPlans(supabase: SupabaseClient, p: Incoming & { id: string; flags: string[] }): Promise<'applied' | 'flagged' | null> {
  const day = p.occurred_on.slice(0, 10)
  const { data } = await supabase.from('planned_splits')
    .select('id, paid_by, payee_hint, expected_amount, tolerance, window_from, window_to, parts, status, created_at')
    .eq('status', 'open').eq('paid_by', p.paid_by).lte('window_from', day).gte('window_to', day)
  const hit = matchPlan(p, (data ?? []) as Plan[])
  if (!hit) return null
  if (hit.kind === 'apply') {
    // Inside the leeway but not exact: the first part takes the difference.
    const parts = hit.diff === 0 ? null : fitParts(hit.plan.parts, hit.diff)
    const { error } = await supabase.rpc('apply_planned_split', { p_plan: hit.plan.id, p_txn: p.id, p_parts: parts })
    if (!error) return 'applied'
  }
  await supabase.from('transactions')
    .update({ status: 'review', flags: [...new Set([...p.flags, 'planned-split'])] }).eq('id', p.id)
  return 'flagged'
}
