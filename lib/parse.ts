import { PATTERNS, AMOUNT_ONLY, BALANCE_RE, senderIsPromotional, type Direction, type Kind } from './patterns.ts'
import { normalize, type Cleaned } from './normalize.ts'

export interface Parsed {
  ok: boolean            // true only for a real transaction worth storing
  kind?: Kind            // txn, notice (future debit) or echo (merchant copy)
  patternId?: string
  bank?: string
  amount?: number
  currency?: string      // INR unless the card reported a foreign spend
  balance?: number       // running balance, when the bank includes it
  direction?: Direction
  date?: string          // ISO, yyyy-mm-dd
  acct?: string          // last 4 only, never the full number
  merchantRaw?: string
  clean?: Cleaned
  raw: string
  reason?: string        // why it failed, shown in the review queue
  refundOf?: { amount: number; date?: string }  // the purchase a refund reverses
}

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

/** Banks send at least six date shapes. Normalise to yyyy-mm-dd. */
export function toIsoDate(s: string, today = new Date()): string | undefined {
  if (!s) return undefined
  // "29 Sep, 2026" from BankA card emails: the comma carries nothing.
  const t = s.trim().toUpperCase().replace(/,/g, '')

  // "2026-09-14:15:03:08" arrives as one token from BankA card alerts
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?::\d{2}:\d{2}:\d{2})?$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`

  // 12Aug26 or 12AUG2026
  m = t.match(/^(\d{1,2})([A-Z]{3})(\d{2,4})$/)
  if (m) return build(m[1], MONTHS[m[2]], m[3], today)

  // "20SEP", a day and month run together with no year. BankC's UPI texts.
  m = t.match(/^(\d{1,2})([A-Z]{3})$/)
  if (m && MONTHS[m[2]]) {
    const d = Number(m[1]), mo = Number(MONTHS[m[2]])
    let y = today.getFullYear()
    if (new Date(y, mo - 1, d).getTime() > today.getTime() + 86400000) y -= 1
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  // "18-11", a day and month with no year. BankA uses this on UPI alerts.
  m = t.match(/^(\d{1,2})-(\d{1,2})$/)
  if (m) {
    const d = Number(m[1]), mo = Number(m[2])
    let y = today.getFullYear()
    // A date more than a day ahead of today belongs to last year.
    if (new Date(y, mo - 1, d).getTime() > today.getTime() + 86400000) y -= 1
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  // "04 October 2026", the month written out, from PhonePe's success screen.
  m = t.match(/^(\d{1,2}) (JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]* (\d{4})$/)
  if (m) return build(m[1], MONTHS[m[2]], m[3], today)

  // 12-Aug-26, 12/Aug/2026, 26-07-26, 26/07/2026, and "30 Sep 2026" from ExpenseCard
  m = t.match(/^(\d{1,2})[-\/ ]([A-Z0-9]{2,3})[-\/ ](\d{2,4})$/)
  if (m) {
    const mon = /^\d+$/.test(m[2]) ? m[2].padStart(2, '0') : MONTHS[m[2]]
    return build(m[1], mon, m[3], today)
  }
  return undefined
}

function build(d: string, mon: string | undefined, y: string, today: Date) {
  if (!mon) return undefined
  const yy = y.length === 2 ? String(centuryFor(Number(y), today)) : y
  return `${yy}-${mon}-${d.padStart(2, '0')}`
}

/** A two digit year is this century unless that puts the date far ahead. */
function centuryFor(yy: number, today: Date): number {
  const guess = Math.floor(today.getFullYear() / 100) * 100 + yy
  return guess > today.getFullYear() + 1 ? guess - 100 : guess
}

/** Rs, Rs., and INR all mean the same thing. Anything else is a real currency. */
export function normaliseCurrency(raw?: string): string {
  if (!raw) return 'INR'
  const c = raw.replace(/\./g, '').toUpperCase()
  return c === 'RS' ? 'INR' : c
}

export function parseAmount(s: string): number | undefined {
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : undefined
}

export function parseSms(text: string, today = new Date()): Parsed {
  const raw = text.replace(/\s+/g, ' ').trim()

  for (const p of PATTERNS) {
    const m = raw.match(p.re)
    if (!m) continue

    // A future-debit warning, an OTP, or a merchant's own copy. These carry no
    // named groups, so they must be handled before any group is read.
    if (p.kind !== 'txn') {
      return { ok: false, kind: p.kind, patternId: p.id, bank: p.bank,
        amount: m.groups?.amount ? parseAmount(m.groups.amount) : undefined,
        date: m.groups?.date ? toIsoDate(m.groups.date, today) : undefined,
        raw,
        reason: p.kind === 'notice' ? `not a transaction (${p.id})`
                                    : `merchant or promotional copy (${p.id})` }
    }

    if (!m.groups) continue
    const amount = parseAmount(m.groups.amount)
    const date = toIsoDate(m.groups.date, today)
    if (amount === undefined) continue

    const merchantRaw = (m.groups.merchant ?? '').replace(/[.,;]+$/, '').trim()
    const bal = raw.match(BALANCE_RE)
    return {
      ok: true,
      kind: 'txn',
      patternId: p.id,
      bank: p.bank,
      amount,
      currency: normaliseCurrency(m.groups.currency),
      balance: bal?.groups?.balance ? parseAmount(bal.groups.balance) : undefined,
      direction: p.dir ?? 'debit',
      date,
      acct: m.groups.acct?.replace(/[Xx*]/g, '').slice(-4) ?? p.acct,
      merchantRaw,
      clean: normalize(merchantRaw),
      raw,
      refundOf: m.groups.orig
        ? { amount: parseAmount(m.groups.orig)!, date: toIsoDate(m.groups.origdate ?? '', today) }
        // A reversal names no original, so the app looks for the latest
        // purchase of the same amount at the same merchant.
        : /reversal/.test(p.id) ? { amount } : undefined,
    }
  }

  // A payment app's success screen, read on Sam's phone, from an app with
  // no exact rule yet (Google Pay, Paytm, BHIM, YONO, or a new PhonePe
  // layout). The phone only sends a screen that names an amount and says the
  // payment went through, so reading it loosely is safe.
  const screen = parseAppScreen(raw, today)
  if (screen) return screen

  // Promotional sender, so no debit is being reported.
  if (senderIsPromotional(raw)) {
    return { ok: false, kind: 'echo', raw, reason: 'promotional sender' }
  }

  // Nothing matched. Keep it anyway so the row is never lost.
  const amt = raw.match(AMOUNT_ONLY)
  return {
    ok: false,
    amount: amt?.groups ? parseAmount(amt.groups.amount) : undefined,
    raw,
    reason: amt ? 'amount found, no pattern matched' : 'no pattern matched',
  }
}

// "history" is one row of a payment app's history list, read off a screenshot
// the phone was given (lib/history-shot.ts).
export const SCREEN_HEAD = /^\[(screen|notification|history) ([^\]]+)\]\s*/i
const SCREEN_AMOUNT = /^(?:₹|rs\.?|inr)\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)$/i
// Pieces of a success screen that are never the payee.
const NOT_PAYEE = /^(payment|transaction|transfer)?\s*(successful|success|completed|complete|done)\b|^paid( successfully)?$|^sent$|^done$|^share|^view|^split|^check balance|^upi (ref|transaction|id)|^ref(erence)?\b|^from\b|^debited from|^to:?$|^paid to:?$|^sent to:?$|^banking name|^powered by|^\+?\d[\d •*x-]{6,}$|@|^\d{1,2}[ :\/-]|^[a-z]$|^(mon|tue|wed|thu|fri|sat|sun)|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d|^\d+ (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|google pay|phonepe|paytm|bhim|yono|^₹|^rs\b/i

/** A loose read of a payment app's success screen: the first ₹ amount, the
 *  payee from "Paid to X" / "Sent to X" or the nearest name beside the
 *  amount, and the time the screen was read. */
export function parseAppScreen(raw: string, today = new Date()): Parsed | null {
  const head = raw.match(SCREEN_HEAD)
  if (!head) return null
  const app = head[2].trim()
  const parts = raw.slice(head[0].length).split('|').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean)

  // The amount: a piece that is only an amount, else the first ₹ anywhere.
  let ai = parts.findIndex(x => SCREEN_AMOUNT.test(x))
  let amount: number | undefined
  if (ai >= 0) amount = parseAmount(parts[ai].match(SCREEN_AMOUNT)![1])
  else {
    const m = raw.match(/(?:₹|rs\.?|inr)\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i)
    if (m) amount = parseAmount(m[1])
  }
  if (!amount) return null

  // The payee: "Paid to Asha" or "Paid to" then "Asha", else the name nearest the amount.
  let payee: string | undefined
  for (let i = 0; i < parts.length && !payee; i++) {
    const m = parts[i].match(/(?:^|\s)(?:paid|sent|payment|money sent|transferred) to:?\s*(.*)$/i)
    if (m) payee = m[1] || parts.slice(i + 1).find(x => !NOT_PAYEE.test(x))
  }
  // PhonePe's scan-and-pay keeps the bank picker ("Total Payable", her own
  // account names) and the pay screen in the same window as the success
  // view. There the payee is the name after "Payment Successful" that sits
  // just above a UPI id or a masked phone number.
  const si = parts.findIndex(x => /^(payment|transaction|transfer) (successful|success|completed)$/i.test(x))
  for (let i = si + 1; si >= 0 && i < parts.length - 1 && !payee; i++) {
    if (/@|^\+91|^[•*x]{3,}/i.test(parts[i + 1]) && !NOT_PAYEE.test(parts[i]) && /[a-z]/i.test(parts[i])) payee = parts[i]
  }
  if (!payee && ai >= 0) {
    const near = [...parts.slice(0, ai).reverse(), ...parts.slice(ai + 1)]
    payee = near.find(x => !NOT_PAYEE.test(x) && /[a-z]/i.test(x) && x.length <= 60)
  }
  if (!payee) payee = parts.find(x => !NOT_PAYEE.test(x) && /[a-z]/i.test(x) && x.length <= 60)

  // The screen was read the moment it showed, so that is the date (India time),
  // unless the screen prints its own: opening an old payment's details in
  // PhonePe ("07:08 PM on 10 Oct 2026") is read a day or more later.
  const readOn = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const shown = raw.match(/\b(\d{1,2}) (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,? (20\d\d)\b/i)
  const shownOn = shown
    ? `${shown[3]}-${String('janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(shown[2].toLowerCase()) / 3 + 1).padStart(2, '0')}-${shown[1].padStart(2, '0')}`
    : null
  const date = shownOn && shownOn <= readOn ? shownOn : readOn
  const merchantRaw = (payee ?? app).trim()
  return {
    ok: true, kind: 'txn', patternId: head[1].toLowerCase() === 'history' ? 'app-history' : 'app-screen-generic', bank: app, amount, currency: 'INR',
    direction: 'debit', date, merchantRaw, clean: normalize(merchantRaw), raw,
  }
}
