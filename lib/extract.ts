import { PATTERNS } from './patterns.ts'
import { parseSms, SCREEN_HEAD, type Parsed } from './parse.ts'

// One screenshot holds two or three messages. Rather than guess where each one
// starts, run every pattern across the whole blob and keep the matches that do
// not overlap. Reject rules win ties, so an OTP sitting next to a real spend
// cannot be absorbed into it.

interface Hit { start: number; end: number; text: string; isReject: boolean }

export function splitMessages(blob: string): string[] {
  const text = blob.replace(/\r/g, '')
  const hits: Hit[] = []

  for (const p of PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g')
    for (const m of text.matchAll(re)) {
      if (m.index === undefined) continue
      hits.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        isReject: p.kind !== 'txn',
      })
    }
  }

  // Earliest first. On an equal start, a reject rule beats a transaction rule,
  // then the longer match wins.
  hits.sort((a, b) =>
    a.start - b.start ||
    Number(b.isReject) - Number(a.isReject) ||
    (b.end - b.start) - (a.end - a.start))

  const kept: Hit[] = []
  for (const h of hits) {
    if (kept.some(k => h.start < k.end && k.start < h.end)) continue
    kept.push(h)
  }
  return kept.map(h => h.text)
}

export interface Extraction {
  transactions: Parsed[]
  refused: Parsed[]
  unrecognised: string[]
}

export function extractAll(blob: string, today = new Date()): Extraction {
  const out: Extraction = { transactions: [], refused: [], unrecognised: [] }

  // A payment app's screen is one payment, never several messages, and most
  // layouts match no exact pattern. Splitting it found nothing, so the general
  // screen reader in parseSms was never reached and every such screen landed
  // in unparsed (Sam's autos, 5 and 6 Oct 2026).
  if (SCREEN_HEAD.test(blob)) {
    const p = parseSms(blob.replace(/\s+/g, ' ').trim(), today)
    if (p.ok) out.transactions.push(p)
    else out.unrecognised.push(blob.replace(/\s+/g, ' ').trim().slice(0, 1000))
    return out
  }

  const parts = splitMessages(blob)

  if (parts.length === 0) {
    // Keep it whatever it is. Requiring an amount here meant any message whose
    // wording we did not recognise disappeared without trace, which is the one
    // thing this was supposed to never do.
    const text = blob.replace(/\s+/g, ' ').trim()
    if (text) out.unrecognised.push(text.slice(0, 1000))
    return out
  }

  for (const part of parts) {
    const p = parseSms(part, today)
    if (p.ok) out.transactions.push(p)
    else out.refused.push(p)
  }
  return out
}

/** One line for the phone notification. */
export function summarise(e: Extraction): string {
  const bits: string[] = []
  for (const t of e.transactions) {
    const m = t.clean?.known ? t.clean.merchant : (t.clean?.cleaned ?? 'unknown')
    bits.push(`${m} ₹${t.amount?.toLocaleString('en-IN')}${t.clean?.known ? '' : ' (review)'}`)
  }
  if (e.refused.length) bits.push(`${e.refused.length} ignored`)
  if (e.unrecognised.length) bits.push(`${e.unrecognised.length} unreadable`)
  return bits.length ? bits.join(', ') : 'nothing found'
}
