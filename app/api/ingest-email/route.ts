import { supabaseAdmin } from '../../../lib/supabase/server'
import { ingestText } from '../../../lib/ingest'
import { extractAll } from '../../../lib/extract'
import { personForKey, personForGoogleToken, logIntake } from '../../../lib/intake'

export const runtime = 'nodejs'

/**
 * The door the Gmail script uses. One copy of the script runs inside each
 * inbox on Google's servers and posts every bank email here.
 *
 * The script only marks an email done when this returns 200, so anything that
 * fails here is sent again on its next run. That makes two rules matter:
 * answer 200 for anything that has been dealt with, including an email that
 * turned out to carry no transaction, or the script retries it forever; and
 * answer 500 for a real failure, or the email is lost. The Gmail message id is
 * the source key, so a retry of something already saved is a duplicate, not a
 * second row.
 */
export async function POST(req: Request) {
  const supabase = supabaseAdmin()
  const body = await req.json().catch(() => null)

  // Two ways in. The Gmail script sends its own Google token, which names the
  // inbox, so the inbox is taken from Google rather than from the request.
  // A household key still works for testing by hand.
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const google = bearer ? await personForGoogleToken(supabase, bearer) : null
  const keyed = google ? null : await personForKey(supabase, req.headers.get('x-api-key') ?? '')
  const person = google ?? keyed
  if (!person) return Response.json({ message: 'unauthorized' }, { status: 401 })

  // Some emails (BankA NetBanking) state no date, so the day it was sent rides
  // along at the end, in India time, for a pattern to fall back on.
  const sent = body?.date ? new Date(body.date) : null
  const sentTag = sent && !isNaN(sent.getTime())
    ? ' [sent ' + new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' })
        .format(sent).replaceAll('/', '-') + ']'
    : ''
  // Old mail, read for matching against Money Manager and never booked. A batch
  // of up to fifty emails per request, so a year of history is a few hundred
  // calls rather than thousands.
  if (Array.isArray(body?.history)) {
    const inboxName = google?.inbox ?? body?.inbox ?? 'unknown'
    const rows: Record<string, unknown>[] = []
    for (const e of body.history.slice(0, 50)) {
      if (!e?.id || !e?.text) continue
      if (/statement|mailers?\b|offers?@|newsletter|promo|marketing/i.test(e.from ?? '')) continue
      const d = e.date ? new Date(e.date) : null
      const tag = d && !isNaN(d.getTime())
        ? ' [sent ' + new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' })
            .format(d).replaceAll('/', '-') + ']'
        : ''
      const found = extractAll(String(e.text).slice(0, 20000) + tag)
      const txns = found.transactions.filter(t => t.amount && t.date)
      txns.forEach((t, i) => rows.push({
        source_key: `gmail:${inboxName}:${e.id}#${i}`, inbox: inboxName, occurred_on: t.date,
        amount: t.refundOf ? -t.amount! : t.amount, direction: t.refundOf ? 'debit' : (t.direction ?? 'debit'),
        account_tail: t.acct ?? null, bank: t.bank ?? null, pattern_id: t.patternId ?? null,
        merchant_raw: t.merchantRaw ?? null, merchant_key: t.clean?.cleaned ?? null, raw_text: t.raw.slice(0, 500),
      }))
      // Kept unread, so the readers can be judged on what they missed.
      if (txns.length === 0 && found.refused.length === 0 && /(?:Rs\.?|INR|₹)\s?[\d,]+/i.test(e.text)) {
        rows.push({ source_key: `gmail:${inboxName}:${e.id}#x`, inbox: inboxName, raw_text: String(e.text).slice(0, 1500) })
      }
    }
    const { error } = rows.length
      ? await supabase.from('email_history').upsert(rows, { onConflict: 'source_key', ignoreDuplicates: true })
      : { error: null }
    return error ? Response.json({ message: error.message }, { status: 500 }) : Response.json({ ok: true, rows: rows.length })
  }

  // A survey of what the inbox holds, sent once when asked for, not a payment.
  if (body?.survey) {
    const inboxName = google?.inbox ?? body?.inbox ?? 'unknown'
    const { error } = await supabase.from('email_survey')
      .upsert({ inbox: inboxName, at: new Date().toISOString(), data: body.survey })
    return error ? Response.json({ message: error.message }, { status: 500 }) : Response.json({ ok: true })
  }

  const text: string = (body?.text ?? '').slice(0, 20000) + sentTag
  const inbox: string = google?.inbox ?? body?.inbox ?? 'unknown'
  const id: string = body?.id ?? ''
  const sender: string = body?.from ?? ''
  if (!text.trim() || !id) return Response.json({ message: 'nothing to read' }, { status: 400 })

  const source = `email:${inbox}`
  // Statements and marketing come from the same bank domains. A statement
  // repeats payments already recorded one by one, so reading it would count
  // each twice; an offer is not a payment at all.
  if (/statement|mailers?\b|offers?@|newsletter|promo|marketing/i.test(sender)) {
    await logIntake(supabase, { person_id: person.id, source, sender, text, refused: 1 })
    return Response.json({ saved: 0, duplicates: 0, refused: 1, unreadable: 0, message: 'not a transaction sender' })
  }
  // Bank senders also send offers and newsletters. No amount, no transaction,
  // and nothing worth keeping, so say so and let the script move on.
  // Bank marketing quotes amounts too ("INR 10 Lakhs", "cheques above ₹50,000").
  // A payment email says money moved; one that never does is not kept.
  if (!/(?:Rs\.?|INR|₹)\s?[\d,]+/i.test(text) || !/\b(?:debited|credited|spent|redeemed|refund|reversal|paid to|payment (?:was|has been) made|transaction (?:of|successful))\b/i.test(text)) {
    await logIntake(supabase, { person_id: person.id, source, sender, text, refused: 1 })
    return Response.json({ saved: 0, duplicates: 0, refused: 1, unreadable: 0, message: 'no amount' })
  }

  try {
    // Not unattended: the script only reads bank senders, so an email we cannot
    // read is a pattern to write, and it is kept for that.
    const result = await ingestText(supabase, text, person.id, false, `gmail:${inbox}:${id}`, false, sent)
    await logIntake(supabase, { person_id: person.id, source, sender, text, ...result })
    return Response.json(result)
  } catch (e) {
    await logIntake(supabase, { person_id: person.id, source, sender, text, error: (e as Error).message })
    return Response.json({ message: (e as Error).message }, { status: 500 })
  }
}
