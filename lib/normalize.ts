import { lookupAlias } from './merchants.ts'

export type Source = 'card' | 'upi' | 'pos' | 'unknown'
export type Flag = 'emi' | 'reversal' | 'tax' | 'interest' | 'card_payment' | 'atm'

export interface Cleaned {
  raw: string
  source: Source
  cleaned: string        // noise stripped, uppercase
  merchant: string       // canonical name if known, else cleaned
  known: boolean
  category?: string
  sub?: string
  vpa?: string
  note?: string
  flags: Flag[]
}

// Cities get glued onto the end of card descriptors with no separator.
// Longest first so NEW DELHI beats DELHI.
const CITIES = [
  'NEW DELHI', 'GREATER NOIDA', 'NAVI MUMBAI', 'BENGALURU', 'BANGALORE', 'HYDERABAD',
  'AHMEDABAD', 'CHANDIGARH', 'TRIVANDRUM', 'COIMBATORE', 'BHUBANESWAR', 'GURUGRAM',
  'GHAZIABAD', 'MANGALORE', 'VADODARA', 'LUCKNOW', 'KOLKATA', 'GURGAON', 'CHENNAI',
  'JAIPUR', 'MUMBAI', 'INDORE', 'KOCHI', 'NOIDA', 'DELHI', 'PUNE', 'GOA',
  'SINGAPORE', 'DUBAI', 'LONDON',
].sort((a, b) => b.length - a.length)

// Tokens that carry no meaning in a merchant name.
const NOISE = [
  'PVT LTD', 'PRIVATE LIMITED', 'PVT LIMITED', 'PRIVA', 'LIMITED', 'LTD', 'LLP',
  'WWW', 'COM', 'HTTPS', 'HTTP', 'INDIA', 'IND', 'TECHNOLOGIES', 'TECHNOLOGY',
  'SOLUTIONS', 'ENTERPRISES', 'RETAIL', 'ONLINE', 'PAYMENT', 'PAYMENTS',
]

function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Strip a city name glued to the end, with or without a space. */
export function stripCity(s: string): string {
  for (const city of CITIES) {
    const glued = city.replace(/\s/g, '')
    for (const form of [city, glued]) {
      if (s.endsWith(form) && s.length > form.length) return squash(s.slice(0, -form.length))
      if (s.endsWith(' ' + form)) return squash(s.slice(0, -(form.length + 1)))
    }
  }
  return s
}

function stripNoise(s: string): string {
  let out = ' ' + s + ' '
  for (const n of NOISE) {
    out = out.split(' ' + n + ' ').join(' ')
    // also handle the token glued to the end, e.g. "SWIGGY COM"
    if (out.trimEnd().endsWith(' ' + n)) out = out.trimEnd().slice(0, -(n.length + 1)) + ' '
  }
  return squash(out)
}

/** Card and SMS merchant descriptors. The messy case. */
export function cleanCardDescriptor(raw: string): { cleaned: string; flags: Flag[] } {
  const flags: Flag[] = []
  let s = squash(raw.toUpperCase())

  if (/^EMI\b/.test(s)) { flags.push('emi'); s = s.replace(/^EMI\s+/, '') }
  if (/\bREV\b|REVERSAL/.test(s)) flags.push('reversal')
  if (/^(IGST|CGST|SGST|GST)[-\s]/.test(s)) flags.push('tax')
  if (/CC PAYMENT|BPPY|PAYMENT RECEIVED|AUTOPAY/.test(s)) flags.push('card_payment')
  if (/\bATM\b|CASH WDL|NFS\//.test(s)) flags.push('atm')
  if (/INTEREST PAID|CREDIT INTEREST/.test(s)) flags.push('interest')

  s = s.replace(/[*#]/g, ' ')
  s = stripCity(s)
  s = stripNoise(s)
  s = stripCity(s)                 // city can sit behind a noise token
  s = s.replace(/\bX+\d{2,}\b/g, '')   // masked card tails
  s = s.replace(/\b\d{8,}\b/g, '')     // long reference numbers
  // Card alerts glue a transaction id onto the merchant with no separator:
  // SWIGGY64947, ZEPTO6668856, BLUSMAR11817651, WWWZEPTO6813754.
  s = s.replace(/([A-Z]{3,})\d{3,}\b/g, '$1')
  s = squash(s)

  return { cleaned: s, flags }
}

/** BankA style UPI narration: UPI-{payee}-{vpa}-{ifsc}-{ref}-{note} */
export function parseUpiNarration(raw: string) {
  const s = squash(raw.toUpperCase())
  if (!/^UPI[-\/]/.test(s)) return null
  const parts = s.split('-')
  const payee = squash(parts[1] ?? '')
  const vpaMatch = s.match(/[A-Z0-9.@_]+@[A-Z]+/)
  const note = parts.length > 2 ? squash(parts[parts.length - 1]) : undefined
  return {
    payee,
    vpa: vpaMatch ? vpaMatch[0] : undefined,
    note: note && !/^\d+$/.test(note) ? note : undefined,
  }
}

/** BankB / Visa POS narration: POS VS/{ref}/{time}/{merchant}/{merchant2} */
export function parsePosNarration(raw: string) {
  const s = squash(raw.toUpperCase())
  if (!/^POS\s+VS/.test(s)) return null
  const reversal = /^POS\s+VS\s+REV/.test(s)
  const parts = s.split('/').map(p => p.trim())
  const merchant = squash([parts[3], parts[4]].filter(Boolean).join(' '))
  return { merchant, reversal }
}

/** One entry point. Give it any descriptor from any source. */
export function normalize(raw: string): Cleaned {
  const upi = parseUpiNarration(raw)
  if (upi) {
    const { cleaned, flags } = cleanCardDescriptor(upi.payee)
    const hit = lookupAlias(cleaned)
    return {
      raw, source: 'upi', cleaned,
      merchant: hit ? hit.name : cleaned,
      known: !!hit, category: hit?.category, sub: hit?.sub,
      vpa: upi.vpa, note: upi.note, flags,
    }
  }

  const pos = parsePosNarration(raw)
  if (pos) {
    const { cleaned, flags } = cleanCardDescriptor(pos.merchant)
    if (pos.reversal) flags.push('reversal')
    const hit = lookupAlias(cleaned)
    return {
      raw, source: 'pos', cleaned,
      merchant: hit ? hit.name : cleaned,
      known: !!hit, category: hit?.category, sub: hit?.sub, flags,
    }
  }

  const { cleaned, flags } = cleanCardDescriptor(raw)
  const hit = lookupAlias(cleaned)
  return {
    raw, source: 'card', cleaned,
    merchant: hit ? hit.name : cleaned,
    known: !!hit, category: hit?.category, sub: hit?.sub, flags,
  }
}
