// Who a payment is for decides whether it counts as spending.
//
// Claimable money comes back from Employer. A transfer moves his own money
// between his own accounts (BankA to BankB 1111, for one), or between him and
// Sam, who are one household. Invested money is still his, it has
// only moved from the bank into a fund. Neither is spending, so every total in
// the app asks this one function rather than repeating the rule.

export type Scope = 'household' | 'claimable' | 'investment' | 'transfer'

export const SCOPES: { value: Scope; label: string }[] = [
  { value: 'household', label: 'Household' },
  { value: 'claimable', label: 'Claim from Employer' },
  { value: 'investment', label: 'Investment' },
  { value: 'transfer', label: 'Transfer, not spending' },
]

export const isScope = (s: unknown): s is Scope =>
  s === 'household' || s === 'claimable' || s === 'investment' || s === 'transfer'

/** A rental or other deposit comes back when you leave, so it is not spending
 *  either. Category id of "Deposit" (under Rent). Ruled by Alex, 2 Oct 2026. */
export const DEPOSIT_CATEGORY = 18

/** True for money out that the household has actually spent. */
export const countsAsSpend = (r: { direction: string; scope: string; category_id?: number | null }) =>
  r.direction === 'debit' && r.scope !== 'claimable' && r.scope !== 'investment' && r.scope !== 'transfer'
    && r.category_id !== DEPOSIT_CATEGORY

/** Money out into investments, net of anything that came back. */
export const invested = (rows: { direction: string; scope: string; amount: number | string }[]) =>
  rows.filter(r => r.scope === 'investment')
    .reduce((s, r) => s + (r.direction === 'debit' ? 1 : -1) * Number(r.amount), 0)

/**
 * True for money in that is really income. Not transfers or investments
 * coming back, and not a deposit being returned: the deposit was never
 * counted as spending, so its refund must not count as income either, or a
 * house move reads as savings. Found 3 Oct 2026, when the deposit refunds
 * added about 2 lakh to the year.
 */
//
// Nor is Employer paying back claims: that money was his to begin with, spent
// on the employer's behalf. It is filed as claimable, the same as the spending it
// repays, so both sides leave the household figures together.
export const countsAsIncome = (r: { direction: string; scope: string; category_id?: number | null }) =>
  r.direction === 'credit' && r.scope !== 'transfer' && r.scope !== 'investment' && r.scope !== 'claimable'
    && r.category_id !== DEPOSIT_CATEGORY
