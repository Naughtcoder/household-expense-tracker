import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Failures that would otherwise be silent, found by looking at what arrived.
 *
 * quiet: a phone that usually sends bank texts has sent nothing for QUIET_HOURS.
 *   9 Oct 2026: Sam's readers were unlinked by a reinstall and nothing
 *   noticed for a day. Only raised for someone whose phone sent something in
 *   the past week, so a person who never set a phone up is not nagged.
 * unreadable: a bank text arrived that no rule could read (it waits in
 *   unparsed). 8 Oct 2026: a new Pine Labs format went unnoticed.
 * reader_off: an Android phone's latest report says a payment reader is off
 *   or SMS access was taken away. 13 Oct 2026: Sam's screen reader turned
 *   itself off every day and nobody knew until she opened the app.
 * gap: opened when a quiet alarm clears, so the silence is not forgotten the
 *   moment the phone is back. Says which hours went unrecorded, whether the
 *   bank texts re-read since held anything new, and how many payments have
 *   been added for those days. 17 Oct 2026: Sam's phone was silent from
 *   14 to 17 Oct; re-reading her texts found nothing because SBI sends no
 *   text for UPI payments, and nothing said so. Stays open until someone
 *   taps Done or a week has passed.
 */
export const QUIET_HOURS = 18

export type Finding = { kind: string; person_id: string | null; message: string }

export async function findProblems(supabase: SupabaseClient, now = new Date()): Promise<Finding[]> {
  const out: Finding[] = []
  const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString()
  const [{ data: people }, { data: intake }, { data: unread }, { data: reports }] = await Promise.all([
    supabase.from('people').select('id, name'),
    supabase.from('intake_log').select('person_id, source, at').gte('at', weekAgo).not('source', 'like', 'email:%')
      .not('source', 'eq', 'sms-android-history'),
    supabase.from('unparsed').select('id, raw_text, created_at').eq('resolved', false).order('created_at', { ascending: false }).limit(20),
    supabase.from('reader_status').select('person_id, at, event, screen_reader, notification_reader, sms, detail').gte('at', weekAgo)
      .order('at', { ascending: false }).limit(2000),
  ])
  for (const p of people ?? []) {
    // A phone's hourly report (Android 11 on) shows it is alive even on a day
    // with no payments, so a quiet day is not mistaken for a dead phone.
    const mine = [...(intake ?? []), ...(reports ?? [])].filter(r => r.person_id === p.id)
    if (!mine.length) continue
    const last = mine.reduce((a, r) => (r.at > a ? r.at : a), '')
    const hours = (now.getTime() - new Date(last).getTime()) / 36e5
    if (hours >= QUIET_HOURS) {
      out.push({ kind: 'quiet', person_id: p.id, message: `${p.name}'s phone has sent nothing for ${Math.floor(hours)} hours. Payments may be going unrecorded. On Android check More, then Payment readers; on iPhone check the Shortcuts automation.` })
    }
  }
  for (const p of people ?? []) {
    const f = readerOff(p, (reports ?? []).filter(r => r.person_id === p.id))
    if (f) out.push(f)
  }
  // Screens a payment app showed before paying are expected to be unreadable;
  // only bank texts count here.
  const bank = (unread ?? []).filter(u => !/^\[(screen|notification|history) /.test(String(u.raw_text ?? '')))
  if (bank.length) {
    const first = String(bank[0].raw_text ?? '').replace(/\s+/g, ' ').slice(0, 90)
    out.push({ kind: 'unreadable', person_id: null, message: `${bank.length} bank text${bank.length === 1 ? '' : 's'} could not be read, latest: "${first}". Send it to Claude so the app learns the format.` })
  }
  return out
}

/**
 * Opens alarms for new findings, refreshes the text of open ones, and closes
 * the ones whose cause is gone. Returns the alarms that should be notified
 * now: newly opened, or still open and last notified over a day ago.
 */
export async function syncAlarms(supabase: SupabaseClient, findings: Finding[], now = new Date()) {
  const { data: open } = await supabase.from('alarms').select('id, kind, person_id, raised_at, last_notified_at').is('cleared_at', null)
  const key = (k: string, p: string | null) => `${k}|${p ?? ''}`
  const found = new Map(findings.map(f => [key(f.kind, f.person_id), f]))
  const notify: Finding[] = []
  for (const a of open ?? []) {
    if (a.kind === 'gap') continue  // kept by syncGaps, not by what is wrong right now
    const f = found.get(key(a.kind, a.person_id))
    if (!f) {
      await supabase.from('alarms').update({ cleared_at: now.toISOString() }).eq('id', a.id)
      if (a.kind === 'quiet' && a.person_id) {
        const gap = await openGap(supabase, a.person_id, a.raised_at, now)
        if (gap) notify.push(gap)
      }
      continue
    }
    found.delete(key(a.kind, a.person_id))
    const stale = !a.last_notified_at || now.getTime() - new Date(a.last_notified_at).getTime() > 864e5
    await supabase.from('alarms').update({ message: f.message, ...(stale ? { last_notified_at: now.toISOString() } : {}) }).eq('id', a.id)
    if (stale) notify.push(f)
  }
  for (const f of found.values()) {
    await supabase.from('alarms').insert({ ...f, last_notified_at: now.toISOString() })
    notify.push(f)
  }
  return notify
}

type Report = { at: string; event: string; screen_reader: boolean | null; notification_reader: boolean | null; sms: boolean | null; detail?: string | null }
const IST = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** Raised from the newest report: which readers are off, and since when. */
function readerOff(p: { id: string; name: string }, reports: Report[]): Finding | null {
  const sorted = [...reports].sort((a, b) => (a.at < b.at ? 1 : -1))
  // An app_exit is dated when the app stopped but sent at the next start, so
  // its on/off flags describe a later moment: never use it for state.
  const state = sorted.filter(r => r.event !== 'app_exit')
  const latest = state[0]
  if (!latest) return null
  const checks: [keyof Report, string][] = [['screen_reader', 'payment screen reader'], ['notification_reader', 'notification reader'], ['sms', 'SMS access']]
  const off = checks.filter(([k]) => latest[k] === false)
  if (!off.length) return null
  // Since when: the oldest report in the unbroken run of "off" for the first one.
  const [key] = off[0]
  let since = latest.at
  for (const r of state) { if (r[key] === false) since = r.at; else break }
  const names = off.map(([, n]) => n)
  const what = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
  const reason = key === 'screen_reader' ? offReason(sorted, since) : null
  return { kind: 'reader_off', person_id: p.id, message: `${p.name}'s ${what} ${off.length === 1 ? 'is' : 'are'} off since ${IST(since)}.${reason ? ` Phone's reason: ${reason}.` : ''} Payments may be going unrecorded. On that phone: open the app, More, then Payment readers, and switch it back on.` }
}

/** The "why: ..." sentence the phone sent (phone build 13 on) when the screen reader went off. */
export function why(detail: string | null | undefined): string | null {
  const m = /^why: ([^;]+)/.exec(detail ?? '')
  return m ? m[1].trim() : null
}

/**
 * The reason for the switch-off that started at `since`: the screen_off
 * report's own reason, plus Android's record of an app stop within ten
 * minutes before it, which arrives later (on the next start).
 */
function offReason(sorted: Report[], since: string): string | null {
  const t = new Date(since).getTime()
  const near = (r: Report, before: number, after: number) => {
    const d = new Date(r.at).getTime() - t
    return d >= -before && d <= after
  }
  const parts: string[] = []
  const offAt = sorted.find(r => r.event === 'screen_off' && near(r, 60e3, 60e3) && why(r.detail))
  if (offAt) parts.push(why(offAt.detail)!)
  const exit = sorted.find(r => r.event === 'app_exit' && near(r, 10 * 60e3, 60e3) && why(r.detail))
  if (exit) parts.push(`the app last stopped because ${why(exit.detail)}`)
  return parts.length ? parts.join('; ') : null
}

// ---------- gaps ----------

export const GAP_DAYS = 7
const ISTW = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const istDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const rupees = (n: number) => 'Rs ' + Math.round(n).toLocaleString('en-IN')

/** Anything a phone sends: a payment, a re-read of old texts, an hourly report. */
async function contacts(supabase: SupabaseClient, personId: string, from: string, to: string) {
  const [{ data: a }, { data: b }] = await Promise.all([
    supabase.from('intake_log').select('at').eq('person_id', personId).not('source', 'like', 'email:%').gte('at', from).lte('at', to),
    supabase.from('reader_status').select('at').eq('person_id', personId).gte('at', from).lte('at', to),
  ])
  return [...(a ?? []), ...(b ?? [])].map(r => String(r.at)).sort()
}

/**
 * The unrecorded stretch around a quiet alarm: from the phone's last contact
 * before the alarm went up to its first contact after. Contacts are sorted.
 */
export function gapAround(before: string[], after: string[]): { from: string; to: string } | null {
  const from = before[before.length - 1], to = after[0]
  return from && to ? { from, to } : null
}

export type GapStats = { reread: number; newFromTexts: number; added: number; addedSum: number }

export function gapMessage(name: string, from: string, to: string, s: GapStats): string {
  const parts = [`${name}'s phone recorded nothing from ${ISTW(from)} to ${ISTW(to)}.`]
  if (!s.reread) parts.push(`Its bank texts have not been re-read yet: on that phone, More, Payment readers, Read past bank texts.`)
  else if (!s.newFromTexts) parts.push(`Re-reading the bank texts on it found nothing new, so payments from those days that the bank sent no text for (SBI sends none for UPI) are only in PhonePe or Google Pay.`)
  else parts.push(`Re-reading the bank texts on it found ${s.newFromTexts} payment${s.newFromTexts === 1 ? '' : 's'}.`)
  parts.push(s.added ? `${s.added} payment${s.added === 1 ? '' : 's'} (${rupees(s.addedSum)}) from those days added since.` : `None of those days' payments have been added yet.`)
  parts.push(`To add the rest: in PhonePe open History, screenshot it, and share the screenshot to Household Expense Tracker. Tap Done when nothing else is missing.`)
  return parts.join(' ')
}

async function gapStats(supabase: SupabaseClient, personId: string, from: string, to: string): Promise<GapStats> {
  const [{ data: reads }, { data: added }] = await Promise.all([
    supabase.from('intake_log').select('saved').eq('person_id', personId).eq('source', 'sms-android-history').gte('at', to),
    supabase.from('transactions').select('amount, direction').eq('paid_by', personId)
      .gte('occurred_on', istDay(from)).lte('occurred_on', istDay(to)).gt('created_at', to).not('status', 'in', '(duplicate,ignored)'),
  ])
  const debits = (added ?? []).filter(t => t.direction === 'debit')
  return {
    reread: (reads ?? []).length,
    newFromTexts: (reads ?? []).reduce((n, r) => n + Number(r.saved ?? 0), 0),
    added: debits.length,
    addedSum: debits.reduce((n, t) => n + Number(t.amount), 0),
  }
}

async function openGap(supabase: SupabaseClient, personId: string, raisedAt: string, now: Date): Promise<Finding | null> {
  const weekBefore = new Date(new Date(raisedAt).getTime() - 7 * 864e5).toISOString()
  const g = gapAround(await contacts(supabase, personId, weekBefore, raisedAt), await contacts(supabase, personId, raisedAt, now.toISOString()))
  if (!g) return null
  const { data: p } = await supabase.from('people').select('name').eq('id', personId).maybeSingle()
  const message = gapMessage(p?.name ?? 'This', g.from, g.to, await gapStats(supabase, personId, g.from, g.to))
  await supabase.from('alarms').insert({ kind: 'gap', person_id: personId, message, gap_from: g.from, gap_to: g.to, last_notified_at: now.toISOString() })
  return { kind: 'gap', person_id: personId, message }
}

/** Keeps each open gap's counts current, and closes it a week after the phone came back. */
export async function syncGaps(supabase: SupabaseClient, now = new Date()) {
  const { data: open } = await supabase.from('alarms').select('id, person_id, gap_from, gap_to').eq('kind', 'gap').is('cleared_at', null)
  for (const a of open ?? []) {
    if (!a.gap_from || !a.gap_to || !a.person_id) continue
    if (now.getTime() - new Date(a.gap_to).getTime() > GAP_DAYS * 864e5) {
      await supabase.from('alarms').update({ cleared_at: now.toISOString() }).eq('id', a.id)
      continue
    }
    const { data: p } = await supabase.from('people').select('name').eq('id', a.person_id).maybeSingle()
    await supabase.from('alarms').update({ message: gapMessage(p?.name ?? 'This', a.gap_from, a.gap_to, await gapStats(supabase, a.person_id, a.gap_from, a.gap_to)) }).eq('id', a.id)
  }
}
