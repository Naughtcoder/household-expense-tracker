/**
 * Money in that is the same thing every time, so it can file itself.
 * Category ids are from db/023-income.sql. Anything else coming in waits in
 * Review with the question "what is this money?".
 */
export const INCOME = 67
export const SALARY = 68, INTEREST = 69, PAID_BACK = 70, REFUNDS = 71, OTHER_INCOME = 72
export const INCOME_IDS = new Set([INCOME, SALARY, INTEREST, PAID_BACK, REFUNDS, OTHER_INCOME])

export type Known = { merchant: string; category_id: number | null; scope: 'household' | 'transfer' | 'claimable'; ignore?: boolean }

const KNOWN: [RegExp, Known][] = [
  // the employer's India payroll is paid through RazorpayX's escrow account.
  [/EMPLOYER PAYROLL/i, { merchant: 'Salary (Employer)', category_id: SALARY, scope: 'household' }],
  // Sam's employer pays her claims back separately from salary; like his
  // Employer claims, that money is neither income nor spending.
  [/ACME.*\bREIMB|\bTWRDS\s+REIMB/i, { merchant: 'Acme claims repaid', category_id: REFUNDS, scope: 'claimable' }],
  [/ACME TEC/i, { merchant: 'Salary (Acme)', category_id: SALARY, scope: 'household' }],
  [/\bSALARY\b/i, { merchant: 'Salary', category_id: SALARY, scope: 'household' }],
  // Earlier employers' payroll. Ruled salary by Alex, 3 Oct 2026.
  [/OLD EMPLOYER PAYROLL/i, { merchant: 'Salary', category_id: SALARY, scope: 'household' }],
  // Recruitment fees that pass through his account and are not his to keep.
  // Kept as a record, never counted. Ruled by Alex, 3 Oct 2026.
  [/FREELANCE CLIENT A|FREELANCE CLIENT B/i, { merchant: 'Recruitment income (not kept)', category_id: null, scope: 'household', ignore: true }],
  [/^INTEREST$|CREDIT INTEREST|INTEREST PAID|\bINT\.? ?PD\b|SAVINGS INTEREST/i, { merchant: 'Bank interest', category_id: INTEREST, scope: 'household' }],
  [/ICICI LOMBARD/i, { merchant: 'ICICI Lombard', category_id: REFUNDS, scope: 'household' }],
  // His own money arriving from his own account at another bank.
  [/^ALEX MORGAN$|CR-[A-Z0-9]+-ALEX MORGAN(?! FOR)|CR-[A-Z0-9]+-ALEX MORGAN FOR ALEX/i, { merchant: 'Own account', category_id: null, scope: 'transfer' }],
  // BankB is funded from BankA; the BankA side is already filed as a transfer.
  [/^INWARD FUND TRANSFER$/i, { merchant: 'Own account (into BankB)', category_id: null, scope: 'transfer' }],
  // A failed or reversed payment coming back.
  [/^REV:UPI|^UPIRET\b/i, { merchant: 'Reversed payment', category_id: REFUNDS, scope: 'household' }],
  // Money between the two of them moves within the household; it is not income.
  [/SAM SAMSON/i, { merchant: 'Sam', category_id: null, scope: 'transfer' }],
]

export function knownIncome(key: string | null, text?: string | null): Known | null {
  // A reimbursement says so in the bank's words, not the payee's name, so the
  // words are checked for it first. Acme's claims payout was filed as salary
  // because the payee name alone matched the salary rule.
  if (text && /\bTWRDS\s+REIMB|\bREIMB(?:URSEMENT)?\b/i.test(text) && /ACME/i.test(`${key} ${text}`)) {
    return { merchant: 'Acme claims repaid', category_id: REFUNDS, scope: 'claimable' }
  }
  // The payee first, where the anchored patterns apply, then the bank's words.
  for (const hay of [(key ?? '').trim(), text ?? '']) for (const [re, k] of KNOWN) if (hay && re.test(hay)) return k
  return null
}
