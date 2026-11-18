import type { Parsed } from './parse.ts'

// One payment can arrive as three messages. Real example, 2026-07-30:
//   Airtel  "Payment of Rs. 765.82 done via Upi has been processed"
//   Airtel  "Bill of Rs.765.82 is successfully processed"
//   BankA    the actual debit
// And the Pine Labs card sends two of its own for every transaction.

export interface Stored {
  id: string
  amount: number
  date: string
  merchant: string
  enteredBy: string
  createdAt: number      // epoch ms
}

const HOUR = 60 * 60 * 1000

export function findDuplicate(incoming: Omit<Stored, 'id'>, recent: Stored[]): Stored | null {
  for (const r of recent) {
    if (r.amount !== incoming.amount) continue
    if (r.date !== incoming.date) continue
    const sameMerchant = r.merchant === incoming.merchant
    const sameWindow = Math.abs(r.createdAt - incoming.createdAt) < HOUR
    // Same amount and day from the same merchant is a duplicate outright.
    // Same amount and day from a different person needs the hour window too,
    // because two people can genuinely spend the same amount on one day.
    if (sameMerchant) return r
    if (r.enteredBy !== incoming.enteredBy && sameWindow) return r
  }
  return null
}
