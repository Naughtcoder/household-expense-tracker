/**
 * Rules that depend on which card paid, not only on who was paid.
 *
 * Swiggy and Zepto on the ExpenseCard card (the employer's expense card, ending 5555) are
 * office snacks, claimable from Employer. The same apps on his own cards are
 * personal and still ask. Ruled by Alex, 3 Oct 2026.
 */
export const OFFICE_SNACKS = 73
export const EXPENSECARD_CARD = '5555'

export function cardRule(acct: string | null | undefined, key: string | null | undefined) {
  if (acct === EXPENSECARD_CARD && key && /SWIGGY|ZEPTO/i.test(key)) {
    return { category_id: OFFICE_SNACKS, scope: 'claimable' as const }
  }
  return null
}
