/**
 * Why a payment is waiting in Review, in one line each, and which field
 * answers it. Review used to show a payment with no reason at all, so it was
 * not clear what was being asked. Every card now says what is unclear.
 */
export type Field = 'payee' | 'category' | 'scope'
export type Reason = { field: Field; text: string; short: string }

type Cat = { id: number; name: string; parent_id: number | null }

/** A payee the bank gave only as a handle, a bare account, or not at all. */
export const payeeUnclear = (merchant: string | null, key: string | null) =>
  !merchant && (!key || /^@|^(ACCOUNT|A\/C|UPI|NEFT|IMPS|VPA)\b|^[^A-Za-z]*$/i.test(key.trim()) || key.trim().length < 3)

export function reasonsFor(r: { merchant: string | null; merchant_key: string | null; category_id: number | null; amount: number; scope: string; direction?: string; flags?: string[] | null },
  cats: Cat[]): Reason[] {
  const out: Reason[] = []
  // A split planned for this payee, at a different amount (lib/ingest.ts applyPlans).
  if (r.flags?.includes('planned-split')) {
    out.push({ field: 'category', text: 'Matches your planned split, but the amount differs. Open the payment to apply the plan with the parts changed.', short: 'Planned split · amount differs' })
  }
  if (payeeUnclear(r.merchant, r.merchant_key)) {
    out.push({ field: 'payee', text: r.merchant_key ? `Who was paid? The bank only said "${r.merchant_key}".` : 'Who was paid? The bank did not say.', short: 'Who was paid?' })
  }
  // Money in asks a different question: not what it was spent on, but what it is.
  if (r.direction === 'credit') {
    if (r.scope !== 'transfer' && !r.category_id) out.push({ field: 'category', text: 'Money in. If someone paid you back, pick what it was for (for example Eating Out) and it comes off that cost. Otherwise pick under Income.', short: 'Money in · what is it?' })
    return out
  }
  const c = r.category_id ? cats.find(x => x.id === r.category_id) : null
  const hasChildren = c ? cats.some(x => x.parent_id === c.id) : false
  if (r.scope === 'investment' || r.scope === 'transfer') {
    // No category needed; nothing to ask about it.
  } else if (!c) out.push({ field: 'category', text: 'No category yet.', short: 'No category' })
  else if (hasChildren) out.push({ field: 'category', text: `Only the group is known (${c.name}). Pick the exact category.`, short: `${c.name} · pick exact` })
  else out.push({ field: 'category', text: `Category was guessed as ${c.name}. Confirm it or change it.`, short: `${c.name}?` })
  if (Number(r.amount) >= 25000 && r.scope === 'household') {
    out.push({ field: 'scope', text: 'Large payment. Is it household, or to claim from Employer?', short: 'Large · household or Employer?' })
  }
  return out
}
