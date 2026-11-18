/**
 * Money between Alex and Sam is one household moving money around: it
 * is recorded, but it is neither income nor spending. Matched on her name and
 * the UPI IDs her payments come from, in either direction. Ruled by Alex,
 * 3 Oct 2026, after her two ₹200 test payments.
 */
// "SAM BAG" is how BankC shortens her name on a transfer from her other account.
// Her UPI IDs are her phone number at any app (@ybl, @axl), plus sam29@axl.
const SAM = /SAMSON|\bSAM BAG\b|\bSAM29@AXL\b|\b5000000002(?:-\d+)?@[A-Z]+\b/i

export const betweenUs = (key: string | null | undefined, raw?: string | null) =>
  SAM.test(key ?? '') || SAM.test(raw ?? '')

/**
 * A payment to his own name is his money moving between his own accounts
 * (BankA to ICICI, say): the bank names the payee as him and nothing else.
 * Ruled by Alex, 3 Oct 2026.
 */
// His UPI IDs are his phone number at any app, sometimes with a suffix
// (5000000001-2@ybl). Money from one of them is his own money moving.
const ALEX = /\bALEX\s+MORGAN\b|\b5000000001(?:-\d+)?@[A-Z]+\b/i

export const toSelf = (key: string | null | undefined) => ALEX.test(key ?? '')

export const ALEX_ID = '00000000-0000-4000-8000-dead00000001'

/** Two payee names start with the same word. Guards fuzzy rule matches. */
export const sameFirstWord = (a: string | null | undefined, b: string | null | undefined) => {
  const first = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim().split(/\s+/)[0] ?? ''
  return first(a) !== '' && first(a) === first(b)
}

/**
 * BankA 3333 is the Business account (Alex, 3 Oct 2026): money in or out of it is
 * the business's, never the household's. It is recorded and set aside.
 */
export const BUSINESS_ACCOUNTS = new Set(['3333'])

/**
 * Sam pays for autos on UPI, to the driver's own name, a different driver
 * every ride. No rule or history can know a driver, so the shape decides it: a
 * payee who is a person (letters only, no shop words), never seen before, at a
 * whole-rupee meter amount between Rs 30 and Rs 1,200 that is not a round
 * hundred. A round hundred to a person is more often a tip, a gift or a
 * helper. Ruled by Alex, 10 Oct 2026: her autos file as Auto by themselves.
 * Of her 144 known rides, none was a round hundred and 95 per cent fell
 * between Rs 55 and Rs 731.
 */
export const AUTO_ID = 86

export const looksLikeAutoFare = (amount: number, key: string | null | undefined) =>
  !!key && /^[A-Z][A-Z .]*$/.test(key.trim().toUpperCase())
  && Number.isInteger(amount) && amount >= 30 && amount <= 1200 && amount % 100 !== 0

/**
 * Paying a credit card bill is not spending: every purchase on the card was
 * already counted when it was made, so counting the bill too counts it twice.
 * Recorded as an own-account transfer. Ruled by Alex, 10 Oct 2026, after
 * Rs 1,00,000 to CRED Club showed up as an expense. Covers CRED, card bills paid
 * from net banking or Bharat BillPay (BPPY), and "credit card" in the payee.
 */
const CARD_BILL = /^CRED\b|\bCRED\s*CLUB\b|\bCREDIT\s*CARD\b|\bCC\s*(?:BILL|PAYMENT)\b|\bCARD\s*BILL\b|\bBPPY\b/i

export const cardBill = (key: string | null | undefined, raw?: string | null) =>
  CARD_BILL.test(key ?? '') || CARD_BILL.test(raw ?? '')
